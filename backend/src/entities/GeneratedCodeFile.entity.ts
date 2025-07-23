import { Entity, PrimaryKey, Property, ManyToOne } from '@mikro-orm/core';
import { v4 as uuid } from 'uuid';
import { GeneratedCode } from './GeneratedCode.entity';

@Entity({ tableName: 'generated_code_files' })
export class GeneratedCodeFile {
  @PrimaryKey({ type: 'varchar', length: 36 })
  id: string = uuid();

  @ManyToOne(() => GeneratedCode, { fieldName: 'generation_id' })
  generatedCode: GeneratedCode;

  @Property({ type: 'varchar', length: 100, fieldName: 'file_type' })
  fileType: string;

  @Property({ type: 'varchar', length: 255, fieldName: 'file_name' })
  fileName: string;

  @Property({ type: 'varchar', length: 500, fieldName: 'file_path' })
  filePath: string;

  @Property({ type: 'int', nullable: true, fieldName: 'file_size' })
  fileSize?: number;

  @Property({ type: 'timestamptz', fieldName: 'created_at', onCreate: () => new Date() })
  createdAt: Date = new Date();

  constructor(generatedCode: GeneratedCode, fileType: string, fileName: string, filePath: string, fileSize?: number) {
    this.generatedCode = generatedCode;
    this.fileType = fileType;
    this.fileName = fileName;
    this.filePath = filePath;
    this.fileSize = fileSize;
  }
}