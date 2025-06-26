import { PuppeteerService, ElementInfo, FormInfo, PageAnalysis } from './PuppeteerService';

export interface ExplorationResult {
  pageAnalysis: PageAnalysis;
  explorationSteps: ExplorationStep[];
  discoveredElements: DiscoveredElement[];
  interactionSuggestions: InteractionSuggestion[];
  errors: string[];
}

export interface ExplorationStep {
  stepNumber: number;
  action: 'navigate' | 'click' | 'input' | 'wait' | 'scroll' | 'hover';
  selector?: string;
  value?: string;
  description: string;
  timestamp: number;
  success: boolean;
  error?: string;
  screenshot?: string;
}

export interface DiscoveredElement {
  element: ElementInfo;
  context: {
    parentForm?: string;
    nearbyElements: ElementInfo[];
    purpose: ElementPurpose;
    interactionType: InteractionType;
  };
  priority: 'high' | 'medium' | 'low';
  testability: {
    canAutomate: boolean;
    automationComplexity: 'simple' | 'medium' | 'complex';
    reasons: string[];
  };
}

export type ElementPurpose = 
  | 'authentication' 
  | 'navigation' 
  | 'data-entry' 
  | 'action' 
  | 'display' 
  | 'validation' 
  | 'search' 
  | 'filter' 
  | 'unknown';

export type InteractionType = 
  | 'click' 
  | 'input-text' 
  | 'input-number' 
  | 'input-email' 
  | 'input-password' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'file-upload' 
  | 'hover' 
  | 'drag-drop' 
  | 'unknown';

export interface InteractionSuggestion {
  description: string;
  element: ElementInfo;
  suggestedAction: string;
  testScenarios: string[];
  priority: 'high' | 'medium' | 'low';
  dependencies: string[];
}

export interface ExplorationOptions {
  maxDepth?: number;
  followLinks?: boolean;
  interactWithForms?: boolean;
  takeScreenshots?: boolean;
  timeout?: number;
  includeHiddenElements?: boolean;
  respectRobotsTxt?: boolean;
}

export class PageExplorationService {
  private puppeteerService: PuppeteerService;
  private explorationHistory: Map<string, ExplorationResult> = new Map();

  constructor(puppeteerService: PuppeteerService) {
    this.puppeteerService = puppeteerService;
  }

