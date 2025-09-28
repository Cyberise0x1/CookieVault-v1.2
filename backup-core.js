/**
 * Backup Core Module
 * Handles all cookie backup and restore functionality
 */

// Global variables for backup operations
let cookieFile = null;
let selectedDomainCookies = [];

/**
 * Manual cookie backup function
 */
async function manualCookieBackup() {
  const profileName = document.getElementById('profile-name-input')?.value?.trim() || '';
  const passwordInput = document.getElementById("password");
  const password = passwordInput?.value;
  
  if (!password) {
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning("Please enter a password for encryption"));
    }
    return;
  }
  
  try {
    // Get all cookies
    const cookies = await chrome.cookies.getAll({});
    
    if (cookies.length === 0) {
      if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
        addToWarningMessageList(createWarning("No cookies found to backup"));
      }
      return;
    }
    
    // Create timestamp
    const date = new Date();
    const timestamp = formatDate(date);
    
    // Create filename with profile name if provided
    let filename = profileName ? 
      `cookies-${profileName}-${timestamp}.ckz` : 
      `cookies-${timestamp}.ckz`;
    
    // Encrypt cookies
    const encryptedData = sjcl.encrypt(password, JSON.stringify(cookies));
    
    // Create download
    const blob = new Blob([encryptedData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
          addToWarningMessageList(createWarning("Download failed: " + chrome.runtime.lastError.message));
        }
      } else {
        if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
          addToSuccessMessageList(createSuccessAlert(`✅ Backup saved as ${filename}`));
        }
        
        // Clear password field
        if (passwordInput) passwordInput.value = '';
        
        // Check if should also send to Telegram
        const sendToTelegram = document.getElementById('also-send-telegram')?.checked;
        if (sendToTelegram) {
          sendBackupToTelegram(encryptedData, filename);
        }
        
        // Add to backup history
        addToBackupHistory('manual', filename, cookies.length);
      }
    });
    
    // Save profile name for next time
    if (profileName && window.secureStorage) {
      window.secureStorage.set('savedProfileName', profileName);
    }
    
  } catch (error) {
    console.error('Backup failed:', error);
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning("Backup failed: " + error.message));
    }
  }
}

/**
 * Automatic cookie backup function
 */
async function automaticCookieBackup() {
  try {
    const cookies = await chrome.cookies.getAll({});
    
    if (cookies.length === 0) {
      console.log('No cookies to backup');
      return;
    }
    
    // Get profile name if set
    const profileName = await window.secureStorage?.get('savedProfileName') || '';
    
    // Create timestamp
    const date = new Date();
    const timestamp = formatDate(date);
    
    // Create filename with profile name if provided
    let filename = profileName ? 
      `cookies-auto-${profileName}-${timestamp}.json` : 
      `cookies-auto-${timestamp}.json`;
    
    // Save to browser storage (no encryption for auto-backups)
    const backupData = {
      timestamp: date.toISOString(),
      profileName: profileName,
      cookieCount: cookies.length,
      cookies: cookies
    };
    
    // Store in chrome.storage.local
    const backupKey = `backup_${Date.now()}`;
    const storageData = {};
    storageData[backupKey] = backupData;
    
    await chrome.storage.local.set(storageData);
    
    // Check if should send to Telegram
    const autoTelegramEnabled = await window.secureStorage?.get('autoTelegramBackup');
    if (autoTelegramEnabled) {
      // For Telegram, we'll encrypt it
      const simplePassword = 'auto_backup_' + date.toISOString().split('T')[0];
      const encryptedData = sjcl.encrypt(simplePassword, JSON.stringify(cookies));
      sendBackupToTelegram(encryptedData, filename.replace('.json', '.ckz'));
    }
    
    // Add to backup history
    addToBackupHistory('automatic', filename, cookies.length);
    
    console.log('Automatic backup completed:', filename);
    
  } catch (error) {
    console.error('Automatic backup failed:', error);
  }
}

/**
 * Restore cookies from backup
 */
