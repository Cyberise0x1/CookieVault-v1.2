// ===== GLOBAL ERROR BOUNDARIES FOR SERVICE WORKER =====

// Service worker error tracking
let serviceWorkerErrors = [];
const MAX_ERROR_REPORTS = 30; // Smaller limit for service worker

// Enhanced service worker error reporting
function reportServiceWorkerError(context, error, severity = 'error') {
  const errorReport = {
    timestamp: Date.now(),
    context: context,
    message: error.message || String(error),
    stack: error.stack || 'No stack available',
    severity: severity,
    serviceWorker: true
  };
  
  // Store error report (with size limit)
  serviceWorkerErrors.push(errorReport);
  if (serviceWorkerErrors.length > MAX_ERROR_REPORTS) {
    serviceWorkerErrors = serviceWorkerErrors.slice(-MAX_ERROR_REPORTS);
  }
  
  // Log based on severity
  if (severity === 'critical') {
    console.error(`[SW-CRITICAL] ${context}:`, error);
  } else if (severity === 'error') {
    console.error(`[SW-ERROR] ${context}:`, error);
  } else {
    console.warn(`[SW-WARN] ${context}:`, error);
  }
  
  // Notify connected popup/content scripts about critical errors
  if (severity === 'critical') {
    try {
      chrome.runtime.sendMessage({
        type: 'error_report',
        error: errorReport,
        severity: severity
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Failed to notify popup about critical error:', chrome.runtime.lastError.message);
        }
      });
    } catch (msgError) {
      console.error('Failed to send error message:', msgError);
    }
  }
}

// Global service worker error handler
self.addEventListener('error', (event) => {
  reportServiceWorkerError('service_worker_error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  }, 'critical');
});

// Global unhandled promise rejection handler for service worker
self.addEventListener('unhandledrejection', (event) => {
  reportServiceWorkerError('service_worker_unhandled_rejection', {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack
  }, 'critical');
  
  // Prevent unhandled rejection from terminating service worker
  event.preventDefault();
});

// Safe async wrapper for service worker operations
function safeServiceWorkerAsync(fn, context = 'sw_anonymous') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      reportServiceWorkerError(`safe_sw_async_${context}`, error, 'error');
      throw error; // Re-throw so caller can handle if needed
    }
  };
}

// Safe Chrome API wrapper with automatic error handling
function safeChromeAPI(apiCall, context = 'chrome_api') {
  return new Promise((resolve, reject) => {
    try {
      apiCall((result) => {
        if (chrome.runtime.lastError) {
          const error = new Error(`Chrome API error in ${context}: ${chrome.runtime.lastError.message}`);
          reportServiceWorkerError(context, error, 'error');
          reject(error);
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reportServiceWorkerError(context, error, 'error');
      reject(error);
    }
  });
}

// --- TRIAL MANAGEMENT CONSTANTS ---
const TRIAL_START_DATE_KEY = "trialStartDate";
const TRIAL_DURATION_DAYS = 7;
const SUBSCRIPTION_STATUS_KEY = "subscriptionStatus";

// --- FIRST-TIME INSTALLATION DETECTION ---
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // First time installation - initialize trial
    const trialStartDate = new Date().toISOString();
    chrome.storage.local.set({
      [TRIAL_START_DATE_KEY]: trialStartDate,
      [SUBSCRIPTION_STATUS_KEY]: 'trial'
    }, () => {
      console.log('Extension installed - Trial period started:', trialStartDate);
    });
  } else if (details.reason === 'update') {
    // Extension updated - check if trial exists
    chrome.storage.local.get([TRIAL_START_DATE_KEY], (result) => {
      if (!result[TRIAL_START_DATE_KEY]) {
        // No trial start date found, this is likely an existing user before trial system
        // Give them a fresh trial period
        const trialStartDate = new Date().toISOString();
        chrome.storage.local.set({
          [TRIAL_START_DATE_KEY]: trialStartDate,
          [SUBSCRIPTION_STATUS_KEY]: 'trial'
        }, () => {
          console.log('Extension updated - Trial period initialized:', trialStartDate);
        });
      }
    });
  }
});

