import { ApiResponse, LoginResponse, User, Recipe, ScrapingRecipeMatch } from '../types';
import { StorageManager } from './storage';

export class ApiClient {
  private static readonly BASE_URL = 'https://www.pricepatrol.co.nz/api/v1';

  private static async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = await StorageManager.getAuthToken();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.BASE_URL}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Request failed'
      };
    }
  }

  static async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    return this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        emailOrUsername: email,
        password
      })
    });
  }

  static async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/me');
  }

  static async getRecipes(): Promise<ApiResponse<Recipe[]>> {
    return this.request<Recipe[]>('/scraping-recipes');
  }

  static async findRecipesByUrl(url: string): Promise<ApiResponse<ScrapingRecipeMatch[]>> {
    const encodedUrl = encodeURIComponent(url);
    return this.request<ScrapingRecipeMatch[]>(`/scraping-recipes/find-by-url?url=${encodedUrl}`);
  }

  static async submitPriceData(data: any): Promise<ApiResponse<any>> {
    return this.request('/price-submit', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
}