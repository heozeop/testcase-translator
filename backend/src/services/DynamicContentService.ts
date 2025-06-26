import { PuppeteerService, ElementInfo, PageAnalysis } from './PuppeteerService';

export interface DynamicContentResult {
  contentChanges: ContentChange[];
  stateTransitions: StateTransition[];
  loadingPatterns: LoadingPattern[];
  interactionEffects: InteractionEffect[];
  ajaxRequests: AjaxRequest[];
  errors: string[];
}

export interface ContentChange {
  timestamp: number;
  changeType: 'added' | 'removed' | 'modified' | 'visibility';
  element: ElementInfo;
  oldValue?: string;
  newValue?: string;
  trigger?: string;
  screenshot?: string;
}

export interface StateTransition {
  fromState: string;
  toState: string;
  trigger: string;
  timestamp: number;
  elements: ElementInfo[];
  isReversible: boolean;
}

export interface LoadingPattern {
  type: 'spinner' | 'skeleton' | 'overlay' | 'progressive' | 'infinite-scroll';
  selector: string;
  duration: number;
  triggerElement?: string;
  completionIndicator?: string;
}

export interface InteractionEffect {
  interaction: string;
  element: string;
  effects: {
    immediate: ContentChange[];
    delayed: ContentChange[];
    sideEffects: ContentChange[];
  };
  timing: {
    responseTime: number;
    totalDuration: number;
  };
}

export interface AjaxRequest {
  url: string;
  method: string;
  timestamp: number;
  status: number;
  responseTime: number;
  trigger?: string;
  dataChanged: boolean;
}

export interface WaitCondition {
  type: 'element' | 'text' | 'attribute' | 'network' | 'function';
  target: string;
  condition: string;
  timeout: number;
  polling?: number;
}

export interface ContentMonitoringOptions {
  monitorDuration?: number;
  takeScreenshots?: boolean;
  trackNetworkRequests?: boolean;
  observeAttributes?: boolean;
  observeChildList?: boolean;
  observeSubtree?: boolean;
  debounceMs?: number;
}

export class DynamicContentService {
  private puppeteerService: PuppeteerService;
  private mutationObservers: Map<string, any> = new Map();
  private contentHistory: Map<string, DynamicContentResult> = new Map();

  constructor(puppeteerService: PuppeteerService) {
    this.puppeteerService = puppeteerService;
  }

  async monitorDynamicContent(
    pageId: string,
    options: ContentMonitoringOptions = {}
  ): Promise<DynamicContentResult> {
    const startTime = Date.now();
    const result: DynamicContentResult = {
      contentChanges: [],
      stateTransitions: [],
      loadingPatterns: [],
      interactionEffects: [],
      ajaxRequests: [],
      errors: []
    };

    try {
      // Get page reference
      const page = await this.getPageById(pageId);
      
      // Set up monitoring
      await this.setupContentMonitoring(page, result, options);
      
      // Monitor for specified duration
      const duration = options.monitorDuration || 10000; // 10 seconds default
      await this.sleep(duration);
      
      // Cleanup monitoring
      await this.cleanupMonitoring(pageId);
      
      // Analyze patterns
      this.analyzeLoadingPatterns(result);
      this.analyzeStateTransitions(result);
      
      // Cache result
      this.contentHistory.set(pageId, result);
      
      return result;
    } catch (error) {
      result.errors.push(`Dynamic content monitoring failed: ${error}`);
      return result;
    }
  }

  async waitForDynamicContent(
    pageId: string,
    waitConditions: WaitCondition[]
  ): Promise<boolean> {
    try {
      const page = await this.getPageById(pageId);
      
      // Create promises for each wait condition
      const waitPromises = waitConditions.map(condition => 
        this.createWaitPromise(page, condition)
      );
      
      // Wait for all conditions or timeout
      const results = await Promise.allSettled(waitPromises);
      
      // Return true if all conditions were met
      return results.every(result => result.status === 'fulfilled');
    } catch (error) {
      console.error('Failed to wait for dynamic content:', error);
      return false;
    }
  }

