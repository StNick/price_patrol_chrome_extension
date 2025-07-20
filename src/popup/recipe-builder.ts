// Recipe Builder for Price Patrol Chrome Extension

interface DeepSearchData {
    jsonLd: any[];
    dataLayer: any[];
    meta: { [key: string]: string };
    digitalData: any;
}

interface RecipeMapping {
    [fieldName: string]: {
        selector: string;
        extractionMethod: string;
        attributeName?: string;
        regexPattern?: string;
        isRequired?: boolean;
    };
}

class RecipeBuilder {
    private readonly API_BASE_URL: string;
    private readonly WEB_BASE_URL: string;
    private deepSearchData: DeepSearchData | null = null;
    private recipeMapping: RecipeMapping = {};
    private authToken: string | null = null;
    private currentUrl: string = '';
    private editingRecipe: any = null;
    private currentTab: string = 'jsonld';

    // Available field mappings
    private readonly FIELD_MAPPINGS = [
        { name: 'PRODUCT_NAME', label: 'Product Name', required: true },
        { name: 'PRICE', label: 'Price', required: true },
        { name: 'SALE_PRICE', label: 'Sale Price', required: false },
        { name: 'CURRENCY', label: 'Currency', required: false },
        { name: 'SKU', label: 'SKU/Product ID', required: false },
        { name: 'UPC', label: 'UPC/Barcode', required: false },
        { name: 'MODEL', label: 'Model Number', required: false },
        { name: 'DESCRIPTION', label: 'Description', required: false },
        { name: 'BRAND', label: 'Brand', required: false },
        { name: 'CATEGORY', label: 'Category', required: false },
        { name: 'IMAGE_URL', label: 'Image URL', required: false },
        { name: 'IN_STOCK', label: 'In Stock', required: false },
        { name: 'RATING', label: 'Rating', required: false },
        { name: 'REVIEW_COUNT', label: 'Review Count', required: false }
    ];

