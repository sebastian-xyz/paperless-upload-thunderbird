document.addEventListener('DOMContentLoaded', async function() {
  await updateStatus();
  
  document.getElementById('test-connection').addEventListener('click', testConnection);
  document.getElementById('open-options').addEventListener('click', openOptions);
});

async function updateStatus() {
  const config = await getPaperlessSettings();
  
  const urlStatus = document.getElementById('url-status');
  const tokenStatus = document.getElementById('token-status');
  
  urlStatus.className = `status-icon ${config.paperlessUrl ? 'status-configured' : 'status-not-configured'}`;
  tokenStatus.className = `status-icon ${config.paperlessToken ? 'status-configured' : 'status-not-configured'}`;
  
  const testBtn = document.getElementById('test-connection');
  testBtn.disabled = !config.paperlessUrl || !config.paperlessToken;
}

async function testConnection() {
  const config = await getPaperlessSettings();
  const testBtn = document.getElementById('test-connection');
  
  const originalText = setButtonLoading(testBtn, 'Testing...');
  
  try {
    const success = await testPaperlessConnection(config.paperlessUrl, config.paperlessToken);
    
    if (success) {
      testBtn.textContent = '✓ Connection Successful';
      testBtn.style.background = '#28a745';
      setTimeout(() => {
        resetButtonLoading(testBtn, originalText);
        testBtn.style.background = '#007bff';
      }, 2000);
    } else {
      throw new Error('Connection failed');
    }
  } catch (error) {
    testBtn.textContent = '✗ Connection Failed';
    testBtn.style.background = '#dc3545';
    console.error('Connection test failed:', error);
    setTimeout(() => {
      resetButtonLoading(testBtn, originalText);
      testBtn.style.background = '#007bff';
    }, 2000);
  }
}

function openOptions() {
  browser.runtime.openOptionsPage();
}