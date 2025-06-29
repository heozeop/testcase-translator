import { PuppeteerService, ElementInfo, FormInfo, PageAnalysis } from './PuppeteerService';

export interface DiscoveredElement {
  element: EnhancedElementInfo;
  selectors: ElementSelectors;
  classification: ElementClassification;
  attributes: ElementAttributes;
  accessibility: AccessibilityInfo;
  context: ElementContext;
  testability: TestabilityAssessment;
  priority: ElementPriority;
}

export interface EnhancedElementInfo extends ElementInfo {
  xpath?: string;
  cssPath?: string;
  dataAttributes: Record<string, string>;
  computedStyles: ComputedStyleInfo;
  position: ElementPosition;
  parentElements: ElementHierarchy[];
  childElements: ElementInfo[];
  multiple?: boolean;
  alt?: string;
  role?: string;
}

export interface ElementSelectors {
  css: {
    optimal: string;
    alternative: string[];
    stable: string;
    dataTestId?: string;
  };
  xpath: {
    absolute: string;
    relative: string;
    text: string[];
    attribute: string[];
  };
  reliability: {
    score: number; // 0-100
    factors: SelectorReliabilityFactor[];
  };
}

export interface SelectorReliabilityFactor {
  type: 'id' | 'class' | 'data-testid' | 'position' | 'text' | 'attribute';
  weight: number;
  stable: boolean;
  reason: string;
}

export interface ElementClassification {
  category: ElementCategory;
  subType: ElementSubType;
  interaction: InteractionPattern;
  purpose: ElementPurpose;
  businessFunction: BusinessFunction;
  confidence: number; // 0-1
}

export type ElementCategory = 
  | 'form-control' 
  | 'navigation' 
  | 'content' 
  | 'media' 
  | 'layout' 
  | 'interactive' 
  | 'metadata';

export type ElementSubType = 
  | 'text-input' 
  | 'number-input' 
  | 'email-input' 
  | 'password-input'
  | 'textarea' 
  | 'select' 
  | 'multiselect'
  | 'checkbox' 
  | 'radio-group' 
  | 'file-upload'
  | 'date-picker' 
  | 'time-picker' 
  | 'range-slider'
  | 'button' 
  | 'link' 
  | 'image-button'
  | 'toggle' 
  | 'dropdown' 
  | 'modal-trigger'
  | 'tab' 
  | 'accordion' 
  | 'carousel'
  | 'image' 
  | 'video' 
  | 'audio'
  | 'table' 
  | 'list' 
  | 'card'
  | 'header' 
  | 'footer' 
  | 'sidebar'
  | 'breadcrumb' 
  | 'pagination' 
  | 'search-box'
  | 'filter' 
  | 'sort-control' 
  | 'unknown';

export type InteractionPattern = 
  | 'click' 
  | 'double-click' 
  | 'right-click'
  | 'hover' 
  | 'focus' 
  | 'type' 
  | 'select'
  | 'check' 
  | 'drag' 
  | 'scroll' 
  | 'swipe'
  | 'upload' 
  | 'download' 
  | 'submit' 
  | 'reset'
  | 'none';

export type ElementPurpose = 
  | 'authentication' 
  | 'authorization'
  | 'data-entry' 
  | 'data-display'
  | 'navigation' 
  | 'search' 
  | 'filter' 
  | 'sort'
  | 'action' 
  | 'validation' 
  | 'feedback'
  | 'help' 
  | 'decoration' 
  | 'accessibility'
  | 'analytics' 
  | 'advertisement'
  | 'content'
  | 'unknown';

export type BusinessFunction = 
  | 'user-management' 
  | 'content-management'
  | 'e-commerce' 
  | 'communication'
  | 'reporting' 
  | 'analytics'
  | 'configuration' 
  | 'integration'
  | 'workflow' 
  | 'media-handling'
  | 'search-discovery' 
  | 'personalization'
  | 'security' 
  | 'compliance'
  | 'generic' 
  | 'unknown';

export interface ElementAttributes {
  required: boolean;
  disabled: boolean;
  readonly: boolean;
  hidden: boolean;
  validation: ValidationInfo;
  placeholder?: string;
  defaultValue?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  accept?: string; // for file inputs
  multiple?: boolean;
  autocomplete?: string;
  spellcheck?: boolean;
  contentEditable?: boolean;
}

export interface ValidationInfo {
  rules: ValidationRule[];
  customValidators: CustomValidator[];
  errorMessages: ErrorMessage[];
}

export interface ValidationRule {
  type: 'required' | 'pattern' | 'min' | 'max' | 'minLength' | 'maxLength' | 'email' | 'url' | 'number' | 'date';
  value?: any;
  message?: string;
  custom?: boolean;
}

export interface CustomValidator {
  pattern?: string;
  function?: string;
  library?: string;
  custom?: boolean;
}

export interface ErrorMessage {
  type: string;
  message: string;
  selector: string;
}

export interface AccessibilityInfo {
  role?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaRequired?: boolean;
  ariaInvalid?: boolean;
  ariaExpanded?: boolean;
  ariaHidden?: boolean;
  tabIndex?: number;
  alt?: string;
  title?: string;
  landmark?: string;
  level?: number; // for headings
  compliance: A11yCompliance;
  issues: A11yIssue[];
}

export interface A11yCompliance {
  wcag: {
    level: 'A' | 'AA' | 'AAA';
    criteria: WCAGCriterion[];
  };
  section508: boolean;
  score: number; // 0-100
}

export interface WCAGCriterion {
  id: string;
  level: 'A' | 'AA' | 'AAA';
  title: string;
  compliant: boolean;
  issues: string[];
}

export interface A11yIssue {
  type: 'error' | 'warning' | 'notice';
  rule: string;
  message: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  suggestion: string;
}

export interface ComputedStyleInfo {
  display: string;
  visibility: string;
  opacity: number;
  zIndex: number;
  position: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontFamily: string;
  border: string;
  padding: string;
  margin: string;
  width: string;
  height: string;
}

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
  viewport: {
    inViewport: boolean;
    percentVisible: number;
  };
}

export interface ElementHierarchy {
  tagName: string;
  id?: string;
  className?: string;
  role?: string;
  level: number; // distance from target element
}

export interface ElementContext {
  page: PageContext;
  form?: FormContext;
  parent?: ElementInfo;
  siblings: ElementInfo[];
  nearbyElements: ElementInfo[];
  relatedElements: RelatedElement[];
}

export interface PageContext {
  url: string;
  title: string;
  language?: string;
  viewport: {
    width: number;
    height: number;
  };
  theme?: 'light' | 'dark' | 'auto';
  framework?: DetectedFramework;
}

export interface DetectedFramework {
  name: string;
  version?: string;
  confidence: number;
  indicators: string[];
}

export interface FormContext {
  selector: string;
  action?: string;
  method?: string;
  enctype?: string;
  fieldCount: number;
  validationLibrary?: string;
  submitButtons: ElementInfo[];
  fieldTypes: string[];
}

export interface RelatedElement {
  element: ElementInfo;
  relationship: ElementRelationship;
  distance: number; // DOM distance
}

export type ElementRelationship = 
  | 'label' 
  | 'error-message' 
  | 'help-text'
  | 'group-member' 
  | 'validation-target'
  | 'toggle-target' 
  | 'modal-trigger'
  | 'dropdown-option' 
  | 'tab-panel'
  | 'accordion-content' 
  | 'pagination-item'
  | 'table-cell' 
  | 'list-item'
  | 'breadcrumb-item' 
  | 'card-element'
  | 'unknown';