// --- LISTENER FOR SCHEDULED AUTOMATIC BACKUPS ---

// Listen for when the alarm goes off
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cookieAutoBackup") {
    // Performing automatic cookie backup
    performBackup();
  }
});



async function performBackup() {
  try {
    console.log('Starting automatic cookie backup...');
    
    // Get all cookies with proper error handling
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
      console.log('No cookies found for automatic backup');
      return;
    }

    console.log(`Found ${cookies.length} cookies for backup`);
    const data = JSON.stringify(cookies, null, 2);
    
    // Get profile name from storage with error handling
    const settings = await new Promise((resolve, reject) => {
      chrome.storage.local.get(['savedProfileName'], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get profile name: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(result);
        }
      });
    });

    const profileName = settings.savedProfileName || '';
    
    // Create a timestamped filename for the unencrypted backup
    const d = new Date();
    const date = d.toLocaleDateString("en-GB").replace(/\//g, "-");
    const time = d.toLocaleTimeString("en-GB").replace(/:/g, "-");
    
    // Include profile name in filename if provided
    const filename = profileName 
      ? `cookies-auto-${profileName}-${date}-${time}.json`
      : `cookies-auto-backup-${date}-${time}.json`;

    try {
      // Use data URL instead of URL.createObjectURL (not available in service workers)
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(data);

      // Download local backup with proper error handling
      const downloadId = await new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: dataUrl,
          filename: filename
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            reject(new Error(`Download failed: ${chrome.runtime.lastError.message}`));
          } else {
            resolve(downloadId);
          }
        });
      });

      if (downloadId) {
        console.log(`Local backup saved successfully: ${filename}`);
        
        // Update auto backup history in storage
        try {
          await new Promise((resolve, reject) => {
            chrome.storage.local.set({
              lastAutoBackup: {
                timestamp: Date.now(),
                cookieCount: cookies.length,
                filename: filename,
                status: 'success'
              }
            }, () => {
              if (chrome.runtime.lastError) {
                reject(new Error(`Failed to update backup history: ${chrome.runtime.lastError.message}`));
              } else {
                resolve();
              }
            });
          });
        } catch (historyError) {
          console.error('Warning: Failed to update backup history:', historyError.message);
          // Don't fail the entire backup for history update errors
        }
      }
    } catch (downloadError) {
      console.error('Local backup failed:', downloadError.message);
      
      // Report error but continue with Telegram backup attempt
      reportBackupError('local_download', downloadError.message);
    }
    
    // Also try to send to Telegram if enabled and credentials are available
    try {
      await sendAutomaticBackupToTelegram(data, filename, cookies.length);
    } catch (telegramError) {
      console.error('Telegram backup failed:', telegramError.message);
      reportBackupError('telegram', telegramError.message);
    }

    console.log('Automatic backup process completed');

  } catch (error) {
    console.error('Critical error in automatic backup:', error.message);
    reportBackupError('critical', error.message);
    
    // Try to update backup history with error status
    try {
      await new Promise((resolve) => {
        chrome.storage.local.set({
          lastAutoBackup: {
            timestamp: Date.now(),
            status: 'error',
            error: error.message
          }
        }, () => resolve());
      });
    } catch (e) {
      // Silent fail for history update during error handling
    }
  }
}

/**
 * Report backup errors for monitoring and user feedback
 */
function reportBackupError(type, message) {
  console.error(`Backup error [${type}]:`, message);
  
  // Send message to popup if it's open for user feedback
  try {
    chrome.runtime.sendMessage({
      type: 'backup_error',
      errorType: type,
      message: message,
      timestamp: Date.now()
    }, (response) => {
      // Check if there was an error, but ignore it silently
      // as popup might not be open
      if (chrome.runtime.lastError) {
        // Silently ignore - popup not available
      }
    });
  } catch (e) {
    // Silent fail - popup might not be open
  }
}

