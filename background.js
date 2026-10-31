// Background script for Paperless-ngx PDF Uploader
console.log("Paperless PDF Uploader loaded!");

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

/**
 * Collect all selected messages. MessageLists are paginated (100 per page),
 * further pages have to be fetched with messages.continueList().
 */
async function collectSelectedMessages(messageList) {
  const messages = [...(messageList?.messages || [])];
  let listId = messageList?.id;
  while (listId) {
    const page = await browser.messages.continueList(listId);
    messages.push(...page.messages);
    listId = page.id;
  }
  return messages;
}

async function handleQuickPdfUpload(info) {
  try {
    const messages = await collectSelectedMessages(info.selectedMessages);
    if (messages.length === 0) {
      showNotification("No messages selected", "error");
      return;
    }

    // Several messages: upload silently and show one summary. Failed imports
    // are still reported per file by trackConsumptionTask().
    const batch = {
      silent: messages.length > 1,
      remainingDialogs: MAX_DIALOGS,
      skippedDialogs: 0,
      sent: 0,
      failed: 0,
      withoutAttachments: 0,
    };
    for (const message of messages) {
      await processQuickPdfUpload(message, batch);
    }

    if (messages.length === 1) {
      if (batch.withoutAttachments === 1) {
        showNotification("No supported attachments found in selected message", "info");
      }
      return;
    }
    const parts = [];
    if (batch.sent > 0) parts.push(`⏳ Sent ${batch.sent} document(s) to Paperless-ngx`);
    if (batch.failed > 0) parts.push(`❌ ${batch.failed} upload(s) failed`);
    if (batch.withoutAttachments > 0) {
      parts.push(`${batch.withoutAttachments} of ${messages.length} messages have no supported attachments`);
    }
    if (batch.skippedDialogs > 0) {
      parts.push(`${batch.skippedDialogs} message(s) with several attachments skipped ` +
        `(at most ${MAX_DIALOGS} selection dialogs at once)`);
    }
    if (parts.length > 0) {
      showNotification(parts.join('\n'), batch.failed > 0 ? "error" : "info");
    }
  } catch (error) {
    console.error("Error handling quick PDF upload:", error);
    showNotification("Error processing attachments", "error");
  }
}

async function handleAdvancedPdfUpload(info) {
  try {
    const messages = await collectSelectedMessages(info.selectedMessages);
    if (messages.length === 0) {
      showNotification("No messages selected", "error");
      return;
    }

    // One dialog per message (previously all but the first were ignored),
    // but never more than MAX_DIALOGS windows at once
    let opened = 0;
    let skipped = 0;
    for (const message of messages) {
      if (opened >= MAX_DIALOGS) {
        skipped++;
        continue;
      }
      const attachments = await getUploadableAttachments(message.id);
      if (attachments.length > 0) {
        await openAdvancedUploadDialog(message, attachments);
        opened++;
      }
    }
    if (opened === 0) {
      showNotification("No supported attachments found in selected messages", "info");
    } else if (skipped > 0) {
      showNotification(`Opened ${MAX_DIALOGS} upload dialogs, ${skipped} further message(s) skipped. ` +
        `Use Quick Upload for many messages.`, "info");
    }
  } catch (error) {
    console.error("Error handling advanced PDF upload:", error);
    showNotification("Error processing attachments", "error");
  }
}

/**
 * List the attachments of a message that Paperless-ngx can consume.
 * Only PDFs by default; images, text and Office documents if enabled in
 * the options ("uploadAllFileTypes").
 */
async function getUploadableAttachments(messageId) {
  const [attachments, settings] = await Promise.all([
    browser.messages.listAttachments(messageId),
    browser.storage.sync.get('uploadAllFileTypes'),
  ]);
  return attachments.filter(attachment =>
    isUploadableAttachment(attachment, !!settings.uploadAllFileTypes));
}

/**
 * Quick upload for one message.
 * @param {Object} batch - optional state shared across several messages:
 *   silent, remainingDialogs, skippedDialogs, sent, failed, withoutAttachments
 * @returns {Promise<boolean>} false if the message has no supported attachments
 */
