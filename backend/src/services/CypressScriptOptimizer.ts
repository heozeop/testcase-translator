import { GeneratedScript } from './CypressScriptGenerator';
// import { ConversionResult } from './TestCaseToCypressConverter'; // Unused import

export interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  category: OptimizationCategory;
  priority: number;
  pattern: RegExp | string;
  replacement: string | ((match: string, ...args: any[]) => string);
  conditions?: OptimizationCondition[];
  impact: 'performance' | 'readability' | 'maintainability' | 'reliability';
}

export type OptimizationCategory = 
  | 'selector-optimization'
  | 'command-consolidation'
  | 'wait-elimination'
  | 'assertion-improvement'
  | 'code-structure'
  | 'best-practices';

export interface OptimizationCondition {
  type: 'line-count' | 'command-frequency' | 'complexity-score' | 'custom';
  operator: 'greater-than' | 'less-than' | 'equals' | 'contains';
  value: any;
}

export interface OptimizationResult {
  originalScript: string;
  optimizedScript: string;
  appliedOptimizations: AppliedOptimization[];
  metrics: OptimizationMetrics;
  warnings: string[];
  errors: string[];
}

export interface AppliedOptimization {
  ruleId: string;
  ruleName: string;
  lineNumber: number;
  originalCode: string;
  optimizedCode: string;
  impact: string;
  savings?: {
    characterCount?: number;
    lineCount?: number;
    executionTime?: number;
  };
}

export interface OptimizationMetrics {
  originalStats: CodeStats;
  optimizedStats: CodeStats;
  improvement: {
    lineReduction: number;
    characterReduction: number;
    complexityReduction: number;
    performanceGain: number;
  };
}

export interface CodeStats {
  lineCount: number;
  characterCount: number;
  commandCount: number;
  assertionCount: number;
  selectorCount: number;
  waitCount: number;
  complexityScore: number;
}

export interface ValidationResult {
  isValid: boolean;
  syntaxErrors: SyntaxError[];
  logicalErrors: LogicalError[];
  warnings: ValidationWarning[];
  suggestions: string[];
  confidence: number;
}

export interface SyntaxError {
  line: number;
  column: number;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface LogicalError {
  type: 'missing-assertion' | 'unreachable-code' | 'duplicate-action' | 'invalid-selector';
  line: number;
  message: string;
  suggestion: string;
}

export interface ValidationWarning {
  type: 'deprecated-command' | 'inefficient-selector' | 'missing-wait' | 'hard-coded-value';
  line: number;
  message: string;
  suggestion: string;
}

export class CypressScriptOptimizer {
  private optimizationRules: Map<string, OptimizationRule> = new Map();
  private validationRules: Map<string, Function> = new Map();
  private metrics: Map<string, OptimizationMetrics> = new Map();

  constructor() {
    this.initializeOptimizationRules();
    this.initializeValidationRules();
  }

  async optimizeScript(script: GeneratedScript): Promise<OptimizationResult> {
    const result: OptimizationResult = {
      originalScript: script.content,
      optimizedScript: script.content,
      appliedOptimizations: [],
      metrics: {
        originalStats: this.calculateCodeStats(script.content),
        optimizedStats: this.calculateCodeStats(script.content),
        improvement: {
          lineReduction: 0,
          characterReduction: 0,
          complexityReduction: 0,
          performanceGain: 0
        }
      },
      warnings: [],
      errors: []
    };

    try {
      let optimizedCode = script.content;
      const appliedOptimizations: AppliedOptimization[] = [];

      // Apply optimization rules in order of priority
      const sortedRules = Array.from(this.optimizationRules.values())
        .sort((a, b) => b.priority - a.priority);

      for (const rule of sortedRules) {
        const ruleResult = await this.applyOptimizationRule(rule, optimizedCode);
        if (ruleResult.applied) {
          optimizedCode = ruleResult.code;
          appliedOptimizations.push(...ruleResult.optimizations);
        }
      }

      // Update result
      result.optimizedScript = optimizedCode;
      result.appliedOptimizations = appliedOptimizations;
      result.metrics.optimizedStats = this.calculateCodeStats(optimizedCode);
      result.metrics.improvement = this.calculateImprovement(
        result.metrics.originalStats,
        result.metrics.optimizedStats
      );

      // Store metrics for analysis
      this.metrics.set(script.fileName, result.metrics);

    } catch (error) {
      result.errors.push(`Optimization failed: ${error}`);
    }

    return result;
  }

