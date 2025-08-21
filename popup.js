document.addEventListener('DOMContentLoaded', async function() {
  await updateStatus();
  
  document.getElementById('test-connection').addEventListener('click', testConnection);
  document.getElementById('open-options').addEventListener('click', openOptions);
});

async function updateStatus() {
  const config = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);
  
  const urlStatus = document.getElementById('url-status');
  const tokenStatus = document.getElementById('token-status');
  
  urlStatus.className = `status-icon ${config.paperlessUrl ? 'status-configured' : 'status-not-configured'}`;
  tokenStatus.className = `status-icon ${config.paperlessToken ? 'status-configured' : 'status-not-configured'}`;
  
  const testBtn = document.getElementById('test-connection');
  testBtn.disabled = !config.paperlessUrl || !config.paperlessToken;
}

async function testConnection() {
  const config = await browser.storage.sync.get(['paperlessUrl', 'paperlessToken']);
  const testBtn = document.getElementById('test-connection');
  
  testBtn.textContent = 'Testing...';
  testBtn.disabled = true;
  
  try {
    const response = await fetch(`${config.paperlessUrl.replace(/\/$/, '')}/api/documents/`, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${config.paperlessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      testBtn.textContent = '✓ Connection Successful';
      testBtn.style.background = '#28a745';
      setTimeout(() => {
        testBtn.textContent = 'Test Connection';
        testBtn.style.background = '#007bff';
        testBtn.disabled = false;
      }, 2000);
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    testBtn.textContent = '✗ Connection Failed';
    testBtn.style.background = '#dc3545';
    console.error('Connection test failed:', error);
    setTimeout(() => {
      testBtn.textContent = 'Test Connection';
      testBtn.style.background = '#007bff';
      testBtn.disabled = false;
    }, 2000);
  }
}

function openOptions() {
  browser.runtime.openOptionsPage();
}