/**
 * UI Helpers Module
 * Contains all UI utility functions and helpers
 */

// Message management
const messageQueue = [];
const warningQueue = [];
let messageTimer = null;
let warningTimer = null;

/**
 * Create success message element
 */
function createSuccessAlert(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success';
  alert.innerHTML = `
    <span class="alert-icon">✅</span>
    <span class="alert-text">${message}</span>
    <button class="alert-close" onclick="this.parentElement.remove()">×</button>
  `;
  return alert;
}

/**
 * Create success message (legacy function name)
 */
function createSuccess(message) {
  return createSuccessAlert(message);
}

/**
 * Create warning message element
 */
function createWarning(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-warning';
  alert.innerHTML = `
    <span class="alert-icon">⚠️</span>
    <span class="alert-text">${message}</span>
    <button class="alert-close" onclick="this.parentElement.remove()">×</button>
  `;
  return alert;
}

/**
 * Create error message element
 */
function createError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-error';
  alert.innerHTML = `
    <span class="alert-icon">❌</span>
    <span class="alert-text">${message}</span>
    <button class="alert-close" onclick="this.parentElement.remove()">×</button>
  `;
  return alert;
}

/**
 * Create info message element
 */
function createInfo(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-info';
  alert.innerHTML = `
    <span class="alert-icon">ℹ️</span>
    <span class="alert-text">${message}</span>
    <button class="alert-close" onclick="this.parentElement.remove()">×</button>
  `;
  return alert;
}

/**
 * Add message to success message list
 */
function addToSuccessMessageList(messageElement) {
  const messagesContainer = document.getElementById('messages');
  if (!messagesContainer) return;
  
  // Clear any existing messages after delay
  if (messageTimer) clearTimeout(messageTimer);
  
  messagesContainer.appendChild(messageElement);
  
  // Auto-remove after 5 seconds
  messageTimer = setTimeout(() => {
    messageElement.remove();
  }, 5000);
}

/**
 * Add message to warning message list
 */
function addToWarningMessageList(messageElement) {
  const warningsContainer = document.getElementById('warnings');
  if (!warningsContainer) return;
  
  // Clear any existing warnings after delay
  if (warningTimer) clearTimeout(warningTimer);
  
  warningsContainer.appendChild(messageElement);
  
  // Auto-remove after 5 seconds
  warningTimer = setTimeout(() => {
    messageElement.remove();
  }, 5000);
}

/**
 * Show notification badge
 */
function showNotificationBadge(count) {
  chrome.action.setBadgeText({ text: count.toString() });
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
}

/**
 * Clear notification badge
 */
function clearNotificationBadge() {
  chrome.action.setBadgeText({ text: '' });
}

/**
 * Update status text
 */
function updateStatusText(elementId, text, type = 'info') {
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.textContent = text;
  element.className = `status-text status-${type}`;
  
  // Add fade effect
  element.style.opacity = '0';
  setTimeout(() => {
    element.style.opacity = '1';
  }, 100);
}

/**
 * Show loading spinner
 */
function showLoadingSpinner(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.innerHTML = `
    <div class="spinner"></div>
    <span class="loading-text">Loading...</span>
  `;
  
  container.appendChild(spinner);
  return spinner;
}

/**
 * Hide loading spinner
 */
function hideLoadingSpinner(spinner) {
  if (spinner && spinner.parentElement) {
    spinner.remove();
  }
}

/**
 * Create tooltip
 */
function createTooltip(element, text, position = 'top') {
  const tooltip = document.createElement('div');
  tooltip.className = `tooltip tooltip-${position}`;
  tooltip.textContent = text;
  
  element.addEventListener('mouseenter', () => {
    document.body.appendChild(tooltip);
    
    const rect = element.getBoundingClientRect();
    
    switch(position) {
      case 'top':
        tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
        tooltip.style.top = rect.top - tooltip.offsetHeight - 5 + 'px';
        break;
      case 'bottom':
        tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
        tooltip.style.top = rect.bottom + 5 + 'px';
        break;
      case 'left':
        tooltip.style.left = rect.left - tooltip.offsetWidth - 5 + 'px';
        tooltip.style.top = rect.top + rect.height / 2 - tooltip.offsetHeight / 2 + 'px';
        break;
      case 'right':
        tooltip.style.left = rect.right + 5 + 'px';
        tooltip.style.top = rect.top + rect.height / 2 - tooltip.offsetHeight / 2 + 'px';
        break;
    }
  });
  
  element.addEventListener('mouseleave', () => {
    tooltip.remove();
  });
}

