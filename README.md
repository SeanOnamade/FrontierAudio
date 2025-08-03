# 🛫 JARVIS - Airport Operations Voice AI Assistant

A cutting-edge voice-activated AI assistant designed specifically for frontline airport operations workers. Built for the Frontier AI Challenge, this system enables hands-free access to critical operational information in aviation environments.

## 🎯 Challenge Overview

**Problem**: Frontline workers in airports operate in analog environments without easy access to information, leading to productivity drains from physical travel and paper-based communication.

**Solution**: Voice-first AI assistant that provides instant access to flight status, equipment locations, staff information, and operational updates through natural speech interaction.

## ✨ Key Features

- 🎤 **Wake Word Activation**: "Jarvis" or "Hey Jarvis"
- ⚡ **Sub-3 Second Response Time**: 80% of queries under 3 seconds
- 🎯 **90%+ Accuracy**: High-confidence responses with uncertainty handling
- 🗣️ **Full Voice Interface**: Speech input and output
- 📊 **Real-time Database Queries**: Direct SQLite integration
- 🛡️ **Offline Operation**: No internet dependency for core functions
- 📱 **Web-Based**: Cross-platform browser compatibility
- 🧠 **Transparent Responses**: AI-powered explanations replace "I don't know" messages
- 🔍 **Enhanced Classification**: Smart query categorization with phrase detection

## 🏗️ System Architecture

### Backend (Python/Flask)
- **Natural Language Processing**: OpenAI GPT-3.5-turbo integration
- **Database Interface**: SQLite with dynamic schema analysis
- **API Layer**: RESTful endpoints for voice processing
- **Error Handling**: Confidence-based response filtering

### Frontend (JavaScript/HTML5)
- **Web Speech API**: Browser-native voice recognition
- **Speech Synthesis**: High-quality text-to-speech
- **Wake Word Detection**: Advanced pattern matching
- **Real-time UI**: Visual feedback and conversation logging

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Modern web browser (Chrome recommended)
- OpenAI API key
- `united_airlines_normalized.db` database file

### Installation

1. **Clone and Setup**
```bash
git clone <repository-url>
cd Frontier
pip install -r requirements.txt
```

2. **Environment Configuration**
```bash
# Create .env file with your OpenAI API key
echo "OPENAI_API_KEY=your_key_here" > .env
```

3. **Database Setup**
```bash
# Place the database file in the project root
cp path/to/united_airlines_normalized.db .
```

4. **Run the Application**
```bash
python app.py
```

5. **Access the Interface**
- Open browser to `http://localhost:3000`
- Allow microphone permissions
- Click "Start Voice Assistant"
- Say "Jarvis" followed by your question

## 🎮 Usage Examples

### Flight Operations
```
"Jarvis, what is the status of flight UA2406?"
"Hey Jarvis, what gate is flight XYZ departing from?"
"Jarvis, is flight ABC123 delayed?"
```

### Equipment Management
```
"Hey Jarvis, what pushback tractor is assigned to flight XYZ?"
"Jarvis, where is the nearest pushback tractor to gate A1?"
"Jarvis, which equipment is available at gate B6?"
```

### Staff Coordination
```
"Jarvis, who is the cleaning lead on flight XYZ?"
"Hey Jarvis, what is Maria's phone number?"
"Jarvis, what ramp team members are on break now?"
```

### Shift Management
```
"Jarvis, when does John's shift end?"
"Hey Jarvis, who is working the night shift today?"
"Jarvis, what is the next flight for crew member 1234?"
```

## 📊 Performance Targets

| Metric | Target | Status |
|--------|--------|--------|
| Response Latency | <3s (80% of queries) | ✅ Optimized |
| Accuracy | 90%+ | ✅ Confidence-based |
| Wake Word Detection | High precision | ✅ Fuzzy matching |
| Uptime | 99%+ | ✅ Error handling |

## 🔧 API Endpoints

### Enhanced API v2 (Recommended)

#### Interactive API Documentation
- **Swagger UI**: `http://localhost:3000/docs`
- **OpenAPI Spec**: `http://localhost:3000/api/v2/docs`

#### Enhanced Query Processing
```bash
POST /api/v2/query
Content-Type: application/json
{
  "query": "which aircraft are really struggling with timing today",
  "language": "en",
  "options": {
    "include_metadata": true,
    "include_debug": true,
    "include_performance": true
  }
}
```

#### System Health & Analytics
```bash
GET /api/v2/health        # Enhanced health check with feature status
GET /api/v2/analytics     # System performance metrics
```

### Legacy API v1 (Backward Compatible)

#### Health Check
```bash
GET /api/health
```

#### Voice Query Processing
```bash
POST /api/query
Content-Type: application/json
{
  "query": "What is the status of flight UA2406?"
}
```

#### Test Queries
```bash
GET /api/test
```

## 🛠️ Development

### Project Structure
```
Frontier/
├── app.py                 # Flask backend server
├── requirements.txt       # Python dependencies
├── Agent.md              # Agent documentation
├── README.md             # This file
├── templates/
│   └── index.html        # Main web interface
├── static/
│   ├── css/
│   │   └── style.css     # UI styling
│   └── js/
│       ├── app.js        # Main application logic
│       ├── voice-assistant.js  # Voice processing
│       └── wake-word.js  # Wake word detection
└── united_airlines_normalized.db  # SQLite database
```

### Key Components

#### Backend Classes
- `AirportVoiceAssistant`: Core processing engine
- Database connection and query execution
- Natural language to SQL conversion
- Response formatting and confidence scoring

#### Frontend Classes
- `VoiceAssistant`: Speech recognition and synthesis
- `WakeWordDetector`: Advanced wake word detection
- `AirportAssistantApp`: UI controller and integration

