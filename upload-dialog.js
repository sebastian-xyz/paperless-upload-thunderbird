let currentAttachments = [];
let currentMessage = null;
let selectedTags = [];
let availableTags = [];

document.addEventListener('DOMContentLoaded', async function () {
  await loadUploadData();
  setupEventListeners();
  await loadPaperlessData();
});

async function loadUploadData() {
  try {
    const result = await browser.storage.local.get('currentUploadData');
    const uploadData = result.currentUploadData;

    if (!uploadData) {
      showError("No upload data found. Please try again.");
      return;
    }

    currentMessage = uploadData.message;
    currentAttachments = uploadData.attachments;

    // Populate email info
    document.getElementById('emailFrom').textContent = currentMessage.author;
    document.getElementById('emailSubject').textContent = currentMessage.subject;
    document.getElementById('emailDate').textContent = new Date(currentMessage.date).toLocaleDateString();

    // Populate file list
    const fileList = document.getElementById('fileList');
    currentAttachments.forEach(attachment => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.textContent = `📄 ${attachment.name} (${formatFileSize(attachment.size)})`;
      fileList.appendChild(li);
    });

    // Set default title (first attachment name without extension)
    if (currentAttachments.length > 0) {
      const defaultTitle = currentAttachments[0].name.replace(/\.pdf$/i, '');
      document.getElementById('documentTitle').value = defaultTitle;
    }

    // Set default date to email date
    const emailDate = new Date(currentMessage.date);
    document.getElementById('documentDate').value = emailDate.toISOString().split('T')[0];

    // Show main content
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

  } catch (error) {
    console.error('Error loading upload data:', error);
    showError('Error loading data: ' + error.message);
  }
}

