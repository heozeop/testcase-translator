import { Migration } from '@mikro-orm/migrations';

export class Migration20250712025000AddFileStorageAndExamples extends Migration {

  override async up(): Promise<void> {
    // 1. Add file storage columns to generated_code table
    this.addSql(`ALTER TABLE "generated_code" ADD COLUMN IF NOT EXISTS "file_url" varchar(500) NULL;`);
    this.addSql(`ALTER TABLE "generated_code" ADD COLUMN IF NOT EXISTS "file_path" varchar(500) NULL;`);
    
    // Add indexes for better query performance
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_generated_code_file_url" ON "generated_code" ("file_url");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_generated_code_file_path" ON "generated_code" ("file_path");`);

    // 2. Create test_examples table
    this.addSql(`
      CREATE TABLE IF NOT EXISTS "test_examples" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "project_id" uuid NOT NULL,
        "test_scenario" text NOT NULL,
        "expected_result" text NOT NULL,
        "cypress_code" text NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "test_examples_pkey" PRIMARY KEY ("id")
      );
    `);

    // Add foreign key constraint
    this.addSql(`ALTER TABLE "test_examples" ADD CONSTRAINT "test_examples_project_id_foreign" FOREIGN KEY ("project_id") REFERENCES "projects" ("id") ON DELETE CASCADE;`);
    
    // Add indexes for test_examples
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_test_examples_project_id" ON "test_examples" ("project_id");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_test_examples_is_active" ON "test_examples" ("is_active");`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_test_examples_created_at" ON "test_examples" ("created_at" DESC);`);

    // Add trigger to update updated_at timestamp
    this.addSql(`
      CREATE OR REPLACE FUNCTION update_test_examples_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER update_test_examples_updated_at_trigger
      BEFORE UPDATE ON "test_examples"
      FOR EACH ROW
      EXECUTE FUNCTION update_test_examples_updated_at();
    `);

    // 3. Add media storage columns to execution_results table
    this.addSql(`ALTER TABLE "execution_results" ADD COLUMN IF NOT EXISTS "video_url" varchar(500) NULL;`);
    this.addSql(`ALTER TABLE "execution_results" ADD COLUMN IF NOT EXISTS "screenshot_urls" jsonb NULL DEFAULT '[]'::jsonb;`);

    // Add check constraint to ensure screenshot_urls is an array
    this.addSql(`
      ALTER TABLE "execution_results" 
      ADD CONSTRAINT "check_screenshot_urls_is_array" 
      CHECK (jsonb_typeof("screenshot_urls") = 'array' OR "screenshot_urls" IS NULL);
    `);

    // Add index for video_url for faster queries
    this.addSql(`CREATE INDEX IF NOT EXISTS "idx_execution_results_video_url" ON "execution_results" ("video_url");`);

    // Add comments for documentation
    this.addSql(`COMMENT ON COLUMN "generated_code"."file_url" IS 'URL for accessing the generated Cypress test file';`);
    this.addSql(`COMMENT ON COLUMN "generated_code"."file_path" IS 'Local file system path where the generated test file is stored';`);
    this.addSql(`COMMENT ON TABLE "test_examples" IS 'Stores example test scenarios and their expected results to enhance AI prompt quality';`);
    this.addSql(`COMMENT ON COLUMN "test_examples"."test_scenario" IS 'Description of the test scenario or user action';`);
    this.addSql(`COMMENT ON COLUMN "test_examples"."expected_result" IS 'Expected outcome or assertion for the test scenario';`);
    this.addSql(`COMMENT ON COLUMN "test_examples"."cypress_code" IS 'Example Cypress code implementation for this scenario';`);
    this.addSql(`COMMENT ON COLUMN "test_examples"."is_active" IS 'Whether this example should be included in AI prompts';`);
    this.addSql(`COMMENT ON COLUMN "execution_results"."video_url" IS 'URL to the video recording of the test execution';`);
    this.addSql(`COMMENT ON COLUMN "execution_results"."screenshot_urls" IS 'JSON array of URLs to screenshots captured during test execution';`);
  }

  override async down(): Promise<void> {
    // 1. Remove media storage columns from execution_results table
    this.addSql(`ALTER TABLE "execution_results" DROP CONSTRAINT IF EXISTS "check_screenshot_urls_is_array";`);
    this.addSql(`DROP INDEX IF EXISTS "idx_execution_results_video_url";`);
    this.addSql(`ALTER TABLE "execution_results" DROP COLUMN IF EXISTS "video_url";`);
    this.addSql(`ALTER TABLE "execution_results" DROP COLUMN IF EXISTS "screenshot_urls";`);

    // 2. Drop test_examples table and related objects
    this.addSql(`DROP TRIGGER IF EXISTS update_test_examples_updated_at_trigger ON "test_examples";`);
    this.addSql(`DROP FUNCTION IF EXISTS update_test_examples_updated_at();`);
    this.addSql(`DROP INDEX IF EXISTS "idx_test_examples_created_at";`);
    this.addSql(`DROP INDEX IF EXISTS "idx_test_examples_is_active";`);
    this.addSql(`DROP INDEX IF EXISTS "idx_test_examples_project_id";`);
    this.addSql(`DROP TABLE IF EXISTS "test_examples";`);

    // 3. Remove file storage columns from generated_code table
    this.addSql(`DROP INDEX IF EXISTS "idx_generated_code_file_path";`);
    this.addSql(`DROP INDEX IF EXISTS "idx_generated_code_file_url";`);
    this.addSql(`ALTER TABLE "generated_code" DROP COLUMN IF EXISTS "file_url";`);
    this.addSql(`ALTER TABLE "generated_code" DROP COLUMN IF EXISTS "file_path";`);
  }
}