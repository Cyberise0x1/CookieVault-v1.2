// Enhanced Features JavaScript

// Dark Mode Toggle
function initializeDarkMode() {
    const themeToggle = document.getElementById("theme-toggle");
    const body = document.body;

    if (!themeToggle || !body) {
        return;
    }

    const themeIcon = themeToggle.querySelector(".theme-icon");

    // Load saved theme preference
    const savedTheme = localStorage.getItem("theme") || "light-mode";
    body.className = savedTheme;
    updateThemeIcon(savedTheme);

    themeToggle.addEventListener("click", () => {
        const currentTheme = body.className;
        const newTheme =
            currentTheme === "light-mode" ? "dark-mode" : "light-mode";
        body.className = newTheme;
        localStorage.setItem("theme", newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        if (themeIcon) {
            themeIcon.textContent = theme === "light-mode" ? "🌙" : "☀️";
        }
    }
}

// Status Dashboard
function updateStatusDashboard() {
    const totalCookiesEl = document.getElementById("total-cookies");
    const storageUsedEl = document.getElementById("storage-used");
    const statusElement = document.getElementById("auto-backup-status-dash");

    if (typeof chrome !== "undefined" && chrome.cookies) {
        chrome.cookies.getAll({}, (cookies) => {
            if (totalCookiesEl) {
                totalCookiesEl.textContent = cookies.length;
            }

            // Calculate approximate storage size
            const storageSize = JSON.stringify(cookies).length;
            const sizeInKB = (storageSize / 1024).toFixed(2);
            if (storageUsedEl) {
                storageUsedEl.textContent = `${sizeInKB} KB`;
            }
        });
    } else {
        if (totalCookiesEl) {
            totalCookiesEl.textContent = "N/A";
        }
        if (storageUsedEl) {
            storageUsedEl.textContent = "N/A";
        }
    }

    // Last backup time is now tracked via backup history instead of separate storage

    // Update auto-backup status
    const autoBackupSchedule =
        localStorage.getItem("autoBackupSchedule") || "disabled";
    if (statusElement) {
        if (autoBackupSchedule === "disabled") {
            statusElement.textContent = "Disabled";
            statusElement.className = "status-value status-disabled";
        } else {
            // Display user-friendly frequency text
            const frequencyMap = {
                "15min": "Every 15 minutes",
                "30min": "Every 30 minutes", 
                "hourly": "Every hour",
                "2hours": "Every 2 hours",
                "6hours": "Every 6 hours",
                "12hours": "Every 12 hours",
                "daily": "Daily",
                "weekly": "Weekly"
            };
            statusElement.textContent = frequencyMap[autoBackupSchedule] || autoBackupSchedule;
            statusElement.className = "status-value status-enabled";
        }
    }
}

// Selective Backup
let selectedCookies = new Set();

function initializeSelectiveBackup() {
    const selectiveBtn = document.getElementById("btn-selective-backup");
    const modal = document.getElementById("cookie-selection-modal");
    const closeBtn = document.getElementById("close-cookie-modal");
    const searchInput = document.getElementById("cookie-search");
    const selectAllBtn = document.getElementById("select-all-cookies");
    const deselectAllBtn = document.getElementById("deselect-all-cookies");
    const backupSelectedBtn = document.getElementById(
        "backup-selected-cookies",
    );

    if (selectiveBtn && modal) {
        selectiveBtn.addEventListener("click", () => {
            modal.classList.remove("hidden");
            loadCookiesForSelection();
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener("click", () => {
            modal.classList.add("hidden");
        });
    }

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            filterCookies(e.target.value);
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener("click", selectAllCookies);
    }
    if (deselectAllBtn) {
        deselectAllBtn.addEventListener("click", deselectAllCookies);
    }
    if (backupSelectedBtn) {
        backupSelectedBtn.addEventListener("click", backupSelectedCookies);
    }
}

function loadCookiesForSelection() {
    if (typeof chrome !== "undefined" && chrome.cookies) {
        chrome.cookies.getAll({}, (cookies) => {
            displayCookieList(groupCookiesByDomain(cookies));
        });
    } else {
        // Mock data for preview
        const mockCookies = [
            { domain: ".example.com", name: "session_id", value: "abc123" },
            { domain: ".google.com", name: "auth_token", value: "xyz789" },
            { domain: ".github.com", name: "user_session", value: "def456" },
        ];
        displayCookieList(groupCookiesByDomain(mockCookies));
    }
}

function groupCookiesByDomain(cookies) {
    const grouped = {};
    cookies.forEach((cookie) => {
        const domain = cookie.domain || "unknown";
        if (!grouped[domain]) {
            grouped[domain] = [];
        }
        grouped[domain].push(cookie);
    });
    return grouped;
}

function displayCookieList(groupedCookies) {
    const cookieList = document.getElementById("cookie-list");
    cookieList.textContent = "";

    Object.entries(groupedCookies).forEach(([domain, cookies]) => {
        const item = document.createElement("div");
        item.className = "cookie-item";
        item.dataset.domain = domain;

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "cookie-checkbox";
        checkbox.dataset.domain = domain;
        checkbox.addEventListener("change", (e) => {
            if (e.target.checked) {
                selectedCookies.add(domain);
                item.classList.add("selected");
            } else {
                selectedCookies.delete(domain);
                item.classList.remove("selected");
            }
            updateSelectedCount();
        });

        const info = document.createElement("div");
        info.className = "cookie-info";

        const domainLabel = document.createElement("div");
        domainLabel.className = "cookie-domain";
        domainLabel.textContent = domain;

        const cookieCount = document.createElement("span");
        cookieCount.className = "cookie-count";
        cookieCount.textContent = `${cookies.length} cookies`;

        info.appendChild(domainLabel);
        info.appendChild(cookieCount);

        item.appendChild(checkbox);
        item.appendChild(info);

        item.addEventListener("click", (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event("change"));
            }
        });

        cookieList.appendChild(item);
    });
}

function filterCookies(searchTerm) {
    const items = document.querySelectorAll(".cookie-item");
    items.forEach((item) => {
        const domain = item.dataset.domain.toLowerCase();
        if (domain.includes(searchTerm.toLowerCase())) {
            item.style.display = "flex";
        } else {
            item.style.display = "none";
        }
    });
}

function selectAllCookies() {
    document.querySelectorAll(".cookie-checkbox").forEach((checkbox) => {
        if (
            !checkbox.checked &&
            checkbox.parentElement.style.display !== "none"
        ) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change"));
        }
    });
}

