import puppeteer, { Browser, Page, ElementHandle, LaunchOptions } from 'puppeteer';

export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  timeout?: number;
  userAgent?: string;
  slowMo?: number;
  devtools?: boolean;
}

export interface PageNavigationOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  timeout?: number;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  text?: string;
  href?: string;
  src?: string;
  value?: string;
  selector: string;
  isVisible: boolean;
  isClickable: boolean;
  isInput: boolean;
  isButton: boolean;
  isLink: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  fields: ElementInfo[];
  submitButtons: ElementInfo[];
}

export interface PageAnalysis {
  url: string;
  title: string;
  forms: FormInfo[];
  interactiveElements: ElementInfo[];
  links: ElementInfo[];
  images: ElementInfo[];
  loadTime: number;
  errors: string[];
}

export class PuppeteerService {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private config: Required<BrowserConfig>;
  private isInitializing: boolean = false;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      timeout: config.timeout ?? 30000,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      slowMo: config.slowMo ?? 0,
      devtools: config.devtools ?? false
    };
    this.validateConfig();
  }

  private validateConfig(): void {
    if (this.config.timeout < 1000 || this.config.timeout > 300000) {
      throw new Error('Timeout must be between 1000ms and 300000ms');
    }
    if (this.config.viewport.width < 320 || this.config.viewport.height < 240) {
      throw new Error('Viewport dimensions must be at least 320x240');
    }
    if (this.config.slowMo < 0 || this.config.slowMo > 5000) {
      throw new Error('SlowMo must be between 0ms and 5000ms');
    }
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    if (this.isInitializing) {
      // Wait for initialization to complete
      while (this.isInitializing && !this.browser) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;

    try {
      const launchOptions: LaunchOptions = {
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        devtools: this.config.devtools,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      };

      this.browser = await puppeteer.launch(launchOptions);
      console.log('Puppeteer browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Puppeteer browser:', error);
      throw new Error(`Browser initialization failed: ${error}`);
    } finally {
      this.isInitializing = false;
    }
  }

  async createPage(pageId: string): Promise<Page> {
    if (!this.browser) {
      await this.initialize();
    }

    if (this.pages.has(pageId)) {
      return this.pages.get(pageId)!;
    }

    const page = await this.browser!.newPage();
    
    // Set viewport
    await page.setViewport(this.config.viewport);
    
    // Set user agent
    await page.setUserAgent(this.config.userAgent);
    
    // Set default timeout
    page.setDefaultTimeout(this.config.timeout);
    
    // Enable request interception for better control
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      // Block unnecessary resources to speed up page loads
      const resourceType = request.resourceType();
      if (['image', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Store page reference
    this.pages.set(pageId, page);
    
    return page;
  }

  async navigateToUrl(pageId: string, url: string, options: PageNavigationOptions = {}): Promise<PageAnalysis> {
    const startTime = Date.now();
    const page = await this.createPage(pageId);
    const errors: string[] = [];

    try {
      const navigationOptions = {
        waitUntil: options.waitUntil || 'networkidle2' as const,
        timeout: options.timeout || this.config.timeout
      };

      const response = await page.goto(url, navigationOptions);
      
      if (!response) {
        throw new Error('Navigation failed - no response received');
      }

      if (!response.ok()) {
        errors.push(`HTTP ${response.status()}: ${response.statusText()}`);
      }

      // Wait for page to be fully loaded
      await this.waitForLoadState(page, 'domcontentloaded');
      
      const loadTime = Date.now() - startTime;
      
      // Analyze the page
      const analysis = await this.analyzePage(page, url, loadTime, errors);
      
      return analysis;
    } catch (error) {
      errors.push(`Navigation error: ${error}`);
      const loadTime = Date.now() - startTime;
      
      return {
        url,
        title: '',
        forms: [],
        interactiveElements: [],
        links: [],
        images: [],
        loadTime,
        errors
      };
    }
  }

  private async analyzePage(page: Page, url: string, loadTime: number, errors: string[]): Promise<PageAnalysis> {
    try {
      const title = await page.title();
      
      // Analyze forms
      const forms = await this.analyzeForms(page);
      
      // Analyze interactive elements
      const interactiveElements = await this.analyzeInteractiveElements(page);
      
      // Analyze links
      const links = await this.analyzeLinks(page);
      
      // Analyze images
      const images = await this.analyzeImages(page);

      return {
        url,
        title,
        forms,
        interactiveElements,
        links,
        images,
        loadTime,
        errors
      };
    } catch (error) {
      errors.push(`Page analysis error: ${error}`);
      return {
        url,
        title: '',
        forms: [],
        interactiveElements: [],
        links: [],
        images: [],
        loadTime,
        errors
      };
    }
  }

  private async analyzeForms(page: Page): Promise<FormInfo[]> {
    return await page.evaluate(() => {
      const forms = Array.from(document.querySelectorAll('form'));
      
      return forms.map((form, index) => {
        const selector = `form:nth-of-type(${index + 1})`;
        
        // Get form attributes
        const action = form.getAttribute('action') || undefined;
        const method = form.getAttribute('method') || undefined;
        
        // Find form fields
        const fieldElements = Array.from(form.querySelectorAll('input, textarea, select'));
        const fields = fieldElements.map((element, fieldIndex) => {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          
          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            name: (element as HTMLInputElement).name || undefined,
            type: (element as HTMLInputElement).type || undefined,
            placeholder: (element as HTMLInputElement).placeholder || undefined,
            text: element.textContent?.trim() || undefined,
            value: (element as HTMLInputElement).value || undefined,
            selector: `${selector} ${element.tagName.toLowerCase()}:nth-of-type(${fieldIndex + 1})`,
            isVisible,
            isClickable: !element.hasAttribute('disabled'),
            isInput: ['input', 'textarea', 'select'].includes(element.tagName.toLowerCase()),
            isButton: element.tagName.toLowerCase() === 'button' || (element as HTMLInputElement).type === 'submit',
            isLink: false,
            boundingBox: isVisible ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            } : undefined
          };
        });
        
        // Find submit buttons
        const submitElements = Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
        const submitButtons = submitElements.map((element, buttonIndex) => {
          const rect = element.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          
          return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || undefined,
            className: element.className || undefined,
            type: (element as HTMLInputElement).type || undefined,
            text: element.textContent?.trim() || (element as HTMLInputElement).value || undefined,
            value: (element as HTMLInputElement).value || undefined,
            selector: `${selector} ${element.tagName.toLowerCase()}[type="submit"]:nth-of-type(${buttonIndex + 1})`,
            isVisible,
            isClickable: !element.hasAttribute('disabled'),
            isInput: false,
            isButton: true,
            isLink: false,
            boundingBox: isVisible ? {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            } : undefined
          };
        });
        
        return {
          selector,
          action,
          method,
          fields,
          submitButtons
        };
      });
    });
  }

  private async analyzeInteractiveElements(page: Page): Promise<ElementInfo[]> {
    return await page.evaluate(() => {
      const interactiveSelectors = [
        'button:not([type="submit"])',
        'input[type="button"]',
        'input[type="reset"]',
        '[onclick]',
        '[role="button"]',
        '.btn',
        '.button'
      ];
      
      const elements: Element[] = [];
      interactiveSelectors.forEach(selector => {
        elements.push(...Array.from(document.querySelectorAll(selector)));
      });
      
      // Remove duplicates
      const uniqueElements = Array.from(new Set(elements));
      
      return uniqueElements.map((element, index) => {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        return {
          tagName: element.tagName.toLowerCase(),
          id: element.id || undefined,
          className: element.className || undefined,
          name: (element as HTMLInputElement).name || undefined,
          type: (element as HTMLInputElement).type || undefined,
          text: element.textContent?.trim() || undefined,
          value: (element as HTMLInputElement).value || undefined,
          selector: `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`,
          isVisible,
          isClickable: !element.hasAttribute('disabled'),
          isInput: false,
          isButton: true,
          isLink: false,
          boundingBox: isVisible ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          } : undefined
        };
      });
    });
  }

  private async analyzeLinks(page: Page): Promise<ElementInfo[]> {
    return await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      
      return links.map((link, index) => {
        const rect = link.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        return {
          tagName: 'a',
          id: link.id || undefined,
          className: link.className || undefined,
          text: link.textContent?.trim() || undefined,
          href: link.getAttribute('href') || undefined,
          selector: `a:nth-of-type(${index + 1})`,
          isVisible,
          isClickable: true,
          isInput: false,
          isButton: false,
          isLink: true,
          boundingBox: isVisible ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          } : undefined
        };
      });
    });
  }

  private async analyzeImages(page: Page): Promise<ElementInfo[]> {
    return await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'));
      
      return images.map((img, index) => {
        const rect = img.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        return {
          tagName: 'img',
          id: img.id || undefined,
          className: img.className || undefined,
          src: img.src || undefined,
          text: img.alt || undefined,
          selector: `img:nth-of-type(${index + 1})`,
          isVisible,
          isClickable: false,
          isInput: false,
          isButton: false,
          isLink: false,
          boundingBox: isVisible ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
          } : undefined
        };
      });
    });
  }

  async waitForElement(pageId: string, selector: string, timeout?: number): Promise<ElementHandle | null> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      return await page.waitForSelector(selector, { 
        timeout: timeout || this.config.timeout,
        visible: true
      });
    } catch (error) {
      console.error(`Element ${selector} not found within timeout:`, error);
      return null;
    }
  }

  async clickElement(pageId: string, selector: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      await page.click(selector);
      return true;
    } catch (error) {
      console.error(`Failed to click element ${selector}:`, error);
      return false;
    }
  }

  async typeText(pageId: string, selector: string, text: string, options?: { delay?: number }): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      await page.type(selector, text, { delay: options?.delay || 0 });
      return true;
    } catch (error) {
      console.error(`Failed to type in element ${selector}:`, error);
      return false;
    }
  }

  async screenshot(pageId: string, options?: { fullPage?: boolean; path?: string }): Promise<Buffer> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    const screenshotOptions: any = {
      fullPage: options?.fullPage || false,
      type: 'png'
    };

    if (options?.path) {
      screenshotOptions.path = options.path;
    }

    const result = await page.screenshot(screenshotOptions);
    return Buffer.from(result as unknown as Uint8Array);
  }

  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page) {
      await page.close();
      this.pages.delete(pageId);
    }
  }

  async close(): Promise<void> {
    // Close all pages
    const pageEntries = Array.from(this.pages.entries());
    for (const [pageId, page] of pageEntries) {
      await page.close();
    }
    this.pages.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async getPagesCount(): Promise<number> {
    return this.pages.size;
  }

  async isPageActive(pageId: string): Promise<boolean> {
    return this.pages.has(pageId);
  }

  private async waitForLoadState(page: Page, state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void> {
    try {
      switch (state) {
        case 'load':
          await page.waitForFunction(() => document.readyState === 'complete');
          break;
        case 'domcontentloaded':
          await page.waitForFunction(() => document.readyState !== 'loading');
          break;
        case 'networkidle':
          // Wait for network to be idle - no new requests for 500ms
          await new Promise(resolve => {
            let timeoutId: NodeJS.Timeout;
            const resetTimeout = () => {
              clearTimeout(timeoutId);
              timeoutId = setTimeout(resolve, 500);
            };
            
            page.on('request', resetTimeout);
            page.on('response', resetTimeout);
            resetTimeout();
            
            // Cleanup listeners after 10 seconds maximum
            setTimeout(() => {
              page.off('request', resetTimeout);
              page.off('response', resetTimeout);
              clearTimeout(timeoutId);
              resolve(undefined);
            }, 10000);
          });
          break;
      }
    } catch (error) {
      console.warn(`Failed to wait for load state ${state}:`, error);
      // Continue anyway as this is not critical
    }
  }

  async selectOption(pageId: string, selector: string, value: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      await page.select(selector, value);
      return true;
    } catch (error) {
      console.error(`Failed to select option ${value} in element ${selector}:`, error);
      return false;
    }
  }

  async checkCheckbox(pageId: string, selector: string, checked: boolean = true): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      const checkbox = await page.$(selector);
      if (!checkbox) {
        throw new Error(`Checkbox ${selector} not found`);
      }

      const isChecked = await page.evaluate((el) => (el as HTMLInputElement).checked, checkbox);
      if (isChecked !== checked) {
        await page.click(selector);
      }
      return true;
    } catch (error) {
      console.error(`Failed to set checkbox ${selector} to ${checked}:`, error);
      return false;
    }
  }

  async uploadFile(pageId: string, selector: string, filePath: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      const input = await page.$(selector);
      if (!input) {
        throw new Error(`File input ${selector} not found`);
      }

      await (input as ElementHandle<HTMLInputElement>).uploadFile(filePath);
      return true;
    } catch (error) {
      console.error(`Failed to upload file to ${selector}:`, error);
      return false;
    }
  }

  async evaluateScript(pageId: string, script: string): Promise<any> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      return await page.evaluate(script);
    } catch (error) {
      console.error(`Failed to evaluate script:`, error);
      throw error;
    }
  }

  async waitForNavigation(pageId: string, options?: { timeout?: number; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' }): Promise<void> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      await page.waitForNavigation({
        timeout: options?.timeout || this.config.timeout,
        waitUntil: options?.waitUntil || 'networkidle2'
      });
    } catch (error) {
      console.error(`Navigation wait failed:`, error);
      throw error;
    }
  }

  async getElementText(pageId: string, selector: string): Promise<string | null> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      const element = await page.$(selector);
      if (!element) {
        return null;
      }

      return await page.evaluate(el => el.textContent?.trim() || '', element);
    } catch (error) {
      console.error(`Failed to get text from element ${selector}:`, error);
      return null;
    }
  }

  async getElementAttribute(pageId: string, selector: string, attribute: string): Promise<string | null> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      const element = await page.$(selector);
      if (!element) {
        return null;
      }

      return await page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
    } catch (error) {
      console.error(`Failed to get attribute ${attribute} from element ${selector}:`, error);
      return null;
    }
  }

  async scrollToElement(pageId: string, selector: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    try {
      const element = await page.$(selector);
      if (!element) {
        return false;
      }

      await page.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), element);
      return true;
    } catch (error) {
      console.error(`Failed to scroll to element ${selector}:`, error);
      return false;
    }
  }

  async getCurrentUrl(pageId: string): Promise<string> {
    const page = this.pages.get(pageId);
    if (!page) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    return page.url();
  }

  async getBrowserInfo(): Promise<{ version: string; userAgent: string }> {
    if (!this.browser) {
      await this.initialize();
    }

    const version = await this.browser!.version();
    const page = await this.browser!.newPage();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    await page.close();

    return { version, userAgent };
  }

  async getAllPageIds(): Promise<string[]> {
    return Array.from(this.pages.keys());
  }

  async getPageUrl(pageId: string): Promise<string | null> {
    const page = this.pages.get(pageId);
    return page ? page.url() : null;
  }

  async clearCache(pageId: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      return false;
    }

    try {
      await page.evaluateOnNewDocument(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      return true;
    } catch (error) {
      console.error(`Failed to clear cache for page ${pageId}:`, error);
      return false;
    }
  }

  async reloadPage(pageId: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' }): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      return false;
    }

    try {
      await page.reload({
        waitUntil: options?.waitUntil || 'networkidle2',
        timeout: this.config.timeout
      });
      return true;
    } catch (error) {
      console.error(`Failed to reload page ${pageId}:`, error);
      return false;
    }
  }

  async setViewport(pageId: string, viewport: { width: number; height: number }): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) {
      return false;
    }

    try {
      await page.setViewport(viewport);
      return true;
    } catch (error) {
      console.error(`Failed to set viewport for page ${pageId}:`, error);
      return false;
    }
  }

  async isElementVisible(pageId: string, selector: string): Promise<boolean | null> {
    const page = this.pages.get(pageId);
    if (!page) {
      return null;
    }

    try {
      const element = await page.$(selector);
      if (!element) {
        return false;
      }

      return await page.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }, element);
    } catch (error) {
      console.error(`Failed to check visibility of element ${selector}:`, error);
      return null;
    }
  }

  getConfig(): Required<BrowserConfig> {
    return { ...this.config };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const details: any = {
        browserInitialized: !!this.browser,
        pagesCount: this.pages.size,
        isInitializing: this.isInitializing
      };

      if (this.browser) {
        try {
          details.browserVersion = await this.browser.version();
          details.browserConnected = this.browser.isConnected();
        } catch (error) {
          details.browserError = (error as Error).message;
        }
      }

      // Test creating a page if browser is available
      if (this.browser && this.browser.isConnected()) {
        const testPageId = `health_check_${Date.now()}`;
        try {
          const testPage = await this.createPage(testPageId);
          await testPage.goto('data:text/html,<html><body>Health Check</body></html>', { waitUntil: 'load', timeout: 5000 });
          await this.closePage(testPageId);
          details.pageCreationTest = 'passed';
        } catch (error) {
          details.pageCreationTest = 'failed';
          details.pageCreationError = (error as Error).message;
        }
      }

      const healthy = details.browserInitialized && 
                     details.browserConnected !== false && 
                     details.pageCreationTest !== 'failed';

      return { healthy, details };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: (error as Error).message,
          browserInitialized: !!this.browser,
          pagesCount: this.pages.size
        }
      };
    }
  }
}