    private readonly EXTRACTION_METHODS = [
        { value: 'STRUCTURED_DATA', label: 'Structured Data' },
        { value: 'TEXT', label: 'Text Content' },
        { value: 'ATTRIBUTE', label: 'Attribute' },
        { value: 'XPATH', label: 'XPath' },
        { value: 'REGEX', label: 'Regex' }
    ];

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
        await this.loadData();
        this.setupEventListeners();
        this.setupEnvironmentIndicator();
    }

    async loadData(): Promise<void> {
        try {
            // Get URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            this.currentUrl = urlParams.get('url') || '';
            const recipeId = urlParams.get('recipeId');

            // Get auth token
            const result = await chrome.storage.local.get(['authToken']);
            this.authToken = result.authToken;

            if (!this.authToken) {
                this.showStatusMessage('Authentication required', 'error');
                return;
            }

            // Verify admin access
            const userResponse = await this.apiRequest('/auth/me');
            if (!userResponse.success || userResponse.data.role !== 'ADMIN') {
                this.showStatusMessage('Admin access required for recipe builder', 'error');
                return;
            }

            // Update URL display
            document.getElementById('page-url')!.textContent = this.currentUrl;

            // If editing existing recipe, load it
            if (recipeId) {
                await this.loadExistingRecipe(recipeId);
            }

            // Extract deep search data from the current tab
            await this.extractDeepSearchData();
            
            // Initialize the interface
            this.displayMappingInterface();
            this.hideLoading();

        } catch (error) {
            console.error('Failed to load data:', error);
            this.showStatusMessage('Error loading recipe builder', 'error');
            this.hideLoading();
        }
    }

    async apiRequest(endpoint: string, options: any = {}): Promise<any> {
        const headers: any = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.authToken) {
            headers.Authorization = `Bearer ${this.authToken}`;
        }

        try {
            const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
                ...options,
                headers
            });

            let data;
            try {
                data = await response.json();
            } catch {
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
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Request failed'
            };
        }
    }

    async extractDeepSearchData(): Promise<void> {
        try {
            // Get the active tab that opened this recipe builder
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: false });
            if (!tab?.id) {
                throw new Error('No active tab found');
            }

            // Inject content script to extract deep search data
            const result = await chrome.tabs.sendMessage(tab.id, {
                action: 'EXTRACT_DEEP_SEARCH_DATA'
            });

            if (result && result.success) {
                this.deepSearchData = result.data;
                this.displayDeepSearchData();
            } else {
                throw new Error(result?.error || 'Failed to extract data from page');
            }
        } catch (error) {
            console.error('Deep search extraction failed:', error);
            this.showStatusMessage('Failed to extract page data. Make sure you\'re on the target page.', 'error');
        }
    }

    async loadExistingRecipe(recipeId: string): Promise<void> {
        try {
            const response = await this.apiRequest(`/scraping-recipes/${recipeId}`);
            if (response.success) {
                this.editingRecipe = response.data;
                this.populateFormWithRecipe(this.editingRecipe);
                this.showVersionWarning();
            } else {
                throw new Error(response.error || 'Failed to load recipe');
            }
        } catch (error) {
            console.error('Failed to load existing recipe:', error);
            this.showStatusMessage('Failed to load existing recipe', 'error');
        }
    }

    populateFormWithRecipe(recipe: any): void {
        // Populate form fields
        (document.getElementById('merchant-name') as HTMLInputElement).value = recipe.merchant?.name || '';
        (document.getElementById('recipe-name') as HTMLInputElement).value = recipe.name || '';
        (document.getElementById('url-pattern') as HTMLInputElement).value = recipe.urlPattern || '';
        (document.getElementById('recipe-description') as HTMLTextAreaElement).value = recipe.description || '';

        // Parse existing selectors into recipe mapping
        if (recipe.parsedRecipeData?.selectors) {
            recipe.parsedRecipeData.selectors.forEach((selector: any) => {
                this.recipeMapping[selector.fieldName] = {
                    selector: selector.selector,
                    extractionMethod: selector.extractionMethod,
                    attributeName: selector.attributeName,
                    regexPattern: selector.regexPattern,
                    isRequired: selector.isRequired
                };
            });
        }
    }

    setupEventListeners(): void {
        // Action buttons
        document.getElementById('save-recipe-btn')!.addEventListener('click', () => this.handleSaveRecipe());
        document.getElementById('test-recipe-btn')!.addEventListener('click', () => this.handleTestRecipe());
        document.getElementById('test-current-btn')!.addEventListener('click', () => this.handleTestCurrent());
        document.getElementById('clear-results-btn')!.addEventListener('click', () => this.handleClearResults());
        document.getElementById('cancel-btn')!.addEventListener('click', () => this.handleCancel());
        document.getElementById('refresh-page-btn')!.addEventListener('click', () => this.handleRefreshPage());

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLButtonElement;
                this.switchTab(target.dataset.tab!);
            });
        });

        // Form validation
        document.getElementById('merchant-name')!.addEventListener('input', () => this.validateForm());
        document.getElementById('recipe-name')!.addEventListener('input', () => this.validateForm());
    }

    displayMappingInterface(): void {
        const container = document.getElementById('field-mappings')!;
        container.innerHTML = '';

        this.FIELD_MAPPINGS.forEach(field => {
            const mapping = this.recipeMapping[field.name] || {};
            
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-mapping';
            fieldDiv.innerHTML = `
                <div class="field-label">
                    ${field.label} ${field.required ? '*' : ''}
                </div>
                <div class="field-input-group">
                    <input type="text" 
                           class="selector-input" 
                           data-field="${field.name}"
                           placeholder="Selector or structured data path"
                           value="${mapping.selector || ''}" />
                    <select class="method-select" data-field="${field.name}">
                        ${this.EXTRACTION_METHODS.map(method => 
                            `<option value="${method.value}" ${mapping.extractionMethod === method.value ? 'selected' : ''}>
                                ${method.label}
                            </option>`
                        ).join('')}
                    </select>
                </div>
                <div class="field-options">
                    <input type="text" 
                           class="option-input" 
                           data-field="${field.name}" 
                           data-option="attribute"
                           placeholder="Attribute name"
                           value="${mapping.attributeName || ''}"
                           style="display: ${mapping.extractionMethod === 'ATTRIBUTE' ? 'block' : 'none'}" />
                    <input type="text" 
                           class="option-input" 
                           data-field="${field.name}" 
                           data-option="regex"
                           placeholder="Regex pattern"
                           value="${mapping.regexPattern || ''}"
                           style="display: ${mapping.extractionMethod === 'REGEX' ? 'block' : 'none'}" />
                </div>
                <div class="field-required">
                    <input type="checkbox" 
                           id="required-${field.name}" 
                           data-field="${field.name}"
                           ${mapping.isRequired || field.required ? 'checked' : ''} />
                    <label for="required-${field.name}">Required field</label>
                </div>
            `;

            // Add event listeners to this field
            const selectorInput = fieldDiv.querySelector('.selector-input') as HTMLInputElement;
            const methodSelect = fieldDiv.querySelector('.method-select') as HTMLSelectElement;
            const attributeInput = fieldDiv.querySelector('[data-option="attribute"]') as HTMLInputElement;
            const regexInput = fieldDiv.querySelector('[data-option="regex"]') as HTMLInputElement;
            const requiredCheckbox = fieldDiv.querySelector('input[type="checkbox"]') as HTMLInputElement;

            selectorInput.addEventListener('input', () => this.updateMapping(field.name, 'selector', selectorInput.value));
            methodSelect.addEventListener('change', () => {
                this.updateMapping(field.name, 'extractionMethod', methodSelect.value);
                this.toggleOptions(fieldDiv, methodSelect.value);
            });
            attributeInput.addEventListener('input', () => this.updateMapping(field.name, 'attributeName', attributeInput.value));
            regexInput.addEventListener('input', () => this.updateMapping(field.name, 'regexPattern', regexInput.value));
            requiredCheckbox.addEventListener('change', () => this.updateMapping(field.name, 'isRequired', requiredCheckbox.checked));

            container.appendChild(fieldDiv);
        });
    }

    displayDeepSearchData(): void {
        if (!this.deepSearchData) return;

        this.switchTab(this.currentTab);
    }

    switchTab(tab: string): void {
        this.currentTab = tab;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tab);
        });

        // Update content
        const content = document.getElementById('deep-search-content')!;
        if (!this.deepSearchData) {
            content.textContent = 'No structured data available';
            return;
        }

        let data;
        switch (tab) {
            case 'jsonld':
                data = this.deepSearchData.jsonLd;
                break;
            case 'dataLayer':
                data = this.deepSearchData.dataLayer;
                break;
            case 'meta':
                data = this.deepSearchData.meta;
                break;
            case 'digitalData':
                data = this.deepSearchData.digitalData;
                break;
            default:
                data = {};
        }

        if (Array.isArray(data) && data.length === 0) {
            content.textContent = `No ${tab} data found`;
        } else if (Object.keys(data).length === 0) {
            content.textContent = `No ${tab} data found`;
        } else {
            this.renderStructuredData(content, data, tab);
        }
    }

    renderStructuredData(container: HTMLElement, data: any, prefix: string = ''): void {
        container.innerHTML = '';
        
        const createClickableItem = (path: string, value: any) => {
            const item = document.createElement('div');
            item.className = 'structured-data-item';
            item.innerHTML = `
                <div class="data-path">${path}</div>
                <div class="data-value">${String(value).substring(0, 100)}${String(value).length > 100 ? '...' : ''}</div>
            `;
            item.addEventListener('click', () => this.selectStructuredDataPath(path));
            return item;
        };

        const traverse = (obj: any, path: string = prefix) => {
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    const currentPath = `${path}[${index}]`;
                    if (typeof item === 'object' && item !== null) {
                        traverse(item, currentPath);
                    } else {
                        container.appendChild(createClickableItem(currentPath, item));
                    }
                });
            } else if (typeof obj === 'object' && obj !== null) {
                Object.entries(obj).forEach(([key, value]) => {
                    const currentPath = path ? `${path}.${key}` : key;
                    if (typeof value === 'object' && value !== null) {
                        traverse(value, currentPath);
                    } else {
                        container.appendChild(createClickableItem(currentPath, value));
                    }
                });
            }
        };

        traverse(data);
    }

    selectStructuredDataPath(path: string): void {
        // Find the currently focused input or the first empty required field
        let targetInput = document.activeElement as HTMLInputElement;
        if (!targetInput || !targetInput.classList.contains('selector-input')) {
            // Find first empty required field
            const requiredFields = this.FIELD_MAPPINGS.filter(f => f.required);
            for (const field of requiredFields) {
                const input = document.querySelector(`[data-field="${field.name}"].selector-input`) as HTMLInputElement;
                if (input && !input.value) {
                    targetInput = input;
                    break;
                }
            }
        }

        if (targetInput && targetInput.classList.contains('selector-input')) {
            const fieldName = targetInput.dataset.field!;
            targetInput.value = path;
            
            // Set extraction method to STRUCTURED_DATA
            const methodSelect = document.querySelector(`[data-field="${fieldName}"].method-select`) as HTMLSelectElement;
            methodSelect.value = 'STRUCTURED_DATA';
            
            // Update mapping
            this.updateMapping(fieldName, 'selector', path);
            this.updateMapping(fieldName, 'extractionMethod', 'STRUCTURED_DATA');
            
            // Update options visibility
            const fieldDiv = targetInput.closest('.field-mapping')!;
            this.toggleOptions(fieldDiv, 'STRUCTURED_DATA');
            
            this.validateForm();
        }
    }

    updateMapping(fieldName: string, property: string, value: any): void {
        if (!this.recipeMapping[fieldName]) {
            this.recipeMapping[fieldName] = {
                selector: '',
                extractionMethod: 'TEXT'
            };
        }
        (this.recipeMapping[fieldName] as any)[property] = value;
        this.validateForm();
    }

    toggleOptions(fieldDiv: Element, method: string): void {
        const attributeInput = fieldDiv.querySelector('[data-option="attribute"]') as HTMLInputElement;
        const regexInput = fieldDiv.querySelector('[data-option="regex"]') as HTMLInputElement;
        
        attributeInput.style.display = method === 'ATTRIBUTE' ? 'block' : 'none';
        regexInput.style.display = method === 'REGEX' ? 'block' : 'none';
    }

    validateForm(): void {
        const merchantName = (document.getElementById('merchant-name') as HTMLInputElement).value.trim();
        const recipeName = (document.getElementById('recipe-name') as HTMLInputElement).value.trim();
        
        // Check required fields have selectors
        const requiredFields = this.FIELD_MAPPINGS.filter(f => f.required);
        const hasRequiredSelectors = requiredFields.every(field => 
            this.recipeMapping[field.name]?.selector?.trim()
        );

        const saveBtn = document.getElementById('save-recipe-btn') as HTMLButtonElement;
        saveBtn.disabled = !merchantName || !recipeName || !hasRequiredSelectors;
    }

    async handleTestCurrent(): Promise<void> {
        try {
            // Get current tab for testing
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: false });
            if (!tab?.id) {
                throw new Error('No active tab found');
            }

            // Build test recipe from current mappings
            const testRecipe = this.buildRecipeFromMappings();
            
            // Send test message
            const result = await chrome.tabs.sendMessage(tab.id, {
                action: 'TEST_RECIPE',
                recipe: testRecipe
            });

            if (result && result.success) {
                this.displayTestResults(result.data);
            } else {
                throw new Error(result?.error || 'Test failed');
            }
        } catch (error) {
            console.error('Test failed:', error);
            this.showStatusMessage(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    buildRecipeFromMappings(): any {
        const selectors = Object.entries(this.recipeMapping)
            .filter(([_, mapping]) => mapping.selector.trim())
            .map(([fieldName, mapping]) => ({
                fieldName,
                selector: mapping.selector,
                extractionMethod: mapping.extractionMethod,
                attributeName: mapping.attributeName || null,
                regexPattern: mapping.regexPattern || null,
                isRequired: mapping.isRequired || false,
                order: 0
            }));

        return {
            id: 'test-recipe',
            name: 'Test Recipe',
            parsedRecipeData: {
                selectors
            }
        };
    }

    displayTestResults(results: any): void {
        const content = document.getElementById('test-results-content')!;
        content.textContent = JSON.stringify(results, null, 2);
    }

    async handleTestRecipe(): Promise<void> {
        // Same as test current for now
        await this.handleTestCurrent();
    }

    async handleSaveRecipe(): Promise<void> {
        try {
            const merchantName = (document.getElementById('merchant-name') as HTMLInputElement).value.trim();
            const recipeName = (document.getElementById('recipe-name') as HTMLInputElement).value.trim();
            const urlPattern = (document.getElementById('url-pattern') as HTMLInputElement).value.trim() || this.generateUrlPattern();
            const description = (document.getElementById('recipe-description') as HTMLTextAreaElement).value.trim();
            const changeLog = (document.getElementById('change-log') as HTMLTextAreaElement).value.trim();

            // First, find or create merchant
            let merchantId = await this.findOrCreateMerchant(merchantName);

            // Build selectors array
            const selectors = Object.entries(this.recipeMapping)
                .filter(([_, mapping]) => mapping.selector.trim())
                .map(([fieldName, mapping], index) => ({
                    fieldName,
                    selector: mapping.selector,
                    extractionMethod: mapping.extractionMethod,
                    attributeName: mapping.attributeName || null,
                    regexPattern: mapping.regexPattern || null,
                    isRequired: mapping.isRequired || false,
                    order: index
                }));

            const recipeData = {
                name: recipeName,
                merchantId,
                pageTypes: ['PRODUCT_PAGE'],
                urlPattern,
                description: description || null,
                changeLog: changeLog || null,
                selectors
            };

            let response;
            if (this.editingRecipe) {
                // Update existing recipe
                response = await this.apiRequest(`/scraping-recipes/${this.editingRecipe.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(recipeData)
                });
            } else {
                // Create new recipe
                response = await this.apiRequest('/scraping-recipes', {
                    method: 'POST',
                    body: JSON.stringify(recipeData)
                });
            }

            if (response.success) {
                this.showStatusMessage(
                    this.editingRecipe ? 'Recipe updated successfully!' : 'Recipe created successfully!', 
                    'success'
                );
                
                // Close after a delay
                setTimeout(() => {
                    window.close();
                }, 2000);
            } else {
                throw new Error(response.error || 'Failed to save recipe');
            }
        } catch (error) {
            console.error('Save failed:', error);
            this.showStatusMessage(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    async findOrCreateMerchant(name: string): Promise<string> {
        // Try to find existing merchant first
        const searchResponse = await this.apiRequest(`/merchants?search=${encodeURIComponent(name)}`);
        if (searchResponse.success && searchResponse.data.length > 0) {
            return searchResponse.data[0].id;
        }

        // Create new merchant
        const createResponse = await this.apiRequest('/merchants', {
            method: 'POST',
            body: JSON.stringify({
                name,
                website: new URL(this.currentUrl).origin
            })
        });

        if (createResponse.success) {
            return createResponse.data.id;
        }

        throw new Error('Failed to create merchant');
    }

    generateUrlPattern(): string {
        try {
            const url = new URL(this.currentUrl);
            const pathname = url.pathname;
            
            // Simple pattern generation - replace IDs and specific product identifiers with wildcards
            return pathname
                .replace(/\/\d+/g, '/[^/]+')
                .replace(/\/[a-zA-Z0-9-_]+\.html?$/i, '/[^/]+\\.html?$')
                .replace(/\/$/, '/?$') + '$';
        } catch {
            return '.*';
        }
    }

    handleClearResults(): void {
        const content = document.getElementById('test-results-content')!;
        content.textContent = '';
    }

    handleCancel(): void {
        if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
            window.close();
        }
    }

    async handleRefreshPage(): Promise<void> {
        await this.extractDeepSearchData();
        this.showStatusMessage('Page data refreshed', 'success');
    }

    showVersionWarning(): void {
        document.getElementById('version-warning')!.classList.remove('hidden');
    }

    hideLoading(): void {
        document.getElementById('loading-section')!.classList.add('hidden');
        document.getElementById('main-interface')!.classList.remove('hidden');
    }

    setupEnvironmentIndicator(): void {
        const envIndicator = document.getElementById('env-indicator')!;
        const isDev = this.API_BASE_URL.includes('localhost');
        envIndicator.textContent = isDev ? 'DEV' : 'PROD';
        envIndicator.className = `environment-indicator ${isDev ? 'dev' : 'prod'}`;
    }

    showStatusMessage(message: string, type: 'success' | 'error' | 'info'): void {
        const statusDiv = document.getElementById('status-message')!;
        statusDiv.textContent = message;
        statusDiv.className = `status-message ${type}`;
        statusDiv.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 5000);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RecipeBuilder();
});