// Chrome extension popup implementation

class PricePatrolPopup {
    private currentUser: any = null;
    private isLoggedIn: boolean = false;
    private currentTab: chrome.tabs.Tab | null = null;
    private readonly API_BASE_URL: string;
    private readonly WEB_BASE_URL: string;

    constructor() {
        // Set URLs based on environment
        const isDev = chrome.runtime.getManifest().name.includes('Dev');
        
        if (isDev) {
            this.API_BASE_URL = 'http://localhost:3000/api/v1';
            this.WEB_BASE_URL = 'http://localhost:5173';
        } else {
            this.API_BASE_URL = 'https://www.pricepatrol.co.nz/api/v1';
            this.WEB_BASE_URL = 'https://www.pricepatrol.co.nz';
        }
        
        this.init();
    }

    async init(): Promise<void> {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tab;

        // Check authentication status
        await this.checkAuthStatus();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        // Set environment-specific URLs
        this.setupEnvironmentLinks();
        
        // Check page support if logged in
        if (this.isLoggedIn && this.currentTab?.url) {
            await this.checkPageSupport();
        }
        
        // Load auto-submit preference
        await this.loadAutoSubmitPreference();
    }

    async checkAuthStatus(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(['authToken']);
            if (result.authToken) {
                const response = await this.getCurrentUser();
                if (response.success && response.data) {
                    this.currentUser = response.data;
                    this.isLoggedIn = true;
                    await this.updateStats();
                } else {
                    // Token is invalid, clear it
                    await chrome.storage.local.remove(['authToken', 'user']);
                }
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            await chrome.storage.local.remove(['authToken', 'user']);
        }
    }