async function processQuickPdfUpload(message, batch = null) {
  try {
    const pdfAttachments = await getUploadableAttachments(message.id);

    if (pdfAttachments.length === 0) {
      if (batch) batch.withoutAttachments++;
      return false;
    }

    // A single attachment is uploaded directly - unless it is an image,
    // which is often just a logo from the signature.
    if (pdfAttachments.length === 1 && !isImageAttachment(pdfAttachments[0])) {
      const result = await uploadPdfToPaperless(message, pdfAttachments[0],
        { mode: 'quick', silent: !!(batch && batch.silent) });
      if (batch) {
        if (result.success) batch.sent++; else batch.failed++;
      }
      return true;
    }

    // Otherwise let the user choose
    if (batch) {
      if (batch.remainingDialogs <= 0) {
        batch.skippedDialogs++;
        return true;
      }
      batch.remainingDialogs--;
    }
    await openAttachmentSelectionDialog(message, pdfAttachments);
    return true;

  } catch (error) {
    console.error("Error processing PDF attachments:", error);
    showNotification(`Error processing attachments: ${error.message}`, "error");
    if (batch) batch.failed++;
    return true; // error already reported
  }
}

const DIALOG_DATA_PREFIX = 'dialogData-';
const MAX_DIALOGS = 5;

/**
 * Open a dialog window and hand it its data under a unique storage key.
 * A single fixed key ("quickUploadData"/"currentUploadData") was overwritten
 * when several dialogs were opened at once (e.g. several selected messages),
 * so all dialogs showed the attachments of the last message.
 */
