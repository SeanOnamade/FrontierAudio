# JARVIS - Airport Operations Voice AI Assistant

A voice-activated AI assistant for frontline airport operations workers. Built for the Frontier AI Challenge. Say "Jarvis" and ask about flights, equipment, staff, or shifts -- get an answer spoken back in under 3 seconds.

![JARVIS main interface -- listening for wake word](static/images/Screenshot%202026-03-22%20164728.png)

## Quick Start

### Prerequisites
- Python 3.8+
- Chrome or Edge browser
- OpenAI API key
- `united_airlines_normalized (Gauntlet).db` database file in the project root

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env
# Then edit .env and add your OpenAI API key
```

### Run

```bash
python app.py
```

Open `http://localhost:3000` in Chrome, allow microphone access, and click **Start Voice Assistant**.

## How It Works

1. **Wake word** -- Say "Jarvis" or "Hey Jarvis" to activate
2. **Ask a question** -- The orb animates and listens for your command
3. **AI processes it** -- Your speech is converted to text, classified, and turned into a SQL query
4. **Get an answer** -- Results are spoken back to you with on-screen display

![Wake word detected -- JARVIS is now listening for your question](static/images/Screenshot%202026-03-22%20164752.png)

### Example Questions

```
"Jarvis, what is the status of flight UA2406?"
"Hey Jarvis, what pushback tractor is assigned to gate A1?"
"Jarvis, who is the cleaning lead on flight XYZ?"
"Jarvis, when does John's shift end?"
```

The Example Questions panel shows suggested queries with their expected SQL and responses.

![Example questions panel with generated SQL query overlay](static/images/Screenshot%202026-03-22%20165040.png)

### Conversation & Responses

All interactions are logged in the conversation panel with timestamps, confidence scores, and response times.

![Conversation log -- user asks about idle ground power units, JARVIS responds with count and confidence](static/images/Screenshot%202026-03-22%20165053.png)

![Full interface -- staff query with SQL debug view and example questions](static/images/Screenshot%202026-03-22%20165152.png)

## Architecture

### Backend (Python/Flask)
- **OpenAI GPT** for natural language to SQL conversion
- **SQLite** database with United Airlines operational data
- **3-layer speech normalization**: hard-coded patterns → dynamic DB fallback → AI-enhanced SQL
- RESTful API with Swagger docs at `/docs`

### Frontend (JavaScript/HTML5)
- **Web Speech API** for voice recognition and text-to-speech
- Wake word detection with fuzzy matching
- Real-time conversation UI with visual feedback

## API

### v2 (Recommended)

```bash
# Query
POST /api/v2/query
{"query": "what gate is flight UA2406 at?", "language": "en"}

# Health & analytics
GET /api/v2/health
GET /api/v2/analytics
```

### v1 (Legacy)

```bash
POST /api/query
{"query": "What is the status of flight UA2406?"}

GET /api/health
GET /api/test
```

Interactive API docs available at `http://localhost:3000/docs`.

## Project Structure

```
FrontierAudio/
├── app.py                  # Flask backend (main application)
├── config.py               # Configuration settings
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Main web interface
├── static/
│   ├── css/                # Stylesheets
│   └── js/
│       ├── app.js          # Main app logic
│       ├── voice-assistant.js   # Speech processing
│       └── wake-word.js    # Wake word detection
└── mobile/                 # React Native companion app
```

## Performance

| Metric | Target |
|--------|--------|
| Response latency | < 3s for 80% of queries |
| Accuracy | 90%+ with confidence scoring |
| Classification | 90% handled by fast keyword matching (0 AI calls) |
| Cache hit rate | 90%+ after initial queries |

## Configuration

All config is in `config.py` with env var overrides. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for NL-to-SQL |
| `DATABASE_PATH` | `united_airlines_normalized.db` | SQLite database path |
| `FLASK_PORT` | `3000` | Server port |
| `CONFIDENCE_THRESHOLD` | `0.7` | Min confidence for responses |

## Contributors

- [Benjamin Yang](https://github.com/bennyyang11)
- [Sean Onamade](https://github.com/SeanOnamade)
