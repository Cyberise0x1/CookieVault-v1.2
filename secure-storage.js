// ===== PHASE 2: SECURE STORAGE MODULE =====
// This module handles secure storage of sensitive data using chrome.storage.sync
// with encryption for credentials and proper validation

class SecureStorage {
  constructor() {
    // Generate or retrieve master encryption key
    this.masterKey = null;
    this.isReady = false;
    // Create a Promise that resolves when initialization is complete
    this.readyPromise = this.initializeMasterKey();
  }

  // Initialize master encryption key securely
  async initializeMasterKey() {
    try {
      // Try to get existing master key
      const storedKey = await this.getStoredMasterKey();
      if (storedKey) {
        this.masterKey = storedKey;
      } else {
        // Generate new master key and store it
        this.masterKey = this.generateSecureKey();
        await this.storeMasterKey(this.masterKey);
      }
      this.isReady = true;
    } catch (error) {
      console.error('Error initializing master key:', error);
      // If initialization fails, generate temporary key but mark as not ready
      this.masterKey = this.generateSecureKey();
      this.isReady = false;
      throw error; // Re-throw to indicate initialization failure
    }
  }

  // Generate cryptographically secure key
  generateSecureKey() {
    try {
      // Use crypto.getRandomValues for secure random generation
      const array = new Uint8Array(32); // 256 bits
      crypto.getRandomValues(array);
      // Convert to hex string
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Crypto API not available, using fallback');
      // Fallback for environments without crypto API
      return Math.random().toString(36) + Date.now().toString(36) + Math.random().toString(36);
    }
  }

  // Generate unique salt for each encryption operation
  generateSalt() {
    try {
      const array = new Uint8Array(16); // 128 bits
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      // Fallback
      return Math.random().toString(36) + Date.now().toString(36);
    }
  }

  // Store master key securely (encrypted with extension ID)
  async storeMasterKey(key) {
    try {
      const extensionId = chrome.runtime?.id || 'fallback_id';
      // Simple XOR with extension ID for basic obfuscation
      const obfuscated = this.xorString(key, extensionId, true);
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.set({ 'cv_master_key': obfuscated }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } else {
        // Fallback to localStorage (less secure)
        localStorage.setItem('cv_master_key', obfuscated);
      }
    } catch (error) {
      console.error('Error storing master key:', error);
    }
  }

