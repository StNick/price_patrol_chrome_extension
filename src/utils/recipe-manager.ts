import { Recipe } from '../types';
import { ApiClient } from './api-client';
import { StorageManager } from './storage';

export class RecipeManager {
  private static recipes: Recipe[] = [];

  static async initialize(): Promise<void> {
    // Load recipes from storage first
    this.recipes = await StorageManager.getRecipes();

    // Update from server if needed
    if (await StorageManager.shouldUpdateRecipes()) {
      await this.updateRecipes();
    }
  }

  static async updateRecipes(): Promise<boolean> {
    console.log('Updating recipes from server...');
    
    const response = await ApiClient.getRecipes();
    if (response.success && response.data) {
      this.recipes = response.data;
      await StorageManager.setRecipes(this.recipes);
      console.log(`Updated ${this.recipes.length} recipes`);
      return true;
    }

    console.error('Failed to update recipes:', response.error);
    return false;
  }

  static findRecipesForUrl(url: string): Recipe[] {
    return this.recipes.filter(recipe => {
      if (!recipe.isActive) return false;
      
      try {
        const regex = new RegExp(recipe.urlPattern, 'i');
        return regex.test(url);
      } catch (e) {
        console.warn(`Invalid regex pattern in recipe ${recipe.id}:`, recipe.urlPattern);
        return false;
      }
    });
  }

  static getRecipeCount(): number {
    return this.recipes.filter(r => r.isActive).length;
  }

  static getAllRecipes(): Recipe[] {
    return [...this.recipes];
  }
}