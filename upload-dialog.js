// Id of this dialog window (storage key from the URL), used to address
// messages from the creation dialogs opened by *this* window
const dialogId = new URLSearchParams(window.location.search).get('key') || '';
let currentAttachments = [];
let currentMessage = null;
let selectedTags = [];
let availableTags = [];

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

  // Listen for messages from the creation dialogs (separate windows)
  browser.runtime.onMessage.addListener(handlePopupMessage);
}

async function createNewCorrespondent() {
  try {
    const popup = await browser.windows.create({
      url: browser.runtime.getURL(`create-correspondent.html?opener=${encodeURIComponent(dialogId)}`),
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
      url: browser.runtime.getURL(`create-document-type.html?opener=${encodeURIComponent(dialogId)}`),
      type: 'popup',
      width: 600,
      height: 500,
    });
  } catch (error) {
    console.error('Error opening document type creation window:', error);
  }
}

function handlePopupMessage(message) {
  if (!message || !message.success) {
    return undefined;
  }
  // Every open upload dialog refreshes its list, but only the dialog that
  // opened the creation window selects the new entry.
  const isOpener = message.opener === dialogId;
  if (message.action === 'correspondentCreated' && message.correspondent) {
    loadCorrespondents(isOpener ? message.correspondent : null).then(() => {
      if (isOpener) showSuccess(`Correspondent "${message.correspondent.name}" created successfully!`);
    });
  } else if (message.action === 'documentTypeCreated' && message.documentType) {
    loadDocumentTypes(isOpener ? message.documentType : null).then(() => {
      if (isOpener) showSuccess(`Document type "${message.documentType.name}" created successfully!`);
    });
  }
  return undefined;
}

/**
 * Fill a <select> with {id, name} items, keeping the first placeholder option.
 * If `selectItem` is given it is selected (and added if the server list does
 * not contain it yet, e.g. due to caching). Otherwise the previous selection
 * is kept.
 */
function populateSelect(selectId, items, selectItem = null) {
  const select = document.getElementById(selectId);
  const previousValue = select.value;

  while (select.children.length > 1) {
    select.removeChild(select.lastChild);
  }

  const sorted = [...items];
  if (selectItem && !sorted.some(item => item.id === selectItem.id)) {
    sorted.push({ id: selectItem.id, name: selectItem.name });
  }
  sorted.sort((a, b) => a.name.localeCompare(b.name));

  for (const item of sorted) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }

  const wanted = selectItem ? String(selectItem.id) : previousValue;
  if (wanted && [...select.options].some(o => o.value === wanted)) {
    select.value = wanted;
  }
}

async function loadSelectData(endpoint, selectId, selectItem = null) {
  try {
    const settings = await getPaperlessSettings();
    if (!settings.paperlessUrl || !settings.paperlessToken) return;
    const results = await fetchAllResults(endpoint, settings);
    populateSelect(selectId, results.map(r => ({ id: r.id, name: r.name })), selectItem);
  } catch (error) {
    console.error(`Error loading ${endpoint}:`, error);
  }
}

function loadCorrespondents(selectItem = null) {
  return loadSelectData('/api/correspondents/', 'correspondent', selectItem);
}

function loadDocumentTypes(selectItem = null) {
  return loadSelectData('/api/document_types/', 'documentType', selectItem);
}

