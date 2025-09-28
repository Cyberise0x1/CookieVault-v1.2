/**
 * Trial System Module
 * Handles all trial, subscription, and premium access functionality
 */

// Safe Chrome storage wrapper functions
function safeChromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage get error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

function safeChromeStorageSet(data) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(`Storage set error: ${chrome.runtime.lastError.message}`));
        } else {
          resolve();
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Trial System Constants
const TRIAL_START_DATE_KEY = "trialStartDate";
const TRIAL_DURATION_DAYS = 7; // 7-day free trial
const SUBSCRIPTION_STATUS_KEY = "subscriptionStatus";
const SUBSCRIPTION_EXPIRY_KEY = "subscriptionExpiry";

// Premium feature list
const PREMIUM_FEATURES = [
  'encrypted_backup',
  'auto_backup',
  'telegram_backup',
  'cloud_storage',
  'advanced_frequency',
  'custom_schedule'
];

/**
 * Initialize trial on first installation
 */
async function initializeTrial() {
  try {
    const result = await safeChromeStorageGet([TRIAL_START_DATE_KEY]);
    
    if (!result[TRIAL_START_DATE_KEY]) {
      // First time installation - start trial
      const trialStartDate = new Date().toISOString();
      await safeChromeStorageSet({
        [TRIAL_START_DATE_KEY]: trialStartDate,
        [SUBSCRIPTION_STATUS_KEY]: 'trial'
      });
      console.log('Trial period started:', trialStartDate);
    }
  } catch (error) {
    console.error('Error initializing trial:', error);
  }
}

/**
 * Check if trial period is still active
 * @returns {Promise<boolean>} True if trial is active
 */
async function isTrialActive() {
  try {
    const result = await safeChromeStorageGet([TRIAL_START_DATE_KEY, SUBSCRIPTION_STATUS_KEY]);
    
    // Check if user has active subscription
    if (result[SUBSCRIPTION_STATUS_KEY] === 'active') {
      return false; // Not trial, full subscription
    }
    
    if (!result[TRIAL_START_DATE_KEY]) {
      return false;
    }
    
    const trialStart = new Date(result[TRIAL_START_DATE_KEY]);
    const now = new Date();
    const daysSinceStart = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    
    return daysSinceStart < TRIAL_DURATION_DAYS;
  } catch (error) {
    console.error('Error checking trial status:', error);
    return false;
  }
}

/**
 * Get remaining trial days
 * @returns {Promise<number>} Number of days remaining in trial
 */
async function getTrialDaysRemaining() {
  try {
    const result = await safeChromeStorageGet([TRIAL_START_DATE_KEY]);
    
    if (!result[TRIAL_START_DATE_KEY]) {
      return 0;
    }
    
    const trialStart = new Date(result[TRIAL_START_DATE_KEY]);
    const now = new Date();
    const daysSinceStart = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, TRIAL_DURATION_DAYS - daysSinceStart);
    
    return daysRemaining;
  } catch (error) {
    console.error('Error calculating trial days:', error);
    return 0;
  }
}

/**
 * Check if user has premium access (trial or paid)
 * @returns {Promise<boolean>} True if user has premium access
 */
async function hasPremiumAccess() {
  try {
    const result = await safeChromeStorageGet([SUBSCRIPTION_STATUS_KEY]);
    
    // Check for active subscription
    if (result[SUBSCRIPTION_STATUS_KEY] === 'active') {
      return true;
    }
    
    // Check if trial is still active
    return await isTrialActive();
  } catch (error) {
    console.error('Error checking premium access:', error);
    return false;
  }
}

/**
 * Get current subscription status
 * @returns {Promise<Object>} Status object with type and message
 */
async function getSubscriptionStatus() {
  try {
    const result = await safeChromeStorageGet([SUBSCRIPTION_STATUS_KEY, SUBSCRIPTION_EXPIRY_KEY]);
    
    if (result[SUBSCRIPTION_STATUS_KEY] === 'active') {
      return {
        type: 'premium',
        message: 'Premium Active',
        expiry: result[SUBSCRIPTION_EXPIRY_KEY]
      };
    }
    
    const trialActive = await isTrialActive();
    const daysRemaining = await getTrialDaysRemaining();
    
    if (trialActive) {
      return {
        type: 'trial',
        message: `Free Trial - ${daysRemaining} days left`,
        daysRemaining: daysRemaining
      };
    }
    
    return {
      type: 'expired',
      message: 'Trial Expired - Upgrade to Premium'
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      type: 'error',
      message: 'Unable to check status'
    };
  }
}

/**
 * Check if a specific feature requires premium
 * @param {string} featureName - Name of the feature to check
 * @returns {Promise<boolean>} True if feature is available
 */
async function isFeatureAvailable(featureName) {
  // Some features are always free
  const freeFeatures = ['manual_backup_basic', 'restore_cookies'];
  
  if (freeFeatures.includes(featureName)) {
    return true;
  }
  
  // Check if user has premium access (trial or subscription)
  return await hasPremiumAccess();
}

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
 * Update UI to show premium indicators on features
 */
