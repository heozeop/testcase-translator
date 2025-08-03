import { Migration } from '@mikro-orm/migrations';

export class Migration20250719090000 extends Migration {
  async up(): Promise<void> {
    // Remove content column and add file_size column to generated_code_files table
    this.addSql('alter table `generated_code_files` drop column `content`;');
    this.addSql('alter table `generated_code_files` add column `file_size` int null;');
  }

  async down(): Promise<void> {
    // Revert changes - add content column back and remove file_size
    this.addSql('alter table `generated_code_files` add column `content` text not null;');
    this.addSql('alter table `generated_code_files` drop column `file_size`;');
  }
}