export interface TestabilityAssessment {
  canAutomate: boolean;
  automationComplexity: AutomationComplexity;
  reliability: ReliabilityScore;
  maintainability: MaintainabilityScore;
  risks: AutomationRisk[];
  recommendations: AutomationRecommendation[];
}

export type AutomationComplexity = 'trivial' | 'simple' | 'medium' | 'complex' | 'very-complex';

export interface ReliabilityScore {
  overall: number; // 0-100
  factors: {
    selectorStability: number;
    elementStability: number;
    interactionReliability: number;
    crossBrowserCompatibility: number;
  };
}

export interface MaintainabilityScore {
  overall: number; // 0-100
  factors: {
    selectorMaintainability: number;
    codeReadability: number;
    updateFrequency: number;
    testCoverage: number;
  };
}

export interface AutomationRisk {
  type: 'selector-instability' | 'timing-issues' | 'browser-compatibility' | 'security' | 'performance';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigation: string;
}

export interface AutomationRecommendation {
  type: 'selector-improvement' | 'wait-strategy' | 'interaction-method' | 'validation-approach';
  priority: 'low' | 'medium' | 'high';
  description: string;
  implementation: string;
}

export type ElementPriority = 'critical' | 'high' | 'medium' | 'low' | 'ignore';

export interface PageState {
  timestamp: number;
  url: string;
  dom: DOMSnapshot;
  resources: LoadedResource[];
  performance: PerformanceMetrics;
  errors: PageError[];
  framework: DetectedFramework[];
}

export interface DOMSnapshot {
  nodeCount: number;
  depth: number;
  structure: DOMNode[];
  hash: string; // for change detection
}

export interface DOMNode {
  tagName: string;
  id?: string;
  className?: string;
  textContent?: string;
  attributes: Record<string, string>;
  children: DOMNode[];
  depth: number;
}

export interface LoadedResource {
  url: string;
  type: 'script' | 'stylesheet' | 'image' | 'font' | 'document' | 'other';
  size: number;
  loadTime: number;
  status: number;
  cached: boolean;
}

export interface PerformanceMetrics {
  domContentLoaded: number;
  loadComplete: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
  firstInputDelay?: number;
}

export interface PageError {
  type: 'javascript' | 'network' | 'security' | 'csp' | 'mixed-content';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
}

export interface DiscoveryOptions {
  includeHidden?: boolean;
  includeDecorative?: boolean;
  includeThirdParty?: boolean;
  maxDepth?: number;
  timeout?: number;
  generateXPath?: boolean;
  analyzeAccessibility?: boolean;
  capturePageState?: boolean;
  detectFrameworks?: boolean;
  validateSelectors?: boolean;
}

export interface DiscoveryResult {
  elements: DiscoveredElement[];
  pageState?: PageState;
  statistics: DiscoveryStatistics;
  recommendations: DiscoveryRecommendation[];
  errors: string[];
  warnings: string[];
}

export interface DiscoveryStatistics {
  totalElements: number;
  elementsByCategory: Record<ElementCategory, number>;
  elementsByPriority: Record<ElementPriority, number>;
  automationCoverage: number; // percentage of elements that can be automated
  accessibilityScore: number; // 0-100
  performanceScore: number; // 0-100
  analysisTime: number; // milliseconds
}

export interface DiscoveryRecommendation {
  type: 'selector-improvement' | 'accessibility-fix' | 'testability-enhancement' | 'performance-optimization';
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  elements: string[]; // selectors of affected elements
  implementation: string;
  impact: string;
}

export class ElementDiscoveryEngine {
  private puppeteerService: PuppeteerService;
  private discoveryCache: Map<string, DiscoveryResult> = new Map();

  constructor(puppeteerService: PuppeteerService) {
    this.puppeteerService = puppeteerService;
  }

  async discoverElements(
    pageId: string, 
    url: string, 
    options: DiscoveryOptions = {}
  ): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(url, options);
      if (this.discoveryCache.has(cacheKey)) {
        return this.discoveryCache.get(cacheKey)!;
      }

      // Get basic page analysis from PuppeteerService
      const pageAnalysis = await this.puppeteerService.navigateToUrl(pageId, url, {
        waitUntil: 'networkidle2',
        timeout: options.timeout
      });

      // Capture page state if requested
      let pageState: PageState | undefined;
      if (options.capturePageState) {
        pageState = await this.capturePageState(pageId, url);
      }

      // Discover and analyze all elements
      const elements = await this.analyzeAllElements(pageId, pageAnalysis, options, errors, warnings);

      // Generate statistics
      const statistics = this.generateStatistics(elements, Date.now() - startTime);

      // Generate recommendations
      const recommendations = this.generateRecommendations(elements, pageState);

      const result: DiscoveryResult = {
        elements,
        pageState,
        statistics,
        recommendations,
        errors,
        warnings
      };

      // Cache the result
      this.discoveryCache.set(cacheKey, result);

