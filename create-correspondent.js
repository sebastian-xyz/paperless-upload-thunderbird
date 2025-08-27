document.addEventListener('DOMContentLoaded', function () {
  setupEventListeners();

  // Focus on the name input
  document.getElementById('correspondentName').focus();
});

function setupEventListeners() {
  // Form submission
  document.getElementById('correspondentForm').addEventListener('submit', handleCreateCorrespondent);

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    // Send cancel message to parent
    if (window.opener) {
      window.opener.postMessage({ action: 'correspondentCreated', success: false }, '*');
    }
    window.close();
  });
}

async function handleCreateCorrespondent(event) {
  event.preventDefault();

  const createBtn = document.getElementById('createBtn');
  const originalText = createBtn.textContent;

  try {
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    clearMessages();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const enableMatching = document.getElementById('enableMatching').checked;

    if (!name) {
      showError('Correspondent name is required');
      return;
    }

    // Get Paperless settings
    const settings = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);
    if (!settings.paperlessUrl || !settings.paperlessToken) {
      showError('Paperless-ngx settings not configured');
      return;
    }

    // Create correspondent via API
    const response = await fetch(`${settings.paperlessUrl}/api/correspondents/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${settings.paperlessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        matching_algorithm: enableMatching ? 6 : 0, // 6 = auto, 0 = none
        is_insensitive: true
      })
    });

    if (response.ok) {
      const newCorrespondent = await response.json();
      showSuccess(`Created correspondent "${name}" successfully!`);

      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          action: 'correspondentCreated',
          success: true,
          correspondent: newCorrespondent
        }, '*');
      }

      // Close window after delay
      setTimeout(() => window.close(), 1500);
    } else {
      const errorData = await response.json();
      showError(`Failed to create correspondent: ${errorData.detail || response.statusText}`);
    }

  } catch (error) {
    console.error('Error creating correspondent:', error);
    showError(`Error creating correspondent: ${error.message}`);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = originalText;
  }
}

function showError(message) {
  const messageArea = document.getElementById('messageArea');
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = message;
  messageArea.appendChild(errorDiv);
}

function showSuccess(message) {
  const messageArea = document.getElementById('messageArea');
  const successDiv = document.createElement('div');
  successDiv.className = 'success';
  successDiv.textContent = message;
  messageArea.appendChild(successDiv);
}

function clearMessages() {
  const messageArea = document.getElementById('messageArea');
  while (messageArea.firstChild) {
    messageArea.removeChild(messageArea.firstChild);
  }
}
