import { TestCaseParser } from '../TestCaseParser';
import { TestCase, TestCaseStatus } from '../../types/database';

describe('TestCaseParser', () => {
  let parser: TestCaseParser;

  beforeEach(() => {
    parser = new TestCaseParser();
  });

  const sampleTestCase: TestCase = {
    id: 'test-123',
    project_id: 'project-456',
    scenario_name: 'User Login Flow',
    status: TestCaseStatus.PENDING,
    test_data: {
      steps: [
        {
          action: 'navigate to login page',
          target: 'https://example.com/login',
          description: 'Open the login page'
        },
        {
          action: 'type username into email field',
          target: '#email',
          value: 'user@example.com',
          description: 'Enter email address'
        },
        {
          action: 'type password into password field',
          target: '#password',
          value: 'secretpassword',
          description: 'Enter password'
        },
        {
          action: 'click submit button',
          target: '#login-btn',
          description: 'Submit the login form'
        },
        {
          action: 'verify dashboard is visible',
          target: '.dashboard',
          description: 'Confirm successful login'
        }
      ],
      assertions: [
        {
          type: 'element_exists',
          target: '.dashboard',
          expected: true,
          description: 'Dashboard should be visible after login'
        }
      ],
      inputs: {
        username: 'user@example.com',
        password: 'secretpassword'
      }
    },
    created_at: new Date(),
    updated_at: new Date()
  };

  describe('parseTestCase', () => {
    it('should successfully parse a basic test case', async () => {
      const result = await parser.parseTestCase(sampleTestCase);

      expect(result.success).toBe(true);
      expect(result.navigationPlan).toBeDefined();
      expect(result.errors).toHaveLength(0);
    });

    it('should extract URLs from test case', async () => {
      const result = await parser.parseTestCase(sampleTestCase, {
        extractUrls: true
      });

      expect(result.success).toBe(true);
      expect(result.navigationPlan?.extractedUrls).toHaveLength(1);
      expect(result.navigationPlan?.extractedUrls[0].url).toBe('https://example.com/login');
    });

    it('should parse navigation sequence', async () => {
      const result = await parser.parseTestCase(sampleTestCase, {
        parseNavigation: true
      });

      expect(result.success).toBe(true);
      expect(result.navigationPlan?.navigationSequence).toHaveLength(5);
      
      const sequence = result.navigationPlan!.navigationSequence;
      expect(sequence[0].type).toBe('navigate');
      expect(sequence[1].type).toBe('input');
      expect(sequence[2].type).toBe('input');
      expect(sequence[3].type).toBe('click');
      expect(sequence[4].type).toBe('verify');
    });

    it('should identify user input requirements', async () => {
      const result = await parser.parseTestCase(sampleTestCase, {
        identifyInputs: true
      });

      expect(result.success).toBe(true);
      expect(result.navigationPlan?.userInputRequirements.length).toBeGreaterThan(0);
      
      const inputs = result.navigationPlan!.userInputRequirements;
      const emailInput = inputs.find(input => input.fieldName === 'username');
      const passwordInput = inputs.find(input => input.fieldType === 'password');
      
      expect(emailInput).toBeDefined();
      expect(passwordInput).toBeDefined();
    });

    it('should handle malformed test case gracefully', async () => {
      const malformedTestCase = {
        ...sampleTestCase,
        test_data: {
          steps: [],
          assertions: [],
          inputs: {}
        }
      };

      const result = await parser.parseTestCase(malformedTestCase as TestCase);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.code === 'EMPTY_STEPS')).toBe(true);
    });

    it('should calculate correct complexity', async () => {
      const result = await parser.parseTestCase(sampleTestCase);

      expect(result.success).toBe(true);
      expect(result.navigationPlan?.metadata.complexity).toBe('medium');
      expect(result.navigationPlan?.metadata.totalSteps).toBe(5);
      expect(result.navigationPlan?.metadata.requiresUserInput).toBe(true);
    });
  });

  describe('parseMultipleTestCases', () => {
    it('should parse multiple test cases', async () => {
      const testCases = [sampleTestCase, { ...sampleTestCase, id: 'test-456' }];
      const results = await parser.parseMultipleTestCases(testCases);

      expect(results).toHaveLength(2);
      expect(results.every(result => result.success)).toBe(true);
    });
  });

  describe('generateParsingReport', () => {
    it('should generate correct parsing report', async () => {
      const testCases = [
        sampleTestCase,
        { ...sampleTestCase, id: 'test-456' },
        { ...sampleTestCase, id: 'test-789', test_data: { steps: [], assertions: [], inputs: {} } }
      ];
      
      const results = await parser.parseMultipleTestCases(testCases);
      const report = parser.generateParsingReport(results);

      expect(report.totalTestCases).toBe(3);
      expect(report.successfulParsings).toBe(2);
      expect(report.failedParsings).toBe(1);
      expect(report.totalErrors).toBeGreaterThan(0);
    });
  });
});