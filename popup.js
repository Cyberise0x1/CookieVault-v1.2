// ===== GLOBAL ERROR BOUNDARIES AND FALLBACK MECHANISMS =====

// Global error tracking and reporting
window.errorReports = [];
window.maxErrorReports = 50; // Prevent memory leaks

// Enhanced error reporting function
function reportError(context, error, severity = 'error') {
  const errorReport = {
    timestamp: Date.now(),
    context: context,
    message: error.message || String(error),
    stack: error.stack || 'No stack available',
    severity: severity,
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  // Store error report (with size limit)
  window.errorReports.push(errorReport);
  if (window.errorReports.length > window.maxErrorReports) {
    window.errorReports = window.errorReports.slice(-window.maxErrorReports);
  }
  
  // Log based on severity
  if (severity === 'critical') {
    console.error(`[CRITICAL] ${context}:`, error);
  } else if (severity === 'error') {
    console.error(`[ERROR] ${context}:`, error);
  } else {
    console.warn(`[WARN] ${context}:`, error);
  }
  
  // Show user-friendly error if critical
  if (severity === 'critical') {
    showCriticalErrorToUser(context, error);
  }
}

// Show critical errors to user with fallback UI
function showCriticalErrorToUser(context, error) {
  try {
    const messageContainer = document.getElementById('messages');
    if (messageContainer && typeof createWarning === 'function') {
      const errorAlert = createWarning(
        `Something went wrong (${context}). Please refresh the popup. If the problem persists, check the extension settings.`
      );
      messageContainer.appendChild(errorAlert);
    } else {
      // Fallback: create basic error message
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'background:#ffebee;color:#c62828;padding:10px;margin:5px;border-radius:4px;border:1px solid #ef5350;';
      errorDiv.textContent = `Error: ${context}. Please refresh the popup.`;
      document.body.insertBefore(errorDiv, document.body.firstChild);
    }
  } catch (fallbackError) {
    console.error('Failed to show error to user:', fallbackError);
    // Last resort: browser alert
    if (confirm(`Cookie Vault encountered an error (${context}). Would you like to refresh the popup?`)) {
      window.location.reload();
    }
  }
}

// Global window error handler - catches synchronous errors
window.addEventListener('error', (event) => {
  reportError('window_error', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  }, 'critical');
  
  // Prevent default browser error handling
  event.preventDefault();
});

// Global promise rejection handler - catches async errors
window.addEventListener('unhandledrejection', (event) => {
  reportError('unhandled_promise_rejection', {
    message: event.reason?.message || String(event.reason),
    stack: event.reason?.stack
  }, 'critical');
  
  // Prevent unhandled rejection from appearing in console
  event.preventDefault();
});

// Chrome extension specific error handler
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'error_report') {
      reportError('extension_background', message.error, message.severity || 'error');
    } else if (message.type === 'backup_error') {
      // Handle backup error messages from background script
      const errorMessage = `Backup failed (${message.errorType}): ${message.message}`;
      if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
        addToWarningMessageList(createWarning(errorMessage));
      } else {
        console.error('Backup error:', errorMessage);
      }
    }
  });
}

// Safe async function wrapper with automatic error handling
function safeAsync(fn, context = 'anonymous') {
  return async function(...args) {
    try {
      return await fn.apply(this, args);
    } catch (error) {
      reportError(`safe_async_${context}`, error, 'error');
      throw error; // Re-throw so caller can handle if needed
    }
  };
}

// Safe DOM operation wrapper
function safeDOMOperation(fn, context = 'dom_operation') {
  try {
    return fn();
  } catch (error) {
    reportError(context, error, 'error');
    return null; // Return null for failed DOM operations
  }
}

// Initialize file input variable at module scope for drag/drop
let fileInput;

// ===== PHASE 1: CRITICAL MISSING FUNCTIONS =====

// Check if a feature is available based on trial/premium status
async function isFeatureAvailable(feature) {
  try {
    // Use secure storage to check trial status
    if (window.secureStorage) {
      const trialStatus = await window.secureStorage.getTrialStatus();
      
      // If premium or trial active, all features available
      if (trialStatus.status === 'premium' || trialStatus.status === 'trial') {
        return true;
      }
      
      // After trial, check which features are restricted
      const restrictedFeatures = [
        'telegram_backup',
        'auto_backup_15min',
        'auto_backup_30min', 
        'encryption',
        'cloud_storage'
      ];
      
      return !restrictedFeatures.includes(feature);
    }
    
    // Fallback if secure storage not available
    return true;
  } catch (error) {
    console.error('Error checking feature availability:', error);
    return true; // Default to allowing feature if error
  }
}

// Download JSON data as a file
function downloadJson(data, filename) {
  try {
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      // Use Chrome downloads API
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
        // Clean up the object URL after download
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    } else {
      // Fallback for web preview mode
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Error downloading file:', error);
    alert('Failed to download backup file. Please try again.');
  }
}

// Show backup success alert
function backupSuccessAlert(cookieCount) {
  const message = `✅ Successfully backed up ${cookieCount} cookies!`;
  addToSuccessMessageList(createSuccessAlert(message));
}

// Show restore success alert
function restoreSuccessAlert(cookieCount) {
  const message = `✅ Successfully restored ${cookieCount} cookies!`;
  addToSuccessMessageList(createSuccessAlert(message));
}

// Send backup to Telegram via background script
async function sendBackupToTelegram(data, filename) {
  try {
    // Get Telegram credentials from secure storage
    const credentials = await window.secureStorage.getTelegramCredentials();
    if (!credentials) {
      addToWarningMessageList(createWarning('Telegram credentials not configured'));
      return;
    }
    
    if (!credentials.botToken || !credentials.chatId) {
      addToWarningMessageList(createWarning('Invalid Telegram credentials'));
      return;
    }
    
    const creds = credentials;
    
    // Send message to background script
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        action: 'backupToTelegram',
        data: data,
        filename: filename,
        botToken: creds.botToken,
        chatId: creds.chatId
      }, (response) => {
        if (response && response.status === 'success') {
          addToSuccessMessageList(createSuccessAlert('✅ Backup sent to Telegram!'));
        } else if (response && response.status === 'error') {
          addToWarningMessageList(createWarning(`Telegram error: ${response.message}`));
        }
      });
    } else {
      // Fallback for preview mode
      console.log('Would send to Telegram:', filename);
      addToSuccessMessageList(createSuccessAlert('✅ (Preview) Backup would be sent to Telegram'));
    }
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    addToWarningMessageList(createWarning('Failed to send backup to Telegram'));
  }
}

// Create success alert element
function createSuccessAlert(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success';
  alert.textContent = message;
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (alert.parentNode) {
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 300);
    }
  }, 5000);
  
  return alert;
}

// Create warning element
function createWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'alert alert-warning';
  warning.textContent = message;
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (warning.parentNode) {
      warning.style.opacity = '0';
      setTimeout(() => warning.remove(), 300);
    }
  }, 5000);
  
  return warning;
}

// Add success message to UI
function addToSuccessMessageList(alertElement) {
  const messagesDiv = document.getElementById('messages');
  if (messagesDiv) {
    messagesDiv.appendChild(alertElement);
    // Limit to 3 messages
    while (messagesDiv.children.length > 3) {
      messagesDiv.removeChild(messagesDiv.firstChild);
    }
  }
}

// Add warning message to UI
function addToWarningMessageList(warningElement) {
  const warningsDiv = document.getElementById('warnings');
  if (warningsDiv) {
    warningsDiv.appendChild(warningElement);
    // Limit to 3 warnings
    while (warningsDiv.children.length > 3) {
      warningsDiv.removeChild(warningsDiv.firstChild);
    }
  }
}

// Show expiration warning for cookies
function expirationWarning(cookieName, url) {
  const message = `⚠️ Cookie "${cookieName}" has expired and was skipped`;
  addToWarningMessageList(createWarning(message));
}

// Show unknown error warning
function unknownErrWarning(cookieName, details) {
  const message = `⚠️ Failed to restore "${cookieName}": ${details}`;
  addToWarningMessageList(createWarning(message));
}

// Initialize restore progress bar
function initRestoreProgressBar(totalCookies) {
  const progressDiv = document.getElementById('progress');
  const progressBar = document.getElementById('progressbar');
  
  if (progressDiv && progressBar) {
    progressDiv.classList.remove('hidden');
    progressBar.max = totalCookies;
    progressBar.value = 0;
  }
}

// Update restore progress bar
function updateRestoreProgressBar() {
  const progressBar = document.getElementById('progressbar');
  if (progressBar) {
    progressBar.value = progressBar.value + 1;
    
    // Hide progress bar when complete
    if (progressBar.value >= progressBar.max) {
      setTimeout(() => {
        const progressDiv = document.getElementById('progress');
        if (progressDiv) {
          progressDiv.classList.add('hidden');
        }
      }, 1000);
    }
  }
}

// Show upgrade modal for premium features
function showUpgradeModal() {
  // For now, just show an alert - full modal will be implemented in Phase 4
  alert('This feature requires a premium subscription. Upgrade to unlock all features!');
}

// Hide fallback CKZ button
function hideFallbackCkzButton() {
  const btn = document.getElementById('btn-upload-fallback');
  if (btn) {
    btn.style.display = 'none';
  }
}

// Show decrypt password input box
function showDecPasswordInputBox() {
  const decPasswd = document.getElementById('dec-passwd');
  if (decPasswd) {
    decPasswd.classList.remove('hidden');
  }
}

// Show encrypt password input box  
function showEncPasswordInputBox() {
  const encPasswd = document.getElementById('enc-passwd');
  if (encPasswd) {
    encPasswd.classList.remove('hidden');
  }
}

// Show fallback CKZ input
function showFallbackCkzInput() {
  const restoreTextWrap = document.getElementById('restore-using-text-wrap');
  if (restoreTextWrap) {
    restoreTextWrap.classList.remove('hidden');
  }
  showDecPasswordInputBox();
}

// Get encryption password from input
function getEncPasswd() {
  const input = document.getElementById('inp-enc-passwd');
  return input ? input.value : '';
}

// Get decryption password from input
function getDecPasswd() {
  const input = document.getElementById('inp-dec-passwd');
  return input ? input.value : '';
}

// Get CKZ file data as text
function getCkzFileDataAsText(callback) {
  const textarea = document.getElementById('ckz-textarea');
  
  if (textarea && textarea.value) {
    // Data from textarea
    callback(textarea.value);
  } else if (window.cookieFile || (typeof cookieFile !== 'undefined' && cookieFile)) {
    // Data from file
    const reader = new FileReader();
    reader.onload = function(e) {
      callback(e.target.result);
    };
    const fileToRead = window.cookieFile || cookieFile;
    reader.readAsText(fileToRead);
  } else {
    addToWarningMessageList(createWarning('No backup file selected'));
  }
}

// ===== END OF PHASE 1 CRITICAL FUNCTIONS =====

// Initialize file input and drag/drop when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const restoreInput = document.getElementById("restore");
  const dropZone = document.getElementById('drop-zone');
  fileInput = document.getElementById('restore');

  // Only add event listeners if elements exist
  if (restoreInput) {
    restoreInput.addEventListener("change", handleFileSelect, false);
  }

  if (dropZone && fileInput) {
    // Click to browse functionality
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and drop events
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleDroppedFile(files[0]);
      }
    });
  }
});

function handleDroppedFile(file) {
  // Validate file type
  const allowedTypes = ['.ckz', '.json', '.csv', '.txt', '.xml'];
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
  
  if (!allowedTypes.includes(fileExtension)) {
    alert('Unsupported file type. Please select a .ckz, .json, .csv, .txt, or .xml file.');
    return;
  }
  
  // Create a new FileList-like object for the file input
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  
  handleFileSelect({ target: { files: [file] } });
}


// Initialize form event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  const decPasswdForm = document.getElementById("dec-passwd-form");
  const encPasswdForm = document.getElementById("enc-passwd-form");
  const btnBackup = document.getElementById("btn-backup");
  const btnUploadFallback = document.getElementById("btn-upload-fallback");

  if (decPasswdForm) {
    decPasswdForm.addEventListener("submit", handleDecPasswdSubmit, false);
  }

  if (encPasswdForm) {
    encPasswdForm.addEventListener("submit", handleEncPasswdSubmit, false);
  }

  if (btnBackup) {
    btnBackup.onclick = showEncPasswordInputBox;
  }

  if (btnUploadFallback) {
    btnUploadFallback.onclick = showFallbackCkzInput;
  }
});

