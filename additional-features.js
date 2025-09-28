// Additional Features for Cookie Backup Extension

// ===== GLOBAL ERROR BOUNDARIES FOR ADDITIONAL FEATURES =====

// Additional features error tracking
window.additionalFeaturesErrors = [];
const MAX_FEATURE_ERROR_REPORTS = 25;

// Enhanced error reporting for additional features
function reportFeatureError(context, error, severity = 'error') {
  const errorReport = {
    timestamp: Date.now(),
    context: context,
    message: error.message || String(error),
    stack: error.stack || 'No stack available',
    severity: severity,
    module: 'additional-features'
  };
  
  // Store error report (with size limit)
  window.additionalFeaturesErrors.push(errorReport);
  if (window.additionalFeaturesErrors.length > MAX_FEATURE_ERROR_REPORTS) {
    window.additionalFeaturesErrors = window.additionalFeaturesErrors.slice(-MAX_FEATURE_ERROR_REPORTS);
  }
  
  // Log based on severity
  if (severity === 'critical') {
    console.error(`[FEATURES-CRITICAL] ${context}:`, error);
  } else if (severity === 'error') {
    console.error(`[FEATURES-ERROR] ${context}:`, error);
  } else {
    console.warn(`[FEATURES-WARN] ${context}:`, error);
  }
  
  // Use main error reporting system if available
  if (typeof reportError === 'function') {
    reportError(`additional_features_${context}`, error, severity);
  }
  
  // Show user feedback for critical feature errors
  if (severity === 'critical') {
    showFeatureErrorToUser(context, error);
  }
}

// Show feature-specific errors to user
function showFeatureErrorToUser(context, error) {
  try {
    // Try to use existing message system
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      const warningMessage = createWarning(
        `Feature error (${context}): Some functionality may not work correctly. Please try again.`
      );
      addToWarningMessageList(warningMessage);
    } else if (typeof showCriticalErrorToUser === 'function') {
      // Use main error system if available
      showCriticalErrorToUser(context, error);
    } else {
      console.error('No user error display system available for feature error:', context, error);
    }
  } catch (displayError) {
    console.error('Failed to display feature error to user:', displayError);
  }
}

// Safe feature operation wrapper
function safeFeatureOperation(fn, context = 'feature_operation') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      reportFeatureError(context, error, 'error');
      throw error; // Re-throw for specific handling
    }
  };
}

// Safe Telegram operation wrapper
function safeTelegramOperation(fn, context = 'telegram_operation') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      reportFeatureError(context, error, 'error');
      throw error; // Re-throw for retry logic
    }
  };
}

// Safe backup operation wrapper  
function safeBackupOperation(fn, context = 'backup_operation') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      reportFeatureError(context, error, 'error');
      
      // For backup operations, try to continue with fallback
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('lastBackupError', JSON.stringify({
            timestamp: Date.now(),
            context: context,
            error: error.message
          }));
        } catch (storageError) {
          console.warn('Failed to store backup error:', storageError);
        }
      }
      
      throw error;
    }
  };
}

// Module-level error handling setup
if (typeof window !== 'undefined') {
  // Add feature-specific error listener
  window.addEventListener('error', (event) => {
    if (event.filename && event.filename.includes('additional-features')) {
      reportFeatureError('module_error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        stack: event.error?.stack
      }, 'critical');
    }
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    // Check if rejection is from additional features context
    if (event.reason?.stack && event.reason.stack.includes('additional-features')) {
      reportFeatureError('module_unhandled_rejection', {
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack
      }, 'critical');
    }
  });
}

// Telegram Retry Mechanism with Exponential Backoff
class TelegramUploader {
    constructor(botToken, chatId) {
        this.botToken = botToken;
        this.chatId = chatId;
        this.maxRetries = 3;
        this.baseDelay = 1000; // 1 second
    }
    
    async sendWithRetry(data, filename) {
        return await safeTelegramOperation(async () => {
            let lastError;
            
            for (let attempt = 0; attempt < this.maxRetries; attempt++) {
                try {
                    // Show retry status
                    if (attempt > 0) {
                        addToWarningMessageList(createWarning(`Retry attempt ${attempt + 1}/${this.maxRetries}...`));
                    }
                    
                    const result = await this.sendToTelegram(data, filename);
                    
                    if (result.ok) {
                        addToSuccessMessageList(createSuccessAlert('✅ Backup sent to Telegram successfully!'));
                        return result;
                    }
                    
                    throw new Error(result.description || 'Unknown error');
                    
                } catch (error) {
                    lastError = error;
                    // Telegram upload attempt failed
                    
                    if (attempt < this.maxRetries - 1) {
                        // Calculate exponential backoff delay
                        const delay = this.baseDelay * Math.pow(2, attempt);
                        
                        addToWarningMessageList(createWarning(`Upload failed. Retrying in ${delay / 1000} seconds...`));
                        
                        await this.sleep(delay);
                    }
                }
            }
            
            // All retries failed
            addToWarningMessageList(createWarning(`❌ Failed to send to Telegram after ${this.maxRetries} attempts: ${lastError.message}`));
            throw lastError;
        }, 'telegram_send_with_retry')();
    }
    
    async sendToTelegram(data, filename) {
        return await safeTelegramOperation(async () => {
            const telegramApiUrl = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
            
            // Create form data
            const formData = new FormData();
            const blob = new Blob([data], { type: 'application/json' });
            formData.append('document', blob, filename);
            formData.append('chat_id', this.chatId);
            formData.append('caption', `Cookie Backup: ${filename}\n📅 ${new Date().toLocaleString()}\n🔒 Encrypted backup file`);
            
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                body: formData
            });
            
            return await response.json();
        }, 'telegram_send_document')();
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


