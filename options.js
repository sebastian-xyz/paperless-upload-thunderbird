document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('settingsForm').addEventListener('submit', saveSettings);

async function loadSettings() {
  const settings = await getPaperlessSettings();

  document.getElementById('paperlessUrl').value = settings.paperlessUrl || '';
  document.getElementById('paperlessToken').value = settings.paperlessToken || '';
  document.getElementById('defaultTags').value = settings.defaultTags || '';
}


async function requestSitePermission(url) {
  // Normalize the origin to ensure it ends with /*
  const origin = url.replace(/\/?\*?$/, '/*');

  const hasPermission = await browser.permissions.contains({
    origins: [origin],
  });

  if (hasPermission) {
    // Permission already granted \u2014 safe to save and use the URL.
    return true;
  }

  const granted = await browser.permissions.request({
    origins: [origin],
  });

  // If not granted, it's not safe to save or use the URL,
  // since the user explicitly denied access.
  return granted;
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
    const permissionGranted = await requestSitePermission(paperlessUrl);
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