async function loadUploadData() {
  try {
    const uploadData = await takeDialogData();

    if (!uploadData) {
      // #messageArea is inside the still hidden main content, so show the
      // error in place of the loading text
      showLoadingError('No upload data found. Please start the upload again from the message.');
      return;
    }

    currentMessage = uploadData.message;
    currentAttachments = uploadData.attachments;

    // Populate email info
    document.getElementById('emailFrom').textContent = currentMessage.author;
    document.getElementById('emailSubject').textContent = currentMessage.subject;
    document.getElementById('emailDate').textContent = new Date(currentMessage.date).toLocaleDateString();

    // Populate file list (with checkboxes, so e.g. signature images can be skipped)
    const fileList = document.getElementById('fileList');
    for (const [index, attachment] of currentAttachments.entries()) {
      const li = document.createElement('li');
      li.className = 'file-item';

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'attachment-checkbox';
      checkbox.dataset.index = index;
      checkbox.checked = true;

      const size = await browser.messengerUtilities.formatFileSize(attachment.size);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` 📄 ${attachment.name} (${size})`));
      li.appendChild(label);
      fileList.appendChild(li);
    }

    // Default title: file name without extension. With several attachments
    // an empty title means "use each file name" (otherwise every document
    // would get the title of the first attachment).
    const titleInput = document.getElementById('documentTitle');
    if (currentAttachments.length === 1) {
      titleInput.value = stripFileExtension(currentAttachments[0].name);
    } else {
      titleInput.required = false;
      titleInput.placeholder = 'Leave empty to use each file name';
    }

    // Default date: email date in *local* time (toISOString() is UTC and
    // yields the previous day for mails received shortly after midnight)
    const emailDate = new Date(currentMessage.date);
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('documentDate').value =
      `${emailDate.getFullYear()}-${pad(emailDate.getMonth() + 1)}-${pad(emailDate.getDate())}`;

    // Show main content
    document.getElementById('loadingSection').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';

  } catch (error) {
    console.error('Error loading upload data:', error);
    showLoadingError('Error loading data: ' + error.message);
  }
}

function showLoadingError(message) {
  const loadingSection = document.getElementById('loadingSection');
  loadingSection.textContent = '';
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error';
  errorDiv.textContent = message;
  loadingSection.appendChild(errorDiv);
}

async function loadPaperlessData() {
  const settings = await getPaperlessSettings();
  if (!settings.paperlessUrl || !settings.paperlessToken) {
    return; // Not critical for a basic upload
  }

  await Promise.all([
    loadCorrespondents(),
    loadDocumentTypes(),
    fetchAllResults('/api/tags/', settings)
      .then(results => {
        availableTags = results.map(t => ({ id: t.id, name: t.name }));
        // Pre-select the configured default tags (previously only used by
        // the quick upload, although the options describe them as applying
        // to uploaded documents in general)
        const defaultTags = (settings.defaultTags || '').split(',').map(t => t.trim());
        defaultTags
          .filter(name => availableTags.some(t => t.name === name))
          .forEach(addTag);
      })
      .catch(err => console.error('Failed to fetch tags from Paperless-ngx:', err)),
  ]);
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

    // Otherwise only accept existing tags (unknown names used to be shown as
    // chips but were silently dropped on upload). Take exactly what the user
    // sees: an exact match, otherwise the first entry of the suggestion list.
    const tagValue = event.target.value.trim();
    if (!tagValue) return;
    const exact = availableTags.find(t => t.name.toLowerCase() === tagValue.toLowerCase());
    const firstSuggestion = document.querySelector('.suggestion-item');
    const match = exact ? exact.name : firstSuggestion && firstSuggestion.textContent;
    if (match) {
      addTag(match);
      event.target.value = '';
      hideSuggestions();
    } else {
      clearMessages();
      showError(`Tag "${tagValue}" does not exist in Paperless-ngx.`);
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

  showSuggestions(fuzzySearch(availableTags, query, { limit: 20 }), query);
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

function getSelectedAttachments() {
  return [...document.querySelectorAll('.attachment-checkbox:checked')]
    .map(checkbox => ({
      checkbox,
      attachment: currentAttachments[parseInt(checkbox.dataset.index, 10)]
    }));
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

    const selectedAttachments = getSelectedAttachments();
    if (selectedAttachments.length === 0) {
      showError('Please select at least one attachment.');
      return;
    }

    // Upload each attachment using background.js (it also shows notifications)
    const failures = [];
    for (const { checkbox, attachment } of selectedAttachments) {
      let result;
      try {
        result = await browser.runtime.sendMessage({
          action: 'uploadWithOptions',
          messageData: currentMessage,
          attachmentData: attachment,
          uploadOptions: uploadOptions
        });
      } catch (error) {
        result = { success: false, error: error.message };
      }
      if (result && result.success) {
        // Deselect, so a retry does not upload this file a second time
        checkbox.checked = false;
      } else {
        failures.push(`${attachment.name}: ${(result && result.error) || 'unknown error'}`);
      }
    }

    if (failures.length > 0) {
      // Keep the dialog (and the entered metadata) open for a retry
      failures.forEach(failure => showError(`Upload failed – ${failure}`));
      return;
    }

    showSuccess(`Sent ${selectedAttachments.length} document(s) to Paperless-ngx. Check notifications for the import result.`);
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