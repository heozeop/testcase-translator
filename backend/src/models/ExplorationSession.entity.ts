import { Entity, PrimaryKey, Property, ManyToOne, OneToMany, Collection } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { Project } from './Project.entity';
import { ExplorationResult } from './ExplorationResult.entity';

@Entity({ tableName: 'exploration_sessions' })
export class ExplorationSession {
  @PrimaryKey({ type: 'varchar', length: 36 })
  id: string = uuid();

  @ManyToOne(() => Project, { fieldName: 'project_id' })
  project: Project;

  @Property({ type: 'varchar', length: 500, fieldName: 'start_url' })
  startUrl: string;

  @Property({ type: 'varchar', length: 500, nullable: true, fieldName: 'current_url' })
  currentUrl?: string;

  @Property({ type: 'varchar', length: 50, default: 'active' })
  status = 'active';

  @Property({ type: 'jsonb', nullable: true })
  configuration?: any;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Property({ type: 'timestamptz', fieldName: 'started_at', onCreate: () => new Date() })
  startedAt: Date = new Date();

  @Property({ type: 'timestamptz', nullable: true, fieldName: 'ended_at' })
  endedAt?: Date;

  @Property({
    type: 'timestamptz',
    fieldName: 'last_activity',
    onCreate: () => new Date(),
    onUpdate: () => new Date(),
  })
  lastActivity: Date = new Date();

  @OneToMany(() => ExplorationResult, result => result.session)
  results = new Collection<ExplorationResult>(this);

  constructor(project: Project, startUrl: string) {
    this.project = project;
    this.startUrl = startUrl;
  }
}