async function restoreCookies(cookieData, password = null) {
  try {
    let cookies;
    
    // Try to decrypt if password provided
    if (password) {
      try {
        const decryptedData = sjcl.decrypt(password, cookieData);
        cookies = JSON.parse(decryptedData);
      } catch (e) {
        throw new Error('Invalid password or corrupted backup file');
      }
    } else {
      // Try to parse as plain JSON
      cookies = JSON.parse(cookieData);
    }
    
    if (!Array.isArray(cookies)) {
      throw new Error('Invalid backup format');
    }
    
    // Clear existing cookies if requested
    const clearExisting = document.getElementById('clear-existing-cookies')?.checked;
    if (clearExisting) {
      const existingCookies = await chrome.cookies.getAll({});
      for (const cookie of existingCookies) {
        await chrome.cookies.remove({
          url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
          name: cookie.name
        });
      }
    }
    
    // Restore cookies
    let successCount = 0;
    let failCount = 0;
    
    for (const cookie of cookies) {
      try {
        const newCookie = {
          url: `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite || 'lax',
          expirationDate: cookie.expirationDate
        };
        
        await chrome.cookies.set(newCookie);
        successCount++;
      } catch (e) {
        console.error('Failed to restore cookie:', cookie.name, e);
        failCount++;
      }
    }
    
    // Show results
    if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
      addToSuccessMessageList(createSuccessAlert(
        `✅ Restored ${successCount} cookies${failCount > 0 ? ` (${failCount} failed)` : ''}`
      ));
    }
    
    return { success: successCount, failed: failCount };
    
  } catch (error) {
    console.error('Restore failed:', error);
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning("Restore failed: " + error.message));
    }
    throw error;
  }
}

/**
 * Send backup to Telegram
 */
async function sendBackupToTelegram(encryptedData, filename) {
  try {
    // Get Telegram credentials
    const credentials = await window.secureStorage?.getTelegramCredentials();
    
    if (!credentials || !credentials.botToken || !credentials.chatId) {
      console.log('Telegram credentials not configured');
      return;
    }
    
    // Send via background script
    chrome.runtime.sendMessage({
      action: 'sendToTelegram',
      botToken: credentials.botToken,
      chatId: credentials.chatId,
      filename: filename,
      data: encryptedData
    }, (response) => {
      if (response?.success) {
        if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
          addToSuccessMessageList(createSuccessAlert('✅ Backup sent to Telegram'));
        }
      } else {
        console.error('Telegram send failed:', response?.error);
      }
    });
    
  } catch (error) {
    console.error('Failed to send to Telegram:', error);
  }
}

/**
 * Selective cookie backup
 */
async function selectiveCookieBackup() {
  try {
    // Check if feature is available
    if (typeof isFeatureAvailable === 'function') {
      const available = await isFeatureAvailable('selective_backup');
      if (!available) {
        if (typeof showUpgradeModal === 'function') {
          showUpgradeModal();
        }
        return;
      }
    }
    
    // Get all cookies
    const cookies = await chrome.cookies.getAll({});
    
    // Group by domain
    const cookiesByDomain = {};
    cookies.forEach(cookie => {
      const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
      if (!cookiesByDomain[domain]) {
        cookiesByDomain[domain] = [];
      }
      cookiesByDomain[domain].push(cookie);
    });
    
    // Show selection modal
    showCookieSelectionModal(cookiesByDomain);
    
  } catch (error) {
    console.error('Selective backup failed:', error);
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning("Failed to load cookies: " + error.message));
    }
  }
}

/**
 * Show cookie selection modal
 */
function showCookieSelectionModal(cookiesByDomain) {
  const modal = document.getElementById('cookie-selection-modal');
  const cookieList = document.getElementById('cookie-list');
  
  if (!modal || !cookieList) return;
  
  // Clear existing content
  cookieList.innerHTML = '';
  
  // Create domain groups
  Object.keys(cookiesByDomain).sort().forEach(domain => {
    const domainGroup = document.createElement('div');
    domainGroup.className = 'domain-group';
    
    const domainHeader = document.createElement('div');
    domainHeader.className = 'domain-header';
    domainHeader.innerHTML = `
      <label>
        <input type="checkbox" class="domain-checkbox" data-domain="${domain}">
        <span class="domain-name">${domain}</span>
        <span class="cookie-count">(${cookiesByDomain[domain].length} cookies)</span>
      </label>
    `;
    
    domainGroup.appendChild(domainHeader);
    cookieList.appendChild(domainGroup);
  });
  
  // Show modal
  modal.style.display = 'flex';
  
  // Setup event handlers
  setupCookieSelectionHandlers(cookiesByDomain);
}

/**
 * Setup cookie selection event handlers
 */
function setupCookieSelectionHandlers(cookiesByDomain) {
  // Select all handler
  const selectAllBtn = document.getElementById('select-all-cookies');
  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      document.querySelectorAll('.domain-checkbox').forEach(cb => cb.checked = true);
      updateSelectedCount();
    };
  }
  
  // Deselect all handler
  const deselectAllBtn = document.getElementById('deselect-all-cookies');
  if (deselectAllBtn) {
    deselectAllBtn.onclick = () => {
      document.querySelectorAll('.domain-checkbox').forEach(cb => cb.checked = false);
      updateSelectedCount();
    };
  }
  
  // Backup selected handler
  const backupSelectedBtn = document.getElementById('backup-selected-cookies');
  if (backupSelectedBtn) {
    backupSelectedBtn.onclick = () => {
      backupSelectedCookies(cookiesByDomain);
    };
  }
  
  // Domain checkbox change handler
  document.querySelectorAll('.domain-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateSelectedCount);
  });
  
  // Search handler
  const searchInput = document.getElementById('cookie-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      document.querySelectorAll('.domain-group').forEach(group => {
        const domain = group.querySelector('.domain-name').textContent.toLowerCase();
        group.style.display = domain.includes(query) ? 'block' : 'none';
      });
    });
  }
  
  updateSelectedCount();
}

/**
 * Update selected cookie count
 */
function updateSelectedCount() {
  const selectedCount = document.querySelectorAll('.domain-checkbox:checked').length;
  const countElement = document.getElementById('selected-count');
  if (countElement) {
    countElement.textContent = selectedCount;
  }
}

/**
 * Backup selected cookies
 */
async function backupSelectedCookies(cookiesByDomain) {
  const selectedDomains = Array.from(document.querySelectorAll('.domain-checkbox:checked'))
    .map(cb => cb.dataset.domain);
  
  if (selectedDomains.length === 0) {
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning("Please select at least one domain"));
    }
    return;
  }
  
  // Collect selected cookies
  const selectedCookies = [];
  selectedDomains.forEach(domain => {
    selectedCookies.push(...cookiesByDomain[domain]);
  });
  
  // Close modal
  const modal = document.getElementById('cookie-selection-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  
  // Proceed with backup
  selectedDomainCookies = selectedCookies;
  
  // Show password prompt
  const passwordSection = document.querySelector('.password-section');
  if (passwordSection) {
    passwordSection.style.display = 'block';
  }
  
  if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
    addToSuccessMessageList(createSuccessAlert(
      `Selected ${selectedCookies.length} cookies from ${selectedDomains.length} domains`
    ));
  }
}

/**
 * Add entry to backup history
 */
async function addToBackupHistory(type, filename, cookieCount) {
  try {
    const history = await chrome.storage.local.get(['backupHistory']);
    const backupHistory = history.backupHistory || [];
    
    backupHistory.unshift({
      timestamp: new Date().toISOString(),
      type: type,
      filename: filename,
      cookieCount: cookieCount
    });
    
    // Keep only last 50 entries
    if (backupHistory.length > 50) {
      backupHistory.length = 50;
    }
    
    await chrome.storage.local.set({ backupHistory: backupHistory });
    
  } catch (error) {
    console.error('Failed to update backup history:', error);
  }
}

/**
 * Format date for filenames
 */
function formatDate(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  
  return [
    pad(date.getDate()),
    pad(date.getMonth() + 1),
    date.getFullYear(),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('-');
}

/**
 * Handle file selection for restore
 */
function handleFileSelection(file) {
  cookieFile = file;
  
  const fileInfo = document.getElementById('file-info');
  if (fileInfo) {
    fileInfo.innerHTML = `
      <div class="file-selected">
        <span class="file-icon">📄</span>
        <span class="file-name">${file.name}</span>
        <span class="file-size">(${formatFileSize(file.size)})</span>
      </div>
    `;
  }
  
  // Show password input if .ckz file
  if (file.name.endsWith('.ckz')) {
    const restorePasswordSection = document.getElementById('restore-password-section');
    if (restorePasswordSection) {
      restorePasswordSection.style.display = 'block';
    }
  }
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    manualCookieBackup,
    automaticCookieBackup,
    restoreCookies,
    sendBackupToTelegram,
    selectiveCookieBackup,
    showCookieSelectionModal,
    setupCookieSelectionHandlers,
    updateSelectedCount,
    backupSelectedCookies,
    addToBackupHistory,
    formatDate,
    handleFileSelection,
    formatFileSize,
    cookieFile,
    selectedDomainCookies
  };
}