  async exploreUrl(
    url: string, 
    options: ExplorationOptions = {}
  ): Promise<ExplorationResult> {
    const pageId = `exploration-${Date.now()}`;
    const explorationSteps: ExplorationStep[] = [];
    const errors: string[] = [];
    
    try {
      // Step 1: Navigate to URL
      const navigationStep = await this.recordStep(
        explorationSteps,
        'navigate',
        undefined,
        url,
        `Navigate to ${url}`
      );

      const pageAnalysis = await this.puppeteerService.navigateToUrl(pageId, url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout
      });

      navigationStep.success = pageAnalysis.errors.length === 0;
      if (pageAnalysis.errors.length > 0) {
        navigationStep.error = pageAnalysis.errors.join('; ');
        errors.push(...pageAnalysis.errors);
      }

      // Take initial screenshot if requested
      if (options.takeScreenshots) {
        try {
          await this.puppeteerService.screenshot(pageId, { fullPage: true });
          navigationStep.screenshot = `screenshot-${navigationStep.stepNumber}.png`;
        } catch (error) {
          console.warn('Failed to take screenshot:', error);
        }
      }

      // Step 2: Discover and analyze elements
      const discoveredElements = await this.discoverElements(pageAnalysis, options);

      // Step 3: Generate interaction suggestions
      const interactionSuggestions = await this.generateInteractionSuggestions(
        discoveredElements,
        pageAnalysis
      );

      // Step 4: Perform smart exploration if enabled
      if (options.interactWithForms || options.followLinks) {
        await this.performSmartExploration(
          pageId,
          discoveredElements,
          explorationSteps,
          options
        );
      }

      const result: ExplorationResult = {
        pageAnalysis,
        explorationSteps,
        discoveredElements,
        interactionSuggestions,
        errors
      };

      // Cache the result
      this.explorationHistory.set(url, result);

      return result;
    } catch (error) {
      errors.push(`Exploration failed: ${error}`);
      
      return {
        pageAnalysis: {
          url,
          title: '',
          forms: [],
          interactiveElements: [],
          links: [],
          images: [],
          loadTime: 0,
          errors
        },
        explorationSteps,
        discoveredElements: [],
        interactionSuggestions: [],
        errors
      };
    } finally {
      // Clean up
      await this.puppeteerService.closePage(pageId);
    }
  }

  private async discoverElements(
    pageAnalysis: PageAnalysis,
    options: ExplorationOptions
  ): Promise<DiscoveredElement[]> {
    const discoveredElements: DiscoveredElement[] = [];

    // Process forms and their elements
    for (const form of pageAnalysis.forms) {
      for (const field of form.fields) {
        const discovered = await this.analyzeElement(field, {
          parentForm: form.selector,
          nearbyElements: form.fields.filter(f => f !== field),
          purpose: this.determinePurpose(field),
          interactionType: this.determineInteractionType(field)
        });
        discoveredElements.push(discovered);
      }

      for (const button of form.submitButtons) {
        const discovered = await this.analyzeElement(button, {
          parentForm: form.selector,
          nearbyElements: form.fields,
          purpose: 'action',
          interactionType: 'click'
        });
        discoveredElements.push(discovered);
      }
    }

    // Process interactive elements
    for (const element of pageAnalysis.interactiveElements) {
      if (!options.includeHiddenElements && !element.isVisible) {
        continue;
      }

      const discovered = await this.analyzeElement(element, {
        nearbyElements: this.findNearbyElements(element, pageAnalysis),
        purpose: this.determinePurpose(element),
        interactionType: this.determineInteractionType(element)
      });
      discoveredElements.push(discovered);
    }

    // Process links if following links is enabled
    if (options.followLinks) {
      for (const link of pageAnalysis.links) {
        if (!options.includeHiddenElements && !link.isVisible) {
          continue;
        }

        const discovered = await this.analyzeElement(link, {
          nearbyElements: [],
          purpose: 'navigation',
          interactionType: 'click'
        });
        discoveredElements.push(discovered);
      }
    }

    return discoveredElements.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private async analyzeElement(
    element: ElementInfo,
    context: DiscoveredElement['context']
  ): Promise<DiscoveredElement> {
    const testability = this.assessTestability(element, context);
    const priority = this.calculatePriority(element, context, testability);

    return {
      element,
      context,
      priority,
      testability
    };
  }

  private determinePurpose(element: ElementInfo): ElementPurpose {
    const text = (element.text || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const name = (element.name || '').toLowerCase();
    const type = (element.type || '').toLowerCase();

    // Authentication patterns
    if (this.matchesPatterns([text, id, className, name], [
      'login', 'signin', 'sign-in', 'auth', 'password', 'username', 'email'
    ])) {
      return 'authentication';
    }

    // Navigation patterns
    if (element.isLink || this.matchesPatterns([text, id, className], [
      'nav', 'menu', 'home', 'about', 'contact', 'link'
    ])) {
      return 'navigation';
    }

    // Data entry patterns
    if (element.isInput && !['submit', 'button', 'reset'].includes(type)) {
      return 'data-entry';
    }

    // Action patterns
    if (element.isButton || this.matchesPatterns([text, id, className], [
      'submit', 'send', 'save', 'delete', 'create', 'update', 'cancel'
    ])) {
      return 'action';
    }

    // Search patterns
    if (this.matchesPatterns([text, id, className, name], [
      'search', 'find', 'query', 'filter'
    ])) {
      return 'search';
    }

    return 'unknown';
  }

  private determineInteractionType(element: ElementInfo): InteractionType {
    if (element.isLink || (element.isButton && !element.isInput)) {
      return 'click';
    }

    if (element.isInput) {
      const type = (element.type || '').toLowerCase();
      
      switch (type) {
        case 'text':
        case 'textarea':
          return 'input-text';
        case 'number':
          return 'input-number';
        case 'email':
          return 'input-email';
        case 'password':
          return 'input-password';
        case 'checkbox':
          return 'checkbox';
        case 'radio':
          return 'radio';
        case 'file':
          return 'file-upload';
        case 'submit':
        case 'button':
          return 'click';
        default:
          return 'input-text';
      }
    }

    if (element.tagName === 'select') {
      return 'select';
    }

    return 'click';
  }

  private assessTestability(
    element: ElementInfo,
    context: DiscoveredElement['context']
  ): DiscoveredElement['testability'] {
    const reasons: string[] = [];
    let canAutomate = true;
    let complexity: 'simple' | 'medium' | 'complex' = 'simple';

    // Check visibility
    if (!element.isVisible) {
      canAutomate = false;
      reasons.push('Element is not visible');
    }

    // Check if element has stable selectors
    if (!element.id && !element.name && !element.className) {
      complexity = 'complex';
      reasons.push('No stable selector (ID, name, or class)');
    }

    // Check for dynamic content
    if (element.selector.includes(':nth-of-type')) {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
      reasons.push('Using positional selector - may be unstable');
    }

    // Check for form context
    if (context.parentForm && element.isInput) {
      complexity = 'simple';
      reasons.push('Input field within form context');
    }

    // Check for JavaScript dependencies
    if (element.className && element.className.includes('js-')) {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
      reasons.push('May require JavaScript interaction');
    }

    // File upload complexity
    if (context.interactionType === 'file-upload') {
      complexity = 'complex';
      reasons.push('File upload requires special handling');
    }

    return {
      canAutomate,
      automationComplexity: complexity,
      reasons
    };
  }

  private calculatePriority(
    element: ElementInfo,
    context: DiscoveredElement['context'],
    testability: DiscoveredElement['testability']
  ): 'high' | 'medium' | 'low' {
    let score = 0;

    // Purpose-based scoring
    switch (context.purpose) {
      case 'authentication':
      case 'action':
        score += 3;
        break;
      case 'data-entry':
      case 'search':
        score += 2;
        break;
      case 'navigation':
        score += 1;
        break;
      default:
        score += 0;
    }

    // Testability scoring
    if (testability.canAutomate) {
      score += 2;
    }
    
    if (testability.automationComplexity === 'simple') {
      score += 2;
    } else if (testability.automationComplexity === 'medium') {
      score += 1;
    }

    // Visibility scoring
    if (element.isVisible) {
      score += 1;
    }

    // Stable selector scoring
    if (element.id || element.name) {
      score += 1;
    }

    // Convert score to priority
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  private async generateInteractionSuggestions(
    discoveredElements: DiscoveredElement[],
    pageAnalysis: PageAnalysis
  ): Promise<InteractionSuggestion[]> {
    const suggestions: InteractionSuggestion[] = [];

    // Group elements by forms
    const formGroups = new Map<string, DiscoveredElement[]>();
    const standaloneElements: DiscoveredElement[] = [];

    for (const discovered of discoveredElements) {
      if (discovered.context.parentForm) {
        const formElements = formGroups.get(discovered.context.parentForm) || [];
        formElements.push(discovered);
        formGroups.set(discovered.context.parentForm, formElements);
      } else {
        standaloneElements.push(discovered);
      }
    }

    // Generate form-based suggestions
    for (const [formSelector, elements] of formGroups) {
      const formSuggestion = this.generateFormSuggestion(formSelector, elements);
      if (formSuggestion) {
        suggestions.push(formSuggestion);
      }
    }

    // Generate suggestions for standalone elements
    for (const element of standaloneElements) {
      const suggestion = this.generateElementSuggestion(element);
      if (suggestion) {
        suggestions.push(suggestion);
      }
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  private generateFormSuggestion(
    formSelector: string,
    elements: DiscoveredElement[]
  ): InteractionSuggestion | null {
    const inputElements = elements.filter(e => e.element.isInput);
    const submitElements = elements.filter(e => e.element.isButton);

    if (inputElements.length === 0) return null;

    const hasAuth = elements.some(e => e.context.purpose === 'authentication');
    const formType = hasAuth ? 'Authentication Form' : 'Data Entry Form';

    return {
      description: `Complete ${formType} with ${inputElements.length} fields`,
      element: inputElements[0].element, // Representative element
      suggestedAction: 'Fill form and submit',
      testScenarios: [
        'Fill all required fields and submit',
        'Submit form with empty fields (validation test)',
        'Fill form with invalid data',
        'Test form field interactions and dependencies'
      ],
      priority: hasAuth ? 'high' : 'medium',
      dependencies: elements.map(e => e.element.selector)
    };
  }

  private generateElementSuggestion(
    discovered: DiscoveredElement
  ): InteractionSuggestion | null {
    const { element, context } = discovered;

    let description = '';
    let suggestedAction = '';
    const testScenarios: string[] = [];

    switch (context.interactionType) {
      case 'click':
        description = `Click ${element.text || element.tagName} element`;
        suggestedAction = 'Click and verify response';
        testScenarios.push('Click element and verify expected outcome');
        break;
      
      case 'input-text':
        description = `Enter text in ${element.name || element.id || 'input'} field`;
        suggestedAction = 'Input various text values';
        testScenarios.push(
          'Enter valid text',
          'Enter special characters',
          'Test field length limits'
        );
        break;
      
      case 'select':
        description = `Select option from ${element.name || element.id || 'dropdown'}`;
        suggestedAction = 'Select different options';
        testScenarios.push(
          'Select each available option',
          'Test default selection'
        );
        break;
      
      default:
        return null;
    }

    return {
      description,
      element,
      suggestedAction,
      testScenarios,
      priority: discovered.priority,
      dependencies: []
    };
  }

  private async performSmartExploration(
    pageId: string,
    discoveredElements: DiscoveredElement[],
    explorationSteps: ExplorationStep[],
    options: ExplorationOptions
  ): Promise<void> {
    // Limit exploration depth
    const maxInteractions = Math.min(discoveredElements.length, options.maxDepth || 5);
    const highPriorityElements = discoveredElements
      .filter(e => e.priority === 'high' && e.testability.canAutomate)
      .slice(0, maxInteractions);

    for (const discovered of highPriorityElements) {
      try {
        await this.performElementInteraction(pageId, discovered, explorationSteps);
      } catch (error) {
        console.warn(`Failed to interact with element ${discovered.element.selector}:`, error);
      }
    }
  }

  private async performElementInteraction(
    pageId: string,
    discovered: DiscoveredElement,
    explorationSteps: ExplorationStep[]
  ): Promise<void> {
    const { element, context } = discovered;

    switch (context.interactionType) {
      case 'click':
        await this.recordStep(
          explorationSteps,
          'click',
          element.selector,
          undefined,
          `Click ${element.text || element.tagName}`
        );
        await this.puppeteerService.clickElement(pageId, element.selector);
        break;

      case 'input-text':
        const testValue = this.generateTestValue(context.interactionType);
        await this.recordStep(
          explorationSteps,
          'input',
          element.selector,
          testValue,
          `Enter text in ${element.name || element.id || 'field'}`
        );
        await this.puppeteerService.typeText(pageId, element.selector, testValue);
        break;

      // Add more interaction types as needed
    }
  }

  private generateTestValue(interactionType: InteractionType): string {
    switch (interactionType) {
      case 'input-text':
        return 'Test Input';
      case 'input-email':
        return 'test@example.com';
      case 'input-number':
        return '123';
      case 'input-password':
        return 'TestPassword123';
      default:
        return 'Test Value';
    }
  }

  private async recordStep(
    steps: ExplorationStep[],
    action: ExplorationStep['action'],
    selector: string | undefined,
    value: string | undefined,
    description: string
  ): Promise<ExplorationStep> {
    const step: ExplorationStep = {
      stepNumber: steps.length + 1,
      action,
      selector,
      value,
      description,
      timestamp: Date.now(),
      success: true
    };

    steps.push(step);
    return step;
  }

  private findNearbyElements(
    targetElement: ElementInfo,
    pageAnalysis: PageAnalysis
  ): ElementInfo[] {
    // Simple implementation - find elements with similar selectors or in same form
    const nearby: ElementInfo[] = [];
    
    // Add elements from the same form if applicable
    for (const form of pageAnalysis.forms) {
      if (form.fields.some(f => f.selector === targetElement.selector)) {
        nearby.push(...form.fields.filter(f => f.selector !== targetElement.selector));
      }
    }

    return nearby.slice(0, 5); // Limit to 5 nearby elements
  }

  private matchesPatterns(texts: string[], patterns: string[]): boolean {
    return texts.some(text => 
      patterns.some(pattern => 
        text.includes(pattern)
      )
    );
  }

  getExplorationHistory(url?: string): ExplorationResult | Map<string, ExplorationResult> {
    if (url) {
      return this.explorationHistory.get(url) || null;
    }
    return this.explorationHistory;
  }

  clearHistory(): void {
    this.explorationHistory.clear();
  }
}