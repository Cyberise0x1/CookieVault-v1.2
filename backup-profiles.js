/**
 * Backup Profiles & Templates Module
 * Manage different backup configurations for various use cases
 */

// Default profile templates
const DEFAULT_TEMPLATES = {
  work: {
    name: 'Work Profile',
    icon: '💼',
    description: 'Backup work-related cookies',
    domains: [
      'gmail.com',
      'google.com',
      'slack.com',
      'github.com',
      'gitlab.com',
      'notion.so',
      'trello.com',
      'asana.com',
      'monday.com',
      'zoom.us',
      'teams.microsoft.com'
    ],
    settings: {
      encryption: 'standard',
      autoBackup: true,
      frequency: 'daily'
    }
  },
  shopping: {
    name: 'Shopping Profile',
    icon: '🛒',
    description: 'E-commerce and shopping sites',
    domains: [
      'amazon.com',
      'ebay.com',
      'etsy.com',
      'walmart.com',
      'target.com',
      'bestbuy.com',
      'alibaba.com',
      'shopify.com'
    ],
    settings: {
      encryption: 'standard',
      autoBackup: false,
      frequency: 'weekly'
    }
  },
  social: {
    name: 'Social Media Profile',
    icon: '👥',
    description: 'Social networking sites',
    domains: [
      'facebook.com',
      'twitter.com',
      'instagram.com',
      'linkedin.com',
      'reddit.com',
      'pinterest.com',
      'tiktok.com',
      'youtube.com'
    ],
    settings: {
      encryption: 'standard',
      autoBackup: true,
      frequency: 'daily'
    }
  },
  banking: {
    name: 'Banking Profile',
    icon: '🏦',
    description: 'Financial and banking sites',
    domains: [
      'chase.com',
      'bankofamerica.com',
      'wellsfargo.com',
      'paypal.com',
      'venmo.com',
      'coinbase.com',
      'robinhood.com'
    ],
    settings: {
      encryption: 'maximum',
      autoBackup: false,
      frequency: 'manual',
      requirePassword: true
    }
  },
  developer: {
    name: 'Developer Profile',
    icon: '👨‍💻',
    description: 'Development and coding platforms',
    domains: [
      'github.com',
      'stackoverflow.com',
      'npmjs.com',
      'docker.com',
      'aws.amazon.com',
      'heroku.com',
      'vercel.com',
      'netlify.com',
      'replit.com'
    ],
    settings: {
      encryption: 'standard',
      autoBackup: true,
      frequency: 'daily'
    }
  }
};

/**
 * Load saved profiles from storage
 */
async function loadBackupProfiles() {
  try {
    const result = await chrome.storage.local.get(['backupProfiles']);
    return result.backupProfiles || {};
  } catch (error) {
    console.error('Error loading backup profiles:', error);
    return {};
  }
}

/**
 * Save profiles to storage
 */
async function saveBackupProfiles(profiles) {
  try {
    await chrome.storage.local.set({ backupProfiles: profiles });
    return true;
  } catch (error) {
    console.error('Error saving backup profiles:', error);
    return false;
  }
}

/**
 * Create a new profile
 */
async function createBackupProfile(profileData) {
  const profiles = await loadBackupProfiles();
  const profileId = 'profile_' + Date.now();
  
  profiles[profileId] = {
    id: profileId,
    name: profileData.name,
    icon: profileData.icon || '📁',
    description: profileData.description || '',
    domains: profileData.domains || [],
    settings: profileData.settings || {
      encryption: 'standard',
      autoBackup: false,
      frequency: 'manual'
    },
    created: new Date().toISOString(),
    lastUsed: null,
    backupCount: 0
  };
  
  await saveBackupProfiles(profiles);
  return profiles[profileId];
}

/**
 * Update an existing profile
 */
async function updateBackupProfile(profileId, updates) {
  const profiles = await loadBackupProfiles();
  
  if (!profiles[profileId]) {
    throw new Error('Profile not found');
  }
  
  profiles[profileId] = {
    ...profiles[profileId],
    ...updates,
    modified: new Date().toISOString()
  };
  
  await saveBackupProfiles(profiles);
  return profiles[profileId];
}

/**
 * Delete a profile
 */
