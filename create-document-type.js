document.addEventListener('DOMContentLoaded', function () {
  setupEventListeners();

  // Focus on the name input
  document.getElementById('documentTypeName').focus();
});

function setupEventListeners() {
  // Form submission
  document.getElementById('documentTypeForm').addEventListener('submit', handleCreateDocumentType);

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    // Send cancel message to parent
    if (window.opener) {
      window.opener.postMessage({ action: 'documentTypeCreated', success: false }, '*');
    }
    window.close();
  });
}

async function handleCreateDocumentType(event) {
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
      showError('Document type name is required');
      return;
    }

    // Get Paperless settings
    const settings = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);
    if (!settings.paperlessUrl || !settings.paperlessToken) {
      showError('Paperless-ngx settings not configured');
      return;
    }

    // Create document type via API
    const response = await fetch(`${settings.paperlessUrl}/api/document_types/`, {
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
      const newDocumentType = await response.json();
      showSuccess(`Created document type "${name}" successfully!`);

      // Send success message to parent window
      if (window.opener) {
        window.opener.postMessage({
          action: 'documentTypeCreated',
          success: true,
          documentType: newDocumentType
        }, '*');
      }

      // Close window after delay
      setTimeout(() => window.close(), 1500);
    } else {
      const errorData = await response.json();
      showError(`Failed to create document type: ${errorData.detail || response.statusText}`);
    }

  } catch (error) {
    console.error('Error creating document type:', error);
    showError(`Error creating document type: ${error.message}`);
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
