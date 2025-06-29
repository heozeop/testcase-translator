import { PuppeteerService } from './PuppeteerService';
import { ElementDiscoveryEngine } from './ElementDiscoveryEngine';
import { DynamicInputCollectionEngine } from './DynamicInputCollectionEngine';
import { TestCaseParser, NavigationPlan } from './TestCaseParser';
import { ExplorationResultsStorage, ExplorationSession, NavigationSequence, ExplorationResult } from './ExplorationResultsStorage';
import { ScreenshotService } from './ScreenshotService';
import { ExplorationResultRepository } from '../repositories/ExplorationResultRepository';
import { WebSocketServerManager } from '../websocket/WebSocketServer';

export interface ExplorationConfig {
  enableScreenshots: boolean;
  screenshotFrequency: 'never' | 'key-points' | 'all-actions' | 'on-error';
  enableDomSnapshots: boolean;
  enableInputCollection: boolean;
  maxNavigationDepth: number;
  actionTimeout: number;
  pageLoadTimeout: number;
  retryFailedActions: boolean;
  maxRetries: number;
  enableAutoRecovery: boolean;
  userExperienceMode: 'minimal' | 'guided' | 'comprehensive';
}

export interface ExplorationProgress {
  sessionId: string;
  currentSequenceId?: string;
  status: 'starting' | 'navigating' | 'collecting-input' | 'capturing-state' | 'completing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentUrl: string;
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  errors: string[];
  estimatedTimeRemaining: number;
}

export interface ExplorationRequest {
  projectId?: string;
  testCaseId?: string;
  userId?: string;
  startUrl: string;
  navigationPlan?: NavigationPlan;
  config: Partial<ExplorationConfig>;
  clientId?: string; // For WebSocket updates
}

export class ExplorationOrchestrator {
  private puppeteerService: PuppeteerService;
  private elementDiscovery: ElementDiscoveryEngine;
  // private inputCollection: DynamicInputCollectionEngine;
  // private testCaseParser: TestCaseParser;
  private resultsStorage: ExplorationResultsStorage;
  private screenshotService: ScreenshotService;
  private repository: ExplorationResultRepository;
  private wsManager?: WebSocketServerManager;

  private activeExplorations: Map<string, ExplorationProgress> = new Map();
  private defaultConfig: ExplorationConfig = {
    enableScreenshots: true,
    screenshotFrequency: 'key-points',
    enableDomSnapshots: true,
    enableInputCollection: true,
    maxNavigationDepth: 10,
    actionTimeout: 30000,
    pageLoadTimeout: 30000,
    retryFailedActions: true,
    maxRetries: 3,
    enableAutoRecovery: true,
    userExperienceMode: 'guided'
  };

  constructor(
    puppeteerService: PuppeteerService,
    elementDiscovery: ElementDiscoveryEngine,
    _inputCollection: DynamicInputCollectionEngine,
    _testCaseParser: TestCaseParser,
    resultsStorage: ExplorationResultsStorage,
    screenshotService: ScreenshotService,
    repository: ExplorationResultRepository,
    wsManager?: WebSocketServerManager
  ) {
    this.puppeteerService = puppeteerService;
    this.elementDiscovery = elementDiscovery;
    // this.inputCollection = _inputCollection;
    // this.testCaseParser = _testCaseParser;
    this.resultsStorage = resultsStorage;
    this.screenshotService = screenshotService;
    this.repository = repository;
    this.wsManager = wsManager;
  }

  async startExploration(request: ExplorationRequest): Promise<string> {
    const config = { ...this.defaultConfig, ...request.config };
    
    try {
      // Create exploration session
      const session = await this.resultsStorage.createExplorationSession(
        request.projectId,
        request.testCaseId,
        request.userId,
        {
          screenshotFrequency: config.screenshotFrequency,
          domSnapshotEnabled: config.enableDomSnapshots,
          maxNavigationDepth: config.maxNavigationDepth,
          timeout: config.actionTimeout
        }
      );

      // Initialize progress tracking
      const progress: ExplorationProgress = {
        sessionId: session.id,
        status: 'starting',
        progress: 0,
        currentUrl: request.startUrl,
        currentStep: 'Initializing exploration',
        totalSteps: request.navigationPlan?.navigationSequence.length || 5,
        completedSteps: 0,
        errors: [],
        estimatedTimeRemaining: this.estimateTimeRemaining(config, request.navigationPlan)
      };

      this.activeExplorations.set(session.id, progress);

      // Send initial progress update
      if (request.clientId && this.wsManager) {
        await this.sendProgressUpdate(request.clientId, progress);
      }

      // Start exploration in background
      this.performExploration(session, request, config).catch(error => {
        console.error('Exploration failed:', error);
        progress.status = 'failed';
        progress.errors.push((error as Error).message);
        if (request.clientId && this.wsManager) {
          this.sendProgressUpdate(request.clientId, progress);
        }
      });

      console.log(`Started exploration session: ${session.id}`);
      return session.id;

    } catch (error) {
      console.error('Failed to start exploration:', error);
      throw error;
    }
  }

