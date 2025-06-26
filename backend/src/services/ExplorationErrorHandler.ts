export interface ExplorationError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  context: ErrorContext;
  timestamp: number;
  stackTrace?: string;
  recovery?: RecoveryStrategy;
}

export type ErrorType = 
  | 'navigation'
  | 'timeout' 
  | 'element-not-found'
  | 'network'
  | 'permission'
  | 'javascript'
  | 'browser'
  | 'validation'
  | 'resource'
  | 'security'
  | 'unknown';

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low' | 'warning';

export interface ErrorContext {
  pageId: string;
  url?: string;
  selector?: string;
  action?: string;
  userAgent?: string;
  browserVersion?: string;
  viewport?: { width: number; height: number };
  networkConditions?: string;
  additionalData?: Record<string, any>;
}

export interface RecoveryStrategy {
  strategy: RecoveryType;
  description: string;
  steps: string[];
  maxRetries: number;
  backoffMs: number;
  conditions: string[];
}

export type RecoveryType = 
  | 'retry'
  | 'fallback'
  | 'skip'
  | 'reload'
  | 'restart'
  | 'alternative'
  | 'manual'
  | 'abort';

export interface ErrorPattern {
  pattern: RegExp;
  errorType: ErrorType;
  severity: ErrorSeverity;
  commonCauses: string[];
  recoveryStrategies: RecoveryStrategy[];
}

export interface ErrorReport {
  summary: {
    totalErrors: number;
    criticalErrors: number;
    recoveredErrors: number;
    unrecoveredErrors: number;
  };
  errorsByType: Map<ErrorType, ExplorationError[]>;
  errorsBySeverity: Map<ErrorSeverity, ExplorationError[]>;
  recoverySuccess: Map<RecoveryType, number>;
  recommendations: string[];
}

export class ExplorationErrorHandler {
  private errors: ExplorationError[] = [];
  private errorPatterns: ErrorPattern[] = [];
  private recoveryAttempts: Map<string, number> = new Map();

  constructor() {
    this.initializeErrorPatterns();
  }

  handleError(error: Error | string, context: ErrorContext): ExplorationError {
    const explorationError = this.categorizeError(error, context);
    this.errors.push(explorationError);
    
    // Log error for debugging
    this.logError(explorationError);
    
    return explorationError;
  }

  async attemptRecovery(
    explorationError: ExplorationError,
    puppeteerService: any
  ): Promise<boolean> {
    if (!explorationError.recovery) {
      return false;
    }

    const recoveryKey = `${explorationError.context.pageId}-${explorationError.type}`;
    const attempts = this.recoveryAttempts.get(recoveryKey) || 0;
    
    if (attempts >= explorationError.recovery.maxRetries) {
      console.warn(`Max recovery attempts reached for ${recoveryKey}`);
      return false;
    }

    this.recoveryAttempts.set(recoveryKey, attempts + 1);
    
    try {
      // Apply backoff delay
      if (attempts > 0) {
        const delay = explorationError.recovery.backoffMs * Math.pow(2, attempts - 1);
        await this.sleep(delay);
      }

      const success = await this.executeRecoveryStrategy(
        explorationError.recovery,
        explorationError.context,
        puppeteerService
      );

      if (success) {
        console.log(`Recovery successful for ${recoveryKey} after ${attempts + 1} attempts`);
        this.recoveryAttempts.delete(recoveryKey);
      }

      return success;
    } catch (recoveryError) {
      console.error(`Recovery attempt failed for ${recoveryKey}:`, recoveryError);
      return false;
    }
  }

  private categorizeError(error: Error | string, context: ErrorContext): ExplorationError {
    const errorMessage = error instanceof Error ? error.message : error;
    const stackTrace = error instanceof Error ? error.stack : undefined;
    
    // Find matching error pattern
    const pattern = this.errorPatterns.find(p => p.pattern.test(errorMessage));
    
    if (pattern) {
      return {
        type: pattern.errorType,
        severity: pattern.severity,
        message: errorMessage,
        context,
        timestamp: Date.now(),
        stackTrace,
        recovery: this.selectRecoveryStrategy(pattern.recoveryStrategies, context)
      };
    }

    // Default categorization
    return {
      type: 'unknown',
      severity: 'medium',
      message: errorMessage,
      context,
      timestamp: Date.now(),
      stackTrace,
      recovery: this.getDefaultRecoveryStrategy()
    };
  }

