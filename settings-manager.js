/**
 * Settings Manager Module
 * Import/Export extension settings and configurations
 */

/**
 * Get all extension settings
 */
async function getAllSettings() {
  try {
    // Get settings from chrome.storage
    const localStorage = await chrome.storage.local.get(null);
    const syncStorage = await chrome.storage.sync.get(null);
    
    // Get specific settings
    const settings = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      
      // Theme and UI preferences
      theme: localStorage.theme || 'light',
      compactMode: localStorage.compactMode || false,
      
      // Backup preferences
      autoBackupEnabled: localStorage.autoBackupEnabled || false,
      autoBackupSchedule: localStorage.autoBackupSchedule || 'daily',
      defaultProfileName: localStorage.savedProfileName || '',
      
      // Telegram settings (encrypted)
      telegramConfigured: !!(syncStorage.telegram_bot_token && syncStorage.telegram_chat_id),
      autoTelegramBackup: localStorage.autoTelegramBackup || false,
      
      // Backup profiles
      backupProfiles: localStorage.backupProfiles || {},
      activeProfileId: localStorage.activeProfileId || null,
      
      // Backup history
      backupHistory: localStorage.backupHistory || [],
      
      // Trial and subscription info (read-only, not exported)
      // trialStartDate: localStorage.trialStartDate,
      // subscriptionStatus: localStorage.subscriptionStatus,
      
      // Custom domain filters
      includedDomains: localStorage.includedDomains || [],
      excludedDomains: localStorage.excludedDomains || [],
      
      // Advanced settings
      encryptionMethod: localStorage.encryptionMethod || 'standard',
      keyDerivationIterations: localStorage.keyDerivationIterations || 1000,
      autoDeleteOldBackups: localStorage.autoDeleteOldBackups || false,
      maxBackupAge: localStorage.maxBackupAge || 30, // days
      
      // Statistics
      totalBackups: localStorage.totalBackups || 0,
      totalRestores: localStorage.totalRestores || 0,
      lastBackupDate: localStorage.lastBackupDate || null,
      lastRestoreDate: localStorage.lastRestoreDate || null
    };
    
    return settings;
  } catch (error) {
    console.error('Error getting settings:', error);
    throw error;
  }
}

/**
 * Export settings to file
 */
async function exportSettings() {
  try {
    const settings = await getAllSettings();
    
    // Add metadata
    const exportData = {
      ...settings,
      metadata: {
        extensionName: 'Cookie Vault',
        extensionVersion: chrome.runtime.getManifest().version,
        exportFormat: '1.0',
        checksum: generateChecksum(JSON.stringify(settings))
      }
    };
    
    // Create filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `cookie-vault-settings-${date}.json`;
    
    // Download file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        throw new Error(chrome.runtime.lastError.message);
      }
      
      if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
        addToSuccessMessageList(createSuccessAlert(`✅ Settings exported to ${filename}`));
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error exporting settings:', error);
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning(`Export failed: ${error.message}`));
    }
    return false;
  }
}

/**
 * Import settings from file
 */