async function loadPaperlessData() {
  try {
    // get paperless url and token
    const settings = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);

    // Fetch correspondents from Paperless-ngx API if settings are available
    let correspondents = [];
    if (settings.paperlessUrl && settings.paperlessToken) {
      try {
        const response = await fetch(`${settings.paperlessUrl}/api/correspondents/`, {
          headers: {
            'Authorization': `Token ${settings.paperlessToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Store both name and id for each correspondent
          correspondents = data.results.map(c => ({ id: c.id, name: c.name }));
          // You can use 'correspondents' as needed here
          // Example: console.log(correspondents);
        }
      } catch (err) {
        console.error('Failed to fetch correspondents from Paperless-ngx:', err);
      }
    }

    if (correspondents.length > 0) {
      const correspondentSelect = document.getElementById('correspondent');
      correspondents.forEach(correspondent => {
        const option = document.createElement('option');
        option.value = correspondent.id;
        option.textContent = correspondent.name;
        correspondentSelect.appendChild(option);
      });

    }


    document_types = [];
    // Fetch document types from Paperless-ngx API if settings are available
    if (settings.paperlessUrl && settings.paperlessToken) {
      try {
        const response = await fetch(`${settings.paperlessUrl}/api/document_types/`, {
          headers: {
            'Authorization': `Token ${settings.paperlessToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Store document types
          document_types = data.results.map(d => ({ id: d.id, name: d.name }));
        }
      } catch (err) {
        console.error('Failed to fetch document types from Paperless-ngx:', err);
      }
    }

    if (document_types.length > 0) {
      const docTypeSelect = document.getElementById('documentType');
      document_types.forEach(docType => {
        const option = document.createElement('option');
        option.value = docType.id;
        option.textContent = docType.name;
        docTypeSelect.appendChild(option);
      });
    }


    tags = [];

    // Fetch tags from Paperless-ngx API if settings are available
    if (settings.paperlessUrl && settings.paperlessToken) {
      try {
        const response = await fetch(`${settings.paperlessUrl}/api/tags/`, {
          headers: {
            'Authorization': `Token ${settings.paperlessToken}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Store tags
          tags = data.results.map(t => ({ id: t.id, name: t.name }));
        }
      } catch (err) {
        console.error('Failed to fetch tags from Paperless-ngx:', err);
      }
    }

    if (tags.length > 0) {
      availableTags = tags;
    }

  } catch (error) {
    console.error('Error loading Paperless data:', error);
    // Continue without the data - it's not critical for basic upload
  }
}

function setupEventListeners() {
  // Form submission
  document.getElementById('uploadForm').addEventListener('submit', handleUpload);

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    window.close();
  });

  // Tags input
  const tagInput = document.querySelector('.tag-input');
  tagInput.addEventListener('keydown', handleTagInput);
  tagInput.addEventListener('input', handleTagAutocomplete);
}

function handleTagInput(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const tagValue = event.target.value.trim();
    if (tagValue && !selectedTags.includes(tagValue)) {
      addTag(tagValue);
      event.target.value = '';
    }
  } else if (event.key === 'Backspace' && event.target.value === '') {
    // Remove last tag on backspace if input is empty
    if (selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  }
}

function handleTagAutocomplete(event) {
  // Simple autocomplete could be implemented here
  // For now, we'll keep it simple
}

function addTag(tagName) {
  if (!selectedTags.includes(tagName)) {
    selectedTags.push(tagName);
    renderTags();
  }
}

function removeTag(tagName) {
  selectedTags = selectedTags.filter(tag => tag !== tagName);
  renderTags();
}

function renderTags() {
  const tagsContainer = document.getElementById('tagsInput');
  const tagInput = tagsContainer.querySelector('.tag-input');

  // Remove existing tag elements
  tagsContainer.querySelectorAll('.tag-item').forEach(el => el.remove());

  // Add tag elements
  selectedTags.forEach(tag => {
    const tagElement = document.createElement('div');
    tagElement.className = 'tag-item';
    tagElement.innerHTML = `
      ${tag}
      <span class="tag-remove" onclick="removeTag('${tag}')">×</span>
    `;
    tagsContainer.insertBefore(tagElement, tagInput);
  });
}

async function handleUpload(event) {
  event.preventDefault();

  const uploadBtn = document.getElementById('uploadBtn');
  const originalText = uploadBtn.textContent;

  try {
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading...';

    clearMessages();

    // Collect form data
    const formData = new FormData(event.target);
    const uploadOptions = {
      title: formData.get('title'),
      correspondent: formData.get('correspondent') || undefined,
      document_type: formData.get('document_type') || undefined,
      created: formData.get('created') || undefined,
      source: formData.get('source') || undefined,
      tags: selectedTags
    };

    // Upload each attachment
    let successCount = 0;
    let errorCount = 0;

    for (const attachment of currentAttachments) {
      try {
        const result = await browser.runtime.sendMessage({
          action: 'uploadWithOptions',
          messageData: currentMessage,
          attachmentData: attachment,
          uploadOptions: uploadOptions
        });

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          showError(`Failed to upload ${attachment.name}: ${result.error}`);
        }
      } catch (error) {
        errorCount++;
        showError(`Error uploading ${attachment.name}: ${error.message}`);
      }
    }

    if (successCount > 0 && errorCount === 0) {
      showSuccess(`Successfully uploaded ${successCount} document(s) to Paperless-ngx!`);
      setTimeout(() => window.close(), 2000);
    } else if (successCount > 0) {
      showSuccess(`Uploaded ${successCount} document(s). ${errorCount} failed.`);
    }

  } catch (error) {
    console.error('Upload error:', error);
    showError('Upload failed: ' + error.message);
  } finally {
    uploadBtn.disabled = false;
    uploadBtn.textContent = originalText;
  }
}

function extractNameFromEmail(emailString) {
  const match = emailString.match(/^(.+?)\s*<.+>$/);
  return match ? match[1].trim() : emailString.split('@')[0];
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
  document.getElementById('messageArea').innerHTML = '';
}

// Make removeTag available globally for the tag elements
window.removeTag = removeTag;