  private selectRecoveryStrategy(
    strategies: RecoveryStrategy[],
    context: ErrorContext
  ): RecoveryStrategy | undefined {
    // Select the most appropriate recovery strategy based on context
    for (const strategy of strategies) {
      if (this.evaluateRecoveryConditions(strategy.conditions, context)) {
        return strategy;
      }
    }
    
    return strategies[0]; // Return first strategy as fallback
  }

  private evaluateRecoveryConditions(conditions: string[], context: ErrorContext): boolean {
    return conditions.every(condition => {
      switch (condition) {
        case 'has-network':
          return true; // Assume network is available
        case 'browser-responsive':
          return true; // Assume browser is responsive
        case 'page-active':
          return !!context.pageId;
        case 'url-accessible':
          return !!context.url;
        default:
          return true;
      }
    });
  }

  private async executeRecoveryStrategy(
    strategy: RecoveryStrategy,
    context: ErrorContext,
    puppeteerService: any
  ): Promise<boolean> {
    console.log(`Executing recovery strategy: ${strategy.strategy} for ${context.pageId}`);
    
    try {
      switch (strategy.strategy) {
        case 'retry':
          return await this.retryOperation(context, puppeteerService);
        
        case 'reload':
          return await this.reloadPage(context, puppeteerService);
        
        case 'restart':
          return await this.restartBrowser(context, puppeteerService);
        
        case 'fallback':
          return await this.fallbackStrategy(context, puppeteerService);
        
        case 'skip':
          return true; // Skip and continue
        
        case 'alternative':
          return await this.useAlternativeMethod(context, puppeteerService);
        
        default:
          return false;
      }
    } catch (error) {
      console.error(`Recovery strategy ${strategy.strategy} failed:`, error);
      return false;
    }
  }

  private async retryOperation(context: ErrorContext, puppeteerService: any): Promise<boolean> {
    if (!context.action || !context.selector) {
      return false;
    }

    try {
      // Wait a moment before retry
      await this.sleep(1000);
      
      // Retry the original operation
      switch (context.action) {
        case 'click':
          return await puppeteerService.clickElement(context.pageId, context.selector);
        case 'type':
          return await puppeteerService.typeText(context.pageId, context.selector, 'retry-text');
        case 'navigate':
          if (context.url) {
            await puppeteerService.navigateToUrl(context.pageId, context.url);
            return true;
          }
          return false;
        default:
          return false;
      }
    } catch (error) {
      return false;
    }
  }

