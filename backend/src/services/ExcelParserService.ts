import * as XLSX from 'xlsx';
import { Readable } from 'stream';

export interface ExcelCell {
  value: any;
  type: 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty';
  formattedValue?: string;
  coordinates: {
    row: number;
    column: number;
    address: string;
  };
}

export interface ExcelRow {
  rowIndex: number;
  cells: Record<string, ExcelCell>;
  isEmpty: boolean;
}

export interface ExcelSheet {
  name: string;
  rows: ExcelRow[];
  headers: string[];
  metadata: {
    totalRows: number;
    totalColumns: number;
    range: string;
    hasHeaders: boolean;
  };
}

export interface ExcelWorkbook {
  sheets: ExcelSheet[];
  filename: string;
  metadata: {
    totalSheets: number;
    createdDate?: Date;
    modifiedDate?: Date;
    author?: string;
    application?: string;
  };
}

export interface ExcelParsingOptions {
  parseHeaders?: boolean;
  headerRow?: number;
  maxRows?: number;
  maxColumns?: number;
  includeEmptyRows?: boolean;
  includeEmptyCells?: boolean;
  sheets?: string[] | number[]; // Specific sheets to parse
  dateNF?: string; // Date number format
}

export interface ExcelValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo: {
    size: number;
    type: string;
    isEncrypted: boolean;
    isCorrupted: boolean;
  };
}

export class ExcelParserService {
  // private static readonly SUPPORTED_FORMATS = [
  //   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  //   'application/vnd.ms-excel', // .xls
  //   'text/csv', // .csv
  //   'application/vnd.oasis.opendocument.spreadsheet' // .ods
  // ];

  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly MAX_ROWS = 10000;
  private static readonly MAX_COLUMNS = 100;

  static validateFile(file: Buffer | Uint8Array, filename: string): ExcelValidationResult {
    const result: ExcelValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      fileInfo: {
        size: file.length,
        type: this.detectFileType(filename),
        isEncrypted: false,
        isCorrupted: false
      }
    };

    // Check file size
    if (file.length > this.MAX_FILE_SIZE) {
      result.errors.push(`File size (${Math.round(file.length / 1024 / 1024)}MB) exceeds maximum allowed size (${this.MAX_FILE_SIZE / 1024 / 1024}MB)`);
      result.isValid = false;
    }

    if (file.length === 0) {
      result.errors.push('File is empty');
      result.isValid = false;
      return result;
    }

    // Check file extension
    const extension = filename.toLowerCase().split('.').pop();
    const supportedExtensions = ['xlsx', 'xls', 'csv', 'ods'];
    if (!extension || !supportedExtensions.includes(extension)) {
      result.errors.push(`Unsupported file format. Supported formats: ${supportedExtensions.join(', ')}`);
      result.isValid = false;
    }

