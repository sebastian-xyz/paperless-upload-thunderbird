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
    sendMessageToParent('documentTypeCreated', false);
    window.close();
  });
}

async function handleCreateDocumentType(event) {
  event.preventDefault();

  const createBtn = document.getElementById('createBtn');
  const originalText = setButtonLoading(createBtn, 'Creating...');

  try {
    clearMessages();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const enableMatching = document.getElementById('enableMatching').checked;

    if (!name) {
      showError('Document type name is required');
      return;
    }

    // Get Paperless settings
    const settings = await getPaperlessSettings();
    if (!settings.paperlessUrl || !settings.paperlessToken) {
      showError('Paperless-ngx settings not configured');
      return;
    }

    // Create document type via API
    const response = await makePaperlessRequest('/api/document_types/', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        matching_algorithm: enableMatching ? 6 : 0, // 6 = auto, 0 = none
        is_insensitive: true
      })
    }, settings);

    if (response.ok) {
      const newDocumentType = await response.json();
      showSuccess(`Created document type "${name}" successfully!`);

      // Send success message to parent window
      sendMessageToParent('documentTypeCreated', true, { documentType: newDocumentType });

      // Close window after delay
      closeWindowWithDelay(1500);
    } else {
      const errorData = await response.json();
      showError(`Failed to create document type: ${errorData.detail || response.statusText}`);
    }

  } catch (error) {
    console.error('Error creating document type:', error);
    showError(`Error creating document type: ${error.message}`);
  } finally {
    resetButtonLoading(createBtn, originalText);
  }
}