  private async reloadPage(context: ErrorContext, puppeteerService: any): Promise<boolean> {
    try {
      if (context.url) {
        await puppeteerService.navigateToUrl(context.pageId, context.url);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private async restartBrowser(context: ErrorContext, puppeteerService: any): Promise<boolean> {
    try {
      await puppeteerService.close();
      await puppeteerService.initialize();
      
      if (context.url) {
        await puppeteerService.navigateToUrl(context.pageId, context.url);
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  private async fallbackStrategy(context: ErrorContext, puppeteerService: any): Promise<boolean> {
    // Implement fallback strategies based on error type
    if (context.selector) {
      // Try alternative selectors
      const alternativeSelectors = this.generateAlternativeSelectors(context.selector);
      
      for (const altSelector of alternativeSelectors) {
        try {
          const element = await puppeteerService.waitForElement(context.pageId, altSelector, 5000);
          if (element) {
            return true;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return false;
  }

  private async useAlternativeMethod(context: ErrorContext, puppeteerService: any): Promise<boolean> {
    // Use alternative interaction methods
    if (context.action === 'click' && context.selector) {
      try {
        // Try keyboard navigation instead of click
        await puppeteerService.typeText(context.pageId, context.selector, '\n');
        return true;
      } catch (error) {
        // Try JavaScript click
        return false; // Would implement JS click here
      }
    }
    
    return false;
  }

  private generateAlternativeSelectors(originalSelector: string): string[] {
    const alternatives: string[] = [];
    
    // Remove nth-of-type selectors
    const withoutNth = originalSelector.replace(/:nth-of-type\(\d+\)/g, '');
    if (withoutNth !== originalSelector) {
      alternatives.push(withoutNth);
    }
    
    // Try with different attributes
    if (originalSelector.includes('[')) {
      const baseSelector = originalSelector.split('[')[0];
      alternatives.push(baseSelector);
    }
    
    // Try just the tag name
    const tagMatch = originalSelector.match(/^(\w+)/);
    if (tagMatch) {
      alternatives.push(tagMatch[1]);
    }
    
    return alternatives;
  }

  private getDefaultRecoveryStrategy(): RecoveryStrategy {
    return {
      strategy: 'retry',
      description: 'Retry the operation after a short delay',
      steps: ['Wait 1 second', 'Retry original operation'],
      maxRetries: 3,
      backoffMs: 1000,
      conditions: ['browser-responsive']
    };
  }

  private initializeErrorPatterns(): void {
    this.errorPatterns = [
      {
        pattern: /timeout|timed out/i,
        errorType: 'timeout',
        severity: 'high',
        commonCauses: ['Slow network', 'Heavy page load', 'Unresponsive element'],
        recoveryStrategies: [
          {
            strategy: 'retry',
            description: 'Retry with longer timeout',
            steps: ['Increase timeout', 'Retry operation'],
            maxRetries: 2,
            backoffMs: 2000,
            conditions: ['has-network']
          }
        ]
      },
      {
        pattern: /element not found|no such element/i,
        errorType: 'element-not-found',
        severity: 'medium',
        commonCauses: ['Dynamic content', 'Incorrect selector', 'Page not loaded'],
        recoveryStrategies: [
          {
            strategy: 'fallback',
            description: 'Try alternative selectors',
            steps: ['Generate alternative selectors', 'Try each selector'],
            maxRetries: 3,
            backoffMs: 1000,
            conditions: ['page-active']
          }
        ]
      },
      {
        pattern: /network error|net::/i,
        errorType: 'network',
        severity: 'critical',
        commonCauses: ['No internet connection', 'DNS issues', 'Firewall blocking'],
        recoveryStrategies: [
          {
            strategy: 'retry',
            description: 'Retry network operation',
            steps: ['Wait for network', 'Retry request'],
            maxRetries: 5,
            backoffMs: 5000,
            conditions: ['has-network']
          }
        ]
      },
      {
        pattern: /permission denied|access denied/i,
        errorType: 'permission',
        severity: 'critical',
        commonCauses: ['Insufficient permissions', 'CORS policy', 'Authentication required'],
        recoveryStrategies: [
          {
            strategy: 'skip',
            description: 'Skip the restricted operation',
            steps: ['Log permission issue', 'Continue with next operation'],
            maxRetries: 1,
            backoffMs: 0,
            conditions: []
          }
        ]
      },
      {
        pattern: /javascript error|script error/i,
        errorType: 'javascript',
        severity: 'medium',
        commonCauses: ['Page JavaScript errors', 'Conflicting scripts', 'Unsupported features'],
        recoveryStrategies: [
          {
            strategy: 'reload',
            description: 'Reload page to clear JavaScript state',
            steps: ['Reload page', 'Wait for load', 'Retry operation'],
            maxRetries: 2,
            backoffMs: 3000,
            conditions: ['url-accessible']
          }
        ]
      },
      {
        pattern: /browser|chrome|puppeteer/i,
        errorType: 'browser',
        severity: 'critical',
        commonCauses: ['Browser crash', 'Out of memory', 'Browser bug'],
        recoveryStrategies: [
          {
            strategy: 'restart',
            description: 'Restart browser instance',
            steps: ['Close browser', 'Initialize new browser', 'Navigate to page'],
            maxRetries: 1,
            backoffMs: 5000,
            conditions: ['browser-responsive']
          }
        ]
      }
    ];
  }

  private logError(error: ExplorationError): void {
    const logLevel = this.getLogLevel(error.severity);
    const message = `[${error.type.toUpperCase()}] ${error.message}`;
    
    switch (logLevel) {
      case 'error':
        console.error(message, error.context);
        break;
      case 'warn':
        console.warn(message, error.context);
        break;
      case 'info':
        console.info(message);
        break;
      default:
        console.log(message);
    }
  }

  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' | 'log' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'medium':
        return 'warn';
      case 'low':
        return 'info';
      case 'warning':
        return 'log';
      default:
        return 'log';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateErrorReport(): ErrorReport {
    const summary = {
      totalErrors: this.errors.length,
      criticalErrors: this.errors.filter(e => e.severity === 'critical').length,
      recoveredErrors: this.errors.filter(e => e.recovery).length,
      unrecoveredErrors: this.errors.filter(e => !e.recovery).length
    };

    const errorsByType = new Map<ErrorType, ExplorationError[]>();
    const errorsBySeverity = new Map<ErrorSeverity, ExplorationError[]>();
    const recoverySuccess = new Map<RecoveryType, number>();

    // Group errors by type and severity
    for (const error of this.errors) {
      // By type
      if (!errorsByType.has(error.type)) {
        errorsByType.set(error.type, []);
      }
      errorsByType.get(error.type)!.push(error);

      // By severity
      if (!errorsBySeverity.has(error.severity)) {
        errorsBySeverity.set(error.severity, []);
      }
      errorsBySeverity.get(error.severity)!.push(error);

      // Recovery success tracking
      if (error.recovery) {
        const current = recoverySuccess.get(error.recovery.strategy) || 0;
        recoverySuccess.set(error.recovery.strategy, current + 1);
      }
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(errorsByType, summary);

    return {
      summary,
      errorsByType,
      errorsBySeverity,
      recoverySuccess,
      recommendations
    };
  }

  private generateRecommendations(
    errorsByType: Map<ErrorType, ExplorationError[]>,
    summary: any
  ): string[] {
    const recommendations: string[] = [];

    // Network-related recommendations
    const networkErrors = errorsByType.get('network')?.length || 0;
    if (networkErrors > 0) {
      recommendations.push(
        `Consider implementing retry logic for network requests (${networkErrors} network errors detected)`
      );
    }

    // Timeout recommendations
    const timeoutErrors = errorsByType.get('timeout')?.length || 0;
    if (timeoutErrors > 0) {
      recommendations.push(
        `Increase timeout values or implement progressive loading detection (${timeoutErrors} timeout errors)`
      );
    }

    // Element not found recommendations
    const elementErrors = errorsByType.get('element-not-found')?.length || 0;
    if (elementErrors > 0) {
      recommendations.push(
        `Improve element selectors or add explicit waits for dynamic content (${elementErrors} element errors)`
      );
    }

    // Critical error recommendations
    if (summary.criticalErrors > 0) {
      recommendations.push(
        `Address critical errors immediately - they may prevent automation from working (${summary.criticalErrors} critical errors)`
      );
    }

    // General recommendations
    if (summary.totalErrors > 10) {
      recommendations.push(
        'Consider implementing more robust error handling and recovery mechanisms'
      );
    }

    return recommendations;
  }

  getErrors(filter?: Partial<ExplorationError>): ExplorationError[] {
    if (!filter) {
      return [...this.errors];
    }

    return this.errors.filter(error => {
      return Object.entries(filter).every(([key, value]) => {
        return (error as any)[key] === value;
      });
    });
  }

  clearErrors(): void {
    this.errors = [];
    this.recoveryAttempts.clear();
  }

  getRecoveryAttempts(): Map<string, number> {
    return new Map(this.recoveryAttempts);
  }
}