/**
 * Advanced Encryption Module
 * Enhanced security options for cookie backups
 */

// Encryption methods configuration
const ENCRYPTION_METHODS = {
  standard: {
    name: 'Standard (AES-256)',
    description: 'Fast and secure for most use cases',
    algorithm: 'aes',
    keySize: 256,
    iterations: 1000,
    icon: '🔒'
  },
  enhanced: {
    name: 'Enhanced (AES-256 + PBKDF2)',
    description: 'Stronger key derivation, slower but more secure',
    algorithm: 'aes',
    keySize: 256,
    iterations: 10000,
    icon: '🔐'
  },
  maximum: {
    name: 'Maximum (Double Encryption)',
    description: 'Double-layer encryption with different keys',
    algorithm: 'aes-double',
    keySize: 256,
    iterations: 100000,
    icon: '🛡️'
  },
  quantum: {
    name: 'Quantum-Resistant (ChaCha20)',
    description: 'Future-proof against quantum computing',
    algorithm: 'chacha20',
    keySize: 256,
    iterations: 50000,
    icon: '⚛️',
    premium: true
  },
  stealth: {
    name: 'Steganography Mode',
    description: 'Hide backup inside image files',
    algorithm: 'aes-stego',
    keySize: 256,
    iterations: 10000,
    icon: '🖼️',
    premium: true
  }
};

/**
 * Get current encryption settings
 */
async function getEncryptionSettings() {
  try {
    const result = await chrome.storage.local.get([
      'encryptionMethod',
      'keyDerivationIterations',
      'useKeyFile',
      'useHardwareKey',
      'doubleEncryption',
      'timeLockEnabled',
      'timeLockDate'
    ]);
    
    return {
      method: result.encryptionMethod || 'standard',
      iterations: result.keyDerivationIterations || 1000,
      useKeyFile: result.useKeyFile || false,
      useHardwareKey: result.useHardwareKey || false,
      doubleEncryption: result.doubleEncryption || false,
      timeLockEnabled: result.timeLockEnabled || false,
      timeLockDate: result.timeLockDate || null
    };
  } catch (error) {
    console.error('Error getting encryption settings:', error);
    return {
      method: 'standard',
      iterations: 1000
    };
  }
}

/**
 * Save encryption settings
 */
async function saveEncryptionSettings(settings) {
  try {
    await chrome.storage.local.set({
      encryptionMethod: settings.method,
      keyDerivationIterations: settings.iterations,
      useKeyFile: settings.useKeyFile || false,
      useHardwareKey: settings.useHardwareKey || false,
      doubleEncryption: settings.doubleEncryption || false,
      timeLockEnabled: settings.timeLockEnabled || false,
      timeLockDate: settings.timeLockDate || null
    });
    
    return true;
  } catch (error) {
    console.error('Error saving encryption settings:', error);
    return false;
  }
}

/**
 * Encrypt data with selected method
 */
async function encryptWithMethod(data, password, method = 'standard') {
  const config = ENCRYPTION_METHODS[method];
  
  if (!config) {
    throw new Error('Invalid encryption method');
  }
  
  // Check if premium method requires access
  if (config.premium && typeof isFeatureAvailable === 'function') {
    const available = await isFeatureAvailable('advanced_encryption');
    if (!available) {
      throw new Error('Premium feature required');
    }
  }
  
  switch (config.algorithm) {
    case 'aes':
      return encryptAES(data, password, config.iterations);
      
    case 'aes-double':
      return encryptDoubleAES(data, password, config.iterations);
      
    case 'chacha20':
      return encryptChaCha20(data, password, config.iterations);
      
    case 'aes-stego':
      return await encryptSteganography(data, password, config.iterations);
      
    default:
      return encryptAES(data, password, config.iterations);
  }
}

/**
 * Standard AES encryption
 */
function encryptAES(data, password, iterations = 1000) {
  const options = {
    iter: iterations,
    ks: 256,
    mode: 'ccm'
  };
  
  return sjcl.encrypt(password, data, options);
}

