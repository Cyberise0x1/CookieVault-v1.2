// Web Browser Compatibility Layer for Chrome Extension
// This fixes Chrome API issues when running in regular web browsers

(function() {
  'use strict';

  // Check if we're in a Chrome extension context
  const isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

  if (!isExtensionContext) {
    console.warn('Chrome extension APIs not available - creating compatibility layer');
    
    // Mock Chrome object structure
    if (typeof chrome === 'undefined') {
      window.chrome = {};
    }

    // Mock chrome.storage
    if (!chrome.storage) {
      chrome.storage = {
        local: {
          get: function(keys, callback) {
            if (typeof keys === 'string') keys = [keys];
            const result = {};
            if (Array.isArray(keys)) {
              keys.forEach(key => {
                const value = localStorage.getItem(key);
                if (value !== null) {
                  try {
                    result[key] = JSON.parse(value);
                  } catch {
                    result[key] = value;
                  }
                }
              });
            } else if (typeof keys === 'object') {
              Object.keys(keys).forEach(key => {
                const value = localStorage.getItem(key);
                if (value !== null) {
                  try {
                    result[key] = JSON.parse(value);
                  } catch {
                    result[key] = value;
                  }
                } else {
                  result[key] = keys[key]; // default value
                }
              });
            }
            if (callback) setTimeout(() => callback(result), 0);
          },
          set: function(items, callback) {
            Object.keys(items).forEach(key => {
              const value = typeof items[key] === 'object' ? JSON.stringify(items[key]) : items[key];
              localStorage.setItem(key, value);
            });
            if (callback) setTimeout(callback, 0);
          }
        }
      };
    }

    // Mock chrome.cookies
    if (!chrome.cookies) {
      chrome.cookies = {
        getAll: function(details, callback) {
          // In web context, we can't access actual cookies, so return mock data
          console.warn('Chrome cookies API not available in web context');
          const mockCookies = [
            {
              domain: '.example.com',
              name: 'demo_cookie_1',
              value: 'sample_value_1',
              path: '/',
              secure: false,
              httpOnly: false
            },
            {
              domain: '.demo.com',
              name: 'demo_cookie_2', 
              value: 'sample_value_2',
              path: '/',
              secure: true,
              httpOnly: true
            }
          ];
          if (callback) setTimeout(() => callback(mockCookies), 100);
        }
      };
    }

    // Mock chrome.runtime
    if (!chrome.runtime) {
      chrome.runtime = {
        id: 'web_preview_mode',
        onMessage: {
          addListener: function(callback) {
            // Mock message listener
            console.log('Mock runtime message listener added');
          }
        },
        sendMessage: function(message, callback) {
          console.warn('Runtime messaging not available in web context');
          if (callback) callback({error: 'Web context - no runtime messaging'});
        },
        lastError: null
      };
    }

    // Mock chrome.downloads
    if (!chrome.downloads) {
      chrome.downloads = {
        download: function(options, callback) {
          // Fallback to regular download
          console.warn('Chrome downloads API not available - using fallback');
          const blob = new Blob([options.url], { type: 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = options.url;
          a.download = options.filename;
          a.click();
          URL.revokeObjectURL(url);
          if (callback) callback(Date.now());
        }
      };
    }

    // Mock chrome.alarms
    if (!chrome.alarms) {
      chrome.alarms = {
        create: function(name, alarmInfo) {
          console.warn('Chrome alarms API not available in web context');
        },
        clear: function(name, callback) {
          if (callback) callback(true);
        },
        onAlarm: {
          addListener: function(callback) {
            console.log('Mock alarm listener added');
          }
        }
      };
    }

    // Add web context indicator
    window.isWebPreview = true;
    
    // Show user notification
    document.addEventListener('DOMContentLoaded', function() {
      const header = document.querySelector('.header-green');
      if (header) {
        const notice = document.createElement('div');
        notice.style.cssText = 'background:#fff3cd;color:#856404;padding:8px;margin:5px 0;border-radius:4px;font-size:12px;text-align:center;border:1px solid #ffeaa7;';
        notice.innerHTML = '🔍 <strong>Preview Mode</strong> - Install as Chrome extension for full functionality';
        header.insertAdjacentElement('afterend', notice);
      }
    });
  }

  // Enhanced error handling for web context
  window.safeExtensionCall = function(fn, fallback) {
    try {
      if (isExtensionContext) {
        return fn();
      } else {
        console.warn('Extension API call in web context - using fallback');
        return fallback ? fallback() : null;
      }
    } catch (error) {
      console.error('Extension API error:', error);
      return fallback ? fallback() : null;
    }
  };

})();