function deselectAllCookies() {
    document.querySelectorAll(".cookie-checkbox").forEach((checkbox) => {
        if (checkbox.checked) {
            checkbox.checked = false;
            checkbox.dispatchEvent(new Event("change"));
        }
    });
}

function updateSelectedCount() {
    const selectedCountEl = document.getElementById("selected-count");
    if (selectedCountEl) {
        selectedCountEl.textContent = selectedCookies.size;
    }
}

function backupSelectedCookies() {
    if (selectedCookies.size === 0) {
        alert("Please select at least one domain to backup");
        return;
    }

    // Show password prompt
    document.getElementById("cookie-selection-modal").classList.add("hidden");
    document.getElementById("enc-passwd").classList.remove("hidden");

    // Store selection for use in backup
    window.selectedDomainsForBackup = Array.from(selectedCookies);
}

// Progress Indicators
function showProgress(type, percent, text) {
    const progressContainer = document.getElementById(`${type}-progress`);
    const progressFill = document.getElementById(`${type}-progress-fill`);
    const progressText = document.getElementById(`${type}-progress-text`);

    if (progressContainer) {
        progressContainer.classList.remove("hidden");
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text || `${percent}%`;

        if (percent >= 100) {
            setTimeout(() => {
                progressContainer.classList.add("hidden");
                progressFill.style.width = "0%";
            }, 2000);
        }
    }
}

// Backup History - Secure Storage Implementation
let backupHistory = [];

async function loadBackupHistory() {
    try {
        // Try chrome.storage.local first (more secure)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            // Use callback-based approach for Chrome storage
            chrome.storage.local.get(['backupHistory'], function(result) {
                if (chrome.runtime && chrome.runtime.lastError) {
                    console.error('Chrome storage error:', chrome.runtime.lastError);
                    // Fallback to localStorage
                    const stored = localStorage.getItem("backupHistory");
                    backupHistory = stored ? JSON.parse(stored) : [];
                } else {
                    backupHistory = result.backupHistory || [];
                }
                displayBackupHistory();
            });
        } else {
            // Fallback to localStorage for web preview
            console.warn("Chrome storage not available - using localStorage fallback");
            const stored = localStorage.getItem("backupHistory");
            backupHistory = stored ? JSON.parse(stored) : [];
            displayBackupHistory();
        }
    } catch (error) {
        console.error('Error loading backup history:', error);
        // Fallback to localStorage on error
        try {
            const stored = localStorage.getItem("backupHistory");
            backupHistory = stored ? JSON.parse(stored) : [];
        } catch (parseError) {
            console.error('Error parsing backup history:', parseError);
            backupHistory = [];
        }
        displayBackupHistory();
    }
}