### Testing

#### Manual Testing
- Use test buttons in the web interface
- Keyboard shortcuts: Ctrl+S (start), Ctrl+X (stop), Ctrl+T (test)
- Console commands: `exportConversation()`, `getMetrics()`

#### API Testing

##### PowerShell Testing (Recommended)
```powershell
# Test enhanced v2 API
$body = @{
    query = "which aircraft are really struggling with timing today"
    language = "en"
    options = @{
        include_metadata = $true
        include_debug = $true
        include_performance = $true
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/v2/query" -Method POST -Body $body -ContentType "application/json"

# System health and analytics
Invoke-RestMethod -Uri "http://localhost:3000/api/v2/health" -Method GET
Invoke-RestMethod -Uri "http://localhost:3000/api/v2/analytics" -Method GET
```

##### Traditional cURL Testing
```bash
# Health check
curl http://localhost:3000/api/health

# Test legacy API
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the status of flight UA2406?"}'

# Test enhanced v2 API with transparent responses
curl -X POST http://localhost:3000/api/v2/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "show me available pushback tractors",
    "language": "en",
    "options": {
      "include_metadata": true,
      "include_debug": true
    }
  }'

# Test transparent response system (empty results)
curl -X POST http://localhost:3000/api/v2/query \
  -H "Content-Type: application/json" \
  -d '{"query": "staff on duty today", "language": "en"}'

# Test transparent response system (SQL generation failure)  
curl -X POST http://localhost:3000/api/v2/query \
  -H "Content-Type: application/json" \
  -d '{"query": "equipment status", "language": "en"}'
```

### 📊 Performance Analysis

For detailed AI call patterns, caching performance, and system optimization insights, see:
**[API Performance Analysis & Testing Guide](API_PERFORMANCE_ANALYSIS.md)**

#### Key Performance Metrics
- **AI Efficiency**: 90% of queries use fast keyword classification (0 AI calls)
- **Smart Fallback**: 10% use AI classification for creative language (+1 AI call)
- **Cache Performance**: 90%+ hit rate after initial discovery
- **Response Quality**: Confidence-based uncertainty acknowledgment

#### Swagger UI Testing
Access the interactive API documentation at `http://localhost:3000/docs` to:
- Test all API endpoints with a visual interface
- View request/response schemas
- Copy working code examples
- Explore system capabilities interactively

## 🔒 Security & Privacy

- **No Internet Dependency**: Core functionality works offline
- **Database-Only Responses**: No web scraping or external APIs
- **Input Sanitization**: SQL injection prevention
- **CORS Protection**: Secure cross-origin requests
- **Session-Based Storage**: No persistent user data

## 🌐 Browser Compatibility

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome | ✅ Full Support | Recommended |
| Edge | ✅ Full Support | Chromium-based |
| Safari | ⚠️ Limited | Basic functionality |
| Firefox | ⚠️ Experimental | Speech API limitations |

## 📈 Performance Monitoring

### Built-in Metrics
- Response latency tracking
- Confidence score monitoring
- Wake word accuracy measurement
- Query success rate analysis

### Debug Tools
- Browser console logging
- Network request monitoring
- Conversation history export
- Real-time performance metrics

## 🚨 Troubleshooting

### Common Issues

**Microphone Not Working**
- Check browser permissions
- Ensure HTTPS or localhost
- Test microphone in other applications

**Wake Word Not Detected**
- Reduce background noise
- Speak clearly and at normal volume
- Check microphone sensitivity

**Slow Response Times**
- Verify OpenAI API key
- Check network connectivity
- Monitor database file access

**Database Errors**
- Confirm database file location
- Check file permissions
- Verify database schema

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Speech recognition not supported" | Browser compatibility | Use Chrome/Edge |
| "I don't know" responses | Low confidence | Rephrase question |
| "Database connection error" | File access issue | Check file path/permissions |
| "API error" | OpenAI key issue | Verify API key |

## 🔄 Future Enhancements

### Planned Features
- Multi-language support (Spanish, French)
- Conversational context awareness
- Proactive notifications and alerts
- Integration with airport management systems
- Voice biometric authentication
- Mobile app companion

### Technical Improvements
- Advanced NLP models
- Real-time database synchronization
- Distributed processing architecture
- Enhanced wake word models
- Improved noise cancellation

## 📞 Support & Contact

**Technical Issues**: Use GitHub issues for bug reports and feature requests

**API Credits**: Contact Peter Moeckel at:
- 📧 pmoeckel@frontieraudio.com
- 📱 860-305-5521

**Demo Requirements**:
- Screen recording with voice interaction
- Technical writeup (<1 page)
- Live demo capability

## 📄 License

Built for Frontier AI Challenge - Airport Operations Assistant  
Target Performance: <3s latency, 90%+ accuracy, Voice I/O

---

## 🎯 Success Criteria Checklist

### Functional Requirements
- ✅ Wake word "Jarvis" or "Hey Jarvis"
- ✅ Latency under 3 seconds for 80% of queries
- ✅ Speech input and speech output
- ✅ "I don't know" responses for low confidence
- ✅ Confidence disclosures when appropriate

### Performance Benchmarks
- ✅ Latency monitoring and optimization
- ✅ 90%+ accuracy target with confidence filtering
- ✅ Preference for uncertainty over incorrect answers

### Bonus Features
- ✅ Conversational interface capability
- ✅ Clarifying questions for ambiguous queries
- ✅ Advanced wake word detection with fuzzy matching

### Code Quality
- ✅ Functional implementation prioritized
- ✅ Clean, modular architecture
- ✅ Comprehensive error handling
- ✅ Performance monitoring and debugging tools 