import { PuppeteerService, BrowserConfig, PageAnalysis } from './PuppeteerService';
import { PageExplorationService, ExplorationResult, ExplorationOptions } from './PageExplorationService';
import { FormAnalysisService, FormAnalysisResult } from './FormAnalysisService';
import { DynamicContentService, DynamicContentResult } from './DynamicContentService';
import { ExplorationErrorHandler, ExplorationError, ErrorContext } from './ExplorationErrorHandler';

export interface UrlExplorationRequest {
  url: string;
  options?: UrlExplorationOptions;
  sessionId?: string;
}

export interface UrlExplorationOptions extends ExplorationOptions {
  browserConfig?: BrowserConfig;
  enableFormAnalysis?: boolean;
  enableDynamicContent?: boolean;
  generateTestCases?: boolean;
  includeScreenshots?: boolean;
  maxPages?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  crawlDepth?: number;
  respectRobotsTxt?: boolean;
  userAgent?: string;
  sessionTimeout?: number;
}

export interface UrlExplorationResult {
  sessionId: string;
  url: string;
  startTime: number;
  endTime: number;
  duration: number;
  success: boolean;
  
  // Core analysis results
  pageAnalysis: PageAnalysis;
  explorationResult: ExplorationResult;
  formAnalysis: FormAnalysisResult[];
  dynamicContent?: DynamicContentResult;
  
  // Generated artifacts
  testCases?: TestCase[];
  screenshots?: string[];
  sitemap?: SitemapEntry[];
  
  // Error handling
  errors: ExplorationError[];
  warnings: string[];
  
  // Metadata
  metadata: {
    browserVersion?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    networkConditions?: string;
    performance?: PerformanceMetrics;
  };
}

export interface TestCase {
  id: string;
  name: string;
  description: string;
  type: 'navigation' | 'form' | 'interaction' | 'validation';
  priority: 'high' | 'medium' | 'low';
  steps: TestStep[];
  expectedResults: string[];
  preconditions: string[];
  tags: string[];
}

export interface TestStep {
  stepNumber: number;
  action: string;
  target: string;
  value?: string;
  description: string;
  waitConditions?: string[];
  validations?: string[];
}

export interface SitemapEntry {
  url: string;
  title: string;
  depth: number;
  parent?: string;
  children: string[];
  lastExplored: number;
  status: 'success' | 'failed' | 'pending';
}

export interface PerformanceMetrics {
  loadTime: number;
  timeToInteractive: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  cumulativeLayoutShift: number;
  resourceCount: number;
  totalResourceSize: number;
}

export class UrlExplorationEngine {
  private puppeteerService: PuppeteerService;
  private pageExplorationService: PageExplorationService;
  private formAnalysisService: FormAnalysisService;
  private dynamicContentService: DynamicContentService;
  private errorHandler: ExplorationErrorHandler;
  
  private activeSessions: Map<string, UrlExplorationResult> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(browserConfig?: BrowserConfig) {
    this.puppeteerService = new PuppeteerService(browserConfig);
    this.pageExplorationService = new PageExplorationService(this.puppeteerService);
    this.formAnalysisService = new FormAnalysisService();
    this.dynamicContentService = new DynamicContentService(this.puppeteerService);
    this.errorHandler = new ExplorationErrorHandler();
  }

