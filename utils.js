// Shared utility functions for Paperless-ngx PDF Uploader extension


/**
 * Display an error message in the message area
 * @param {string} message - Error message to display
 * @param {string} messageAreaId - ID of the message area element (default: 'messageArea')
 */
function showError(message, messageAreaId = 'messageArea') {
  const messageArea = document.getElementById(messageAreaId);
  if (!messageArea) {
    console.error('Message area element not found:', messageAreaId);
    return;
  }

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = message;
  messageArea.appendChild(errorDiv);
}

/**
 * Display a success message in the message area
 * @param {string} message - Success message to display
 * @param {string} messageAreaId - ID of the message area element (default: 'messageArea')
 */
function showSuccess(message, messageAreaId = 'messageArea') {
  const messageArea = document.getElementById(messageAreaId);
  if (!messageArea) {
    console.error('Message area element not found:', messageAreaId);
    return;
  }

  const successDiv = document.createElement('div');
  successDiv.className = 'success';
  successDiv.textContent = message;
  messageArea.appendChild(successDiv);
}

/**
 * Clear all messages from the message area
 * @param {string} messageAreaId - ID of the message area element (default: 'messageArea')
 */
function clearMessages(messageAreaId = 'messageArea') {
  const messageArea = document.getElementById(messageAreaId);
  if (!messageArea) {
    console.error('Message area element not found:', messageAreaId);
    return;
  }

  while (messageArea.firstChild) {
    messageArea.removeChild(messageArea.firstChild);
  }
}

/**
 * Get Paperless-ngx settings from browser storage
 * @returns {Promise<Object>} Settings object with paperlessUrl, paperlessToken, and defaultTags
 */
async function getPaperlessSettings() {
  return await browser.storage.sync.get(['paperlessUrl', 'paperlessToken', 'defaultTags']);
}

/**
 * Test connection to Paperless-ngx API
 * @param {string} url - Paperless-ngx URL
 * @param {string} token - Paperless-ngx API token
 * @returns {Promise<boolean>} True if connection successful, false otherwise
 */
async function testPaperlessConnection(url, token) {
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/api/documents/`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json'
      }
    });
    return response.ok;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

/**
 * Validate if a string is a valid URL
 * @param {string} string - String to validate
 * @returns {boolean} True if valid URL, false otherwise
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Extract name from email string (removes email part in angle brackets)
 * @param {string} emailString - Email string like "John Doe <john@example.com>"
 * @returns {string} Extracted name or original string if no angle brackets
 */
function extractNameFromEmail(emailString) {
  if (!emailString) return '';

  // Check if email is in format "Name <email@domain.com>"
  const match = emailString.match(/^(.+?)\s*<.+>$/);
  if (match) {
    return match[1].trim();
  }

  // If no angle brackets, return the original string
  return emailString.trim();
}

/**
 * Set button to loading state
 * @param {HTMLButtonElement} button - Button element
 * @param {string} loadingText - Text to show while loading (default: 'Loading...')
 * @returns {string} Original button text
 */
function setButtonLoading(button, loadingText = 'Loading...') {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  return originalText;
}

/**
 * Reset button from loading state
 * @param {HTMLButtonElement} button - Button element
 * @param {string} originalText - Original button text to restore
 */
function resetButtonLoading(button, originalText) {
  button.disabled = false;
  button.textContent = originalText;
}

/**
 * Send message to parent window (for popup dialogs)
 * @param {string} action - Action name
 * @param {boolean} success - Whether the action was successful
 * @param {Object} data - Additional data to send (optional)
 */
function sendMessageToParent(action, success, data = {}) {
  if (window.opener) {
    window.opener.postMessage({
      action: action,
      success: success,
      ...data
    }, '*');
  }
}

/**
 * Close window with optional delay
 * @param {number} delay - Delay in milliseconds (default: 0)
 */
function closeWindowWithDelay(delay = 0) {
  if (delay > 0) {
    setTimeout(() => window.close(), delay);
  } else {
    window.close();
  }
}

/**
 * Make API request to Paperless-ngx
 * @param {string} endpoint - API endpoint (e.g., '/api/documents/')
 * @param {Object} options - Fetch options
 * @param {Object} settings - Paperless settings with url and token
 * @returns {Promise<Response>} Fetch response
 */
async function makePaperlessRequest(endpoint, options = {}, settings = null) {
  if (!settings) {
    settings = await getPaperlessSettings();
  }

  if (!settings.paperlessUrl || !settings.paperlessToken) {
    throw new Error('Paperless-ngx settings not configured');
  }

  const url = `${settings.paperlessUrl.replace(/\/$/, '')}${endpoint}`;
  const defaultOptions = {
    headers: {
      'Authorization': `Token ${settings.paperlessToken}`,
      'Content-Type': 'application/json'
    }
  };

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...(options.headers || {})
    }
  };

  return await fetch(url, mergedOptions);
}

// Export functions for use in other files
if (typeof window !== 'undefined') {
  window.showError = showError;
  window.showSuccess = showSuccess;
  window.clearMessages = clearMessages;
  window.getPaperlessSettings = getPaperlessSettings;
  window.testPaperlessConnection = testPaperlessConnection;
  window.isValidUrl = isValidUrl;
  window.extractNameFromEmail = extractNameFromEmail;
  window.setButtonLoading = setButtonLoading;
  window.resetButtonLoading = resetButtonLoading;
  window.sendMessageToParent = sendMessageToParent;
  window.closeWindowWithDelay = closeWindowWithDelay;
  window.makePaperlessRequest = makePaperlessRequest;
}