async function importSettings(fileContent, options = {}) {
  try {
    const importData = JSON.parse(fileContent);
    
    // Validate import data
    if (!importData.metadata || importData.metadata.exportFormat !== '1.0') {
      throw new Error('Invalid settings file format');
    }
    
    // Verify checksum if present
    if (importData.metadata.checksum) {
      const settings = { ...importData };
      delete settings.metadata;
      const calculatedChecksum = generateChecksum(JSON.stringify(settings));
      
      if (calculatedChecksum !== importData.metadata.checksum) {
        console.warn('Checksum mismatch - file may have been modified');
      }
    }
    
    // Default import options
    const importOptions = {
      overwriteExisting: true,
      importProfiles: true,
      importHistory: false,
      importTelegram: false, // Don't import Telegram credentials by default
      ...options
    };
    
    // Prepare settings to import
    const settingsToImport = {};
    
    // Basic settings
    if (importOptions.overwriteExisting) {
      settingsToImport.theme = importData.theme;
      settingsToImport.compactMode = importData.compactMode;
      settingsToImport.autoBackupEnabled = importData.autoBackupEnabled;
      settingsToImport.autoBackupSchedule = importData.autoBackupSchedule;
      settingsToImport.savedProfileName = importData.defaultProfileName;
      settingsToImport.encryptionMethod = importData.encryptionMethod;
      settingsToImport.keyDerivationIterations = importData.keyDerivationIterations;
      settingsToImport.autoDeleteOldBackups = importData.autoDeleteOldBackups;
      settingsToImport.maxBackupAge = importData.maxBackupAge;
      settingsToImport.includedDomains = importData.includedDomains;
      settingsToImport.excludedDomains = importData.excludedDomains;
    }
    
    // Backup profiles
    if (importOptions.importProfiles && importData.backupProfiles) {
      const existingProfiles = await chrome.storage.local.get(['backupProfiles']);
      settingsToImport.backupProfiles = importOptions.overwriteExisting ? 
        importData.backupProfiles : 
        { ...existingProfiles.backupProfiles, ...importData.backupProfiles };
    }
    
    // Backup history
    if (importOptions.importHistory && importData.backupHistory) {
      settingsToImport.backupHistory = importData.backupHistory;
    }
    
    // Apply settings
    await chrome.storage.local.set(settingsToImport);
    
    // Apply theme immediately
    if (settingsToImport.theme) {
      applyTheme(settingsToImport.theme);
    }
    
    // Show success message
    if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
      addToSuccessMessageList(createSuccessAlert('✅ Settings imported successfully'));
    }
    
    // Reload extension to apply all settings
    setTimeout(() => {
      if (confirm('Settings imported. Reload extension to apply all changes?')) {
        chrome.runtime.reload();
      }
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error importing settings:', error);
    if (typeof addToWarningMessageList === 'function' && typeof createWarning === 'function') {
      addToWarningMessageList(createWarning(`Import failed: ${error.message}`));
    }
    return false;
  }
}

/**
 * Show import settings dialog
 */
function showImportSettingsDialog() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'import-settings-modal';
  
  modal.innerHTML = `
    <div class="modal-content import-settings">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
      
      <h2>Import Settings</h2>
      
      <div class="import-options">
        <label class="import-option">
          <input type="checkbox" id="import-overwrite" checked>
          <span>Overwrite existing settings</span>
        </label>
        
        <label class="import-option">
          <input type="checkbox" id="import-profiles" checked>
          <span>Import backup profiles</span>
        </label>
        
        <label class="import-option">
          <input type="checkbox" id="import-history">
          <span>Import backup history</span>
        </label>
        
        <label class="import-option">
          <input type="checkbox" id="import-telegram">
          <span>Import Telegram credentials (if encrypted)</span>
        </label>
      </div>
      
      <div class="file-upload-area">
        <input type="file" id="settings-file-input" accept=".json" style="display: none;">
        <div class="upload-prompt" id="upload-prompt">
          <div class="upload-icon">📁</div>
          <p>Click to select settings file or drag and drop</p>
          <small>Accepts .json files exported from Cookie Vault</small>
        </div>
        <div class="file-info hidden" id="file-info"></div>
      </div>
      
      <div class="import-actions">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="btn-primary" id="import-btn" disabled>Import Settings</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Setup file input
  const fileInput = modal.querySelector('#settings-file-input');
  const uploadPrompt = modal.querySelector('#upload-prompt');
  const fileInfo = modal.querySelector('#file-info');
  const importBtn = modal.querySelector('#import-btn');
  
  let selectedFile = null;
  
  uploadPrompt.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedFile = file;
      fileInfo.innerHTML = `<strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
      fileInfo.classList.remove('hidden');
      uploadPrompt.classList.add('hidden');
      importBtn.disabled = false;
    }
  });
  
  // Drag and drop
  modal.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadPrompt.classList.add('drag-over');
  });
  
  modal.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadPrompt.classList.remove('drag-over');
  });
  
  modal.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadPrompt.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/json') {
      selectedFile = file;
      fileInfo.innerHTML = `<strong>${file.name}</strong> (${(file.size / 1024).toFixed(1)} KB)`;
      fileInfo.classList.remove('hidden');
      uploadPrompt.classList.add('hidden');
      importBtn.disabled = false;
    }
  });
  
  // Import button
  importBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const options = {
        overwriteExisting: modal.querySelector('#import-overwrite').checked,
        importProfiles: modal.querySelector('#import-profiles').checked,
        importHistory: modal.querySelector('#import-history').checked,
        importTelegram: modal.querySelector('#import-telegram').checked
      };
      
      const success = await importSettings(e.target.result, options);
      if (success) {
        modal.remove();
      }
    };
    reader.readAsText(selectedFile);
  });
}

/**
 * Reset all settings to defaults
 */
async function resetSettings() {
  if (!confirm('This will reset all settings to defaults. Continue?')) {
    return false;
  }
  
  try {
    // Clear local storage (except trial/subscription data)
    const protectedKeys = [
      'trialStartDate',
      'subscriptionStatus',
      'subscriptionExpiry',
      'paymentHistory'
    ];
    
    const allData = await chrome.storage.local.get(null);
    const keysToRemove = Object.keys(allData).filter(key => !protectedKeys.includes(key));
    
    await chrome.storage.local.remove(keysToRemove);
    
    // Reset to defaults
    await chrome.storage.local.set({
      theme: 'light',
      autoBackupEnabled: false,
      autoBackupSchedule: 'daily',
      encryptionMethod: 'standard',
      keyDerivationIterations: 1000
    });
    
    if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
      addToSuccessMessageList(createSuccessAlert('✅ Settings reset to defaults'));
    }
    
    // Reload extension
    setTimeout(() => {
      chrome.runtime.reload();
    }, 1000);
    
    return true;
  } catch (error) {
    console.error('Error resetting settings:', error);
    return false;
  }
}

/**
 * Generate checksum for data integrity
 */
function generateChecksum(data) {
  // Simple checksum using hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Apply theme
 */
function applyTheme(theme) {
  const body = document.body;
  body.classList.remove('light-mode', 'dark-mode');
  body.classList.add(theme + '-mode');
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getAllSettings,
    exportSettings,
    importSettings,
    showImportSettingsDialog,
    resetSettings
  };
}

// Make functions globally available
window.exportSettings = exportSettings;
window.showImportSettingsDialog = showImportSettingsDialog;
window.resetSettings = resetSettings;