// Send automatic backup to Telegram if enabled and credentials are available
async function sendAutomaticBackupToTelegram(cookieData, filename, cookieCount) {
  try {
    // Check if user has enabled automatic Telegram backups
    const settingsResult = await new Promise((resolve, reject) => {
      chrome.storage.local.get(["autoTelegramBackup"], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get auto backup setting: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(result);
        }
      });
    });
    const autoTelegramEnabled = settingsResult.autoTelegramBackup;
    
    if (!autoTelegramEnabled) {
      // Automatic Telegram backup is disabled by user
      return;
    }
    
    // Check if Telegram credentials are stored
    const result = await new Promise((resolve, reject) => {
      chrome.storage.local.get(["telegramBotToken"], (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Failed to get Telegram credentials: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(result);
        }
      });
    });
    const credentials = result.telegramBotToken;
    
    if (credentials && credentials.botToken && credentials.chatId) {
      // Sending automatic backup to Telegram
      
      // Send to Telegram with retry logic
      await sendToTelegramWithRetry(cookieData, credentials.botToken, credentials.chatId, filename);
      // Automatic Telegram backup sent successfully
      
      // Update Telegram backup history in storage
      try {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({
            lastTelegramBackup: {
              timestamp: Date.now(),
              cookieCount: cookieCount,
              filename: filename
            }
          }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(`Failed to update Telegram backup history: ${chrome.runtime.lastError.message}`));
            } else {
              resolve();
            }
          });
        });
      } catch (historyError) {
        console.error('Warning: Failed to update Telegram backup history:', historyError.message);
        // Don't fail the entire backup for history update errors
      }
    } else {
      // No Telegram credentials found for automatic backup
    }
  } catch (error) {
    // Log error for debugging but don't show user-facing errors for automatic backups
    console.error('Error sending automatic backup to Telegram:', error);
  }
}

// --- LISTENER AND FUNCTIONS FOR TELEGRAM BACKUP ---

// Listen for messages from popup.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "backupToTelegram") {
        // Received request to backup cookies to Telegram
        // We make this an async operation to handle the fetch API call
        (async () => {
            try {
                await sendToTelegram(request.data, request.botToken, request.chatId, request.filename);
                sendResponse({ status: "success", message: "Backup sent to Telegram successfully!" });
            } catch (error) {
                sendResponse({ status: "error", message: error.message });
            }
        })();
        // Return true to indicate you wish to send a response asynchronously
        return true;
    } else if (request.action === "sendTestMessage") {
        // Received request to send test message to Telegram
        // Handle test message sending
        (async () => {
            try {
                await sendTestMessageToTelegram(request.message, request.botToken, request.chatId);
                sendResponse({ status: "success", message: "Test message sent successfully!" });
            } catch (error) {
                sendResponse({ status: "error", message: error.message });
            }
        })();
        // Return true to indicate you wish to send a response asynchronously
        return true;
    }
});

/**
 * Sends cookie data to Telegram with retry logic and exponential backoff
 * @param {string} cookieData - The JSON string of the cookies.
 * @param {string} botToken - The Telegram bot token.
 * @param {string} chatId - The Telegram chat ID to send the message to.
 * @param {string} customFilename - Optional custom filename (for automatic backups).
 */
