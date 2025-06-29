import CryptoJS from 'crypto-js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

export interface EncryptedData {
  encryptedValue: string;
  iv: string;
  salt: string;
  algorithm: string;
  keyDerivation: string;
  timestamp: number;
  metadata?: {
    securityLevel: 'public' | 'internal' | 'confidential' | 'restricted';
    category: string;
    expiresAt?: number;
  };
}

export interface EncryptionConfig {
  algorithm: 'AES' | 'TripleDES';
  keySize: 128 | 192 | 256;
  iterations: number;
  saltLength: number;
  ivLength: number;
  hashingRounds: number;
}

export interface KeyInfo {
  keyId: string;
  algorithm: string;
  keySize: number;
  createdAt: number;
  expiresAt?: number;
  isActive: boolean;
}

export class InputEncryptionService {
  private config: EncryptionConfig;
  private masterKey: string;
  private keyRotationKeys: Map<string, string> = new Map();
  private activeKeyId: string;

  constructor(masterPassword: string, config: Partial<EncryptionConfig> = {}) {
    this.config = {
      algorithm: 'AES',
      keySize: 256,
      iterations: 10000,
      saltLength: 32,
      ivLength: 16,
      hashingRounds: 12,
      ...config
    };

    this.masterKey = this.deriveMasterKey(masterPassword);
    this.activeKeyId = this.generateKeyId();
    this.keyRotationKeys.set(this.activeKeyId, this.masterKey);
  }