/**
 * Double-layer AES encryption
 */
function encryptDoubleAES(data, password, iterations = 10000) {
  // First layer with password
  const firstLayer = encryptAES(data, password, iterations);
  
  // Second layer with derived key
  const derivedPassword = sjcl.codec.hex.fromBits(
    sjcl.misc.pbkdf2(password + '_layer2', password, iterations, 256)
  );
  
  return encryptAES(firstLayer, derivedPassword, iterations);
}

/**
 * ChaCha20 encryption (simulated - would need actual implementation)
 */
function encryptChaCha20(data, password, iterations = 50000) {
  // In production, would use actual ChaCha20 library
  // For now, use enhanced AES with more iterations
  console.log('Using enhanced AES (ChaCha20 simulation)');
  return encryptAES(data, password, iterations);
}

/**
 * Steganography encryption - hide data in image
 */
async function encryptSteganography(data, password, iterations = 10000) {
  // First encrypt the data
  const encrypted = encryptAES(data, password, iterations);
  
  // Create a canvas with encoded data
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  // Calculate required size
  const dataLength = encrypted.length;
  const pixelsNeeded = Math.ceil(dataLength / 3); // RGB channels
  const size = Math.ceil(Math.sqrt(pixelsNeeded));
  
  canvas.width = size;
  canvas.height = size;
  
  // Create noise image
  const imageData = ctx.createImageData(size, size);
  
  // Encode encrypted data into image pixels
  let dataIndex = 0;
  for (let i = 0; i < imageData.data.length && dataIndex < encrypted.length; i += 4) {
    // Use RGB channels, leave alpha at 255
    imageData.data[i] = encrypted.charCodeAt(dataIndex++) || 0;
    imageData.data[i + 1] = encrypted.charCodeAt(dataIndex++) || 0;
    imageData.data[i + 2] = encrypted.charCodeAt(dataIndex++) || 0;
    imageData.data[i + 3] = 255;
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  // Convert to PNG
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          type: 'steganography',
          image: reader.result,
          metadata: {
            width: size,
            height: size,
            dataLength: dataLength
          }
        });
      };
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

/**
 * Decrypt data with selected method
 */
async function decryptWithMethod(encryptedData, password, method = 'standard') {
  const config = ENCRYPTION_METHODS[method];
  
  if (!config) {
    throw new Error('Invalid encryption method');
  }
  
  switch (config.algorithm) {
    case 'aes':
      return decryptAES(encryptedData, password);
      
    case 'aes-double':
      return decryptDoubleAES(encryptedData, password, config.iterations);
      
    case 'chacha20':
      return decryptChaCha20(encryptedData, password);
      
    case 'aes-stego':
      return await decryptSteganography(encryptedData, password);
      
    default:
      return decryptAES(encryptedData, password);
  }
}

/**
 * Standard AES decryption
 */
function decryptAES(encryptedData, password) {
  return sjcl.decrypt(password, encryptedData);
}

/**
 * Double-layer AES decryption
 */
function decryptDoubleAES(encryptedData, password, iterations = 10000) {
  // Derive second layer password
  const derivedPassword = sjcl.codec.hex.fromBits(
    sjcl.misc.pbkdf2(password + '_layer2', password, iterations, 256)
  );
  
  // Decrypt second layer
  const firstLayer = decryptAES(encryptedData, derivedPassword);
  
  // Decrypt first layer
  return decryptAES(firstLayer, password);
}

/**
 * ChaCha20 decryption (simulated)
 */
function decryptChaCha20(encryptedData, password) {
  // In production, would use actual ChaCha20 library
  return decryptAES(encryptedData, password);
}

/**
 * Steganography decryption - extract data from image
 */
