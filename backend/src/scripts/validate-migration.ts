import { query } from '../db';

interface ValidationResult {
  passed: boolean;
  message: string;
  details?: any;
}

class MigrationValidator {
  async validateGeneratedCodeTable(): Promise<ValidationResult> {
    try {
      const result = await query(`
        SELECT 
          column_name, 
          data_type, 
          character_maximum_length,
          is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'generated_code' 
        AND column_name IN ('file_url', 'file_path')
        ORDER BY column_name
      `);

      if (result.rows.length !== 2) {
        return {
          passed: false,
          message: 'Missing file_url or file_path columns in generated_code table',
          details: result.rows
        };
      }

      // Validate column specifications
      for (const column of result.rows) {
        if (column.data_type !== 'character varying' || column.character_maximum_length !== 500) {
          return {
            passed: false,
            message: `Invalid column specification for ${column.column_name}`,
            details: column
          };
        }
      }

      // Check indexes
      const indexResult = await query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'generated_code' 
        AND indexname IN ('idx_generated_code_file_url', 'idx_generated_code_file_path')
      `);

      if (indexResult.rows.length !== 2) {
        return {
          passed: false,
          message: 'Missing indexes on file_url or file_path columns',
          details: indexResult.rows
        };
      }

      return {
        passed: true,
        message: 'generated_code table validation passed'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Error validating generated_code table',
        details: error
      };
    }
  }

  async validateTestExamplesTable(): Promise<ValidationResult> {
    try {
      // Check if table exists
      const tableExists = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'test_examples'
        )
      `);

      if (!tableExists.rows[0].exists) {
        return {
          passed: false,
          message: 'test_examples table does not exist'
        };
      }

      // Validate columns
      const columns = await query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'test_examples'
        ORDER BY ordinal_position
      `);

      const requiredColumns = [
        'id', 'project_id', 'test_scenario', 'expected_result', 
        'cypress_code', 'is_active', 'created_at', 'updated_at'
      ];

      const columnNames = columns.rows.map((c: any) => c.column_name);
      const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

      if (missingColumns.length > 0) {
        return {
          passed: false,
          message: 'Missing required columns in test_examples table',
          details: { missingColumns, existingColumns: columnNames }
        };
      }

      // Check foreign key constraint
      const fkResult = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'test_examples' 
        AND constraint_type = 'FOREIGN KEY'
      `);

      if (fkResult.rows.length === 0) {
        return {
          passed: false,
          message: 'Missing foreign key constraint on test_examples.project_id'
        };
      }

      // Check trigger
      const triggerResult = await query(`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'test_examples'
        AND trigger_name = 'update_test_examples_updated_at_trigger'
      `);

      if (triggerResult.rows.length === 0) {
        return {
          passed: false,
          message: 'Missing updated_at trigger on test_examples table'
        };
      }

      return {
        passed: true,
        message: 'test_examples table validation passed'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Error validating test_examples table',
        details: error
      };
    }
  }

  async validateExecutionResultsTable(): Promise<ValidationResult> {
    try {
      const result = await query(`
        SELECT 
          column_name, 
          data_type,
          is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'execution_results' 
        AND column_name IN ('video_url', 'screenshot_urls')
        ORDER BY column_name
      `);

      if (result.rows.length !== 2) {
        return {
          passed: false,
          message: 'Missing video_url or screenshot_urls columns in execution_results table',
          details: result.rows
        };
      }

      // Validate column types
      const videoUrlCol = result.rows.find((r: any) => r.column_name === 'video_url');
      const screenshotUrlsCol = result.rows.find((r: any) => r.column_name === 'screenshot_urls');

      if (videoUrlCol?.data_type !== 'character varying') {
        return {
          passed: false,
          message: 'Invalid data type for video_url column',
          details: videoUrlCol
        };
      }

      if (screenshotUrlsCol?.data_type !== 'jsonb') {
        return {
          passed: false,
          message: 'Invalid data type for screenshot_urls column',
          details: screenshotUrlsCol
        };
      }

      // Check constraint
      const constraintResult = await query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'execution_results' 
        AND constraint_name = 'check_screenshot_urls_is_array'
      `);

      if (constraintResult.rows.length === 0) {
        return {
          passed: false,
          message: 'Missing check constraint on screenshot_urls column'
        };
      }

      return {
        passed: true,
        message: 'execution_results table validation passed'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Error validating execution_results table',
        details: error
      };
    }
  }

  async validateAll(): Promise<{ success: boolean; results: ValidationResult[] }> {
    const results: ValidationResult[] = [];

    results.push(await this.validateGeneratedCodeTable());
    results.push(await this.validateTestExamplesTable());
    results.push(await this.validateExecutionResultsTable());

    const success = results.every(r => r.passed);

    return { success, results };
  }
}

// Main execution
async function main() {
  const validator = new MigrationValidator();
  
  try {
    console.log('Starting migration validation...\n');

    const { success, results } = await validator.validateAll();

    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.message}`);
      if (!result.passed && result.details) {
        console.log('   Details:', JSON.stringify(result.details, null, 2));
      }
    });

    console.log('\n' + '='.repeat(50));
    console.log(success ? '✅ All validations passed!' : '❌ Some validations failed!');
    console.log('='.repeat(50));

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Validation error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}