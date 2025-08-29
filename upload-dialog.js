let currentAttachments = [];
let currentMessage = null;
let selectedTags = [];
let availableTags = [];
let fuse = null;

document.addEventListener('DOMContentLoaded', async function () {
  await loadUploadData();
  setupEventListeners();
  await loadPaperlessData();
  setupPlusButtons();
});
// Add event listeners for plus buttons to create new correspondent/document type
function setupPlusButtons() {
  const addCorrespondentBtn = document.getElementById('addCorrespondentBtn');
  if (addCorrespondentBtn) {
    addCorrespondentBtn.addEventListener('click', async () => {
      await createNewCorrespondent();
    });
  }
  const addDocumentTypeBtn = document.getElementById('addDocumentTypeBtn');
  if (addDocumentTypeBtn) {
    addDocumentTypeBtn.addEventListener('click', async () => {
      await createNewDocumentType();
    });
  }

  // Listen for messages from popup windows
  window.addEventListener('message', handlePopupMessage);
}

async function createNewCorrespondent() {
  try {
    const popup = await browser.windows.create({
      url: browser.runtime.getURL('create-correspondent.html'),
      type: 'popup',
      width: 600,
      height: 500
    });
  } catch (error) {
    console.error('Error opening correspondent creation window:', error);
  }
}

async function createNewDocumentType() {
  try {
    const popup = await browser.windows.create({
      url: browser.runtime.getURL('create-document-type.html'),
      type: 'popup',
      width: 600,
      height: 500,
    });
  } catch (error) {
    console.error('Error opening document type creation window:', error);
  }
}

function handlePopupMessage(event) {
  if (event.data.action === 'correspondentCreated' && event.data.success) {
    // Repopulate correspondents and select the new one
    repopulateCorrespondents().then(() => {
      if (event.data.correspondent) {
        const select = document.getElementById('correspondent');
        select.value = event.data.correspondent.id;
        showSuccess(`Correspondent "${event.data.correspondent.name}" created successfully!`);
      }
    });
  } else if (event.data.action === 'documentTypeCreated' && event.data.success) {
    // Repopulate document types and select the new one
    repopulateDocumentTypes().then(() => {
      if (event.data.documentType) {
        const select = document.getElementById('documentType');
        select.value = event.data.documentType.id;
        showSuccess(`Document type "${event.data.documentType.name}" created successfully!`);
      }
    });
  }
}

async function repopulateCorrespondents() {
  try {
    const settings = await getPaperlessSettings();
    if (!settings.paperlessUrl || !settings.paperlessToken) return;

    const response = await makePaperlessRequest('/api/correspondents/', {}, settings);

    if (response.ok) {
      const data = await response.json();
      const correspondents = data.results.map(c => ({ id: c.id, name: c.name }));

      const select = document.getElementById('correspondent');
      const currentValue = select.value;

      // Clear existing options except the first one
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }

      // Add all correspondents
      correspondents.forEach(correspondent => {
        const option = document.createElement('option');
        option.value = correspondent.id;
        option.textContent = correspondent.name;
        select.appendChild(option);
      });

      // Restore selection if it still exists
      if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
      }
    }
  } catch (error) {
    console.error('Error repopulating correspondents:', error);
  }
}

async function repopulateDocumentTypes() {
  try {
    const settings = await getPaperlessSettings();
    if (!settings.paperlessUrl || !settings.paperlessToken) return;

    const response = await makePaperlessRequest('/api/document_types/', {}, settings);

    if (response.ok) {
      const data = await response.json();
      const documentTypes = data.results.map(d => ({ id: d.id, name: d.name }));

      const select = document.getElementById('documentType');
      const currentValue = select.value;

      // Clear existing options except the first one
      while (select.children.length > 1) {
        select.removeChild(select.lastChild);
      }

      // Add all document types
      documentTypes.forEach(docType => {
        const option = document.createElement('option');
        option.value = docType.id;
        option.textContent = docType.name;
        select.appendChild(option);
      });

      // Restore selection if it still exists
      if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
        select.value = currentValue;
      }
    }
  } catch (error) {
    console.error('Error repopulating document types:', error);
  }
}

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
    // Load settings
    const settings = await getPaperlessSettings();

    // Fetch correspondents from Paperless-ngx API if settings are available
    let correspondents = [];
    if (settings.paperlessUrl && settings.paperlessToken) {
      try {
        const response = await makePaperlessRequest('/api/correspondents/', {}, settings);
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
        const response = await makePaperlessRequest('/api/document_types/', {}, settings);
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
        const response = await makePaperlessRequest('/api/tags/', {}, settings);
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

  // Hide suggestions when clicking outside
  document.addEventListener('click', function (event) {
    const tagsContainer = document.getElementById('tagsInput');
    if (!tagsContainer.contains(event.target)) {
      hideSuggestions();
    }
  });
}

function handleTagInput(event) {
  if (event.key === 'Enter') {
    event.preventDefault();

    // If a suggestion is selected, use it
    const suggestions = document.querySelectorAll('.suggestion-item');
    if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
      const selectedTag = suggestions[selectedSuggestionIndex].textContent;
      addTag(selectedTag);
      event.target.value = '';
      hideSuggestions();
      return;
    }

    // Otherwise, use the input value
    const tagValue = event.target.value.trim();
    if (tagValue && !selectedTags.includes(tagValue)) {
      addTag(tagValue);
      event.target.value = '';
      hideSuggestions();
    }
  } else if (event.key === 'Backspace' && event.target.value === '') {
    // Remove last tag on backspace if input is empty
    if (selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    navigateSuggestions(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    navigateSuggestions(-1);
  } else if (event.key === 'Escape') {
    hideSuggestions();
  }
}

function handleTagAutocomplete(event) {
  const query = event.target.value.trim();

  if (query.length === 0) {
    hideSuggestions();
    return;
  }

  // Initialize Fuse if not already done and we have tags
  if (!fuse && availableTags.length > 0) {
    const options = {
      includeScore: true,
      threshold: 0.4, // Lower = more strict, higher = more fuzzy
      keys: ['name'] // Search in the name field
    };
    fuse = new Fuse(availableTags, options);
  }

  if (fuse) {
    const results = fuse.search(query);
    showSuggestions(results.map(result => result.item), query);
  }
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

    const tagText = document.createTextNode(tag);
    tagElement.appendChild(tagText);

    const removeButton = document.createElement('span');
    removeButton.className = 'tag-remove';
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => removeTag(tag));

    tagElement.appendChild(removeButton);
    tagsContainer.insertBefore(tagElement, tagInput);
  });
}