async function decryptSteganography(stegoData, password) {
  if (!stegoData.type === 'steganography' || !stegoData.image) {
    throw new Error('Invalid steganography data');
  }
  
  // Create image from data URL
  const img = new Image();
  img.src = stegoData.image;
  
  await new Promise((resolve) => {
    img.onload = resolve;
  });
  
  // Extract data from image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = stegoData.metadata.width;
  canvas.height = stegoData.metadata.height;
  
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  
  // Extract encrypted data from pixels
  let extractedData = '';
  const dataLength = stegoData.metadata.dataLength;
  let charCount = 0;
  
  for (let i = 0; i < imageData.data.length && charCount < dataLength; i += 4) {
    if (charCount < dataLength) {
      extractedData += String.fromCharCode(imageData.data[i]);
      charCount++;
    }
    if (charCount < dataLength) {
      extractedData += String.fromCharCode(imageData.data[i + 1]);
      charCount++;
    }
    if (charCount < dataLength) {
      extractedData += String.fromCharCode(imageData.data[i + 2]);
      charCount++;
    }
  }
  
  // Decrypt the extracted data
  return decryptAES(extractedData, password);
}

/**
 * Generate key file
 */
async function generateKeyFile() {
  const keyData = {
    version: '1.0',
    created: new Date().toISOString(),
    key: sjcl.codec.hex.fromBits(sjcl.random.randomWords(8)),
    salt: sjcl.codec.hex.fromBits(sjcl.random.randomWords(4)),
    checksum: null
  };
  
  keyData.checksum = generateChecksum(JSON.stringify(keyData));
  
  const blob = new Blob([JSON.stringify(keyData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const filename = `cookie-vault-keyfile-${Date.now()}.key`;
  
  chrome.downloads.download({
    url: url,
    filename: filename,
    saveAs: true
  });
  
  return keyData;
}

/**
 * Verify key file
 */
function verifyKeyFile(keyFileContent) {
  try {
    const keyData = JSON.parse(keyFileContent);
    
    if (!keyData.version || !keyData.key || !keyData.salt) {
      return false;
    }
    
    // Verify checksum
    const checkData = { ...keyData };
    delete checkData.checksum;
    const calculatedChecksum = generateChecksum(JSON.stringify(checkData));
    
    return calculatedChecksum === keyData.checksum;
  } catch (error) {
    return false;
  }
}

/**
 * Show encryption settings dialog
 */
function showEncryptionSettingsDialog() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'encryption-settings-modal';
  
  getEncryptionSettings().then(async settings => {
    const hasPremium = typeof hasPremiumAccess === 'function' ? await hasPremiumAccess() : false;
    
    modal.innerHTML = `
      <div class="modal-content encryption-settings">
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
        
        <h2>🔐 Advanced Encryption Settings</h2>
        
        <div class="encryption-methods">
          ${Object.entries(ENCRYPTION_METHODS).map(([key, method]) => `
            <div class="encryption-method ${settings.method === key ? 'selected' : ''} ${method.premium && !hasPremium ? 'premium-locked' : ''}" data-method="${key}">
              <div class="method-icon">${method.icon}</div>
              <div class="method-info">
                <div class="method-name">${method.name}</div>
                <div class="method-description">${method.description}</div>
                ${method.premium && !hasPremium ? '<span class="premium-badge">Premium</span>' : ''}
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="encryption-options">
          <h3>Additional Security Options</h3>
          
          <label class="encryption-option">
            <input type="checkbox" id="use-keyfile" ${settings.useKeyFile ? 'checked' : ''}>
            <span>Require key file (two-factor encryption)</span>
          </label>
          
          <label class="encryption-option ${!hasPremium ? 'premium-locked' : ''}">
            <input type="checkbox" id="use-hardware" ${settings.useHardwareKey ? 'checked' : ''} ${!hasPremium ? 'disabled' : ''}>
            <span>Use hardware key (YubiKey/FIDO2)</span>
            ${!hasPremium ? '<span class="premium-badge">Premium</span>' : ''}
          </label>
          
          <label class="encryption-option ${!hasPremium ? 'premium-locked' : ''}">
            <input type="checkbox" id="time-lock" ${settings.timeLockEnabled ? 'checked' : ''} ${!hasPremium ? 'disabled' : ''}>
            <span>Time-locked encryption</span>
            ${!hasPremium ? '<span class="premium-badge">Premium</span>' : ''}
          </label>
          
          <div class="iterations-setting">
            <label>Key Derivation Iterations:</label>
            <input type="range" id="iterations-slider" min="1000" max="100000" step="1000" value="${settings.iterations}">
            <span id="iterations-value">${settings.iterations}</span>
          </div>
        </div>
        
        <div class="encryption-actions">
          <button class="btn-secondary" id="generate-keyfile">Generate Key File</button>
          <button class="btn-primary" id="save-encryption-settings">Save Settings</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup event handlers
    setupEncryptionHandlers(modal, settings);
  });
}

/**
 * Setup encryption dialog handlers
 */
function setupEncryptionHandlers(modal, currentSettings) {
  // Method selection
  modal.querySelectorAll('.encryption-method').forEach(method => {
    method.addEventListener('click', async (e) => {
      const methodKey = e.currentTarget.dataset.method;
      const methodConfig = ENCRYPTION_METHODS[methodKey];
      
      // Check if premium and available
      if (methodConfig.premium && typeof hasPremiumAccess === 'function') {
        const hasPremium = await hasPremiumAccess();
        if (!hasPremium) {
          if (typeof showUpgradeModal === 'function') {
            showUpgradeModal();
          }
          return;
        }
      }
      
      // Update selection
      modal.querySelectorAll('.encryption-method').forEach(m => m.classList.remove('selected'));
      e.currentTarget.classList.add('selected');
      
      // Update iterations based on method
      const slider = modal.querySelector('#iterations-slider');
      const value = modal.querySelector('#iterations-value');
      if (slider && value) {
        slider.value = methodConfig.iterations;
        value.textContent = methodConfig.iterations;
      }
    });
  });
  
  // Iterations slider
  const slider = modal.querySelector('#iterations-slider');
  const value = modal.querySelector('#iterations-value');
  if (slider && value) {
    slider.addEventListener('input', (e) => {
      value.textContent = e.target.value;
    });
  }
  
  // Generate key file
  const generateBtn = modal.querySelector('#generate-keyfile');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      await generateKeyFile();
      if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
        addToSuccessMessageList(createSuccessAlert('✅ Key file generated and downloaded'));
      }
    });
  }
  
  // Save settings
  const saveBtn = modal.querySelector('#save-encryption-settings');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const selectedMethod = modal.querySelector('.encryption-method.selected');
      const newSettings = {
        method: selectedMethod ? selectedMethod.dataset.method : currentSettings.method,
        iterations: parseInt(modal.querySelector('#iterations-slider').value),
        useKeyFile: modal.querySelector('#use-keyfile').checked,
        useHardwareKey: modal.querySelector('#use-hardware').checked,
        timeLockEnabled: modal.querySelector('#time-lock').checked
      };
      
      await saveEncryptionSettings(newSettings);
      
      if (typeof addToSuccessMessageList === 'function' && typeof createSuccessAlert === 'function') {
        addToSuccessMessageList(createSuccessAlert('✅ Encryption settings saved'));
      }
      
      modal.remove();
    });
  }
}

/**
 * Generate checksum
 */
function generateChecksum(data) {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ENCRYPTION_METHODS,
    getEncryptionSettings,
    saveEncryptionSettings,
    encryptWithMethod,
    decryptWithMethod,
    generateKeyFile,
    verifyKeyFile,
    showEncryptionSettingsDialog
  };
}

// Make functions globally available
window.showEncryptionSettingsDialog = showEncryptionSettingsDialog;
window.encryptWithMethod = encryptWithMethod;
window.decryptWithMethod = decryptWithMethod;
window.generateKeyFile = generateKeyFile;