  private async performExploration(
    session: ExplorationSession,
    request: ExplorationRequest,
    config: ExplorationConfig
  ): Promise<void> {
    const progress = this.activeExplorations.get(session.id)!;
    let pageId: string | undefined;
    let currentSequence: NavigationSequence | undefined;

    try {
      // Initialize browser
      progress.status = 'starting';
      progress.currentStep = 'Launching browser';
      await this.updateProgress(request.clientId, progress);

      pageId = `exploration_${session.id}_${Date.now()}`;
      await this.puppeteerService.createPage(pageId);
      await this.puppeteerService.setViewport(pageId, { width: 1280, height: 720 });

      // Start navigation sequence
      currentSequence = await this.resultsStorage.startNavigationSequence(
        session.id,
        request.startUrl,
        request.testCaseId,
        request.navigationPlan
      );

      progress.currentSequenceId = currentSequence.id;
      progress.status = 'navigating';
      progress.currentStep = 'Navigating to start URL';
      progress.progress = 10;
      await this.updateProgress(request.clientId, progress);

      // Navigate to start URL
      await this.performNavigation(pageId, request.startUrl, currentSequence, config);
      progress.completedSteps++;

      // Capture initial page state
      progress.currentStep = 'Capturing initial page state';
      progress.progress = 20;
      await this.updateProgress(request.clientId, progress);

      await this.capturePageStateWithScreenshot(
        pageId,
        currentSequence.id,
        request.startUrl,
        config
      );

      // Execute navigation plan or perform dynamic exploration
      if (request.navigationPlan) {
        await this.executeNavigationPlan(
          pageId,
          currentSequence,
          request.navigationPlan,
          config,
          progress,
          request.clientId
        );
      } else {
        await this.performDynamicExploration(
          pageId,
          currentSequence,
          config,
          progress,
          request.clientId
        );
      }

      // Complete sequence
      const finalUrl = await this.puppeteerService.getCurrentUrl(pageId);
      await this.resultsStorage.completeNavigationSequence(currentSequence.id, finalUrl);

      // Complete session
      await this.resultsStorage.completeExplorationSession(session.id);

      // Generate final results
      progress.status = 'completing';
      progress.currentStep = 'Generating final results';
      progress.progress = 90;
      await this.updateProgress(request.clientId, progress);

      const explorationResult = await this.resultsStorage.generateExplorationResult(session.id);
      await this.repository.saveExplorationResult(explorationResult);

      // Complete
      progress.status = 'completed';
      progress.currentStep = 'Exploration completed successfully';
      progress.progress = 100;
      progress.estimatedTimeRemaining = 0;
      await this.updateProgress(request.clientId, progress);

      console.log(`Completed exploration session: ${session.id}`);

    } catch (error) {
      console.error('Exploration failed:', error);
      
      // Record error
      if (currentSequence) {
        await this.resultsStorage.recordNavigationAction(currentSequence.id, {
          type: 'screenshot',
          success: false,
          error: (error as Error).message
        });

        // Take error screenshot if possible
        if (pageId && config.enableScreenshots) {
          try {
            await this.screenshotService.captureErrorScreenshot(
              pageId,
              session.id,
              progress.currentUrl,
              (error as Error).message,
              currentSequence.id
            );
          } catch (screenshotError) {
            console.warn('Failed to capture error screenshot:', screenshotError);
          }
        }
      }

      progress.status = 'failed';
      progress.errors.push((error as Error).message);
      await this.updateProgress(request.clientId, progress);

      throw error;

    } finally {
      // Cleanup
      if (pageId) {
        try {
          await this.puppeteerService.closePage(pageId);
        } catch (error) {
          console.warn('Failed to close page:', error);
        }
      }
    }
  }

