let isRecording = false;
let transcript = [];
let observer = null;
let recIndicator = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start") {
    if (!isRecording) {
        isRecording = true;
        transcript = [];
        showRecordingIndicator();
        startObserving();
    }
    sendResponse({status: "started"});
  } else if (request.action === "stop") {
    isRecording = false;
    hideRecordingIndicator();
    stopObserving();
    const fullText = formatTranscript(transcript);
    sendResponse({status: "stopped", transcript: fullText});
  }
});

function showRecordingIndicator() {
    if (document.getElementById('meet-summator-indicator')) return;

    recIndicator = document.createElement('div');
    recIndicator.id = 'meet-summator-indicator';
    recIndicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background-color: #d93025;
        color: white;
        padding: 8px 16px;
        border-radius: 24px;
        font-family: 'Google Sans', Roboto, Arial, sans-serif;
        font-weight: 500;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: none;
    `;
    recIndicator.innerHTML = '<span>●</span> REC (MeetSummator)';
    document.body.appendChild(recIndicator);
}

function hideRecordingIndicator() {
    const el = document.getElementById('meet-summator-indicator');
    if (el) el.remove();
}

// Fast-fail tags to ignore immediately without processing
const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'IMG', 'VIDEO', 'AUDIO',
    'IFRAME', 'LINK', 'META', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'
]);

function startObserving() {
  // Broad observer on body to catch subtitle additions
  const targetNode = document.body;
  const config = { childList: true, subtree: true, characterData: true };

  observer = new MutationObserver((mutationsList) => {
    if (!isRecording) return;

    // Throttle processing? For now, we process every mutation but filter heavily.
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach(node => {
                // Check if node is an element and likely part of captions
                if (node.nodeType === 1) { 
                    extractTextFromNode(node);
                }
            });
        } else if (mutation.type === 'characterData') {
             extractTextFromNode(mutation.target.parentElement);
        }
    }
  });

  observer.observe(targetNode, config);
}

function extractTextFromNode(node) {
    if (!node) return;

    // ⚡ PERFORMANCE: Cheap check to ignore non-content elements
    if (IGNORED_TAGS.has(node.tagName)) return;

    // Generic Text Extraction Strategy
    // We observe all text node additions. 
    // If a text node is added, we check its parent.
    // If the text is long enough (e.g. > 15 chars) and doesn't look like UI buttons (e.g. "Mute", "Leave call"), keep it.
    
    // NOTE: This will be noisy, but better than missing content.
    // We rely on the summarizer AI to filter out garbage.
    
    // ⚡ PERFORMANCE: Use textContent instead of innerText to avoid reflow.
    // innerText triggers a layout calculation on every access.
    // textContent is raw but fast. We filter garbage later.
    const text = node.textContent;
    if (!text) return;
    
    const cleanText = text.trim();
    if (cleanText.length < 5) return; // Too short, likely UI noise or single words
    
    // Filter out common UI terms in Meet (English/Russian examples)
    const noiseFilters = [
        "You", "Meeting details", "People", "Chat", "Activities", 
        "Turn on captions", "Turn off captions", "Present now", 
        "More options", "Leave call", "Mute", "Unmute", 
        "Camera", "Microphone", "Raise hand", "Stop recording",
        "Вы", "Детали встречи", "Люди", "Чат", "Действия",
        "Включить субтитры"
    ];
    
    if (noiseFilters.includes(cleanText)) return;

    // Check if the element is visible on screen
    const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    if (rect) {
        // Captions are usually at the bottom, but let's just check if it's visible at all
        if (rect.width === 0 || rect.height === 0) return; 
        
        // Ensure it's not the side panel (chat/people)
        // Side panel usually on the right side.
        // Let's exclude the rightmost 20% of the screen if the window is wide
        if (window.innerWidth > 800 && rect.left > window.innerWidth * 0.8) return; 
    }
    
    addTranscriptLine("Unknown", cleanText);
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// Smart De-duplication using Sliding Window
const HISTORY_SIZE = 5;
let recentLines = []; // Stores last N unique lines

function addTranscriptLine(speaker, text) {
    text = text.trim();
    if (!text) return;

    // 1. Exact match check in history
    if (recentLines.includes(text)) return;

    // 2. Substring check (Is this new text just a shorter part of a previous line?)
    // Example: "Hello wo" vs "Hello world"
    const isSubstringOfRecent = recentLines.some(line => line.includes(text));
    if (isSubstringOfRecent) return;

    // 3. Superstring check (Is this new text an expansion of a previous line?)
    // Example: "Hello world" coming after "Hello"
    // In this case, we might want to REPLACE the partial line with the full one.
    // But since we are appending to a log, it's safer to just add it if it adds significant info,
    // or rely on Gemini to merge them.
    // BETTER STRATEGY: If the new text starts with the last line, replace the last line.
    
    if (recentLines.length > 0) {
        const lastLine = recentLines[recentLines.length - 1];
        if (text.startsWith(lastLine)) {
            // It's an update! Replace the last entry in the main transcript AND history
            transcript[transcript.length - 1] = `[${speaker}]: ${text}`;
            recentLines[recentLines.length - 1] = text;
            console.log("Updated last line:", text);
            return;
        }
        
        // Inverse: If the last line starts with this new text (jitter), ignore
        if (lastLine.startsWith(text)) return;
    }

    // New unique line found
    transcript.push(`[${speaker}]: ${text}`);
    console.log("Captured:", text); // Log to console so user can see what's happening
    
    // Update history
    recentLines.push(text);
    if (recentLines.length > HISTORY_SIZE) {
        recentLines.shift();
    }
}

function formatTranscript(lines) {
    return lines.join('\n');
}

console.log("MeetSummator Content Script Loaded");