  async validateScript(script: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      syntaxErrors: [],
      logicalErrors: [],
      warnings: [],
      suggestions: [],
      confidence: 1.0
    };

    try {
      // Basic syntax validation
      await this.validateSyntax(script, result);

      // Logical validation
      await this.validateLogic(script, result);

      // Best practices validation
      await this.validateBestPractices(script, result);

      // Calculate confidence based on issues found
      result.confidence = this.calculateValidationConfidence(result);
      result.isValid = result.syntaxErrors.length === 0 && 
                       result.logicalErrors.length === 0;

    } catch (error) {
      result.syntaxErrors.push({
        line: 0,
        column: 0,
        message: `Validation error: ${error}`,
        code: 'VALIDATION_ERROR',
        severity: 'error'
      });
      result.isValid = false;
      result.confidence = 0;
    }

    return result;
  }

  private async applyOptimizationRule(
    rule: OptimizationRule,
    code: string
  ): Promise<{ applied: boolean; code: string; optimizations: AppliedOptimization[] }> {
    const result = {
      applied: false,
      code,
      optimizations: [] as AppliedOptimization[]
    };

    // Check conditions first
    if (rule.conditions && !this.evaluateConditions(rule.conditions, code)) {
      return result;
    }

    const lines = code.split('\n');
    let modifiedLines = [...lines];
    let hasChanges = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match: RegExpMatchArray | null = null;

      if (rule.pattern instanceof RegExp) {
        match = line.match(rule.pattern);
      } else {
        match = line.includes(rule.pattern) ? [rule.pattern] : null;
      }

      if (match) {
        const originalCode = line;
        let optimizedCode: string;

        if (typeof rule.replacement === 'function') {
          optimizedCode = rule.replacement(match[0], ...match.slice(1));
        } else {
          optimizedCode = line.replace(rule.pattern, rule.replacement);
        }

        if (optimizedCode !== originalCode) {
          modifiedLines[i] = optimizedCode;
          hasChanges = true;

          result.optimizations.push({
            ruleId: rule.id,
            ruleName: rule.name,
            lineNumber: i + 1,
            originalCode,
            optimizedCode,
            impact: rule.impact,
            savings: this.calculateSavings(originalCode, optimizedCode)
          });
        }
      }
    }

    if (hasChanges) {
      result.applied = true;
      result.code = modifiedLines.join('\n');
    }

