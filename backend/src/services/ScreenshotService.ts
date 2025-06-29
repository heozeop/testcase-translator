import * as fs from 'fs/promises';
import * as path from 'path';
import { PuppeteerService } from './PuppeteerService';

export interface ScreenshotOptions {
  quality: number;
  fullPage: boolean;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  omitBackground: boolean;
  encoding: 'binary' | 'base64';
  format: 'png' | 'jpeg' | 'webp';
}

export interface ScreenshotMetadata {
  id: string;
  sessionId: string;
  sequenceId?: string;
  pageUrl: string;
  timestamp: number;
  filename: string;
  filepath: string;
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  options: ScreenshotOptions;
  hash: string;
}

export interface ScreenshotStorageConfig {
  baseDirectory: string;
  maxFileSize: number;
  compressionLevel: number;
  retentionDays: number;
  enableDuplicateDetection: boolean;
  storageFormat: 'filesystem' | 'database' | 'cloud';
  namingPattern: string;
}

export class ScreenshotService {
  private puppeteerService: PuppeteerService;
  private config: ScreenshotStorageConfig;
  private screenshots: Map<string, ScreenshotMetadata> = new Map();

  private readonly defaultOptions: ScreenshotOptions = {
    quality: 80,
    fullPage: true,
    omitBackground: false,
    encoding: 'binary',
    format: 'png'
  };

