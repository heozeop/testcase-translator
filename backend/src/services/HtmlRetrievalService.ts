import * as cheerio from 'cheerio';
import { HttpClientService } from './HttpClientService';
import { UrlAccessibilityService } from './UrlAccessibilityService';

export interface PageMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  author?: string;
  viewport?: string;
  charset?: string;
  language?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  favicon?: string;
  generator?: string;
  lastModified?: string;
  customMeta?: Record<string, string>;
}

export interface HtmlContent {
  url: string;
  finalUrl?: string;
  html: string;
  metadata: PageMetadata;
  loadTime: number;
  size: number;
  status: number;
  statusText: string;
  encoding?: string;
  redirectChain?: string[];
  links?: {
    internal: string[];
    external: string[];
  };
  images?: string[];
  forms?: FormInfo[];
  headings?: HeadingInfo[];
}

export interface FormInfo {
  action?: string;
  method: string;
  fields: FieldInfo[];
  hasFileUpload: boolean;
}

export interface FieldInfo {
  name?: string;
  type: string;
  id?: string;
  required: boolean;
  placeholder?: string;
  value?: string;
}

export interface HeadingInfo {
  level: number;
  text: string;
  id?: string;
}

export interface HtmlRetrievalOptions {
  timeout?: number;
  maxSize?: number;
  extractLinks?: boolean;
  extractImages?: boolean;
  extractForms?: boolean;
  extractHeadings?: boolean;
  followRedirects?: boolean;
  userAgent?: string;
}

export class HtmlRetrievalService {
  private httpClient: HttpClientService;
  private accessibilityService: UrlAccessibilityService;

  constructor() {
    this.httpClient = new HttpClientService();
    this.accessibilityService = new UrlAccessibilityService();
  }

  async retrieveHtmlContent(
    url: string, 
    options: HtmlRetrievalOptions = {}
  ): Promise<HtmlContent> {
    const startTime = Date.now();
    const defaults = {
      timeout: 15000,
      maxSize: 5 * 1024 * 1024, // 5MB
      extractLinks: true,
      extractImages: true,
      extractForms: true,
      extractHeadings: true,
      followRedirects: true,
      userAgent: 'TestcaseTranslator/1.0 (HTML Content Analyzer)'
    };

    const config = { ...defaults, ...options };

    // First check if URL is accessible
    const accessibilityResult = await this.accessibilityService.checkAccessibility(url, {
      timeout: config.timeout,
      followRedirects: config.followRedirects
    });

    if (!accessibilityResult.accessible) {
      throw new Error(
        `URL is not accessible: ${accessibilityResult.error || 'Unknown error'}`
      );
    }

    // Retrieve HTML content
    const response = await this.httpClient.get(url, {
      timeout: config.timeout,
      followRedirects: config.followRedirects,
      userAgent: config.userAgent
    });

    const loadTime = Date.now() - startTime;

    // Check content size
    const contentLength = this.getContentLength(response.data);
    if (contentLength > config.maxSize) {
      throw new Error(
        `Content size (${contentLength} bytes) exceeds maximum allowed size (${config.maxSize} bytes)`
      );
    }

    // Parse HTML content
    const $ = cheerio.load(response.data);
    
    const htmlContent: HtmlContent = {
      url,
      finalUrl: response.url !== url ? response.url : undefined,
      html: response.data,
      metadata: this.extractMetadata($),
      loadTime,
      size: contentLength,
      status: response.status,
      statusText: response.statusText,
      encoding: this.detectEncoding(response.headers, response.data),
      redirectChain: response.redirectChain
    };

    // Extract additional content based on options
    if (config.extractLinks) {
      htmlContent.links = this.extractLinks($, response.url);
    }

    if (config.extractImages) {
      htmlContent.images = this.extractImages($, response.url);
    }

    if (config.extractForms) {
      htmlContent.forms = this.extractForms($);
    }

    if (config.extractHeadings) {
      htmlContent.headings = this.extractHeadings($);
    }

    return htmlContent;
  }

