// Environment configuration for Price Patrol extension

export interface Config {
  API_BASE_URL: string;
  WEB_BASE_URL: string;
  ENVIRONMENT: 'development' | 'production';
}

// Development configuration
const DEV_CONFIG: Config = {
  API_BASE_URL: 'http://localhost:3000/api/v1',
  WEB_BASE_URL: 'http://localhost:5173',
  ENVIRONMENT: 'development'
};

// Production configuration
const PROD_CONFIG: Config = {
  API_BASE_URL: 'https://www.pricepatrol.co.nz/api/v1',
  WEB_BASE_URL: 'https://www.pricepatrol.co.nz',
  ENVIRONMENT: 'production'
};

// Helper function to get config at runtime
export function getConfig(): Config {
  // Check if we're in development mode by looking at manifest
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const manifest = chrome.runtime.getManifest();
    const isDev = manifest.name.includes('Dev');
    return isDev ? DEV_CONFIG : PROD_CONFIG;
  }
  
  // Default to production if chrome runtime not available
  return PROD_CONFIG;
}