  async encryptInput(
    value: any,
    securityLevel: 'public' | 'internal' | 'confidential' | 'restricted',
    category: string,
    expiresAt?: number
  ): Promise<EncryptedData> {
    // Don't encrypt public data
    if (securityLevel === 'public') {
      return {
        encryptedValue: JSON.stringify(value),
        iv: '',
        salt: '',
        algorithm: 'none',
        keyDerivation: 'none',
        timestamp: Date.now(),
        metadata: {
          securityLevel,
          category,
          expiresAt
        }
      };
    }

    const salt = this.generateSalt();
    const iv = this.generateIV();
    const derivedKey = this.deriveKey(this.masterKey, salt);
    
    const serializedValue = JSON.stringify(value);
    
    let encryptedValue: string;
    
    switch (this.config.algorithm) {
      case 'AES':
        encryptedValue = CryptoJS.AES.encrypt(serializedValue, derivedKey, {
          iv: CryptoJS.enc.Hex.parse(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }).toString();
        break;
      
      case 'TripleDES':
        encryptedValue = CryptoJS.TripleDES.encrypt(serializedValue, derivedKey, {
          iv: CryptoJS.enc.Hex.parse(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7
        }).toString();
        break;
      
      default:
        throw new Error(`Unsupported encryption algorithm: ${this.config.algorithm}`);
    }

    return {
      encryptedValue,
      iv,
      salt,
      algorithm: this.config.algorithm,
      keyDerivation: 'PBKDF2',
      timestamp: Date.now(),
      metadata: {
        securityLevel,
        category,
        expiresAt
      }
    };
  }

  async decryptInput(encryptedData: EncryptedData): Promise<any> {
    // Check if data is expired
    if (encryptedData.metadata?.expiresAt && 
        encryptedData.metadata.expiresAt < Date.now()) {
      throw new Error('Encrypted data has expired');
    }

    // Handle unencrypted public data
    if (encryptedData.algorithm === 'none') {
      return JSON.parse(encryptedData.encryptedValue);
    }

    const derivedKey = this.deriveKey(this.masterKey, encryptedData.salt);
    
    let decryptedValue: string;
    
    try {
      switch (encryptedData.algorithm) {
        case 'AES':
          const decryptedAES = CryptoJS.AES.decrypt(encryptedData.encryptedValue, derivedKey, {
            iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          });
          decryptedValue = decryptedAES.toString(CryptoJS.enc.Utf8);
          break;
        
        case 'TripleDES':
          const decryptedDES = CryptoJS.TripleDES.decrypt(encryptedData.encryptedValue, derivedKey, {
            iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
          });
          decryptedValue = decryptedDES.toString(CryptoJS.enc.Utf8);
          break;
        
        default:
          throw new Error(`Unsupported decryption algorithm: ${encryptedData.algorithm}`);
      }
      
      if (!decryptedValue) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }
      
      return JSON.parse(decryptedValue);
    } catch (error) {
      throw new Error(`Decryption failed: ${error}`);
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.config.hashingRounds);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async encryptBulkInputs(
    inputs: Record<string, any>,
    securityLevel: 'public' | 'internal' | 'confidential' | 'restricted',
    category: string
  ): Promise<Record<string, EncryptedData>> {
    const encrypted: Record<string, EncryptedData> = {};
    
    for (const [key, value] of Object.entries(inputs)) {
      encrypted[key] = await this.encryptInput(value, securityLevel, category);
    }
    
    return encrypted;
  }

  async decryptBulkInputs(
    encryptedInputs: Record<string, EncryptedData>
  ): Promise<Record<string, any>> {
    const decrypted: Record<string, any> = {};
    
    for (const [key, encryptedData] of Object.entries(encryptedInputs)) {
      try {
        decrypted[key] = await this.decryptInput(encryptedData);
      } catch (error) {
        console.error(`Failed to decrypt input ${key}:`, error);
        // Continue with other inputs
      }
    }
    
    return decrypted;
  }

  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  generateAPIKey(): string {
    const prefix = 'tk';
    const timestamp = Date.now().toString(36);
    const random = randomBytes(16).toString('hex');
    return `${prefix}_${timestamp}_${random}`;
  }

  async rotateEncryptionKey(): Promise<string> {
    const newKeyId = this.generateKeyId();
    const newKey = this.generateNewMasterKey();
    
    this.keyRotationKeys.set(newKeyId, newKey);
    
    // Keep old key for decryption but use new key for encryption
    const oldKeyId = this.activeKeyId;
    this.activeKeyId = newKeyId;
    this.masterKey = newKey;
    
    // Schedule old key deletion after grace period (e.g., 30 days)
    setTimeout(() => {
      this.keyRotationKeys.delete(oldKeyId);
    }, 30 * 24 * 60 * 60 * 1000); // 30 days
    
    return newKeyId;
  }

  async migrateEncryptedData(
    oldEncryptedData: EncryptedData,
    newSecurityLevel?: 'public' | 'internal' | 'confidential' | 'restricted'
  ): Promise<EncryptedData> {
    // Decrypt with old key
    const decryptedValue = await this.decryptInput(oldEncryptedData);
    
    // Re-encrypt with current key and new security level
    const securityLevel = newSecurityLevel || oldEncryptedData.metadata?.securityLevel || 'internal';
    const category = oldEncryptedData.metadata?.category || 'migrated';
    
    return this.encryptInput(decryptedValue, securityLevel, category);
  }

  validateEncryptedData(encryptedData: EncryptedData): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (!encryptedData.encryptedValue) {
      errors.push('Missing encrypted value');
    }
    
    if (!encryptedData.algorithm) {
      errors.push('Missing algorithm');
    }
    
    if (encryptedData.algorithm !== 'none' && !encryptedData.salt) {
      errors.push('Missing salt for encrypted data');
    }
    
    if (encryptedData.algorithm !== 'none' && !encryptedData.iv) {
      errors.push('Missing IV for encrypted data');
    }
    
    if (!encryptedData.timestamp) {
      errors.push('Missing timestamp');
    }
    
    // Check if data is expired
    if (encryptedData.metadata?.expiresAt && 
        encryptedData.metadata.expiresAt < Date.now()) {
      errors.push('Data has expired');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  getSecurityLevelRequirement(securityLevel: string): {
    requiresEncryption: boolean;
    minKeySize: number;
    maxRetention: number; // in milliseconds
    auditRequired: boolean;
  } {
    switch (securityLevel) {
      case 'public':
        return {
          requiresEncryption: false,
          minKeySize: 0,
          maxRetention: Infinity,
          auditRequired: false
        };
      
      case 'internal':
        return {
          requiresEncryption: true,
          minKeySize: 128,
          maxRetention: 365 * 24 * 60 * 60 * 1000, // 1 year
          auditRequired: false
        };
      
      case 'confidential':
        return {
          requiresEncryption: true,
          minKeySize: 256,
          maxRetention: 90 * 24 * 60 * 60 * 1000, // 90 days
          auditRequired: true
        };
      
      case 'restricted':
        return {
          requiresEncryption: true,
          minKeySize: 256,
          maxRetention: 30 * 24 * 60 * 60 * 1000, // 30 days
          auditRequired: true
        };
      
      default:
        return {
          requiresEncryption: true,
          minKeySize: 256,
          maxRetention: 90 * 24 * 60 * 60 * 1000,
          auditRequired: true
        };
    }
  }

  private deriveMasterKey(password: string): string {
    const salt = 'testcase-translator-salt'; // In production, use a unique salt per installation
    return CryptoJS.PBKDF2(password, salt, {
      keySize: this.config.keySize / 32,
      iterations: this.config.iterations
    }).toString();
  }

  private deriveKey(masterKey: string, salt: string): string {
    return CryptoJS.PBKDF2(masterKey, salt, {
      keySize: this.config.keySize / 32,
      iterations: this.config.iterations
    }).toString();
  }

  private generateSalt(): string {
    return randomBytes(this.config.saltLength).toString('hex');
  }

  private generateIV(): string {
    return randomBytes(this.config.ivLength).toString('hex');
  }

  private generateKeyId(): string {
    return `key_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private generateNewMasterKey(): string {
    return randomBytes(this.config.keySize / 8).toString('hex');
  }

  // Audit and compliance methods
  createAuditLog(
    action: 'encrypt' | 'decrypt' | 'access' | 'delete',
    dataId: string,
    securityLevel: string,
    userId?: string
  ): {
    timestamp: number;
    action: string;
    dataId: string;
    securityLevel: string;
    userId?: string;
    keyId: string;
  } {
    return {
      timestamp: Date.now(),
      action,
      dataId,
      securityLevel,
      userId,
      keyId: this.activeKeyId
    };
  }

  async secureDelete(encryptedData: EncryptedData): Promise<boolean> {
    try {
      // For secure deletion, we would:
      // 1. Overwrite the encrypted data multiple times
      // 2. Remove from key rotation if applicable
      // 3. Log the deletion for audit purposes
      
      // Simulated secure deletion
      encryptedData.encryptedValue = '';
      encryptedData.iv = '';
      encryptedData.salt = '';
      
      return true;
    } catch (error) {
      console.error('Secure deletion failed:', error);
      return false;
    }
  }

  getEncryptionInfo(): {
    algorithm: string;
    keySize: number;
    activeKeyId: string;
    totalKeys: number;
    config: EncryptionConfig;
  } {
    return {
      algorithm: this.config.algorithm,
      keySize: this.config.keySize,
      activeKeyId: this.activeKeyId,
      totalKeys: this.keyRotationKeys.size,
      config: { ...this.config }
    };
  }

  // Health check for encryption service
  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'error';
    checks: {
      keyAvailability: boolean;
      encryptionFunctional: boolean;
      decryptionFunctional: boolean;
    };
    errors: string[];
  }> {
    const errors: string[] = [];
    const checks = {
      keyAvailability: false,
      encryptionFunctional: false,
      decryptionFunctional: false
    };

    try {
      // Check key availability
      checks.keyAvailability = this.keyRotationKeys.has(this.activeKeyId);
      if (!checks.keyAvailability) {
        errors.push('Active encryption key not found');
      }

      // Test encryption/decryption
      const testData = { test: 'health check data' };
      const encrypted = await this.encryptInput(testData, 'internal', 'health-check');
      checks.encryptionFunctional = true;

      const decrypted = await this.decryptInput(encrypted);
      checks.decryptionFunctional = JSON.stringify(decrypted) === JSON.stringify(testData);
      
      if (!checks.decryptionFunctional) {
        errors.push('Decryption test failed');
      }

    } catch (error) {
      errors.push(`Health check failed: ${error}`);
    }

    const allChecksPass = Object.values(checks).every(check => check);
    const status = errors.length === 0 && allChecksPass ? 'healthy' : 
                   errors.length > 0 ? 'error' : 'warning';

    return {
      status,
      checks,
      errors
    };
  }
}