  async detectLoadingStates(pageId: string): Promise<LoadingPattern[]> {
    try {
      const page = await this.getPageById(pageId);
      
      // Common loading indicators
      const loadingSelectors = [
        '.spinner', '.loading', '.loader',
        '[aria-live="polite"]', '[aria-live="assertive"]',
        '.skeleton', '.placeholder',
        '.overlay', '.modal',
        '[data-loading]', '[data-testid*="loading"]'
      ];
      
      const patterns: LoadingPattern[] = [];
      
      for (const selector of loadingSelectors) {
        try {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const pattern = await this.analyzeLoadingElement(page, element, selector);
            if (pattern) {
              patterns.push(pattern);
            }
          }
        } catch (error) {
          // Element not found or not accessible
          continue;
        }
      }
      
      return patterns;
    } catch (error) {
      console.error('Failed to detect loading states:', error);
      return [];
    }
  }

  async simulateUserInteractions(
    pageId: string,
    interactions: string[]
  ): Promise<InteractionEffect[]> {
    const effects: InteractionEffect[] = [];
    
    try {
      const page = await this.getPageById(pageId);
      
      for (const interaction of interactions) {
        const effect = await this.simulateInteraction(page, interaction);
        if (effect) {
          effects.push(effect);
        }
      }
      
      return effects;
    } catch (error) {
      console.error('Failed to simulate user interactions:', error);
      return [];
    }
  }

  async handleSinglePageApp(pageId: string): Promise<{
    routes: string[];
    navigationPatterns: string[];
    stateManagement: string;
  }> {
    try {
      const page = await this.getPageById(pageId);
      
      // Detect SPA framework
      const framework = await this.detectSPAFramework(page);
      
      // Monitor URL changes
      const routes = await this.monitorRouteChanges(page);
      
      // Analyze navigation patterns
      const navigationPatterns = await this.analyzeNavigationPatterns(page);
      
      return {
        routes,
        navigationPatterns,
        stateManagement: framework
      };
    } catch (error) {
      console.error('Failed to handle SPA:', error);
      return {
        routes: [],
        navigationPatterns: [],
        stateManagement: 'unknown'
      };
    }
  }

  private async getPageById(pageId: string): Promise<any> {
    if (!this.puppeteerService.isPageActive(pageId)) {
      throw new Error(`Page ${pageId} is not active`);
    }
    
    // This is a simplified way to get the page - in reality we'd need to access the private pages map
    return this.puppeteerService.createPage(pageId);
  }

  private async setupContentMonitoring(
    page: any,
    result: DynamicContentResult,
    options: ContentMonitoringOptions
  ): Promise<void> {
    // Set up network request monitoring
    if (options.trackNetworkRequests) {
      await this.setupNetworkMonitoring(page, result);
    }
    
    // Set up DOM mutation monitoring
    await this.setupMutationMonitoring(page, result, options);
    
    // Set up performance monitoring
    await this.setupPerformanceMonitoring(page, result);
  }

  private async setupNetworkMonitoring(page: any, result: DynamicContentResult): Promise<void> {
    page.on('response', (response: any) => {
      const request = response.request();
      const ajaxRequest: AjaxRequest = {
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
        status: response.status(),
        responseTime: 0, // Would need to calculate from request start
        dataChanged: this.isDataRequest(request.url()),
        trigger: 'unknown'
      };
      
      result.ajaxRequests.push(ajaxRequest);
    });
  }

  private async setupMutationMonitoring(
    page: any,
    result: DynamicContentResult,
    options: ContentMonitoringOptions
  ): Promise<void> {
    // Inject mutation observer into the page
    await page.evaluateOnNewDocument(() => {
      (window as any).contentChanges = [];
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          const change = {
            timestamp: Date.now(),
            changeType: 'modified',
            element: {
              tagName: (mutation.target as Element).tagName?.toLowerCase(),
              selector: this.generateSelector(mutation.target as Element)
            },
            oldValue: mutation.oldValue,
            newValue: (mutation.target as any).value || (mutation.target as Element).textContent
          };
          
          (window as any).contentChanges.push(change);
        });
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        characterDataOldValue: true
      });
      
      (window as any).mutationObserver = observer;
    });
  }

  private async setupPerformanceMonitoring(page: any, result: DynamicContentResult): Promise<void> {
    // Monitor performance entries
    await page.evaluateOnNewDocument(() => {
      (window as any).performanceEntries = [];
      
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).performanceEntries.push({
            name: entry.name,
            type: entry.entryType,
            startTime: entry.startTime,
            duration: entry.duration
          });
        }
      });
      
      observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
    });
  }

  private async createWaitPromise(page: any, condition: WaitCondition): Promise<void> {
    switch (condition.type) {
      case 'element':
        return page.waitForSelector(condition.target, {
          timeout: condition.timeout,
          visible: true
        });
      
      case 'text':
        return page.waitForFunction(
          (text: string) => document.body.textContent?.includes(text),
          { timeout: condition.timeout, polling: condition.polling || 100 },
          condition.condition
        );
      
      case 'attribute':
        return page.waitForFunction(
          (selector: string, attr: string, value: string) => {
            const element = document.querySelector(selector);
            return element?.getAttribute(attr) === value;
          },
          { timeout: condition.timeout, polling: condition.polling || 100 },
          condition.target,
          condition.condition.split('=')[0],
          condition.condition.split('=')[1]
        );
      
      case 'network':
        return page.waitForResponse(
          (response: any) => response.url().includes(condition.target),
          { timeout: condition.timeout }
        );
      
      case 'function':
        return page.waitForFunction(
          condition.condition,
          { timeout: condition.timeout, polling: condition.polling || 100 }
        );
      
      default:
        return Promise.resolve();
    }
  }

  private async analyzeLoadingElement(
    page: any,
    element: any,
    selector: string
  ): Promise<LoadingPattern | null> {
    try {
      const startTime = Date.now();
      
      // Check if element is visible
      const isVisible = await element.isIntersectingViewport();
      if (!isVisible) {
        return null;
      }
      
      // Wait for element to disappear (indicating loading completion)
      await page.waitForFunction(
        (sel: string) => !document.querySelector(sel),
        { timeout: 30000 },
        selector
      ).catch(() => {
        // Element didn't disappear - might be a persistent indicator
      });
      
      const duration = Date.now() - startTime;
      
      // Determine loading type based on selector and behavior
      let type: LoadingPattern['type'] = 'spinner';
      if (selector.includes('skeleton')) type = 'skeleton';
      else if (selector.includes('overlay') || selector.includes('modal')) type = 'overlay';
      else if (selector.includes('infinite') || selector.includes('scroll')) type = 'infinite-scroll';
      
      return {
        type,
        selector,
        duration,
        completionIndicator: 'element-removed'
      };
    } catch (error) {
      return null;
    }
  }

  private async simulateInteraction(page: any, interaction: string): Promise<InteractionEffect | null> {
    try {
      const startTime = Date.now();
      
      // Parse interaction (e.g., "click .button")
      const [action, selector] = interaction.split(' ', 2);
      
      // Capture state before interaction
      const beforeChanges = await this.capturePageState(page);
      
      // Perform interaction
      switch (action.toLowerCase()) {
        case 'click':
          await page.click(selector);
          break;
        case 'hover':
          await page.hover(selector);
          break;
        case 'type':
          await page.type(selector, 'test input');
          break;
        default:
          return null;
      }
      
      // Wait a moment for changes to occur
      await this.sleep(1000);
      
      // Capture state after interaction
      const afterChanges = await this.capturePageState(page);
      
      const responseTime = Date.now() - startTime;
      
      return {
        interaction,
        element: selector,
        effects: {
          immediate: this.compareStates(beforeChanges, afterChanges),
          delayed: [], // Would need additional monitoring
          sideEffects: []
        },
        timing: {
          responseTime,
          totalDuration: responseTime
        }
      };
    } catch (error) {
      console.error(`Failed to simulate interaction ${interaction}:`, error);
      return null;
    }
  }

  private async capturePageState(page: any): Promise<any> {
    return await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        elementCount: document.querySelectorAll('*').length,
        formCount: document.forms.length,
        timestamp: Date.now()
      };
    });
  }

  private compareStates(before: any, after: any): ContentChange[] {
    const changes: ContentChange[] = [];
    
    if (before.url !== after.url) {
      changes.push({
        timestamp: after.timestamp,
        changeType: 'modified',
        element: { tagName: 'location', selector: 'window.location' } as ElementInfo,
        oldValue: before.url,
        newValue: after.url
      });
    }
    
    if (before.title !== after.title) {
      changes.push({
        timestamp: after.timestamp,
        changeType: 'modified',
        element: { tagName: 'title', selector: 'title' } as ElementInfo,
        oldValue: before.title,
        newValue: after.title
      });
    }
    
    if (before.elementCount !== after.elementCount) {
      changes.push({
        timestamp: after.timestamp,
        changeType: before.elementCount < after.elementCount ? 'added' : 'removed',
        element: { tagName: 'elements', selector: 'document' } as ElementInfo,
        oldValue: before.elementCount.toString(),
        newValue: after.elementCount.toString()
      });
    }
    
    return changes;
  }

  private async detectSPAFramework(page: any): Promise<string> {
    return await page.evaluate(() => {
      // Check for common SPA frameworks
      if ((window as any).React) return 'React';
      if ((window as any).Vue) return 'Vue.js';
      if ((window as any).angular) return 'Angular';
      if ((window as any).Ember) return 'Ember.js';
      if ((window as any).Backbone) return 'Backbone.js';
      if (document.querySelector('[ng-app]')) return 'AngularJS';
      
      return 'unknown';
    });
  }

  private async monitorRouteChanges(page: any): Promise<string[]> {
    const routes: string[] = [];
    
    // Monitor pushstate/replacestate events
    await page.evaluateOnNewDocument(() => {
      (window as any).routeHistory = [window.location.pathname];
      
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        (window as any).routeHistory.push(args[2] || window.location.pathname);
        return originalPushState.apply(history, args);
      };
      
      history.replaceState = function(...args) {
        (window as any).routeHistory.push(args[2] || window.location.pathname);
        return originalReplaceState.apply(history, args);
      };
      
      window.addEventListener('popstate', () => {
        (window as any).routeHistory.push(window.location.pathname);
      });
    });
    
    // Get collected routes after some time
    await this.sleep(5000);
    const routeHistory = await page.evaluate(() => (window as any).routeHistory || []);
    
    return [...new Set(routeHistory)]; // Remove duplicates
  }

  private async analyzeNavigationPatterns(page: any): Promise<string[]> {
    const patterns: string[] = [];
    
    // Check for common navigation patterns
    const hasNavigation = await page.$('nav') !== null;
    const hasBreadcrumbs = await page.$('.breadcrumb, .breadcrumbs') !== null;
    const hasSidebar = await page.$('.sidebar, .side-nav') !== null;
    const hasTabNavigation = await page.$('.tabs, .tab-navigation') !== null;
    const hasDropdownMenus = await page.$('.dropdown') !== null;
    
    if (hasNavigation) patterns.push('primary-navigation');
    if (hasBreadcrumbs) patterns.push('breadcrumb-navigation');
    if (hasSidebar) patterns.push('sidebar-navigation');
    if (hasTabNavigation) patterns.push('tab-navigation');
    if (hasDropdownMenus) patterns.push('dropdown-menus');
    
    return patterns;
  }

  private analyzeLoadingPatterns(result: DynamicContentResult): void {
    // Analyze AJAX requests to identify loading patterns
    const loadingRequests = result.ajaxRequests.filter(req => req.dataChanged);
    
    if (loadingRequests.length > 0) {
      const avgResponseTime = loadingRequests.reduce((sum, req) => sum + req.responseTime, 0) / loadingRequests.length;
      
      result.loadingPatterns.push({
        type: 'progressive',
        selector: 'network-requests',
        duration: avgResponseTime,
        completionIndicator: 'response-received'
      });
    }
  }

  private analyzeStateTransitions(result: DynamicContentResult): void {
    // Group content changes by time windows to identify state transitions
    const timeWindow = 1000; // 1 second
    const changeGroups: ContentChange[][] = [];
    
    let currentGroup: ContentChange[] = [];
    let lastTimestamp = 0;
    
    for (const change of result.contentChanges.sort((a, b) => a.timestamp - b.timestamp)) {
      if (change.timestamp - lastTimestamp > timeWindow) {
        if (currentGroup.length > 0) {
          changeGroups.push(currentGroup);
        }
        currentGroup = [change];
      } else {
        currentGroup.push(change);
      }
      lastTimestamp = change.timestamp;
    }
    
    if (currentGroup.length > 0) {
      changeGroups.push(currentGroup);
    }
    
    // Convert change groups to state transitions
    for (let i = 0; i < changeGroups.length - 1; i++) {
      const fromGroup = changeGroups[i];
      const toGroup = changeGroups[i + 1];
      
      result.stateTransitions.push({
        fromState: `state-${i}`,
        toState: `state-${i + 1}`,
        trigger: 'content-change',
        timestamp: toGroup[0].timestamp,
        elements: toGroup.map(c => c.element),
        isReversible: false
      });
    }
  }

  private isDataRequest(url: string): boolean {
    // Simple heuristic to identify data requests
    return url.includes('/api/') || 
           url.includes('.json') || 
           url.includes('/data/') ||
           url.includes('graphql');
  }

  private async cleanupMonitoring(pageId: string): Promise<void> {
    if (this.mutationObservers.has(pageId)) {
      const observer = this.mutationObservers.get(pageId);
      if (observer && observer.disconnect) {
        observer.disconnect();
      }
      this.mutationObservers.delete(pageId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getContentHistory(pageId?: string): DynamicContentResult | Map<string, DynamicContentResult> {
    if (pageId) {
      return this.contentHistory.get(pageId) || null;
    }
    return this.contentHistory;
  }

  clearHistory(): void {
    this.contentHistory.clear();
  }
}