      return result;

    } catch (error) {
      errors.push(`Element discovery failed: ${(error as Error).message}`);
      
      return {
        elements: [],
        statistics: {
          totalElements: 0,
          elementsByCategory: {} as Record<ElementCategory, number>,
          elementsByPriority: {} as Record<ElementPriority, number>,
          automationCoverage: 0,
          accessibilityScore: 0,
          performanceScore: 0,
          analysisTime: Date.now() - startTime
        },
        recommendations: [],
        errors,
        warnings
      };
    }
  }

  private async analyzeAllElements(
    pageId: string,
    pageAnalysis: PageAnalysis,
    options: DiscoveryOptions,
    _errors: string[],
    _warnings: string[]
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Analyze form elements
    for (const form of pageAnalysis.forms) {
      const formElements = await this.analyzeFormElements(pageId, form, options);
      elements.push(...formElements);
    }

    // Analyze interactive elements
    const interactiveElements = await this.analyzeInteractiveElements(
      pageId, 
      pageAnalysis.interactiveElements, 
      options
    );
    elements.push(...interactiveElements);

    // Analyze links
    if (!options.includeDecorative) {
      const linkElements = await this.analyzeLinkElements(pageId, pageAnalysis.links, options);
      elements.push(...linkElements);
    }

    // Analyze images
    const imageElements = await this.analyzeImageElements(pageId, pageAnalysis.images, options);
    elements.push(...imageElements);

    // Discover additional elements using advanced selectors
    const additionalElements = await this.discoverAdditionalElements(pageId, options);
    elements.push(...additionalElements);

    // Remove duplicates and filter based on options
    return this.deduplicateAndFilter(elements, options);
  }

  private async analyzeFormElements(
    pageId: string,
    form: FormInfo,
    options: DiscoveryOptions
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    const formContext: FormContext = {
      selector: form.selector,
      action: form.action,
      method: form.method,
      fieldCount: form.fields.length,
      submitButtons: form.submitButtons,
      fieldTypes: form.fields.map(f => f.type || 'text')
    };

    // Analyze form fields
    for (const field of form.fields) {
      const element = await this.analyzeElement(pageId, field, {
        form: formContext
      }, options);
      elements.push(element);
    }

    // Analyze submit buttons
    for (const button of form.submitButtons) {
      const element = await this.analyzeElement(pageId, button, {
        form: formContext
      }, options);
      elements.push(element);
    }

    return elements;
  }

  private async analyzeInteractiveElements(
    pageId: string,
    interactiveElements: ElementInfo[],
    options: DiscoveryOptions
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    for (const element of interactiveElements) {
      if (!options.includeHidden && !element.isVisible) {
        continue;
      }

      const analyzedElement = await this.analyzeElement(pageId, element, {}, options);
      elements.push(analyzedElement);
    }

    return elements;
  }

  private async analyzeLinkElements(
    pageId: string,
    links: ElementInfo[],
    options: DiscoveryOptions
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    for (const link of links) {
      if (!options.includeHidden && !link.isVisible) {
        continue;
      }

      const analyzedElement = await this.analyzeElement(pageId, link, {}, options);
      elements.push(analyzedElement);
    }

    return elements;
  }

  private async analyzeImageElements(
    pageId: string,
    images: ElementInfo[],
    options: DiscoveryOptions
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    for (const image of images) {
      if (!options.includeDecorative && this.isDecorativeImage(image)) {
        continue;
      }

      const analyzedElement = await this.analyzeElement(pageId, image, {}, options);
      elements.push(analyzedElement);
    }

    return elements;
  }

  private async discoverAdditionalElements(
    pageId: string,
    _options: DiscoveryOptions
  ): Promise<DiscoveredElement[]> {
    const elements: DiscoveredElement[] = [];

    // Discover elements with data-testid attributes
    const testIdElements = await this.findElementsByAttribute(pageId, 'data-testid');
    
    // Discover ARIA landmarks
    const landmarkElements = await this.findAriaLandmarks(pageId);
    
    // Discover custom components (based on common patterns)
    const customElements = await this.findCustomComponents(pageId);

    elements.push(...testIdElements, ...landmarkElements, ...customElements);

    return elements;
  }

  private async analyzeElement(
    pageId: string,
    elementInfo: ElementInfo,
    contextHint: Partial<ElementContext>,
    options: DiscoveryOptions
  ): Promise<DiscoveredElement> {
    // Generate enhanced element info
    const enhancedElement = await this.enhanceElementInfo(pageId, elementInfo);

    // Generate selectors
    const selectors = await this.generateSelectors(pageId, enhancedElement, options);

    // Classify element
    const classification = this.classifyElement(enhancedElement);

    // Extract attributes
    const attributes = await this.extractAttributes(pageId, enhancedElement);

    // Analyze accessibility
    const accessibility = options.analyzeAccessibility 
      ? await this.analyzeAccessibility(pageId, enhancedElement)
      : this.getBasicAccessibilityInfo(enhancedElement);

    // Build context
    const context = await this.buildElementContext(pageId, enhancedElement, contextHint);

    // Assess testability
    const testability = this.assessTestability(enhancedElement, selectors, classification);

    // Calculate priority
    const priority = this.calculateElementPriority(classification, testability, accessibility);

    return {
      element: enhancedElement,
      selectors,
      classification,
      attributes,
      accessibility,
      context,
      testability,
      priority
    };
  }

  private async enhanceElementInfo(pageId: string, elementInfo: ElementInfo): Promise<EnhancedElementInfo> {
    // Get additional information about the element
    const enhancedInfo = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const element = document.querySelector('${elementInfo.selector}');
        if (!element) return null;

        const computedStyle = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        
        // Get data attributes
        const dataAttributes = {};
        for (const attr of element.attributes) {
          if (attr.name.startsWith('data-')) {
            dataAttributes[attr.name] = attr.value;
          }
        }

        // Get parent hierarchy
        const parentElements = [];
        let parent = element.parentElement;
        let level = 1;
        while (parent && level <= 5) {
          parentElements.push({
            tagName: parent.tagName.toLowerCase(),
            id: parent.id || undefined,
            className: parent.className || undefined,
            role: parent.getAttribute('role') || undefined,
            level
          });
          parent = parent.parentElement;
          level++;
        }

        // Get child elements
        const childElements = Array.from(element.children).slice(0, 10).map(child => ({
          tagName: child.tagName.toLowerCase(),
          id: child.id || undefined,
          className: child.className || undefined,
          text: child.textContent?.trim()?.substring(0, 100) || undefined,
          isVisible: child.offsetWidth > 0 && child.offsetHeight > 0,
          isClickable: child.matches('a, button, input, select, textarea, [onclick], [role="button"]'),
          isInput: child.matches('input, textarea, select'),
          isButton: child.matches('button, input[type="submit"], input[type="button"]'),
          isLink: child.matches('a[href]')
        }));

        return {
          dataAttributes,
          computedStyles: {
            display: computedStyle.display,
            visibility: computedStyle.visibility,
            opacity: parseFloat(computedStyle.opacity),
            zIndex: parseInt(computedStyle.zIndex) || 0,
            position: computedStyle.position,
            color: computedStyle.color,
            backgroundColor: computedStyle.backgroundColor,
            fontSize: computedStyle.fontSize,
            fontFamily: computedStyle.fontFamily,
            border: computedStyle.border,
            padding: computedStyle.padding,
            margin: computedStyle.margin,
            width: computedStyle.width,
            height: computedStyle.height
          },
          position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            right: rect.right,
            bottom: rect.bottom,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
            viewport: {
              inViewport: rect.top >= 0 && rect.left >= 0 && 
                         rect.bottom <= window.innerHeight && 
                         rect.right <= window.innerWidth,
              percentVisible: Math.max(0, Math.min(100,
                (Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)) /
                rect.height * 100
              ))
            }
          },
          parentElements,
          childElements
        };
      })()
    `);

    return {
      ...elementInfo,
      dataAttributes: enhancedInfo?.dataAttributes || {},
      computedStyles: enhancedInfo?.computedStyles || {} as ComputedStyleInfo,
      position: enhancedInfo?.position || {} as ElementPosition,
      parentElements: enhancedInfo?.parentElements || [],
      childElements: enhancedInfo?.childElements || []
    };
  }

  private async generateSelectors(
    pageId: string,
    element: EnhancedElementInfo,
    options: DiscoveryOptions
  ): Promise<ElementSelectors> {
    const css = await this.generateCSSSelectors(pageId, element);
    const xpath = options.generateXPath 
      ? await this.generateXPathSelectors(pageId, element)
      : { absolute: '', relative: '', text: [], attribute: [] };
    
    const reliability = this.calculateSelectorReliability(css, xpath, element);

    return {
      css,
      xpath,
      reliability
    };
  }

  private async generateCSSSelectors(pageId: string, element: EnhancedElementInfo): Promise<ElementSelectors['css']> {
    // Generate multiple CSS selector strategies
    const selectors: string[] = [];

    // Strategy 1: data-testid (most reliable)
    if (element.dataAttributes['data-testid']) {
      selectors.push(`[data-testid="${element.dataAttributes['data-testid']}"]`);
    }

    // Strategy 2: ID selector
    if (element.id) {
      selectors.push(`#${element.id}`);
    }

    // Strategy 3: Name attribute
    if (element.name) {
      selectors.push(`[name="${element.name}"]`);
    }

    // Strategy 4: Specific class combinations
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c.trim());
      if (classes.length > 0) {
        selectors.push(`.${classes.join('.')}`);
      }
    }

    // Strategy 5: Attribute-based selectors
    if (element.type) {
      selectors.push(`${element.tagName}[type="${element.type}"]`);
    }

    // Strategy 6: Text-based selector
    if (element.text && element.text.length < 50) {
      selectors.push(`${element.tagName}:contains("${element.text}")`);
    }

    // Strategy 7: Hierarchical selector
    const hierarchical = this.generateHierarchicalSelector(element);
    if (hierarchical) {
      selectors.push(hierarchical);
    }

    // Validate selectors and pick the best ones
    const validatedSelectors = await this.validateSelectors(pageId, selectors);

    return {
      optimal: validatedSelectors[0] || element.selector,
      alternative: validatedSelectors.slice(1, 4),
      stable: this.findMostStableSelector(validatedSelectors, element),
      dataTestId: element.dataAttributes['data-testid']
    };
  }

  private async generateXPathSelectors(pageId: string, element: EnhancedElementInfo): Promise<ElementSelectors['xpath']> {
    const xpaths = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const element = document.querySelector('${element.selector}');
        if (!element) return null;

        // Generate absolute XPath
        function getAbsoluteXPath(el) {
          let path = '';
          while (el && el.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling = el.previousSibling;
            while (sibling) {
              if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === el.tagName) {
                index++;
              }
              sibling = sibling.previousSibling;
            }
            const tagName = el.tagName.toLowerCase();
            path = '/' + tagName + '[' + (index + 1) + ']' + path;
            el = el.parentNode;
          }
          return path;
        }

        // Generate relative XPath
        function getRelativeXPath(el) {
          if (el.id) {
            return '//*[@id="' + el.id + '"]';
          }
          if (el.name) {
            return '//*[@name="' + el.name + '"]';
          }
          if (el.className) {
            const classes = el.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
              return '//*[contains(@class, "' + classes[0] + '")]';
            }
          }
          return getAbsoluteXPath(el);
        }

        // Generate text-based XPaths
        function getTextXPaths(el) {
          const xpaths = [];
          if (el.textContent && el.textContent.trim()) {
            const text = el.textContent.trim();
            xpaths.push('//*[text()="' + text + '"]');
            if (text.length > 10) {
              xpaths.push('//*[contains(text(), "' + text.substring(0, 10) + '")]');
            }
          }
          return xpaths;
        }

        // Generate attribute-based XPaths
        function getAttributeXPaths(el) {
          const xpaths = [];
          const attributes = ['type', 'placeholder', 'value', 'role', 'aria-label'];
          
          attributes.forEach(attr => {
            const value = el.getAttribute(attr);
            if (value) {
              xpaths.push('//*[@' + attr + '="' + value + '"]');
            }
          });

          return xpaths;
        }

        return {
          absolute: getAbsoluteXPath(element),
          relative: getRelativeXPath(element),
          text: getTextXPaths(element),
          attribute: getAttributeXPaths(element)
        };
      })()
    `);

    return xpaths || { absolute: '', relative: '', text: [], attribute: [] };
  }

  private calculateSelectorReliability(
    css: ElementSelectors['css'],
    _xpath: ElementSelectors['xpath'],
    element: EnhancedElementInfo
  ): ElementSelectors['reliability'] {
    const factors: SelectorReliabilityFactor[] = [];
    let totalScore = 0;

    // ID selector - highest reliability
    if (element.id) {
      factors.push({
        type: 'id',
        weight: 30,
        stable: true,
        reason: 'ID attributes are unique and stable'
      });
      totalScore += 30;
    }

    // data-testid - very high reliability
    if (element.dataAttributes['data-testid']) {
      factors.push({
        type: 'data-testid',
        weight: 35,
        stable: true,
        reason: 'Test IDs are specifically for testing'
      });
      totalScore += 35;
    }

    // Class selectors - medium reliability
    if (element.className) {
      const hasUtilityClasses = /\b(btn|button|form|input|nav|header|footer)\b/i.test(element.className);
      factors.push({
        type: 'class',
        weight: hasUtilityClasses ? 15 : 10,
        stable: hasUtilityClasses,
        reason: hasUtilityClasses ? 'Semantic CSS classes' : 'Generic CSS classes may change'
      });
      totalScore += hasUtilityClasses ? 15 : 10;
    }

    // Attribute selectors - good reliability
    if (element.name || element.type) {
      factors.push({
        type: 'attribute',
        weight: 20,
        stable: true,
        reason: 'Form attributes are typically stable'
      });
      totalScore += 20;
    }

    // Text selectors - low reliability
    if (element.text) {
      factors.push({
        type: 'text',
        weight: 5,
        stable: false,
        reason: 'Text content may change with localization'
      });
      totalScore += 5;
    }

    // Position selectors - very low reliability
    if (css.optimal.includes(':nth-')) {
      factors.push({
        type: 'position',
        weight: -10,
        stable: false,
        reason: 'Positional selectors are fragile'
      });
      totalScore -= 10;
    }

    return {
      score: Math.max(0, Math.min(100, totalScore)),
      factors
    };
  }

  private classifyElement(element: EnhancedElementInfo): ElementClassification {
    const tagName = element.tagName.toLowerCase();
    const type = (element.type || '').toLowerCase();
    const role = element.dataAttributes['role'] || '';
    const className = (element.className || '').toLowerCase();
    // const text = (element.text || '').toLowerCase();

    let category: ElementCategory = 'interactive';
    let subType: ElementSubType = 'unknown';
    let interaction: InteractionPattern = 'click';
    let purpose: ElementPurpose = 'unknown';
    let businessFunction: BusinessFunction = 'generic';
    let confidence = 0.5;

    // Classify based on tag name and type
    switch (tagName) {
      case 'input':
        category = 'form-control';
        interaction = this.getInputInteractionPattern(type);
        subType = this.getInputSubType(type);
        purpose = this.getInputPurpose(element);
        confidence = 0.9;
        break;

      case 'button':
        category = 'interactive';
        subType = 'button';
        interaction = 'click';
        purpose = this.getButtonPurpose(element);
        confidence = 0.9;
        break;

      case 'a':
        category = 'navigation';
        subType = 'link';
        interaction = 'click';
        purpose = 'navigation';
        confidence = 0.9;
        break;

      case 'select':
        category = 'form-control';
        subType = element.multiple ? 'multiselect' : 'select';
        interaction = 'select';
        purpose = 'data-entry';
        confidence = 0.9;
        break;

      case 'textarea':
        category = 'form-control';
        subType = 'textarea';
        interaction = 'type';
        purpose = 'data-entry';
        confidence = 0.9;
        break;

      case 'img':
        category = 'media';
        subType = 'image';
        interaction = element.isClickable ? 'click' : 'none';
        purpose = this.isDecorativeImage(element) ? 'decoration' : 'content';
        confidence = 0.8;
        break;

      case 'table':
        category = 'content';
        subType = 'table';
        interaction = 'none';
        purpose = 'data-display';
        confidence = 0.9;
        break;

      default:
        // Use role and class hints
        if (role) {
          const roleClassification = this.classifyByRole(role);
          category = roleClassification.category || 'interactive';
          subType = roleClassification.subType || 'button';
          interaction = roleClassification.interaction || 'none';
          confidence = 0.7;
        } else if (className) {
          const classClassification = this.classifyByClassName(className);
          category = classClassification.category || 'interactive';
          subType = classClassification.subType || 'button';
          interaction = classClassification.interaction || 'none';
          confidence = 0.6;
        }
    }

    // Determine business function
    businessFunction = this.determineBusinessFunction(element, purpose);

    return {
      category,
      subType,
      interaction,
      purpose,
      businessFunction,
      confidence
    };
  }

  private getInputInteractionPattern(type: string): InteractionPattern {
    switch (type) {
      case 'checkbox':
      case 'radio':
        return 'check';
      case 'file':
        return 'upload';
      case 'submit':
      case 'button':
        return 'click';
      case 'range':
        return 'drag';
      default:
        return 'type';
    }
  }

  private getInputSubType(type: string): ElementSubType {
    switch (type) {
      case 'text': return 'text-input';
      case 'email': return 'email-input';
      case 'password': return 'password-input';
      case 'number': return 'number-input';
      case 'checkbox': return 'checkbox';
      case 'radio': return 'radio-group';
      case 'file': return 'file-upload';
      case 'date': return 'date-picker';
      case 'time': return 'time-picker';
      case 'range': return 'range-slider';
      default: return 'text-input';
    }
  }

  private getInputPurpose(element: EnhancedElementInfo): ElementPurpose {
    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();
    const placeholder = (element.placeholder || '').toLowerCase();

    const allText = `${name} ${id} ${placeholder}`.toLowerCase();

    if (/email|mail/.test(allText)) return 'authentication';
    if (/password|pwd|pass/.test(allText)) return 'authentication';
    if (/search|query|find/.test(allText)) return 'search';
    if (/filter|sort/.test(allText)) return 'filter';
    if (/name|firstname|lastname|username/.test(allText)) return 'data-entry';
    if (/phone|mobile|tel/.test(allText)) return 'data-entry';
    if (/address|street|city|zip/.test(allText)) return 'data-entry';

    return 'data-entry';
  }

  private getButtonPurpose(element: EnhancedElementInfo): ElementPurpose {
    const text = (element.text || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    const allText = `${text} ${className} ${id}`.toLowerCase();

    if (/submit|send|save|create|add/.test(allText)) return 'action';
    if (/delete|remove|cancel/.test(allText)) return 'action';
    if (/login|signin|sign.in/.test(allText)) return 'authentication';
    if (/search|find/.test(allText)) return 'search';
    if (/filter|sort/.test(allText)) return 'filter';
    if (/nav|menu|home|back/.test(allText)) return 'navigation';

    return 'action';
  }

  private classifyByRole(role: string): Partial<ElementClassification> {
    switch (role.toLowerCase()) {
      case 'button':
        return { category: 'interactive', subType: 'button', interaction: 'click' };
      case 'link':
        return { category: 'navigation', subType: 'link', interaction: 'click' };
      case 'textbox':
        return { category: 'form-control', subType: 'text-input', interaction: 'type' };
      case 'checkbox':
        return { category: 'form-control', subType: 'checkbox', interaction: 'check' };
      case 'radio':
        return { category: 'form-control', subType: 'radio-group', interaction: 'check' };
      case 'tab':
        return { category: 'navigation', subType: 'tab', interaction: 'click' };
      case 'tabpanel':
        return { category: 'content', subType: 'tab', interaction: 'none' };
      case 'dialog':
      case 'modal':
        return { category: 'layout', subType: 'modal-trigger', interaction: 'click' };
      default:
        return { category: 'interactive', subType: 'unknown', interaction: 'click' };
    }
  }

  private classifyByClassName(className: string): Partial<ElementClassification> {
    if (/btn|button/.test(className)) {
      return { category: 'interactive', subType: 'button', interaction: 'click' };
    }
    if (/nav|navigation/.test(className)) {
      return { category: 'navigation', subType: 'link', interaction: 'click' };
    }
    if (/input|field|form/.test(className)) {
      return { category: 'form-control', subType: 'text-input', interaction: 'type' };
    }
    if (/modal|dialog/.test(className)) {
      return { category: 'layout', subType: 'modal-trigger', interaction: 'click' };
    }
    if (/tab/.test(className)) {
      return { category: 'navigation', subType: 'tab', interaction: 'click' };
    }
    if (/card/.test(className)) {
      return { category: 'content', subType: 'card', interaction: 'none' };
    }

    return { category: 'interactive', subType: 'unknown', interaction: 'click' };
  }

  private determineBusinessFunction(element: EnhancedElementInfo, purpose: ElementPurpose): BusinessFunction {
    const text = (element.text || '').toLowerCase();
    const className = (element.className || '').toLowerCase();
    const allText = `${text} ${className}`.toLowerCase();

    if (purpose === 'authentication') return 'user-management';
    if (/shop|cart|buy|purchase|payment/.test(allText)) return 'e-commerce';
    if (/message|chat|comment|mail/.test(allText)) return 'communication';
    if (/report|analytics|dashboard|chart/.test(allText)) return 'reporting';
    if (/config|settings|admin|manage/.test(allText)) return 'configuration';
    if (/upload|file|media|image|video/.test(allText)) return 'media-handling';
    if (/search|find|discover/.test(allText)) return 'search-discovery';
    if (/profile|personal|preference/.test(allText)) return 'personalization';
    if (/security|auth|permission/.test(allText)) return 'security';

    return 'generic';
  }

  private async extractAttributes(pageId: string, element: EnhancedElementInfo): Promise<ElementAttributes> {
    const attributes = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const element = document.querySelector('${element.selector}');
        if (!element) return null;

        return {
          required: element.hasAttribute('required'),
          disabled: element.hasAttribute('disabled'),
          readonly: element.hasAttribute('readonly'),
          hidden: element.hasAttribute('hidden') || element.style.display === 'none',
          placeholder: element.getAttribute('placeholder'),
          defaultValue: element.defaultValue || element.getAttribute('value'),
          pattern: element.getAttribute('pattern'),
          minLength: parseInt(element.getAttribute('minlength')) || undefined,
          maxLength: parseInt(element.getAttribute('maxlength')) || undefined,
          min: parseFloat(element.getAttribute('min')) || undefined,
          max: parseFloat(element.getAttribute('max')) || undefined,
          step: parseFloat(element.getAttribute('step')) || undefined,
          accept: element.getAttribute('accept'),
          multiple: element.hasAttribute('multiple'),
          autocomplete: element.getAttribute('autocomplete'),
          spellcheck: element.spellcheck,
          contentEditable: element.contentEditable === 'true'
        };
      })()
    `);

    const validation = this.extractValidationInfo(element, attributes);

    return {
      ...attributes,
      validation
    };
  }

  private extractValidationInfo(element: EnhancedElementInfo, attributes: any): ValidationInfo {
    const rules: ValidationRule[] = [];
    const customValidators: CustomValidator[] = [];
    const errorMessages: ErrorMessage[] = [];

    // Standard HTML5 validation rules
    if (attributes.required) {
      rules.push({ type: 'required', message: 'This field is required' });
    }

    if (attributes.pattern) {
      rules.push({ 
        type: 'pattern', 
        value: attributes.pattern, 
        message: 'Please match the requested format' 
      });
    }

    if (attributes.minLength) {
      rules.push({ 
        type: 'minLength', 
        value: attributes.minLength, 
        message: `Minimum length is ${attributes.minLength}` 
      });
    }

    if (attributes.maxLength) {
      rules.push({ 
        type: 'maxLength', 
        value: attributes.maxLength, 
        message: `Maximum length is ${attributes.maxLength}` 
      });
    }

    if (element.type === 'email') {
      rules.push({ type: 'email', message: 'Please enter a valid email address' });
    }

    if (element.type === 'url') {
      rules.push({ type: 'url', message: 'Please enter a valid URL' });
    }

    // Look for custom validation attributes
    Object.entries(element.dataAttributes).forEach(([key, value]) => {
      if (key.startsWith('data-validate')) {
        customValidators.push({
          pattern: value,
          custom: true
        });
      }
    });

    return { rules, customValidators, errorMessages };
  }

  private async analyzeAccessibility(pageId: string, element: EnhancedElementInfo): Promise<AccessibilityInfo> {
    const a11yInfo = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const element = document.querySelector('${element.selector}');
        if (!element) return null;

        return {
          role: element.getAttribute('role'),
          ariaLabel: element.getAttribute('aria-label'),
          ariaLabelledBy: element.getAttribute('aria-labelledby'),
          ariaDescribedBy: element.getAttribute('aria-describedby'),
          ariaRequired: element.getAttribute('aria-required') === 'true',
          ariaInvalid: element.getAttribute('aria-invalid') === 'true',
          ariaExpanded: element.getAttribute('aria-expanded') === 'true',
          ariaHidden: element.getAttribute('aria-hidden') === 'true',
          tabIndex: parseInt(element.getAttribute('tabindex')) || undefined,
          alt: element.getAttribute('alt'),
          title: element.getAttribute('title'),
          landmark: element.closest('[role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]')?.getAttribute('role'),
          level: element.tagName.match(/H[1-6]/) ? parseInt(element.tagName.charAt(1)) : undefined
        };
      })()
    `);

    const compliance = this.assessA11yCompliance(element, a11yInfo);
    const issues = this.findA11yIssues(element, a11yInfo);

    return {
      ...a11yInfo,
      compliance,
      issues
    };
  }

  private getBasicAccessibilityInfo(_element: EnhancedElementInfo): AccessibilityInfo {
    return {
      compliance: {
        wcag: { level: 'A', criteria: [] },
        section508: false,
        score: 0
      },
      issues: []
    };
  }

  private assessA11yCompliance(element: EnhancedElementInfo, a11yInfo: any): A11yCompliance {
    const criteria: WCAGCriterion[] = [];
    let score = 100;

    // Check common WCAG criteria
    
    // 1.1.1 Non-text Content
    if (element.tagName === 'img') {
      const hasAlt = !!a11yInfo.alt;
      criteria.push({
        id: '1.1.1',
        level: 'A',
        title: 'Non-text Content',
        compliant: hasAlt,
        issues: hasAlt ? [] : ['Image missing alt attribute']
      });
      if (!hasAlt) score -= 20;
    }

    // 1.3.1 Info and Relationships
    if (element.isInput) {
      const hasLabel = !!(a11yInfo.ariaLabel || a11yInfo.ariaLabelledBy);
      criteria.push({
        id: '1.3.1',
        level: 'A',
        title: 'Info and Relationships',
        compliant: hasLabel,
        issues: hasLabel ? [] : ['Form input missing label']
      });
      if (!hasLabel) score -= 15;
    }

    // 2.1.1 Keyboard
    const isKeyboardAccessible = a11yInfo.tabIndex !== -1 && (element.isButton || element.isLink || element.isInput);
    criteria.push({
      id: '2.1.1',
      level: 'A',
      title: 'Keyboard',
      compliant: isKeyboardAccessible,
      issues: isKeyboardAccessible ? [] : ['Element not keyboard accessible']
    });
    if (!isKeyboardAccessible) score -= 10;

    // 4.1.2 Name, Role, Value
    const hasValidRole = !!(a11yInfo.role || element.tagName);
    criteria.push({
      id: '4.1.2',
      level: 'A',
      title: 'Name, Role, Value',
      compliant: hasValidRole,
      issues: hasValidRole ? [] : ['Element missing proper role']
    });

    const level = score >= 80 ? 'AA' : score >= 60 ? 'A' : 'A';

    return {
      wcag: { level, criteria },
      section508: score >= 70,
      score: Math.max(0, score)
    };
  }

  private findA11yIssues(element: EnhancedElementInfo, a11yInfo: any): A11yIssue[] {
    const issues: A11yIssue[] = [];

    // Missing alt text for images
    if (element.tagName === 'img' && !a11yInfo.alt) {
      issues.push({
        type: 'error',
        rule: 'img-alt',
        message: 'Image missing alt attribute',
        impact: 'serious',
        suggestion: 'Add descriptive alt text or alt="" for decorative images'
      });
    }

    // Missing labels for form inputs
    if (element.isInput && !a11yInfo.ariaLabel && !a11yInfo.ariaLabelledBy) {
      issues.push({
        type: 'error',
        rule: 'label-missing',
        message: 'Form input missing accessible label',
        impact: 'serious',
        suggestion: 'Add aria-label or associate with a label element'
      });
    }

    // Low color contrast (basic check)
    if (element.computedStyles.color && element.computedStyles.backgroundColor) {
      // This is a simplified check - in reality you'd need proper contrast calculation
      if (element.computedStyles.color === element.computedStyles.backgroundColor) {
        issues.push({
          type: 'warning',
          rule: 'color-contrast',
          message: 'Potential color contrast issue',
          impact: 'moderate',
          suggestion: 'Ensure sufficient color contrast ratio'
        });
      }
    }

    // Missing focus indicators
    if (element.isButton || element.isLink) {
      // This would need more sophisticated checking in real implementation
      issues.push({
        type: 'notice',
        rule: 'focus-visible',
        message: 'Verify focus indicator is visible',
        impact: 'minor',
        suggestion: 'Ensure element has visible focus indicator'
      });
    }

    return issues;
  }

  private async buildElementContext(
    pageId: string,
    element: EnhancedElementInfo,
    contextHint: Partial<ElementContext>
  ): Promise<ElementContext> {
    const pageContext = await this.getPageContext(pageId);
    const nearbyElements = await this.findNearbyElements(pageId, element);
    const relatedElements = await this.findRelatedElements(pageId, element);

    return {
      page: pageContext,
      form: contextHint.form,
      parent: element.parentElements[0] ? {
        tagName: element.parentElements[0].tagName,
        id: element.parentElements[0].id,
        className: element.parentElements[0].className,
        selector: `${element.parentElements[0].tagName}${element.parentElements[0].id ? '#' + element.parentElements[0].id : ''}`,
        isVisible: true,
        isClickable: false,
        isInput: false,
        isButton: false,
        isLink: false
      } : undefined,
      siblings: element.childElements.slice(0, 5),
      nearbyElements,
      relatedElements
    };
  }

  private async getPageContext(pageId: string): Promise<PageContext> {
    const context = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        return {
          url: window.location.href,
          title: document.title,
          language: document.documentElement.lang || 'en',
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          theme: document.documentElement.getAttribute('data-theme') || 
                 (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        };
      })()
    `);

    const framework = await this.detectFramework(pageId);

    return {
      ...context,
      framework
    };
  }

  private async detectFramework(pageId: string): Promise<DetectedFramework | undefined> {
    const detectedFrameworks = await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const frameworks = [];
        
        // React
        if (window.React || document.querySelector('[data-reactroot]')) {
          frameworks.push({
            name: 'React',
            version: window.React?.version,
            confidence: 0.9,
            indicators: ['window.React', 'data-reactroot']
          });
        }

        // Angular
        if (window.angular || window.ng || document.querySelector('[ng-app], [ng-controller]')) {
          frameworks.push({
            name: 'Angular',
            confidence: 0.9,
            indicators: ['ng-app', 'ng-controller', 'window.angular']
          });
        }

        // Vue
        if (window.Vue || document.querySelector('[v-app], [data-v-]')) {
          frameworks.push({
            name: 'Vue.js',
            version: window.Vue?.version,
            confidence: 0.9,
            indicators: ['window.Vue', 'v-app', 'data-v-']
          });
        }

        // jQuery
        if (window.jQuery || window.$) {
          frameworks.push({
            name: 'jQuery',
            version: window.jQuery?.fn?.jquery,
            confidence: 0.8,
            indicators: ['window.jQuery', 'window.$']
          });
        }

        return frameworks[0]; // Return the first/most likely framework
      })()
    `);

    return detectedFrameworks;
  }

  private async findNearbyElements(_pageId: string, element: EnhancedElementInfo): Promise<ElementInfo[]> {
    // Find elements within a certain distance (simplified implementation)
    return element.childElements.slice(0, 3);
  }

  private async findRelatedElements(pageId: string, element: EnhancedElementInfo): Promise<RelatedElement[]> {
    const related: RelatedElement[] = [];

    // Find label elements
    if (element.id) {
      const label = await this.puppeteerService.evaluateScript(pageId, `
        document.querySelector('label[for="${element.id}"]')?.textContent
      `);
      
      if (label) {
        related.push({
          element: {
            tagName: 'label',
            text: label,
            selector: `label[for="${element.id}"]`,
            isVisible: true,
            isClickable: false,
            isInput: false,
            isButton: false,
            isLink: false
          },
          relationship: 'label',
          distance: 1
        });
      }
    }

    return related;
  }

  private assessTestability(
    element: EnhancedElementInfo,
    selectors: ElementSelectors,
    classification: ElementClassification
  ): TestabilityAssessment {
    let canAutomate = true;
    let complexity: AutomationComplexity = 'simple';
    const risks: AutomationRisk[] = [];
    const recommendations: AutomationRecommendation[] = [];

    // Check if element is visible and interactable
    if (!element.isVisible) {
      canAutomate = false;
      risks.push({
        type: 'selector-instability',
        severity: 'high',
        description: 'Element is not visible',
        mitigation: 'Check element visibility before interaction'
      });
    }

    // Assess selector reliability
    if (selectors.reliability.score < 50) {
      complexity = 'complex';
      risks.push({
        type: 'selector-instability',
        severity: 'medium',
        description: 'Selectors may be unreliable',
        mitigation: 'Use more stable selectors like data-testid'
      });
      
      recommendations.push({
        type: 'selector-improvement',
        priority: 'high',
        description: 'Add data-testid attribute for better test reliability',
        implementation: `Add data-testid="${element.tagName}-${element.id || 'element'}" to the element`
      });
    }

    // Check interaction complexity
    if (classification.interaction === 'drag' || classification.interaction === 'upload') {
      complexity = complexity === 'simple' ? 'medium' : 'complex';
    }

    // File upload complexity
    if (element.type === 'file') {
      complexity = 'complex';
      recommendations.push({
        type: 'interaction-method',
        priority: 'medium',
        description: 'File upload requires special handling',
        implementation: 'Use uploadFile() method instead of type()'
      });
    }

    // Dynamic content risks
    if (element.className && /loading|spinner|dynamic/.test(element.className)) {
      risks.push({
        type: 'timing-issues',
        severity: 'medium',
        description: 'Element may have dynamic content',
        mitigation: 'Add proper wait conditions'
      });
      
      recommendations.push({
        type: 'wait-strategy',
        priority: 'high',
        description: 'Implement proper waiting strategy',
        implementation: 'Use waitForElement() or waitForStableContent()'
      });
    }

    const reliability: ReliabilityScore = {
      overall: selectors.reliability.score,
      factors: {
        selectorStability: selectors.reliability.score,
        elementStability: element.isVisible ? 80 : 20,
        interactionReliability: this.getInteractionReliability(classification.interaction),
        crossBrowserCompatibility: this.getCrossBrowserCompatibility(element)
      }
    };

    const maintainability: MaintainabilityScore = {
      overall: this.calculateMaintainabilityScore(element, selectors),
      factors: {
        selectorMaintainability: selectors.reliability.score,
        codeReadability: element.dataAttributes['data-testid'] ? 90 : 60,
        updateFrequency: 70, // Estimated
        testCoverage: 50 // Estimated
      }
    };

    return {
      canAutomate,
      automationComplexity: complexity,
      reliability,
      maintainability,
      risks,
      recommendations
    };
  }

  private getInteractionReliability(interaction: InteractionPattern): number {
    switch (interaction) {
      case 'click': return 95;
      case 'type': return 90;
      case 'select': return 85;
      case 'check': return 90;
      case 'upload': return 60;
      case 'drag': return 50;
      case 'hover': return 70;
      default: return 75;
    }
  }

  private getCrossBrowserCompatibility(element: EnhancedElementInfo): number {
    // Basic compatibility check
    if (element.dataAttributes['data-testid']) return 95;
    if (element.id) return 90;
    if (element.name) return 85;
    if (element.className) return 75;
    return 60;
  }

  private calculateMaintainabilityScore(element: EnhancedElementInfo, selectors: ElementSelectors): number {
    let score = 50;
    
    if (element.dataAttributes['data-testid']) score += 30;
    if (element.id) score += 20;
    if (selectors.reliability.score > 70) score += 15;
    if (element.text && element.text.length < 50) score += 10;
    
    return Math.min(100, score);
  }

  private calculateElementPriority(
    classification: ElementClassification,
    testability: TestabilityAssessment,
    accessibility: AccessibilityInfo
  ): ElementPriority {
    let score = 0;

    // Classification priority
    switch (classification.category) {
      case 'form-control': score += 30; break;
      case 'interactive': score += 25; break;
      case 'navigation': score += 20; break;
      case 'content': score += 10; break;
      default: score += 5;
    }

    // Purpose priority
    switch (classification.purpose) {
      case 'authentication': score += 30; break;
      case 'action': score += 25; break;
      case 'data-entry': score += 20; break;
      case 'navigation': score += 15; break;
      default: score += 5;
    }

    // Testability penalty
    if (!testability.canAutomate) score -= 40;
    if (testability.automationComplexity === 'very-complex') score -= 20;
    if (testability.automationComplexity === 'complex') score -= 10;

    // Accessibility bonus
    if (accessibility.compliance.score > 80) score += 10;

    // Business function bonus
    if (classification.businessFunction !== 'generic') score += 10;

    if (score >= 60) return 'critical';
    if (score >= 40) return 'high';
    if (score >= 20) return 'medium';
    if (score >= 10) return 'low';
    return 'ignore';
  }

  // Helper methods
  private isDecorativeImage(element: ElementInfo | EnhancedElementInfo): boolean {
    const alt = ('alt' in element ? element.alt : '') || '';
    const role = ('role' in element ? element.role : '') || '';
    return alt === '' || role === 'presentation' || role === 'none';
  }

  private generateHierarchicalSelector(element: EnhancedElementInfo): string {
    if (element.parentElements.length === 0) return '';
    
    const parent = element.parentElements[0];
    const parentSelector = parent.id ? `#${parent.id}` : 
                         parent.className ? `.${parent.className.split(' ')[0]}` :
                         parent.tagName;
    
    return `${parentSelector} ${element.tagName}`;
  }

  private async validateSelectors(pageId: string, selectors: string[]): Promise<string[]> {
    const validSelectors: string[] = [];
    
    for (const selector of selectors) {
      try {
        const elementExists = await this.puppeteerService.evaluateScript(pageId, `
          !!document.querySelector('${selector}')
        `);
        
        if (elementExists) {
          validSelectors.push(selector);
        }
      } catch (error) {
        // Invalid selector, skip it
        continue;
      }
    }
    
    return validSelectors;
  }

  private findMostStableSelector(selectors: string[], element: EnhancedElementInfo): string {
    // Priority order: data-testid > id > name > class > other
    for (const selector of selectors) {
      if (selector.includes('data-testid')) return selector;
    }
    
    for (const selector of selectors) {
      if (selector.startsWith('#')) return selector;
    }
    
    for (const selector of selectors) {
      if (selector.includes('[name=')) return selector;
    }
    
    return selectors[0] || element.selector;
  }

  private async findElementsByAttribute(_pageId: string, _attribute: string): Promise<DiscoveredElement[]> {
    // Implementation would find all elements with specific attribute
    return [];
  }

  private async findAriaLandmarks(_pageId: string): Promise<DiscoveredElement[]> {
    // Implementation would find ARIA landmark elements
    return [];
  }

  private async findCustomComponents(_pageId: string): Promise<DiscoveredElement[]> {
    // Implementation would find custom web components
    return [];
  }

  private deduplicateAndFilter(elements: DiscoveredElement[], options: DiscoveryOptions): DiscoveredElement[] {
    // Remove duplicates based on selector
    const seen = new Set<string>();
    const unique = elements.filter(el => {
      const key = el.element.selector;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Filter based on options
    return unique.filter(el => {
      if (!options.includeHidden && !el.element.isVisible) return false;
      if (!options.includeDecorative && el.classification.purpose === 'decoration') return false;
      if (el.priority === 'ignore') return false;
      return true;
    });
  }

  private async capturePageState(pageId: string, url: string): Promise<PageState> {
    const dom = await this.captureDOMSnapshot(pageId);
    const resources = await this.getLoadedResources(pageId);
    const performance = await this.getPerformanceMetrics(pageId);
    const errors = await this.getPageErrors(pageId);
    const framework = [await this.detectFramework(pageId)].filter(Boolean) as DetectedFramework[];

    return {
      timestamp: Date.now(),
      url,
      dom,
      resources,
      performance,
      errors,
      framework
    };
  }

  private async captureDOMSnapshot(pageId: string): Promise<DOMSnapshot> {
    return await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        function captureNode(node, depth = 0) {
          if (depth > 10) return null; // Limit depth
          
          const result = {
            tagName: node.tagName?.toLowerCase() || 'text',
            id: node.id || undefined,
            className: node.className || undefined,
            textContent: node.nodeType === Node.TEXT_NODE ? 
              node.textContent?.trim()?.substring(0, 100) : undefined,
            attributes: {},
            children: [],
            depth
          };

          if (node.attributes) {
            for (const attr of node.attributes) {
              result.attributes[attr.name] = attr.value;
            }
          }

          if (node.children && depth < 5) {
            for (const child of Array.from(node.children).slice(0, 50)) {
              const childNode = captureNode(child, depth + 1);
              if (childNode) result.children.push(childNode);
            }
          }

          return result;
        }

        const structure = [captureNode(document.documentElement)];
        const nodeCount = document.querySelectorAll('*').length;
        
        return {
          nodeCount,
          depth: 0,
          structure,
          hash: btoa(document.documentElement.outerHTML.substring(0, 1000))
        };
      })()
    `);
  }

  private async getLoadedResources(_pageId: string): Promise<LoadedResource[]> {
    // Implementation would capture network resources
    return [];
  }

  private async getPerformanceMetrics(pageId: string): Promise<PerformanceMetrics> {
    return await this.puppeteerService.evaluateScript(pageId, `
      (function() {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');
        
        return {
          domContentLoaded: nav?.domContentLoadedEventEnd || 0,
          loadComplete: nav?.loadEventEnd || 0,
          firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
          firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0
        };
      })()
    `);
  }

  private async getPageErrors(_pageId: string): Promise<PageError[]> {
    // Implementation would capture JavaScript errors and other issues
    return [];
  }

  private generateStatistics(elements: DiscoveredElement[], analysisTime: number): DiscoveryStatistics {
    const totalElements = elements.length;
    
    const elementsByCategory = elements.reduce((acc, el) => {
      acc[el.classification.category] = (acc[el.classification.category] || 0) + 1;
      return acc;
    }, {} as Record<ElementCategory, number>);

    const elementsByPriority = elements.reduce((acc, el) => {
      acc[el.priority] = (acc[el.priority] || 0) + 1;
      return acc;
    }, {} as Record<ElementPriority, number>);

    const automatable = elements.filter(el => el.testability.canAutomate).length;
    const automationCoverage = totalElements > 0 ? (automatable / totalElements) * 100 : 0;

    const avgAccessibilityScore = elements.reduce((sum, el) => 
      sum + el.accessibility.compliance.score, 0) / totalElements || 0;

    // Simple performance score based on analysis time
    const performanceScore = Math.max(0, 100 - (analysisTime / 100));

    return {
      totalElements,
      elementsByCategory,
      elementsByPriority,
      automationCoverage,
      accessibilityScore: avgAccessibilityScore,
      performanceScore,
      analysisTime
    };
  }

  private generateRecommendations(elements: DiscoveredElement[], _pageState?: PageState): DiscoveryRecommendation[] {
    const recommendations: DiscoveryRecommendation[] = [];

    // Selector improvement recommendations
    const unstableElements = elements.filter(el => el.selectors.reliability.score < 50);
    if (unstableElements.length > 0) {
      recommendations.push({
        type: 'selector-improvement',
        priority: 'high',
        description: `${unstableElements.length} elements have unreliable selectors`,
        elements: unstableElements.map(el => el.element.selector),
        implementation: 'Add data-testid attributes to these elements',
        impact: 'Improved test reliability and maintainability'
      });
    }

    // Accessibility recommendations
    const a11yIssues = elements.flatMap(el => el.accessibility.issues);
    if (a11yIssues.length > 0) {
      recommendations.push({
        type: 'accessibility-fix',
        priority: 'medium',
        description: `Found ${a11yIssues.length} accessibility issues`,
        elements: elements.filter(el => el.accessibility.issues.length > 0).map(el => el.element.selector),
        implementation: 'Add missing alt texts, labels, and ARIA attributes',
        impact: 'Improved accessibility and compliance'
      });
    }

    return recommendations;
  }

  private generateCacheKey(url: string, options: DiscoveryOptions): string {
    return `${url}_${JSON.stringify(options)}`;
  }

  // Public utility methods
  async clearCache(): Promise<void> {
    this.discoveryCache.clear();
  }

  async getCacheSize(): Promise<number> {
    return this.discoveryCache.size;
  }

  async getElementBySelector(_pageId: string, _selector: string): Promise<DiscoveredElement | null> {
    // Implementation would find a specific element by selector
    return null;
  }
}