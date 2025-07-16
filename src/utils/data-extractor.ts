import { Recipe, RecipeSelector, ExtractedData } from '../types';

export class DataExtractor {
  static async extractFromPage(recipe: Recipe, url: string): Promise<ExtractedData> {
    const extractedData: ExtractedData = {
      url,
      merchantName: recipe.merchant.name
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
    // Structured data extraction
    if (selector.structuredDataPath) {
      return this.evaluateObjectPath(context, selector.structuredDataPath);
    }

    // CSS selector extraction
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

    // XPath extraction
    if (selector.xpath) {
      const result = document.evaluate(
        selector.xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );
      
      const element = result.singleNodeValue as Element;
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

  private static evaluateObjectPath(obj: any, path: string): string | null {
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
      case 'SKU':
        data.sku = value;
        break;
      case 'UPC':
        data.upc = value;
        break;
      case 'BRAND':
        data.brand = value;
        break;
      case 'CATEGORY':
        data.category = value;
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
}