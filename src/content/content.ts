// Content script for Price Patrol extension

import {
  extractJsonLdData,
  extractMetaTags,
  extractDataLayers,
  evaluateStructuredDataPath
} from '@stnickza/pricepatrol-parser';

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
      
    case 'AUTO_EXTRACT_DATA':
      return await handleAutoExtraction();
      
    case 'EXTRACT_DEEP_SEARCH_DATA':
      return await extractDeepSearchData();
      
    case 'TEST_RECIPE':
      return await testRecipe(message.recipe);
      
    default:
      return { error: 'Unknown action' };
  }
}

async function extractData(recipe: any): Promise<any> {
  const startTime = performance.now();
  
  try {
    console.log('🚀 Starting data extraction...');
    console.log('Recipe:', recipe);
    console.log('Current URL:', window.location.href);
    
    // Check if user is logged in before doing any extraction work
    const authResult = await chrome.storage.local.get(['authToken']);
    if (!authResult.authToken) {
      console.log('User not logged in, skipping data extraction');
      showNotification('Please log in to extract product data', 'error');
      return {
        success: false,
        error: 'User not authenticated'
      };
    }
    
    // Start extraction timing
    const extractionStart = performance.now();
    const extractedData = await extractFromPage(recipe, window.location.href);
    const extractionEnd = performance.now();
    const extractionTime = extractionEnd - extractionStart;
    
    console.log(`⏱️ Data extraction completed in ${extractionTime.toFixed(2)}ms`);
    console.log('Extracted data:', extractedData);
    
    // Check if we extracted any meaningful data
    const hasData = extractedData.product || extractedData.price || extractedData.sku;
    if (!hasData) {
      console.warn('No meaningful data extracted from page');
    }
    
    // Submit to API (wrap in items array)
    console.log('📤 Submitting data to API...');
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
    
    // Start submission timing
    const submissionStart = performance.now();
    const response = await submitPriceData(submissionData);
    const submissionEnd = performance.now();
    const submissionTime = submissionEnd - submissionStart;
    
    console.log(`⏱️ API submission completed in ${submissionTime.toFixed(2)}ms`);
    console.log('API response:', response);
    
    // Calculate total time
    const totalTime = performance.now() - startTime;
    console.log(`⏱️ Total extraction + submission time: ${totalTime.toFixed(2)}ms`);
    console.log(`📊 Performance breakdown: Extraction: ${extractionTime.toFixed(2)}ms | Submission: ${submissionTime.toFixed(2)}ms`);
    
    if (response.success) {
      console.log('✅ Data submitted successfully:', response.data);
      showNotification('Data extracted and submitted successfully!', 'success');
    } else {
      console.error('❌ Failed to submit data:', response.error);
      showNotification(`Failed to submit data: ${response.error}`, 'error');
    }
    
    return {
      success: response.success,
      extractedData,
      submissionResult: response,
      performance: {
        extractionTime: extractionTime,
        submissionTime: submissionTime,
        totalTime: totalTime
      }
    };
    
  } catch (error) {
    const totalTime = performance.now() - startTime;
    console.error(`❌ Data extraction failed after ${totalTime.toFixed(2)}ms:`, error);
    showNotification('Data extraction failed', 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      performance: {
        totalTime: totalTime
      }
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

async function handleAutoExtraction(): Promise<any> {
  const autoStartTime = performance.now();
  
  try {
    console.log('🤖 Auto-extraction triggered for:', window.location.href);
    
    // Check if auto-submit is enabled
    const autoSubmitResult = await chrome.storage.local.get(['autoSubmitEnabled']);
    if (!autoSubmitResult.autoSubmitEnabled) {
      console.log('Auto-submit is disabled, skipping auto-extraction');
      return { success: false, error: 'Auto-submit disabled' };
    }
    
    // Check cache before proceeding
    const shouldExtract = await shouldPerformExtraction(window.location.href);
    if (!shouldExtract.extract) {
      console.log('Skipping extraction:', shouldExtract.reason);
      return { success: false, error: shouldExtract.reason };
    }
    
    // Get recipes for current URL
    const response = await chrome.runtime.sendMessage({
      action: 'GET_RECIPES_FOR_URL',
      url: window.location.href
    });
    
    if (!response.recipes || response.recipes.length === 0) {
      console.log('No recipes found for auto-extraction');
      return { success: false, error: 'No recipes found' };
    }
    
    // Use the first available recipe for auto-extraction
    const recipe = response.recipes[0];
    console.log('🤖 Auto-extracting with recipe:', recipe.name);
    
    // Perform extraction
    const result = await extractData(recipe);
    
    const autoTotalTime = performance.now() - autoStartTime;
    console.log(`🤖 Auto-extraction completed in ${autoTotalTime.toFixed(2)}ms`);
    
    if (result.success) {
      // Cache the successful extraction
      await cacheExtraction(window.location.href, result.extractedData, recipe.merchantId);
      showNotification('Price data auto-extracted and submitted successfully!', 'success');
    } else {
      console.warn('🤖 Auto-extraction failed:', result.error);
    }
    
    return {
      ...result,
      autoPerformance: {
        totalAutoTime: autoTotalTime
      }
    };
    
  } catch (error) {
    const autoTotalTime = performance.now() - autoStartTime;
    console.error(`🤖 Auto-extraction failed after ${autoTotalTime.toFixed(2)}ms:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Auto-extraction failed',
      autoPerformance: {
        totalAutoTime: autoTotalTime
      }
    };
  }
}

async function extractFromPage(recipe: any, url: string): Promise<any> {
  const extractedData: any = {
    url,
    merchantId: recipe.merchantId,
    source: 'MANUAL', // Changed from 'EXTENSION' as it was invalid
    priceSource: 'WEBSITE'
  };

  // Get structured data context using the parser package
  const context = {
    jsonLd: extractJsonLdData(document),
    metaTags: extractMetaTags(document), 
    dataLayers: extractDataLayers(window)
  };

  for (const selector of recipe.selectors) {
    try {
      const value = await extractFieldValue(selector, context);
      
      if (value !== null && value !== undefined && value !== '') {
        assignFieldValue(extractedData, selector.fieldName, value);
      }
    } catch (error) {
      console.warn(`Failed to extract ${selector.fieldName}:`, error);
    }
  }

  return extractedData;
}

// Structured data extraction functions are now imported from @pricepatrol/parser

async function extractFieldValue(selector: any, context: any): Promise<string | null> {
  // Handle different extraction methods
  switch (selector.extractionMethod) {
    case 'STRUCTURED_DATA':
      if (selector.selector) {
        return evaluateStructuredDataPath(context, selector.selector);
      }
      break;

    case 'TEXT':
      if (selector.selector) {
        const element = document.querySelector(selector.selector);
        if (element) {
          let value = '';
          
          if (selector.attributeName && selector.attributeName !== 'textContent') {
            value = element.getAttribute(selector.attributeName) || '';
          } else {
            value = element.textContent?.trim() || '';
          }

          // Apply regex if specified
          if (selector.regexPattern && value) {
            const regex = new RegExp(selector.regexPattern, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'XPATH':
      if (selector.selector) {
        const result = document.evaluate(
          selector.selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        
        const element = result.singleNodeValue as Element;
        if (element) {
          let value = '';
          
          if (selector.attributeName && selector.attributeName !== 'textContent') {
            value = element.getAttribute(selector.attributeName) || '';
          } else {
            value = element.textContent?.trim() || '';
          }

          // Apply regex if specified
          if (selector.regexPattern && value) {
            const regex = new RegExp(selector.regexPattern, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'ATTRIBUTE':
      if (selector.selector) {
        const element = document.querySelector(selector.selector);
        if (element && selector.attributeName) {
          let value = element.getAttribute(selector.attributeName) || '';
          
          // Apply regex if specified
          if (selector.regexPattern && value) {
            const regex = new RegExp(selector.regexPattern, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'REGEX':
      if (selector.regexPattern) {
        let searchText = document.body.textContent || '';
        
        // If a selector is provided, search within that element
        if (selector.selector) {
          const element = document.querySelector(selector.selector);
          if (element) {
            searchText = element.textContent || '';
          }
        }
        
        const regex = new RegExp(selector.regexPattern, 'i');
        const match = searchText.match(regex);
        if (match) {
          return match[1] || match[0];
        }
      }
      break;

    case 'INNER_HTML':
      if (selector.selector) {
        const element = document.querySelector(selector.selector);
        if (element) {
          let value = element.innerHTML || '';
          
          // Apply regex if specified
          if (selector.regexPattern && value) {
            const regex = new RegExp(selector.regexPattern, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        }
      }
      break;

    case 'JS_PATH':
      if (selector.selector) {
        try {
          const result = eval(selector.selector);
          let value = String(result || '');
          
          // Apply regex if specified
          if (selector.regexPattern && value) {
            const regex = new RegExp(selector.regexPattern, 'i');
            const match = value.match(regex);
            value = match ? (match[1] || match[0]) : value;
          }

          return value;
        } catch (error) {
          return null;
        }
      }
      break;
  }

  // Fallback to legacy format for backwards compatibility
  if (selector.structuredDataPath) {
    return evaluateStructuredDataPath(context, selector.structuredDataPath);
  }

  if (selector.cssSelector) {
    const element = document.querySelector(selector.cssSelector);
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

  return null;
}

// Path evaluation function is now imported from @pricepatrol/parser

function sanitizeCategory(value: string): string {
  if (!value) return value;
  
  // Split by line breaks, trim each line, filter out empty lines, then rejoin
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
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
      data.categoryName = sanitizeCategory(value);
      break;
    case 'DESCRIPTION':
      data.description = value;
      break;
    case 'MODEL':
      data.model = value;
      break;
    case 'CURRENCY':
      data.currency = value;
      break;
    case 'IMAGE_URL':
      data.imageUrl = normalizeImageUrl(value);
      break;
    case 'IN_STOCK':
      data.inStock = parseBoolean(value);
      break;
    case 'RATING':
      data.rating = parseFloat(value) || undefined;
      break;
    case 'REVIEW_COUNT':
      data.reviewCount = parseInt(value) || undefined;
      break;
    case 'SALE_START_DATE':
      data.saleStartDate = value;
      break;
    case 'SALE_END_DATE':
      data.saleEndDate = value;
      break;
    case 'UNIT_PRICE':
      data.unitPrice = parsePrice(value);
      break;
    case 'UNIT_TYPE':
      data.unitType = value;
      break;
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

// Admin Functions for Recipe Builder

async function extractDeepSearchData(): Promise<any> {
  try {
    // Use the parser package's standalone functions
    const dataLayers = extractDataLayers(window);
    const deepSearchData = {
      jsonLd: extractJsonLdData(document),
      dataLayer: dataLayers.dataLayer || [],
      meta: extractMetaTags(document),
      digitalData: dataLayers.digitalData || {}
    };

    return {
      success: true,
      data: deepSearchData
    };
  } catch (error) {
    console.error('Deep search extraction failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Deep search extraction failed'
    };
  }
}

// Extraction functions have been moved up in the file

async function testRecipe(recipe: any): Promise<any> {
  try {
    console.log('Testing recipe:', recipe);
    
    // Extract data using the recipe (without submitting to API)
    const extractedData = await extractFromPage(recipe, window.location.href);
    
    console.log('Test extraction results:', extractedData);
    
    return {
      success: true,
      data: extractedData
    };
  } catch (error) {
    console.error('Recipe test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Recipe test failed'
    };
  }
}

// Auto-extraction on page load
async function initAutoExtraction(): Promise<void> {
  try {
    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if auto-submit is enabled
    const autoSubmitResult = await chrome.storage.local.get(['autoSubmitEnabled']);
    if (!autoSubmitResult.autoSubmitEnabled) {
      console.log('Auto-submit disabled, skipping page load auto-extraction');
      return;
    }
    
    // Check if user is logged in
    const authResult = await chrome.storage.local.get(['authToken']);
    if (!authResult.authToken) {
      console.log('User not logged in, skipping auto-extraction');
      return;
    }
    
    // Trigger auto-extraction
    await handleAutoExtraction();
    
  } catch (error) {
    console.error('Failed to initialize auto-extraction:', error);
  }
}

// Start auto-extraction check when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoExtraction);
} else {
  // Page already loaded
  initAutoExtraction();
}

// Cache management functions
async function shouldPerformExtraction(url: string): Promise<{extract: boolean, reason: string}> {
  try {
    const result = await chrome.storage.local.get(['extractionCache']);
    const cache: any[] = result.extractionCache || [];
    
    // Normalize URL (remove query params and fragments for caching)
    const normalizedUrl = normalizeUrlForCache(url);
    
    // Find existing cache entry
    const cacheEntry = cache.find(entry => entry.url === normalizedUrl);
    
    if (!cacheEntry) {
      return { extract: true, reason: 'No cache entry found' };
    }
    
    // Check if enough time has passed (configurable, default 1 hour)
    const cacheExpiryMs = 60 * 60 * 1000; // 1 hour
    const timeSinceLastExtraction = Date.now() - cacheEntry.lastExtracted;
    
    if (timeSinceLastExtraction > cacheExpiryMs) {
      return { extract: true, reason: 'Cache expired' };
    }
    
    return { extract: false, reason: 'Recently extracted (cached)' };
    
  } catch (error) {
    console.error('Error checking extraction cache:', error);
    return { extract: true, reason: 'Cache check failed' };
  }
}

async function cacheExtraction(url: string, extractedData: any, merchantId: string): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['extractionCache']);
    let cache: any[] = result.extractionCache || [];
    
    // Normalize URL
    const normalizedUrl = normalizeUrlForCache(url);
    
    // Create data hash (simple hash of key price data)
    const dataHash = createDataHash(extractedData);
    
    // Remove existing entry for this URL
    cache = cache.filter(entry => entry.url !== normalizedUrl);
    
    // Add new cache entry
    cache.push({
      url: normalizedUrl,
      lastExtracted: Date.now(),
      dataHash: dataHash,
      merchantId: merchantId
    });
    
    // Keep only the last 100 entries to prevent storage bloat
    if (cache.length > 100) {
      cache = cache
        .sort((a, b) => b.lastExtracted - a.lastExtracted)
        .slice(0, 100);
    }
    
    // Save updated cache
    await chrome.storage.local.set({ extractionCache: cache });
    console.log('Cached extraction for:', normalizedUrl);
    
  } catch (error) {
    console.error('Error caching extraction:', error);
  }
}

function normalizeUrlForCache(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query parameters and fragments for caching
    // Keep the path to distinguish between different product pages
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
  } catch (error) {
    console.error('Error normalizing URL:', error);
    return url;
  }
}

function createDataHash(data: any): string {
  // Create a simple hash of the important price data
  const hashableData = {
    price: data.price,
    salePrice: data.salePrice,
    sku: data.sku,
    product: data.product,
    inStock: data.inStock
  };
  
  const str = JSON.stringify(hashableData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
}


async function submitPriceData(data: any): Promise<any> {
  const result = await chrome.storage.local.get(['authToken']);
  const token = result.authToken;
  
  // Safety check - don't submit if not authenticated
  if (!token) {
    console.error('No auth token found - cannot submit price data');
    return {
      success: false,
      error: 'User not authenticated'
    };
  }
  
  // Determine API URL based on environment
  const manifest = chrome.runtime.getManifest();
  const isDev = manifest.name.includes('Dev');
  const API_BASE_URL = isDev ? 'http://localhost:3000/api/v1' : 'https://www.pricepatrol.co.nz/api/v1';
  
  const headers: any = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  try {
    const response = await fetch(`${API_BASE_URL}/prices/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });

    let responseData;
    try {
      responseData = await response.json();
    } catch (jsonError) {
      console.error('Failed to parse JSON response:', jsonError);
      const text = await response.text();
      console.error('Response text:', text);
      throw new Error(`Invalid JSON response: ${text}`);
    }
    
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