  private extractMetadata($: cheerio.CheerioAPI): PageMetadata {
    const metadata: PageMetadata = {};

    // Basic metadata
    metadata.title = $('title').first().text().trim() || undefined;
    
    // Meta tags
    $('meta').each((_, element) => {
      const $meta = $(element);
      const name = $meta.attr('name')?.toLowerCase();
      const property = $meta.attr('property')?.toLowerCase();
      const content = $meta.attr('content');
      const httpEquiv = $meta.attr('http-equiv')?.toLowerCase();

      if (!content) return;

      // Standard meta tags
      if (name === 'description') {
        metadata.description = content;
      } else if (name === 'keywords') {
        metadata.keywords = content.split(',').map(k => k.trim());
      } else if (name === 'author') {
        metadata.author = content;
      } else if (name === 'viewport') {
        metadata.viewport = content;
      } else if (name === 'robots') {
        metadata.robots = content;
      } else if (name === 'generator') {
        metadata.generator = content;
      }

      // Open Graph tags
      else if (property === 'og:title') {
        metadata.ogTitle = content;
      } else if (property === 'og:description') {
        metadata.ogDescription = content;
      } else if (property === 'og:image') {
        metadata.ogImage = content;
      } else if (property === 'og:url') {
        metadata.ogUrl = content;
      }

      // Twitter Card tags
      else if (name === 'twitter:card') {
        metadata.twitterCard = content;
      } else if (name === 'twitter:title') {
        metadata.twitterTitle = content;
      } else if (name === 'twitter:description') {
        metadata.twitterDescription = content;
      } else if (name === 'twitter:image') {
        metadata.twitterImage = content;
      }

      // HTTP-Equiv tags
      else if (httpEquiv === 'content-language') {
        metadata.language = content;
      } else if (httpEquiv === 'last-modified') {
        metadata.lastModified = content;
      }

      // Custom meta tags
      else if (name && !metadata.customMeta) {
        metadata.customMeta = {};
      }
      if (name && metadata.customMeta) {
        metadata.customMeta[name] = content;
      }
    });

    // Charset
    const charset = $('meta[charset]').attr('charset') || 
                   $('meta[http-equiv="content-type"]').attr('content')?.match(/charset=([^;]+)/i)?.[1];
    if (charset) {
      metadata.charset = charset;
    }

    // Language from html tag
    if (!metadata.language) {
      metadata.language = $('html').attr('lang') || undefined;
    }

    // Canonical URL
    metadata.canonical = $('link[rel="canonical"]').attr('href') || undefined;

    // Favicon
    metadata.favicon = $('link[rel*="icon"]').first().attr('href') || 
                      $('link[rel="shortcut icon"]').attr('href') || undefined;

    return metadata;
  }

  private extractLinks($: cheerio.CheerioAPI, baseUrl: string): {
    internal: string[];
    external: string[];
  } {
    const links = { internal: [], external: [] };
    const baseDomain = new URL(baseUrl).hostname;

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      try {
        const absoluteUrl = new URL(href, baseUrl).href;
        const linkDomain = new URL(absoluteUrl).hostname;

        if (linkDomain === baseDomain) {
          if (!links.internal.includes(absoluteUrl)) {
            links.internal.push(absoluteUrl);
          }
        } else {
          if (!links.external.includes(absoluteUrl)) {
            links.external.push(absoluteUrl);
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });

    return links;
  }

  private extractImages($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const images: string[] = [];

    $('img[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (!src) return;

      try {
        const absoluteUrl = new URL(src, baseUrl).href;
        if (!images.includes(absoluteUrl)) {
          images.push(absoluteUrl);
        }
      } catch {
        // Invalid URL, skip
      }
    });

    return images;
  }

  private extractForms($: cheerio.CheerioAPI): FormInfo[] {
    const forms: FormInfo[] = [];

    $('form').each((_, formElement) => {
      const $form = $(formElement);
      const action = $form.attr('action') || undefined;
      const method = ($form.attr('method') || 'get').toLowerCase();
      
      const fields: FieldInfo[] = [];
      let hasFileUpload = false;

      // Extract input fields
      $form.find('input, select, textarea').each((_, fieldElement) => {
        const $field = $(fieldElement);
        const type = $field.attr('type') || $field.prop('tagName')?.toLowerCase() || 'text';
        
        if (type === 'file') {
          hasFileUpload = true;
        }

        fields.push({
          name: $field.attr('name') || undefined,
          type,
          id: $field.attr('id') || undefined,
          required: $field.prop('required') || false,
          placeholder: $field.attr('placeholder') || undefined,
          value: $field.attr('value') || undefined
        });
      });

      forms.push({
        action,
        method,
        fields,
        hasFileUpload
      });
    });

    return forms;
  }

  private extractHeadings($: cheerio.CheerioAPI): HeadingInfo[] {
    const headings: HeadingInfo[] = [];

    $('h1, h2, h3, h4, h5, h6').each((_, element) => {
      const $heading = $(element);
      const tagName = element.tagName.toLowerCase();
      const level = parseInt(tagName.substring(1), 10);
      const text = $heading.text().trim();
      const id = $heading.attr('id') || undefined;

      if (text) {
        headings.push({
          level,
          text,
          id
        });
      }
    });

    return headings;
  }

  private getContentLength(content: string): number {
    return Buffer.byteLength(content, 'utf8');
  }

  private detectEncoding(headers: Record<string, string>, content: string): string | undefined {
    // Check Content-Type header
    const contentType = headers['content-type'] || headers['Content-Type'];
    if (contentType) {
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      if (charsetMatch) {
        return charsetMatch[1].trim();
      }
    }

    // Check HTML meta tag
    const metaCharsetMatch = content.match(/<meta[^>]+charset=["']?([^"'>]+)/i);
    if (metaCharsetMatch) {
      return metaCharsetMatch[1];
    }

    return undefined;
  }

  async retrieveMetadataOnly(url: string): Promise<PageMetadata> {
    const htmlContent = await this.retrieveHtmlContent(url, {
      extractLinks: false,
      extractImages: false,
      extractForms: false,
      extractHeadings: false
    });

    return htmlContent.metadata;
  }

  // Cleanup resources
  destroy(): void {
    this.httpClient.destroy();
    this.accessibilityService.destroy();
  }
}