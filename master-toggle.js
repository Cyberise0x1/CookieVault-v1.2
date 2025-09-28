// Master Auto Backup Toggle Functionality
function initializeMasterToggle() {
    const masterToggle = document.getElementById('master-auto-backup-toggle');
    const autoBackupSchedule = document.getElementById('auto-backup-schedule');
    const telegramToggle = document.getElementById('auto-telegram-backup');
    
    if (!masterToggle) return;
    
    // Load saved state
    const autoEnabled = localStorage.getItem('masterAutoBackupEnabled') === 'true';
    masterToggle.checked = autoEnabled;
    
    // Enable/disable the frequency dropdown based on toggle state
    if (autoBackupSchedule) {
        autoBackupSchedule.disabled = !autoEnabled;
        if (autoEnabled && autoBackupSchedule.value === 'disabled') {
            autoBackupSchedule.value = '15min';
        }
        // Update status with the current frequency on page load
        if (autoEnabled) {
            updateAutoBackupStatusWithFrequency(autoBackupSchedule.value);
        } else {
            updateAutoBackupStatus('Disabled');
        }
    }
    
    masterToggle.addEventListener('change', () => {
        const isEnabled = masterToggle.checked;
        localStorage.setItem('masterAutoBackupEnabled', isEnabled.toString());
        
        if (isEnabled) {
            // Enable auto backup
            if (autoBackupSchedule) {
                autoBackupSchedule.disabled = false;
                if (autoBackupSchedule.value === 'disabled') {
                    autoBackupSchedule.value = '15min';
                }
                autoBackupSchedule.dispatchEvent(new Event('change'));
            }
            
            // Enable Telegram backup if credentials exist
            const credentials = localStorage.getItem('telegramBotToken');
            if (credentials && telegramToggle) {
                telegramToggle.checked = true;
                localStorage.setItem('autoTelegramBackup', 'true');
                
                // Show telegram credentials section
                const credentialsWrap = document.getElementById('telegram-credentials-wrap');
                if (credentialsWrap) {
                    credentialsWrap.classList.remove('hidden');
                }
            }
            
            // Update status displays with specific frequency
            updateAutoBackupStatusWithFrequency(autoBackupSchedule.value);
        } else {
            // Disable all auto backups
            if (autoBackupSchedule) {
                autoBackupSchedule.value = 'disabled';
                autoBackupSchedule.disabled = true;
                autoBackupSchedule.dispatchEvent(new Event('change'));
            }
            if (telegramToggle) {
                telegramToggle.checked = false;
                localStorage.setItem('autoTelegramBackup', 'false');
            }
            
            // Update status displays
            updateAutoBackupStatus('Disabled');
        }
    });
}

function updateAutoBackupStatus(status) {
    const statusElement = document.getElementById('auto-backup-status');
    if (statusElement) {
        statusElement.textContent = status;
    }
    const statusDash = document.getElementById('auto-backup-status-dash');
    if (statusDash) {
        statusDash.textContent = status;
    }
}

function updateAutoBackupStatusWithFrequency(schedule) {
    const statusDash = document.getElementById('auto-backup-status-dash');
    if (statusDash) {
        let frequencyText = "";
        switch (schedule) {
            case "disabled":
                frequencyText = "Disabled";
                break;
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

// Fix Telegram credentials display after save
function fixTelegramCredentialsDisplay() {
    const telegramToggle = document.getElementById('auto-telegram-backup');
    const credentialsWrap = document.getElementById('telegram-credentials-wrap');
    
    if (!telegramToggle || !credentialsWrap) return;
    
    // Check if telegram backup is enabled first
    const telegramEnabled = localStorage.getItem('autoTelegramBackup') === 'true';
    telegramToggle.checked = telegramEnabled;
    
    // Show/hide credentials based on toggle state
    if (telegramEnabled) {
        credentialsWrap.classList.remove('hidden');
        
        // Load saved credentials if available
        const savedCredentials = localStorage.getItem('telegramBotToken');
        if (savedCredentials) {
            try {
                const creds = JSON.parse(savedCredentials);
                if (creds.botToken && creds.chatId) {
                    // Update input fields with masked values
                    const botTokenInput = document.getElementById('telegram-bot-token');
                    const chatIdInput = document.getElementById('telegram-chat-id');
                    
                    if (botTokenInput && creds.botToken) {
                        botTokenInput.value = maskBotToken(creds.botToken);
                        botTokenInput.setAttribute('data-actual-token', creds.botToken);
                    }
                    
                    if (chatIdInput && creds.chatId) {
                        chatIdInput.value = creds.chatId;
                        chatIdInput.setAttribute('data-actual-chat-id', creds.chatId);
                    }
                }
            } catch (e) {
                console.error('Error parsing telegram credentials:', e);
            }
        }
    } else {
        credentialsWrap.classList.add('hidden');
    }
    
    // Add observer to show/hide credentials based on toggle
    telegramToggle.addEventListener('change', () => {
        if (telegramToggle.checked) {
            credentialsWrap.classList.remove('hidden');
            localStorage.setItem('autoTelegramBackup', 'true');
        } else {
            credentialsWrap.classList.add('hidden');
            localStorage.setItem('autoTelegramBackup', 'false');
        }
    });
}

function maskBotToken(token) {
    if (!token || token.length < 10) return token;
    const parts = token.split(':');
    if (parts.length !== 2) return token;
    return parts[0] + ':...' + parts[1].slice(-4);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeMasterToggle();
        fixTelegramCredentialsDisplay();
    });
} else {
    initializeMasterToggle();
    fixTelegramCredentialsDisplay();
}