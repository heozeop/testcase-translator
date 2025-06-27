import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { Project } from './Project.entity';
import { GeneratedCode } from './GeneratedCode.entity';

@Entity({ tableName: 'test_cases' })
export class TestCase {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @ManyToOne(() => Project, { fieldName: 'project_id' })
  project: Project;

  @Property({ type: 'varchar', length: 255 })
  name: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'jsonb', nullable: true })
  steps?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'expected_results' })
  expectedResults?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'test_data' })
  testData?: any;

  @Property({ type: 'varchar', length: 50, default: 'medium' })
  priority: string = 'medium';

  @Property({ type: 'varchar', length: 100, nullable: true })
  category?: string;

  @Property({ type: 'varchar', length: 50, default: 'active' })
  status: string = 'active';

  @Property({ type: 'varchar', length: 255, nullable: true, fieldName: 'excel_file_path' })
  excelFilePath?: string;

  @Property({ type: 'integer', nullable: true, fieldName: 'excel_row_number' })
  excelRowNumber?: number;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => GeneratedCode, generatedCode => generatedCode.testCase)
  generatedCodes = new Collection<GeneratedCode>(this);

  constructor(project: Project, name: string, description?: string) {
    this.project = project;
    this.name = name;
    this.description = description;
  }
}