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
        { value: 'TEXT', label: 'CSS Selector' },
        { value: 'XPATH', label: 'XPath' },
        { value: 'JS_PATH', label: 'JS Path' }
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
            // Get data from chrome storage (set by popup)
            const result = await chrome.storage.local.get(['deepSearchData', 'recipeBuilderUrl', 'authToken', 'editingRecipe']);
            
            if (!result.deepSearchData || !result.recipeBuilderUrl) {
                this.showStatusMessage('No recipe data found. Please start from the extension popup on a merchant page.', 'error');
                this.hideLoading();
                return;
            }

            this.deepSearchData = result.deepSearchData;
            this.authToken = result.authToken;
            this.currentUrl = result.recipeBuilderUrl;
            this.editingRecipe = result.editingRecipe;

            if (!this.authToken) {
                this.showStatusMessage('Authentication required', 'error');
                this.hideLoading();
                return;
            }

            // Verify admin access
            const userResponse = await this.apiRequest('/auth/me');
            if (!userResponse.success || userResponse.data.role !== 'ADMIN') {
                this.showStatusMessage('Admin access required for recipe builder', 'error');
                this.hideLoading();
                return;
            }

            // Update URL display
            document.getElementById('page-url')!.textContent = this.currentUrl;

            // If editing existing recipe, populate form
            if (this.editingRecipe) {
                this.populateFormWithRecipe(this.editingRecipe);
                this.showVersionWarning();
            }

            // Initialize the interface with loaded data
            this.displayMappingInterface();
            this.displayDeepSearchData();
            this.hideLoading();

            console.log('Recipe builder loaded with data:', {
                url: this.currentUrl,
                hasDeepSearchData: !!this.deepSearchData,
                isEditing: !!this.editingRecipe
            });

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

            // Handle both wrapped and direct responses
            if (data.success !== undefined) {
                return data; // Already wrapped
            } else {
                // Direct response, wrap it
                return {
                    success: true,
                    data: data
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Request failed'
            };
        }
    }


    async loadExistingRecipe(recipeId: string): Promise<void> {
        try {
            const response = await this.apiRequest(`/scraping-recipes/${recipeId}`);
            if (!response || response.error) {
                throw new Error(response?.error || 'Failed to load recipe');
            }
            // Handle both wrapped and direct responses
            this.editingRecipe = response.data || response;
            this.populateFormWithRecipe(this.editingRecipe);
            this.showVersionWarning();
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
        document.getElementById('clear-mappings-btn')!.addEventListener('click', () => this.handleClearMappings());
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
            selectorInput.addEventListener('click', () => {
                this.lastClickedInput = selectorInput;
                console.log('Clicked on input for field:', field.name);
            });
            selectorInput.addEventListener('focus', () => {
                this.lastClickedInput = selectorInput;
                console.log('Focused on input for field:', field.name);
            });
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
        let dataPrefix;
        switch (tab) {
            case 'jsonld':
                data = this.deepSearchData.jsonLd;
                dataPrefix = 'jsonLd'; // Use correct case for content script compatibility
                break;
            case 'dataLayer':
                data = this.deepSearchData.dataLayer;
                dataPrefix = 'dataLayers.dataLayer'; // Match content script structure
                break;
            case 'meta':
                data = this.deepSearchData.meta;
                dataPrefix = 'metaTags'; // Match content script structure
                break;
            case 'digitalData':
                data = this.deepSearchData.digitalData;
                dataPrefix = 'dataLayers.digitalData'; // Match content script structure
                break;
            default:
                data = {};
                dataPrefix = '';
        }

        if (Array.isArray(data) && data.length === 0) {
            content.textContent = `No ${tab} data found`;
        } else if (Object.keys(data).length === 0) {
            content.textContent = `No ${tab} data found`;
        } else {
            this.renderStructuredData(content, data, dataPrefix);
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

    private lastClickedInput: HTMLInputElement | null = null;

    selectStructuredDataPath(path: string): void {
        console.log('Clicked structured data path:', path);
        
        // Try different strategies to find the target input:
        // 1. Use the last clicked input if available
        // 2. Use the currently focused input
        // 3. Find the first empty required field
        // 4. Find the first required field (even if it has a value)
        
        let targetInput: HTMLInputElement | null = null;
        
        // Strategy 1: Last clicked input
        if (this.lastClickedInput && document.body.contains(this.lastClickedInput)) {
            targetInput = this.lastClickedInput;
            console.log('Using last clicked input:', targetInput.dataset.field);
        }
        
        // Strategy 2: Currently focused input
        if (!targetInput) {
            const activeElement = document.activeElement as HTMLInputElement;
            if (activeElement && activeElement.classList.contains('selector-input')) {
                targetInput = activeElement;
                console.log('Using focused input:', targetInput.dataset.field);
            }
        }
        
        // Strategy 3: First empty required field
        if (!targetInput) {
            const requiredFields = this.FIELD_MAPPINGS.filter(f => f.required);
            for (const field of requiredFields) {
                const input = document.querySelector(`[data-field="${field.name}"].selector-input`) as HTMLInputElement;
                if (input && !input.value) {
                    targetInput = input;
                    console.log('Using first empty required field:', field.name);
                    break;
                }
            }
        }
        
        // Strategy 4: First required field (even if it has a value)
        if (!targetInput) {
            const requiredFields = this.FIELD_MAPPINGS.filter(f => f.required);
            if (requiredFields.length > 0) {
                const input = document.querySelector(`[data-field="${requiredFields[0].name}"].selector-input`) as HTMLInputElement;
                if (input) {
                    targetInput = input;
                    console.log('Using first required field:', requiredFields[0].name);
                }
            }
        }

        if (targetInput && targetInput.classList.contains('selector-input')) {
            const fieldName = targetInput.dataset.field!;
            console.log('Populating field:', fieldName, 'with path:', path);
            
            targetInput.value = path;
            
            // Set extraction method to STRUCTURED_DATA
            const methodSelect = document.querySelector(`[data-field="${fieldName}"].method-select`) as HTMLSelectElement;
            if (methodSelect) {
                methodSelect.value = 'STRUCTURED_DATA';
                console.log('Set extraction method to STRUCTURED_DATA');
            }
            
            // Update mapping (critical for test functionality)
            this.updateMapping(fieldName, 'selector', path);
            this.updateMapping(fieldName, 'extractionMethod', 'STRUCTURED_DATA');
            
            // Update options visibility
            const fieldDiv = targetInput.closest('.field-mapping')!;
            this.toggleOptions(fieldDiv, 'STRUCTURED_DATA');
            
            // Trigger input events to ensure UI is synced
            targetInput.dispatchEvent(new Event('input', { bubbles: true }));
            methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
            
            this.validateForm();
            
            console.log('Updated mapping for', fieldName, '- current mapping:', this.recipeMapping[fieldName]);
        } else {
            console.log('No suitable target input found');
        }
    }

    updateMapping(fieldName: string, property: string, value: any): void {
        if (!this.recipeMapping[fieldName]) {
            this.recipeMapping[fieldName] = {
                selector: '',
                extractionMethod: 'STRUCTURED_DATA'
            };
        }
        (this.recipeMapping[fieldName] as any)[property] = value;
        this.validateForm();
    }

    toggleOptions(fieldDiv: Element, method: string): void {
        // No special options needed for the current extraction methods
        // Hide any attribute/regex inputs if they exist from previous versions
        const attributeInput = fieldDiv.querySelector('[data-option="attribute"]') as HTMLInputElement;
        const regexInput = fieldDiv.querySelector('[data-option="regex"]') as HTMLInputElement;
        
        if (attributeInput) attributeInput.style.display = 'none';
        if (regexInput) regexInput.style.display = 'none';
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
            // Find the tab with the URL we're building a recipe for
            const tabs = await chrome.tabs.query({ url: this.currentUrl });
            let targetTab = tabs.length > 0 ? tabs[0] : null;
            
            if (!targetTab) {
                // If no exact match, try to find a tab with similar URL pattern
                const allTabs = await chrome.tabs.query({});
                targetTab = allTabs.find(tab => tab.url && tab.url.includes(new URL(this.currentUrl).hostname)) || null;
            }
            
            if (!targetTab?.id) {
                throw new Error('Cannot find the target page tab. Please keep the original page open.');
            }

            // Build test recipe from current mappings
            const testRecipe = this.buildRecipeFromMappings();
            
            if (!testRecipe.parsedRecipeData.selectors || testRecipe.parsedRecipeData.selectors.length === 0) {
                throw new Error('No field mappings configured. Please map at least one field before testing.');
            }
            
            console.log('About to execute script on tab:', targetTab.id);
            console.log('Test recipe:', testRecipe);
            
            // Run extraction test using scripting API
            const response = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: (recipe) => {
                    // This function runs in the page context
                    const results: any = {};
                    
                    if (!recipe.parsedRecipeData?.selectors) {
                        return { error: 'No selectors in recipe' };
                    }
                    
                    recipe.parsedRecipeData.selectors.forEach((selector: any) => {
                        let value = '';
                        try {
                            if (selector.extractionMethod === 'STRUCTURED_DATA') {
                                // Extract structured data
                                const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                                const jsonLdData: any[] = [];
                                jsonLdScripts.forEach(script => {
                                    try {
                                        const content = script.textContent?.trim();
                                        if (content) {
                                            jsonLdData.push(JSON.parse(content));
                                        }
                                    } catch (error) {
                                        console.warn('Failed to parse JSON-LD:', error);
                                    }
                                });

                                const context = {
                                    jsonLd: jsonLdData,
                                    dataLayer: (window as any).dataLayer || [],
                                    meta: (() => {
                                        const metaTags: { [key: string]: string } = {};
                                        const metaElements = document.querySelectorAll('meta[property], meta[name], meta[itemprop]');
                                        metaElements.forEach((meta: Element) => {
                                            const property = meta.getAttribute('property') || 
                                                            meta.getAttribute('name') || 
                                                            meta.getAttribute('itemprop');
                                            const content = meta.getAttribute('content');
                                            if (property && content) {
                                                metaTags[property] = content;
                                            }
                                        });
                                        return metaTags;
                                    })(),
                                    digitalData: (window as any).digitalData || {}
                                };

                                // Evaluate structured data path
                                try {
                                    const parts = selector.selector.split('.');
                                    let current = context;
                                    
                                    for (const part of parts) {
                                        if (part.includes('[') && part.includes(']')) {
                                            const indices = Array.from(part.matchAll(/\[(\d+)\]/g), (match) => parseInt((match as RegExpMatchArray)[1], 10));
                                            const propertyName = part.split('[')[0];
                                            
                                            if (indices.length > 0 && propertyName) {
                                                current = (current as any)[propertyName];
                                                
                                                for (const index of indices) {
                                                    if (Array.isArray(current)) {
                                                        current = current[index];
                                                    } else {
                                                        throw new Error('Expected array');
                                                    }
                                                }
                                            }
                                        } else {
                                            current = (current as any)[part];
                                        }
                                        
                                        if (current === undefined || current === null) {
                                            break;
                                        }
                                    }
                                    
                                    value = current ? String(current) : '';
                                } catch (error) {
                                    value = `Path evaluation error: ${error}`;
                                }
                            } else {
                                // Standard DOM extraction
                                let element: Element | null = null;
                                
                                if (selector.extractionMethod === 'XPATH') {
                                    const xpathResult = document.evaluate(
                                        selector.selector,
                                        document,
                                        null,
                                        XPathResult.FIRST_ORDERED_NODE_TYPE,
                                        null
                                    );
                                    element = xpathResult.singleNodeValue as Element;
                                } else {
                                    element = document.querySelector(selector.selector);
                                }
                                
                                if (element) {
                                    if (selector.extractionMethod === 'ATTRIBUTE' && selector.attributeName) {
                                        value = element.getAttribute(selector.attributeName) || '';
                                    } else {
                                        value = element.textContent?.trim() || '';
                                    }
                                    
                                    // Apply regex if specified
                                    if (selector.regexPattern && value) {
                                        const regex = new RegExp(selector.regexPattern, 'i');
                                        const match = value.match(regex);
                                        value = match ? ((match as RegExpMatchArray)[1] || (match as RegExpMatchArray)[0]) : value;
                                    }
                                }
                            }
                        } catch (error) {
                            value = `Error: ${error}`;
                        }
                        
                        // Apply the same field processing as in content script
                        let processedValue = value || 'Not found';
                        if (value && value !== 'Not found') {
                            switch (selector.fieldName) {
                                case 'PRICE':
                                case 'SALE_PRICE':
                                case 'UNIT_PRICE':
                                    processedValue = String(this.parsePrice(value));
                                    break;
                                case 'CATEGORY':
                                    processedValue = this.sanitizeCategory(value);
                                    break;
                                case 'IMAGE_URL':
                                    processedValue = this.normalizeImageUrl(value);
                                    break;
                                case 'IN_STOCK':
                                    processedValue = String(this.parseBoolean(value));
                                    break;
                                case 'RATING':
                                    const rating = parseFloat(value);
                                    processedValue = isNaN(rating) ? 'Not found' : String(rating);
                                    break;
                                case 'REVIEW_COUNT':
                                    const reviewCount = parseInt(value);
                                    processedValue = isNaN(reviewCount) ? 'Not found' : String(reviewCount);
                                    break;
                                default:
                                    processedValue = value;
                            }
                        }
                        results[selector.fieldName] = processedValue;
                    });
                    
                    return results;
                },
                args: [testRecipe]
            });

            console.log('Script execution response:', response);
            
            if (!response || response.length === 0) {
                throw new Error('No response from script execution');
            }
            
            const result = response[0]?.result;
            console.log('Extracted result:', result);
            
            if (!result) {
                console.error('Full response object:', response[0]);
                throw new Error('No result returned from script execution');
            }
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            this.displayTestResults(result);
        } catch (error) {
            console.error('Test failed:', error);
            this.showStatusMessage(`Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    }

    buildRecipeFromMappings(): any {
        console.log('Building recipe from current mappings:', this.recipeMapping);
        
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

        console.log('Built selectors for testing:', selectors);

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

    handleClearMappings(): void {
        if (confirm('Are you sure you want to clear all field mappings? This action cannot be undone.')) {
            // Clear all input fields in the mapping interface
            document.querySelectorAll('.selector-input').forEach(input => {
                (input as HTMLInputElement).value = '';
            });
            
            document.querySelectorAll('.method-select').forEach(select => {
                (select as HTMLSelectElement).selectedIndex = 0;
            });
            
            document.querySelectorAll('.attribute-input').forEach(input => {
                (input as HTMLInputElement).value = '';
            });
            
            document.querySelectorAll('.regex-input').forEach(input => {
                (input as HTMLInputElement).value = '';
            });
            
            // Reset the recipe mapping object
            this.recipeMapping = {};
            
            // Revalidate the form (will likely disable save button)
            this.validateForm();
            
            this.showStatusMessage('All field mappings cleared', 'info');
        }
    }

    handleCancel(): void {
        if (confirm('Are you sure you want to cancel? Any unsaved changes will be lost.')) {
            window.close();
        }
    }

    async handleRefreshPage(): Promise<void> {
        try {
            this.showStatusMessage('Refreshing page data...', 'info');
            
            // Find the tab with our URL
            const tabs = await chrome.tabs.query({ url: this.currentUrl });
            let targetTab = tabs.length > 0 ? tabs[0] : null;
            
            if (!targetTab) {
                // Try to find by hostname
                const allTabs = await chrome.tabs.query({});
                targetTab = allTabs.find(tab => tab.url && tab.url.includes(new URL(this.currentUrl).hostname)) || null;
            }
            
            if (!targetTab?.id) {
                throw new Error('Cannot find the target page tab. Please keep the original page open.');
            }

            // Extract fresh data using scripting API
            const response = await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: () => {
                    // Extract JSON-LD
                    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
                    const jsonLdData: any[] = [];
                    jsonLdScripts.forEach(script => {
                        try {
                            const content = script.textContent?.trim();
                            if (content) {
                                jsonLdData.push(JSON.parse(content));
                            }
                        } catch (error) {
                            console.warn('Failed to parse JSON-LD:', error);
                        }
                    });

                    // Extract dataLayer and digitalData
                    const dataLayer = (window as any).dataLayer || [];
                    const digitalData = (window as any).digitalData || {};

                    // Extract meta tags
                    const metaTags: { [key: string]: string } = {};
                    const metaElements = document.querySelectorAll('meta[property], meta[name], meta[itemprop]');
                    metaElements.forEach(meta => {
                        const property = meta.getAttribute('property') || 
                                        meta.getAttribute('name') || 
                                        meta.getAttribute('itemprop');
                        const content = meta.getAttribute('content');
                        if (property && content) {
                            metaTags[property] = content;
                        }
                    });

                    return {
                        jsonLd: jsonLdData,
                        dataLayer: dataLayer,
                        meta: metaTags,
                        digitalData: digitalData
                    };
                }
            });

            this.deepSearchData = response[0].result;
            this.displayDeepSearchData();
            this.showStatusMessage('Page data refreshed successfully!', 'success');
            
        } catch (error) {
            console.error('Failed to refresh page data:', error);
            this.showStatusMessage('Failed to refresh page data. Make sure the original page is still open.', 'error');
        }
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

    // Field processing methods (duplicated from content script for test consistency)
    parsePrice(value: string): number | string {
        if (!value) return 'Not found';
        
        // Remove currency symbols, whitespace, and non-numeric characters except . and ,
        const cleaned = value.replace(/[^\d.,]/g, '');
        
        // Handle cases where comma is thousands separator (e.g., "1,299.99")
        // or where comma is decimal separator (e.g., "1299,99")
        let normalizedValue = cleaned;
        
        if (cleaned.includes(',') && cleaned.includes('.')) {
            // Assume comma is thousands separator: "1,299.99" -> "1299.99"
            normalizedValue = cleaned.replace(/,/g, '');
        } else if (cleaned.includes(',') && !cleaned.includes('.')) {
            // Assume comma is decimal separator: "1299,99" -> "1299.99"
            normalizedValue = cleaned.replace(',', '.');
        }
        
        const parsed = parseFloat(normalizedValue);
        
        // Ensure the result is a valid number and round to 2 decimal places
        if (isNaN(parsed) || parsed <= 0) return 'Not found';
        
        return Math.round(parsed * 100) / 100; // Round to 2 decimal places
    }

    sanitizeCategory(value: string): string {
        if (!value) return value;
        
        // Split by line breaks, trim each line, filter out empty lines, then rejoin
        return value
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n');
    }

    normalizeImageUrl(value: string): string {
        if (!value) return 'Not found';
        
        try {
            const url = new URL(value, window.location.origin);
            return url.toString();
        } catch {
            return value;
        }
    }

    parseBoolean(value: string): boolean | string {
        if (!value) return 'Not found';
        
        const normalized = value.toLowerCase().trim();
        if (['true', 'yes', '1', 'available', 'in stock'].includes(normalized)) {
            return true;
        }
        if (['false', 'no', '0', 'unavailable', 'out of stock'].includes(normalized)) {
            return false;
        }
        
        return 'Not found';
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new RecipeBuilder();
});