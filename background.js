console.log("Background script loaded. VERSION: DEBUG-007");

let isProcessing = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "summarize") {
    if (isProcessing) {
        sendResponse({status: "Already processing... please wait."});
        return true;
    }
    isProcessing = true;
    handleSummarization(request.transcript, sendResponse).finally(() => {
        isProcessing = false;
    });
    return true; // Indicates async response
  }
});

async function log(message) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0,8);
    const logEntry = `[${timestamp}] ${message}
`;
    console.log("LOG:", logEntry.trim());
    
    try {
        const data = await chrome.storage.local.get({debugLogs: ""});
        const newLogs = logEntry + (data.debugLogs || ""); 
        await chrome.storage.local.set({debugLogs: newLogs.slice(0, 10000)});
    } catch (e) {
        console.error("Failed to save log:", e);
    }
}

async function handleSummarization(transcript, sendResponse) {
  try {
    await log("Background: Starting summarization (v7)...");
    
    const config = await chrome.storage.sync.get(['geminiKey', 'telegramToken', 'chatId']);
    
    if (!config.geminiKey || !config.telegramToken || !config.chatId) {
      const msg = "Error: Config missing. Please check settings.";
      await log(msg);
      sendResponse({status: msg});
      return;
    }

    const apiKey = config.geminiKey.trim();
    const telegramToken = config.telegramToken.trim();
    const chatId = config.chatId.trim();

    await log(`Transcript length: ${transcript.length}`);
    sendResponse({status: "Sending to Gemini..."});

    // 1. Send to Gemini
    await log("Sending to Gemini (gemini-flash-latest)...");
    const summary = await callGeminiWithRetry(transcript, apiKey);
    await log("Gemini success. Summary length: " + summary.length);
    
    // 2. Send to Telegram
    await log(`Sending to Telegram (${chatId})...");
    await callTelegram(summary, telegramToken, chatId);
    await log("Telegram sent successfully!");

  } catch (error) {
    await log("CRITICAL ERROR: " + error.message);
    console.error(error);
  }
}

async function callGeminiWithRetry(text, apiKey, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await callGemini(text, apiKey);
        } catch (e) {
            const isQuotaError = e.message.includes("429") || e.message.includes("RESOURCE_EXHAUSTED");
            if (isQuotaError && i < retries) {
                const delay = Math.pow(2, i + 1) * 1000; // 2s, 4s, 8s
                await log(`Quota hit (429). Retrying in ${delay/1000}s... (Attempt ${i+1}/${retries})`);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw e; // Rethrow if not 429 or retries exhausted
        }
    }
}

async function callGemini(text, apiKey) {
  const modelName = "gemini-flash-latest"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const prompt = `
    You are a professional meeting secretary. 
    Summarize the following meeting transcript. 
    Identify key decisions, action items, and open questions.
    
    Transcript:
    ${text}
  `;

  try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
          if (response.status === 404) {
             await log("Model 404 Error (" + modelName + "). Listing models...");
             await listAvailableModels(apiKey);
          }
          throw new Error(`Gemini API ${response.status}: ${JSON.stringify(data)}`);
      }
      
      if (data.error) throw new Error("Gemini Data Error: " + data.error.message);
      if (!data.candidates || !data.candidates[0]) throw new Error("Gemini: No candidates returned.");

      return data.candidates[0].content.parts[0].text;
  } catch (e) {
      throw e;
  }
}

async function listAvailableModels(apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.models) {
            const names = data.models.map(m => m.name).join(", ");
            await log("AVAILABLE MODELS: " + names);
        } else {
            await log("Could not list models: " + JSON.stringify(data));
        }
    } catch (e) {
        await log("Failed to list models: " + e.message);
    }
}

async function callTelegram(text, token, chatId) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
           throw new Error(`Telegram Network ${response.status}`);
      }

      if (!data.ok) {
          throw new Error(`Telegram API: ${data.description}`);
      }
      
      return data;
  } catch (e) {
      await log("Telegram Request Failed: " + e.message);
      throw e;
  }
}