  async exploreUrl(request: UrlExplorationRequest): Promise<UrlExplorationResult> {
    const sessionId = request.sessionId || this.generateSessionId();
    const startTime = Date.now();
    
    // Initialize result structure
    const result: UrlExplorationResult = {
      sessionId,
      url: request.url,
      startTime,
      endTime: 0,
      duration: 0,
      success: false,
      pageAnalysis: {
        url: request.url,
        title: '',
        forms: [],
        interactiveElements: [],
        links: [],
        images: [],
        loadTime: 0,
        errors: []
      },
      explorationResult: {
        pageAnalysis: {
          url: request.url,
          title: '',
          forms: [],
          interactiveElements: [],
          links: [],
          images: [],
          loadTime: 0,
          errors: []
        },
        explorationSteps: [],
        discoveredElements: [],
        interactionSuggestions: [],
        errors: []
      },
      formAnalysis: [],
      errors: [],
      warnings: [],
      metadata: {}
    };

    // Store session
    this.activeSessions.set(sessionId, result);
    
    // Set session timeout
    this.setSessionTimeout(sessionId, request.options?.sessionTimeout || 300000); // 5 minutes default

    try {
      // Initialize browser if needed
      await this.puppeteerService.initialize();
      
      // Update metadata
      result.metadata = await this.collectMetadata(request.options);
      
      // Step 1: Basic page exploration
      console.log(`Starting exploration of ${request.url}`);
      result.explorationResult = await this.pageExplorationService.exploreUrl(
        request.url,
        request.options || {}
      );
      
      result.pageAnalysis = result.explorationResult.pageAnalysis;
      
      // Step 2: Form analysis (if enabled)
      if (request.options?.enableFormAnalysis !== false && result.pageAnalysis.forms.length > 0) {
        console.log(`Analyzing ${result.pageAnalysis.forms.length} forms`);
        result.formAnalysis = await this.formAnalysisService.analyzeForms(result.pageAnalysis.forms);
      }
      
      // Step 3: Dynamic content analysis (if enabled)
      if (request.options?.enableDynamicContent) {
        console.log('Analyzing dynamic content');
        const pageId = `exploration-${sessionId}`;
        result.dynamicContent = await this.dynamicContentService.monitorDynamicContent(pageId, {
          monitorDuration: 10000,
          takeScreenshots: request.options?.includeScreenshots,
          trackNetworkRequests: true
        });
      }
      
      // Step 4: Generate test cases (if enabled)
      if (request.options?.generateTestCases) {
        console.log('Generating test cases');
        result.testCases = await this.generateTestCases(result);
      }
      
      // Step 5: Take screenshots (if enabled)
      if (request.options?.includeScreenshots) {
        console.log('Capturing screenshots');
        result.screenshots = await this.captureScreenshots(sessionId);
      }
      
      // Step 6: Build sitemap (if crawling is enabled)
      if (request.options?.crawlDepth && request.options.crawlDepth > 0) {
        console.log('Building sitemap');
        result.sitemap = await this.buildSitemap(request.url, request.options);
      }
      
      result.success = true;
      
    } catch (error) {
      console.error(`Exploration failed for ${request.url}:`, error);
      
      const errorContext: ErrorContext = {
        pageId: sessionId,
        url: request.url,
        userAgent: request.options?.userAgent,
        viewport: request.options?.browserConfig?.viewport
      };
      
      const explorationError = this.errorHandler.handleError(error as Error, errorContext);
      result.errors.push(explorationError);
      
      // Attempt recovery
      const recovered = await this.errorHandler.attemptRecovery(explorationError, this.puppeteerService);
      if (!recovered) {
        result.success = false;
      }
    } finally {
      // Finalize result
      result.endTime = Date.now();
      result.duration = result.endTime - result.startTime;
      
      // Aggregate errors from all services
      result.errors.push(...result.explorationResult.errors.map(msg => ({
        type: 'unknown' as const,
        severity: 'medium' as const,
        message: msg,
        context: { pageId: sessionId, url: request.url },
        timestamp: Date.now()
      })));
      
      // Clean up session
      this.clearSessionTimeout(sessionId);
      
      console.log(`Exploration completed in ${result.duration}ms`);
    }
    
    return result;
  }

  async getExplorationStatus(sessionId: string): Promise<UrlExplorationResult | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  async cancelExploration(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return false;
    }
    
