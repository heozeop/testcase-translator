import { PuppeteerService } from './PuppeteerService';
import { ElementDiscoveryEngine, DiscoveredElement } from './ElementDiscoveryEngine';
import { DynamicInputCollectionEngine, CollectedInput } from './DynamicInputCollectionEngine';

// Re-export CollectedInput for other modules
export { CollectedInput };
import { TestCaseParser, NavigationPlan } from './TestCaseParser';

export interface NavigationAction {
  id: string;
  type: 'visit' | 'click' | 'type' | 'select' | 'submit' | 'wait' | 'scroll' | 'hover' | 'screenshot';
  timestamp: number;
  selector?: string;
  value?: any;
  url?: string;
  coordinates?: { x: number; y: number };
  duration?: number;
  success: boolean;
  error?: string;
  metadata?: {
    elementText?: string;
    pageTitle?: string;
    currentUrl?: string;
    viewportSize?: { width: number; height: number };
  };
}

export interface PageState {
  id: string;
  url: string;
  title: string;
  timestamp: number;
  domSnapshot?: string;
  screenshotPath?: string;
  viewportSize: { width: number; height: number };
  loadTime: number;
  httpStatus?: number;
  elements: DiscoveredElement[];
  forms: FormState[];
  errors: string[];
  metadata: {
    userAgent: string;
    cookies: any[];
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
  };
}

export interface FormState {
  selector: string;
  action?: string;
  method?: string;
  elements: FormElementState[];
  isSubmitted: boolean;
  submissionResult?: {
    success: boolean;
    redirectUrl?: string;
    error?: string;
  };
}

export interface FormElementState {
  selector: string;
  type: string;
  name?: string;
  value?: any;
  required: boolean;
  placeholder?: string;
  validation: {
    isValid: boolean;
    errors: string[];
  };
}

export interface NavigationSequence {
  id: string;
  sessionId: string;
  testCaseId?: string;
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startUrl: string;
  finalUrl?: string;
  actions: NavigationAction[];
  pageStates: PageState[];
  collectedInputs: CollectedInput[];
  navigationPlan?: NavigationPlan;
  totalDuration: number;
  errorCount: number;
  completionPercentage: number;
  metrics: {
    totalPages: number;
    uniquePages: number;
    formsEncountered: number;
    formsCompleted: number;
    elementsDiscovered: number;
    screenshotsTaken: number;
    errorsEncountered: number;
  };
}

export interface ExplorationSession {
  id: string;
  projectId?: string;
  testCaseId?: string;
  userId?: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  navigationSequences: NavigationSequence[];
  totalDuration: number;
  settings: {
    screenshotFrequency: 'never' | 'key-points' | 'all-actions' | 'on-error';
    domSnapshotEnabled: boolean;
    maxNavigationDepth: number;
    timeout: number;
  };
  summary: {
    totalActions: number;
    totalPages: number;
    totalInputsCollected: number;
    successRate: number;
    avgPageLoadTime: number;
  };
}

export interface ExplorationResult {
  session: ExplorationSession;
  cypressCompatibleData: CypressScriptData;
  rawData: {
    navigationSequences: NavigationSequence[];
    screenshots: string[];
    domSnapshots: string[];
    collectdInputs: CollectedInput[];
  };
  metadata: {
    generatedAt: number;
    version: string;
    engine: string;
    compatibility: string[];
  };
}

export interface CypressScriptData {
  testSuites: CypressTestSuite[];
  fixtures: Record<string, any>;
  customCommands: CypressCustomCommand[];
  configuration: CypressConfiguration;
}

export interface CypressTestSuite {
  name: string;
  description: string;
  beforeEach?: string[];
  afterEach?: string[];
  tests: CypressTest[];
}

export interface CypressTest {
  name: string;
  description: string;
  tags: string[];
  commands: CypressCommand[];
  assertions: CypressAssertion[];
  dependencies: string[];
}

