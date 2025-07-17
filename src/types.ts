export interface User {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  isEmailVerified: boolean;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface Merchant {
  id: string;
  name: string;
  website: string;
}

export type ScrapingFieldName =
  | 'PRODUCT_NAME' | 'PRICE' | 'SALE_PRICE' | 'CURRENCY' | 'SKU' | 'UPC' | 'MODEL'
  | 'DESCRIPTION' | 'BRAND' | 'CATEGORY' | 'IMAGE_URL' | 'IN_STOCK' | 'RATING'
  | 'REVIEW_COUNT' | 'SALE_START_DATE' | 'SALE_END_DATE' | 'UNIT_PRICE' | 'UNIT_TYPE';

export type ScrapingExtractionMethod =
  | 'TEXT' | 'ATTRIBUTE' | 'REGEX' | 'INNER_HTML' | 'STRUCTURED_DATA' | 'XPATH' | 'JS_PATH';

export interface RecipeSelector {
  fieldName: ScrapingFieldName;
  selector: string;
  extractionMethod: ScrapingExtractionMethod;
  attributeName?: string;
  regexPattern?: string;
  transformations?: Record<string, any>;
  isRequired?: boolean;
  order?: number;
}

export interface Recipe {
  id: string;
  name: string;
  merchantId: string;
  merchantName: string;
  version: number;
  isActive: boolean;
  pageTypes: string[];
  urlPattern: string;
  description?: string;
  changeLog?: string;
  selectors: RecipeSelector[];
  createdAt: string;
  updatedAt: string;
}

export interface ScrapingRecipeMatch {
  recipe: Recipe;
  confidence: number;
}

export interface ExtractedData {
  url: string;
  productName?: string;
  price?: number;
  salePrice?: number;
  currency?: string;
  sku?: string;
  upc?: string;
  model?: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  inStock?: boolean;
  rating?: number;
  reviewCount?: number;
  saleStartDate?: string;
  saleEndDate?: string;
  unitPrice?: number;
  unitType?: string;
  merchantName: string;
}

export interface ExtractionCache {
  url: string;
  lastExtracted: number;
  dataHash: string;
  merchantId: string;
}

export interface StorageData {
  authToken?: string;
  user?: User;
  recipes?: Recipe[];
  lastRecipeUpdate?: number;
  autoSubmitEnabled?: boolean;
  extractionCache?: ExtractionCache[];
}