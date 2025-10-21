let currentMessage = null;
let allAttachments = [];

document.addEventListener('DOMContentLoaded', async function () {
  await loadAttachmentData();
  setupEventListeners();
});

async function loadAttachmentData() {
  try {
    const result = await browser.storage.local.get('quickUploadData');
    const uploadData = result.quickUploadData;

    if (!uploadData) {
      console.error("No upload data found");
      window.close();
      return;
    }

    currentMessage = uploadData.message;
    allAttachments = uploadData.attachments;

    // Populate email info
    document.getElementById('emailFrom').textContent = currentMessage.author;
    document.getElementById('emailSubject').textContent = currentMessage.subject;
    document.getElementById('emailDate').textContent = new Date(currentMessage.date).toLocaleDateString();

    // Populate attachment list
    populateAttachmentList();
    updateSelectedCount();

  } catch (error) {
    console.error('Error loading attachment data:', error);
    window.close();
  }
}

async function populateAttachmentList() {
  const listContainer = document.getElementById('attachmentList');

  for (const [index, attachment] of allAttachments.entries()) {
    const item = document.createElement('div');
    item.className = 'attachment-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'attachment-checkbox';
    checkbox.id = `attachment-${index}`;
    checkbox.dataset.index = index;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'attachment-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'attachment-name';
    nameDiv.textContent = `📄 ${attachment.name}`;

    const sizeDiv = document.createElement('div');
    sizeDiv.className = 'attachment-size';
    // Await the formatted size from browser API
    sizeDiv.textContent = await browser.messengerUtilities.formatFileSize(attachment.size);

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(sizeDiv);
    item.appendChild(checkbox);
    item.appendChild(infoDiv);
    listContainer.appendChild(item);
  }
}

function setupEventListeners() {
  // Checkbox change events
  document.addEventListener('change', function (event) {
    if (event.target.classList.contains('attachment-checkbox')) {
      updateSelectedCount();
      updateUploadButton();
    }
  });

  // Select all button
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.attachment-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateSelectedCount();
    updateUploadButton();
  });

  // Select none button
  document.getElementById('selectNoneBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.attachment-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateSelectedCount();
    updateUploadButton();
  });

  // Cancel button
  document.getElementById('cancelBtn').addEventListener('click', () => {
    window.close();
  });

  // Upload button
  document.getElementById('uploadBtn').addEventListener('click', handleUpload);
}

function updateSelectedCount() {
  const checkboxes = document.querySelectorAll('.attachment-checkbox:checked');
  const count = checkboxes.length;
  const countElement = document.getElementById('selectedCount');

  if (count === 0) {
    countElement.textContent = 'No attachments selected';
  } else if (count === 1) {
    countElement.textContent = '1 attachment selected';
  } else {
    countElement.textContent = `${count} attachments selected`;
  }
}

function updateUploadButton() {
  const checkboxes = document.querySelectorAll('.attachment-checkbox:checked');
  const uploadBtn = document.getElementById('uploadBtn');

  uploadBtn.disabled = checkboxes.length === 0;
}

async function handleUpload() {
  const checkboxes = document.querySelectorAll('.attachment-checkbox:checked');
  const selectedAttachments = Array.from(checkboxes).map(cb => {
    const index = parseInt(cb.dataset.index);
    return allAttachments[index];
  });

  if (selectedAttachments.length === 0) {
    return;
  }

  try {
    // Send message to background script to process the uploads
    browser.runtime.sendMessage({
      action: 'quickUploadSelected',
      messageData: currentMessage,
      selectedAttachments: selectedAttachments
    });

    // Close the window immediately after sending the upload request
    window.close();

  } catch (error) {
    console.error('Error during upload:', error);
    // Only keep window open if there's an error sending the message
  }
}
