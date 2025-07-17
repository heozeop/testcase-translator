import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { Project } from './Project.entity';
import { TestCase } from './TestCase.entity';
import { GeneratedCodeFile } from './GeneratedCodeFile.entity';

@Entity({ tableName: 'generated_code' })
export class GeneratedCode {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @ManyToOne(() => Project, { fieldName: 'project_id' })
  project: Project;

  @ManyToOne(() => TestCase, { fieldName: 'test_case_id', nullable: true })
  testCase?: TestCase;

  @Property({ type: 'varchar', length: 255, nullable: true, fieldName: 'session_id' })
  sessionId?: string;

  @Property({ type: 'varchar', length: 255, nullable: true, fieldName: 'exploration_result_id' })
  explorationResultId?: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'output_path' })
  outputPath: string;

  @Property({ type: 'varchar', length: 255, nullable: true, fieldName: 'suite_name' })
  suiteName?: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'varchar', length: 255, nullable: true, fieldName: 'base_url' })
  baseUrl?: string;

  @Property({ type: 'text', nullable: true, fieldName: 'config_content' })
  configContent?: string;

  @Property({ type: 'text', nullable: true, fieldName: 'package_json' })
  packageJson?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Property({ type: 'varchar', length: 50, default: 'pending' })
  status: string = 'pending';

  @Property({ type: 'text', nullable: true })
  errors?: string;

  @Property({ type: 'varchar', length: 500, nullable: true, fieldName: 'file_url' })
  fileUrl?: string;

  @Property({ type: 'varchar', length: 500, nullable: true, fieldName: 'file_path' })
  filePath?: string;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => GeneratedCodeFile, file => file.generatedCode)
  files = new Collection<GeneratedCodeFile>(this);

  constructor(project: Project, outputPath: string) {
    this.project = project;
    this.outputPath = outputPath;
  }
}