async function openDialogWithData(page, message, attachments, width, height) {
  await removeDialogData(24 * 60 * 60 * 1000);
  const key = `${DIALOG_DATA_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await browser.storage.local.set({
    [key]: {
      message: {
        id: message.id,
        subject: message.subject,
        author: message.author,
        date: message.date
      },
      attachments: attachments.map(att => ({
        name: att.name,
        partName: att.partName,
        size: att.size,
        contentType: att.contentType
      }))
    }
  });
  await browser.windows.create({
    url: browser.runtime.getURL(`${page}?key=${encodeURIComponent(key)}`),
    type: "popup",
    width,
    height
  });
}

/**
 * Remove dialog data (and the keys used by older versions). The dialogs keep
 * their data so that a reload works; it is removed here once it is older
 * than maxAge, and completely on startup.
 */
async function removeDialogData(maxAge = 0) {
  const all = await browser.storage.local.get(null);
  const now = Date.now();
  const stale = Object.keys(all).filter(key => {
    if (key === 'quickUploadData' || key === 'currentUploadData') return true;
    if (!key.startsWith(DIALOG_DATA_PREFIX)) return false;
    const created = parseInt(key.slice(DIALOG_DATA_PREFIX.length), 10);
    return !(created > 0) || now - created >= maxAge;
  });
  if (stale.length > 0) {
    await browser.storage.local.remove(stale);
  }
}

browser.runtime.onStartup.addListener(() => removeDialogData(0));

async function openAttachmentSelectionDialog(message, pdfAttachments) {
  try {
    await openDialogWithData("select-attachments.html", message, pdfAttachments, 500, 600);
  } catch (error) {
    console.error("Error opening attachment selection dialog:", error);
    showNotification("Error opening attachment selection dialog", "error");
  }
}

async function openAdvancedUploadDialog(message, pdfAttachments) {
  try {
    await openDialogWithData("upload-dialog.html", message, pdfAttachments, 550, 700);
  } catch (error) {
    console.error("Error opening dialog:", error);
    showNotification("Error opening upload dialog", "error");
  }
}

async function uploadPdfToPaperless(message, attachment, options = {}) {
  // Declared outside try so the error notification replaces "Uploading..."
  const notificationId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const config = await getPaperlessConfig();
    if (!config.url || !config.token) {
      showNotification("Please configure Paperless-ngx settings first", "error");
      return { success: false, error: "Paperless-ngx not configured" };
    }

    const uploadMode = options.mode || 'quick';
    if (!options.silent) {
      showNotification(`Uploading ${attachment.name} to Paperless-ngx...`, "info", notificationId);
    }

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
      // Resolve default tag names to IDs
      let defaultTagIds = [];
      if (config.defaultTags.length > 0) {
        try {
          const allTags = await fetchAllResults('/api/tags/');
          defaultTagIds = config.defaultTags
            .map(name => {
              const found = allTags.find(t => t.name === name);
              return found ? found.id : undefined;
            })
            .filter(id => id !== undefined);
        } catch (err) {
          console.error("Failed to fetch tags for default tag resolution:", err);
        }
      }

      metadata = {
        title: stripFileExtension(attachment.name),
        tags: defaultTagIds,
      };
    } else if (uploadMode === 'advanced') {
      // Use provided options for advanced upload
      metadata = {
        title: options.title || stripFileExtension(attachment.name),
        correspondent: options.correspondent,
        document_type: options.document_type,
        tags: options.tags || [],
        created: options.created,
      };
    }

    // Paperless-ngx rejects titles longer than 128 characters
    // (counted in code points, so emoji are not cut in half)
    const titleChars = Array.from(metadata.title || '');
    if (titleChars.length > 128) {
      metadata.title = titleChars.slice(0, 127).join('') + '…';
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
      // post_document only queues the file and returns the consumption task
      // id. Whether Paperless accepts the document (duplicate, unsupported
      // type, OCR error, ...) is only known once the task has finished.
      const taskId = await response.json();
      if (!options.silent) {
        showNotification(`⏳ ${attachment.name} sent, Paperless-ngx is processing it...`, "info", notificationId);
      }
      trackConsumptionTask(config, taskId, attachment.name, notificationId, !options.silent);
      return { success: true, result: taskId };
    } else {
      throw new Error(await formatApiError(response));
    }

  } catch (error) {
    console.error("Error uploading to Paperless-ngx:", error);
    showNotification(`❌ Failed to upload ${attachment.name}: ${error.message}`, "error", notificationId);
    return { success: false, error: error.message };
  }
}

/**
 * Poll /api/tasks/ until the consumption task has finished and report the
 * real result. Failures are always reported, successes only if notifySuccess.
 * Note: if Thunderbird suspends the background page in the meantime, the
 * polling simply stops; the upload itself is not affected.
 */
async function trackConsumptionTask(config, taskId, fileName, notificationId, notifySuccess) {
  if (typeof taskId !== 'string' || !taskId) return;

  const deadline = Date.now() + 5 * 60 * 1000;
  let delay = 1000;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 10000);
    try {
      const response = await fetch(
        `${config.url}/api/tasks/?task_id=${encodeURIComponent(taskId)}`,
        { headers: { 'Authorization': `Token ${config.token}` } });
      if (!response.ok) {
        // e.g. token without permission to view tasks
        reportUnknownTaskState(fileName, notificationId, notifySuccess);
        return;
      }
      const data = await response.json();
      const task = (Array.isArray(data) ? data : data.results || [])[0];
      if (!task) continue;

      if (task.status === 'SUCCESS') {
        if (notifySuccess) {
          const docInfo = task.related_document ? ` (document #${task.related_document})` : '';
          showNotification(`✅ ${fileName} added to Paperless-ngx${docInfo}`, "success", notificationId);
        }
        return;
      }
      if (task.status === 'FAILURE' || task.status === 'REVOKED') {
        showNotification(`❌ Paperless-ngx could not import ${fileName}: ${task.result || task.status}`,
          "error", notificationId);
        return;
      }
    } catch (error) {
      console.error('Error polling consumption task:', error);
      reportUnknownTaskState(fileName, notificationId, notifySuccess);
      return;
    }
  }
  if (notifySuccess) {
    showNotification(`⏳ ${fileName} is still being processed, please check Paperless-ngx`, "info", notificationId);
  }
}

function reportUnknownTaskState(fileName, notificationId, notifySuccess) {
  if (notifySuccess) {
    showNotification(`📤 ${fileName} was sent to Paperless-ngx (import status unknown)`, "info", notificationId);
  }
}