    // Try to read file to check for corruption
    try {
      const workbook = XLSX.read(file, { type: 'buffer', cellDates: true });
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        result.errors.push('File contains no readable sheets');
        result.isValid = false;
      }
    } catch (error: any) {
      if (error.message && error.message.includes('password')) {
        result.fileInfo.isEncrypted = true;
        result.errors.push('File is password protected');
      } else {
        result.fileInfo.isCorrupted = true;
        result.errors.push('File appears to be corrupted or unreadable');
      }
      result.isValid = false;
    }

    return result;
  }

  static async parseExcelFile(
    file: Buffer | Uint8Array | Readable,
    filename: string,
    options: ExcelParsingOptions = {}
  ): Promise<ExcelWorkbook> {
    const defaults: Required<ExcelParsingOptions> = {
      parseHeaders: true,
      headerRow: 1,
      maxRows: this.MAX_ROWS,
      maxColumns: this.MAX_COLUMNS,
      includeEmptyRows: false,
      includeEmptyCells: false,
      sheets: [],
      dateNF: 'yyyy-mm-dd'
    };

    const config = { ...defaults, ...options };

    // Convert file to buffer if needed
    let buffer: Buffer;
    if (file instanceof Readable) {
      buffer = await this.streamToBuffer(file);
    } else if (file instanceof Uint8Array) {
      buffer = Buffer.from(file);
    } else {
      buffer = file;
    }

    // Validate file
    const validation = this.validateFile(buffer, filename);
    if (!validation.isValid) {
      throw new Error(`Excel file validation failed: ${validation.errors.join(', ')}`);
    }

    // Parse workbook
    const workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      cellNF: false,
      cellHTML: false
    });

    const result: ExcelWorkbook = {
      sheets: [],
      filename,
      metadata: {
        totalSheets: workbook.SheetNames.length,
        createdDate: workbook.Props?.CreatedDate,
        modifiedDate: workbook.Props?.ModifiedDate,
        author: workbook.Props?.Author,
        application: workbook.Props?.Application
      }
    };

    // Determine which sheets to parse
    const sheetsToProcess = this.getSheetsToProcess(workbook.SheetNames, config.sheets);

    for (const sheetName of sheetsToProcess) {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) continue;

      const parsedSheet = this.parseWorksheet(worksheet, sheetName, config);
      result.sheets.push(parsedSheet);
    }

    return result;
  }

  private static parseWorksheet(
    worksheet: XLSX.WorkSheet,
    sheetName: string,
    config: Required<ExcelParsingOptions>
  ): ExcelSheet {
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
    const maxRow = Math.min(range.e.r + 1, config.maxRows);
    const maxCol = Math.min(range.e.c + 1, config.maxColumns);

    const sheet: ExcelSheet = {
      name: sheetName,
      rows: [],
      headers: [],
      metadata: {
        totalRows: maxRow,
        totalColumns: maxCol,
        range: worksheet['!ref'] || 'A1:A1',
        hasHeaders: config.parseHeaders
      }
    };

    // Parse headers if specified
    if (config.parseHeaders && config.headerRow <= maxRow) {
      sheet.headers = this.extractHeaders(worksheet, config.headerRow - 1, maxCol);
    }

    // Parse rows
    const startRow = config.parseHeaders ? config.headerRow : 0;
    for (let rowIndex = startRow; rowIndex < maxRow; rowIndex++) {
      const row = this.parseRow(worksheet, rowIndex, maxCol, sheet.headers, config);
      
      if (!config.includeEmptyRows && row.isEmpty) {
        continue;
      }

      sheet.rows.push(row);
    }

    return sheet;
  }

  private static parseRow(
    worksheet: XLSX.WorkSheet,
    rowIndex: number,
    maxCol: number,
    headers: string[],
    config: Required<ExcelParsingOptions>
  ): ExcelRow {
    const row: ExcelRow = {
      rowIndex: rowIndex + 1, // 1-based for Excel rows
      cells: {},
      isEmpty: true
    };

    for (let colIndex = 0; colIndex < maxCol; colIndex++) {
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = worksheet[cellAddress];
      
      const columnKey = headers[colIndex] || this.getColumnLetter(colIndex);
      const parsedCell = this.parseCell(cell, rowIndex, colIndex, cellAddress);

      if (!config.includeEmptyCells && parsedCell.type === 'empty') {
        continue;
      }

      row.cells[columnKey] = parsedCell;

      if (parsedCell.type !== 'empty') {
        row.isEmpty = false;
      }
    }

    return row;
  }

  private static parseCell(
    cell: XLSX.CellObject | undefined,
    rowIndex: number,
    colIndex: number,
    address: string
  ): ExcelCell {
    const coordinates = {
      row: rowIndex + 1,
      column: colIndex + 1,
      address
    };

    if (!cell) {
      return {
        value: null,
        type: 'empty',
        coordinates
      };
    }

    let type: ExcelCell['type'] = 'string';
    let value: any = cell.v;
    let formattedValue: string | undefined;

    // Determine cell type
    switch (cell.t as string) {
      case 'n': // Number
        type = 'number';
        break;
      case 's': // String
        type = 'string';
        break;
      case 'b': // Boolean
        type = 'boolean';
        break;
      case 'd': // Date
        type = 'date';
        value = cell.v instanceof Date ? cell.v : (cell.v != null && typeof cell.v !== 'boolean' ? new Date(cell.v) : new Date());
        break;
      case 'f': // Formula
        type = 'formula';
        break;
      case 'e': // Error
        type = 'string';
        value = cell.w || '#ERROR';
        break;
      default:
        if (cell.v === null || cell.v === undefined) {
          type = 'empty';
        }
    }

    // Get formatted value if available
    if (cell.w) {
      formattedValue = cell.w;
    }

    return {
      value,
      type,
      formattedValue,
      coordinates
    };
  }

  private static extractHeaders(
    worksheet: XLSX.WorkSheet,
    headerRowIndex: number,
    maxCol: number
  ): string[] {
    const headers: string[] = [];

    for (let colIndex = 0; colIndex < maxCol; colIndex++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: colIndex });
      const cell = worksheet[cellAddress];
      
      let header = '';
      if (cell && cell.v !== null && cell.v !== undefined) {
        header = String(cell.v).trim();
      }

      // Generate default header if empty
      if (!header) {
        header = this.getColumnLetter(colIndex);
      }

      headers.push(header);
    }

    return headers;
  }

  private static getSheetsToProcess(sheetNames: string[], requestedSheets: string[] | number[]): string[] {
    if (requestedSheets.length === 0) {
      return sheetNames; // Process all sheets
    }

    const result: string[] = [];
    
    for (const requested of requestedSheets) {
      if (typeof requested === 'number') {
        // Sheet by index
        if (requested >= 0 && requested < sheetNames.length) {
          result.push(sheetNames[requested]);
        }
      } else {
        // Sheet by name
        if (sheetNames.includes(requested)) {
          result.push(requested);
        }
      }
    }

    return result.length > 0 ? result : [sheetNames[0]]; // Default to first sheet if none found
  }

  private static getColumnLetter(colIndex: number): string {
    let result = '';
    let num = colIndex;
    
    while (num >= 0) {
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26) - 1;
    }
    
    return result;
  }

  private static detectFileType(filename: string): string {
    const extension = filename.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'xls':
        return 'application/vnd.ms-excel';
      case 'csv':
        return 'text/csv';
      case 'ods':
        return 'application/vnd.oasis.opendocument.spreadsheet';
      default:
        return 'unknown';
    }
  }

  private static async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  // Utility method to convert parsed data to flat JSON for LLM processing
  static toFlatJSON(workbook: ExcelWorkbook): any[] {
    const result: any[] = [];

    for (const sheet of workbook.sheets) {
      for (const row of sheet.rows) {
        const rowData: any = {
          _sheetName: sheet.name,
          _rowIndex: row.rowIndex,
          _isEmpty: row.isEmpty
        };

        for (const [key, cell] of Object.entries(row.cells)) {
          rowData[key] = cell.value;
          
          // Add metadata for complex types
          if (cell.type === 'date') {
            rowData[`${key}_type`] = 'date';
            rowData[`${key}_formatted`] = cell.formattedValue;
          } else if (cell.type === 'formula') {
            rowData[`${key}_type`] = 'formula';
          }
        }

        result.push(rowData);
      }
    }

    return result;
  }

  // Utility method to extract test case structures for LLM analysis
  static extractTestCaseStructure(workbook: ExcelWorkbook): any {
    return {
      filename: workbook.filename,
      sheets: workbook.sheets.map(sheet => ({
        name: sheet.name,
        headers: sheet.headers,
        sampleRows: sheet.rows.slice(0, 5).map(row => {
          const sample: any = {};
          for (const [key, cell] of Object.entries(row.cells)) {
            sample[key] = {
              value: cell.value,
              type: cell.type
            };
          }
          return sample;
        }),
        metadata: sheet.metadata
      })),
      metadata: workbook.metadata
    };
  }
}