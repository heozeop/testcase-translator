import { URL } from 'url';
import * as net from 'net';

export interface UrlValidationResult {
  isValid: boolean;
  isSafe: boolean;
  error?: string;
  parsedUrl?: URL;
  warnings?: string[];
}

export class UrlValidationService {
  private static readonly PRIVATE_IP_RANGES = [
    // IPv4 private ranges
    /^127\./,           // 127.0.0.0/8 (localhost)
    /^10\./,            // 10.0.0.0/8
    /^192\.168\./,      // 192.168.0.0/16
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
    /^169\.254\./,      // 169.254.0.0/16 (link-local)
    /^0\./,             // 0.0.0.0/8
    
    // IPv6 private ranges
    /^::1$/,            // ::1 (localhost)
    /^fc00:/,           // fc00::/7 (unique local)
    /^fe80:/,           // fe80::/10 (link-local)
    /^ff00:/,           // ff00::/8 (multicast)
    /^::$/,             // :: (unspecified)
  ];

  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];

  private static readonly BLOCKED_DOMAINS = [
    'localhost',
    '0.0.0.0',
    'metadata.google.internal',
    '169.254.169.254',
    'ipinfo.io',
    'ifconfig.me',
    'checkip.amazonaws.com'
  ];

  static validateUrl(urlString: string): UrlValidationResult {
    const warnings: string[] = [];

    // Basic URL format validation
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString);
    } catch (error) {
      return {
        isValid: false,
        isSafe: false,
        error: 'Invalid URL format'
      };
    }

    // Protocol validation
    if (!this.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
      return {
        isValid: false,
        isSafe: false,
        error: `Protocol '${parsedUrl.protocol}' is not allowed. Only HTTP and HTTPS are permitted.`,
        parsedUrl
      };
    }

    // Domain validation
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // Check blocked domains
    if (this.BLOCKED_DOMAINS.includes(hostname)) {
      return {
        isValid: true,
        isSafe: false,
        error: `Domain '${hostname}' is blocked for security reasons.`,
        parsedUrl
      };
    }

    // Check for private IP addresses
    if (this.isPrivateIpAddress(hostname)) {
      return {
        isValid: true,
        isSafe: false,
        error: `Private IP addresses and localhost are not allowed for security reasons.`,
        parsedUrl
      };
    }

    // Additional security checks
    const securityChecks = this.performAdditionalSecurityChecks(parsedUrl);
    if (!securityChecks.isSafe) {
      return {
        isValid: true,
        isSafe: false,
        error: securityChecks.error,
        parsedUrl,
        warnings
      };
    }

    if (securityChecks.warnings) {
      warnings.push(...securityChecks.warnings);
    }

    // URL length validation
    if (urlString.length > 2048) {
      warnings.push('URL is unusually long (>2048 characters)');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = this.checkSuspiciousPatterns(urlString);
    if (suspiciousPatterns.length > 0) {
      warnings.push(...suspiciousPatterns);
    }

    return {
      isValid: true,
      isSafe: true,
      parsedUrl,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private static isPrivateIpAddress(hostname: string): boolean {
    // Check if hostname is an IP address
    if (net.isIP(hostname)) {
      return this.PRIVATE_IP_RANGES.some(range => range.test(hostname));
    }

    // Check for localhost variants
    const localhostVariants = [
      'localhost',
      'local',
      '127.0.0.1',
      '::1'
    ];

    return localhostVariants.includes(hostname.toLowerCase());
  }

  private static performAdditionalSecurityChecks(parsedUrl: URL): {
    isSafe: boolean;
    error?: string;
    warnings?: string[];
  } {
    const warnings: string[] = [];
    
    // Check for URL encoding attacks
    if (this.hasUrlEncodingAttacks(parsedUrl.href)) {
      return {
        isSafe: false,
        error: 'URL contains potentially malicious encoding patterns'
      };
    }

    // Check for unicode/punycode attacks
    if (this.hasPunycodeAttacks(parsedUrl.hostname)) {
      warnings.push('URL contains punycode characters - verify domain legitimacy');
    }

    // Check for suspicious subdomains
    if (this.hasSuspiciousSubdomains(parsedUrl.hostname)) {
      warnings.push('URL contains suspicious subdomain patterns');
    }

    // Check for data URLs or javascript: protocols in fragments
    if (parsedUrl.hash && this.containsDangerousSchemes(parsedUrl.hash)) {
      return {
        isSafe: false,
        error: 'URL fragment contains potentially dangerous schemes'
      };
    }

    return {
      isSafe: true,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  private static hasUrlEncodingAttacks(url: string): boolean {
    // Check for multiple URL encoding layers
    const multipleEncodingPattern = /%25[0-9a-fA-F]{2}/;
    
    // Check for null byte injection
    const nullBytePattern = /%00/;
    
    // Check for directory traversal attempts
    const traversalPattern = /%2e%2e%2f|%2e%2e/i;
    
    return multipleEncodingPattern.test(url) || 
           nullBytePattern.test(url) || 
           traversalPattern.test(url);
  }

  private static hasPunycodeAttacks(hostname: string): boolean {
    // Check for punycode (internationalized domain names)
    return hostname.includes('xn--');
  }

  private static hasSuspiciousSubdomains(hostname: string): boolean {
    const suspiciousPatterns = [
      /^admin\./i,
      /^api\./i,
      /^internal\./i,
      /^test\./i,
      /^staging\./i,
      /^dev\./i,
      /^debug\./i
    ];

    return suspiciousPatterns.some(pattern => pattern.test(hostname));
  }

  private static containsDangerousSchemes(fragment: string): boolean {
    const dangerousSchemes = [
      'javascript:',
      'data:',
      'vbscript:',
      'file:',
      'ftp:'
    ];

    const decoded = decodeURIComponent(fragment.toLowerCase());
    return dangerousSchemes.some(scheme => decoded.includes(scheme));
  }

  private static checkSuspiciousPatterns(url: string): string[] {
    const warnings: string[] = [];
    const lowerUrl = url.toLowerCase();

    // Check for suspicious query parameters
    const suspiciousParams = [
      'redirect=',
      'url=',
      'return=',
      'continue=',
      'next=',
      'callback='
    ];

    if (suspiciousParams.some(param => lowerUrl.includes(param))) {
      warnings.push('URL contains redirect parameters - verify destination');
    }

    // Check for unusually long paths
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.pathname.length > 500) {
        warnings.push('URL path is unusually long');
      }

      // Check for excessive query parameters
      const searchParams = new URLSearchParams(parsedUrl.search);
      if (Array.from(searchParams).length > 50) {
        warnings.push('URL has an unusually high number of query parameters');
      }
    } catch {
      // URL parsing already failed in main validation
    }

    return warnings;
  }

  static normalizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      
      // Ensure protocol is lowercase
      parsedUrl.protocol = parsedUrl.protocol.toLowerCase();
      
      // Ensure hostname is lowercase
      parsedUrl.hostname = parsedUrl.hostname.toLowerCase();
      
      // Remove default ports
      if ((parsedUrl.protocol === 'http:' && parsedUrl.port === '80') ||
          (parsedUrl.protocol === 'https:' && parsedUrl.port === '443')) {
        parsedUrl.port = '';
      }
      
      // Remove trailing slash if path is just '/'
      if (parsedUrl.pathname === '/' && !parsedUrl.search && !parsedUrl.hash) {
        parsedUrl.pathname = '';
      }
      
      return parsedUrl.toString();
    } catch {
      return url; // Return original if parsing fails
    }
  }

  static getSecurityHeaders(): Record<string, string> {
    return {
      'User-Agent': 'TestcaseTranslator/1.0 (Security Scanner)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
  }
}