// Handle messages from the extension pages.
// The listener is intentionally *not* async: an async listener returns a
// Promise for every message, including messages that are only meant for
// other extension pages (e.g. "correspondentCreated" sent from the
// creation dialog to the upload dialog). Returning undefined for unknown
// actions lets those messages pass through untouched.
const messageHandlers = {
  async quickUploadFromDisplay(message) {
    await handleQuickUploadFromDisplay(message.messageId);
    return { success: true };
  },

  async advancedUploadFromDisplay(message) {
    await handleAdvancedUploadFromDisplay(message.messageId);
    return { success: true };
  },

  async quickUploadSelected(message) {
    const { messageData, selectedAttachments } = message;
    let successCount = 0;
    let errorCount = 0;

    for (const attachment of selectedAttachments) {
      // silent: one summary notification instead of two per file
      const result = await uploadPdfToPaperless(messageData, attachment, { mode: 'quick', silent: true });
      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    if (successCount > 0 && errorCount === 0) {
      showNotification(`⏳ Sent ${successCount} document(s) to Paperless-ngx, failures will be reported`, "success");
    } else if (successCount > 0) {
      showNotification(`⚠️ Sent ${successCount} document(s), ${errorCount} failed`, "info");
    } else {
      showNotification(`❌ Failed to upload all documents`, "error");
    }
    return { success: true, successCount, errorCount };
  },

  async uploadWithOptions(message) {
    const { messageData, attachmentData, uploadOptions } = message;
    const result = await uploadPdfToPaperless(
      messageData,
      attachmentData,
      { mode: 'advanced', ...uploadOptions }
    );
    if (result && typeof result === 'object' && 'success' in result) {
      return result;
    }
    return { success: false, error: "Invalid response from upload function" };
  },
};

browser.runtime.onMessage.addListener((message) => {
  const handler = messageHandlers[message && message.action];
  if (!handler) {
    return undefined;
  }
  return handler(message).catch(error => {
    console.error(`Error handling "${message.action}":`, error);
    return { success: false, error: error.message };
  });
});

async function getPaperlessConfig() {
  const result = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken', 'defaultTags']);
  return {
    url: result.paperlessUrl?.replace(/\/$/, ''),
    token: result.paperlessToken,
    defaultTags: result.defaultTags ? result.defaultTags.split(',').map(t => t.trim()) : []
  };
}

function showNotification(message, type = "info", notificationId = undefined) {
  // const iconUrl = type === "error" ? "icons/error.png" :
  //   type === "success" ? "icons/success.png" : "icons/icon-32.png";
  const iconUrl = "icons/icon-32.png";

  const options = {
    type: "basic",
    iconUrl: iconUrl,
    title: "📄 Paperless Uploader",
    message: message
  };
  // Same id = the notification is replaced instead of stacked
  if (notificationId) {
    browser.notifications.create(notificationId, options);
  } else {
    browser.notifications.create(options);
  }
}

// Handle quick upload from message display popup
async function handleQuickUploadFromDisplay(messageId) {
  try {
    const message = await browser.messages.get(messageId);
    if (!(await processQuickPdfUpload(message))) {
      showNotification("No supported attachments found in displayed message", "info");
    }
  } catch (error) {
    console.error("Error handling quick upload from display:", error);
    showNotification("Error processing quick upload", "error");
  }
}

// Handle advanced upload from message display popup
async function handleAdvancedUploadFromDisplay(messageId) {
  try {
    const message = await browser.messages.get(messageId);

    // Get uploadable attachments
    const pdfAttachments = await getUploadableAttachments(message.id);

    if (pdfAttachments.length === 0) {
      showNotification("No supported attachments found in displayed message", "info");
      return;
    }

    // Open the advanced upload dialog
    await openAdvancedUploadDialog(message, pdfAttachments);
  } catch (error) {
    console.error("Error handling advanced upload from display:", error);
    showNotification("Error processing advanced upload", "error");
  }
}
