import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { TestCase } from './TestCase.entity';
import { GeneratedCode } from './GeneratedCode.entity';

@Entity({ tableName: 'execution_results' })
export class ExecutionResult {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @ManyToOne(() => TestCase, { fieldName: 'test_case_id' })
  testCase: TestCase;

  @ManyToOne(() => GeneratedCode, { fieldName: 'generated_code_id', nullable: true })
  generatedCode?: GeneratedCode;

  @Property({ type: 'varchar', length: 50, default: 'pending' })
  status: string = 'pending';

  @Property({ type: 'jsonb', nullable: true })
  results?: any;

  @Property({ type: 'text', nullable: true })
  logs?: string;

  @Property({ type: 'text', nullable: true })
  errors?: string;

  @Property({ type: 'timestamptz', nullable: true, fieldName: 'started_at' })
  startedAt?: Date;

  @Property({ type: 'timestamptz', nullable: true, fieldName: 'completed_at' })
  completedAt?: Date;

  @Property({ type: 'integer', nullable: true })
  duration?: number;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  constructor(testCase: TestCase) {
    this.testCase = testCase;
  }
}