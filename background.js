// Background script for Paperless-ngx PDF Uploader
console.log("Paperless PDF Uploader loaded!");

let currentPdfAttachments = [];
let currentMessage = null;

// Create context menus for attachments
browser.runtime.onInstalled.addListener(async () => {
  // Remove all existing menus first to avoid conflicts
  await browser.menus.removeAll();

  // Message list context menus
  // Quick upload option
  browser.menus.create({
    id: "quick-upload-pdf-paperless",
    title: "Quick Upload to Paperless-ngx",
    contexts: ["message_list"],
    icons: {
      "32": "icons/icon-32.png",
      "16": "icons/icon-16.png",
      "64": "icons/icon-64.png",
      "128": "icons/icon-128.png"
    }
  });

  // Advanced upload option with dialog
  browser.menus.create({
    id: "advanced-upload-pdf-paperless",
    title: "Upload to Paperless-ngx (with options)...",
    contexts: ["message_list"],
    icons: {
      "32": "icons/icon-32.png",
      "16": "icons/icon-16.png",
      "64": "icons/icon-64.png",
      "128": "icons/icon-128.png"
    }
  });

  // Separator
  browser.menus.create({
    id: "separator",
    type: "separator",
    contexts: ["message_list"]
  });
});

// Handle context menu clicks
browser.menus.onClicked.addListener(async (info, tab) => {
  // Message list context menu handlers
  if (info.menuItemId === "quick-upload-pdf-paperless") {
    await handleQuickPdfUpload(info);
  } else if (info.menuItemId === "advanced-upload-pdf-paperless") {
    await handleAdvancedPdfUpload(info);
  }
});

async function handleQuickPdfUpload(info) {
  try {
    const messages = info.selectedMessages.messages;
    if (!messages || messages.length === 0) {
      showNotification("No messages selected", "error");
      return;
    }

    // Process each selected message for PDF attachments
    for (const message of messages) {
      await processQuickPdfUpload(message);
    }
  } catch (error) {
    console.error("Error handling quick PDF upload:", error);
    showNotification("Error processing attachments", "error");
  }
}

async function handleAdvancedPdfUpload(info) {
  try {
    const messages = info.selectedMessages.messages;
    if (!messages || messages.length === 0) {
      showNotification("No messages selected", "error");
      return;
    }

    // For now, just handle the first message (can be extended)
    const message = messages[0];

    // Get PDF attachments
    const attachments = await browser.messages.listAttachments(message.id);
    const pdfAttachments = attachments.filter(attachment =>
      attachment.contentType === "application/pdf" ||
      attachment.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfAttachments.length === 0) {
      showNotification("No PDF attachments found in selected message", "info");
      return;
    }

    // Store current data for the dialog
    currentMessage = message;
    currentPdfAttachments = pdfAttachments;

    // Open the advanced upload dialog
    await openAdvancedUploadDialog(message, pdfAttachments);

  } catch (error) {
    console.error("Error handling advanced PDF upload:", error);
    showNotification("Error processing attachments", "error");
  }
}

async function processQuickPdfUpload(message) {
  try {
    const attachments = await browser.messages.listAttachments(message.id);
    const pdfAttachments = attachments.filter(attachment =>
      attachment.contentType === "application/pdf" ||
      attachment.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfAttachments.length === 0) {
      showNotification("No PDF attachments found in selected messages", "info");
      return;
    }

    // If there's only one attachment, upload directly
    if (pdfAttachments.length === 1) {
      await uploadPdfToPaperless(message, pdfAttachments[0], { mode: 'quick' });
      return;
    }

    // If there are multiple attachments, show selection dialog
    await openAttachmentSelectionDialog(message, pdfAttachments);

  } catch (error) {
    console.error("Error processing PDF attachments:", error);
    showNotification(`Error processing attachments: ${error.message}`, "error");
  }
}

async function openAttachmentSelectionDialog(message, pdfAttachments) {
  try {
    // Store data for the dialog to access
    await browser.storage.local.set({
      quickUploadData: {
        message: {
          id: message.id,
          subject: message.subject,
          author: message.author,
          date: message.date
        },
        attachments: pdfAttachments.map(att => ({
          name: att.name,
          partName: att.partName,
          size: att.size
        }))
      }
    });

    // Open the selection dialog
    const dialogUrl = browser.runtime.getURL("select-attachments.html");
    browser.windows.create({
      url: dialogUrl,
      type: "popup",
      width: 500,
      height: 600
    });
  } catch (error) {
    console.error("Error opening attachment selection dialog:", error);
    showNotification("Error opening attachment selection dialog", "error");
  }
}

