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

export interface RecipeSelector {
  fieldName: string;
  cssSelector?: string;
  xpath?: string;
  structuredDataPath?: string;
  attribute?: string;
  regex?: string;
  isRequired: boolean;
  order: number;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  urlPattern: string;
  isActive: boolean;
  merchant: Merchant;
  selectors: RecipeSelector[];
}

export interface ExtractedData {
  url: string;
  productName?: string;
  price?: number;
  salePrice?: number;
  sku?: string;
  upc?: string;
  brand?: string;
  category?: string;
  description?: string;
  imageUrl?: string;
  inStock?: boolean;
  merchantName: string;
}

export interface StorageData {
  authToken?: string;
  user?: User;
  recipes?: Recipe[];
  lastRecipeUpdate?: number;
}