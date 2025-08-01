# 🔧 Speech Recognition Debug Guide

## Current Issues Fixed

### ✅ **Enhanced Web Speech API Errors** 
- **Problem**: "aborted" errors causing infinite retry loops
- **Fix**: Temporarily disabled Enhanced Web Speech API, using stable basic version
- **Status**: No more "aborted" error loops

### ✅ **Better Error Handling**
- **Problem**: Poor fallback when Whisper fails
- **Fix**: Added comprehensive try-catch with graceful degradation
- **Status**: Clean fallbacks between speech recognition methods

### ✅ **Debug Information Added**
- **Problem**: Unclear why Whisper wasn't being used
- **Fix**: Added extensive console logging for troubleshooting
- **Status**: Full visibility into speech recognition routing

---

## 🔍 Current Status Check

**Refresh your browser and check the console for these debug messages:**

### 1. Whisper Status Check
Look for:
```
🔍 Checking Whisper status...
🔍 Whisper Status: {available: false/true, reason: "..."}
```

### 2. Provider Recommendation
Look for:
```
🔍 Provider Recommendation Debug:
   - Whisper client exists: true/false
   - Whisper status: hasAPIKey=false/true, canMakeRequest=false/true
✅ Recommending Whisper (primary, accurate)
```
OR
```
❌ Whisper unavailable - API key or request limit issues
✅ Final fallback to Web Speech
```

### 3. Hybrid Routing Decision
Look for:
```
🎯 Hybrid Routing: Using whisper (reason: whisper_primary_accurate, confidence: 0.90)
🤖 Attempting to start Whisper...
```
OR
```
🎯 Hybrid Routing: Using webspeech (reason: webspeech_fallback, confidence: 0.35)
🎤 Using Web Speech API (Whisper not available or not recommended)
```

---

## 🚀 To Enable Whisper (Recommended)

**Open Browser Console (F12) and run:**

```javascript
// 1. Set your OpenAI API key
window.voiceAssistant.setOpenAIAPIKey("sk-your-actual-api-key-here");

// 2. Check if it worked
window.voiceAssistant.checkWhisperStatus();

// 3. Restart voice assistant to use Whisper
location.reload();
```

---

## 🧪 Testing Speech Recognition

### Expected Behavior:

**With Whisper API Key:**
1. Console shows: `🤖 Attempting to start Whisper...`
2. Say: "Jarvis, what is the status of flight UA2406"
3. Should correctly hear "UA2406" (not "82406")

**Without Whisper API Key:**
1. Console shows: `🎤 Using Web Speech API`
2. Say: "Jarvis, what is the status of flight UA2406" 
3. May incorrectly hear "82406" but backend will try to match partial numbers

---

## 🔧 Troubleshooting

### No Whisper Client?
```
❌ Whisper client not initialized
```
**Solution**: Whisper client failed to initialize. Check for JavaScript errors.

### No API Key?
```
❌ Whisper unavailable - API key or request limit issues
```
**Solution**: Run `window.voiceAssistant.setOpenAIAPIKey("sk-...")` in console.

### Still Getting "aborted" Errors?
**Solution**: The Enhanced Web Speech API is disabled. You should now see:
```
🎤 Starting basic Web Speech API recognition (Enhanced disabled)
✅ Basic Web Speech API started successfully
```

### Speech Recognition Not Working At All?
1. Check microphone permissions in browser
2. Try clicking the voice bubble manually
3. Check console for error messages
4. Try refreshing the page

---

## 📊 Current Configuration

- **Primary**: Whisper API (if configured with API key)
- **Fallback**: Basic Web Speech API (Enhanced version disabled)
- **Backend**: Smart flight number matching (handles "82406" → finds "UA2406")
- **Error Handling**: Graceful degradation, extensive logging

---

## ⚡ Quick Commands

```javascript
// Check current speech provider
console.log(window.voiceAssistant.speechRecognitionProvider);

// Force a specific provider (for testing)
window.voiceAssistant.setForcedProvider("whisper");  // or "webspeech"

// Get current recommendation
console.log(window.voiceAssistant.getProviderRecommendation());

// Check Whisper costs (if configured)
console.log(window.voiceAssistant.lastWhisperCosts);
``` 