// Handle tab switching
document.addEventListener("DOMContentLoaded", async function() {
  try {
    // Dashboard tabs
    const statusTab = document.getElementById("status-tab");
    const historyTab = document.getElementById("history-tab");
    const statusSection = document.getElementById("status-dashboard");
    const historySection = document.getElementById("backup-history-wrap");
    
    // Main tabs (Backup | Restore | Cloud | Settings)
    const backupMainTab = document.getElementById("backup-main-tab");
    const restoreMainTab = document.getElementById("restore-main-tab");
    const cloudMainTab = document.getElementById("cloud-main-tab");
    const settingsMainTab = document.getElementById("settings-main-tab");
    const backupMainSection = document.getElementById("backup-main-section");
    const restoreMainSection = document.getElementById("restore-main-section");
    const cloudMainSection = document.getElementById("cloud-main-section");
    const settingsMainSection = document.getElementById("settings-main-section");
    
    // Backup sub-tabs
    const manualTab = document.getElementById("manual-backup-tab");
    const autoTab = document.getElementById("auto-backup-tab");
    const manualSection = document.getElementById("backup-wrap");
    const autoSection = document.getElementById("auto-backup-wrap");
    
    // Dashboard tab switching with safe async operations
    let lastDashboardTab = 'status'; // Default value
    try {
      lastDashboardTab = await window.secureStorage?.get("selectedDashboardTab") || localStorage.getItem("selectedDashboardTab") || 'status';
    } catch (error) {
      console.warn('Failed to get last dashboard tab:', error.message);
      lastDashboardTab = localStorage.getItem("selectedDashboardTab") || 'status';
    }
  
  if (statusTab && historyTab) {
    statusTab.addEventListener("click", function() {
      statusTab.classList.add("active");
      historyTab.classList.remove("active");
      if (statusSection) statusSection.classList.remove("hidden");
      if (historySection) historySection.classList.add("hidden");
      window.secureStorage?.set("selectedDashboardTab", "status") || localStorage.setItem("selectedDashboardTab", "status");
    });
    
    historyTab.addEventListener("click", function() {
      historyTab.classList.add("active");
      statusTab.classList.remove("active");
      if (historySection) historySection.classList.remove("hidden");
      if (statusSection) statusSection.classList.add("hidden");
      window.secureStorage?.set("selectedDashboardTab", "history") || localStorage.setItem("selectedDashboardTab", "history");
      // Load backup history when tab is clicked
      if (typeof loadBackupHistory === 'function') {
        loadBackupHistory();
      }
    });
    
    // Initialize dashboard tabs
    if (lastDashboardTab === "history") {
      historyTab.classList.add("active");
      statusTab.classList.remove("active");
      if (historySection) historySection.classList.remove("hidden");
      if (statusSection) statusSection.classList.add("hidden");
      // Load backup history when history tab is initially shown
      if (typeof loadBackupHistory === 'function') {
        loadBackupHistory();
      }
    }
  }
  
  // Main tab switching (Backup | Restore | Cloud) with safe async operations
  let lastMainTab = 'backup'; // Default value
  try {
    lastMainTab = await window.secureStorage?.get("selectedMainTab") || localStorage.getItem("selectedMainTab") || 'backup';
  } catch (error) {
    console.warn('Failed to get last main tab:', error.message);
    lastMainTab = localStorage.getItem("selectedMainTab") || 'backup';
  }
  
  if (backupMainTab && restoreMainTab && cloudMainTab && settingsMainTab) {
    backupMainTab.addEventListener("click", function() {
      backupMainTab.classList.add("active");
      restoreMainTab.classList.remove("active");
      cloudMainTab.classList.remove("active");
      settingsMainTab.classList.remove("active");
      if (backupMainSection) backupMainSection.classList.remove("hidden");
      if (restoreMainSection) restoreMainSection.classList.add("hidden");
      if (cloudMainSection) cloudMainSection.classList.add("hidden");
      if (settingsMainSection) settingsMainSection.classList.add("hidden");
      window.secureStorage?.set("selectedMainTab", "backup") || localStorage.setItem("selectedMainTab", "backup");
    });
    
    restoreMainTab.addEventListener("click", function() {
      restoreMainTab.classList.add("active");
      backupMainTab.classList.remove("active");
      cloudMainTab.classList.remove("active");
      settingsMainTab.classList.remove("active");
      if (restoreMainSection) restoreMainSection.classList.remove("hidden");
      if (backupMainSection) backupMainSection.classList.add("hidden");
      if (cloudMainSection) cloudMainSection.classList.add("hidden");
      if (settingsMainSection) settingsMainSection.classList.add("hidden");
      window.secureStorage?.set("selectedMainTab", "restore") || localStorage.setItem("selectedMainTab", "restore");
    });
    
    cloudMainTab.addEventListener("click", async function() {
      try {
        cloudMainTab.classList.add("active");
        backupMainTab.classList.remove("active");
        restoreMainTab.classList.remove("active");
        settingsMainTab.classList.remove("active");
        if (cloudMainSection) cloudMainSection.classList.remove("hidden");
        if (backupMainSection) backupMainSection.classList.add("hidden");
        if (restoreMainSection) restoreMainSection.classList.add("hidden");
        if (settingsMainSection) settingsMainSection.classList.add("hidden");
        
        // Safe storage operation
        try {
          await window.secureStorage?.set("selectedMainTab", "cloud");
        } catch (storageError) {
          console.warn('Failed to save main tab preference:', storageError.message);
          localStorage.setItem("selectedMainTab", "cloud");
        }
        
        // Update Telegram connection status with error handling
        try {
          await updateTelegramConnectionStatus();
        } catch (telegramError) {
          console.warn('Failed to update Telegram connection status:', telegramError.message);
        }
      } catch (error) {
        console.error('Error in cloud tab click handler:', error.message);
        // Fallback to localStorage for tab preference
        localStorage.setItem("selectedMainTab", "cloud");
      }
    });
    
    settingsMainTab.addEventListener("click", function() {
      settingsMainTab.classList.add("active");
      backupMainTab.classList.remove("active");
      restoreMainTab.classList.remove("active");
      cloudMainTab.classList.remove("active");
      if (settingsMainSection) settingsMainSection.classList.remove("hidden");
      if (backupMainSection) backupMainSection.classList.add("hidden");
      if (restoreMainSection) restoreMainSection.classList.add("hidden");
      if (cloudMainSection) cloudMainSection.classList.add("hidden");
      window.secureStorage?.set("selectedMainTab", "settings") || localStorage.setItem("selectedMainTab", "settings");
    });
    
    // Initialize main tabs
    if (lastMainTab === "restore") {
      restoreMainTab.classList.add("active");
      backupMainTab.classList.remove("active");
      cloudMainTab.classList.remove("active");
      if (restoreMainSection) restoreMainSection.classList.remove("hidden");
      if (backupMainSection) backupMainSection.classList.add("hidden");
      if (cloudMainSection) cloudMainSection.classList.add("hidden");
    } else if (lastMainTab === "cloud") {
      cloudMainTab.classList.add("active");
      backupMainTab.classList.remove("active");
      restoreMainTab.classList.remove("active");
      settingsMainTab.classList.remove("active");
      if (cloudMainSection) cloudMainSection.classList.remove("hidden");
      if (backupMainSection) backupMainSection.classList.add("hidden");
      if (restoreMainSection) restoreMainSection.classList.add("hidden");
      if (settingsMainSection) settingsMainSection.classList.add("hidden");
      // Update Telegram connection status
      updateTelegramConnectionStatus();
    } else if (lastMainTab === "settings") {
      settingsMainTab.classList.add("active");
      backupMainTab.classList.remove("active");
      restoreMainTab.classList.remove("active");
      cloudMainTab.classList.remove("active");
      if (settingsMainSection) settingsMainSection.classList.remove("hidden");
      if (backupMainSection) backupMainSection.classList.add("hidden");
      if (restoreMainSection) restoreMainSection.classList.add("hidden");
      if (cloudMainSection) cloudMainSection.classList.add("hidden");
    }
  }
  
  // Backup sub-tab switching
  const lastBackupTab = await window.secureStorage?.get("selectedBackupTab") || localStorage.getItem("selectedBackupTab");
  
  if (manualTab && autoTab) {
    manualTab.addEventListener("click", function() {
      manualTab.classList.add("active");
      autoTab.classList.remove("active");
      if (manualSection) manualSection.classList.remove("hidden");
      if (autoSection) autoSection.classList.add("hidden");
      window.secureStorage?.set("selectedBackupTab", "manual") || localStorage.setItem("selectedBackupTab", "manual");
    });
    
    autoTab.addEventListener("click", function() {
      autoTab.classList.add("active");
      manualTab.classList.remove("active");
      if (autoSection) autoSection.classList.remove("hidden");
      if (manualSection) manualSection.classList.add("hidden");
      window.secureStorage?.set("selectedBackupTab", "auto") || localStorage.setItem("selectedBackupTab", "auto");
    });
    
    // Initialize backup sub-tabs
    if (lastBackupTab === "auto") {
      autoTab.classList.add("active");
      manualTab.classList.remove("active");
      if (autoSection) autoSection.classList.remove("hidden");
      if (manualSection) manualSection.classList.add("hidden");
    }
  }
} catch (error) {
  console.error('Error initializing popup tabs:', error);
  reportError('popup_initialization', error, 'error');
});


async function handleEncPasswdSubmit(e) {
  e.preventDefault();
  
  // Check if Telegram backup is selected and if it's available
  const telegramCheckbox = document.getElementById("also-send-telegram");
  if (telegramCheckbox && telegramCheckbox.checked) {
    const telegramAvailable = await isFeatureAvailable('telegram_backup');
    if (!telegramAvailable) {
      telegramCheckbox.checked = false;
      showUpgradeModal();
      return;
    }
  }

  const pass = getEncPasswd();
  
  // Validate password input
  if (!pass || pass.length < 4) {
    alert("Please enter a password of at least 4 characters to encrypt your backup.");
    return;
  }

  // Check if Chrome extension APIs are available
  if (typeof chrome !== 'undefined' && chrome.cookies) {
    // Show progress
    if (window.enhancedFeatures) {
      window.enhancedFeatures.showProgress('backup', 10, 'Reading cookies...');
    }
    
    // Check if we're doing selective backup
    let cookieFilter = () => true;
    if (window.selectedDomainsForBackup && window.selectedDomainsForBackup.length > 0) {
      cookieFilter = (cookie) => window.selectedDomainsForBackup.includes(cookie.domain);
    }
    
    chrome.cookies.getAll({}, (allCookies) => {
      const cookies = allCookies.filter(cookieFilter);
      
      if (cookies.length > 0) {
        if (window.enhancedFeatures) {
          window.enhancedFeatures.showProgress('backup', 50, 'Encrypting...');
        }
        
        // Compress data before encryption
        const cookieData = JSON.stringify(cookies);
        const compressedData = window.enhancedFeatures ? 
          window.enhancedFeatures.compressData(cookieData) : cookieData;
        
        const cipherText = sjcl.encrypt(pass, compressedData, { ks: 256 });
        
        // Wrap encrypted data with checksum in an object
        let data = {
          v: 1,
          payload: cipherText,
          checksum: null
        };
        
        // Add checksum for integrity
        if (window.enhancedFeatures) {
          data.checksum = window.enhancedFeatures.calculateChecksum(cipherText);
        }
        
        // Get profile name if provided and sanitize it
        const profileInput = document.getElementById('profile-name-input');
        let profileName = profileInput ? profileInput.value.trim() : '';
        
        // Sanitize profile name to prevent XSS (remove HTML tags and special characters)
        profileName = profileName.replace(/[<>\"'&]/g, '').slice(0, 30);
        
        // Save profile name for next time
        if (profileName) {
            window.secureStorage?.set('savedProfileName', profileName) || localStorage.setItem('savedProfileName', profileName);
        }
        
        // only using en-GB because it puts the date first
        const d = new Date()
        const date = d.toLocaleDateString("en-GB").replace(/\//g, "-");
        const time = d.toLocaleTimeString("en-GB").replace(/:/g, "-");
        
        // Include profile name in filename if provided
        const filename = profileName 
            ? `cookies-${profileName}-${date}-${time}.ckz`
            : `cookies-${date}-${time}.ckz`;
        
        if (window.enhancedFeatures) {
          window.enhancedFeatures.showProgress('backup', 90, 'Saving...');
        }
        
        downloadJson(JSON.stringify(data), filename)
        
        // Check if user wants to send to Telegram
        const telegramCheckbox = document.getElementById('send-to-telegram-checkbox');
        if (telegramCheckbox && telegramCheckbox.checked && !telegramCheckbox.disabled) {
          sendBackupToTelegram(JSON.stringify(data), filename);
        }
        
        backupSuccessAlert(cookies.length)
        
        // Add to backup history
        if (window.enhancedFeatures) {
          window.enhancedFeatures.addToBackupHistory({
            type: window.selectedDomainsForBackup ? 'selective' : 'all',
            cookieCount: cookies.length,
            size: JSON.stringify(data).length,
            filename: filename,
            encrypted: true
          });
          
          // Status dashboard will be updated via backup history
          window.enhancedFeatures.updateStatusDashboard();
          window.enhancedFeatures.showProgress('backup', 100, 'Complete!');
        }
        
        // Restore profile name after backup completion (fix for disappearing profile name)
        setTimeout(async () => {
          const savedProfileName = await window.secureStorage?.get('savedProfileName') || localStorage.getItem('savedProfileName');
          const profileInput = document.getElementById('profile-name-input');
          if (savedProfileName && profileInput) {
            profileInput.value = savedProfileName;
          }
        }, 100);
        
        // Clear selection
        window.selectedDomainsForBackup = null;
      } else {
        alert("No cookies to backup!");
        if (window.enhancedFeatures) {
          window.enhancedFeatures.showProgress('backup', 0, 'No cookies');
        }
      }
    });
  } else {
    // Fallback for web environment
    alert("Cookie backup is only available when running as a Chrome extension. This is a preview mode showing the interface.");
    // Chrome extension APIs not available - web preview mode
  }
}

// cookieFile variable moved to backup-core.js to avoid duplication

function handleFileSelect(e) {
  // Use cookieFile from backup-core.js
  if (typeof window.backupCore !== 'undefined' && window.backupCore.handleFileSelection) {
    window.backupCore.handleFileSelection(e.target.files[0]);
  } else {
    // Fallback - access global cookieFile variable
    if (typeof cookieFile === 'undefined') {
      window.cookieFile = e.target.files[0];
    } else {
      cookieFile = e.target.files[0];
    }
  }
  
  const selectedFile = e.target.files[0];
  if (!selectedFile) {
    return;
  }
  
  // Add file size limit (10MB max)
  const maxSize = 10 * 1024 * 1024; // 10MB in bytes
  if (selectedFile.size > maxSize) {
    alert("File size exceeds 10MB limit. Please select a smaller backup file.");
    e.target.value = ''; // Reset file input
    return;
  }
  
  const fileExtension = '.' + selectedFile.name.split('.').pop().toLowerCase();
  const allowedTypes = ['.ckz', '.json', '.csv', '.txt', '.xml'];
  
  if (!allowedTypes.includes(fileExtension)) {
    alert("Please select a valid backup file (.ckz, .json, .csv, .txt, .xml)");
    e.target.value = ''; // Reset file input
    return;
  }
  
  // Read and process the file based on its type
  const reader = new FileReader();
  reader.onload = function(event) {
    const fileContent = event.target.result;
    
    if (fileExtension === '.json') {
      handleJsonFile(fileContent);
    } else if (fileExtension === '.csv') {
      handleCsvFile(fileContent);
    } else if (fileExtension === '.txt' || fileExtension === '.xml') {
      handleTextFile(fileContent);
    } else if (fileExtension === '.ckz') {
      handleCkzFile(fileContent);
    }
  };
  reader.readAsText(selectedFile);
  
  // Store the selected file globally for later use
  window.cookieFile = selectedFile;
}

function handleJsonFile(content) {
  try {
    // Validate JSON content isn't empty
    if (!content || content.trim().length === 0) {
      throw new Error("File is empty");
    }
    
    const jsonData = JSON.parse(content);
    
    // Validate parsed data
    if (!jsonData) {
      throw new Error("Invalid JSON data");
    }
    
    if (Array.isArray(jsonData) && jsonData.length > 0) {
      // Check if it's a standard cookie array
      if (jsonData[0].name && jsonData[0].domain) {
        restoreUnencryptedCookies(jsonData);
        return;
      }
    }
    // Might be encrypted JSON
    handleEncryptedFile(content);
  } catch (e) {
    alert("Invalid JSON file format. Please check your file and try again.");
  }
}

function handleCsvFile(content) {
  try {
    // Simple CSV parsing for cookies
    const lines = content.split('\n');
    if (lines.length < 2) {
      alert("CSV file appears to be empty or invalid.");
      return;
    }
    
    const cookies = [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',');
      const cookie = {};
      
      headers.forEach((header, index) => {
        const value = values[index] ? values[index].trim() : '';
        if (header === 'domain') cookie.domain = value;
        else if (header === 'name') cookie.name = value;
        else if (header === 'value') cookie.value = value;
        else if (header === 'path') cookie.path = value || '/';
      });
      
      if (cookie.domain && cookie.name) {
        cookies.push(cookie);
      }
    }
    
    if (cookies.length > 0) {
      restoreUnencryptedCookies(cookies);
    } else {
      alert("No valid cookies found in CSV file.");
    }
  } catch (e) {
    alert("Error parsing CSV file. Please check the format and try again.");
  }
}

function handleTextFile(content) {
  if (content.indexOf("{") !== -1) {
    try {
      // Try to parse as JSON first
      const jsonData = JSON.parse(content);
      if (Array.isArray(jsonData)) {
        restoreUnencryptedCookies(jsonData);
        return;
      }
    } catch (e) {
      // Not JSON, treat as encrypted
    }
    handleEncryptedFile(content);
  } else {
    alert("This doesn't appear to be a valid backup file format.");
  }
}

function handleCkzFile(content) {
  handleEncryptedFile(content);
}

function handleEncryptedFile(content) {
  hideFallbackCkzButton();
  showDecPasswordInputBox();
  const textarea = document.getElementById("ckz-textarea");
  if (textarea) {
    textarea.value = content;
  }
}

function restoreUnencryptedCookies(cookies) {
  if (typeof chrome !== 'undefined' && chrome.cookies) {
    let imported = 0;
    cookies.forEach((cookie) => {
      const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path || '/'}`;
      
      chrome.cookies.set({
        url: url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'no_restriction'
      }, () => {
        imported++;
        if (imported === cookies.length) {
          restoreSuccessAlert(imported);
        }
      });
    });
  } else {
    alert('Cookie restoration is only available when running as a Chrome extension.');
  }
}

function handleDecPasswdSubmit(e) {
  e.preventDefault();

  const pass = getDecPasswd()
  
  // Validate password input
  if (!pass || pass.length < 1) {
    alert("Please enter a password to decrypt the backup.");
    return;
  }

  getCkzFileDataAsText(async (data) => {
    let cookies;

    try {
      // Parse the wrapper object if it exists
      let encryptedData = data;
      let expectedChecksum = null;
      
      try {
        const wrapper = JSON.parse(data);
        if (wrapper.v === 1 && wrapper.payload) {
          encryptedData = wrapper.payload;
          expectedChecksum = wrapper.checksum;
          
          // Verify checksum if present
          if (expectedChecksum && window.enhancedFeatures) {
            const actualChecksum = window.enhancedFeatures.calculateChecksum(encryptedData);
            if (actualChecksum !== expectedChecksum) {
              throw new Error('Checksum verification failed');
            }
          }
        }
      } catch (e) {
        // Not a wrapped format, use as-is (backward compatibility)
        encryptedData = data;
      }
      
      const decrypted = sjcl.decrypt(pass, encryptedData);
      
      // Decompress if needed
      const decompressed = window.enhancedFeatures ? 
        window.enhancedFeatures.decompressData(decrypted) : decrypted;
      
      cookies = JSON.parse(decompressed);
      
      // Validate cookie structure more thoroughly
      if (!Array.isArray(cookies)) {
        throw new Error("Invalid cookie data structure - not an array");
      }
      
      if (cookies.length > 0) {
        // Check first cookie has required fields
        const requiredFields = ['name', 'value', 'domain'];
        const firstCookie = cookies[0];
        for (const field of requiredFields) {
          if (!firstCookie.hasOwnProperty(field)) {
            throw new Error(`Invalid cookie data structure - missing required field: ${field}`);
          }
        }
      }
    } catch (error) {
      // Password decryption failed
      if (error instanceof sjcl.exception.corrupt) {
        alert("Password incorrect!");
      } else if (error instanceof sjcl.exception.invalid) {
        alert("File is not a valid .ckz file!");
      } else if (error.message === "Invalid cookie data structure") {
        alert("The decrypted data doesn't contain valid cookies!");
      } else if (error.message === "Checksum verification failed") {
        alert("File integrity check failed. The backup may be corrupted.");
      } else {
        alert("Unknown error during decryption!");
      }
      return;
    }

    // initialize progress bar
    initRestoreProgressBar(cookies.length)

    let total = 0;

    // lets save some syscalls by defining it once up here
    const epoch = new Date().getTime() / 1000;

    for (const cookie of cookies) {
      let url =
        "http" +
        (cookie.secure ? "s" : "") +
        "://" +
        (cookie.domain.startsWith(".")
          ? cookie.domain.slice(1)
          : cookie.domain) +
        cookie.path;

      if (cookie.expirationDate && epoch > cookie.expirationDate) {
        expirationWarning(cookie.name, url)
        continue;
      }

      if (cookie.hostOnly == true) {
        delete cookie.domain;
      }
      if (cookie.session == true) {
        delete cookie.expirationDate;
      }

      delete cookie.hostOnly;
      delete cookie.session;

      cookie.url = url;
      
      // Ensure all required fields are present
      if (!cookie.sameSite) {
        cookie.sameSite = 'no_restriction';
      }
      if (cookie.secure === undefined) {
        cookie.secure = url.startsWith('https');
      }
      if (cookie.httpOnly === undefined) {
        cookie.httpOnly = false;
      }
      if (cookie.path === undefined) {
        cookie.path = '/';
      }
      
      let c = await new Promise((resolve, reject) => {
        chrome.cookies.set(cookie, (result) => {
          if (chrome.runtime.lastError) {
            unknownErrWarning(cookie.name, cookie.url + ' - ' + chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(result);
          }
        });
      });

      if (c != null) {
        total++;
        updateRestoreProgressBar(total)
      }
    }

    restoreSuccessAlert(total, cookies.length)
    hideRestoreProgressBar()
  })
}

// --- TELEGRAM CREDENTIALS HANDLING ---

/**
 * Handles saving Telegram credentials when the user clicks save button
 */
async function handleSaveTelegramCredentials() {
  // Check if Telegram backup feature is available
  const telegramAvailable = await isFeatureAvailable('telegram_backup');
  
  if (!telegramAvailable) {
    showUpgradeModal();
    return;
  }
  
  const tokenInput = document.getElementById("telegram-bot-token");
  const chatInput = document.getElementById("telegram-chat-id");
  
  const botToken = tokenInput.value.trim();
  const chatId = chatInput.value.trim();

  // Use secure storage validation
  if (!window.secureStorage) {
    addToWarningMessageList(createWarning("Secure storage not available"));
    return;
  }
  
  // Validate bot token format using secure storage validator
  if (botToken && !window.secureStorage.validateBotToken(botToken)) {
    addToWarningMessageList(createWarning("Invalid bot token format. Please check your token from @BotFather."));
    return;
  }
  
  // Validate chat ID format using secure storage validator
  if (chatId && !window.secureStorage.validateChatId(chatId)) {
    addToWarningMessageList(createWarning("Invalid chat ID format. Use numeric ID or @channel_username."));
    return;
  }

  try {
    // Store credentials securely with encryption
    await window.secureStorage.storeTelegramCredentials(botToken, chatId);
    
    // Also save to localStorage for backward compatibility (will be migrated)
    saveTelegramCredentials(botToken, chatId);
    
    // Send test message to Telegram
    sendTelegramTestMessage(botToken, chatId);
    
    // Mask the token for security display
    tokenInput.value = maskBotToken(botToken);
    tokenInput.setAttribute("data-actual-token", botToken);
    chatInput.setAttribute("data-actual-chat-id", chatId);
    
    // Update Telegram backup option availability
    updateTelegramBackupOption();
    
    // Update Telegram connection status
    updateTelegramConnectionStatus();
    
    addToSuccessMessageList(createSuccessAlert('✅ Telegram credentials saved securely!'));
  } catch (error) {
    console.error('Error saving Telegram credentials:', error);
    addToWarningMessageList(createWarning(`Failed to save credentials: ${error.message}`));
  }
}

/**
 * Tests the Telegram connection with provided credentials
 */
async function handleTestTelegramConnection() {
  const tokenInput = document.getElementById("telegram-bot-token");
  const chatInput = document.getElementById("telegram-chat-id");
  const statusDiv = document.getElementById("telegram-status");
  const statusIcon = statusDiv.querySelector(".status-icon");
  const statusText = statusDiv.querySelector(".status-text");
  
  // Get actual token value (might be masked or from secure storage)
  let botToken = tokenInput.getAttribute("data-actual-token") || tokenInput.value.trim();
  let chatId = chatInput.getAttribute("data-actual-chat-id") || chatInput.value.trim();
  
  // Try to get from secure storage if not in DOM
  if ((!botToken || !chatId) && window.secureStorage) {
    const storedCreds = await window.secureStorage.getTelegramCredentials();
    if (storedCreds) {
      botToken = botToken || storedCreds.botToken;
      chatId = chatId || storedCreds.chatId;
    }
  }
  
  if (!botToken || !chatId) {
    showStatus("error", "⚠️", "Please enter both bot token and chat ID");
    return;
  }
  
  // Validate credentials using secure storage validators
  if (window.secureStorage) {
    if (!window.secureStorage.validateBotToken(botToken)) {
      showStatus("error", "⚠️", "Invalid bot token format");
      return;
    }
    if (!window.secureStorage.validateChatId(chatId)) {
      showStatus("error", "⚠️", "Invalid chat ID format");
      return;
    }
  }
  
  // Show loading state
  showStatus("loading", "⏳", "Testing connection...");
  
  try {
    const testMessage = "✅ Cookie Backup Extension connected successfully! Your automatic backups will be sent here.";
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: testMessage,
        parse_mode: 'HTML'
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      showStatus("success", "✅", "Connection successful! Check your Telegram for a test message.");
      // Save credentials after successful test
      saveTelegramCredentials(botToken, chatId);
      // Mask the token for security
      tokenInput.value = maskBotToken(botToken);
      tokenInput.setAttribute("data-actual-token", botToken);
      chatInput.setAttribute("data-actual-chat-id", chatId);
      // Update Telegram connection status
      updateTelegramConnectionStatus();
    } else {
      const errorMsg = data.description || "Connection failed";
      showStatus("error", "❌", `Error: ${errorMsg}`);
    }
  } catch (error) {
    // Test connection failed - network or credential error
    showStatus("error", "❌", "Connection failed. Please check your credentials and try again.");
  }
  
  function showStatus(type, icon, message) {
    statusDiv.classList.remove("hidden", "success", "error", "loading");
    statusDiv.classList.add(type);
    if (statusIcon) statusIcon.textContent = icon;
    if (statusText) statusText.textContent = message;
    
    // Auto-hide success/error messages after 5 seconds
    if (type !== "loading") {
      setTimeout(() => {
        statusDiv.classList.add("hidden");
      }, 5000);
    }
  }
}

/**
 * Sends backup data to Telegram via background script
 */
function sendBackupToTelegram(backupData, filename) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['telegramBotToken'], (result) => {
      const credentials = result.telegramBotToken;
      
      if (credentials && credentials.botToken && credentials.chatId) {
        chrome.runtime.sendMessage({
          action: "backupToTelegram",
          data: backupData,
          botToken: credentials.botToken,
          chatId: credentials.chatId,
          filename: filename
        }, (response) => {
          if (chrome.runtime.lastError) {
            addToWarningMessageList(createWarning("❌ Failed to send backup to Telegram"));
            return;
          }
          
          if (response && response.status === "success") {
            addToSuccessMessageList(createSuccessAlert("✅ Backup sent to Telegram successfully!"));
          } else {
            const errorMessage = response && response.message ? response.message : "Unknown error";
            addToWarningMessageList(createWarning("❌ Failed to send backup to Telegram: " + errorMessage));
            console.error("Telegram backup failed:", response);
          }
        });
      } else {
        addToWarningMessageList(createWarning("❌ Telegram credentials not found"));
      }
    });
  } else {
    // Fallback for web environment
    try {
      const credentials = JSON.parse(localStorage.getItem('telegramBotToken') || '{}');
      
      if (credentials.botToken && credentials.chatId) {
        // Show info message for web preview
        addToSuccessMessageList(createSuccessAlert("📱 Telegram backup would be sent in Chrome extension mode"));
      } else {
        addToWarningMessageList(createWarning("❌ Telegram credentials not configured"));
      }
    } catch (e) {
      addToWarningMessageList(createWarning("❌ Error accessing Telegram credentials"));
    }
  }
}

/**
 * Updates the Telegram backup option visibility and status
 */
function updateTelegramBackupOption() {
  const telegramOption = document.getElementById('telegram-backup-option');
  const telegramCheckbox = document.getElementById('send-to-telegram-checkbox');
  const telegramStatus = document.getElementById('telegram-option-status');
  
  if (!telegramOption || !telegramCheckbox || !telegramStatus) return;
  
  // Check if Telegram credentials are available
  let hasCredentials = false;
  
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['telegramBotToken'], (result) => {
      const credentials = result.telegramBotToken;
      hasCredentials = credentials && credentials.botToken && credentials.chatId;
      
      if (hasCredentials) {
        telegramOption.classList.remove('disabled');
        telegramCheckbox.disabled = false;
        telegramStatus.textContent = 'Backup will also be sent to your Telegram';
      } else {
        telegramOption.classList.add('disabled');
        telegramCheckbox.disabled = true;
        telegramCheckbox.checked = false;
        telegramStatus.textContent = 'Configure Telegram in Cloud section first';
      }
    });
  } else {
    // Fallback for web environment
    try {
      const credentials = JSON.parse(localStorage.getItem('telegramBotToken') || '{}');
      hasCredentials = credentials.botToken && credentials.chatId;
      
      if (hasCredentials) {
        telegramOption.classList.remove('disabled');
        telegramCheckbox.disabled = false;
        telegramStatus.textContent = 'Backup will also be sent to your Telegram';
      } else {
        telegramOption.classList.add('disabled');
        telegramCheckbox.disabled = true;
        telegramCheckbox.checked = false;
        telegramStatus.textContent = 'Configure Telegram in Cloud section first';
      }
    } catch (e) {
      telegramOption.classList.add('disabled');
      telegramCheckbox.disabled = true;
      telegramCheckbox.checked = false;
    }
  }
}

/**
 * Sends a test message to Telegram to verify credentials
 */
function sendTelegramTestMessage(botToken, chatId) {
  const testMessage = "Cookie Backup Extension: Configuration test successful!";
  
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    // Send message through background script for Chrome extension
    try {
      chrome.runtime.sendMessage({
        action: "sendTestMessage",
        botToken: botToken,
        chatId: chatId,
        message: testMessage
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Error sending test message via runtime
          addToWarningMessageList(createWarning("❌ Failed to send test message to Telegram"));
          return;
        }
        
        if (response && response.status === "success") {
          addToSuccessMessageList(createSuccessAlert("✅ Test message sent to Telegram successfully!"));
        } else {
          addToWarningMessageList(createWarning("❌ Failed to send test message: " + (response?.message || "Unknown error")));
        }
      });
    } catch (error) {
      // Chrome runtime communication error - log and fallback to direct API call
      console.error('Chrome runtime communication error:', error);
      sendTelegramTestMessageDirect(botToken, chatId, testMessage);
    }
  } else {
    // Fallback for web environment - direct API call
    sendTelegramTestMessageDirect(botToken, chatId, testMessage);
  }
}

/**
 * Direct API call to send test message (for web environment)
 */
async function sendTelegramTestMessageDirect(botToken, chatId, message) {
  try {
    // Use proxy endpoint when running in web preview mode
    const proxyUrl = '/telegram-proxy';
    
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        botToken: botToken,
        chatId: chatId,
        message: message
      })
    });

    const result = await response.json();

    if (result.ok) {
      addToSuccessMessageList(createSuccessAlert("✅ Test message sent to Telegram successfully!"));
    } else {
      addToWarningMessageList(createWarning("❌ Failed to send test message: " + (result.description || "Unknown error")));
    }
  } catch (error) {
    // Error sending test message to Telegram
    addToWarningMessageList(createWarning("❌ Network error sending test message to Telegram"));
  }
}

// --- DOM MANIPULATION AND HELPER FUNCTIONS ---

function createWarning(text) {
  const div = document.createElement("div");
  div.classList.add("alert", "alert-warning");
  div.textContent = text;
  return div;
}

function createSuccessAlert(text) {
  const div = document.createElement("div");
  div.classList.add("alert", "alert-success");
  div.textContent = text;
  return div;
}

// NEW: Helper to create a red error alert
function createErrorAlert(text) {
    const div = document.createElement("div");
    div.classList.add("alert", "alert-danger"); // Assumes an 'alert-danger' style exists
    div.textContent = text;
    return div;
}

function unknownErrWarning(cookie_name, cookie_url) {
  if (cookie_name && cookie_url) {
    addToWarningMessageList(createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} could not be restored`))
  }
}

function expirationWarning(cookie_name, cookie_url) {
  if (cookie_name && cookie_url) {
    addToWarningMessageList(createWarning(`Cookie ${cookie_name} for the domain ${cookie_url} has expired`))
  }
}

function backupSuccessAlert(totalCookies) {
  addToSuccessMessageList(createSuccessAlert(`Successfully backed up ${totalCookies.toLocaleString()} cookies!`))
}

function restoreSuccessAlert(restoredCookies, totalCookies) {
  addToSuccessMessageList(createSuccessAlert(`Successfully restored ${restoredCookies.toLocaleString()} cookies out of ${totalCookies.toLocaleString()}`));
}

function hideBackupButton() {
  const btn = document.getElementById("btn-backup");
  if (btn) {
    btn.style.display = "none";
  }
}

async function showEncPasswordInputBox(e) {
  // Check if encryption feature is available
  const encryptionAvailable = await isFeatureAvailable('encryption');
  
  if (!encryptionAvailable) {
    showUpgradeModal();
    return;
  }
  
  hideBackupButton();
  const encPasswd = document.getElementById("enc-passwd");
  const inpEncPasswd = document.getElementById("inp-enc-passwd");
  if (encPasswd) {
    encPasswd.style.display = "flex";
  }
  if (inpEncPasswd) {
    inpEncPasswd.focus();
  }
}

function showDecPasswordInputBox(e) {
  const decPasswd = document.getElementById("dec-passwd");
  const inpDecPasswd = document.getElementById("inp-dec-passwd");
  if (decPasswd) {
    decPasswd.style.display = "flex";
  }
  if (inpDecPasswd) {
    inpDecPasswd.focus();
  }
}

function hideDecPasswordInputBox(e) {
  const decPasswd = document.getElementById("dec-passwd");
  if (decPasswd) {
    decPasswd.style.display = "none";
  }
}

function addToSuccessMessageList(node) {
  const messages = document.getElementById("messages");
  if (messages && node) {
    messages.appendChild(node);
    
    // Auto-hide success messages after 4 seconds
    setTimeout(() => {
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }, 4000);
  }
}

// Export functions for use in other scripts
window.createSuccessAlert = createSuccessAlert;
window.addToSuccessMessageList = addToSuccessMessageList;

function addToWarningMessageList(node) {
  const warnings = document.getElementById("warnings");
  if (warnings && node) {
    warnings.appendChild(node);
  }
}

function getEncPasswd() {
  const input = document.getElementById("inp-enc-passwd");
  return input ? input.value.trim() : "";
}

function getDecPasswd() {
  const input = document.getElementById("inp-dec-passwd");
  return input ? input.value.trim() : "";
}

function initRestoreProgressBar(maxVal) {
  const progress = document.getElementById("progress");
  const progressbar = document.getElementById("progressbar");
  if (progress) {
    progress.style.display = "block";
  }
  if (progressbar) {
    progressbar.setAttribute("max", maxVal);
  }
}

function updateRestoreProgressBar(val) {
  const progressbar = document.getElementById("progressbar");
  if (progressbar) {
    progressbar.setAttribute("value", val);
  }
}

function hideRestoreProgressBar() {
  const progressbar = document.getElementById("progressbar");
  const progress = document.getElementById("progress");
  if (progressbar) {
    progressbar.setAttribute("value", 0);
  }
  if (progress) {
    progress.style.display = "none";
  }
}

function hideFallbackCkzButton() {
  const btn = document.getElementById("btn-upload-fallback");
  if (btn) {
    btn.style.display = "none";
  }
}

function showFallbackCkzInput() {
  hideFallbackCkzButton();
  const restoreUploadWrap = document.getElementById("restore-upload-wrap");
  const restoreUsingTextWrap = document.getElementById("restore-using-text-wrap");
  const decPasswd = document.getElementById("dec-passwd");
  
  if (restoreUploadWrap) {
    restoreUploadWrap.style.display = "none";
  }
  if (restoreUsingTextWrap) {
    restoreUsingTextWrap.style.display = "flex";
  }
  if (decPasswd) {
    decPasswd.style.display = "flex";
  }
}

function getCkzFileContentsFromTextarea() {
  const textarea = document.getElementById("ckz-textarea");
  return textarea ? textarea.value.trim() : "";
}

function downloadJson(data, filename) {
  // Use data URL instead of URL.createObjectURL for better compatibility
  const dataUrl = 'data:application/ckz;charset=utf-8,' + encodeURIComponent(data);

  // Check if Chrome downloads API is available
  if (typeof chrome !== 'undefined' && chrome.downloads) {
    chrome.downloads.download({ url: dataUrl, filename: filename }, (id) => {
      chrome.downloads.onChanged.addListener((delta) => {
        if (delta?.state?.current == "complete") {
          chrome.downloads.show(id)
        }
      })
    });
  } else {
    // Fallback for web environment - use browser download
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

function getCkzFileDataAsText(cb) {
  if (window.cookieFile || (typeof cookieFile !== 'undefined' && cookieFile)) {
    const reader = new FileReader();
    const fileToRead = window.cookieFile || cookieFile;
    reader.readAsText(fileToRead);
    reader.onload = (e) => {
      cb(e.target.result);
    }
    reader.onerror = (e) => {
      // Error reading file
      console.error('Error reading .ckz file:', e);
      alert("Error reading the backup file. Please try again or use a different file.");
    }
  } else {
    cb(getCkzFileContentsFromTextarea())
  }
}

// --- AUTOMATIC BACKUP LOGIC ---

// Initialize these variables when DOM is ready
let scheduleSelect = null;
let statusText = null;
let autoTelegramBackupCheckbox = null;

// Initialize DOM elements when DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
  scheduleSelect = document.getElementById("auto-backup-schedule");
  statusText = document.getElementById("auto-backup-status");
  autoTelegramBackupCheckbox = document.getElementById("auto-telegram-backup");
  
  // Initialize save telegram credentials button
  const saveTelegramBtn = document.getElementById("save-telegram-credentials");
  if (saveTelegramBtn) {
    saveTelegramBtn.addEventListener("click", handleSaveTelegramCredentials);
  }
  
  // Initialize test connection button
  const testTelegramBtn = document.getElementById("test-telegram-connection");
  if (testTelegramBtn) {
    testTelegramBtn.addEventListener("click", handleTestTelegramConnection);
  }
  
  // Add event listeners for schedule and telegram backup
  if (scheduleSelect) {
    scheduleSelect.addEventListener("change", handleScheduleChange);
  }
  if (autoTelegramBackupCheckbox) {
    autoTelegramBackupCheckbox.addEventListener("change", handleAutoTelegramBackupChange);
  }
  
  // Load auto backup settings
  loadAutoBackupSettings();

  // Add event listeners for Telegram credential fields
  const tokenInput = document.getElementById("telegram-bot-token");
  const chatInput = document.getElementById("telegram-chat-id");

  // Clear masked display when user starts editing
  if (tokenInput) {
    tokenInput.addEventListener("focus", () => {
      if (tokenInput.getAttribute("data-actual-token")) {
        tokenInput.value = tokenInput.getAttribute("data-actual-token");
        tokenInput.removeAttribute("data-actual-token");
      }
    });
  }

  if (chatInput) {
    chatInput.addEventListener("focus", () => {
      if (chatInput.getAttribute("data-actual-chat-id")) {
        chatInput.value = chatInput.getAttribute("data-actual-chat-id");
        chatInput.removeAttribute("data-actual-chat-id");
      }
    });
  }
  
  // Cloud section event handlers
  const refreshCloudBackupsBtn = document.getElementById("refresh-cloud-backups");
  
  if (refreshCloudBackupsBtn) {
    refreshCloudBackupsBtn.addEventListener("click", function() {
      updateCloudBackupsList();
    });
  }
  
  // Initialize cloud status
  updateCloudStatus();
  
  // Add click handler for Telegram option
  const telegramOption = document.getElementById('telegram-option');
  if (telegramOption) {
    telegramOption.addEventListener('click', async function() {
      try {
        // Check if feature is available (trial or premium)
        const available = await isFeatureAvailable('telegram_backup');
        if (!available) {
          showUpgradeModal();
          return;
        }
        
        // Show cloud section with Telegram configuration
        const cloudTab = document.getElementById('cloud-main-tab');
        if (cloudTab) {
          cloudTab.click();
        }
        
        // Focus on Telegram configuration
        const telegramWrap = document.getElementById('cloud-wrap');
        if (telegramWrap) {
          telegramWrap.scrollIntoView({ behavior: 'smooth' });
          // Highlight the section
          telegramWrap.style.border = '2px solid #4caf50';
          setTimeout(() => {
            telegramWrap.style.border = '';
          }, 2000);
        }
      } catch (error) {
        console.error('Error in Telegram option click handler:', error.message);
        // Show fallback upgrade modal if feature check fails
        showUpgradeModal();
      }
    });
  }
  
  // Update Telegram option status based on trial/premium
  async function updateTelegramOptionStatus() {
    const telegramOption = document.getElementById('telegram-option');
    const statusBadge = telegramOption?.querySelector('.storage-status');
    const hasPremium = await hasPremiumAccess();
    
    if (telegramOption && statusBadge) {
      if (hasPremium) {
        telegramOption.className = 'storage-option telegram-active';
        statusBadge.className = 'storage-status active-badge';
        statusBadge.textContent = 'Active';
        telegramOption.style.cursor = 'pointer';
      } else {
        telegramOption.className = 'storage-option premium-coming-soon';
        statusBadge.className = 'storage-status premium-badge';
        statusBadge.textContent = 'Premium';
        telegramOption.style.cursor = 'not-allowed';
      }
    }
  }
  
  // Update status on load
  updateTelegramOptionStatus();
  
  // Load saved profile name with safe async operation
  let savedProfileName = '';
  try {
    savedProfileName = await window.secureStorage?.get('savedProfileName') || localStorage.getItem('savedProfileName') || '';
  } catch (error) {
    console.warn('Failed to get saved profile name from secure storage:', error.message);
    savedProfileName = localStorage.getItem('savedProfileName') || '';
  }
  
  const profileInput = document.getElementById('profile-name-input');
  const profileStatus = document.getElementById('profile-name-status');
  
  if (savedProfileName && profileInput) {
    profileInput.value = savedProfileName;
  }
  
  // Update profile name status
  if (profileStatus) {
    profileStatus.textContent = savedProfileName || 'Default';
  }
  
  // Listen for profile name changes
  if (profileInput) {
    profileInput.addEventListener('input', (e) => {
      const newProfileName = e.target.value.trim();
      if (profileStatus) {
        profileStatus.textContent = newProfileName || 'Default';
      }
    });
  }
  
  // Initialize Telegram backup option
  updateTelegramBackupOption();
  
  // Initialize trial system with error handling
  try {
    if (typeof initializeTrial === 'function') {
      initializeTrial().then(() => {
        displayTrialStatus();
      }).catch(error => {
        console.error('Error initializing trial:', error);
        // Show fallback UI in preview mode
        displayFallbackTrialStatus();
      });
    } else {
      console.warn('initializeTrial function not available - loading fallback');
      displayFallbackTrialStatus();
    }
  } catch (error) {
    console.error('Error initializing trial:', error);
    displayFallbackTrialStatus();
  }
  
  // Initialize subscription management
  initializeSubscriptionManagement();
  
  // Setup payment validation for redirects
  setupPaymentValidation();
  
  // Initialize settings section handler
  initializeSettingsSection();
  
  // Initialize master toggle for auto backup
  if (typeof initializeMasterToggle === 'function') {
    initializeMasterToggle();
  }
  
  } catch (error) {
    console.error('Critical error during popup initialization:', error.message);
    
    // Show fallback UI to user
    try {
      const messageContainer = document.getElementById('messages');
      if (messageContainer && typeof createWarning === 'function') {
        const errorAlert = createWarning('Some features may not work correctly. Please refresh the popup.');
        messageContainer.appendChild(errorAlert);
      }
    } catch (fallbackError) {
      console.error('Failed to show error message:', fallbackError.message);
    }
    
    // Try to initialize basic functionality even if advanced features fail
    try {
      if (typeof displayFallbackTrialStatus === 'function') {
        displayFallbackTrialStatus();
      }
    } catch (fallbackTrialError) {
      console.error('Fallback trial status failed:', fallbackTrialError.message);
    }
  }
});

// Initialize settings section
function initializeSettingsSection() {
  // Settings section is initialized when first accessed
  // This prevents unnecessary loading of features until needed
  console.log('Settings section initialized');
}

// Update Telegram connection status based on saved credentials
async function updateTelegramConnectionStatus() {
  try {
    // Get Telegram credentials using secure storage
    const credentials = await window.secureStorage?.getTelegramCredentials();
    const statusElement = document.getElementById('telegram-connection-status');
    
    if (statusElement) {
      if (credentials && credentials.botToken && credentials.chatId) {
        // Show "Connected" only if both bot token and chat ID are saved
        statusElement.classList.remove('hidden');
      } else {
        // Hide "Connected" if credentials are not complete
        statusElement.classList.add('hidden');
      }
    }
  } catch (error) {
    console.error('Error checking Telegram credentials:', error);
    // Hide status on error
    const statusElement = document.getElementById('telegram-connection-status');
    if (statusElement) {
      statusElement.classList.add('hidden');
    }
  }
}

const ALARM_NAME = "cookieAutoBackup";

// Removed duplicate trial system functions - using trial-system.js module

/**
 * Display trial/subscription status in the UI
 */
async function displayTrialStatus() {
  try {
    const status = await getSubscriptionStatus();
    
    // Create or update trial status element in header
    let statusElement = document.getElementById('trial-status');
    if (!statusElement) {
      // Find header or create status element
      const header = document.querySelector('.header-green');
      if (header) {
        statusElement = document.createElement('div');
        statusElement.id = 'trial-status';
        statusElement.className = 'trial-status';
        header.appendChild(statusElement);
      }
    }
    
    if (statusElement) {
      // Update status display based on type - just star icon with tooltip
      switch (status.type) {
        case 'trial':
          statusElement.innerHTML = `
            <button class="star-status-btn trial-star" title="${status.message} - Click for details" onclick="showUpgradeModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
              <span class="star-days">${status.daysRemaining}d</span>
            </button>
          `;
          statusElement.className = 'trial-status compact';
          break;
          
        case 'premium':
          statusElement.innerHTML = `
            <button class="star-status-btn premium-star" title="${status.message} - Click for account" onclick="showAccountModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
            </button>
          `;
          statusElement.className = 'trial-status compact';
          break;
          
        case 'expired':
          statusElement.innerHTML = `
            <button class="star-status-btn expired-star" title="${status.message} - Click to upgrade" onclick="showUpgradeModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
              </svg>
              <span class="star-expired">!</span>
            </button>
          `;
          statusElement.className = 'trial-status compact';
          break;
          
        default:
          statusElement.style.display = 'none';
      }
    }
    
    // Update premium feature indicators
    updatePremiumFeatureIndicators();
  } catch (error) {
    console.error('Error displaying trial status:', error);
  }
}

/**
 * Display fallback trial status when Chrome APIs aren't available
 */
function displayFallbackTrialStatus() {
  try {
    // Create or update trial status element in header
    let statusElement = document.getElementById('trial-status');
    if (!statusElement) {
      const header = document.querySelector('.header-green');
      if (header) {
        statusElement = document.createElement('div');
        statusElement.id = 'trial-status';
        statusElement.className = 'trial-status';
        header.appendChild(statusElement);
      }
    }
    
    if (statusElement) {
      // Show preview mode indicator
      statusElement.innerHTML = `
        <button class="star-status-btn trial-star" title="Preview Mode - Install extension to activate trial" onclick="alert('Install this extension in Chrome to activate your 7-day free trial!')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
          <span class="star-days">Preview</span>
        </button>
      `;
      statusElement.className = 'trial-status compact';
    }
  } catch (error) {
    console.error('Error displaying fallback trial status:', error);
  }
}

/**
 * Update UI to show premium indicators on features
 */
async function updatePremiumFeatureIndicators() {
  try {
    // Check if hasPremiumAccess function is available
    let hasPremium = false;
    if (typeof hasPremiumAccess === 'function') {
      hasPremium = await hasPremiumAccess();
    } else {
      console.warn('hasPremiumAccess function not available - defaulting to trial mode');
      hasPremium = true; // Default to true in preview mode
    }
    
    // Update Auto Backup toggle
    const autoBackupSection = document.querySelector('.auto-backup-controls');
    if (autoBackupSection && !hasPremium) {
      addPremiumBadge(autoBackupSection, 'auto-backup-premium');
    }
    
    // Update encryption checkbox
    const encryptCheckbox = document.getElementById('also-send-telegram');
    if (encryptCheckbox && !hasPremium) {
      const parent = encryptCheckbox.parentElement;
      if (parent) {
        addPremiumBadge(parent, 'encryption-premium');
      }
    }
    
    // Update advanced frequency options
    const frequencySelect = document.getElementById('schedule-select');
    if (frequencySelect && !hasPremium) {
      const options = frequencySelect.querySelectorAll('option');
      options.forEach(option => {
        if (['15min', '30min'].includes(option.value)) {
          option.text = option.text + ' (Premium)';
          option.disabled = true;
        }
      });
    }
    
    // Update cloud storage cards
    updateCloudStoragePremiumIndicators(hasPremium);
    
  } catch (error) {
    console.error('Error updating premium indicators:', error);
  }
}

/**
 * Add premium badge to an element
 */
function addPremiumBadge(element, id) {
  // Check if badge already exists
  if (document.getElementById(id)) return;
  
  const badge = document.createElement('span');
  badge.id = id;
  badge.className = 'premium-indicator';
  badge.innerHTML = `
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>
    Premium
  `;
  element.appendChild(badge);
}

/**
 * Update cloud storage cards with premium indicators
 */
async function updateCloudStoragePremiumIndicators(hasPremium) {
  const cloudCards = document.querySelectorAll('.cloud-provider-card');
  
  cloudCards.forEach(card => {
    const existingBadge = card.querySelector('.premium-label');
    
    if (!hasPremium && !existingBadge) {
      // Add lock overlay if trial expired
      card.classList.add('premium-locked');
      card.addEventListener('click', handlePremiumFeatureClick);
    } else if (hasPremium && card.classList.contains('premium-locked')) {
      // Remove lock if premium active
      card.classList.remove('premium-locked');
      card.removeEventListener('click', handlePremiumFeatureClick);
    }
  });
}

/**
 * Handle click on premium feature when trial expired
 */
function handlePremiumFeatureClick(e) {
  e.preventDefault();
  e.stopPropagation();
  showUpgradeModal();
}

/**
 * Show upgrade modal
 */
function showUpgradeModal() {
  // Create modal if it doesn't exist
  let modal = document.getElementById('upgrade-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.className = 'upgrade-modal';
    modal.innerHTML = `
      <div class="upgrade-modal-content">
        <button class="modal-close" onclick="closeUpgradeModal()">×</button>
        <div class="upgrade-header">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#ffd700">
            <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
          </svg>
          <h2>Upgrade to Premium</h2>
        </div>
        <div class="upgrade-features">
          <h3>Unlock All Premium Features:</h3>
          <ul>
            <li>✓ Cloud Backup (Telegram, Google Drive, Dropbox)</li>
            <li>✓ Automatic Scheduled Backups</li>
            <li>✓ Password Encryption</li>
            <li>✓ Advanced Backup Frequencies</li>
            <li>✓ Extended Backup History</li>
            <li>✓ Priority Support</li>
          </ul>
        </div>
        <div class="pricing-options">
          <div class="price-card">
            <h4>Monthly</h4>
            <div class="price">$4.99<span>/month</span></div>
            <!-- Stripe subscription removed - crypto only -->
          </div>
          <div class="price-card featured">
            <div class="best-value">BEST VALUE</div>
            <h4>Yearly</h4>
            <div class="price">$29.99<span>/year</span></div>
            <div class="savings">Save 50%</div>
            <!-- Stripe subscription removed - crypto only -->
          </div>
        </div>
        <div class="payment-divider">
          <span>or pay with</span>
        </div>
        <div class="crypto-payment-options">
          <button class="crypto-btn" onclick="showCryptoPayment('bitcoin')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#f7931a">
              <path d="M11.5 11.5v-2c1.1 0 2-.9 2-2s-.9-2-2-2v-2c2.21 0 4 1.79 4 4s-1.79 4-4 4zm0 2c-2.21 0-4 1.79-4 4s1.79 4 4 4v-2c-1.1 0-2-.9-2-2s.9-2 2-2v2zm1-13.5v2.5h-1v-2.5h-2v2.5h-1v-2.5h-2v16h2v-2.5h1v2.5h2v-2.5h1v2.5h2v-16h-2z"/>
            </svg>
            Bitcoin
          </button>
          <button class="crypto-btn" onclick="showCryptoPayment('ethereum')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#627eea">
              <path d="M12 2l-8 10 8 4.8 8-4.8-8-10zm0 2.7l5.3 6.6-5.3 3.2-5.3-3.2 5.3-6.6zm0 8.5l-5.3 3.2 5.3 2.6 5.3-2.6-5.3-3.2z"/>
            </svg>
            Ethereum
          </button>
          <button class="crypto-btn" onclick="showCryptoPayment('usdt')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#26a17b">
              <path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10-10-4.48-10-10 4.48-10 10-10zm0 2c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 4v2h3v2h-3v4h-2v-4h-3v-2h3v-2h2z"/>
            </svg>
            USDT
          </button>
        </div>
        <div class="modal-footer">
          <p>7-day money back guarantee • Cancel anytime</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  modal.style.display = 'flex';
}

/**
 * Close upgrade modal
 */
function closeUpgradeModal() {
  const modal = document.getElementById('upgrade-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Stripe subscription removed - crypto only

// Stripe checkout removed - crypto only

/**
 * Show cryptocurrency payment modal
 */
function showCryptoPayment(crypto) {
  // Close upgrade modal first
  closeUpgradeModal();
  
  // Create crypto payment modal
  let cryptoModal = document.getElementById('crypto-modal');
  if (!cryptoModal) {
    cryptoModal = document.createElement('div');
    cryptoModal.id = 'crypto-modal';
    cryptoModal.className = 'crypto-modal';
    document.body.appendChild(cryptoModal);
  }
  
  const addresses = {
    bitcoin: {
      address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
      name: 'Bitcoin',
      color: '#f7931a',
      amount: '0.00150 BTC'
    },
    ethereum: {
      address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      name: 'Ethereum',
      color: '#627eea',
      amount: '0.020 ETH'
    },
    usdt: {
      address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
      name: 'USDT (TRC20)',
      color: '#26a17b',
      amount: '49.99 USDT'
    }
  };
  
  const cryptoInfo = addresses[crypto];
  
  cryptoModal.innerHTML = `
    <div class="crypto-modal-content">
      <button class="modal-close" onclick="closeCryptoModal()">×</button>
      <div class="crypto-header">
        <div class="crypto-icon" style="background: ${cryptoInfo.color}">
          ${getCryptoIcon(crypto)}
        </div>
        <h2>Pay with ${cryptoInfo.name}</h2>
      </div>
      
      <div class="crypto-amount">
        <label>Amount for Yearly Plan:</label>
        <div class="amount-display">${cryptoInfo.amount}</div>
        <div class="usd-equivalent">≈ $29.99 USD</div>
      </div>
      
      <div class="crypto-address">
        <label>Send to this address:</label>
        <div class="address-container">
          <input type="text" readonly value="${cryptoInfo.address}" id="crypto-address-input">
          <button onclick="copyCryptoAddress('${cryptoInfo.address}')" class="copy-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
      
      <div class="qr-code">
        <canvas id="qr-canvas"></canvas>
      </div>
      
      <div class="crypto-instructions">
        <h4>Instructions:</h4>
        <ol>
          <li>Send exactly <strong>${cryptoInfo.amount}</strong> to the address above</li>
          <li>After sending, click "I've Sent Payment" below</li>
          <li>Keep your transaction ID for verification</li>
          <li>Premium will activate within 1-2 confirmations</li>
        </ol>
      </div>
      
      <div class="crypto-actions">
        <button class="verify-payment-btn" onclick="verifyCryptoPayment('${crypto}')">
          I've Sent Payment
        </button>
        <button class="cancel-btn" onclick="closeCryptoModal()">
          Cancel
        </button>
      </div>
      
      <div class="crypto-warning">
        <strong>Important:</strong> Send exact amount to avoid delays. Network fees are separate.
      </div>
    </div>
  `;
  
  cryptoModal.style.display = 'flex';
  
  // Generate QR code (simplified - in production use a proper QR library)
  setTimeout(() => {
    generateQRCode(cryptoInfo.address);
  }, 100);
}

/**
 * Get crypto icon SVG
 */
function getCryptoIcon(crypto) {
  const icons = {
    bitcoin: '<svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M11.5 11.5v-2c1.1 0 2-.9 2-2s-.9-2-2-2v-2c2.21 0 4 1.79 4 4s-1.79 4-4 4zm0 2c-2.21 0-4 1.79-4 4s1.79 4 4 4v-2c-1.1 0-2-.9-2-2s.9-2 2-2v2zm1-13.5v2.5h-1v-2.5h-2v2.5h-1v-2.5h-2v16h2v-2.5h1v2.5h2v-2.5h1v2.5h2v-16h-2z"/></svg>',
    ethereum: '<svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M12 2l-8 10 8 4.8 8-4.8-8-10zm0 2.7l5.3 6.6-5.3 3.2-5.3-3.2 5.3-6.6zm0 8.5l-5.3 3.2 5.3 2.6 5.3-2.6-5.3-3.2z"/></svg>',
    usdt: '<svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M12 2c5.52 0 10 4.48 10 10s-4.48 10-10 10-10-4.48-10-10 4.48-10 10-10zm0 2c-4.42 0-8 3.58-8 8s3.58 8 8 8 8-3.58 8-8-3.58-8-8-8zm1 4v2h3v2h-3v4h-2v-4h-3v-2h3v-2h2z"/></svg>'
  };
  return icons[crypto] || '';
}

/**
 * Generate QR code for crypto address
 */
function generateQRCode(address) {
  const canvas = document.getElementById('qr-canvas');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  canvas.width = 200;
  canvas.height = 200;
  
  // Simplified QR placeholder - in production use qrcode.js library
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#000000';
  ctx.font = '12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('QR Code', 100, 100);
  ctx.font = '10px monospace';
  ctx.fillText('(Install QR library)', 100, 120);
}

/**
 * Copy crypto address to clipboard
 */
function copyCryptoAddress(address) {
  navigator.clipboard.writeText(address).then(() => {
    addToSuccessMessageList(createSuccess('Address copied to clipboard!'));
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

/**
 * Close crypto payment modal
 */
function closeCryptoModal() {
  const modal = document.getElementById('crypto-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Verify crypto payment
 */
async function verifyCryptoPayment(crypto) {
  // Show verification modal
  const verifyModal = document.createElement('div');
  verifyModal.className = 'verify-modal';
  verifyModal.innerHTML = `
    <div class="verify-content">
      <h3>Enter Transaction ID</h3>
      <input type="text" id="tx-id-input" placeholder="Transaction ID / Hash">
      <button onclick="submitCryptoVerification('${crypto}')">Verify Payment</button>
      <button onclick="this.parentElement.parentElement.remove()">Cancel</button>
    </div>
  `;
  document.getElementById('crypto-modal').appendChild(verifyModal);
}

/**
 * Submit crypto verification
 */
async function submitCryptoVerification(crypto) {
  const txId = document.getElementById('tx-id-input').value.trim();
  
  if (!txId) {
    addToWarningMessageList(createWarning('Please enter transaction ID'));
    return;
  }
  
  // Store transaction for verification
  chrome.storage.local.set({
    pendingCryptoPayment: {
      crypto: crypto,
      txId: txId,
      timestamp: Date.now()
    }
  });
  
  addToSuccessMessageList(createSuccess('Payment verification submitted! Premium will activate after confirmation.'));
  
  // In production, this would verify with blockchain API
  // For now, simulate activation after delay
  setTimeout(() => {
    activatePremiumSubscription('yearly', 'crypto');
  }, 3000);
  
  closeCryptoModal();
}

/**
 * Activate premium subscription
 */
async function activatePremiumSubscription(plan, method) {
  const expiryDate = new Date();
  if (plan === 'monthly') {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  } else {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  }
  
  await chrome.storage.local.set({
    [SUBSCRIPTION_STATUS_KEY]: 'active',
    [SUBSCRIPTION_EXPIRY_KEY]: expiryDate.toISOString(),
    subscriptionPlan: plan,
    paymentMethod: method
  });
  
  // Refresh UI
  displayTrialStatus();
  updatePremiumFeatureIndicators();
  
  addToSuccessMessageList(createSuccess('Premium activated! All features unlocked.'));
}

/**
 * Initialize subscription management
 */
async function initializeSubscriptionManagement() {
  // Check for subscription expiry on startup
  await checkSubscriptionExpiry();
  
  // Add account button to header if premium
  const hasPremium = await hasPremiumAccess();
  if (hasPremium) {
    addAccountButton();
  }
  
  // Track payment history
  await loadPaymentHistory();
}

/**
 * Check if subscription has expired and update status
 */
async function checkSubscriptionExpiry() {
  const result = await chrome.storage.local.get([SUBSCRIPTION_STATUS_KEY, SUBSCRIPTION_EXPIRY_KEY]);
  
  if (result[SUBSCRIPTION_STATUS_KEY] === 'active' && result[SUBSCRIPTION_EXPIRY_KEY]) {
    const expiryDate = new Date(result[SUBSCRIPTION_EXPIRY_KEY]);
    const now = new Date();
    
    if (now > expiryDate) {
      // Subscription expired
      await chrome.storage.local.set({
        [SUBSCRIPTION_STATUS_KEY]: 'expired',
        previousSubscription: {
          expiredAt: result[SUBSCRIPTION_EXPIRY_KEY],
          plan: result.subscriptionPlan
        }
      });
      
      addToWarningMessageList(createWarning('Your premium subscription has expired. Renew to continue using premium features.'));
    } else {
      // Check if expiring soon (within 3 days)
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 3) {
        addToWarningMessageList(createWarning(`Your subscription expires in ${daysUntilExpiry} days. Renew now to avoid interruption.`));
      }
    }
  }
}

/**
 * Add account management button to header
 */
function addAccountButton() {
  const headerControls = document.querySelector('.header-controls');
  if (!headerControls || document.getElementById('account-btn')) return;
  
  const accountBtn = document.createElement('button');
  accountBtn.id = 'account-btn';
  accountBtn.className = 'icon-toggle';
  accountBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
  `;
  accountBtn.title = 'Account';
  accountBtn.onclick = showAccountModal;
  
  headerControls.appendChild(accountBtn);
}

/**
 * Show account management modal
 */
async function showAccountModal() {
  const status = await getSubscriptionStatus();
  const history = await getPaymentHistory();
  const result = await chrome.storage.local.get(['subscriptionPlan', 'paymentMethod', SUBSCRIPTION_EXPIRY_KEY]);
  
  let modal = document.getElementById('account-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'account-modal';
    modal.className = 'account-modal';
    document.body.appendChild(modal);
  }
  
  const expiryDate = result[SUBSCRIPTION_EXPIRY_KEY] ? new Date(result[SUBSCRIPTION_EXPIRY_KEY]).toLocaleDateString() : 'N/A';
  const plan = result.subscriptionPlan || 'N/A';
  const method = result.paymentMethod || 'N/A';
  
  modal.innerHTML = `
    <div class="account-modal-content">
      <button class="modal-close" onclick="closeAccountModal()">×</button>
      <div class="account-header">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#10b981">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
        <h2>Account Management</h2>
      </div>
      
      <div class="subscription-info">
        <h3>Current Subscription</h3>
        <div class="info-grid">
          <div class="info-item">
            <label>Status:</label>
            <span class="status-${status.type}">${status.message}</span>
          </div>
          <div class="info-item">
            <label>Plan:</label>
            <span>${plan.charAt(0).toUpperCase() + plan.slice(1)}</span>
          </div>
          <div class="info-item">
            <label>Expires:</label>
            <span>${expiryDate}</span>
          </div>
          <div class="info-item">
            <label>Payment Method:</label>
            <span>${method.charAt(0).toUpperCase() + method.slice(1)}</span>
          </div>
        </div>
      </div>
      
      <div class="payment-history">
        <h3>Payment History</h3>
        <div class="history-list">
          ${history.length > 0 ? history.map(payment => `
            <div class="history-item">
              <div class="history-date">${new Date(payment.date).toLocaleDateString()}</div>
              <div class="history-details">
                <span class="history-plan">${payment.plan}</span>
                <span class="history-amount">$${payment.amount}</span>
              </div>
              <div class="history-status status-${payment.status}">${payment.status}</div>
            </div>
          `).join('') : '<div class="empty-history">No payment history</div>'}
        </div>
      </div>
      
      <div class="account-actions">
        ${status.type === 'expired' || status.type === 'trial' ? 
          `<button class="renew-btn" onclick="showUpgradeModal()">
            ${status.type === 'expired' ? 'Renew Subscription' : 'Upgrade to Premium'}
          </button>` : 
          `<button class="manage-btn" onclick="openBillingPortal()">Manage Billing</button>`
        }
      </div>
      
      <div class="account-footer">
        <p>Need help? Contact support@cookievault.io</p>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

/**
 * Close account modal
 */
function closeAccountModal() {
  const modal = document.getElementById('account-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load payment history
 */
async function loadPaymentHistory() {
  const result = await chrome.storage.local.get(['paymentHistory']);
  return result.paymentHistory || [];
}

/**
 * Get payment history
 */
async function getPaymentHistory() {
  const result = await chrome.storage.local.get(['paymentHistory']);
  return result.paymentHistory || [];
}

/**
 * Add payment to history
 */
async function addPaymentToHistory(payment) {
  const history = await getPaymentHistory();
  history.unshift({
    date: new Date().toISOString(),
    plan: payment.plan,
    amount: payment.amount,
    status: 'completed',
    method: payment.method,
    transactionId: payment.transactionId
  });
  
  // Keep only last 10 payments
  if (history.length > 10) {
    history.length = 10;
  }
  
  await chrome.storage.local.set({ paymentHistory: history });
}

/**
 * Show payment history (crypto payments only)
 */
function openBillingPortal() {
  // Show account management for crypto payments
  if (typeof showAccountManagement === 'function') {
    showAccountManagement();
  } else {
    showAccountModal();
  }
}

/**
 * Handle successful payment callback
 */
async function handlePaymentSuccess(sessionId, plan, method) {
  // Verify payment with backend (in production)
  // For now, activate premium directly
  
  const amount = plan === 'monthly' ? 4.99 : 29.99;
  
  // Add to payment history
  await addPaymentToHistory({
    plan: plan,
    amount: amount,
    method: method,
    transactionId: sessionId
  });
  
  // Activate premium
  await activatePremiumSubscription(plan, method);
  
  // Refresh account button
  addAccountButton();
}

/**
 * Setup payment validation listener
 */
function setupPaymentValidation() {
  // Listen for successful payment redirect
  const urlParams = new URLSearchParams(window.location.search);
  const success = urlParams.get('payment_success');
  const sessionId = urlParams.get('session_id');
  const plan = urlParams.get('plan');
  
  if (success === 'true' && sessionId && plan) {
    // Stripe payment validation removed - crypto only
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Make functions globally accessible for onclick handlers
window.showUpgradeModal = showUpgradeModal;
window.closeUpgradeModal = closeUpgradeModal;
// window.subscribePlan removed - crypto only
window.showCryptoPayment = showCryptoPayment;
window.closeCryptoModal = closeCryptoModal;
window.copyCryptoAddress = copyCryptoAddress;
window.verifyCryptoPayment = verifyCryptoPayment;
window.submitCryptoVerification = submitCryptoVerification;
window.showAccountModal = showAccountModal;
window.closeAccountModal = closeAccountModal;
window.openBillingPortal = openBillingPortal;

// --- CLOUD SECTION FUNCTIONALITY ---

function updateCloudStatus() {
  // This function is now deprecated since Telegram config moved to Cloud tab
  // The status is handled directly in the Telegram card UI
}

function updateCloudBackupsList() {
  const cloudBackupsList = document.getElementById("cloud-backups-list");
  
  if (cloudBackupsList) {
    cloudBackupsList.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-state';
    loadingDiv.textContent = 'Checking cloud backups...';
    cloudBackupsList.appendChild(loadingDiv);
    
    // Simulate checking for cloud backups (this would be actual API calls in production)
    setTimeout(() => {
      // For now, show empty state since there's no actual cloud storage implementation
      cloudBackupsList.textContent = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.textContent = 'No cloud backups found';
      cloudBackupsList.appendChild(emptyDiv);
    }, 1000);
  }
}

// --- TELEGRAM CREDENTIALS STORAGE ---

// Storage keys for Telegram credentials
const TELEGRAM_STORAGE_KEYS = {
  BOT_TOKEN: "telegramBotToken",
  CHAT_ID: "telegramChatId"
};

// Save Telegram credentials to storage
function saveTelegramCredentials(botToken, chatId) {
  // Clear previous messages
  const messages = document.getElementById("messages");
  const warnings = document.getElementById("warnings");
  if (messages) {
    messages.textContent = "";
  }
  if (warnings) {
    warnings.textContent = "";
  }
  
  // Input validation for bot token and chat ID
  // Bot tokens are typically in format: 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
  const botTokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
  if (!botToken || !botTokenRegex.test(botToken)) {
    addToWarningMessageList(createWarning("Bot token format is invalid. It should be in format: 123456:ABC-DEF1234ghIkl"));
    return false;
  }

  // Chat IDs are numeric (can be negative for groups)
  if (!chatId || !/^-?\d+$/.test(chatId)) {
    addToWarningMessageList(createWarning("Chat ID must be a number (can be negative for groups)."));
    return false;
  }

  // Additional length validation - tokens can vary from ~40 to 60+ characters
  if (botToken.length < 35 || botToken.length > 70) {
    addToWarningMessageList(createWarning("Bot token length seems unusual. Please verify your token."));
    // Don't return false - let Telegram API validate it
  }

  const credentials = {
    botToken: botToken,
    chatId: chatId,
    timestamp: Date.now()
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [TELEGRAM_STORAGE_KEYS.BOT_TOKEN]: credentials }, () => {
      // Telegram credentials saved successfully
      addToSuccessMessageList(createSuccessAlert("✅ Telegram credentials saved successfully!"));
    });
  } else {
    // Fallback for web environment
    try {
      localStorage.setItem(TELEGRAM_STORAGE_KEYS.BOT_TOKEN, JSON.stringify(credentials));
      // Telegram credentials saved to localStorage
      addToSuccessMessageList(createSuccessAlert("✅ Telegram credentials saved successfully!"));
    } catch (e) {
      // Error saving to localStorage
      addToWarningMessageList(createWarning("❌ Error saving Telegram credentials"));
      return false;
    }
  }

  return true;
}

// Load Telegram credentials from storage
function loadTelegramCredentials(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([TELEGRAM_STORAGE_KEYS.BOT_TOKEN], (result) => {
      const credentials = result[TELEGRAM_STORAGE_KEYS.BOT_TOKEN];
      if (credentials && credentials.botToken && credentials.chatId) {
        callback(credentials.botToken, credentials.chatId);
      } else {
        callback(null, null);
      }
    });
  } else {
    // Fallback for web environment - use localStorage
    try {
      const stored = localStorage.getItem(TELEGRAM_STORAGE_KEYS.BOT_TOKEN);
      if (stored) {
        const credentials = JSON.parse(stored);
        if (credentials && credentials.botToken && credentials.chatId) {
          callback(credentials.botToken, credentials.chatId);
        } else {
          callback(null, null);
        }
      } else {
        callback(null, null);
      }
    } catch (e) {
      // Error loading from localStorage
      callback(null, null);
    }
  }
}

// Mask bot token for security display (shows first 4 and last 4 characters)
function maskBotToken(token) {
  if (!token || token.length < 8) return token;
  return token.substring(0, 4) + "..." + token.substring(token.length - 4);
}

function loadAutoBackupSettings() {
    // Check if Chrome APIs are available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(["autoBackupSchedule", "autoTelegramBackup"], (result) => {
            if (chrome.runtime.lastError) {
                // Error loading auto backup settings
                return;
            }
            const schedule = result.autoBackupSchedule || "disabled";
            const autoTelegram = result.autoTelegramBackup || false;

            scheduleSelect.value = schedule;
            autoTelegramBackupCheckbox.checked = autoTelegram;

            updateStatusText();
            
            // Update Status Overview to show specific frequency
            const statusDash = document.getElementById('auto-backup-status-dash');
            if (statusDash) {
                if (schedule === "disabled") {
                    statusDash.textContent = "Disabled";
                } else {
                    let frequencyText = "";
                    switch (schedule) {
                        case "15min":
                            frequencyText = "Every 15 minutes";
                            break;
                        case "30min":
                            frequencyText = "Every 30 minutes";
                            break;
                        case "hourly":
                            frequencyText = "Every hour";
                            break;
                        case "2hours":
                            frequencyText = "Every 2 hours";
                            break;
                        case "6hours":
                            frequencyText = "Every 6 hours";
                            break;
                        case "12hours":
                            frequencyText = "Every 12 hours";
                            break;
                        case "daily":
                            frequencyText = "Daily";
                            break;
                        case "weekly":
                            frequencyText = "Weekly";
                            break;
                        default:
                            frequencyText = "Enabled";
                    }
                    statusDash.textContent = frequencyText;
                }
            }
        });
    } else {
        // Fallback for web environment
        // Chrome storage API not available - using localStorage fallback
        try {
            const schedule = localStorage.getItem('autoBackupSchedule') || 'disabled';
            const autoTelegram = localStorage.getItem('autoTelegramBackup') === 'true';

            scheduleSelect.value = schedule;
            autoTelegramBackupCheckbox.checked = autoTelegram;

            updateStatusText();
            
            // Update Status Overview to show specific frequency (localStorage fallback)
            const statusDash = document.getElementById('auto-backup-status-dash');
            if (statusDash) {
                if (schedule === "disabled") {
                    statusDash.textContent = "Disabled";
                } else {
                    let frequencyText = "";
                    switch (schedule) {
                        case "15min":
                            frequencyText = "Every 15 minutes";
                            break;
                        case "30min":
                            frequencyText = "Every 30 minutes";
                            break;
                        case "hourly":
                            frequencyText = "Every hour";
                            break;
                        case "2hours":
                            frequencyText = "Every 2 hours";
                            break;
                        case "6hours":
                            frequencyText = "Every 6 hours";
                            break;
                        case "12hours":
                            frequencyText = "Every 12 hours";
                            break;
                        case "daily":
                            frequencyText = "Daily";
                            break;
                        case "weekly":
                            frequencyText = "Weekly";
                            break;
                        default:
                            frequencyText = "Enabled";
                    }
                    statusDash.textContent = frequencyText;
                }
            }
            
            addToWarningMessageList(createWarning('Running in preview mode - automatic backup scheduling requires Chrome extension.'));
        } catch (e) {
            // Error loading from localStorage
        }
    }

    // Load Telegram credentials
    loadTelegramCredentials((botToken, chatId) => {
        if (botToken && chatId) {
            // Store actual values in hidden data attributes for form submission
            const tokenInput = document.getElementById("telegram-bot-token");
            const chatInput = document.getElementById("telegram-chat-id");

            tokenInput.setAttribute("data-actual-token", botToken);
            chatInput.setAttribute("data-actual-chat-id", chatId);

            // Show masked values in the visible form fields
            tokenInput.value = maskBotToken(botToken);
            chatInput.value = chatId; // Chat ID can be shown as-is

            // Add visual indicator that saved credentials are loaded
            addToSuccessMessageList(createSuccessAlert("Using saved Telegram credentials"));

            // Telegram credentials loaded from storage
        }
    });
    
    // Initialize Telegram credentials section visibility
    const credentialsWrap = document.getElementById("telegram-credentials-wrap");
    if (credentialsWrap && autoTelegramBackupCheckbox) {
        if (autoTelegramBackupCheckbox.checked) {
            credentialsWrap.style.display = "block";
            credentialsWrap.classList.remove("disabled");
        } else {
            credentialsWrap.style.display = "none";
            credentialsWrap.classList.add("disabled");
        }
    }
}

function handleAutoTelegramBackupChange() {
    const autoTelegram = autoTelegramBackupCheckbox.checked;
    
    // Toggle credentials section visibility
    const credentialsWrap = document.getElementById("telegram-credentials-wrap");
    if (credentialsWrap) {
        if (autoTelegram) {
            credentialsWrap.classList.remove("disabled");
            credentialsWrap.style.display = "block";
        } else {
            credentialsWrap.classList.add("disabled");
            setTimeout(() => {
                if (!autoTelegramBackupCheckbox.checked) {
                    credentialsWrap.style.display = "none";
                }
            }, 300);
        }
    }
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ autoTelegramBackup: autoTelegram }, () => {
            if (chrome.runtime.lastError) {
                // Error saving Telegram backup setting
                return;
            }
            // Auto Telegram backup setting saved
            updateStatusText();
        });
    } else {
        // Fallback for web environment
        try {
            localStorage.setItem('autoTelegramBackup', autoTelegram.toString());
            // Auto Telegram backup setting saved to localStorage
            updateStatusText();
        } catch (e) {
            // Error saving to localStorage
        }
    }
}

// Additional initialization (already handled in main DOMContentLoaded above)

// Add other event listeners
// These event listeners are now handled in the DOMContentLoaded event above

async function handleScheduleChange() {
    // Ensure scheduleSelect is available
    if (!scheduleSelect) {
        scheduleSelect = document.getElementById("auto-backup-schedule");
        if (!scheduleSelect) {
            console.error('Auto backup schedule element not found');
            return;
        }
    }
    const selectedSchedule = scheduleSelect.value;
    
    // Check if auto backup feature is available (except for disabled)
    if (selectedSchedule !== 'disabled') {
        const autoBackupAvailable = await isFeatureAvailable('auto_backup');
        
        if (!autoBackupAvailable) {
            showUpgradeModal();
            scheduleSelect.value = 'disabled';
            saveSettingsAndUpdateStatus('disabled');
            return;
        }
        
        // Check for advanced frequencies
        if (['15min', '30min'].includes(selectedSchedule)) {
            const advancedFrequencyAvailable = await isFeatureAvailable('advanced_frequency');
            if (!advancedFrequencyAvailable) {
                showUpgradeModal();
                scheduleSelect.value = 'disabled';
                saveSettingsAndUpdateStatus('disabled');
                return;
            }
        }
    }
    
    // IMMEDIATELY update the status text and save settings - no delay!
    saveSettingsAndUpdateStatus(selectedSchedule);
    
    // Also immediately update the status in Status Overview section with specific frequency
    const statusDash = document.getElementById('auto-backup-status-dash');
    if (statusDash) {
        if (selectedSchedule === "disabled") {
            statusDash.textContent = "Disabled";
        } else {
            // Show the actual frequency selected
            let frequencyText = "";
            switch (selectedSchedule) {
                case "15min":
                    frequencyText = "Every 15 minutes";
                    break;
                case "30min":
                    frequencyText = "Every 30 minutes";
                    break;
                case "hourly":
                    frequencyText = "Every hour";
                    break;
                case "2hours":
                    frequencyText = "Every 2 hours";
                    break;
                case "6hours":
                    frequencyText = "Every 6 hours";
                    break;
                case "12hours":
                    frequencyText = "Every 12 hours";
                    break;
                case "daily":
                    frequencyText = "Daily";
                    break;
                case "weekly":
                    frequencyText = "Weekly";
                    break;
                default:
                    frequencyText = "Enabled";
            }
            statusDash.textContent = frequencyText;
        }
    }

    // Check if Chrome alarms API is available
    if (typeof chrome !== 'undefined' && chrome.alarms) {
        chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
            if (chrome.runtime.lastError) {
                // Error clearing alarm
                addToWarningMessageList(createWarning('Error managing backup schedule. Please try again.'));
                return;
            }

            // Previous alarm cleared

            if (selectedSchedule === "disabled") {
                // Status already updated above, just return
                return;
            }

            if (selectedSchedule === "15min") {
                setupIntervalBackup(15, "15 minutes");
            } else if (selectedSchedule === "30min") {
                setupIntervalBackup(30, "30 minutes");
            } else if (selectedSchedule === "hourly") {
                setupHourlyBackup();
            } else if (selectedSchedule === "2hours") {
                setupIntervalBackup(120, "2 hours");
            } else if (selectedSchedule === "6hours") {
                setupIntervalBackup(360, "6 hours");
            } else if (selectedSchedule === "12hours") {
                setupIntervalBackup(720, "12 hours");
            } else if (selectedSchedule === "daily") {
                setupDailyBackup();
            } else if (selectedSchedule === "weekly") {
                setupWeeklyBackup();
            }
        });
    } else {
        // Fallback for web environment - show informational message
        addToWarningMessageList(createWarning('Automatic backup scheduling is only available when running as a Chrome extension.'));
        // Status already updated above
    }
}



function setupIntervalBackup(intervalMinutes, displayName) {
    // Check if Chrome alarms API is available
    if (typeof chrome !== 'undefined' && chrome.alarms) {
        // Create alarm that repeats at specified interval
        chrome.alarms.create(ALARM_NAME, {
            delayInMinutes: 1, // Start in 1 minute
            periodInMinutes: intervalMinutes
        }, () => {
            if (chrome.runtime.lastError) {
                // Error creating alarm - log details and show user-friendly message
                console.error('Error creating alarm:', chrome.runtime.lastError);
                addToWarningMessageList(createWarning(`Error setting up ${displayName} backup: ${chrome.runtime.lastError.message}. Please try again.`));
                // Reset the schedule to disabled since alarm creation failed
                scheduleSelect.value = 'disabled';
                return;
            }
            // Backup schedule set - status already updated in handleScheduleChange
        });
    } else {
        // Fallback for web environment
        addToWarningMessageList(createWarning('Automatic scheduling not available in web preview mode.'));
        // Status already updated in handleScheduleChange
    }
}

function setupHourlyBackup() {
    setupIntervalBackup(60, "Hourly");
}

function setupDailyBackup() {
    // Check if Chrome alarms API is available
    if (typeof chrome !== 'undefined' && chrome.alarms) {
        // Create alarm that repeats every 24 hours
        chrome.alarms.create(ALARM_NAME, {
            delayInMinutes: 1, // Start in 1 minute
            periodInMinutes: 24 * 60 // Repeat every 24 hours
        }, () => {
            if (chrome.runtime.lastError) {
                // Error creating daily alarm - log details and show user-friendly message
                console.error('Error creating daily alarm:', chrome.runtime.lastError);
                addToWarningMessageList(createWarning(`Error setting up daily backup: ${chrome.runtime.lastError.message}. Please try again.`));
                // Reset the schedule to disabled since alarm creation failed
                scheduleSelect.value = 'disabled';
                return;
            }
            // Daily backup schedule set - status already updated in handleScheduleChange
        });
    } else {
        // Fallback for web environment
        addToWarningMessageList(createWarning('Automatic scheduling not available in web preview mode.'));
        // Status already updated in handleScheduleChange
    }
}

function setupWeeklyBackup() {
    // Check if Chrome alarms API is available
    if (typeof chrome !== 'undefined' && chrome.alarms) {
        // Create alarm that repeats every 7 days
        chrome.alarms.create(ALARM_NAME, {
            delayInMinutes: 1, // Start in 1 minute
            periodInMinutes: 7 * 24 * 60 // Repeat every 7 days
        }, () => {
            if (chrome.runtime.lastError) {
                // Error creating weekly alarm - log details and show user-friendly message
                console.error('Error creating weekly alarm:', chrome.runtime.lastError);
                addToWarningMessageList(createWarning(`Error setting up weekly backup: ${chrome.runtime.lastError.message}. Please try again.`));
                // Reset the schedule to disabled since alarm creation failed
                scheduleSelect.value = 'disabled';
                return;
            }
            // Weekly backup schedule set - status already updated in handleScheduleChange
        });
    } else {
        // Fallback for web environment
        addToWarningMessageList(createWarning('Automatic scheduling not available in web preview mode.'));
        // Status already updated in handleScheduleChange
    }
}

function saveSettingsAndUpdateStatus(schedule) {
    const settings = { autoBackupSchedule: schedule };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set(settings, () => {
            if (chrome.runtime.lastError) {
                // Error saving settings
                return;
            }
            // Auto-backup schedule saved
            updateStatusText();
        });
    } else {
        // Fallback for web environment
        try {
            localStorage.setItem('autoBackupSchedule', schedule);
            // Auto-backup schedule saved to localStorage
            updateStatusText();
        } catch (e) {
            // Error saving to localStorage
        }
    }
}

function updateStatusText() {
    if (!scheduleSelect || !autoTelegramBackupCheckbox || !statusText) {
        return;
    }
    
    const schedule = scheduleSelect.value;
    const autoTelegram = autoTelegramBackupCheckbox.checked;

    if (schedule === "disabled") {
        statusText.textContent = "Automatic backup is disabled";
    } else {
        let status;
        switch (schedule) {
            case "15min":
                status = "Automatic backup scheduled for every 15 minutes";
                break;
            case "30min":
                status = "Automatic backup scheduled for every 30 minutes";
                break;
            case "hourly":
                status = "Automatic backup scheduled for every hour";
                break;
            case "2hours":
                status = "Automatic backup scheduled for every 2 hours";
                break;
            case "6hours":
                status = "Automatic backup scheduled for every 6 hours";
                break;
            case "12hours":
                status = "Automatic backup scheduled for every 12 hours";
                break;
            case "daily":
                status = "Automatic backup scheduled for every day";
                break;
            case "weekly":
                status = "Automatic backup scheduled for every week";
                break;
            default:
                status = "Automatic backup is configured";
        }
        
        if (autoTelegram) {
            status += " + Telegram";
        }
        statusText.textContent = status;
    }
}