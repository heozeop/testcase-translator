import { Migration } from '@mikro-orm/migrations';

export class Migration20250719061332 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table \`projects\` (\`id\` varchar(36) not null, \`name\` varchar(255) not null, \`target_url\` varchar(500) not null, \`description\` text null, \`status\` varchar(50) not null default 'active', \`created_at\` datetime not null, \`updated_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);

    this.addSql(`create table \`exploration_sessions\` (\`id\` varchar(36) not null, \`project_id\` varchar(36) not null, \`start_url\` varchar(500) not null, \`current_url\` varchar(500) null, \`status\` varchar(50) not null default 'active', \`configuration\` json null, \`metadata\` json null, \`started_at\` datetime not null, \`ended_at\` datetime null, \`last_activity\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`exploration_sessions\` add index \`exploration_sessions_project_id_index\`(\`project_id\`);`);

    this.addSql(`create table \`exploration_results\` (\`id\` varchar(36) not null, \`session_id\` varchar(36) not null, \`url\` varchar(500) not null, \`title\` varchar(255) null, \`page_states\` json null, \`navigation_actions\` json null, \`collected_inputs\` json null, \`form_info\` json null, \`element_info\` json null, \`screenshot_path\` varchar(500) null, \`errors\` text null, \`metadata\` json null, \`created_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`exploration_results\` add index \`exploration_results_session_id_index\`(\`session_id\`);`);

    this.addSql(`create table \`test_cases\` (\`id\` varchar(36) not null, \`project_id\` varchar(36) not null, \`name\` varchar(255) not null, \`description\` text null, \`steps\` json null, \`expected_results\` json null, \`test_data\` json null, \`priority\` varchar(50) not null default 'medium', \`category\` varchar(100) null, \`status\` varchar(50) not null default 'active', \`excel_file_path\` varchar(255) null, \`excel_row_number\` int null, \`created_at\` datetime not null, \`updated_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`test_cases\` add index \`test_cases_project_id_index\`(\`project_id\`);`);

    this.addSql(`create table \`generated_code\` (\`id\` varchar(36) not null, \`project_id\` varchar(36) not null, \`test_case_id\` varchar(36) null, \`session_id\` varchar(255) null, \`exploration_result_id\` varchar(255) null, \`output_path\` varchar(500) not null, \`suite_name\` varchar(255) null, \`description\` text null, \`base_url\` varchar(255) null, \`config_content\` text null, \`package_json\` text null, \`metadata\` json null, \`status\` varchar(50) not null default 'pending', \`errors\` text null, \`file_url\` varchar(500) null, \`file_path\` varchar(500) null, \`created_at\` datetime not null, \`updated_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`generated_code\` add index \`generated_code_project_id_index\`(\`project_id\`);`);
    this.addSql(`alter table \`generated_code\` add index \`generated_code_test_case_id_index\`(\`test_case_id\`);`);

    this.addSql(`create table \`generated_code_files\` (\`id\` varchar(36) not null, \`generation_id\` varchar(36) not null, \`file_type\` varchar(100) not null, \`file_name\` varchar(255) not null, \`file_path\` varchar(500) not null, \`content\` text not null, \`created_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`generated_code_files\` add index \`generated_code_files_generation_id_index\`(\`generation_id\`);`);

    this.addSql(`create table \`execution_results\` (\`id\` varchar(36) not null, \`test_case_id\` varchar(36) not null, \`generated_code_id\` varchar(36) null, \`status\` varchar(50) not null default 'pending', \`results\` json null, \`logs\` text null, \`errors\` text null, \`started_at\` datetime null, \`completed_at\` datetime null, \`duration\` int null, \`metadata\` json null, \`video_url\` varchar(500) null, \`screenshot_urls\` json null, \`created_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`execution_results\` add index \`execution_results_test_case_id_index\`(\`test_case_id\`);`);
    this.addSql(`alter table \`execution_results\` add index \`execution_results_generated_code_id_index\`(\`generated_code_id\`);`);

    this.addSql(`create table \`test_examples\` (\`id\` varchar(36) not null, \`project_id\` varchar(36) not null, \`test_scenario\` text not null, \`expected_result\` text not null, \`cypress_code\` text null, \`is_active\` tinyint(1) not null default true, \`created_at\` datetime not null, \`updated_at\` datetime not null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);
    this.addSql(`alter table \`test_examples\` add index \`test_examples_project_id_index\`(\`project_id\`);`);

    this.addSql(`alter table \`exploration_sessions\` add constraint \`exploration_sessions_project_id_foreign\` foreign key (\`project_id\`) references \`projects\` (\`id\`) on update cascade;`);

    this.addSql(`alter table \`exploration_results\` add constraint \`exploration_results_session_id_foreign\` foreign key (\`session_id\`) references \`exploration_sessions\` (\`id\`) on update cascade;`);

    this.addSql(`alter table \`test_cases\` add constraint \`test_cases_project_id_foreign\` foreign key (\`project_id\`) references \`projects\` (\`id\`) on update cascade;`);

    this.addSql(`alter table \`generated_code\` add constraint \`generated_code_project_id_foreign\` foreign key (\`project_id\`) references \`projects\` (\`id\`) on update cascade;`);
    this.addSql(`alter table \`generated_code\` add constraint \`generated_code_test_case_id_foreign\` foreign key (\`test_case_id\`) references \`test_cases\` (\`id\`) on update cascade on delete set null;`);

    this.addSql(`alter table \`generated_code_files\` add constraint \`generated_code_files_generation_id_foreign\` foreign key (\`generation_id\`) references \`generated_code\` (\`id\`) on update cascade;`);

    this.addSql(`alter table \`execution_results\` add constraint \`execution_results_test_case_id_foreign\` foreign key (\`test_case_id\`) references \`test_cases\` (\`id\`) on update cascade;`);
    this.addSql(`alter table \`execution_results\` add constraint \`execution_results_generated_code_id_foreign\` foreign key (\`generated_code_id\`) references \`generated_code\` (\`id\`) on update cascade on delete set null;`);

    this.addSql(`alter table \`test_examples\` add constraint \`test_examples_project_id_foreign\` foreign key (\`project_id\`) references \`projects\` (\`id\`) on update cascade;`);

    this.addSql(`drop table if exists \`test_table\`;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table \`exploration_sessions\` drop foreign key \`exploration_sessions_project_id_foreign\`;`);

    this.addSql(`alter table \`test_cases\` drop foreign key \`test_cases_project_id_foreign\`;`);

    this.addSql(`alter table \`generated_code\` drop foreign key \`generated_code_project_id_foreign\`;`);

    this.addSql(`alter table \`test_examples\` drop foreign key \`test_examples_project_id_foreign\`;`);

    this.addSql(`alter table \`exploration_results\` drop foreign key \`exploration_results_session_id_foreign\`;`);

    this.addSql(`alter table \`generated_code\` drop foreign key \`generated_code_test_case_id_foreign\`;`);

    this.addSql(`alter table \`execution_results\` drop foreign key \`execution_results_test_case_id_foreign\`;`);

    this.addSql(`alter table \`generated_code_files\` drop foreign key \`generated_code_files_generation_id_foreign\`;`);

    this.addSql(`alter table \`execution_results\` drop foreign key \`execution_results_generated_code_id_foreign\`;`);

    this.addSql(`create table \`test_table\` (\`id\` int not null, \`name\` varchar(100) null, primary key (\`id\`)) default character set utf8mb4 engine = InnoDB;`);

    this.addSql(`drop table if exists \`projects\`;`);

    this.addSql(`drop table if exists \`exploration_sessions\`;`);

    this.addSql(`drop table if exists \`exploration_results\`;`);

    this.addSql(`drop table if exists \`test_cases\`;`);

    this.addSql(`drop table if exists \`generated_code\`;`);

    this.addSql(`drop table if exists \`generated_code_files\`;`);

    this.addSql(`drop table if exists \`execution_results\`;`);

    this.addSql(`drop table if exists \`test_examples\`;`);
  }

}