async function deleteBackupProfile(profileId) {
  const profiles = await loadBackupProfiles();
  
  if (!profiles[profileId]) {
    throw new Error('Profile not found');
  }
  
  delete profiles[profileId];
  await saveBackupProfiles(profiles);
  return true;
}

/**
 * Apply a template to create a new profile
 */
async function applyProfileTemplate(templateKey) {
  const template = DEFAULT_TEMPLATES[templateKey];
  if (!template) {
    throw new Error('Template not found');
  }
  
  return await createBackupProfile({
    ...template,
    name: template.name + ' (Custom)'
  });
}

/**
 * Get current active profile
 */
async function getActiveProfile() {
  try {
    const result = await chrome.storage.local.get(['activeProfileId']);
    if (!result.activeProfileId) {
      return null;
    }
    
    const profiles = await loadBackupProfiles();
    return profiles[result.activeProfileId] || null;
  } catch (error) {
    console.error('Error getting active profile:', error);
    return null;
  }
}

/**
 * Set active profile
 */
async function setActiveProfile(profileId) {
  try {
    const profiles = await loadBackupProfiles();
    
    if (profileId && !profiles[profileId]) {
      throw new Error('Profile not found');
    }
    
    await chrome.storage.local.set({ activeProfileId: profileId });
    
    // Update last used timestamp
    if (profileId) {
      profiles[profileId].lastUsed = new Date().toISOString();
      await saveBackupProfiles(profiles);
    }
    
    return true;
  } catch (error) {
    console.error('Error setting active profile:', error);
    return false;
  }
}

/**
 * Backup cookies using a specific profile
 */
async function backupWithProfile(profileId) {
  const profiles = await loadBackupProfiles();
  const profile = profiles[profileId];
  
  if (!profile) {
    throw new Error('Profile not found');
  }
  
  try {
    // Get all cookies
    const allCookies = await chrome.cookies.getAll({});
    
    // Filter cookies based on profile domains
    const filteredCookies = allCookies.filter(cookie => {
      return profile.domains.some(domain => 
        cookie.domain.includes(domain) || domain.includes(cookie.domain)
      );
    });
    
    if (filteredCookies.length === 0) {
      throw new Error('No cookies found for profile domains');
    }
    
    // Create backup based on profile settings
    const timestamp = new Date().toISOString();
    const backupData = {
      profile: {
        id: profile.id,
        name: profile.name
      },
      timestamp: timestamp,
      cookieCount: filteredCookies.length,
      domains: profile.domains,
      cookies: filteredCookies
    };
    
    // Apply encryption based on profile settings
    let finalData;
    if (profile.settings.encryption === 'maximum') {
      // Use stronger encryption for maximum security
      const password = await promptForPassword('Enter password for maximum encryption:');
      if (!password) {
        throw new Error('Password required for maximum encryption');
      }
      finalData = await encryptWithMaximumSecurity(JSON.stringify(backupData), password);
    } else if (profile.settings.encryption === 'standard') {
      // Standard encryption
      const password = await promptForPassword('Enter backup password:');
      if (!password) {
        throw new Error('Password required');
      }
      finalData = sjcl.encrypt(password, JSON.stringify(backupData));
    } else {
      // No encryption
      finalData = JSON.stringify(backupData, null, 2);
    }
    
    // Create filename
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `cookies-${profile.name.replace(/\s+/g, '-')}-${dateStr}.ckz`;
    
    // Download backup
    const blob = new Blob([finalData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });
    
    // Update profile stats
    profile.lastUsed = timestamp;
    profile.backupCount = (profile.backupCount || 0) + 1;
    await saveBackupProfiles(profiles);
    
    return {
      success: true,
      filename: filename,
      cookieCount: filteredCookies.length
    };
    
  } catch (error) {
    console.error('Profile backup failed:', error);
    throw error;
  }
}

/**
 * Show profile selector UI
 */