  private async executeNavigationPlan(
    pageId: string,
    sequence: NavigationSequence,
    plan: NavigationPlan,
    config: ExplorationConfig,
    progress: ExplorationProgress,
    clientId?: string
  ): Promise<void> {
    const steps = plan.navigationSequence;
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      progress.currentStep = `Executing step ${i + 1}: ${step.type} ${step.target}`;
      progress.progress = 20 + (i / steps.length) * 60;
      await this.updateProgress(clientId, progress);

      try {
        await this.executeNavigationStep(pageId, sequence, step, config);
        progress.completedSteps++;

        // Capture state after each major step
        if (config.screenshotFrequency === 'all-actions' || 
            (config.screenshotFrequency === 'key-points' && step.type === 'click')) {
          const currentUrl = await this.puppeteerService.getCurrentUrl(pageId);
          await this.capturePageStateWithScreenshot(pageId, sequence.id, currentUrl, config);
        }

      } catch (error) {
        console.error(`Navigation step ${i + 1} failed:`, error);
        
        // Record failed action
        await this.resultsStorage.recordNavigationAction(sequence.id, {
          type: step.type as any,
          success: false,
          error: (error as Error).message,
          selector: step.target,
          value: step.value
        });

        // Retry if enabled
        if (config.retryFailedActions && (step as any).retryCount < config.maxRetries) {
          (step as any).retryCount = ((step as any).retryCount || 0) + 1;
          console.log(`Retrying step ${i + 1}, attempt ${(step as any).retryCount}`);
          i--; // Retry same step
          continue;
        }

        // Skip step or fail based on configuration
        if (config.enableAutoRecovery) {
          progress.errors.push(`Step ${i + 1} failed: ${(error as Error).message}`);
          continue;
        } else {
          throw error;
        }
      }
    }
  }

  private async performDynamicExploration(
    pageId: string,
    sequence: NavigationSequence,
    config: ExplorationConfig,
    progress: ExplorationProgress,
    clientId?: string
  ): Promise<void> {
    let depth = 0;
    const visitedUrls = new Set<string>();
    
    while (depth < config.maxNavigationDepth) {
      const currentUrl = await this.puppeteerService.getCurrentUrl(pageId);
      
      if (visitedUrls.has(currentUrl)) {
        console.log('Already visited URL, stopping exploration');
        break;
      }
      
      visitedUrls.add(currentUrl);
      
      progress.currentStep = `Exploring page ${depth + 1} (${currentUrl})`;
      progress.progress = 20 + (depth / config.maxNavigationDepth) * 60;
      await this.updateProgress(clientId, progress);

      // Discover elements and analyze page
      const discoveryResult = await this.elementDiscovery.discoverElements(pageId, currentUrl, {
        includeHidden: false,
        generateXPath: true,
        analyzeAccessibility: true,
        capturePageState: true
      });

      // Capture page state
      await this.capturePageStateWithScreenshot(pageId, sequence.id, currentUrl, config);

      // Look for interactive elements to explore
      const interactiveElements = discoveryResult.elements.filter(el => 
        el.classification.category === 'interactive' && 
        el.testability.canAutomate &&
        (el.element.tagName.toLowerCase() === 'a' || 
         el.element.tagName.toLowerCase() === 'button')
      );

      if (interactiveElements.length === 0) {
        console.log('No more interactive elements found, stopping exploration');
        break;
      }

      // Select a random interactive element to explore
      const elementToClick = interactiveElements[0];
      
      try {
        await this.puppeteerService.clickElement(pageId, elementToClick.selectors.css.optimal);
        
        await this.resultsStorage.recordNavigationAction(sequence.id, {
          type: 'click',
          success: true,
          selector: elementToClick.selectors.css.optimal,
          metadata: {
            elementText: (elementToClick.element as any).textContent || elementToClick.element.text,
            currentUrl: currentUrl
          }
        });

        // Wait for page to load
        await this.puppeteerService.waitForElement(pageId, 'body', 5000);
        
      } catch (error) {
        console.warn('Failed to click element:', error);
        break;
      }

      depth++;
      progress.completedSteps++;
    }
  }

  private async executeNavigationStep(
    pageId: string,
    sequence: NavigationSequence,
    step: any,
    config: ExplorationConfig
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      switch (step.action) {
        case 'navigate':
          await this.performNavigation(pageId, step.url, sequence, config);
          break;
          
        case 'click':
          await this.puppeteerService.clickElement(pageId, step.selector);
          break;
          
        case 'type':
          await this.puppeteerService.typeText(pageId, step.selector, step.value);
          break;
          
        case 'select':
          await this.puppeteerService.selectOption(pageId, step.selector, step.value);
          break;
          
        case 'submit':
          await this.puppeteerService.clickElement(pageId, step.target + ' [type="submit"], ' + step.target + ' button[type="submit"]');
          break;
          
        case 'wait':
          await this.puppeteerService.waitForElement(pageId, step.target, (step as any).timeout || config.actionTimeout);
          break;
          
        default:
          throw new Error(`Unknown action type: ${step.action}`);
      }

      // Record successful action
      await this.resultsStorage.recordNavigationAction(sequence.id, {
        type: step.action,
        success: true,
        selector: step.selector,
        value: step.value,
        url: step.url,
        duration: Date.now() - startTime
      });

    } catch (error) {
      // Record failed action
      await this.resultsStorage.recordNavigationAction(sequence.id, {
        type: step.action,
        success: false,
        selector: step.selector,
        value: step.value,
        url: step.url,
        duration: Date.now() - startTime,
        error: (error as Error).message
      });
      
      throw error;
    }
  }

  private async performNavigation(
    pageId: string,
    url: string,
    sequence: NavigationSequence,
    config: ExplorationConfig
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      await this.puppeteerService.navigateToUrl(pageId, url, { timeout: config.pageLoadTimeout });
      
      await this.resultsStorage.recordNavigationAction(sequence.id, {
        type: 'visit',
        success: true,
        url: url,
        duration: Date.now() - startTime
      });

    } catch (error) {
      await this.resultsStorage.recordNavigationAction(sequence.id, {
        type: 'visit',
        success: false,
        url: url,
        duration: Date.now() - startTime,
        error: (error as Error).message
      });
      
      throw error;
    }
  }

  private async capturePageStateWithScreenshot(
    pageId: string,
    sequenceId: string,
    url: string,
    config: ExplorationConfig
  ): Promise<void> {
    try {
      // Capture screenshot if enabled
      if (config.enableScreenshots && config.screenshotFrequency !== 'never') {
        await this.screenshotService.capturePageScreenshot(
          pageId,
          sequenceId,
          url,
          sequenceId,
          'navigation'
        );
      }

      // Capture page state
      await this.resultsStorage.capturePageState(
        sequenceId,
        pageId,
        url,
        config.enableScreenshots && config.screenshotFrequency !== 'never'
      );

    } catch (error) {
      console.warn('Failed to capture page state:', error);
    }
  }

  private async updateProgress(clientId: string | undefined, progress: ExplorationProgress): Promise<void> {
    this.activeExplorations.set(progress.sessionId, progress);
    
    if (clientId && this.wsManager) {
      await this.sendProgressUpdate(clientId, progress);
    }
  }

  private async sendProgressUpdate(clientId: string, progress: ExplorationProgress): Promise<void> {
    if (!this.wsManager) return;

    try {
      const message = {
        type: 'EXPLORATION_PROGRESS',
        payload: progress,
        timestamp: Date.now()
      };

      this.wsManager.sendToClient(clientId, message as any);
    } catch (error) {
      console.warn('Failed to send progress update:', error);
    }
  }

  private estimateTimeRemaining(config: ExplorationConfig, plan?: NavigationPlan): number {
    const baseTime = 30000; // 30 seconds base
    const stepTime = 10000; // 10 seconds per step
    
    if (plan) {
      return baseTime + (plan.navigationSequence.length * stepTime);
    } else {
      return baseTime + (config.maxNavigationDepth * stepTime);
    }
  }

  // Public API methods
  async getExplorationProgress(sessionId: string): Promise<ExplorationProgress | null> {
    return this.activeExplorations.get(sessionId) || null;
  }

  async getExplorationResult(sessionId: string): Promise<ExplorationResult | null> {
    return await this.resultsStorage.getSessionResults(sessionId);
  }

  async cancelExploration(sessionId: string): Promise<boolean> {
    const progress = this.activeExplorations.get(sessionId);
    if (!progress) return false;

    progress.status = 'failed';
    progress.errors.push('Exploration cancelled by user');
    
    // Mark session as cancelled - no specific cancelSession method available
    // await this.resultsStorage.completeExplorationSession(sessionId);
    this.activeExplorations.delete(sessionId);
    
    console.log(`Cancelled exploration session: ${sessionId}`);
    return true;
  }

  async getAllActiveSessions(): Promise<ExplorationProgress[]> {
    return Array.from(this.activeExplorations.values());
  }

  async getSessionsByProject(projectId: string): Promise<ExplorationSession[]> {
    return await this.resultsStorage.getSessionsByProject(projectId);
  }

  async cleanupCompletedSessions(): Promise<number> {
    let cleanedCount = 0;
    
    for (const [sessionId, progress] of this.activeExplorations) {
      if (progress.status === 'completed' || progress.status === 'failed') {
        this.activeExplorations.delete(sessionId);
        cleanedCount++;
      }
    }

    console.log(`Cleaned up ${cleanedCount} completed exploration sessions`);
    return cleanedCount;
  }
}