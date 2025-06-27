import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { ExplorationSession } from './ExplorationSession.entity';

@Entity({ tableName: 'exploration_results' })
export class ExplorationResult {
  @PrimaryKey({ type: 'uuid' })
  id: string = uuid();

  @ManyToOne(() => ExplorationSession, { fieldName: 'session_id' })
  session: ExplorationSession;

  @Property({ type: 'varchar', length: 500 })
  url: string;

  @Property({ type: 'varchar', length: 255, nullable: true })
  title?: string;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'page_states' })
  pageStates?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'navigation_actions' })
  navigationActions?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'collected_inputs' })
  collectedInputs?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'form_info' })
  formInfo?: any;

  @Property({ type: 'jsonb', nullable: true, fieldName: 'element_info' })
  elementInfo?: any;

  @Property({ type: 'varchar', length: 500, nullable: true, fieldName: 'screenshot_path' })
  screenshotPath?: string;

  @Property({ type: 'text', nullable: true })
  errors?: string;

  @Property({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  constructor(session: ExplorationSession, url: string) {
    this.session = session;
    this.url = url;
  }
}