/**
 * Animate element
 */
function animateElement(element, animationClass, duration = 1000) {
  element.classList.add(animationClass);
  
  setTimeout(() => {
    element.classList.remove(animationClass);
  }, duration);
}

/**
 * Show/hide element with fade
 */
function fadeToggle(element, show = true, duration = 300) {
  if (show) {
    element.style.display = 'block';
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.style.transition = `opacity ${duration}ms ease`;
      element.style.opacity = '1';
    }, 10);
  } else {
    element.style.transition = `opacity ${duration}ms ease`;
    element.style.opacity = '0';
    
    setTimeout(() => {
      element.style.display = 'none';
    }, duration);
  }
}

/**
 * Create progress bar
 */
function createProgressBar(containerId, max = 100) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.innerHTML = `
    <div class="progress-track">
      <div class="progress-fill" style="width: 0%"></div>
    </div>
    <div class="progress-text">0%</div>
  `;
  
  container.appendChild(progressBar);
  
  return {
    element: progressBar,
    update: (value) => {
      const percentage = Math.min(100, (value / max) * 100);
      progressBar.querySelector('.progress-fill').style.width = percentage + '%';
      progressBar.querySelector('.progress-text').textContent = Math.round(percentage) + '%';
    },
    remove: () => progressBar.remove()
  };
}

/**
 * Format time ago
 */
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
  if (seconds < 2592000) return Math.floor(seconds / 604800) + ' weeks ago';
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + ' months ago';
  return Math.floor(seconds / 31536000) + ' years ago';
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Debounce function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text, buttonElement = null) {
  try {
    await navigator.clipboard.writeText(text);
    
    if (buttonElement) {
      const originalText = buttonElement.textContent;
      buttonElement.textContent = '✅ Copied!';
      setTimeout(() => {
        buttonElement.textContent = originalText;
      }, 2000);
    }
    
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

/**
 * Download JSON data as file
 */
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      addToWarningMessageList(createWarning("Download failed: " + chrome.runtime.lastError.message));
    } else {
      addToSuccessMessageList(createSuccessAlert(`✅ File saved as ${filename}`));
    }
    URL.revokeObjectURL(url);
  });
}

/**
 * Toggle dark mode
 */
function toggleDarkMode() {
  const body = document.body;
  const isDarkMode = body.classList.contains('dark-mode');
  
  if (isDarkMode) {
    body.classList.remove('dark-mode');
    body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.remove('light-mode');
    body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  }
  
  // Update theme icon
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = isDarkMode ? '🌙' : '☀️';
  }
}

/**
 * Initialize theme
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const body = document.body;
  
  body.classList.remove('light-mode', 'dark-mode');
  body.classList.add(savedTheme + '-mode');
  
  const themeIcon = document.querySelector('.theme-icon');
  if (themeIcon) {
    themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Validate email format
 */
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate URL format
 */
function validateUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createSuccessAlert,
    createSuccess,
    createWarning,
    createError,
    createInfo,
    addToSuccessMessageList,
    addToWarningMessageList,
    showNotificationBadge,
    clearNotificationBadge,
    updateStatusText,
    showLoadingSpinner,
    hideLoadingSpinner,
    createTooltip,
    animateElement,
    fadeToggle,
    createProgressBar,
    formatTimeAgo,
    formatNumber,
    debounce,
    throttle,
    copyToClipboard,
    downloadJson,
    toggleDarkMode,
    initializeTheme,
    validateEmail,
    validateUrl,
    escapeHtml
  };
}

// Make critical functions globally accessible for onclick handlers
window.createSuccessAlert = createSuccessAlert;
window.createSuccess = createSuccess;
window.createWarning = createWarning;
window.createError = createError;
window.createInfo = createInfo;
window.addToSuccessMessageList = addToSuccessMessageList;
window.addToWarningMessageList = addToWarningMessageList;
window.toggleDarkMode = toggleDarkMode;
window.copyToClipboard = copyToClipboard;
window.downloadJson = downloadJson;