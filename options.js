document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('settingsForm').addEventListener('submit', saveSettings);

async function loadSettings() {
  const settings = await getPaperlessSettings();

  document.getElementById('paperlessUrl').value = settings.paperlessUrl || '';
  document.getElementById('paperlessToken').value = settings.paperlessToken || '';
  document.getElementById('defaultTags').value = settings.defaultTags || '';
}


async function requestSitePermission(url) {
  // Build a valid WebExtension match pattern from the URL.
  // Match patterns are "<scheme>://<host>/*" and MUST NOT contain a port
  // number or path. A pattern like "http://192.168.1.111:11800/*" is invalid
  // and makes permissions.request()/contains() reject, so we derive the origin
  // from the parsed scheme + hostname only (a host pattern matches all ports).
  let origin;
  try {
    const parsed = new URL(url);
    origin = `${parsed.protocol}//${parsed.hostname}/*`;
  } catch (_) {
    // Should not happen: the caller already validated the URL.
    return false;
  }

  // permissions.request() may only be called from a user input handler, and the
  // user gesture is lost across any await. Awaiting permissions.contains() first
  // therefore made this throw "permissions.request may only be called from a
  // user input handler". Requesting directly keeps the gesture intact; when the
  // permission is already granted, request() resolves true without prompting,
  // so a contains() pre-check is unnecessary.
  //
  // Returned (not awaited) so the request is issued synchronously while the
  // caller is still inside the submit handler.
  return browser.permissions.request({
    origins: [origin],
  });
}


async function saveSettings(event) {

  event.preventDefault();

  const paperlessUrl = document.getElementById('paperlessUrl').value.trim();
  const paperlessToken = document.getElementById('paperlessToken').value.trim();
  const defaultTags = document.getElementById('defaultTags').value.trim();

  // Validate URL format
  if (paperlessUrl && !isValidUrl(paperlessUrl)) {
    showStatus('Please enter a valid URL (including http:// or https://)', 'error');
    return;
  }

  // Request permission for the URL if it's provided
  if (paperlessUrl) {
    let permissionGranted = false;
    try {
      permissionGranted = await requestSitePermission(paperlessUrl);
    } catch (error) {
      showStatus('Error requesting permission for the specified URL: ' + error.message, 'error');
      console.error('Error requesting site permission:', error);
      return;
    }
    if (!permissionGranted) {
      showStatus('Permission to access the specified URL was denied. Please allow access to save the settings.', 'error');
      return;
    }
  }

  try {
    await browser.storage.sync.set({
      paperlessUrl: paperlessUrl.replace(/\/$/, ''), // Remove trailing slash
      paperlessToken: paperlessToken,
      defaultTags: defaultTags
    });

    showStatus('Settings saved successfully!', 'success');

    // Test connection if both URL and token are provided
    if (paperlessUrl && paperlessToken) {
      setTimeout(testConnection, 1000);
    }

  } catch (error) {
    showStatus('Error saving settings: ' + error.message, 'error');
    console.error('Error saving settings:', error);
  }
}

async function testConnection() {
  const settings = await getPaperlessSettings();

  const success = await testPaperlessConnection(settings.paperlessUrl, settings.paperlessToken);

  if (success) {
    showStatus('Settings saved and connection test successful!', 'success');
  } else {
    showStatus('Settings saved but connection test failed', 'error');
  }
}

function showStatus(message, type) {
  const statusEl = document.getElementById('statusMessage');
  statusEl.textContent = message;
  statusEl.className = `status-message status-${type}`;
  statusEl.style.display = 'block';

  if (type === 'success') {
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}