export interface CypressCommand {
  type: 'visit' | 'get' | 'click' | 'type' | 'select' | 'submit' | 'wait' | 'screenshot';
  selector?: string;
  value?: any;
  options?: Record<string, any>;
  timeout?: number;
  retry?: boolean;
}

export interface CypressAssertion {
  type: 'should' | 'expect' | 'assert';
  selector?: string;
  condition: string;
  value?: any;
  message?: string;
}

export interface CypressCustomCommand {
  name: string;
  implementation: string;
  parameters: string[];
  description: string;
}

export interface CypressConfiguration {
  baseUrl?: string;
  viewport: { width: number; height: number };
  defaultCommandTimeout: number;
  pageLoadTimeout: number;
  requestTimeout: number;
  env: Record<string, any>;
  retries: number;
}

export interface StorageOptions {
  enableScreenshots: boolean;
  enableDomSnapshots: boolean;
  screenshotQuality: number;
  compressionLevel: number;
  maxFileSize: number;
  retentionDays: number;
  storageLocation: 'database' | 'filesystem' | 'hybrid';
  encryptSensitiveData: boolean;
}

export class ExplorationResultsStorage {
  private puppeteerService: PuppeteerService;
  private elementDiscovery: ElementDiscoveryEngine;
  // private inputCollection: DynamicInputCollectionEngine;
  // private testCaseParser: TestCaseParser;

  private activeSessions: Map<string, ExplorationSession> = new Map();
  private activeSequences: Map<string, NavigationSequence> = new Map();
  private storageOptions: StorageOptions;

  constructor(
    puppeteerService: PuppeteerService,
    elementDiscovery: ElementDiscoveryEngine,
    _inputCollection: DynamicInputCollectionEngine,
    _testCaseParser: TestCaseParser,
    storageOptions: Partial<StorageOptions> = {}
  ) {
    this.puppeteerService = puppeteerService;
    this.elementDiscovery = elementDiscovery;
    // this.inputCollection = _inputCollection;
    // this.testCaseParser = _testCaseParser;

    this.storageOptions = {
      enableScreenshots: true,
      enableDomSnapshots: true,
      screenshotQuality: 80,
      compressionLevel: 6,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      retentionDays: 30,
      storageLocation: 'hybrid',
      encryptSensitiveData: true,
      ...storageOptions
    };
  }

  async createExplorationSession(
    projectId?: string,
    testCaseId?: string,
    userId?: string,
    settings: Partial<ExplorationSession['settings']> = {}
  ): Promise<ExplorationSession> {
    const sessionId = this.generateSessionId();
    
    const session: ExplorationSession = {
      id: sessionId,
      projectId,
      testCaseId,
      userId,
      status: 'active',
      startTime: Date.now(),
      navigationSequences: [],
      totalDuration: 0,
      settings: {
        screenshotFrequency: 'key-points',
        domSnapshotEnabled: true,
        maxNavigationDepth: 10,
        timeout: 30000,
        ...settings
      },
      summary: {
        totalActions: 0,
        totalPages: 0,
        totalInputsCollected: 0,
        successRate: 0,
        avgPageLoadTime: 0
      }
    };

    this.activeSessions.set(sessionId, session);
    console.log(`Created exploration session: ${sessionId}`);
    
    return session;
  }

  async startNavigationSequence(
    sessionId: string,
    startUrl: string,
    testCaseId?: string,
    navigationPlan?: NavigationPlan
  ): Promise<NavigationSequence> {
    const sequenceId = this.generateSequenceId();
    
    const sequence: NavigationSequence = {
      id: sequenceId,
      sessionId,
      testCaseId,
      startTime: Date.now(),
      status: 'active',
      startUrl,
      actions: [],
      pageStates: [],
      collectedInputs: [],
      navigationPlan,
      totalDuration: 0,
      errorCount: 0,
      completionPercentage: 0,
      metrics: {
        totalPages: 0,
        uniquePages: 0,
        formsEncountered: 0,
        formsCompleted: 0,
        elementsDiscovered: 0,
        screenshotsTaken: 0,
        errorsEncountered: 0
      }
    };

    this.activeSequences.set(sequenceId, sequence);
    
    // Add to session
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.navigationSequences.push(sequence);
    }