    try {
      // Clean up resources
      await this.puppeteerService.closePage(sessionId);
      this.clearSessionTimeout(sessionId);
      this.activeSessions.delete(sessionId);
      
      return true;
    } catch (error) {
      console.error(`Failed to cancel exploration ${sessionId}:`, error);
      return false;
    }
  }

  private async generateTestCases(result: UrlExplorationResult): Promise<TestCase[]> {
    const testCases: TestCase[] = [];
    
    // Generate navigation test cases
    if (result.pageAnalysis.links.length > 0) {
      testCases.push({
        id: `nav-${this.generateId()}`,
        name: 'Page Navigation Test',
        description: 'Test navigation to all discoverable pages',
        type: 'navigation',
        priority: 'medium',
        steps: result.pageAnalysis.links.slice(0, 5).map((link, index) => ({
          stepNumber: index + 1,
          action: 'click',
          target: link.selector,
          description: `Click on link: ${link.text || link.href}`,
          validations: ['Page loads successfully', 'No console errors']
        })),
        expectedResults: ['All links should navigate to valid pages'],
        preconditions: ['Page is loaded', 'All links are visible'],
        tags: ['navigation', 'smoke']
      });
    }
    
    // Generate form test cases
    for (const formAnalysis of result.formAnalysis) {
      const formTestCase: TestCase = {
        id: `form-${this.generateId()}`,
        name: `${formAnalysis.formType.charAt(0).toUpperCase() + formAnalysis.formType.slice(1)} Form Test`,
        description: `Test ${formAnalysis.formType} form with ${formAnalysis.fieldAnalysis.length} fields`,
        type: 'form',
        priority: formAnalysis.formType === 'login' ? 'high' : 'medium',
        steps: [],
        expectedResults: [],
        preconditions: ['Form is visible and accessible'],
        tags: ['form', formAnalysis.formType, formAnalysis.complexity]
      };
      
      // Add form interaction steps
      for (let i = 0; i < formAnalysis.interactionFlow.length; i++) {
        const interaction = formAnalysis.interactionFlow[i];
        formTestCase.steps.push({
          stepNumber: i + 1,
          action: interaction.action,
          target: interaction.target,
          value: interaction.value,
          description: interaction.description,
          validations: [`${interaction.action} operation successful`]
        });
      }
      
      // Add test strategies as expected results
      formTestCase.expectedResults = formAnalysis.testStrategies
        .filter(s => s.priority === 'high')
        .map(s => s.expectedResult);
      
      testCases.push(formTestCase);
    }
    
    // Generate interaction test cases
    const highPriorityElements = result.explorationResult.discoveredElements
      .filter(e => e.priority === 'high' && e.testability.canAutomate);
    
    if (highPriorityElements.length > 0) {
      testCases.push({
        id: `interaction-${this.generateId()}`,
        name: 'Interactive Elements Test',
        description: 'Test all high-priority interactive elements',
        type: 'interaction',
        priority: 'high',
        steps: highPriorityElements.slice(0, 10).map((element, index) => ({
          stepNumber: index + 1,
          action: element.context.interactionType,
          target: element.element.selector,
          description: `Interact with ${element.element.tagName}: ${element.element.text || element.element.id}`,
          validations: ['Element responds to interaction', 'No JavaScript errors']
        })),
        expectedResults: ['All interactive elements should respond appropriately'],
        preconditions: ['Page is fully loaded', 'Elements are visible'],
        tags: ['interaction', 'ui']
      });
    }
    
    return testCases;
  }

  private async captureScreenshots(sessionId: string): Promise<string[]> {
    try {
      await this.puppeteerService.screenshot(sessionId, {
        fullPage: true,
        path: `screenshots/${sessionId}-full-page.png`
      });
      
      return [`screenshots/${sessionId}-full-page.png`];
    } catch (error) {
      console.error('Failed to capture screenshots:', error);
      return [];
    }
  }

  private async buildSitemap(
    startUrl: string,
    options: UrlExplorationOptions
  ): Promise<SitemapEntry[]> {
    const sitemap: SitemapEntry[] = [];
    const visited = new Set<string>();
    const toVisit = [{ url: startUrl, depth: 0, parent: undefined }];
    
    while (toVisit.length > 0 && sitemap.length < (options.maxPages || 50)) {
      const { url, depth, parent } = toVisit.shift()!;
      
      if (visited.has(url) || depth > (options.crawlDepth || 2)) {
        continue;
      }
      
      visited.add(url);
      
      try {
        // Basic URL validation
        if (!this.isAllowedUrl(url, options)) {
          continue;
        }
        
        const entry: SitemapEntry = {
          url,
          title: '',
          depth,
          parent,
          children: [],
          lastExplored: Date.now(),
          status: 'pending'
        };
        
        // Quick exploration to get basic info
        const pageId = `sitemap-${this.generateId()}`;
        const pageAnalysis = await this.puppeteerService.navigateToUrl(pageId, url, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });
        
        entry.title = pageAnalysis.title;
        entry.status = pageAnalysis.errors.length === 0 ? 'success' : 'failed';
        
        // Add child URLs from links
        const childUrls = pageAnalysis.links
          .map(link => this.resolveUrl(link.href || '', url))
          .filter((childUrl): childUrl is string => childUrl !== null && this.isAllowedUrl(childUrl, options))
          .slice(0, 10); // Limit child URLs
        
        entry.children = childUrls;
        
        // Add to visit queue
        for (const childUrl of childUrls) {
          if (!visited.has(childUrl)) {
            toVisit.push({ url: childUrl, depth: depth + 1, parent: url });
          }
        }
        
        sitemap.push(entry);
        await this.puppeteerService.closePage(pageId);
        
      } catch (error) {
        console.error(`Failed to explore ${url} for sitemap:`, error);
        sitemap.push({
          url,
          title: '',
          depth,
          parent: parent || undefined,
          children: [],
          lastExplored: Date.now(),
          status: 'failed'
        });
      }
    }
    
    return sitemap;
  }

  private async collectMetadata(options?: UrlExplorationOptions): Promise<any> {
    const metadata: any = {};
    
    try {
      // Browser information would be collected here
      metadata.userAgent = options?.userAgent || 'TestCase-Translator-Bot/1.0';
      metadata.viewport = options?.browserConfig?.viewport || { width: 1920, height: 1080 };
      metadata.networkConditions = 'standard';
      
      return metadata;
    } catch (error) {
      console.error('Failed to collect metadata:', error);
      return {};
    }
  }

  private isAllowedUrl(url: string, options: UrlExplorationOptions): boolean {
    try {
      const urlObj = new URL(url);
      
      // Check blocked domains
      if (options.blockedDomains?.some(domain => urlObj.hostname.includes(domain))) {
        return false;
      }
      
      // Check allowed domains
      if (options.allowedDomains?.length && 
          !options.allowedDomains.some(domain => urlObj.hostname.includes(domain))) {
        return false;
      }
      
      // Skip non-HTTP protocols
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      return new URL(href, baseUrl).href;
    } catch (error) {
      return null;
    }
  }

  private setSessionTimeout(sessionId: string, timeoutMs: number): void {
    const timeout = setTimeout(() => {
      console.log(`Session ${sessionId} timed out`);
      this.cancelExploration(sessionId);
    }, timeoutMs);
    
    this.sessionTimeouts.set(sessionId, timeout);
  }

  private clearSessionTimeout(sessionId: string): void {
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  // Public API methods

  async getActiveSessions(): Promise<string[]> {
    return Array.from(this.activeSessions.keys());
  }

  async getErrorReport(): Promise<any> {
    return this.errorHandler.generateErrorReport();
  }

  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    browser: boolean;
    activeSessions: number;
    errors: number;
  }> {
    try {
      const browserHealthy = this.puppeteerService !== null;
      const activeSessions = this.activeSessions.size;
      const errors = this.errorHandler.getErrors().length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (!browserHealthy) {
        status = 'unhealthy';
      } else if (errors > 10 || activeSessions > 50) {
        status = 'degraded';
      }
      
      return {
        status,
        browser: browserHealthy,
        activeSessions,
        errors
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        browser: false,
        activeSessions: 0,
        errors: 0
      };
    }
  }

  async cleanup(): Promise<void> {
    // Cancel all active sessions
    const sessionIds = Array.from(this.activeSessions.keys());
    for (const sessionId of sessionIds) {
      await this.cancelExploration(sessionId);
    }
    
    // Close browser
    await this.puppeteerService.close();
    
    // Clear error history
    this.errorHandler.clearErrors();
    
    console.log('URL Exploration Engine cleaned up');
  }
}