async function openAdvancedUploadDialog(message, pdfAttachments) {
  // Create a new window/tab for the upload dialog
  const dialogUrl = browser.runtime.getURL("upload-dialog.html");

  try {
    // Store data for the dialog to access
    await browser.storage.local.set({
      currentUploadData: {
        message: {
          id: message.id,
          subject: message.subject,
          author: message.author,
          date: message.date
        },
        attachments: pdfAttachments.map(att => ({
          name: att.name,
          partName: att.partName,
          size: att.size
        }))
      }
    });

    // Open the dialog
    browser.windows.create({
      url: dialogUrl,
      type: "popup",
      width: 550,
      height: 700
    });
  } catch (error) {
    console.error("Error opening dialog:", error);
    showNotification("Error opening upload dialog", "error");
  }
}

async function uploadPdfToPaperless(message, attachment, options = {}) {
  try {
    const config = await getPaperlessConfig();
    if (!config.url || !config.token) {
      showNotification("Please configure Paperless-ngx settings first", "error");
      return { success: false, error: "Paperless-ngx not configured" };
    }

    const uploadMode = options.mode || 'quick';
    showNotification(`Uploading ${attachment.name} to Paperless-ngx...`, "info");

    // Get attachment data
    const attachmentData = await browser.messages.getAttachmentFile(
      message.id,
      attachment.partName
    );

    // Prepare form data for upload
    const formData = new FormData();
    formData.append('document', attachmentData, attachment.name);

    // Prepare metadata based on mode
    let metadata = {};

    if (uploadMode === 'quick') {
      // Minimal metadata for quick upload
      metadata = {
        title: attachment.name.replace(/\.pdf$/i, ''), // Remove .pdf extension
      };
    } else if (uploadMode === 'advanced') {
      // Use provided options for advanced upload
      metadata = {
        title: options.title || attachment.name.replace(/\.pdf$/i, ''),
        correspondent: options.correspondent,
        document_type: options.document_type,
        tags: options.tags || [],
        created: options.created,
        source: options.source || 'Thunderbird Email',
      };
    }

    // Add metadata to form data (only if values exist)
    Object.keys(metadata).forEach(key => {
      if (metadata[key] !== undefined && metadata[key] !== null && metadata[key] !== '') {
        if (Array.isArray(metadata[key])) {
          metadata[key].forEach(item => formData.append(key, item));
        } else {
          formData.append(key, metadata[key]);
        }
      }
    });

    // Upload to Paperless-ngx
    const response = await fetch(`${config.url}/api/documents/post_document/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${config.token}`
      },
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      showNotification(`✅ Successfully uploaded ${attachment.name} to Paperless-ngx`, "success");
      console.log("Upload successful:", result);

      // Return success data for dialog callback
      return { success: true, result };
    } else {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

  } catch (error) {
    console.error("Error uploading to Paperless-ngx:", error);
    showNotification(`❌ Failed to upload ${attachment.name}: ${error.message}`, "error");
    return { success: false, error: error.message };
  }
}