function showProfileSelector() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'profile-selector-modal';
  
  loadBackupProfiles().then(profiles => {
    const profileList = Object.values(profiles);
    const templateList = Object.entries(DEFAULT_TEMPLATES);
    
    modal.innerHTML = `
      <div class="modal-content profile-selector">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        
        <h2>Select Backup Profile</h2>
        
        <div class="profile-tabs">
          <button class="profile-tab active" data-tab="my-profiles">My Profiles</button>
          <button class="profile-tab" data-tab="templates">Templates</button>
        </div>
        
        <div class="profile-content" id="my-profiles">
          <div class="profile-grid">
            ${profileList.length > 0 ? profileList.map(profile => `
              <div class="profile-card" data-profile-id="${profile.id}">
                <div class="profile-icon">${profile.icon}</div>
                <div class="profile-name">${profile.name}</div>
                <div class="profile-stats">
                  <span>${profile.domains.length} domains</span>
                  <span>${profile.backupCount || 0} backups</span>
                </div>
                <div class="profile-actions">
                  <button class="use-profile-btn" data-profile-id="${profile.id}">Use</button>
                  <button class="edit-profile-btn" data-profile-id="${profile.id}">Edit</button>
                  <button class="delete-profile-btn" data-profile-id="${profile.id}">Delete</button>
                </div>
              </div>
            `).join('') : '<div class="empty-state">No profiles yet. Create one from templates!</div>'}
          </div>
          
          <button class="create-profile-btn">+ Create New Profile</button>
        </div>
        
        <div class="profile-content hidden" id="templates">
          <div class="template-grid">
            ${templateList.map(([key, template]) => `
              <div class="template-card" data-template="${key}">
                <div class="template-icon">${template.icon}</div>
                <div class="template-name">${template.name}</div>
                <div class="template-description">${template.description}</div>
                <div class="template-domains">${template.domains.length} predefined domains</div>
                <button class="use-template-btn" data-template="${key}">Use Template</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup event handlers
    setupProfileSelectorHandlers(modal);
  });
}

/**
 * Setup profile selector event handlers
 */
function setupProfileSelectorHandlers(modal) {
  // Tab switching
  modal.querySelectorAll('.profile-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      
      // Update active tab
      modal.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      // Show corresponding content
      modal.querySelectorAll('.profile-content').forEach(content => {
        content.classList.toggle('hidden', content.id !== tabName);
      });
    });
  });
  
  // Use profile
  modal.querySelectorAll('.use-profile-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const profileId = e.target.dataset.profileId;
      await setActiveProfile(profileId);
      await backupWithProfile(profileId);
      modal.remove();
    });
  });
  
  // Use template
  modal.querySelectorAll('.use-template-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const templateKey = e.target.dataset.template;
      const profile = await applyProfileTemplate(templateKey);
      await setActiveProfile(profile.id);
      modal.remove();
      
      if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
        addToSuccessMessageList(createSuccessAlert(`✅ Created profile: ${profile.name}`));
      }
    });
  });
  
  // Create new profile
  const createBtn = modal.querySelector('.create-profile-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      modal.remove();
      showCreateProfileDialog();
    });
  }
}

/**
 * Show create profile dialog
 */
function showCreateProfileDialog() {
  // Implementation for creating custom profile
  // This would show a form to enter profile details
  console.log('Create profile dialog - to be implemented');
}

/**
 * Secure password prompt modal
 */