    console.log(`Started navigation sequence: ${sequenceId} for session: ${sessionId}`);
    return sequence;
  }

  async recordNavigationAction(
    sequenceId: string,
    action: Omit<NavigationAction, 'id' | 'timestamp'>
  ): Promise<NavigationAction> {
    const sequence = this.activeSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Navigation sequence ${sequenceId} not found`);
    }

    const fullAction: NavigationAction = {
      id: this.generateActionId(),
      timestamp: Date.now(),
      ...action
    };

    sequence.actions.push(fullAction);
    
    // Update metrics
    sequence.metrics.totalPages = new Set(sequence.pageStates.map(ps => ps.url)).size;
    if (!fullAction.success) {
      sequence.errorCount++;
      sequence.metrics.errorsEncountered++;
    }

    // Update session summary
    const session = this.activeSessions.get(sequence.sessionId);
    if (session) {
      session.summary.totalActions++;
    }

    console.log(`Recorded action: ${fullAction.type} for sequence: ${sequenceId}`);
    return fullAction;
  }

  async capturePageState(
    sequenceId: string,
    pageId: string,
    url: string,
    captureScreenshot: boolean = true
  ): Promise<PageState> {
    const sequence = this.activeSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Navigation sequence ${sequenceId} not found`);
    }

    const startTime = Date.now();
    
    try {
      // Get page title and basic info
      const title = await this.puppeteerService.evaluateScript(pageId, 'document.title') || 'Page';
      const viewportSize = { width: 1280, height: 720 }; // Default viewport
      
      // Discover elements
      const discoveryResult = await this.elementDiscovery.discoverElements(pageId, url, {
        includeHidden: false,
        generateXPath: true,
        analyzeAccessibility: true,
        capturePageState: false // Avoid recursion
      });

      // Capture screenshot if enabled
      let screenshotPath: string | undefined;
      if (captureScreenshot && this.storageOptions.enableScreenshots) {
        const screenshot = await this.puppeteerService.screenshot(pageId);
        screenshotPath = await this.saveScreenshot(sequenceId, screenshot);
        sequence.metrics.screenshotsTaken++;
      }

      // Capture DOM snapshot if enabled
      let domSnapshot: string | undefined;
      if (this.storageOptions.enableDomSnapshots) {
        domSnapshot = await this.captureDomSnapshot(pageId);
      }

      // Get browser state
      const cookies: any[] = []; // getCookies method not available, using empty array
      const localStorage = await this.getBrowserStorage(pageId, 'localStorage');
      const sessionStorage = await this.getBrowserStorage(pageId, 'sessionStorage');

      // Analyze forms
      const forms = await this.analyzePageForms(discoveryResult.elements);

      const pageState: PageState = {
        id: this.generatePageStateId(),
        url,
        title,
        timestamp: Date.now(),
        domSnapshot,
        screenshotPath,
        viewportSize,
        loadTime: Date.now() - startTime,
        elements: discoveryResult.elements,
        forms,
        errors: discoveryResult.errors || [],
        metadata: {
          userAgent: 'Mozilla/5.0 (default)', // getUserAgent method not available
          cookies,
          localStorage,
          sessionStorage
        }
      };

      sequence.pageStates.push(pageState);
      sequence.metrics.elementsDiscovered += discoveryResult.elements.length;
      sequence.metrics.formsEncountered += forms.length;

      // Update session metrics
      const session = this.activeSessions.get(sequence.sessionId);
      if (session) {
        session.summary.totalPages++;
        const totalLoadTime = sequence.pageStates.reduce((sum, ps) => sum + ps.loadTime, 0);
        session.summary.avgPageLoadTime = totalLoadTime / sequence.pageStates.length;
      }

      console.log(`Captured page state for ${url} in sequence: ${sequenceId}`);
      return pageState;

    } catch (error) {
      console.error('Failed to capture page state:', error);
      throw error;
    }
  }

  async recordCollectedInput(
    sequenceId: string,
    input: CollectedInput
  ): Promise<void> {
    const sequence = this.activeSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Navigation sequence ${sequenceId} not found`);
    }

    sequence.collectedInputs.push(input);

    // Update session summary
    const session = this.activeSessions.get(sequence.sessionId);
    if (session) {
      session.summary.totalInputsCollected++;
    }

    console.log(`Recorded collected input for field: ${input.fieldName} in sequence: ${sequenceId}`);
  }

  async completeNavigationSequence(
    sequenceId: string,
    finalUrl?: string
  ): Promise<NavigationSequence> {
    const sequence = this.activeSequences.get(sequenceId);
    if (!sequence) {
      throw new Error(`Navigation sequence ${sequenceId} not found`);
    }

    sequence.status = 'completed';
    sequence.endTime = Date.now();
    sequence.totalDuration = sequence.endTime - sequence.startTime;
    sequence.finalUrl = finalUrl;

    // Calculate completion percentage
    if (sequence.navigationPlan) {
      const plannedSteps = sequence.navigationPlan.navigationSequence.length;
      const completedSteps = sequence.actions.filter(a => a.success).length;
      sequence.completionPercentage = plannedSteps > 0 ? (completedSteps / plannedSteps) * 100 : 100;
    } else {
      sequence.completionPercentage = sequence.errorCount === 0 ? 100 : 80;
    }

    // Update metrics
    sequence.metrics.uniquePages = new Set(sequence.pageStates.map(ps => ps.url)).size;
    sequence.metrics.formsCompleted = sequence.pageStates
      .flatMap(ps => ps.forms)
      .filter(f => f.isSubmitted && f.submissionResult?.success).length;

    console.log(`Completed navigation sequence: ${sequenceId} with ${sequence.completionPercentage}% completion`);
    
    // Save to persistent storage
    await this.persistNavigationSequence(sequence);
    
    return sequence;
  }

  async completeExplorationSession(sessionId: string): Promise<ExplorationSession> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Exploration session ${sessionId} not found`);
    }

    session.status = 'completed';
    session.endTime = Date.now();
    session.totalDuration = session.endTime - session.startTime;

    // Calculate session summary
    const allSequences = session.navigationSequences;
    const completedSequences = allSequences.filter(seq => seq.status === 'completed');
    
    session.summary.successRate = allSequences.length > 0 
      ? (completedSequences.length / allSequences.length) * 100 
      : 0;

    console.log(`Completed exploration session: ${sessionId} with ${session.summary.successRate}% success rate`);
    
    // Save to persistent storage
    await this.persistExplorationSession(session);
    
    return session;
  }

  async generateExplorationResult(sessionId: string): Promise<ExplorationResult> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Exploration session ${sessionId} not found`);
    }

    // Generate Cypress-compatible data
    const cypressData = await this.generateCypressScriptData(session);

    // Collect raw data
    const screenshots = session.navigationSequences
      .flatMap(seq => seq.pageStates)
      .filter(ps => ps.screenshotPath)
      .map(ps => ps.screenshotPath!);

    const domSnapshots = session.navigationSequences
      .flatMap(seq => seq.pageStates)
      .filter(ps => ps.domSnapshot)
      .map(ps => ps.domSnapshot!);

    const collectedInputs = session.navigationSequences
      .flatMap(seq => seq.collectedInputs);

    const result: ExplorationResult = {
      session,
      cypressCompatibleData: cypressData,
      rawData: {
        navigationSequences: session.navigationSequences,
        screenshots,
        domSnapshots,
        collectdInputs: collectedInputs
      },
      metadata: {
        generatedAt: Date.now(),
        version: '1.0.0',
        engine: 'TestCase-Translator-Explorer',
        compatibility: ['cypress@12.x', 'cypress@13.x']
      }
    };

    // Save complete result
    await this.persistExplorationResult(result);

    console.log(`Generated exploration result for session: ${sessionId}`);
    return result;
  }

  private async analyzePageForms(elements: DiscoveredElement[]): Promise<FormState[]> {
    const forms: FormState[] = [];
    const formElements = elements.filter(el => el.element.tagName.toLowerCase() === 'form');

    for (const formElement of formElements) {
      const formInputs = elements.filter(el => 
        el.context.form?.selector === formElement.element.selector
      );

      const formState: FormState = {
        selector: formElement.element.selector,
        action: formElement.element.href || '', // action property not available
        method: 'GET', // method property not available
        elements: formInputs.map(input => ({
          selector: input.element.selector,
          type: input.element.type || 'text',
          name: input.element.name,
          value: input.element.value,
          required: false, // required property not available
          placeholder: input.element.placeholder,
          validation: {
            isValid: true,
            errors: []
          }
        })),
        isSubmitted: false
      };

      forms.push(formState);
    }

    return forms;
  }

  private async captureDomSnapshot(pageId: string): Promise<string> {
    try {
      return await this.puppeteerService.evaluateScript(pageId, 'document.documentElement.outerHTML');
    } catch (error) {
      console.error('Failed to capture DOM snapshot:', error);
      return '';
    }
  }

  private async getBrowserStorage(pageId: string, storageType: 'localStorage' | 'sessionStorage'): Promise<Record<string, string>> {
    try {
      const script = `
        const storage = {};
        for (let i = 0; i < ${storageType}.length; i++) {
          const key = ${storageType}.key(i);
          storage[key] = ${storageType}.getItem(key);
        }
        return storage;
      `;
      return await this.puppeteerService.evaluateScript(pageId, script) || {};
    } catch (error) {
      console.error(`Failed to get ${storageType}:`, error);
      return {};
    }
  }

  private async saveScreenshot(sequenceId: string, _screenshot: Buffer): Promise<string> {
    const filename = `screenshot_${sequenceId}_${Date.now()}.png`;
    const filepath = `/tmp/screenshots/${filename}`;
    
    // In a real implementation, save to configured storage location
    // For now, return the path where it would be saved
    console.log(`Screenshot would be saved to: ${filepath}`);
    return filepath;
  }

  private async generateCypressScriptData(session: ExplorationSession): Promise<CypressScriptData> {
    const testSuites: CypressTestSuite[] = [];
    const fixtures: Record<string, any> = {};
    const customCommands: CypressCustomCommand[] = [];

    // Generate test suites from navigation sequences
    for (const sequence of session.navigationSequences) {
      const testSuite: CypressTestSuite = {
        name: `Navigation Sequence ${sequence.id}`,
        description: `Generated from exploration of ${sequence.startUrl}`,
        beforeEach: ['cy.visit(\'/\')'],
        afterEach: ['cy.clearCookies()', 'cy.clearLocalStorage()'],
        tests: await this.generateCypressTests(sequence)
      };
      testSuites.push(testSuite);

      // Add collected inputs as fixtures
      if (sequence.collectedInputs.length > 0) {
        fixtures[`inputs_${sequence.id}`] = sequence.collectedInputs.reduce((acc, input) => {
          acc[input.fieldName] = input.value;
          return acc;
        }, {} as Record<string, any>);
      }
    }

    const configuration: CypressConfiguration = {
      baseUrl: session.navigationSequences[0]?.startUrl,
      viewport: { width: 1280, height: 720 },
      defaultCommandTimeout: session.settings.timeout,
      pageLoadTimeout: 30000,
      requestTimeout: 10000,
      env: {},
      retries: 2
    };

    return {
      testSuites,
      fixtures,
      customCommands,
      configuration
    };
  }

  private async generateCypressTests(sequence: NavigationSequence): Promise<CypressTest[]> {
    const tests: CypressTest[] = [];
    
    // Group actions by page/URL
    const actionsByPage = new Map<string, NavigationAction[]>();
    
    for (const action of sequence.actions) {
      const url = action.url || action.metadata?.currentUrl || 'unknown';
      if (!actionsByPage.has(url)) {
        actionsByPage.set(url, []);
      }
      actionsByPage.get(url)!.push(action);
    }

    // Generate test for each page
    for (const [url, actions] of actionsByPage) {
      const test: CypressTest = {
        name: `Test interactions on ${url}`,
        description: `Generated test for page interactions`,
        tags: ['generated', 'exploration'],
        commands: actions.map(action => this.convertActionToCypressCommand(action)),
        assertions: this.generateAssertionsFromPageStates(sequence.pageStates.filter(ps => ps.url === url)),
        dependencies: []
      };
      tests.push(test);
    }

    return tests;
  }

  private convertActionToCypressCommand(action: NavigationAction): CypressCommand {
    switch (action.type) {
      case 'visit':
        return {
          type: 'visit',
          value: action.url,
          options: { timeout: 30000 }
        };
      case 'click':
        return {
          type: 'click',
          selector: action.selector,
          options: { timeout: 10000 }
        };
      case 'type':
        return {
          type: 'type',
          selector: action.selector,
          value: action.value,
          options: { delay: 100 }
        };
      case 'select':
        return {
          type: 'select',
          selector: action.selector,
          value: action.value
        };
      case 'screenshot':
        return {
          type: 'screenshot',
          options: { capture: 'viewport' }
        };
      default:
        return {
          type: 'wait',
          value: 1000
        };
    }
  }

  private generateAssertionsFromPageStates(pageStates: PageState[]): CypressAssertion[] {
    const assertions: CypressAssertion[] = [];
    
    for (const pageState of pageStates) {
      // Add URL assertion
      assertions.push({
        type: 'should',
        condition: 'include',
        value: pageState.url,
        message: `Should be on ${pageState.url}`
      });

      // Add title assertion if available
      if (pageState.title) {
        assertions.push({
          type: 'should',
          condition: 'contain',
          value: pageState.title,
          message: `Page title should contain ${pageState.title}`
        });
      }
    }

    return assertions;
  }

  private async persistNavigationSequence(sequence: NavigationSequence): Promise<void> {
    // In a real implementation, save to database
    console.log(`Persisting navigation sequence: ${sequence.id}`);
  }

  private async persistExplorationSession(session: ExplorationSession): Promise<void> {
    // In a real implementation, save to database
    console.log(`Persisting exploration session: ${session.id}`);
  }

  private async persistExplorationResult(result: ExplorationResult): Promise<void> {
    // In a real implementation, save to database and/or file system
    console.log(`Persisting exploration result for session: ${result.session.id}`);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSequenceId(): string {
    return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateActionId(): string {
    return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generatePageStateId(): string {
    return `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods for retrieval
  async getExplorationSession(sessionId: string): Promise<ExplorationSession | null> {
    return this.activeSessions.get(sessionId) || null;
  }

  async getNavigationSequence(sequenceId: string): Promise<NavigationSequence | null> {
    return this.activeSequences.get(sequenceId) || null;
  }

  async getSessionResults(sessionId: string): Promise<ExplorationResult | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return null;

    return await this.generateExplorationResult(sessionId);
  }

  async getAllActiveSessions(): Promise<ExplorationSession[]> {
    return Array.from(this.activeSessions.values());
  }

  async getSessionsByProject(projectId: string): Promise<ExplorationSession[]> {
    return Array.from(this.activeSessions.values()).filter(s => s.projectId === projectId);
  }

  async getSessionsByTestCase(testCaseId: string): Promise<ExplorationSession[]> {
    return Array.from(this.activeSessions.values()).filter(s => s.testCaseId === testCaseId);
  }
}