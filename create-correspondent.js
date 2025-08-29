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
    sendMessageToParent('correspondentCreated', false);
    window.close();
  });
}

async function handleCreateCorrespondent(event) {
  event.preventDefault();

  const createBtn = document.getElementById('createBtn');
  const originalText = setButtonLoading(createBtn, 'Creating...');

  try {
    clearMessages();

    const formData = new FormData(event.target);
    const name = formData.get('name').trim();
    const enableMatching = document.getElementById('enableMatching').checked;

    if (!name) {
      showError('Correspondent name is required');
      return;
    }

    // Get Paperless settings
    const settings = await getPaperlessSettings();
    if (!settings.paperlessUrl || !settings.paperlessToken) {
      showError('Paperless-ngx settings not configured');
      return;
    }

    // Create correspondent via API
    const response = await makePaperlessRequest('/api/correspondents/', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        matching_algorithm: enableMatching ? 6 : 0, // 6 = auto, 0 = none
        is_insensitive: true
      })
    }, settings);

    if (response.ok) {
      const newCorrespondent = await response.json();
      showSuccess(`Created correspondent "${name}" successfully!`);

      // Send success message to parent window
      sendMessageToParent('correspondentCreated', true, { correspondent: newCorrespondent });

      // Close window after delay
      closeWindowWithDelay(1500);
    } else {
      const errorData = await response.json();
      showError(`Failed to create correspondent: ${errorData.detail || response.statusText}`);
    }

  } catch (error) {
    console.error('Error creating correspondent:', error);
    showError(`Error creating correspondent: ${error.message}`);
  } finally {
    resetButtonLoading(createBtn, originalText);
  }
}
