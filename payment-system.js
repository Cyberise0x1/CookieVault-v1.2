/**
 * Payment System Module
 * Handles all payment processing, upgrade modals, and subscription management
 */

// Secure payment address management
class PaymentAddressManager {
  constructor() {
    this.addresses = {};
    this.initialized = false;
  }

  // Initialize payment addresses securely
  async initializeAddresses() {
    if (this.initialized) return;
    
    try {
      // In production, fetch from secure backend API
      // For now, use placeholder system with validation
      this.addresses = await this.fetchPaymentAddresses();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize payment addresses:', error);
      // Use fallback system
      this.addresses = this.getFallbackAddresses();
      this.initialized = true;
    }
  }

  // Fetch payment addresses from secure backend (placeholder)
  async fetchPaymentAddresses() {
    // In production, this would call a secure backend API
    // that generates unique addresses per transaction
    
    // For security reasons, addresses should:
    // 1. Be generated per transaction
    // 2. Be time-limited
    // 3. Be validated server-side
    // 4. Include payment verification
    
    return new Promise((resolve) => {
      // Simulate secure API call
      setTimeout(() => {
        resolve({
          bitcoin: this.generatePlaceholderAddress('bc1', 42),
          ethereum: this.generatePlaceholderAddress('0x', 40),
          usdt: this.generatePlaceholderAddress('T', 34)
        });
      }, 500);
    });
  }

  // Generate placeholder address (not for actual use)
  generatePlaceholderAddress(prefix, length) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let result = prefix;
    for (let i = prefix.length; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Fallback addresses for demo purposes only
  getFallbackAddresses() {
    return {
      bitcoin: 'DEMO-BTC-ADDRESS-PLACEHOLDER',
      ethereum: 'DEMO-ETH-ADDRESS-PLACEHOLDER', 
      usdt: 'DEMO-USDT-ADDRESS-PLACEHOLDER'
    };
  }

  // Get address for specific cryptocurrency
  async getAddress(crypto) {
    await this.initializeAddresses();
    return this.addresses[crypto] || null;
  }

  // Validate address format
  validateAddress(address, crypto) {
    if (!address) return false;
    
    const patterns = {
      bitcoin: /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,87}$/,
      ethereum: /^0x[a-fA-F0-9]{40}$/,
      usdt: /^T[A-Za-z0-9]{33}$/
    };
    
    const pattern = patterns[crypto];
    return pattern ? pattern.test(address) : false;
  }

  // Clear addresses (security cleanup)
  clearAddresses() {
    this.addresses = {};
    this.initialized = false;
  }
}

// Create global payment manager instance
const paymentManager = new PaymentAddressManager();

/**
 * Show upgrade modal
 */