// Enhanced automatic backup with retry and proper synchronization
let backupInProgress = false; // Prevent concurrent backups

async function performAutoBackupWithRetry() {
    // Prevent race conditions with concurrent backup requests
    if (backupInProgress) {
        console.log('Backup already in progress, skipping duplicate request');
        return;
    }

    backupInProgress = true;
    
    try {
        if (typeof chrome === 'undefined' || !chrome.cookies) {
            throw new Error('Chrome cookies API not available');
        }

        console.log('Starting enhanced automatic backup with retry...');

        // Convert callback-based API to Promise to prevent race conditions
        const cookies = await new Promise((resolve, reject) => {
            chrome.cookies.getAll({}, (result) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(`Failed to get cookies: ${chrome.runtime.lastError.message}`));
                } else {
                    resolve(result);
                }
            });
        });

        if (!cookies || cookies.length === 0) {
            console.log('No cookies found for enhanced backup');
            return;
        }

        console.log(`Found ${cookies.length} cookies for enhanced backup`);

        // Generate timestamp and filename
        const d = new Date();
        const date = d.toLocaleDateString("en-GB").replace(/\//g, "-");
        const time = d.toLocaleTimeString("en-GB").replace(/:/g, "-");
        const filename = `auto-backup-${date}-${time}.json`;
        
        const data = JSON.stringify(cookies, null, 2);

        // Safely check backup settings with error handling
        let autoTelegram = false;
        let credentials = null;
        
        try {
            autoTelegram = localStorage.getItem('autoTelegramBackup') === 'true';
            if (autoTelegram) {
                const credentialsString = localStorage.getItem('telegramBotToken') || '{}';
                credentials = JSON.parse(credentialsString);
            }
        } catch (settingsError) {
            console.warn('Failed to read backup settings:', settingsError.message);
            autoTelegram = false;
        }

        // Use Promise.allSettled for parallel operations that can fail independently
        const backupOperations = [];

        // Add Telegram backup operation if enabled
        if (autoTelegram && credentials?.botToken && credentials?.chatId) {
            const telegramBackup = async () => {
                try {
                    const uploader = new TelegramUploader(credentials.botToken, credentials.chatId);
                    await uploader.sendWithRetry(data, filename);
                    
                    console.log('Telegram backup completed successfully');
                    return {
                        type: 'telegram',
                        success: true,
                        result: { filename, cookieCount: cookies.length }
                    };
                } catch (error) {
                    console.error('Telegram backup failed:', error.message);
                    return {
                        type: 'telegram',
                        success: false,
                        error: error.message
                    };
                }
            };
            backupOperations.push(telegramBackup());
        }

        // Add local backup operation
        const localBackup = async () => {
            try {
                // Use downloadJson function if available, with fallback
                if (typeof downloadJson === 'function') {
                    downloadJson(data, filename);
                } else {
                    // Fallback local download implementation
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                }
                
                console.log('Local backup completed successfully');
                return {
                    type: 'local',
                    success: true,
                    result: { filename, cookieCount: cookies.length }
                };
            } catch (error) {
                console.error('Local backup failed:', error.message);
                return {
                    type: 'local',
                    success: false,
                    error: error.message
                };
            }
        };
        backupOperations.push(localBackup());

        // Execute all backup operations in parallel with proper error handling
        const results = await Promise.allSettled(backupOperations);
        
        // Process results and update history
        let successfulBackups = 0;
        const backupResults = [];

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                successfulBackups++;
                backupResults.push(result.value);
            } else if (result.status === 'fulfilled' && !result.value.success) {
                console.error(`${result.value.type} backup failed:`, result.value.error);
            } else if (result.status === 'rejected') {
                console.error('Backup operation failed:', result.reason);
            }
        }

        // Update backup history and status with all successful operations
        try {
            if (window.enhancedFeatures && backupResults.length > 0) {
                // Add history entries for each successful backup
                for (const backup of backupResults) {
                    if (backup.success) {
                        await window.enhancedFeatures.addToBackupHistory({
                            type: `auto-${backup.type}`,
                            cookieCount: backup.result.cookieCount,
                            size: data.length,
                            filename: backup.result.filename,
                            encrypted: false,
                            timestamp: Date.now()
                        });
                    }
                }
                
                // Update status dashboard
                await window.enhancedFeatures.updateStatusDashboard();
            }
        } catch (historyError) {
            console.warn('Failed to update backup history:', historyError.message);
            // Don't fail the entire backup for history update errors
        }

        if (successfulBackups > 0) {
            console.log(`Enhanced backup completed: ${successfulBackups} successful operations`);
        } else {
            console.error('All backup operations failed');
        }

    } catch (error) {
        console.error('Critical error in enhanced automatic backup:', error.message);
        
        // Report error using existing error reporting if available
        if (typeof reportBackupError === 'function') {
            reportBackupError('enhanced_auto', error.message);
        }
    } finally {
        // Always reset the backup flag
        backupInProgress = false;
    }
}

// Initialize additional features when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Note: performBackup is in the service worker (background.js), not accessible here
    // Retry mechanism should be implemented via chrome.runtime.sendMessage if needed
});

// Export functions for use in other scripts
window.additionalFeatures = {
    TelegramUploader,
    performAutoBackupWithRetry
};