async function promptForPassword(message) {
  return new Promise((resolve) => {
    // Create secure modal overlay
    const modal = document.createElement('div');
    modal.className = 'modal-overlay password-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content password-content';
    modalContent.style.cssText = `
      background: var(--bg-color, white);
      border-radius: 8px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      animation: modalFadeIn 0.2s ease-out;
    `;
    
    // Create password header
    const passwordHeader = document.createElement('div');
    passwordHeader.className = 'password-header';
    passwordHeader.style.marginBottom = '16px';
    
    const headerTitle = document.createElement('h3');
    headerTitle.style.cssText = 'margin: 0; color: var(--text-color, #333); font-size: 18px;';
    headerTitle.textContent = message; // Safe from XSS without escapeHtml dependency
    passwordHeader.appendChild(headerTitle);
    
    modalContent.appendChild(passwordHeader);
    
    const contentDiv = document.createElement('div');
    contentDiv.innerHTML = `
      
      <div class="password-input-group" style="margin-bottom: 20px;">
        <input 
          type="password" 
          id="secure-password-input" 
          placeholder="Enter password"
          style="
            width: 100%;
            padding: 12px;
            border: 2px solid var(--border-color, #ddd);
            border-radius: 6px;
            font-size: 14px;
            box-sizing: border-box;
            background: var(--input-bg, white);
            color: var(--text-color, #333);
          "
          autocomplete="new-password"
          minlength="4"
          required
        />
        <div class="password-strength" style="margin-top: 8px; font-size: 12px; color: var(--text-muted, #666);">
          Minimum 4 characters required
        </div>
      </div>
      
      <div class="password-actions" style="display: flex; gap: 12px; justify-content: flex-end;">
        <button 
          type="button" 
          id="password-cancel" 
          style="
            padding: 10px 20px;
            border: 1px solid var(--border-color, #ddd);
            background: transparent;
            color: var(--text-color, #333);
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          "
        >
          Cancel
        </button>
        <button 
          type="button" 
          id="password-confirm" 
          style="
            padding: 10px 20px;
            border: none;
            background: var(--primary-color, #007bff);
            color: white;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
          "
          disabled
        >
          Confirm
        </button>
      </div>
    `;
    
    modalContent.appendChild(contentDiv);
    modal.appendChild(modalContent);
    document.body.appendChild(modal);
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes modalFadeIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
    
    // Get elements
    const passwordInput = modal.querySelector('#secure-password-input');
    const confirmBtn = modal.querySelector('#password-confirm');
    const cancelBtn = modal.querySelector('#password-cancel');
    const strengthIndicator = modal.querySelector('.password-strength');
    
    // Focus password input
    setTimeout(() => passwordInput.focus(), 100);
    
    // Password validation and strength indicator
    passwordInput.addEventListener('input', () => {
      const password = passwordInput.value;
      const isValid = password.length >= 4;
      
      confirmBtn.disabled = !isValid;
      confirmBtn.style.opacity = isValid ? '1' : '0.6';
      confirmBtn.style.cursor = isValid ? 'pointer' : 'not-allowed';
      
      // Update strength indicator
      if (password.length === 0) {
        strengthIndicator.textContent = 'Minimum 4 characters required';
        strengthIndicator.style.color = 'var(--text-muted, #666)';
      } else if (password.length < 4) {
        strengthIndicator.textContent = `${4 - password.length} more characters needed`;
        strengthIndicator.style.color = '#ff6b6b';
      } else if (password.length < 8) {
        strengthIndicator.textContent = 'Weak - consider a longer password';
        strengthIndicator.style.color = '#ffa726';
      } else if (password.length < 12) {
        strengthIndicator.textContent = 'Good password strength';
        strengthIndicator.style.color = '#66bb6a';
      } else {
        strengthIndicator.textContent = 'Strong password';
        strengthIndicator.style.color = '#4caf50';
      }
    });
    
    // Handle Enter key
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !confirmBtn.disabled) {
        confirmBtn.click();
      } else if (e.key === 'Escape') {
        cancelBtn.click();
      }
    });
    
    // Handle confirm
    confirmBtn.addEventListener('click', () => {
      const password = passwordInput.value;
      if (password.length >= 4) {
        // Clear the input immediately for security
        passwordInput.value = '';
        modal.remove();
        style.remove();
        resolve(password);
      }
    });
    
    // Handle cancel
    cancelBtn.addEventListener('click', () => {
      passwordInput.value = '';
      modal.remove();
      style.remove();
      resolve(null);
    });
    
    // Handle click outside modal
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        passwordInput.value = '';
        modal.remove();
        style.remove();
        resolve(null);
      }
    });
  });
}


/**
 * Maximum security encryption
 */
async function encryptWithMaximumSecurity(data, password) {
  // Use stronger key derivation
  const salt = sjcl.random.randomWords(4);
  const key = sjcl.misc.pbkdf2(password, salt, 10000, 256);
  
  // Encrypt with derived key
  const encrypted = sjcl.encrypt(key, data, {
    iter: 10000,
    ks: 256,
    salt: salt
  });
  
  return encrypted;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    loadBackupProfiles,
    saveBackupProfiles,
    createBackupProfile,
    updateBackupProfile,
    deleteBackupProfile,
    applyProfileTemplate,
    getActiveProfile,
    setActiveProfile,
    backupWithProfile,
    showProfileSelector,
    DEFAULT_TEMPLATES
  };
}

// Make functions globally available
window.showProfileSelector = showProfileSelector;
window.backupWithProfile = backupWithProfile;
window.setActiveProfile = setActiveProfile;