async function addToBackupHistory(entry) {
    const historyEntry = {
        id: Date.now(),
        date: new Date().toISOString(),
        type: entry.type || "manual",
        cookieCount: entry.cookieCount || 0,
        size: entry.size || 0,
        filename: entry.filename || "unknown",
        encrypted: entry.encrypted || false,
    };

    backupHistory.unshift(historyEntry);

    // Keep only last 50 entries
    if (backupHistory.length > 50) {
        backupHistory = backupHistory.slice(0, 50);
    }

    try {
        // Try chrome.storage.local first (more secure)
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ backupHistory: backupHistory }, function() {
                if (chrome.runtime && chrome.runtime.lastError) {
                    console.error('Chrome storage error:', chrome.runtime.lastError);
                    // Fallback to localStorage
                    localStorage.setItem("backupHistory", JSON.stringify(backupHistory));
                }
                displayBackupHistory();
            });
        } else {
            // Fallback to localStorage for web preview
            console.warn("Chrome storage not available - using localStorage fallback");
            localStorage.setItem("backupHistory", JSON.stringify(backupHistory));
            displayBackupHistory();
        }
    } catch (error) {
        console.error('Error saving backup history:', error);
        // Fallback to localStorage on error
        try {
            localStorage.setItem("backupHistory", JSON.stringify(backupHistory));
        } catch (storageError) {
            console.error('Error saving to localStorage:', storageError);
        }
        displayBackupHistory();
    }
}

function displayBackupHistory() {
    const historyList = document.getElementById("backup-history-list");

    if (backupHistory.length === 0) {
        historyList.textContent = "";
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "history-empty";
        emptyDiv.textContent = "No backups yet";
        historyList.appendChild(emptyDiv);
        return;
    }

    historyList.textContent = "";

    backupHistory.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "history-item animated";

        const info = document.createElement("div");
        info.className = "history-info";

        const dateLabel = document.createElement("div");
        dateLabel.className = "history-date";
        dateLabel.textContent = formatDateTime(new Date(entry.date));

        const details = document.createElement("div");
        details.className = "history-details";
        
        // Extract profile name from filename if present
        let profileName = "";
        if (entry.filename) {
            // Check for profile name pattern in filename (cookies-ProfileName-date-time.ckz)
            const match = entry.filename.match(/cookies-([^-]+)-\d{2}-\d{2}-\d{4}/);
            if (match && match[1] && match[1] !== 'auto') {
                profileName = match[1] + " • ";
            }
        }
        
        details.textContent = `${profileName}${entry.cookieCount} cookies • ${formatFileSize(entry.size)} • ${entry.type}`;
        if (entry.encrypted) {
            details.textContent += " • 🔒";
        }

        info.appendChild(dateLabel);
        info.appendChild(details);

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const downloadBtn = document.createElement("button");
        downloadBtn.className = "history-action";
        downloadBtn.textContent = "Download";
        downloadBtn.addEventListener("click", () => {
            // Trigger download of stored backup
            // Download backup action triggered
        });

        actions.appendChild(downloadBtn);

        item.appendChild(info);
        item.appendChild(actions);

        historyList.appendChild(item);
    });
}

// Compression Support
function compressData(data) {
    // Using pako library for compression (would need to be included)
    // For now, returning data as-is
    return data;
}

function decompressData(data) {
    // Using pako library for decompression (would need to be included)
    // For now, returning data as-is
    return data;
}

// Checksum for integrity
function calculateChecksum(data) {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
}

function verifyChecksum(data, checksum) {
    return calculateChecksum(data) === checksum;
}