let selectedSuggestionIndex = -1;

function showSuggestions(tags, query) {
  hideSuggestions();

  if (tags.length === 0) return;

  const suggestionsContainer = document.getElementById('tagSuggestions');
  selectedSuggestionIndex = -1;

  // Filter out already selected tags
  const filteredTags = tags.filter(tag => !selectedTags.includes(tag.name));

  if (filteredTags.length === 0) return;

  // Show up to 5 suggestions
  const tagsToShow = filteredTags.slice(0, 5);

  tagsToShow.forEach((tag, index) => {
    const suggestionItem = document.createElement('div');
    suggestionItem.className = 'suggestion-item';

    // Create text with highlighted matching text safely
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const parts = tag.name.split(regex);

    parts.forEach(part => {
      if (part.toLowerCase() === query.toLowerCase()) {
        const mark = document.createElement('mark');
        mark.textContent = part;
        suggestionItem.appendChild(mark);
      } else {
        suggestionItem.appendChild(document.createTextNode(part));
      }
    });

    suggestionItem.addEventListener('click', () => {
      addTag(tag.name);
      const tagInput = document.querySelector('.tag-input');
      tagInput.value = '';
      hideSuggestions();
      tagInput.focus();
    });

    suggestionsContainer.appendChild(suggestionItem);
  });

  suggestionsContainer.style.display = 'block';
}

function hideSuggestions() {
  const suggestionsContainer = document.getElementById('tagSuggestions');
  while (suggestionsContainer.firstChild) {
    suggestionsContainer.removeChild(suggestionsContainer.firstChild);
  }
  suggestionsContainer.style.display = 'none';
  selectedSuggestionIndex = -1;
}

function navigateSuggestions(direction) {
  const suggestions = document.querySelectorAll('.suggestion-item');
  if (suggestions.length === 0) return;

  // Remove current selection
  if (selectedSuggestionIndex >= 0) {
    suggestions[selectedSuggestionIndex].classList.remove('selected');
  }

  // Update index
  selectedSuggestionIndex += direction;

  if (selectedSuggestionIndex < 0) {
    selectedSuggestionIndex = suggestions.length - 1;
  } else if (selectedSuggestionIndex >= suggestions.length) {
    selectedSuggestionIndex = 0;
  }

  // Add selection to new item
  suggestions[selectedSuggestionIndex].classList.add('selected');
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function handleUpload(event) {
  event.preventDefault();

  const uploadBtn = document.getElementById('uploadBtn');
  const originalText = setButtonLoading(uploadBtn, '⏳ Uploading...');

  try {
    clearMessages();

    // Collect form data
    const formData = new FormData(event.target);

    // Convert correspondent and document_type to integer IDs if present
    const correspondentValue = formData.get('correspondent');
    const correspondentId = correspondentValue ? parseInt(correspondentValue, 10) : undefined;
    const documentTypeValue = formData.get('document_type');
    const documentTypeId = documentTypeValue ? parseInt(documentTypeValue, 10) : undefined;

    // Convert selectedTags (names) to IDs using availableTags
    const tagIds = selectedTags
      .map(tagName => {
        const found = availableTags.find(t => t.name === tagName);
        return found ? found.id : undefined;
      })
      .filter(id => id !== undefined);

    const uploadOptions = {};

    const title = formData.get('title');
    if (title) uploadOptions.title = title;

    if (correspondentId) uploadOptions.correspondent = correspondentId;

    if (documentTypeId) uploadOptions.document_type = documentTypeId;

    const created = formData.get('created');
    if (created) uploadOptions.created = created;

    if (tagIds.length > 0) uploadOptions.tags = tagIds;

    // Upload each attachment using background.js - let background handle all notifications
    for (const attachment of currentAttachments) {
      try {
        await browser.runtime.sendMessage({
          action: 'uploadWithOptions',
          messageData: currentMessage,
          attachmentData: attachment,
          uploadOptions: uploadOptions
        });
        // Background script handles all success/error notifications
      } catch (error) {
        console.error(`Error sending upload message for ${attachment.name}:`, error);
        // Even message sending errors will be rare, let background handle notifications
      }
    }

    // Show completion message and close dialog
    showSuccess(`Upload requests sent for ${currentAttachments.length} document(s). Check notifications for results.`);
    closeWindowWithDelay(2000);

  } catch (error) {
    console.error('Upload form error:', error);
    showError('Error processing upload form: ' + error.message);
  } finally {
    resetButtonLoading(uploadBtn, originalText);
  }
}

// Make removeTag available globally for the tag elements
window.removeTag = removeTag;