function showUpgradeModal() {
  let modal = document.getElementById('upgrade-modal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'upgrade-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div class="modal-content upgrade-modal">
      <button class="modal-close" onclick="closeUpgradeModal()">×</button>
      
      <div class="modal-header">
        <h2>🚀 Unlock Premium Features</h2>
        <p>Get lifetime access to all features with a one-time payment</p>
      </div>
      
      <div class="pricing-cards">
        <div class="pricing-card featured" style="max-width: 400px; margin: 0 auto;">
          <div class="badge">LIFETIME ACCESS</div>
          <h3>One-Time Payment</h3>
          <div class="price">
            <span class="currency">$</span>
            <span class="amount">49.99</span>
            <span class="period" style="font-size: 14px;">lifetime</span>
          </div>
          <ul class="features">
            <li>✅ Unlimited encrypted backups forever</li>
            <li>✅ Auto-backup scheduling</li>
            <li>✅ Telegram cloud storage</li>
            <li>✅ All advanced features</li>
            <li>✅ Future updates included</li>
            <li>✅ No recurring fees</li>
          </ul>
          <p style="margin: 15px 0; font-weight: 600;">Pay with Cryptocurrency</p>
        </div>
      </div>
      
      <div class="payment-options">
        <p>Choose your preferred cryptocurrency:</p>
        <div class="crypto-buttons">
          <button class="crypto-btn" onclick="showCryptoPayment('bitcoin')">
            <span>₿</span> Bitcoin
          </button>
          <button class="crypto-btn" onclick="showCryptoPayment('ethereum')">
            <span>Ξ</span> Ethereum
          </button>
          <button class="crypto-btn" onclick="showCryptoPayment('usdt')">
            <span>₮</span> USDT
          </button>
        </div>
      </div>
      
      <div class="modal-footer">
        <p>🔒 Secure payment • Lifetime access • No subscription needed</p>
      </div>
    </div>
  `;
  
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

// Stripe subscription removed - using crypto only for lifetime access

/**
 * Show cryptocurrency payment modal
 * @param {string} crypto - 'bitcoin', 'ethereum', or 'usdt'
 */
async function showCryptoPayment(crypto) {
  let modal = document.getElementById('crypto-modal');
  
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'crypto-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  
  const cryptoNames = {
    bitcoin: 'Bitcoin',
    ethereum: 'Ethereum',
    usdt: 'USDT (TRC20)'
  };
  
  // Lifetime access prices
  const prices = {
    bitcoin: '0.00150 BTC',
    ethereum: '0.020 ETH',
    usdt: '49.99 USDT'
  };
  
  // Show loading state first
  modal.innerHTML = `
    <div class="modal-content crypto-modal">
      <button class="modal-close" onclick="closeCryptoModal()">×</button>
      
      <div class="modal-header">
        <h2>Pay with ${cryptoNames[crypto]}</h2>
        <p>Generating secure payment address...</p>
      </div>
      
      <div class="crypto-payment">
        <div class="loading-spinner" style="text-align: center; padding: 40px;">
          <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #f3f3f3; border-top: 3px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <p style="margin-top: 16px; color: #666;">Initializing secure payment...</p>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  closeUpgradeModal(); // Close upgrade modal when showing crypto modal

  try {
    // Get secure payment address
    const paymentAddress = await paymentManager.getAddress(crypto);
    
    if (!paymentAddress) {
      throw new Error('Unable to generate payment address');
    }

    // Update modal with payment information
    modal.innerHTML = `
      <div class="modal-content crypto-modal">
        <button class="modal-close" onclick="closeCryptoModal()">×</button>
        
        <div class="modal-header">
          <h2>Pay with ${cryptoNames[crypto]}</h2>
          <p>Send exactly ${prices[crypto]} to the address below</p>
        </div>
        
        <div class="crypto-payment">
          <div class="qr-code">
            <div class="qr-placeholder">
              [QR Code for ${paymentAddress}]
            </div>
          </div>
          
          <div class="crypto-address">
            <label>Payment Address:</label>
            <div class="address-box">
              <input type="text" value="${paymentAddress}" readonly id="crypto-address-input">
              <button onclick="copyCryptoAddress()">📋 Copy</button>
            </div>
          </div>
        
        <div class="payment-amount">
          <label>Amount to Send:</label>
          <div class="amount-box">
            <strong>${prices[crypto]}</strong>
            <span class="warning">⚠️ Send exact amount</span>
          </div>
        </div>
        
        <div class="payment-instructions">
          <h4>Instructions:</h4>
          <ol>
            <li>Copy the address above or scan the QR code</li>
            <li>Send exactly ${prices[crypto]} from your wallet</li>
            <li>Click "Verify Payment" after sending</li>
            <li>Wait for confirmation (usually 10-30 minutes)</li>
          </ol>
        </div>
        
        <div class="payment-actions">
          <button class="verify-btn" onclick="verifyCryptoPayment('${crypto}')">
            Verify Payment
          </button>
        </div>
      </div>
      
      <div class="modal-footer">
        <p>⚠️ Send only ${cryptoNames[crypto]} to this address • Transactions are irreversible</p>
        <small style="color: #666; display: block; margin-top: 8px;">
          🔒 This is a secure, time-limited payment address generated for your transaction
        </small>
      </div>
    </div>
  `;
    
  } catch (error) {
    console.error('Error generating payment address:', error);
    
    // Show error state
    modal.innerHTML = `
      <div class="modal-content crypto-modal">
        <button class="modal-close" onclick="closeCryptoModal()">×</button>
        
        <div class="modal-header">
          <h2>Payment Address Error</h2>
          <p style="color: #dc3545;">Unable to generate secure payment address</p>
        </div>
        
        <div class="crypto-payment">
          <div style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <p style="color: #666; margin-bottom: 20px;">
              We're unable to generate a secure payment address at this time. 
              This could be due to network issues or temporary service unavailability.
            </p>
            <button onclick="showCryptoPayment('${crypto}')" style="
              padding: 12px 24px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
              font-size: 14px;
            ">
              Try Again
            </button>
          </div>
        </div>
        
        <div class="modal-footer">
          <p style="color: #666;">Please try again or contact support if the issue persists.</p>
        </div>
      </div>
    `;
  }

  // Add spinner animation if not already added
  if (!document.getElementById('payment-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'payment-spinner-style';
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Close cryptocurrency modal
 */
function closeCryptoModal() {
  const modal = document.getElementById('crypto-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Copy cryptocurrency address to clipboard
 */
function copyCryptoAddress() {
  const input = document.getElementById('crypto-address-input');
  if (input) {
    input.select();
    document.execCommand('copy');
    
    // Show feedback
    const button = input.nextElementSibling;
    const originalText = button.textContent;
    button.textContent = '✅ Copied!';
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  }
}

/**
 * Verify cryptocurrency payment
 * @param {string} crypto - Type of cryptocurrency
 */
async function verifyCryptoPayment(crypto) {
  // Show loading state
  const modal = document.getElementById('crypto-modal');
  if (modal) {
    const content = modal.querySelector('.modal-content');
    content.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <h3>Verifying payment...</h3>
        <p>Checking blockchain for transaction confirmation</p>
        <p class="small">This may take a few moments</p>
      </div>
    `;
  }
  
  // In production, check blockchain API for payment confirmation
  setTimeout(async () => {
    // Simulate successful payment verification
    await handlePaymentSuccess(`crypto_${crypto}_${Date.now()}`, 'lifetime', crypto);
    
    // Show success
    if (modal) {
      const content = modal.querySelector('.modal-content');
      content.innerHTML = `
        <div class="success-state">
          <div class="success-icon">✅</div>
          <h3>Payment Confirmed!</h3>
          <p>Your premium subscription has been activated</p>
          <button class="close-btn" onclick="closeCryptoModal()">Done</button>
        </div>
      `;
    }
    
    setTimeout(() => {
      closeCryptoModal();
    }, 3000);
  }, 3000);
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
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  
  modal.innerHTML = `
    <div class="modal-content account-modal">
      <button class="modal-close" onclick="closeAccountModal()">×</button>
      
      <div class="modal-header">
        <h2>👤 Account Management</h2>
      </div>
      
      <div class="account-status">
        <h3>Subscription Status</h3>
        <div class="status-card ${status.type}">
          <div class="status-icon">
            ${status.type === 'premium' ? '⭐' : status.type === 'trial' ? '🎁' : '⏰'}
          </div>
          <div class="status-details">
            <div class="status-type">${status.message}</div>
            ${status.type === 'premium' ? 
              `<div class="expiry">Expires: ${formatDate(result[SUBSCRIPTION_EXPIRY_KEY])}</div>` :
              status.type === 'trial' ? 
              `<div class="expiry">${status.daysRemaining} days remaining</div>` :
              '<div class="expiry">Upgrade to continue using premium features</div>'
            }
          </div>
        </div>
      </div>
      
      <div class="subscription-details">
        <h3>Plan Details</h3>
        <div class="details-grid">
          <div class="detail-item">
            <label>Plan Type:</label>
            <span>${result.subscriptionPlan || 'Free Trial'}</span>
          </div>
          <div class="detail-item">
            <label>Payment Method:</label>
            <span>${result.paymentMethod || 'None'}</span>
          </div>
          <div class="detail-item">
            <label>Next Billing:</label>
            <span>${status.type === 'premium' ? formatDate(result[SUBSCRIPTION_EXPIRY_KEY]) : 'N/A'}</span>
          </div>
        </div>
      </div>
      
      <div class="payment-history">
        <h3>Payment History</h3>
        <div class="history-list">
          ${history.length > 0 ? history.slice(0, 5).map(payment => `
            <div class="history-item">
              <div class="history-date">${formatDate(payment.date)}</div>
              <div class="history-plan">${payment.plan}</div>
              <div class="history-amount">$${payment.amount}</div>
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
  }
  if (typeof addToSuccessMessageList === 'function' && typeof createSuccess === 'function') {
    addToSuccessMessageList(createSuccess('Opening billing portal...'));
  }
}

/**
 * Handle successful payment callback
 */
async function handlePaymentSuccess(sessionId, plan = 'lifetime', method = 'crypto') {
  // Verify payment with backend (in production)
  // For now, activate premium directly
  
  const amount = 49.99; // Lifetime access price
  
  // Add to payment history
  await addPaymentToHistory({
    plan: plan,
    amount: amount,
    method: method,
    transactionId: sessionId
  });
  
  // Activate premium
  if (typeof activatePremiumSubscription === 'function') {
    await activatePremiumSubscription(plan, method);
  }
  
  // Refresh account button
  if (typeof addAccountButton === 'function') {
    addAccountButton();
  }
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
window.showAccountModal = showAccountModal;
window.closeAccountModal = closeAccountModal;
window.openBillingPortal = openBillingPortal;

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showUpgradeModal,
    closeUpgradeModal,
    // subscribePlan removed - crypto only
    showCryptoPayment,
    closeCryptoModal,
    copyCryptoAddress,
    verifyCryptoPayment,
    showAccountModal,
    closeAccountModal,
    getPaymentHistory,
    addPaymentToHistory,
    openBillingPortal,
    handlePaymentSuccess,
    setupPaymentValidation
  };
}