document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('settingsForm').addEventListener('submit', saveSettings);

async function loadSettings() {
  const settings = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken', 'defaultTags']);

  document.getElementById('paperlessUrl').value = settings.paperlessUrl || '';
  document.getElementById('paperlessToken').value = settings.paperlessToken || '';
  document.getElementById('defaultTags').value = settings.defaultTags || '';
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

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

async function testConnection() {
  const settings = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);

  try {
    const response = await fetch(`${settings.paperlessUrl}/api/documents/`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${settings.paperlessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      showStatus('Settings saved and connection test successful!', 'success');
    } else {
      showStatus(`Settings saved but connection test failed (HTTP ${response.status})`, 'error');
    }
  } catch (error) {
    showStatus('Settings saved but connection test failed: ' + error.message, 'error');
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