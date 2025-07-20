import { Recipe, RecipeSelector, ExtractedData } from '../types';

export class DataExtractor {
  static async extractFromPage(recipe: Recipe, url: string): Promise<ExtractedData> {
    const extractedData: ExtractedData = {
      url,
      merchantName: recipe.merchantName
    };

    // Get structured data context
    const context = this.buildDataContext();

    for (const selector of recipe.selectors) {
      try {
        const value = await this.extractFieldValue(selector, context);
        if (value !== null && value !== undefined && value !== '') {
          this.assignFieldValue(extractedData, selector.fieldName, value);
        }
      } catch (error) {
        console.warn(`Failed to extract ${selector.fieldName}:`, error);
      }
    }

    return extractedData;
  }

  private static buildDataContext(): any {
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

  private static async extractFieldValue(selector: RecipeSelector, context: any): Promise<string | null> {
    // Handle different extraction methods
    switch (selector.extractionMethod) {
      case 'STRUCTURED_DATA':
        if (selector.selector) {
          return this.evaluateObjectPath(context, selector.selector);
        }
        break;

      case 'TEXT':
        if (selector.selector) {
          const element = document.querySelector(selector.selector);
          if (element) {
            let value = element.textContent?.trim() || '';
            
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
        if (selector.selector && selector.attributeName) {
          const element = document.querySelector(selector.selector);
          if (element) {
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
            console.warn('JS path evaluation error:', error);
            return null;
          }
        }
        break;
    }

    return null;
  }

  private static evaluateObjectPath(obj: any, path: string): string | null {
    try {
      const parts = path.split('.');
      let current = obj;
      
      for (const part of parts) {
        if (part.includes('[') && part.includes(']')) {
          // Extract property name and all array indices
          const indices = Array.from(part.matchAll(/\[(\d+)\]/g), match => parseInt(match[1], 10));
          const propertyName = part.split('[')[0];
          
          if (indices.length > 0 && propertyName) {
            current = current[propertyName];
            
            // Apply each array index consecutively
            for (const index of indices) {
              if (Array.isArray(current)) {
                current = current[index];
              } else {
                return null;
              }
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

  private static assignFieldValue(data: ExtractedData, fieldName: string, value: string): void {
    switch (fieldName) {
      case 'PRODUCT_NAME':
        data.productName = value;
        break;
      case 'PRICE':
        data.price = this.parsePrice(value);
        break;
      case 'SALE_PRICE':
        data.salePrice = this.parsePrice(value);
        break;
      case 'CURRENCY':
        data.currency = value;
        break;
      case 'SKU':
        data.sku = value;
        break;
      case 'UPC':
        data.upc = value;
        break;
      case 'MODEL':
        data.model = value;
        break;
      case 'BRAND':
        data.brand = value;
        break;
      case 'CATEGORY':
        data.category = this.sanitizeCategory(value);
        break;
      case 'DESCRIPTION':
        data.description = value;
        break;
      case 'IMAGE_URL':
        data.imageUrl = this.normalizeImageUrl(value);
        break;
      case 'IN_STOCK':
        data.inStock = this.parseBoolean(value);
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
        data.unitPrice = this.parsePrice(value);
        break;
      case 'UNIT_TYPE':
        data.unitType = value;
        break;
    }
  }

  private static parsePrice(value: string): number | undefined {
    if (!value) return undefined;
    
    // Remove currency symbols and whitespace
    const cleaned = value.replace(/[^\d.,]/g, '');
    const parsed = parseFloat(cleaned.replace(',', ''));
    
    return isNaN(parsed) ? undefined : parsed;
  }

  private static normalizeImageUrl(value: string): string | undefined {
    if (!value) return undefined;
    
    try {
      const url = new URL(value, window.location.origin);
      return url.toString();
    } catch {
      return value;
    }
  }

  private static parseBoolean(value: string): boolean | undefined {
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

  private static sanitizeCategory(value: string): string {
    if (!value) return value;
    
    // Split by line breaks, trim each line, filter out empty lines, then rejoin
    return value
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
  }
}