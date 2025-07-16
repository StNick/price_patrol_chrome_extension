// Content script for Price Patrol extension

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleContentMessage(message).then(sendResponse);
  return true; // Keep message channel open
});

async function handleContentMessage(message: any): Promise<any> {
  switch (message.action) {
    case 'EXTRACT_DATA':
      return await extractData(message.recipe);
      
    case 'CHECK_PAGE_SUPPORT':
      return await checkPageSupport();
      
    default:
      return { error: 'Unknown action' };
  }
}

async function extractData(recipe: any): Promise<any> {
  try {
    console.log('Starting data extraction...');
    console.log('Recipe:', recipe);
    console.log('Current URL:', window.location.href);
    
    const extractedData = await extractFromPage(recipe, window.location.href);
    
    console.log('Extracted data:', extractedData);
    
    // Check if we extracted any meaningful data
    const hasData = extractedData.product || extractedData.price || extractedData.sku;
    if (!hasData) {
      console.warn('No meaningful data extracted from page');
    }
    
    // Submit to API (wrap in items array)
    console.log('Submitting data to API...');
    console.log('Final submission data:', extractedData);
    
    // Validate critical fields before submission
    if (!extractedData.price) {
      console.warn('No price extracted - this may cause validation errors');
    } else {
      console.log(`Price value: ${extractedData.price} (type: ${typeof extractedData.price})`);
    }
    
    const submissionData = {
      items: [extractedData]
    };
    const response = await submitPriceData(submissionData);
    
    console.log('API response:', response);
    
    if (response.success) {
      console.log('Data submitted successfully:', response.data);
      showNotification('Data extracted and submitted successfully!', 'success');
    } else {
      console.error('Failed to submit data:', response.error);
      showNotification(`Failed to submit data: ${response.error}`, 'error');
    }
    
    return {
      success: response.success,
      extractedData,
      submissionResult: response
    };
    
  } catch (error) {
    console.error('Data extraction failed:', error);
    showNotification('Data extraction failed', 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function checkPageSupport(): Promise<any> {
  const response = await chrome.runtime.sendMessage({
    action: 'GET_RECIPES_FOR_URL',
    url: window.location.href
  });
  
  return {
    isSupported: response.recipes && response.recipes.length > 0,
    recipeCount: response.recipes ? response.recipes.length : 0
  };
}

async function extractFromPage(recipe: any, url: string): Promise<any> {
  const extractedData: any = {
    url,
    merchantId: recipe.merchant.id,
    source: 'MANUAL', // Changed from 'EXTENSION' as it was invalid
    priceSource: 'WEBSITE'
  };

  // Get structured data context
  const context = buildDataContext();

  console.log(`Processing ${recipe.selectors.length} selectors...`);
  for (const selector of recipe.selectors) {
    try {
      console.log(`Processing selector for ${selector.fieldName}:`, selector);
      const value = await extractFieldValue(selector, context);
      console.log(`Extracted value for ${selector.fieldName}:`, value);
      
      if (value !== null && value !== undefined && value !== '') {
        assignFieldValue(extractedData, selector.fieldName, value);
        console.log(`✓ Successfully extracted ${selector.fieldName}: ${value}`);
      } else {
        console.log(`✗ No value found for ${selector.fieldName}`);
      }
    } catch (error) {
      console.warn(`Failed to extract ${selector.fieldName}:`, error);
    }
  }

  return extractedData;
}

function buildDataContext(): any {
  const context: any = {
    metaTags: {},
    jsonLd: [],
    dataLayers: {}
  };

  // Extract meta tags
  document.querySelectorAll('meta').forEach(tag => {
    const key = tag.getAttribute('property') || tag.getAttribute('name');
    if (key) {
      context.metaTags[key] = tag.getAttribute('content') || '';
    }
  });

  // Extract JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      const data = JSON.parse(script.textContent || '');
      context.jsonLd.push(data);
    } catch (e) {
      console.warn('Invalid JSON-LD:', e);
    }
  });

  // Extract data layers
  const win = window as any;
  if (win.dataLayer) context.dataLayers.dataLayer = win.dataLayer;
  if (win.digitalData) context.dataLayers.digitalData = win.digitalData;
  if (win.utag_data) context.dataLayers.utag_data = win.utag_data;

  return context;
}