// Utility Functions
function formatDateTime(date) {
    const options = {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    };
    return date.toLocaleDateString("en-US", options);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

// Auto-lock feature
let lockTimeout;
let autoLockEnabled = false;
const LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
let activityListeners = [];

function initializeAutoLock() {
    const autoLockToggle = document.getElementById("auto-lock-toggle");
    const lockIcon = autoLockToggle?.querySelector(".lock-icon");

    // Load saved auto-lock preference
    autoLockEnabled = localStorage.getItem("autoLockEnabled") === "true";

    // Update UI based on saved state
    if (autoLockToggle) {
        if (autoLockEnabled) {
            autoLockToggle.classList.add("locked");
            if (lockIcon) lockIcon.textContent = "🔒";
            startAutoLock();
        } else {
            autoLockToggle.classList.remove("locked");
            if (lockIcon) lockIcon.textContent = "🔓";
        }

        // Remove any existing click handler first to prevent duplicates
        autoLockToggle.removeEventListener("click", toggleAutoLock);
        // Add click handler for toggle
        autoLockToggle.addEventListener("click", toggleAutoLock);
    }
}

function toggleAutoLock() {
    const autoLockToggle = document.getElementById("auto-lock-toggle");
    const lockIcon = autoLockToggle?.querySelector(".lock-icon");

    autoLockEnabled = !autoLockEnabled;
    localStorage.setItem("autoLockEnabled", autoLockEnabled);

    if (autoLockEnabled) {
        autoLockToggle.classList.add("locked");
        if (lockIcon) lockIcon.textContent = "🔒";
        startAutoLock();
        // Show success message if functions are available
        if (
            typeof window.addToSuccessMessageList === "function" &&
            typeof window.createSuccessAlert === "function"
        ) {
            window.addToSuccessMessageList(
                window.createSuccessAlert(
                    "Auto-lock enabled (5 minutes of inactivity)",
                ),
            );
        }
    } else {
        autoLockToggle.classList.remove("locked");
        if (lockIcon) lockIcon.textContent = "🔓";
        stopAutoLock();
        // Show success message if functions are available
        if (
            typeof window.addToSuccessMessageList === "function" &&
            typeof window.createSuccessAlert === "function"
        ) {
            window.addToSuccessMessageList(
                window.createSuccessAlert("Auto-lock disabled"),
            );
        }
    }
}

function startAutoLock() {
    // First clear any existing listeners to prevent duplicates
    stopAutoLock();

    // Add activity listeners
    const events = ["click", "keypress", "scroll", "mousemove"];
    events.forEach((event) => {
        const listener = () => resetLockTimer();
        document.addEventListener(event, listener);
        activityListeners.push({ event, listener });
    });

    resetLockTimer();
}

function stopAutoLock() {
    // Remove all activity listeners
    activityListeners.forEach(({ event, listener }) => {
        document.removeEventListener(event, listener);
    });
    activityListeners = [];

    // Clear any existing timeout
    clearTimeout(lockTimeout);
}

function resetLockTimer() {
    if (!autoLockEnabled) return;

    clearTimeout(lockTimeout);
    lockTimeout = setTimeout(() => {
        lockExtension();
    }, LOCK_TIMEOUT);
}

function lockExtension() {
    // Clear sensitive data from view
    document.querySelectorAll('input[type="password"]').forEach((input) => {
        input.value = "";
    });

    // Hide sensitive sections
    document.getElementById("enc-passwd").classList.add("hidden");
    document.getElementById("dec-passwd").classList.add("hidden");

    // Show lock notification
    addToWarningMessageList(
        createWarning("Extension locked due to inactivity"),
    );
}

// Add test backup entries for preview environment
async function addTestBackupEntries() {
    const testEntries = [
        {
            type: "manual",
            cookieCount: 45,
            size: 2048,
            filename: "cookies-Work-10-09-2025-14-30-15.ckz",
            encrypted: true
        },
        {
            type: "automatic",
            cookieCount: 38,
            size: 1756,
            filename: "cookies-auto-10-09-2025-13-15-00.json",
            encrypted: false
        },
        {
            type: "manual",
            cookieCount: 52,
            size: 2341,
            filename: "cookies-Shopping-10-09-2025-11-45-22.ckz",
            encrypted: true
        }
    ];
    
    for (const entry of testEntries) {
        await addToBackupHistory(entry);
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

// Initialize all features when DOM is ready
document.addEventListener("DOMContentLoaded", async () => {
    initializeDarkMode();
    updateStatusDashboard();
    initializeSelectiveBackup();
    await loadBackupHistory();
    initializeAutoLock();
    
    // Add test backup entries for preview (only if no existing history)
    if (backupHistory.length === 0 && typeof chrome === 'undefined') {
        console.log('Adding test backup history for preview');
        await addTestBackupEntries();
    }

    // Update dashboard periodically
    setInterval(updateStatusDashboard, 30000); // Every 30 seconds
});

// Export functions for use in popup.js
window.enhancedFeatures = {
    showProgress,
    addToBackupHistory,
    compressData,
    decompressData,
    calculateChecksum,
    verifyChecksum,
    updateStatusDashboard,
};
