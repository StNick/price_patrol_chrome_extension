export class StorageManager {
  private static async get(keys: string[]): Promise<any> {
    return chrome.storage.local.get(keys);
  }

  private static async set(data: any): Promise<void> {
    return chrome.storage.local.set(data);
  }

  static async getAuthToken(): Promise<string | null> {
    const result = await this.get(['authToken']);
    return result.authToken || null;
  }

  static async setAuthToken(token: string): Promise<void> {
    await this.set({ authToken: token });
  }

  static async clearAuth(): Promise<void> {
    await chrome.storage.local.remove(['authToken', 'user']);
  }

  static async getUser(): Promise<any> {
    const result = await this.get(['user']);
    return result.user || null;
  }

  static async setUser(user: any): Promise<void> {
    await this.set({ user });
  }

  static async getRecipes(): Promise<any[]> {
    const result = await this.get(['recipes']);
    return result.recipes || [];
  }

  static async setRecipes(recipes: any[]): Promise<void> {
    await this.set({ 
      recipes, 
      lastRecipeUpdate: Date.now() 
    });
  }

  static async shouldUpdateRecipes(): Promise<boolean> {
    const result = await this.get(['lastRecipeUpdate']);
    if (!result.lastRecipeUpdate) return true;
    
    // Update recipes every 24 hours
    const dayInMs = 24 * 60 * 60 * 1000;
    return Date.now() - result.lastRecipeUpdate > dayInMs;
  }
}