async function extractFieldValue(selector: any, context: any): Promise<string | null> {
  console.log(`Extraction method: ${selector.extractionMethod}`);
  console.log(`Selector value: ${selector.selector}`);
  console.log(`Attribute: ${selector.attributeName}`);
  console.log(`Regex: ${selector.regex}`);

  // Handle different extraction methods
  switch (selector.extractionMethod) {
    case 'STRUCTURED_DATA':
      if (selector.selector) {
        console.log(`Using structured data path: ${selector.selector}`);
        const result = evaluateObjectPath(context, selector.selector);
        console.log(`Structured data result:`, result);
        return result;
      }
      break;

    case 'CSS_SELECTOR':
      if (selector.selector) {
        console.log(`Using CSS selector: ${selector.selector}`);
        const element = document.querySelector(selector.selector);
        console.log(`Found element:`, element);
        if (element) {
          let value = '';
          
          if (selector.attributeName && selector.attributeName !== 'textContent') {
            value = element.getAttribute(selector.attributeName) || '';
          } else {
            value = element.textContent?.trim() || '';
          }

          // Apply regex if specified
          if (selector.regex && value) {
            const regex = new RegExp(selector.regex, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'XPATH':
      if (selector.selector) {
        console.log(`Using XPath: ${selector.selector}`);
        const result = document.evaluate(
          selector.selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        
        const element = result.singleNodeValue as Element;
        console.log(`Found XPath element:`, element);
        if (element) {
          let value = '';
          
          if (selector.attributeName && selector.attributeName !== 'textContent') {
            value = element.getAttribute(selector.attributeName) || '';
          } else {
            value = element.textContent?.trim() || '';
          }

          // Apply regex if specified
          if (selector.regex && value) {
            const regex = new RegExp(selector.regex, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'TEXT':
      // For TEXT extraction, we might need to look at the whole page or use a specific selector
      if (selector.selector) {
        console.log(`Using text selector: ${selector.selector}`);
        const element = document.querySelector(selector.selector);
        console.log(`Found text element:`, element);
        if (element) {
          let value = element.textContent?.trim() || '';
          
          // Apply regex if specified
          if (selector.regex && value) {
            const regex = new RegExp(selector.regex, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;
  }

  // Fallback to legacy format for backwards compatibility
  if (selector.structuredDataPath) {
    console.log(`Using legacy structured data path: ${selector.structuredDataPath}`);
    const result = evaluateObjectPath(context, selector.structuredDataPath);
    console.log(`Legacy structured data result:`, result);
    return result;
  }

  if (selector.cssSelector) {
    console.log(`Using legacy CSS selector: ${selector.cssSelector}`);
    const element = document.querySelector(selector.cssSelector);
    console.log(`Found legacy element:`, element);
    if (element) {
      let value = '';
      
      if (selector.attribute && selector.attribute !== 'textContent') {
        value = element.getAttribute(selector.attribute) || '';
      } else {
        value = element.textContent?.trim() || '';
      }

      // Apply regex if specified
      if (selector.regex && value) {
        const regex = new RegExp(selector.regex, 'i');
        const match = value.match(regex);
        value = match ? (match[1] || match[0]) : value;
      }

      return value;
    }
  }

  console.log(`No extraction method matched for selector:`, selector);
  return null;
}

function evaluateObjectPath(obj: any, path: string): string | null {
  try {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (part.includes('[') && part.includes(']')) {
        const match = part.match(/^([^[]+)\[(\d+)\]$/);
        if (match) {
          const [, propertyName, index] = match;
          current = current[propertyName];
          if (Array.isArray(current)) {
            current = current[parseInt(index, 10)];
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        current = current[part];
      }
      
      if (current === undefined || current === null) {
        return null;
      }
    }
    
    return String(current);
  } catch (error) {
    console.warn('Path evaluation error:', error);
    return null;
  }
}

function assignFieldValue(data: any, fieldName: string, value: string): void {
  switch (fieldName) {
    case 'PRODUCT_NAME':
      data.product = value;
      break;
    case 'PRICE':
      data.price = parsePrice(value);
      break;
    case 'SALE_PRICE':
      data.salePrice = parsePrice(value);
      break;
    case 'SKU':
      data.sku = value;
      break;
    case 'UPC':
      data.upc = value;
      break;
    case 'BRAND':
      data.brandName = value;
      break;
    case 'CATEGORY':
      data.categoryName = value;
      break;
    case 'DESCRIPTION':
      data.description = value;
      break;
    case 'MODEL':
      data.model = value;
      break;
    // Removed IMAGE_URL and IN_STOCK as they're not used in the API
  }
}

function parsePrice(value: string): number | undefined {
  if (!value) return undefined;
  
  // Remove currency symbols, whitespace, and non-numeric characters except . and ,
  const cleaned = value.replace(/[^\d.,]/g, '');
  
  // Handle cases where comma is thousands separator (e.g., "1,299.99")
  // or where comma is decimal separator (e.g., "1299,99")
  let normalizedValue = cleaned;
  
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // Assume comma is thousands separator: "1,299.99" -> "1299.99"
    normalizedValue = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',') && !cleaned.includes('.')) {
    // Assume comma is decimal separator: "1299,99" -> "1299.99"
    normalizedValue = cleaned.replace(',', '.');
  }
  
  const parsed = parseFloat(normalizedValue);
  
  // Ensure the result is a valid number and round to 2 decimal places
  if (isNaN(parsed) || parsed <= 0) return undefined;
  
  return Math.round(parsed * 100) / 100; // Round to 2 decimal places
}

function normalizeImageUrl(value: string): string | undefined {
  if (!value) return undefined;
  
  try {
    const url = new URL(value, window.location.origin);
    return url.toString();
  } catch {
    return value;
  }
}

function parseBoolean(value: string): boolean | undefined {
  if (!value) return undefined;
  
  const normalized = value.toLowerCase().trim();
  if (['true', 'yes', '1', 'available', 'in stock'].includes(normalized)) {
    return true;
  }
  if (['false', 'no', '0', 'unavailable', 'out of stock'].includes(normalized)) {
    return false;
  }
  
  return undefined;
}

async function submitPriceData(data: any): Promise<any> {
  const result = await chrome.storage.local.get(['authToken']);
  const token = result.authToken;
  
  // Determine API URL based on environment
  const manifest = chrome.runtime.getManifest();
  const isDev = manifest.name.includes('Dev');
  const API_BASE_URL = isDev ? 'http://localhost:3000/api/v1' : 'https://www.pricepatrol.co.nz/api/v1';
  
  const headers: any = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    console.log(`Submitting to: ${API_BASE_URL}/prices/submit`);
    console.log('Request data:', data);
    
    const response = await fetch(`${API_BASE_URL}/prices/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    console.log(`API response status: ${response.status}`);
    
    let responseData;
    try {
      responseData = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      const text = await response.text();
      console.error('Response text:', text);
      throw new Error(`Invalid JSON response: ${text}`);
    }
    
    console.log('API response data:', responseData);
    
    if (!response.ok) {
      throw new Error(responseData.error || `HTTP ${response.status}`);
    }

    // Handle both wrapped and direct responses
    if (responseData.success !== undefined) {
      return responseData;
    } else {
      // If no success field, assume it's successful
      return {
        success: true,
        data: responseData
      };
    }
  } catch (error) {
    console.error('API request failed:', error);
    
    // Handle network errors specifically
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: `Cannot connect to API server at ${API_BASE_URL}/prices/submit`
      };
    }
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request failed'
    };
  }
}

function showNotification(message: string, type: 'success' | 'error' | 'info'): void {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `price-patrol-notification price-patrol-${type}`;
  notification.textContent = message;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}