  constructor(
    puppeteerService: PuppeteerService,
    config: Partial<ScreenshotStorageConfig> = {}
  ) {
    this.puppeteerService = puppeteerService;
    this.config = {
      baseDirectory: './storage/screenshots',
      maxFileSize: 5 * 1024 * 1024, // 5MB
      compressionLevel: 6,
      retentionDays: 30,
      enableDuplicateDetection: true,
      storageFormat: 'filesystem',
      namingPattern: '{sessionId}/{timestamp}_{type}_{hash}',
      ...config
    };

    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.config.baseDirectory, { recursive: true });
      console.log(`Screenshot storage initialized at: ${this.config.baseDirectory}`);
    } catch (error) {
      console.error('Failed to initialize screenshot storage:', error);
    }
  }

  async capturePageScreenshot(
    pageId: string,
    sessionId: string,
    pageUrl: string,
    sequenceId?: string,
    type: 'navigation' | 'interaction' | 'error' | 'final' = 'navigation',
    options: Partial<ScreenshotOptions> = {}
  ): Promise<ScreenshotMetadata> {
    try {
      const screenshotOptions = { ...this.defaultOptions, ...options };
      
      // Take screenshot using Puppeteer service
      const screenshotBuffer = await this.puppeteerService.screenshot(pageId, {
        fullPage: screenshotOptions.fullPage
      });

      // Check file size
      if (screenshotBuffer.length > this.config.maxFileSize) {
        throw new Error(`Screenshot too large: ${screenshotBuffer.length} bytes > ${this.config.maxFileSize} bytes`);
      }

      // Generate hash for duplicate detection
      const hash = await this.generateHash(screenshotBuffer);

      // Check for duplicates if enabled
      if (this.config.enableDuplicateDetection) {
        const existingScreenshot = this.findByHash(hash);
        if (existingScreenshot) {
          console.log(`Duplicate screenshot detected, reusing: ${existingScreenshot.id}`);
          return existingScreenshot;
        }
      }

      // Generate metadata
      const metadata = await this.generateMetadata(
        sessionId,
        sequenceId,
        pageUrl,
        type,
        screenshotBuffer,
        screenshotOptions,
        hash
      );

      // Save screenshot to storage
      await this.saveToStorage(screenshotBuffer, metadata);

      // Store metadata
      this.screenshots.set(metadata.id, metadata);

      console.log(`Screenshot captured and saved: ${metadata.id} (${metadata.fileSize} bytes)`);
      return metadata;

    } catch (error) {
      console.error('Failed to capture screenshot:', error);
      throw error;
    }
  }

  async captureElementScreenshot(
    pageId: string,
    selector: string,
    sessionId: string,
    pageUrl: string,
    sequenceId?: string,
    options: Partial<ScreenshotOptions> = {}
  ): Promise<ScreenshotMetadata> {
    try {
      // Get element bounds for clipping
      const elementBounds = await this.puppeteerService.evaluateScript(pageId, `
        const element = document.querySelector('${selector}');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      `);

      if (!elementBounds) {
        throw new Error(`Element not found: ${selector}`);
      }

      const screenshotOptions = {
        ...this.defaultOptions,
        ...options,
        fullPage: false,
        clip: elementBounds
      };

      return await this.capturePageScreenshot(
        pageId,
        sessionId,
        pageUrl,
        sequenceId,
        'interaction',
        screenshotOptions
      );

    } catch (error) {
      console.error('Failed to capture element screenshot:', error);
      throw error;
    }
  }

  async captureErrorScreenshot(
    pageId: string,
    sessionId: string,
    pageUrl: string,
    errorMessage: string,
    sequenceId?: string
  ): Promise<ScreenshotMetadata> {
    try {
      const metadata = await this.capturePageScreenshot(
        pageId,
        sessionId,
        pageUrl,
        sequenceId,
        'error',
        { quality: 90, fullPage: true }
      );

      // Add error information to metadata
      (metadata as any).errorMessage = errorMessage;

      console.log(`Error screenshot captured for: ${errorMessage}`);
      return metadata;

    } catch (error) {
      console.error('Failed to capture error screenshot:', error);
      throw error;
    }
  }

  async captureSequenceScreenshots(
    pageId: string,
    sessionId: string,
    sequenceId: string,
    pageUrl: string,
    actions: string[]
  ): Promise<ScreenshotMetadata[]> {
    const screenshots: ScreenshotMetadata[] = [];

    // Initial screenshot
    screenshots.push(await this.capturePageScreenshot(
      pageId,
      sessionId,
      pageUrl,
      sequenceId,
      'navigation',
      { quality: 70 }
    ));

    // Screenshots after each major action
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      try {
        const metadata = await this.capturePageScreenshot(
          pageId,
          sessionId,
          pageUrl,
          sequenceId,
          'interaction',
          { quality: 60 }
        );
        
        (metadata as any).actionContext = action;
        (metadata as any).actionIndex = i;
        screenshots.push(metadata);

      } catch (error) {
        console.warn(`Failed to capture screenshot for action ${i}: ${action}`, error);
      }
    }

    // Final screenshot
    screenshots.push(await this.capturePageScreenshot(
      pageId,
      sessionId,
      pageUrl,
      sequenceId,
      'final',
      { quality: 80 }
    ));

    console.log(`Captured ${screenshots.length} screenshots for sequence: ${sequenceId}`);
    return screenshots;
  }

  private async generateMetadata(
    sessionId: string,
    sequenceId: string | undefined,
    pageUrl: string,
    type: string,
    buffer: Buffer,
    options: ScreenshotOptions,
    hash: string
  ): Promise<ScreenshotMetadata> {
    const id = this.generateScreenshotId();
    const timestamp = Date.now();
    const filename = this.generateFilename(sessionId, type, timestamp, hash);
    const filepath = this.generateFilepath(sessionId, filename);

    // Get image dimensions (simplified - in real implementation use image library)
    const dimensions = await this.getImageDimensions(buffer);

    return {
      id,
      sessionId,
      sequenceId,
      pageUrl,
      timestamp,
      filename,
      filepath,
      fileSize: buffer.length,
      dimensions,
      options,
      hash
    };
  }

  private async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    // Simplified implementation - in practice, use sharp or similar library
    // For PNG files, dimensions are stored in header
    try {
      if (buffer.slice(1, 4).toString() === 'PNG') {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    } catch (error) {
      console.warn('Failed to read image dimensions:', error);
    }
    
    return { width: 0, height: 0 };
  }

  private generateFilename(sessionId: string, type: string, timestamp: number, hash: string): string {
    const shortHash = hash.substring(0, 8);
    return `${sessionId}_${timestamp}_${type}_${shortHash}.png`;
  }

  private generateFilepath(sessionId: string, filename: string): string {
    return path.join(this.config.baseDirectory, sessionId, filename);
  }

  private async saveToStorage(buffer: Buffer, metadata: ScreenshotMetadata): Promise<void> {
    try {
      // Ensure directory exists
      const directory = path.dirname(metadata.filepath);
      await fs.mkdir(directory, { recursive: true });

      // Write file
      await fs.writeFile(metadata.filepath, buffer);

      console.log(`Screenshot saved to: ${metadata.filepath}`);

    } catch (error) {
      console.error('Failed to save screenshot:', error);
      throw error;
    }
  }

  private async generateHash(buffer: Buffer): Promise<string> {
    // Simple hash implementation - in practice use crypto
    let hash = 0;
    for (let i = 0; i < buffer.length; i += 1000) { // Sample every 1000th byte
      hash = ((hash << 5) - hash + buffer[i]) & 0xffffffff;
    }
    return Math.abs(hash).toString(16);
  }

  private findByHash(hash: string): ScreenshotMetadata | undefined {
    return Array.from(this.screenshots.values()).find(s => s.hash === hash);
  }

  private generateScreenshotId(): string {
    return `screenshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for retrieval and management

  async getScreenshot(screenshotId: string): Promise<ScreenshotMetadata | null> {
    return this.screenshots.get(screenshotId) || null;
  }

  async getScreenshotsBySession(sessionId: string): Promise<ScreenshotMetadata[]> {
    return Array.from(this.screenshots.values()).filter(s => s.sessionId === sessionId);
  }

  async getScreenshotsBySequence(sequenceId: string): Promise<ScreenshotMetadata[]> {
    return Array.from(this.screenshots.values()).filter(s => s.sequenceId === sequenceId);
  }

  async getScreenshotBuffer(screenshotId: string): Promise<Buffer | null> {
    const metadata = this.screenshots.get(screenshotId);
    if (!metadata) return null;

    try {
      return await fs.readFile(metadata.filepath);
    } catch (error) {
      console.error('Failed to read screenshot file:', error);
      return null;
    }
  }

  async deleteScreenshot(screenshotId: string): Promise<boolean> {
    const metadata = this.screenshots.get(screenshotId);
    if (!metadata) return false;

    try {
      await fs.unlink(metadata.filepath);
      this.screenshots.delete(screenshotId);
      console.log(`Screenshot deleted: ${screenshotId}`);
      return true;
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      return false;
    }
  }

  async cleanupOldScreenshots(): Promise<number> {
    const cutoffTime = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    for (const [id, metadata] of this.screenshots) {
      if (metadata.timestamp < cutoffTime) {
        if (await this.deleteScreenshot(id)) {
          deletedCount++;
        }
      }
    }

    console.log(`Cleaned up ${deletedCount} old screenshots`);
    return deletedCount;
  }

  async getStorageStats(): Promise<{
    totalScreenshots: number;
    totalSize: number;
    avgSize: number;
    oldestTimestamp: number;
    newestTimestamp: number;
  }> {
    const screenshots = Array.from(this.screenshots.values());
    const totalSize = screenshots.reduce((sum, s) => sum + s.fileSize, 0);
    const timestamps = screenshots.map(s => s.timestamp);

    return {
      totalScreenshots: screenshots.length,
      totalSize,
      avgSize: screenshots.length > 0 ? totalSize / screenshots.length : 0,
      oldestTimestamp: Math.min(...timestamps),
      newestTimestamp: Math.max(...timestamps)
    };
  }

  async optimizeScreenshot(screenshotId: string, targetQuality: number = 60): Promise<ScreenshotMetadata | null> {
    const metadata = this.screenshots.get(screenshotId);
    if (!metadata) return null;

    try {
      const buffer = await fs.readFile(metadata.filepath);
      
      // In a real implementation, use sharp or similar for optimization
      // For now, just update metadata
      const optimizedMetadata = {
        ...metadata,
        id: this.generateScreenshotId(),
        filename: metadata.filename.replace('.png', '_optimized.png'),
        options: { ...metadata.options, quality: targetQuality }
      };

      optimizedMetadata.filepath = this.generateFilepath(metadata.sessionId, optimizedMetadata.filename);
      
      // Save optimized version (in practice, actually compress the image)
      await fs.writeFile(optimizedMetadata.filepath, buffer);
      
      this.screenshots.set(optimizedMetadata.id, optimizedMetadata);
      
      console.log(`Screenshot optimized: ${screenshotId} -> ${optimizedMetadata.id}`);
      return optimizedMetadata;

    } catch (error) {
      console.error('Failed to optimize screenshot:', error);
      return null;
    }
  }
}