    return result;
  }

  private evaluateConditions(conditions: OptimizationCondition[], code: string): boolean {
    for (const condition of conditions) {
      if (!this.evaluateCondition(condition, code)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(condition: OptimizationCondition, code: string): boolean {
    let actualValue: any;

    switch (condition.type) {
      case 'line-count':
        actualValue = code.split('\n').length;
        break;
      case 'command-frequency':
        actualValue = (code.match(/cy\./g) || []).length;
        break;
      case 'complexity-score':
        actualValue = this.calculateCodeStats(code).complexityScore;
        break;
      default:
        return true; // Unknown conditions pass
    }

    switch (condition.operator) {
      case 'greater-than':
        return actualValue > condition.value;
      case 'less-than':
        return actualValue < condition.value;
      case 'equals':
        return actualValue === condition.value;
      case 'contains':
        return String(actualValue).includes(String(condition.value));
      default:
        return true;
    }
  }

  private calculateSavings(original: string, optimized: string) {
    return {
      characterCount: original.length - optimized.length,
      lineCount: original.split('\n').length - optimized.split('\n').length
    };
  }

  private calculateCodeStats(code: string): CodeStats {
    const lines = code.split('\n');
    // const nonEmptyLines = lines.filter(line => line.trim());

    return {
      lineCount: lines.length,
      characterCount: code.length,
      commandCount: (code.match(/cy\./g) || []).length,
      assertionCount: (code.match(/\.should\(|\.expect\(/g) || []).length,
      selectorCount: (code.match(/cy\.get\(|cy\.contains\(/g) || []).length,
      waitCount: (code.match(/cy\.wait\(/g) || []).length,
      complexityScore: this.calculateComplexityScore(code)
    };
  }

  private calculateComplexityScore(code: string): number {
    let score = 0;
    
    // Base complexity from commands
    score += (code.match(/cy\./g) || []).length * 0.5;
    
    // Add complexity for control structures
    score += (code.match(/\bif\b|\bfor\b|\bwhile\b/g) || []).length * 2;
    
    // Add complexity for nested structures
    score += (code.match(/\.within\(|\.then\(/g) || []).length * 1.5;
    
    // Add complexity for custom commands
    score += (code.match(/cy\.(?!get|click|type|should|visit|wait)[a-zA-Z]/g) || []).length * 1;
    
    return Math.round(score * 10) / 10;
  }

  private calculateImprovement(original: CodeStats, optimized: CodeStats) {
    return {
      lineReduction: original.lineCount - optimized.lineCount,
      characterReduction: original.characterCount - optimized.characterCount,
      complexityReduction: original.complexityScore - optimized.complexityScore,
      performanceGain: this.estimatePerformanceGain(original, optimized)
    };
  }

  private estimatePerformanceGain(original: CodeStats, optimized: CodeStats): number {
    // Estimate performance gain based on reduced commands and waits
    const commandReduction = original.commandCount - optimized.commandCount;
    const waitReduction = original.waitCount - optimized.waitCount;
    
    return Math.round((commandReduction * 50 + waitReduction * 200) * 10) / 10; // Estimated ms saved
  }

  private async validateSyntax(script: string, result: ValidationResult): Promise<void> {
    const lines = script.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) continue;

      // Check for basic syntax issues
      if (line.includes('cy.') && !line.endsWith(';') && !line.endsWith('{') && !line.endsWith('}')) {
        result.syntaxErrors.push({
          line: i + 1,
          column: line.length,
          message: 'Missing semicolon',
          code: 'MISSING_SEMICOLON',
          severity: 'warning'
        });
      }

      // Check for unmatched quotes
      const singleQuotes = (line.match(/'/g) || []).length;
      const doubleQuotes = (line.match(/"/g) || []).length;
      
      if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
        result.syntaxErrors.push({
          line: i + 1,
          column: 0,
          message: 'Unmatched quotes',
          code: 'UNMATCHED_QUOTES',
          severity: 'error'
        });
      }

      // Check for valid Cypress commands
      const cypressMatch = line.match(/cy\.(\w+)/);
      if (cypressMatch) {
        const command = cypressMatch[1];
        if (!this.isValidCypressCommand(command)) {
          result.syntaxErrors.push({
            line: i + 1,
            column: cypressMatch.index || 0,
            message: `Unknown Cypress command: ${command}`,
            code: 'UNKNOWN_COMMAND',
            severity: 'warning'
          });
        }
      }
    }
  }

  private async validateLogic(script: string, result: ValidationResult): Promise<void> {
    const lines = script.split('\n');

    // Check for missing assertions
    const hasAssertions = script.includes('.should(') || script.includes('.expect(');
    if (!hasAssertions) {
      result.logicalErrors.push({
        type: 'missing-assertion',
        line: 0,
        message: 'Test has no assertions',
        suggestion: 'Add .should() or .expect() assertions to verify test outcomes'
      });
    }

    // Check for duplicate actions
    const actionLines = lines.filter(line => 
      line.includes('.click()') || line.includes('.type(') || line.includes('.select(')
    );
    
    const duplicates = this.findDuplicateLines(actionLines);
    for (const duplicate of duplicates) {
      const lineNumber = lines.indexOf(duplicate) + 1;
      result.logicalErrors.push({
        type: 'duplicate-action',
        line: lineNumber,
        message: 'Duplicate action detected',
        suggestion: 'Remove or consolidate duplicate actions'
      });
    }

    // Check for potentially invalid selectors
    const selectorMatches = script.match(/cy\.get\(['"`]([^'"`]+)['"`]\)/g);
    if (selectorMatches) {
      for (const match of selectorMatches) {
        const selector = match.match(/['"`]([^'"`]+)['"`]/)?.[1];
        if (selector && this.isPotentiallyInvalidSelector(selector)) {
          const lineNumber = this.findLineNumber(script, match);
          result.logicalErrors.push({
            type: 'invalid-selector',
            line: lineNumber,
            message: `Potentially unreliable selector: ${selector}`,
            suggestion: 'Use more specific selectors like data-testid, id, or semantic selectors'
          });
        }
      }
    }
  }

  private async validateBestPractices(script: string, result: ValidationResult): Promise<void> {
    const lines = script.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check for hard-coded waits
      if (line.includes('cy.wait(') && /cy\.wait\(\d+\)/.test(line)) {
        result.warnings.push({
          type: 'missing-wait',
          line: i + 1,
          message: 'Hard-coded wait detected',
          suggestion: 'Use cy.wait() with aliases or element-based waits instead'
        });
      }

      // Check for hard-coded values
      if (line.includes('.type(') && /\.type\(['"`][^'"`]*['"`]\)/.test(line)) {
        const value = line.match(/\.type\(['"`]([^'"`]*)['"`]\)/)?.[1];
        if (value && this.isHardCodedValue(value)) {
          result.warnings.push({
            type: 'hard-coded-value',
            line: i + 1,
            message: 'Hard-coded test data detected',
            suggestion: 'Consider using test data variables or fixtures'
          });
        }
      }

      // Check for inefficient selectors
      if (line.includes('cy.get(') && line.includes(':nth-child(')) {
        result.warnings.push({
          type: 'inefficient-selector',
          line: i + 1,
          message: 'Using positional selector which may be brittle',
          suggestion: 'Use more semantic selectors when possible'
        });
      }

      // Check for deprecated commands
      const deprecatedCommands = ['cy.server()', 'cy.route()', 'cy.wait(@alias)'];
      for (const deprecated of deprecatedCommands) {
        if (line.includes(deprecated)) {
          result.warnings.push({
            type: 'deprecated-command',
            line: i + 1,
            message: `Deprecated command: ${deprecated}`,
            suggestion: 'Update to use modern Cypress commands'
          });
        }
      }
    }
  }

  private calculateValidationConfidence(result: ValidationResult): number {
    let confidence = 1.0;
    
    // Reduce confidence for errors and warnings
    confidence -= result.syntaxErrors.length * 0.2;
    confidence -= result.logicalErrors.length * 0.15;
    confidence -= result.warnings.length * 0.05;
    
    return Math.max(0, Math.min(1, confidence));
  }

  private isValidCypressCommand(command: string): boolean {
    const validCommands = [
      'visit', 'get', 'contains', 'click', 'type', 'clear', 'select', 'check', 'uncheck',
      'should', 'and', 'expect', 'wait', 'then', 'within', 'wrap', 'its', 'invoke',
      'url', 'title', 'go', 'reload', 'screenshot', 'viewport', 'setCookie', 'getCookie',
      'clearCookies', 'clearLocalStorage', 'window', 'document', 'focused', 'blur', 'focus',
      'submit', 'dblclick', 'rightclick', 'trigger', 'scrollTo', 'scrollIntoView',
      'readFile', 'writeFile', 'fixture', 'task', 'exec', 'request', 'intercept'
    ];
    
    return validCommands.includes(command);
  }

  private findDuplicateLines(lines: string[]): string[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (seen.has(trimmed)) {
        duplicates.add(trimmed);
      } else {
        seen.add(trimmed);
      }
    }
    
    return Array.from(duplicates);
  }

  private isPotentiallyInvalidSelector(selector: string): boolean {
    // Check for brittle selectors
    const brittlePatterns = [
      /div:nth-child\(\d+\)/,
      /table tr:nth-child\(\d+\)/,
      /\.class\d+/,
      /^div > div > div/
    ];
    
    return brittlePatterns.some(pattern => pattern.test(selector));
  }

  private findLineNumber(script: string, searchText: string): number {
    const lines = script.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchText)) {
        return i + 1;
      }
    }
    return 0;
  }

  private isHardCodedValue(value: string): boolean {
    // Check if value looks like test data that should be parameterized
    const testDataPatterns = [
      /^test\w*$/i,
      /^admin$/i,
      /^user\d+$/i,
      /^\w+@example\.com$/,
      /^password\d*$/i,
      /^123456\d*$/
    ];
    
    return testDataPatterns.some(pattern => pattern.test(value));
  }

  private initializeOptimizationRules(): void {
    // Selector optimization rules
    this.optimizationRules.set('optimize-data-testid', {
      id: 'optimize-data-testid',
      name: 'Optimize to data-testid',
      description: 'Replace complex selectors with data-testid when available',
      category: 'selector-optimization',
      priority: 9,
      pattern: /cy\.get\(['"`]([^'"`]*)\['"`]\)/,
      replacement: (match: string, _selector: string) => {
        // This would need access to actual DOM to check for data-testid
        return match; // Simplified for this example
      },
      impact: 'reliability'
    });

    // Command consolidation rules
    this.optimizationRules.set('consolidate-waits', {
      id: 'consolidate-waits',
      name: 'Consolidate consecutive waits',
      description: 'Combine multiple wait commands into a single wait',
      category: 'command-consolidation',
      priority: 8,
      pattern: /cy\.wait\(\d+\);\s*cy\.wait\(\d+\);/,
      replacement: 'cy.wait(2000);',
      impact: 'performance'
    });

    // Remove unnecessary waits
    this.optimizationRules.set('remove-redundant-waits', {
      id: 'remove-redundant-waits',
      name: 'Remove redundant waits',
      description: 'Remove waits that are followed by element interactions',
      category: 'wait-elimination',
      priority: 7,
      pattern: /cy\.wait\(\d+\);\s*cy\.get\(/,
      replacement: 'cy.get(',
      impact: 'performance'
    });

    // Improve assertions
    this.optimizationRules.set('improve-visibility-assertions', {
      id: 'improve-visibility-assertions',
      name: 'Improve visibility assertions',
      description: 'Combine get and should be.visible into a single command',
      category: 'assertion-improvement',
      priority: 6,
      pattern: /cy\.get\((['"`][^'"`]+['"`])\);\s*cy\.get\(\1\)\.should\('be\.visible'\);/,
      replacement: (_match: string, selector: string) => `cy.get(${selector}).should('be.visible');`,
      impact: 'readability'
    });

    // Code structure improvements
    this.optimizationRules.set('chain-commands', {
      id: 'chain-commands',
      name: 'Chain related commands',
      description: 'Chain commands that operate on the same element',
      category: 'code-structure',
      priority: 5,
      pattern: /cy\.get\((['"`][^'"`]+['"`])\)\.(\w+\([^)]*\));\s*cy\.get\(\1\)\.(\w+\([^)]*\));/,
      replacement: (_match: string, selector: string, cmd1: string, cmd2: string) => 
        `cy.get(${selector}).${cmd1}.${cmd2};`,
      impact: 'readability'
    });

    // Best practices
    this.optimizationRules.set('use-contains-for-text', {
      id: 'use-contains-for-text',
      name: 'Use contains for text matching',
      description: 'Replace get with text-based should with cy.contains',
      category: 'best-practices',
      priority: 4,
      pattern: /cy\.get\([^)]+\)\.should\('contain\.text',\s*['"`]([^'"`]+)['"`]\)/,
      replacement: (_match: string, text: string) => `cy.contains('${text}')`,
      impact: 'readability'
    });
  }

  private initializeValidationRules(): void {
    // Add custom validation rules here
    this.validationRules.set('checkAsyncPattern', (script: string) => {
      // Check for proper async/await patterns
      return script.includes('.then(') || !script.includes('await cy.');
    });

    this.validationRules.set('checkSelectorStability', (script: string) => {
      // Check for stable selectors
      const unstableSelectors = script.match(/cy\.get\(['"`][^'"`]*:nth-child[^'"`]*['"`]\)/g);
      return !unstableSelectors || unstableSelectors.length < 3;
    });
  }

  // Public API methods
  async optimizeMultipleScripts(scripts: GeneratedScript[]): Promise<Map<string, OptimizationResult>> {
    const results = new Map<string, OptimizationResult>();

    for (const script of scripts) {
      try {
        const result = await this.optimizeScript(script);
        results.set(script.fileName, result);
      } catch (error) {
        console.error(`Failed to optimize script ${script.fileName}:`, error);
      }
    }

    return results;
  }

  getOptimizationRules(): OptimizationRule[] {
    return Array.from(this.optimizationRules.values());
  }

  addOptimizationRule(rule: OptimizationRule): void {
    this.optimizationRules.set(rule.id, rule);
  }

  removeOptimizationRule(id: string): boolean {
    return this.optimizationRules.delete(id);
  }

  getOptimizationMetrics(): Map<string, OptimizationMetrics> {
    return new Map(this.metrics);
  }

  generateOptimizationReport(results: Map<string, OptimizationResult>): {
    totalScripts: number;
    totalOptimizations: number;
    averageImprovement: {
      lineReduction: number;
      characterReduction: number;
      complexityReduction: number;
      performanceGain: number;
    };
    mostCommonOptimizations: string[];
    topImpactOptimizations: string[];
  } {
    const allResults = Array.from(results.values());
    const allOptimizations = allResults.flatMap(r => r.appliedOptimizations);

    const averageImprovement = {
      lineReduction: allResults.reduce((sum, r) => sum + r.metrics.improvement.lineReduction, 0) / allResults.length,
      characterReduction: allResults.reduce((sum, r) => sum + r.metrics.improvement.characterReduction, 0) / allResults.length,
      complexityReduction: allResults.reduce((sum, r) => sum + r.metrics.improvement.complexityReduction, 0) / allResults.length,
      performanceGain: allResults.reduce((sum, r) => sum + r.metrics.improvement.performanceGain, 0) / allResults.length
    };

    // Count optimization rule usage
    const ruleUsage = new Map<string, number>();
    for (const opt of allOptimizations) {
      ruleUsage.set(opt.ruleName, (ruleUsage.get(opt.ruleName) || 0) + 1);
    }

    const mostCommonOptimizations = Array.from(ruleUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Find high-impact optimizations
    const impactOptimizations = allOptimizations
      .filter(opt => opt.savings?.characterCount && opt.savings.characterCount > 20)
      .map(opt => opt.ruleName);

    const topImpactOptimizations = [...new Set(impactOptimizations)].slice(0, 5);

    return {
      totalScripts: allResults.length,
      totalOptimizations: allOptimizations.length,
      averageImprovement,
      mostCommonOptimizations,
      topImpactOptimizations
    };
  }
}