async function sendToTelegramWithRetry(cookieData, botToken, chatId, customFilename = null) {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Telegram upload attempt ${attempt + 1}/${maxRetries}`);
      
      const result = await sendToTelegram(cookieData, botToken, chatId, customFilename);
      
      console.log(`Successfully sent backup to Telegram on attempt ${attempt + 1}`);
      return result;
      
    } catch (error) {
      lastError = error;
      console.error(`Telegram upload attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries - 1) {
        // Calculate exponential backoff delay
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay / 1000} seconds...`);
        
        // Sleep with Promise for service worker context
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries failed
  const finalError = new Error(`Failed to send to Telegram after ${maxRetries} attempts: ${lastError.message}`);
  reportServiceWorkerError('telegram_retry_failed', finalError, 'error');
  throw finalError;
}

/**
 * Sends the cookie data as a file to the Telegram Bot API.
 * @param {string} cookieData - The JSON string of the cookies.
 * @param {string} botToken - The Telegram bot token.
 * @param {string} chatId - The Telegram chat ID to send the message to.
 * @param {string} customFilename - Optional custom filename (for automatic backups).
 */
async function sendToTelegram(cookieData, botToken, chatId, customFilename = null) {
    // Input validation
    if (!cookieData || !botToken || !chatId) {
        throw new Error('Missing required parameters for Telegram backup');
    }

    if (typeof cookieData !== 'string') {
        throw new Error('Cookie data must be a string');
    }

    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendDocument`;

    // Use custom filename if provided, otherwise create a timestamped one
    let filename;
    if (customFilename) {
        filename = customFilename;
    } else {
        const d = new Date();
        const date = d.toLocaleDateString("en-GB").replace(/\//g, "-");
        const time = d.toLocaleTimeString("en-GB").replace(/:/g, "-");
        filename = `cookies-telegram-backup-${date}-${time}.json`;
    }
    
    try {
        // Convert the cookie data string into a Blob to send as a file
        const blob = new Blob([cookieData], { type: 'application/json' });
        
        // Use FormData to structure the multipart/form-data request
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('document', blob, filename);
        formData.append('caption', `Here is your cookie backup from ${new Date().toLocaleString()}.`);

        // Add timeout and better error handling for network requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
            const response = await fetch(telegramApiUrl, {
                method: 'POST',
                body: formData,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Check if response is ok
            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Invalid bot token - please check your Telegram bot configuration');
                } else if (response.status === 400) {
                    throw new Error('Invalid chat ID or message format - please verify your Telegram settings');
                } else if (response.status === 429) {
                    throw new Error('Too many requests - please wait before sending another backup');
                } else if (response.status >= 500) {
                    throw new Error('Telegram server error - please try again later');
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }

            // Parse response
            let result;
            try {
                result = await response.json();
            } catch (parseError) {
                throw new Error('Invalid response from Telegram API - please try again');
            }

            if (!result.ok) {
                // If Telegram API returns an error, throw a descriptive exception
                const errorMessage = result.description || 'Unknown Telegram API error';
                if (errorMessage.includes('bot was blocked')) {
                    throw new Error('Bot was blocked by the user - please unblock the bot in Telegram');
                } else if (errorMessage.includes('chat not found')) {
                    throw new Error('Chat not found - please verify your chat ID');
                } else if (errorMessage.includes('bot token')) {
                    throw new Error('Invalid bot token - please check your Telegram bot configuration');
                } else {
                    throw new Error(`Telegram API Error: ${errorMessage}`);
                }
            }

            console.log(`Successfully sent backup to Telegram: ${filename}`);
            return result;

        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                throw new Error('Request timeout - Telegram backup took too long, please check your connection');
            } else if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
                throw new Error('Network error - please check your internet connection and try again');
            } else {
                // Re-throw the error if it's already a descriptive one
                throw fetchError;
            }
        }

    } catch (error) {
        console.error('Error in sendToTelegram:', error.message);
        
        // Add context to generic errors
        if (error.message.includes('Blob') || error.message.includes('FormData')) {
            throw new Error('Failed to prepare backup file for Telegram upload');
        }
        
        // Re-throw the error with original message
        throw error;
    }
}

/**
 * Sends a test message to Telegram to verify bot configuration
 * @param {string} message - The test message to send
 * @param {string} botToken - The Telegram bot token
 * @param {string} chatId - The Telegram chat ID
 */
async function sendTestMessageToTelegram(message, botToken, chatId) {
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            chat_id: chatId,
            text: message
        })
    });

    const result = await response.json();

    if (!result.ok) {
        // If Telegram API returns an error, throw an exception
        throw new Error(`Telegram API Error: ${result.description || 'Unknown error'}`);
    }

    // Successfully sent test message to Telegram
}