// Handle messages from the upload dialog
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "quickUploadFromDisplay") {
    await handleQuickUploadFromDisplay(message.messageId);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "advancedUploadFromDisplay") {
    await handleAdvancedUploadFromDisplay(message.messageId);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "quickUploadSelected") {
    try {
      const { messageData, selectedAttachments } = message;

      let successCount = 0;
      let errorCount = 0;

      // Upload each selected attachment
      for (const attachment of selectedAttachments) {
        try {
          const result = await uploadPdfToPaperless(
            messageData,
            attachment,
            { mode: 'quick' }
          );

          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
          console.error(`Error uploading ${attachment.name}:`, error);
        }
      }

      // Show summary notification
      if (successCount > 0 && errorCount === 0) {
        showNotification(`✅ Successfully uploaded ${successCount} document(s) to Paperless-ngx`, "success");
      } else if (successCount > 0) {
        showNotification(`⚠️ Uploaded ${successCount} document(s), ${errorCount} failed`, "info");
      } else {
        showNotification(`❌ Failed to upload all documents`, "error");
      }

      sendResponse({ success: true, successCount, errorCount });
    } catch (error) {
      console.error("Error in quickUploadSelected:", error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Keep the message channel open for async response
  }

  if (message.action === "uploadWithOptions") {
    console.log('📤 Background: Received uploadWithOptions message');

    (async () => {
      try {
        const { messageData, attachmentData, uploadOptions } = message;
        console.log('📤 Background: Processing upload for:', attachmentData.name);

        // Reconstruct message and attachment objects
        const messageObj = messageData;
        const attachmentObj = attachmentData;

        const result = await uploadPdfToPaperless(
          messageObj,
          attachmentObj,
          { mode: 'advanced', ...uploadOptions }
        );

        console.log('📋 Background: Upload result for', attachmentData.name, ':', result);
        console.log('📋 Background: About to send response:', JSON.stringify(result));

        // Ensure we always send a valid response
        if (result && typeof result === 'object' && result.hasOwnProperty('success')) {
          console.log('📋 Background: Sending valid result');
          sendResponse(result);
        } else {
          console.error('❌ Background: Invalid result, sending error response:', result);
          sendResponse({ success: false, error: "Invalid response from upload function" });
        }
      } catch (error) {
        console.error("❌ Background: Error in upload with options:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Keep the message channel open for async response
  }

  if (message.action === "getCorrespondents") {
    try {
      const config = await getPaperlessConfig();
      const response = await fetch(`${config.url}/api/correspondents/`, {
        headers: { 'Authorization': `Token ${config.token}` }
      });

      if (response.ok) {
        const data = await response.json();
        sendResponse({ success: true, correspondents: data.results });
      } else {
        sendResponse({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === "getDocumentTypes") {
    try {
      const config = await getPaperlessConfig();
      const response = await fetch(`${config.url}/api/document_types/`, {
        headers: { 'Authorization': `Token ${config.token}` }
      });

      if (response.ok) {
        const data = await response.json();
        sendResponse({ success: true, document_types: data.results });
      } else {
        sendResponse({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  if (message.action === "getTags") {
    try {
      const config = await getPaperlessConfig();
      const response = await fetch(`${config.url}/api/tags/`, {
        headers: { 'Authorization': `Token ${config.token}` }
      });

      if (response.ok) {
        const data = await response.json();
        sendResponse({ success: true, tags: data.results });
      } else {
        sendResponse({ success: false, error: `HTTP ${response.status}` });
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
});

function extractCorrespondentFromEmail(emailString) {
  const match = emailString.match(/^(.+?)\s*<.+>$/);
  return match ? match[1].trim() : emailString.split('@')[0];
}

async function getPaperlessConfig() {
  const result = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken', 'defaultTags']);
  return {
    url: result.paperlessUrl?.replace(/\/$/, ''),
    token: result.paperlessToken,
    defaultTags: result.defaultTags ? result.defaultTags.split(',').map(t => t.trim()) : []
  };
}

function showNotification(message, type = "info") {
  // const iconUrl = type === "error" ? "icons/error.png" :
  //   type === "success" ? "icons/success.png" : "icons/icon-32.png";
  const iconUrl = "icons/icon-32.png";

  browser.notifications.create({
    type: "basic",
    iconUrl: iconUrl,
    title: "📄 Paperless PDF Uploader",
    message: message
  });
}

// Handle quick upload from message display popup
async function handleQuickUploadFromDisplay(messageId) {
  try {
    const message = await browser.messages.get(messageId);
    await processQuickPdfUpload(message);
  } catch (error) {
    console.error("Error handling quick upload from display:", error);
    showNotification("Error processing quick upload", "error");
  }
}

// Handle advanced upload from message display popup
async function handleAdvancedUploadFromDisplay(messageId) {
  try {
    const message = await browser.messages.get(messageId);

    // Get PDF attachments
    const attachments = await browser.messages.listAttachments(message.id);
    const pdfAttachments = attachments.filter(attachment =>
      attachment.contentType === "application/pdf" ||
      attachment.name.toLowerCase().endsWith('.pdf')
    );

    if (pdfAttachments.length === 0) {
      showNotification("No PDF attachments found in displayed message", "info");
      return;
    }

    // Store current data for the dialog
    currentMessage = message;
    currentPdfAttachments = pdfAttachments;

    // Open the advanced upload dialog
    await openAdvancedUploadDialog(message, pdfAttachments);
  } catch (error) {
    console.error("Error handling advanced upload from display:", error);
    showNotification("Error processing advanced upload", "error");
  }
}