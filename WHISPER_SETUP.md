# 🎤 Whisper API Setup Guide

## Overview
Your voice assistant now uses **Whisper API as the primary** speech recognition method for improved accuracy with flight numbers and aviation terminology. Web Speech API serves as the fallback.

## Quick Setup

### 1. Get an OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key (starts with `sk-`)
3. Copy the key

### 2. Configure the API Key

**Option A: Browser Console (Recommended for Testing)**
1. Open your browser's Developer Tools (F12)
2. Go to the Console tab
3. Run this command:
```javascript
window.voiceAssistant.setOpenAIAPIKey("sk-your-actual-api-key-here");
```

**Option B: Direct localStorage**
```javascript
localStorage.setItem('openai_api_key', 'sk-your-actual-api-key-here');
```

### 3. Verify Setup
Check if Whisper is working:
```javascript
window.voiceAssistant.checkWhisperStatus();
```

## Testing Speech Recognition

### With Whisper (More Accurate)
- Say: **"Jarvis, what is the status of flight UA2406"**
- Should correctly hear "UA2406" instead of "82406"

### Fallback to Web Speech
- If Whisper fails or isn't configured, automatically falls back to Web Speech API
- You'll see console messages indicating which method is being used

## Cost Information
- Whisper API costs approximately **$0.006 per minute** of audio
- A typical 5-second voice command costs less than **$0.001**
- Built-in cost limits prevent unexpected charges

## Troubleshooting

### Whisper Not Working?
1. Check console for error messages
2. Verify API key starts with `sk-`
3. Ensure you have credits in your OpenAI account
4. Check browser console: `window.voiceAssistant.checkWhisperStatus()`

### Still Using Web Speech?
- Check console logs for routing decisions
- Look for messages like "🎯 Hybrid Routing: Using whisper"
- If no API key is configured, it will default to Web Speech

## Console Commands Reference
```javascript
// Set API key
window.voiceAssistant.setOpenAIAPIKey("sk-...");

// Check Whisper status
window.voiceAssistant.checkWhisperStatus();

// Force a specific provider (for testing)
window.voiceAssistant.setForcedProvider("whisper");  // or "webspeech"

// Check current provider recommendation
console.log(window.voiceAssistant.getProviderRecommendation());
```

## Expected Improvements
- ✅ Better recognition of flight numbers (UA2406 vs 82406)
- ✅ More accurate aviation terminology
- ✅ Improved performance in noisy environments
- ✅ Automatic fallback to Web Speech if Whisper fails 