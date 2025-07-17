import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { Project } from './Project.entity';

@Entity({ tableName: 'test_examples' })
export class TestExample {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @ManyToOne(() => Project, { fieldName: 'project_id' })
  project: Project;

  @Property({ type: 'text', fieldName: 'test_scenario' })
  testScenario: string;

  @Property({ type: 'text', fieldName: 'expected_result' })
  expectedResult: string;

  @Property({ type: 'text', nullable: true, fieldName: 'cypress_code' })
  cypressCode?: string;

  @Property({ type: 'boolean', default: true, fieldName: 'is_active' })
  isActive: boolean = true;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'timestamptz', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  constructor(project: Project, testScenario: string, expectedResult: string) {
    this.project = project;
    this.testScenario = testScenario;
    this.expectedResult = expectedResult;
  }
}