  // Retrieve stored master key
  async getStoredMasterKey() {
    try {
      const extensionId = chrome.runtime?.id || 'fallback_id';
      
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve, reject) => {
          chrome.storage.local.get(['cv_master_key'], (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              const obfuscated = result.cv_master_key;
              if (obfuscated) {
                try {
                  const decoded = atob(obfuscated);
                  resolve(this.xorString(decoded, extensionId, false));
                } catch (e) {
                  console.error('Error decoding stored master key:', e);
                  resolve(null);
                }
              } else {
                resolve(null);
              }
            }
          });
        });
      } else {
        // Fallback to localStorage
        const obfuscated = localStorage.getItem('cv_master_key');
        if (obfuscated) {
          try {
            const decoded = atob(obfuscated);
            return this.xorString(decoded, extensionId, false);
          } catch (e) {
            console.error('Error decoding stored master key from localStorage:', e);
            return null;
          }
        }
        return null;
      }
    } catch (error) {
      console.error('Error retrieving master key:', error);
      return null;
    }
  }

  // Simple XOR function for basic obfuscation - fixed to be symmetric
  xorString(str, key, encode = true) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    
    // Always encode the result when storing, decode when retrieving
    return encode ? btoa(result) : result;
  }

  // Encrypt sensitive data using SJCL with unique salt
  async encryptData(data, customKey = null) {
    // Wait for master key initialization
    await this.readyPromise;
    
    if (!this.isReady && !customKey) {
      throw new Error('SecureStorage not ready and no custom key provided');
    }
    
    try {
      if (typeof data === 'object') {
        data = JSON.stringify(data);
      }
      
      // Use SJCL for encryption if available
      if (typeof sjcl !== 'undefined') {
        const key = customKey || this.masterKey;
        if (!key) {
          throw new Error('No encryption key available');
        }
        
        // Simplified SJCL usage - let SJCL handle salt generation internally
        const encrypted = sjcl.encrypt(key, data, {
          iter: 10000,
          ks: 256,
          mode: 'gcm' // Use GCM mode for authenticated encryption
        });
        
        // Return encrypted data with version for backward compatibility
        return JSON.stringify({
          version: '3.0', // New version for simplified format
          data: encrypted
        });
      }
      
      // Fallback to base64 encoding (not secure, just for preview)
      console.warn('SJCL not available, using insecure base64 fallback');
      return btoa(data);
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  // Decrypt sensitive data with proper format handling
  async decryptData(encryptedData, customKey = null) {
    // Wait for master key initialization
    await this.readyPromise;
    
    if (!this.isReady && !customKey) {
      throw new Error('SecureStorage not ready and no custom key provided');
    }
    
    try {
      if (!encryptedData) return null;
      
      // Use SJCL for decryption if available
      if (typeof sjcl !== 'undefined') {
        const key = customKey || this.masterKey;
        if (!key) {
          throw new Error('No decryption key available');
        }
        
        // Check if this is new simplified format (v3.0)
        try {
          const parsedData = JSON.parse(encryptedData);
          if (parsedData.version === '3.0' && parsedData.data) {
            // New simplified format
            const decrypted = sjcl.decrypt(key, parsedData.data);
            
            try {
              return JSON.parse(decrypted);
            } catch {
              return decrypted; // Return as string if not JSON
            }
          } else if (parsedData.version === '2.0' && parsedData.salt && parsedData.data) {
            // Legacy format with manual salt handling
            const derivedKey = sjcl.misc.pbkdf2(key, parsedData.salt, 10000, 256);
            const decrypted = sjcl.decrypt(derivedKey, parsedData.data);
            
            try {
              return JSON.parse(decrypted);
            } catch {
              return decrypted;
            }
          }
        } catch (parseError) {
          // Not JSON or not recognized format, try direct decryption
        }
        
        // Try direct decryption (legacy format)
        try {
          const decrypted = sjcl.decrypt(key, encryptedData);
          try {
            return JSON.parse(decrypted);
          } catch {
            return decrypted;
          }
        } catch (directError) {
          // Try with old hardcoded key for very old data
          try {
            const decrypted = sjcl.decrypt('CookieVault2025SecureStorage', encryptedData);
            try {
              return JSON.parse(decrypted);
            } catch {
              return decrypted;
            }
          } catch (legacyError) {
            console.error('Failed to decrypt with all methods:', legacyError);
            throw new Error('Unable to decrypt data');
          }
        }
      }
      
      // Fallback from base64 encoding
      const decoded = atob(encryptedData);
      try {
        return JSON.parse(decoded);
      } catch {
        return decoded;
      }
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }

  // Store data securely
  async set(key, value, encrypt = false) {
    try {
      // Check if chrome.storage is available
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        const dataToStore = encrypt ? await this.encryptData(value) : value;
        
        return new Promise((resolve, reject) => {
          chrome.storage.sync.set({ [key]: dataToStore }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } else {
        // Fallback to localStorage for preview mode
        console.warn('Chrome storage not available - using localStorage fallback');
        const dataToStore = encrypt ? await this.encryptData(value) : value;
        localStorage.setItem(key, typeof dataToStore === 'object' ? 
          JSON.stringify(dataToStore) : dataToStore);
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Storage set error:', error);
      throw error;
    }
  }

  // Retrieve data securely
  async get(key, decrypt = false) {
    try {
      // Check if chrome.storage is available
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise(async (resolve, reject) => {
          chrome.storage.sync.get([key], async (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              const value = result[key];
              if (decrypt && value) {
                try {
                  const decrypted = await this.decryptData(value);
                  resolve(decrypted);
                } catch (error) {
                  console.error('Error decrypting data:', error);
                  reject(error);
                }
              } else {
                resolve(value);
              }
            }
          });
        });
      } else {
        // Fallback to localStorage for preview mode
        const value = localStorage.getItem(key);
        if (!value) return null;
        
        if (decrypt) {
          // For decryption, always pass the original string value to decryptData
          return await this.decryptData(value);
        } else {
          // For non-encrypted data, try to parse JSON if possible
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
      }
    } catch (error) {
      console.error('Storage get error:', error);
      throw error;
    }
  }

  // Remove data
  async remove(key) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        return new Promise((resolve, reject) => {
          chrome.storage.sync.remove(key, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
      } else {
        localStorage.removeItem(key);
        return Promise.resolve();
      }
    } catch (error) {
      console.error('Storage remove error:', error);
      throw error;
    }
  }

  // Ensure SecureStorage is ready for use
  async ensureReady() {
    await this.readyPromise;
    if (!this.isReady) {
      throw new Error('SecureStorage initialization failed');
    }
  }

  // Migrate data from localStorage to chrome.storage.sync
  async migrateFromLocalStorage() {
    try {
      // Ensure we're ready before migration
      await this.ensureReady();
      
      const migrationMap = {
        // Non-sensitive data - migrate as-is
        'autoBackupSchedule': { encrypt: false },
        'selectedDashboardTab': { encrypt: false },
        'selectedMainTab': { encrypt: false },
        'selectedBackupTab': { encrypt: false },
        'theme': { encrypt: false },
        'autoLockEnabled': { encrypt: false },
        'backupHistory': { encrypt: false },
        'savedProfileName': { encrypt: false },
        'masterAutoBackupEnabled': { encrypt: false },
        
        // Sensitive data - encrypt before storing
        'telegramBotToken': { encrypt: true },
        'autoTelegramBackup': { encrypt: false },
        
        // Trial/subscription data - encrypt for security
        'trialStartDate': { encrypt: true },
        'subscriptionStatus': { encrypt: true }
      };

      console.log('Starting secure data migration...');
      
      for (const [key, config] of Object.entries(migrationMap)) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          try {
            // Parse JSON values if needed
            let dataToMigrate = value;
            try {
              dataToMigrate = JSON.parse(value);
            } catch {
              // Keep as string if not JSON
            }
            
            // Store in secure storage
            await this.set(key, dataToMigrate, config.encrypt);
            
            // Remove from localStorage after successful migration
            localStorage.removeItem(key);
            
            console.log(`Migrated ${key} (encrypted: ${config.encrypt})`);
          } catch (error) {
            console.error(`Failed to migrate ${key}:`, error);
          }
        }
      }
      
      console.log('Data migration completed');
      return true;
    } catch (error) {
      console.error('Migration failed:', error);
      return false;
    }
  }

  // Validate Telegram bot token format
  validateBotToken(token) {
    // Telegram bot token format: numeric_id:alphanumeric_hash
    const tokenRegex = /^\d+:[A-Za-z0-9_-]{35}$/;
    return tokenRegex.test(token);
  }

  // Validate Telegram chat ID format
  validateChatId(chatId) {
    // Chat ID can be positive (user) or negative (group/channel)
    const chatIdRegex = /^-?\d+$/;
    return chatIdRegex.test(chatId);
  }

  // Validate profile name
  validateProfileName(name) {
    // Allow alphanumeric, spaces, hyphens, underscores, 1-30 chars
    const nameRegex = /^[a-zA-Z0-9\s\-_]{1,30}$/;
    return nameRegex.test(name);
  }

  // Validate password strength
  validatePassword(password) {
    // Minimum 4 characters for encryption password
    return password && password.length >= 4;
  }

  // Sanitize input to prevent XSS
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    // Remove potential XSS vectors
    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim()
      .slice(0, 100); // Limit length
  }

  // Store Telegram credentials securely
  async storeTelegramCredentials(botToken, chatId) {
    // Validate inputs
    if (!this.validateBotToken(botToken)) {
      throw new Error('Invalid bot token format');
    }
    if (!this.validateChatId(chatId)) {
      throw new Error('Invalid chat ID format');
    }

    // Store encrypted credentials
    const credentials = {
      botToken: botToken,
      chatId: chatId,
      storedAt: new Date().toISOString()
    };

    await this.set('telegramCredentials', credentials, true);
    return true;
  }

  // Retrieve Telegram credentials
  async getTelegramCredentials() {
    try {
      const credentials = await this.get('telegramCredentials', true);
      if (credentials && credentials.botToken && credentials.chatId) {
        // Re-validate after decryption
        if (this.validateBotToken(credentials.botToken) && 
            this.validateChatId(credentials.chatId)) {
          return credentials;
        }
      }
      return null;
    } catch (error) {
      console.error('Error retrieving Telegram credentials:', error);
      return null;
    }
  }

  // Check trial status securely
  async getTrialStatus() {
    try {
      const trialStartDate = await this.get('trialStartDate', true);
      const subscriptionStatus = await this.get('subscriptionStatus', true);
      
      if (subscriptionStatus === 'premium') {
        return { status: 'premium', daysLeft: null };
      }
      
      if (trialStartDate) {
        const start = new Date(trialStartDate);
        const now = new Date();
        const daysDiff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.max(0, 7 - daysDiff);
        
        return {
          status: daysLeft > 0 ? 'trial' : 'expired',
          daysLeft: daysLeft
        };
      }
      
      // No trial started yet - initialize it
      await this.set('trialStartDate', new Date().toISOString(), true);
      await this.set('subscriptionStatus', 'trial', true);
      
      return { status: 'trial', daysLeft: 7 };
    } catch (error) {
      console.error('Error checking trial status:', error);
      return { status: 'trial', daysLeft: 7 }; // Default to trial
    }
  }

  // Clear all sensitive data (for security/logout)
  async clearSensitiveData() {
    const sensitiveKeys = [
      'telegramCredentials',
      'telegramBotToken',
      'trialStartDate',
      'subscriptionStatus'
    ];

    for (const key of sensitiveKeys) {
      await this.remove(key);
    }
    
    console.log('Sensitive data cleared');
  }
}

// Create global instance with proper error handling
window.secureStorage = new SecureStorage();

// Ensure the global instance is ready before use
window.secureStorage.ready = window.secureStorage.readyPromise;

// Auto-migrate on load if needed
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Ensure SecureStorage is ready before migration
    await window.secureStorage.ensureReady();
    
    // Check if migration is needed
    const migrationDone = await window.secureStorage.get('migrationCompleted');
    
    if (!migrationDone) {
      console.log('Performing one-time secure storage migration...');
      const success = await window.secureStorage.migrateFromLocalStorage();
      
      if (success) {
        await window.secureStorage.set('migrationCompleted', true);
        console.log('Migration completed successfully');
      }
    }
  } catch (error) {
    console.error('Error during SecureStorage initialization or migration:', error);
    // Continue with degraded functionality - the application should still work
    // with localStorage fallbacks where available
  }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SecureStorage;
}