async function updatePremiumFeatureIndicators() {
  try {
    const hasPremium = await hasPremiumAccess();
    
    // Update Auto Backup toggle
    const autoBackupSection = document.querySelector('.auto-backup-controls');
    if (autoBackupSection && !hasPremium) {
      addPremiumBadge(autoBackupSection, 'auto-backup-premium');
    }
    
    // Update encryption checkbox
    const encryptCheckbox = document.getElementById('also-send-telegram');
    if (encryptCheckbox && !hasPremium) {
      const parentDiv = encryptCheckbox.closest('.checkbox-group');
      if (parentDiv) {
        addPremiumBadge(parentDiv, 'encryption-premium');
      }
    }
    
    // Update frequency options
    const frequencySelect = document.getElementById('auto-backup-schedule');
    if (frequencySelect && !hasPremium) {
      // Disable premium frequency options
      const premiumOptions = ['15', '30'];
      Array.from(frequencySelect.options).forEach(option => {
        if (premiumOptions.includes(option.value)) {
          option.disabled = true;
          option.text = option.text + ' (Premium)';
        }
      });
    }
    
    // Update cloud section
    const cloudSection = document.querySelector('.cloud-section');
    if (cloudSection && !hasPremium) {
      addPremiumBadge(cloudSection, 'cloud-premium');
    }
  } catch (error) {
    console.error('Error updating premium indicators:', error);
  }
}

/**
 * Add premium badge to an element
 * @param {Element} element - Element to add badge to
 * @param {string} badgeId - Unique ID for the badge
 */
function addPremiumBadge(element, badgeId) {
  // Check if badge already exists
  if (document.getElementById(badgeId)) {
    return;
  }
  
  const badge = document.createElement('span');
  badge.id = badgeId;
  badge.className = 'premium-indicator';
  badge.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
    </svg>
    <span>Premium</span>
  `;
  badge.title = 'This feature requires premium access';
  badge.onclick = () => showUpgradeModal();
  
  // Find best position to add badge
  const title = element.querySelector('h3, .section-title, label');
  if (title) {
    title.appendChild(badge);
  } else {
    element.insertBefore(badge, element.firstChild);
  }
}

/**
 * Activate premium subscription
 * @param {string} plan - 'monthly' or 'yearly'
 * @param {string} method - Payment method used
 */
async function activatePremiumSubscription(plan, method) {
  const now = new Date();
  let expiryDate = new Date();
  
  if (plan === 'monthly') {
    expiryDate.setMonth(expiryDate.getMonth() + 1);
  } else if (plan === 'yearly') {
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  }
  
  await safeChromeStorageSet({
    [SUBSCRIPTION_STATUS_KEY]: 'active',
    [SUBSCRIPTION_EXPIRY_KEY]: expiryDate.toISOString(),
    subscriptionPlan: plan,
    paymentMethod: method,
    subscriptionStartDate: now.toISOString()
  });
  
  // Refresh UI
  displayTrialStatus();
  updatePremiumFeatureIndicators();
  
  // Show success message if function exists
  if (typeof addToSuccessMessageList === 'function' && typeof createSuccess === 'function') {
    addToSuccessMessageList(createSuccess('Premium activated! All features unlocked.'));
  }
}

/**
 * Check if subscription has expired and update status
 */
async function checkSubscriptionExpiry() {
  const result = await safeChromeStorageGet([SUBSCRIPTION_STATUS_KEY, SUBSCRIPTION_EXPIRY_KEY]);
  
  if (result[SUBSCRIPTION_STATUS_KEY] === 'active' && result[SUBSCRIPTION_EXPIRY_KEY]) {
    const expiryDate = new Date(result[SUBSCRIPTION_EXPIRY_KEY]);
    const now = new Date();
    
    if (now > expiryDate) {
      // Subscription expired
      await safeChromeStorageSet({
        [SUBSCRIPTION_STATUS_KEY]: 'expired',
        lastExpiredDate: expiryDate.toISOString()
      });
      
      // Refresh UI
      displayTrialStatus();
      updatePremiumFeatureIndicators();
    }
  }
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
 * Add account button to header for premium users
 */
function addAccountButton() {
  const existingBtn = document.getElementById('account-btn');
  if (existingBtn) return;
  
  const header = document.querySelector('.header-green');
  if (!header) return;
  
  const accountBtn = document.createElement('button');
  accountBtn.id = 'account-btn';
  accountBtn.className = 'icon-toggle account-btn';
  accountBtn.innerHTML = '👤';
  accountBtn.title = 'Account Management';
  accountBtn.onclick = showAccountModal;
  
  // Insert before theme toggle if it exists
  const themeToggle = header.querySelector('.theme-toggle');
  if (themeToggle) {
    header.insertBefore(accountBtn, themeToggle);
  } else {
    header.appendChild(accountBtn);
  }
}

/**
 * Load payment history
 */
async function loadPaymentHistory() {
  const result = await safeChromeStorageGet(['paymentHistory']);
  return result.paymentHistory || [];
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeTrial,
    isTrialActive,
    getTrialDaysRemaining,
    hasPremiumAccess,
    getSubscriptionStatus,
    isFeatureAvailable,
    displayTrialStatus,
    updatePremiumFeatureIndicators,
    addPremiumBadge,
    activatePremiumSubscription,
    checkSubscriptionExpiry,
    initializeSubscriptionManagement,
    addAccountButton,
    loadPaymentHistory,
    TRIAL_START_DATE_KEY,
    TRIAL_DURATION_DAYS,
    SUBSCRIPTION_STATUS_KEY,
    SUBSCRIPTION_EXPIRY_KEY,
    PREMIUM_FEATURES
  };
}