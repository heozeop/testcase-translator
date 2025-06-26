import puppeteer, { Browser, Page, ElementHandle, PuppeteerLaunchOptions } from 'puppeteer';

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

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      viewport: config.viewport ?? { width: 1920, height: 1080 },
      timeout: config.timeout ?? 30000,
      userAgent: config.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      slowMo: config.slowMo ?? 0,
      devtools: config.devtools ?? false
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    const launchOptions: PuppeteerLaunchOptions = {
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
        '--disable-default-apps'
      ]
    };

    try {
      this.browser = await puppeteer.launch(launchOptions);
      console.log('Puppeteer browser initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Puppeteer browser:', error);
      throw new Error(`Browser initialization failed: ${error}`);
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
      await page.waitForLoadState('domcontentloaded');
      
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

    return await page.screenshot({
      fullPage: options?.fullPage || false,
      path: options?.path,
      type: 'png'
    }) as Buffer;
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
    for (const [pageId, page] of this.pages) {
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
}

// Helper function to wait for page load state
declare global {
  interface Page {
    waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
  }
}

// Extend Page prototype with waitForLoadState method
if (typeof globalThis !== 'undefined' && !globalThis.window) {
  // Server-side environment
}