    async apiRequest(endpoint: string, options: any = {}): Promise<any> {
        const result = await chrome.storage.local.get(['authToken']);
        const token = result.authToken;
        
        const headers: any = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
                ...options,
                headers
            });

            let data;
            try {
                data = await response.json();
            } catch (jsonError) {
                // If JSON parsing fails, create a generic error response
                data = { 
                    success: false, 
                    error: `Server returned ${response.status}: ${response.statusText}` 
                };
            }
            
            if (!response.ok) {
                return {
                    success: false,
                    error: data.error || `HTTP ${response.status}: ${response.statusText}`
                };
            }

            return data;
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            
            // Handle network errors specifically
            if (error instanceof TypeError && error.message.includes('fetch')) {
                return {
                    success: false,
                    error: `Cannot connect to server at ${this.API_BASE_URL}. Make sure the API server is running.`
                };
            }
            
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Request failed'
            };
        }
    }

    async login(email: string, password: string): Promise<any> {
        return this.apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
                emailOrUsername: email,
                password
            })
        });
    }

    async getCurrentUser(): Promise<any> {
        return this.apiRequest('/auth/me');
    }

    setupEventListeners(): void {
        // Auth events
        document.getElementById('login-btn')!.addEventListener('click', () => this.handleLogin());
        document.getElementById('logout-btn')!.addEventListener('click', () => this.handleLogout());
        
        // Enter key for login
        document.getElementById('email')!.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });
        document.getElementById('password')!.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLogin();
        });

        // Extraction events
        document.getElementById('extract-btn')!.addEventListener('click', () => this.handleExtraction());
        document.getElementById('refresh-recipes-btn')!.addEventListener('click', () => this.handleRefreshRecipes());
        
        // Auto-submit checkbox
        document.getElementById('auto-submit-checkbox')!.addEventListener('change', (e) => this.handleAutoSubmitToggle(e));
        
        // Admin events
        document.getElementById('create-recipe-btn')!.addEventListener('click', () => this.handleCreateRecipe());
        document.getElementById('copy-test-results-btn')!.addEventListener('click', () => this.handleCopyTestResults());
        document.getElementById('close-admin-test-btn')!.addEventListener('click', () => this.handleCloseAdminTest());
    }

    async handleLogin(): Promise<void> {
        const emailInput = document.getElementById('email') as HTMLInputElement;
        const passwordInput = document.getElementById('password') as HTMLInputElement;
        const errorDiv = document.getElementById('auth-error')!;
        const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            this.showError('Please enter both email and password');
            return;
        }

        // Show loading state
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;
        errorDiv.textContent = '';

        try {
            const response = await this.login(email, password);
            
            if (response.success && response.data) {
                // Store auth data
                await chrome.storage.local.set({
                    authToken: response.data.token,
                    user: response.data.user
                });
                
                this.currentUser = response.data.user;
                this.isLoggedIn = true;

                // Notify background script
                await chrome.runtime.sendMessage({ action: 'LOGIN_SUCCESS' });

                // Update UI
                this.updateUI();
                await this.updateStats();
                
                if (this.currentTab?.url) {
                    await this.checkPageSupport();
                }

                this.showStatus('Login successful!', 'success');
            } else {
                const errorMessage = typeof response.error === 'string' 
                    ? response.error 
                    : (response.error?.message || 'Login failed');
                this.showError(errorMessage);
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Login failed. Please try again.');
        } finally {
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    }

    async handleLogout(): Promise<void> {
        await chrome.storage.local.remove(['authToken', 'user']);
        await chrome.runtime.sendMessage({ action: 'LOGOUT' });
        
        this.currentUser = null;
        this.isLoggedIn = false;
        this.updateUI();
        
        this.showStatus('Logged out successfully', 'success');
    }

    async handleExtraction(): Promise<void> {
        if (!this.currentTab?.id) {
            this.showStatus('No active tab found', 'error');
            return;
        }

        const extractBtn = document.getElementById('extract-btn') as HTMLButtonElement;
        const statusDiv = document.getElementById('extraction-status')!;

        // Show loading state
        extractBtn.textContent = 'Extracting...';
        extractBtn.disabled = true;
        statusDiv.textContent = 'Extracting product data...';
        statusDiv.className = 'extraction-status loading';

        try {
            // Get recipes for current URL
            const recipesResponse = await chrome.runtime.sendMessage({
                action: 'GET_RECIPES_FOR_URL',
                url: this.currentTab.url
            });

            if (!recipesResponse.recipes || recipesResponse.recipes.length === 0) {
                throw new Error('No recipes found for this page');
            }

            // Use the first available recipe
            const recipe = recipesResponse.recipes[0];

            // Send extraction message to content script
            console.log('Sending extraction message with recipe:', recipe);
            const result = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'EXTRACT_DATA',
                recipe: recipe
            });

            console.log('Extraction result:', result);

            if (result && result.success) {
                statusDiv.textContent = 'Data extracted and submitted successfully!';
                statusDiv.className = 'extraction-status success';
            } else {
                const errorMsg = result?.error || 'Extraction failed';
                console.error('Extraction failed with result:', result);
                throw new Error(errorMsg);
            }

        } catch (error) {
            console.error('Extraction failed:', error);
            statusDiv.textContent = `Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            statusDiv.className = 'extraction-status error';
        } finally {
            extractBtn.textContent = 'Extract Product Data';
            extractBtn.disabled = false;

            // Hide status after 5 seconds
            setTimeout(() => {
                statusDiv.textContent = '';
                statusDiv.className = 'extraction-status';
            }, 5000);
        }
    }

    async handleRefreshRecipes(): Promise<void> {
        const refreshBtn = document.getElementById('refresh-recipes-btn') as HTMLButtonElement;
        
        refreshBtn.textContent = 'Refreshing...';
        refreshBtn.disabled = true;

        try {
            const response = await chrome.runtime.sendMessage({ action: 'UPDATE_RECIPES' });
            
            if (response.success) {
                this.showStatus('Recipes updated successfully', 'success');
                await this.updateStats();
                
                if (this.currentTab?.url) {
                    await this.checkPageSupport();
                }
            } else {
                this.showStatus('Failed to update recipes', 'error');
            }
        } catch (error) {
            console.error('Recipe refresh failed:', error);
            this.showStatus('Failed to refresh recipes', 'error');
        } finally {
            refreshBtn.textContent = 'Refresh Recipes';
            refreshBtn.disabled = false;
        }
    }

    async checkPageSupport(): Promise<void> {
        if (!this.currentTab?.id || !this.currentTab.url) return;

        const statusIndicator = document.getElementById('page-support-status')!;
        const supportText = document.getElementById('support-text')!;
        const extractionSection = document.getElementById('extraction-section')!;
        const noSupportSection = document.getElementById('no-support-section')!;

        // Show checking state
        statusIndicator.className = 'status-indicator';
        supportText.textContent = 'Checking page support...';

        try {
            const result = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'CHECK_PAGE_SUPPORT'
            });

            if (result && result.isSupported) {
                statusIndicator.className = 'status-indicator supported';
                supportText.textContent = `Supported - ${result.recipeCount} recipe(s) available`;
                extractionSection.classList.remove('hidden');
                noSupportSection.classList.add('hidden');
            } else {
                statusIndicator.className = 'status-indicator not-supported';
                supportText.textContent = 'Page not supported';
                extractionSection.classList.add('hidden');
                noSupportSection.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Page support check failed:', error);
            
            // Handle specific content script communication errors
            if (error instanceof Error && error.message && error.message.includes('Could not establish connection')) {
                console.warn('Content script not ready yet, this is normal on some pages');
                statusIndicator.className = 'status-indicator not-supported';
                supportText.textContent = 'Checking page support...';
                
                // Retry after a short delay
                setTimeout(() => {
                    if (this.currentTab?.id) {
                        this.checkPageSupport();
                    }
                }, 1000);
            } else {
                statusIndicator.className = 'status-indicator not-supported';
                supportText.textContent = 'Unable to check page support';
                extractionSection.classList.add('hidden');
                noSupportSection.classList.remove('hidden');
            }
        }
    }

    async updateStats(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(['recipes']);
            const recipes = result.recipes || [];
            const activeRecipes = recipes.filter((r: any) => r.isActive);
            
            // Count unique merchants
            const uniqueMerchants = new Set(activeRecipes.map((r: any) => r.merchantId));
            
            document.getElementById('supported-sites')!.textContent = uniqueMerchants.size.toString();
            document.getElementById('recipe-count')!.textContent = `${activeRecipes.length} extraction recipes available`;
            
            // Last update time
            const updateResult = await chrome.storage.local.get(['lastRecipeUpdate']);
            if (updateResult.lastRecipeUpdate) {
                const lastUpdate = new Date(updateResult.lastRecipeUpdate);
                const timeAgo = this.formatTimeAgo(lastUpdate);
                document.getElementById('last-update')!.textContent = timeAgo;
            } else {
                document.getElementById('last-update')!.textContent = 'Never';
            }
            
        } catch (error) {
            console.error('Failed to update stats:', error);
        }
    }

    updateUI(): void {
        const authSection = document.getElementById('auth-section')!;
        const mainSection = document.getElementById('main-section')!;
        const userEmailSpan = document.getElementById('user-email')!;
        const adminRecipeSection = document.getElementById('admin-recipe-section')!;

        if (this.isLoggedIn && this.currentUser) {
            authSection.classList.add('hidden');
            mainSection.classList.remove('hidden');
            userEmailSpan.textContent = this.currentUser.email;
            
            // Show admin recipe builder for ADMIN users
            if (this.currentUser.role === 'ADMIN') {
                adminRecipeSection.classList.remove('hidden');
                this.checkAdminRecipes();
            } else {
                adminRecipeSection.classList.add('hidden');
            }
        } else {
            authSection.classList.remove('hidden');
            mainSection.classList.add('hidden');
            adminRecipeSection.classList.add('hidden');
        }
    }

    showError(message: string): void {
        const errorDiv = document.getElementById('auth-error')!;
        errorDiv.textContent = message;
    }

    showStatus(message: string, type: 'success' | 'error'): void {
        console.log(`${type.toUpperCase()}: ${message}`);
    }

    formatTimeAgo(date: Date): string {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        
        if (diffHours < 1) return 'Just now';
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    async loadAutoSubmitPreference(): Promise<void> {
        try {
            const result = await chrome.storage.local.get(['autoSubmitEnabled']);
            const autoSubmitCheckbox = document.getElementById('auto-submit-checkbox') as HTMLInputElement;
            if (autoSubmitCheckbox) {
                autoSubmitCheckbox.checked = result.autoSubmitEnabled || false;
            }
        } catch (error) {
            console.error('Failed to load auto-submit preference:', error);
        }
    }

    async handleAutoSubmitToggle(event: Event): Promise<void> {
        const checkbox = event.target as HTMLInputElement;
        const isEnabled = checkbox.checked;
        
        try {
            // Save preference to storage
            await chrome.storage.local.set({ autoSubmitEnabled: isEnabled });
            
            // Notify background script about the change
            await chrome.runtime.sendMessage({ 
                action: 'AUTO_SUBMIT_TOGGLED', 
                enabled: isEnabled 
            });
            
            // Show feedback to user
            if (isEnabled) {
                this.showStatus('Auto-submit enabled - prices will be extracted automatically', 'success');
            } else {
                this.showStatus('Auto-submit disabled', 'success');
            }
            
            // If enabling auto-submit and we're on a supported page, trigger extraction
            if (isEnabled && this.isLoggedIn && this.currentTab?.url) {
                const response = await chrome.runtime.sendMessage({
                    action: 'GET_RECIPES_FOR_URL',
                    url: this.currentTab.url
                });
                
                if (response.recipes && response.recipes.length > 0) {
                    // Trigger auto-extraction after a short delay
                    setTimeout(async () => {
                        await this.triggerAutoExtraction();
                    }, 1000);
                }
            }
        } catch (error) {
            console.error('Failed to toggle auto-submit:', error);
            this.showStatus('Failed to save auto-submit preference', 'error');
        }
    }

    async triggerAutoExtraction(): Promise<void> {
        if (!this.currentTab?.id) return;
        
        try {
            // Send auto-extraction message to content script
            await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'AUTO_EXTRACT_DATA'
            });
        } catch (error) {
            console.error('Failed to trigger auto-extraction:', error);
        }
    }

    setupEnvironmentLinks(): void {
        // Set up environment-specific links
        const registerLink = document.getElementById('register-link') as HTMLAnchorElement;
        const forgotPasswordLink = document.getElementById('forgot-password-link') as HTMLAnchorElement;
        const envIndicator = document.getElementById('env-indicator') as HTMLSpanElement;

        if (registerLink) {
            registerLink.href = `${this.WEB_BASE_URL}/register`;
        }
        if (forgotPasswordLink) {
            forgotPasswordLink.href = `${this.WEB_BASE_URL}/forgot-password`;
        }
        if (envIndicator) {
            const isDev = this.API_BASE_URL.includes('localhost');
            envIndicator.textContent = isDev ? 'DEV' : 'PROD';
            envIndicator.className = `environment-indicator ${isDev ? 'dev' : 'prod'}`;
        }
    }

    // Admin Recipe Builder Methods
    async checkAdminRecipes(): Promise<void> {
        if (!this.currentTab?.url) return;
        
        try {
            const response = await this.apiRequest(`/scraping-recipes/find-by-url?url=${encodeURIComponent(this.currentTab.url)}`);
            
            if (response.success && response.data && response.data.length > 0) {
                this.displayAdminRecipes(response.data);
            } else {
                // Hide existing recipes section if no recipes found
                document.getElementById('admin-existing-recipes')!.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to check admin recipes:', error);
        }
    }

    displayAdminRecipes(recipes: any[]): void {
        const existingRecipesSection = document.getElementById('admin-existing-recipes')!;
        const recipesList = document.getElementById('admin-recipes-list')!;
        
        recipesList.innerHTML = '';
        
        recipes.forEach(recipe => {
            const recipeItem = document.createElement('div');
            recipeItem.className = 'recipe-item';
            
            recipeItem.innerHTML = `
                <div>
                    <div class="recipe-name">${recipe.name}</div>
                    <div class="recipe-version">v${recipe.version}</div>
                </div>
                <div class="recipe-actions">
                    <button class="btn btn-small btn-secondary" onclick="pricePatrolPopup.testRecipe('${recipe.id}')">Test</button>
                    <button class="btn btn-small btn-primary" onclick="pricePatrolPopup.editRecipe('${recipe.id}')">Edit</button>
                </div>
            `;
            
            recipesList.appendChild(recipeItem);
        });
        
        existingRecipesSection.classList.remove('hidden');
    }

    async testRecipe(recipeId: string): Promise<void> {
        if (!this.currentTab?.id) return;
        
        try {
            // Get the recipe details
            const recipeResponse = await this.apiRequest(`/scraping-recipes/${recipeId}`);
            if (!recipeResponse.success) {
                throw new Error('Failed to load recipe');
            }
            
            // Send test message to content script
            const result = await chrome.tabs.sendMessage(this.currentTab.id, {
                action: 'TEST_RECIPE',
                recipe: recipeResponse.data
            });
            
            if (result && result.success) {
                this.displayTestResults(result.data);
            } else {
                throw new Error(result?.error || 'Test failed');
            }
        } catch (error) {
            console.error('Recipe test failed:', error);
            this.showStatus(`Recipe test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    displayTestResults(testData: any): void {
        const testResultsSection = document.getElementById('admin-test-results')!;
        const testContent = document.getElementById('admin-test-content')!;
        
        testContent.textContent = JSON.stringify(testData, null, 2);
        testResultsSection.classList.remove('hidden');
    }

    editRecipe(recipeId: string): void {
        // Open recipe builder in new tab with recipe ID for editing
        const builderUrl = chrome.runtime.getURL('popup/recipe-builder.html') + `?recipeId=${recipeId}&url=${encodeURIComponent(this.currentTab?.url || '')}`;
        chrome.tabs.create({ url: builderUrl });
    }

    handleCreateRecipe(): void {
        // Open recipe builder in new tab for creating new recipe
        const builderUrl = chrome.runtime.getURL('popup/recipe-builder.html') + `?url=${encodeURIComponent(this.currentTab?.url || '')}`;
        chrome.tabs.create({ url: builderUrl });
    }

    handleCopyTestResults(): void {
        const testContent = document.getElementById('admin-test-content') as HTMLPreElement;
        if (testContent && testContent.textContent) {
            navigator.clipboard.writeText(testContent.textContent).then(() => {
                this.showStatus('Test results copied to clipboard', 'success');
            }).catch(error => {
                console.error('Failed to copy test results:', error);
                this.showStatus('Failed to copy test results', 'error');
            });
        }
    }

    handleCloseAdminTest(): void {
        const testResultsSection = document.getElementById('admin-test-results')!;
        testResultsSection.classList.add('hidden');
    }
}

// Global reference for onclick handlers
let pricePatrolPopup: PricePatrolPopup;

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    pricePatrolPopup = new PricePatrolPopup();
});