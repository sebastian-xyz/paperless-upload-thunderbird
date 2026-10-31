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
  return await browser.storage.sync.get(['paperlessUrl', 'paperlessToken', 'defaultTags', 'uploadAllFileTypes']);
}

/**
 * Test connection to Paperless-ngx API
 * @param {string} url - Paperless-ngx URL
 * @param {string} token - Paperless-ngx API token
 * @returns {Promise<boolean>} True if connection successful, false otherwise
 */
async function testPaperlessConnection(url, token) {
  try {
    // page_size=1: the default page contains 25 documents including their
    // full OCR text, which can be several MB just for a connection test
    const response = await fetch(`${url.replace(/\/$/, '')}/api/documents/?page_size=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${token}`
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
 * Notify the other extension pages (e.g. the upload dialog) about an event.
 * Dialogs are opened with browser.windows.create(), so window.opener is
 * always null and window.postMessage() cannot be used. runtime messaging
 * reaches every open extension page instead.
 * @param {string} action - Action name
 * @param {boolean} success - Whether the action was successful
 * @param {Object} data - Additional data to send (optional)
 */
async function sendMessageToParent(action, success, data = {}) {
  // The opening upload dialog passes its own id as ?opener=..., so that only
  // this dialog selects the new entry when several dialogs are open.
  const opener = new URLSearchParams(window.location.search).get('opener');
  try {
    await browser.runtime.sendMessage({ action, success, opener, ...data });
  } catch (error) {
    // No receiver (e.g. the upload dialog was closed in the meantime)
    console.debug('No receiver for', action, error);
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

/**
 * Fetch *all* objects of a paginated Paperless-ngx list endpoint.
 * Paperless returns only 25 results per page by default, so a plain
 * GET /api/tags/ silently drops everything after the first page.
 * We page via the `page` parameter instead of following `next`, because
 * `next` is often wrong (http vs https) behind reverse proxies.
 * @param {string} endpoint - e.g. '/api/tags/'
 * @param {Object} settings - optional settings object
 * @returns {Promise<Array>} all results
 */
async function fetchAllResults(endpoint, settings = null) {
  const results = [];
  const separator = endpoint.includes('?') ? '&' : '?';
  // Upper bound so a misbehaving server cannot cause an endless loop
  for (let page = 1; page <= 100; page++) {
    const response = await makePaperlessRequest(
      `${endpoint}${separator}page_size=1000&page=${page}`, {}, settings);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${endpoint}`);
    }
    const data = await response.json();
    results.push(...(data.results || []));
    if (!data.next || !data.results || data.results.length === 0) return results;
  }
  console.warn(`fetchAllResults: stopped after 100 pages of ${endpoint}`);
  return results;
}

/**
 * File types Paperless-ngx can consume.
 * PDF, images and plain text work out of the box, Office documents and
 * e-mails require the optional Tika/Gotenberg integration on the server.
 */
const PAPERLESS_FILE_TYPES = {
  pdf: {
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
  },
  extended: {
    extensions: [
      'png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'webp', 'bmp',
      'txt',
      'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf',
      'eml',
    ],
    mimeTypes: [
      'image/png', 'image/jpeg', 'image/tiff', 'image/gif', 'image/webp', 'image/bmp',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'application/rtf', 'text/rtf',
      'message/rfc822',
    ],
  },
};

/**
 * Whether an attachment can be uploaded to Paperless-ngx.
 * @param {{name: string, contentType: string}} attachment
 * @param {boolean} allowAllTypes - also accept images, text and Office files
 */
function isUploadableAttachment(attachment, allowAllTypes = false) {
  const groups = allowAllTypes
    ? [PAPERLESS_FILE_TYPES.pdf, PAPERLESS_FILE_TYPES.extended]
    : [PAPERLESS_FILE_TYPES.pdf];
  const name = (attachment.name || '').toLowerCase();
  const extension = name.includes('.') ? name.split('.').pop() : '';
  const contentType = (attachment.contentType || '').toLowerCase().split(';')[0].trim();
  return groups.some(group =>
    group.mimeTypes.includes(contentType) || group.extensions.includes(extension));
}

/**
 * Remove the file extension from a file name ("Invoice.2024.pdf" -> "Invoice.2024").
 */
function stripFileExtension(fileName) {
  // Only strip known extensions: "Kontoauszug 03.2025" must stay intact
  const name = fileName || '';
  const match = name.match(/\.([a-z0-9]+)$/i);
  const known = [...PAPERLESS_FILE_TYPES.pdf.extensions, ...PAPERLESS_FILE_TYPES.extended.extensions];
  return match && known.includes(match[1].toLowerCase()) ? name.slice(0, -match[0].length) : name;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'gif', 'webp', 'bmp'];

/**
 * Whether an attachment is an image (often a signature logo).
 */
function isImageAttachment(attachment) {
  const contentType = (attachment.contentType || '').toLowerCase();
  const extension = ((attachment.name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1];
  return contentType.startsWith('image/') || IMAGE_EXTENSIONS.includes(extension);
}

/**
 * Load the data a dialog window was opened with.
 * The storage key is passed as ?key=... in the window URL. The data is not
 * removed here, so reloading the dialog still works; the background script
 * removes old entries.
 */
async function takeDialogData() {
  const key = new URLSearchParams(window.location.search).get('key');
  if (!key) return null;
  const result = await browser.storage.local.get(key);
  return result[key] || null;
}

/**
 * Turn an error response of the Paperless-ngx API into a readable message.
 * DRF returns either {"detail": "..."} or field errors like
 * {"name": ["correspondent with this name already exists."]}.
 */
async function formatApiError(response) {
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (typeof data === 'string') return data;
    if (Array.isArray(data)) return data.join(' ');
    if (data.detail) return data.detail;
    const messages = Object.entries(data).map(([field, value]) =>
      `${field}: ${Array.isArray(value) ? value.join(' ') : value}`);
    if (messages.length > 0) return messages.join('; ');
  } catch (_) {
    // not JSON (e.g. HTML error page of a reverse proxy)
  }
  return `HTTP ${response.status} ${response.statusText}`.trim() +
    (text && text.length < 200 ? `: ${text}` : '');
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
  window.fetchAllResults = fetchAllResults;
  window.isUploadableAttachment = isUploadableAttachment;
  window.stripFileExtension = stripFileExtension;
  window.isImageAttachment = isImageAttachment;
  window.takeDialogData = takeDialogData;
  window.formatApiError = formatApiError;
}
