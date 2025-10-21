document.addEventListener('DOMContentLoaded', async function () {
  const quickUploadBtn = document.getElementById('quick-upload-btn');
  const advancedUploadBtn = document.getElementById('advanced-upload-btn');
  const errorContainer = document.getElementById('error-container');

  quickUploadBtn.addEventListener('click', async () => {
    await handleQuickUpload(errorContainer);
  });

  advancedUploadBtn.addEventListener('click', async () => {
    await handleAdvancedUpload(errorContainer);
  });
});

async function handleQuickUpload(errorContainer) {
  try {
    clearError(errorContainer);
    const currentTab = await getCurrentTab();

    if (!currentTab) {
      showError(errorContainer, 'Unable to determine current tab');
      return;
    }

    // Get the displayed messages (returns a MessageList)
    const messageList = await browser.messageDisplay.getDisplayedMessages(currentTab.id);

    // Get the first message from the MessageList
    let message = null;

    if (messageList && messageList.messages && messageList.messages.length > 0) {
      message = messageList.messages[0];
    }

    if (!message) {
      showError(errorContainer, 'No message is currently displayed');
      return;
    }

    // Send message to background script for quick upload
    await browser.runtime.sendMessage({
      action: 'quickUploadFromDisplay',
      messageId: message.id
    });

    // Close the popup
    window.close();
  } catch (error) {
    console.error('Error in quick upload:', error);
    showError(errorContainer, 'Error initiating quick upload');
  }
}

async function handleAdvancedUpload(errorContainer) {
  try {
    clearError(errorContainer);
    const currentTab = await getCurrentTab();

    if (!currentTab) {
      showError(errorContainer, 'Unable to determine current tab');
      return;
    }

    // Get the displayed messages (returns a MessageList)
    const messageList = await browser.messageDisplay.getDisplayedMessages(currentTab.id);

    // Get the first message from the MessageList
    let message = null;

    if (messageList && messageList.messages && messageList.messages.length > 0) {
      message = messageList.messages[0];
    }

    if (!message) {
      showError(errorContainer, 'No message is currently displayed');
      return;
    }

    // Send message to background script for advanced upload
    await browser.runtime.sendMessage({
      action: 'advancedUploadFromDisplay',
      messageId: message.id
    });

    // Close the popup
    window.close();
  } catch (error) {
    console.error('Error in advanced upload:', error);
    showError(errorContainer, 'Error initiating advanced upload');
  }
}

async function getCurrentTab() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs.length > 0 ? tabs[0] : null;
  } catch (error) {
    console.error('Error getting current tab:', error);
    return null;
  }
}

function showError(container, message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  clearError(container);
  container.appendChild(errorDiv);
}

function clearError(container) {
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
}
