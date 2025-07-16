// Background service worker for Price Patrol extension

// Initialize when extension starts
chrome.runtime.onStartup.addListener(async () => {
  console.log('Price Patrol extension starting up...');
  await initializeExtension();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Price Patrol extension installed/updated:', details.reason);
  await initializeExtension();
  
  // Set up periodic recipe updates
  chrome.alarms.create('updateRecipes', { 
    delayInMinutes: 60, // First update in 1 hour
    periodInMinutes: 24 * 60 // Then every 24 hours
  });
});

// Handle periodic recipe updates
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateRecipes') {
    console.log('Performing scheduled recipe update...');
    await updateRecipes();
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleBackgroundMessage(message, sender).then(sendResponse);
  return true; // Keep message channel open for async response
});

async function initializeExtension(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['authToken']);
    if (result.authToken) {
      await initializeRecipes();
      const recipes = await getRecipes();
      const activeCount = recipes.filter((r: any) => r.isActive).length;
      console.log(`Extension initialized with ${activeCount} active recipes`);
    } else {
      console.log('Extension initialized - user needs to log in');
    }
  } catch (error) {
    console.error('Failed to initialize extension:', error);
  }
}

async function handleBackgroundMessage(message: any, sender: chrome.runtime.MessageSender): Promise<any> {
  switch (message.action) {
    case 'LOGIN_SUCCESS':
      await initializeRecipes();
      return { success: true };
      
    case 'LOGOUT':
      await chrome.storage.local.remove(['authToken', 'user']);
      return { success: true };
      
    case 'GET_RECIPES_FOR_URL':
      const recipes = await findRecipesForUrl(message.url);
      return { recipes };
      
    case 'UPDATE_RECIPES':
      const updated = await updateRecipes();
      return { success: updated };
      
    default:
      return { error: 'Unknown action' };
  }
}

async function initializeRecipes(): Promise<void> {
  const result = await chrome.storage.local.get(['recipes', 'lastRecipeUpdate']);
  if (!result.lastRecipeUpdate || shouldUpdateRecipes(result.lastRecipeUpdate)) {
    await updateRecipes();
  }
}

async function getRecipes(): Promise<any[]> {
  const result = await chrome.storage.local.get(['recipes']);
  return result.recipes || [];
}

async function updateRecipes(): Promise<boolean> {
  console.log('Updating recipes from server...');
  
  const result = await chrome.storage.local.get(['authToken']);
  const token = result.authToken;
  
  if (!token) {
    console.log('No auth token, skipping recipe update');
    return false;
  }
  
  // Determine API URL based on environment
  const manifest = chrome.runtime.getManifest();
  const isDev = manifest.name.includes('Dev');
  const API_BASE_URL = isDev ? 'http://localhost:3000/api/v1' : 'https://www.pricepatrol.co.nz/api/v1';
  
  try {
    console.log(`Fetching recipes from: ${API_BASE_URL}/scraping-recipes`);
    const response = await fetch(`${API_BASE_URL}/scraping-recipes`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Recipe fetch response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Recipe fetch failed: ${response.status} - ${errorText}`);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Recipe fetch response:', data);
    
    // Handle both wrapped and direct array responses
    let recipes;
    if (data.success && data.data) {
      // Wrapped response: { success: true, data: [...] }
      recipes = data.data;
    } else if (Array.isArray(data)) {
      // Direct array response: [...]
      recipes = data;
    } else {
      console.error('Recipe response format not recognized:', data);
      return false;
    }
    
    await chrome.storage.local.set({ 
      recipes: recipes, 
      lastRecipeUpdate: Date.now() 
    });
    console.log(`Updated ${recipes.length} recipes`);
    return true;
  } catch (error) {
    console.error('Failed to update recipes:', error);
    
    // If it's a network error, provide more specific feedback
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error(`Network error: Cannot connect to ${API_BASE_URL}/scraping-recipes`);
    }
    
    return false;
  }
}

async function findRecipesForUrl(url: string): Promise<any[]> {
  const recipes = await getRecipes();
  return recipes.filter((recipe: any) => {
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

function shouldUpdateRecipes(lastUpdate: number): boolean {
  const dayInMs = 24 * 60 * 60 * 1000;
  return Date.now() - lastUpdate > dayInMs;
}