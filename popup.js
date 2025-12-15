document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  checkRecordingStatus();
  // Auto-refresh logs if open (optional, but good)
});

document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('startBtn').addEventListener('click', startRecording);
document.getElementById('stopBtn').addEventListener('click', stopAndSummarize);
document.getElementById('toggleLogsBtn').addEventListener('click', toggleLogs);
document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);

function saveOptions() {
  const geminiKey = document.getElementById('geminiKey').value;
  const telegramToken = document.getElementById('telegramToken').value;
  const chatId = document.getElementById('chatId').value;

  chrome.storage.sync.set({
    geminiKey: geminiKey,
    telegramToken: telegramToken,
    chatId: chatId
  }, () => {
    const status = document.getElementById('statusMsg');
    status.textContent = 'Options saved.';
    setTimeout(() => { status.textContent = ''; }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.sync.get({
    geminiKey: '',
    telegramToken: '',
    chatId: ''
  }, (items) => {
    document.getElementById('geminiKey').value = items.geminiKey;
    document.getElementById('telegramToken').value = items.telegramToken;
    document.getElementById('chatId').value = items.chatId;
  });
}

function checkRecordingStatus() {
    chrome.storage.local.get(['isRecording'], (result) => {
        if (result.isRecording) {
            setUIStateRecording(true);
        } else {
            setUIStateRecording(false);
        }
    });
}

function setUIStateRecording(isRecording) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('recordingStatus');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        status.textContent = "Recording in progress...";
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = "Ready to record";
    }
}

function startRecording() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) return;
    
    chrome.tabs.sendMessage(tabs[0].id, {action: "start"}, (response) => {
      if (chrome.runtime.lastError) {
        document.getElementById('recordingStatus').textContent = "Error: Please refresh the Google Meet tab.";
      } else {
        chrome.storage.local.set({isRecording: true});
        setUIStateRecording(true);
      }
    });
  });
}

function stopAndSummarize() {
  const statusEl = document.getElementById('recordingStatus');
  statusEl.textContent = "Stopping and processing...";
  document.getElementById('stopBtn').disabled = true;

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) {
        statusEl.textContent = "Error: No active tab found.";
        return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {action: "stop"}, (response) => {
      chrome.storage.local.set({isRecording: false});
      
      if (chrome.runtime.lastError) {
          statusEl.textContent = "Error communicating with page. Refresh?";
          setUIStateRecording(false);
          return;
      }

      if (response && response.transcript) {
        statusEl.textContent = "Sending to Gemini...";
        chrome.runtime.sendMessage({
            action: "summarize", 
            transcript: response.transcript
        }, (res) => {
             if (chrome.runtime.lastError) {
                 statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
             } else {
                 statusEl.textContent = res && res.status ? res.status : "Done!";
             }
             setUIStateRecording(false);
             refreshLogs(); // Refresh logs to show result
        });
      } else {
          statusEl.textContent = "No transcript captured (or empty).";
          setUIStateRecording(false);
      }
    });
  });
}

function toggleLogs() {
    const container = document.getElementById('logsContainer');
    const btn = document.getElementById('toggleLogsBtn');
    
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        btn.textContent = "Hide Debug Logs";
        refreshLogs();
    } else {
        container.classList.add('hidden');
        btn.textContent = "Show Debug Logs";
    }
}

function refreshLogs() {
    chrome.storage.local.get({debugLogs: ""}, (result) => {
        document.getElementById('debugLogs').value = result.debugLogs || "No logs yet.";
    });
}

function clearLogs() {
    chrome.storage.local.set({debugLogs: ""}, () => {
        refreshLogs();
    });
}

function saveOptions() {
  const geminiKey = document.getElementById('geminiKey').value;
  const telegramToken = document.getElementById('telegramToken').value;
  const chatId = document.getElementById('chatId').value;

  chrome.storage.sync.set({
    geminiKey: geminiKey,
    telegramToken: telegramToken,
    chatId: chatId
  }, () => {
    const status = document.getElementById('statusMsg');
    status.textContent = 'Options saved.';
    setTimeout(() => { status.textContent = ''; }, 1500);
  });
}

function restoreOptions() {
  chrome.storage.sync.get({
    geminiKey: '',
    telegramToken: '',
    chatId: ''
  }, (items) => {
    document.getElementById('geminiKey').value = items.geminiKey;
    document.getElementById('telegramToken').value = items.telegramToken;
    document.getElementById('chatId').value = items.chatId;
  });
}

function checkRecordingStatus() {
    chrome.storage.local.get(['isRecording'], (result) => {
        if (result.isRecording) {
            setUIStateRecording(true);
        } else {
            setUIStateRecording(false);
        }
    });
}

function setUIStateRecording(isRecording) {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('recordingStatus');

    if (isRecording) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        status.textContent = "Recording in progress...";
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        status.textContent = "Ready to record";
    }
}

function startRecording() {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) return;
    
    chrome.tabs.sendMessage(tabs[0].id, {action: "start"}, (response) => {
      if (chrome.runtime.lastError) {
        document.getElementById('recordingStatus').textContent = "Error: Please refresh the Google Meet tab.";
      } else {
        chrome.storage.local.set({isRecording: true});
        setUIStateRecording(true);
      }
    });
  });
}

function stopAndSummarize() {
  const statusEl = document.getElementById('recordingStatus');
  statusEl.textContent = "Stopping and processing...";
  document.getElementById('stopBtn').disabled = true;

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (!tabs[0]) {
        statusEl.textContent = "Error: No active tab found.";
        return;
    }

    chrome.tabs.sendMessage(tabs[0].id, {action: "stop"}, (response) => {
      chrome.storage.local.set({isRecording: false});
      
      if (chrome.runtime.lastError) {
          statusEl.textContent = "Error communicating with page. Refresh?";
          setUIStateRecording(false);
          return;
      }

      if (response && response.transcript) {
        statusEl.textContent = "Sending to Gemini...";
        chrome.runtime.sendMessage({
            action: "summarize", 
            transcript: response.transcript
        }, (res) => {
             if (chrome.runtime.lastError) {
                 statusEl.textContent = "Error: " + chrome.runtime.lastError.message;
             } else {
                 statusEl.textContent = res && res.status ? res.status : "Done!";
             }
             setUIStateRecording(false);
        });
      } else {
          statusEl.textContent = "No transcript captured (or empty).";
          setUIStateRecording(false);
      }
    });
  });
}
