import { Entity, PrimaryKey, Property, OneToMany, Collection } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { TestCase } from './TestCase.entity';
import { GeneratedCode } from './GeneratedCode.entity';
import { TestExample } from './TestExample.entity';

@Entity({ tableName: 'projects' })
export class Project {
  @PrimaryKey({ type: 'varchar', length: 36 })
  id: string = uuid();

  @Property({ type: 'varchar', length: 255 })
  name: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'target_url' })
  targetUrl: string;

  @Property({ type: 'text', nullable: true })
  description?: string;

  @Property({ type: 'varchar', length: 50, default: 'active' })
  status: string = 'active';

  @Property({ type: 'datetime', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @Property({ type: 'datetime', fieldName: 'updated_at', onCreate: () => new Date(), onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  @OneToMany(() => TestCase, testCase => testCase.project)
  testCases = new Collection<TestCase>(this);

  @OneToMany(() => GeneratedCode, generatedCode => generatedCode.project, { orphanRemoval: true })
  generatedCodes = new Collection<GeneratedCode>(this);

  @OneToMany(() => TestExample, testExample => testExample.project)
  testExamples = new Collection<TestExample>(this);

  constructor(name: string, targetUrl: string, description?: string) {
    this.name = name;
    this.targetUrl = targetUrl;
    this.description = description;
  }
}