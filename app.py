import os
import sqlite3
import json
import re
import logging
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import openai
from dotenv import load_dotenv
import threading
import queue
import time

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# OpenAI configuration
openai_client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))

class AirportVoiceAssistant:
    def __init__(self, db_path='united_airlines_normalized.db'):
        self.db_path = db_path
        self.confidence_threshold = 0.7
        self.supported_languages = {
            'en': {'name': 'English', 'wake_words': ['jarvis', 'hey jarvis']},
            'es': {'name': 'Spanish', 'wake_words': ['jaime', 'hola jaime', 'oye jaime']},
            'fr': {'name': 'French', 'wake_words': ['jacques', 'salut jacques', 'hey jacques']}
        }
        
        # Conversation context storage (in-memory for demo)
        self.conversation_sessions = {}
        self.session_timeout = 30 * 60  # 30 minutes
        
    def connect_db(self):
        """Connect to SQLite database"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row  # Enable dict-like access
            return conn
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            return None
    
    def get_database_schema(self):
        """Get database schema to understand available tables and columns"""
        conn = self.connect_db()
        if not conn:
            return None
        
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            tables = cursor.fetchall()
            
            schema = {}
            for table in tables:
                table_name = table[0]
                cursor.execute(f"PRAGMA table_info({table_name});")
                columns = cursor.fetchall()
                schema[table_name] = [col[1] for col in columns]
            
            conn.close()
            return schema
        except Exception as e:
            logger.error(f"Schema retrieval error: {e}")
            return None
    
    def execute_query(self, query, params=None):
        """Execute SQL query safely"""
        conn = self.connect_db()
        if not conn:
            return None
        
        try:
            cursor = conn.cursor()
            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)
            results = cursor.fetchall()
            conn.close()
            return [dict(row) for row in results]
        except Exception as e:
            logger.error(f"Query execution error: {e}")
            return None
    
    def parse_query_to_sql(self, user_query, schema, language='en', context_prompt=''):
        """Convert natural language query to SQL using OpenAI with conversation context"""
        try:
            schema_text = "\n".join([f"Table: {table}, Columns: {', '.join(columns)}" 
                                   for table, columns in schema.items()])
            
            # Language-specific prompts
            language_prompts = {
                'en': {
                    'instruction': "You are an AI assistant that converts natural language queries about airport operations into SQL queries.",
                    'examples': [
                        '"What is the status of flight UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
                        '"What ramp team members are on break now?" -> SELECT * FROM employees WHERE status = \'on_break\' AND department = \'ramp\';'
                    ]
                },
                'es': {
                    'instruction': "Eres un asistente de IA que convierte consultas en lenguaje natural sobre operaciones aeroportuarias en consultas SQL.",
                    'examples': [
                        '"¿Cuál es el estado del vuelo UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
                        '"¿Qué miembros del equipo de rampa están en descanso?" -> SELECT * FROM employees WHERE status = \'on_break\' AND department = \'ramp\';'
                    ]
                },
                'fr': {
                    'instruction': "Vous êtes un assistant IA qui convertit les requêtes en langage naturel sur les opérations aéroportuaires en requêtes SQL.",
                    'examples': [
                        '"Quel est le statut du vol UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
                        '"Quels membres de l\'équipe de piste sont en pause?" -> SELECT * FROM employees WHERE status = \'on_break\' AND department = \'ramp\';'
                    ]
                }
            }
            
            lang_config = language_prompts.get(language, language_prompts['en'])
            examples_text = '\n            - '.join(lang_config['examples'])
            
            prompt = f"""
            {lang_config['instruction']}
            
            Database Schema:
            {schema_text}
            {context_prompt}
            User Query: "{user_query}"
            
            Convert this to a SQL query. Only return the SQL query, nothing else.
            If the query cannot be answered with the available data, return "NO_DATA".
            
            Examples:
            - {examples_text}
            
            SQL Query:"""
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.1
            )
            
            sql_query = response.choices[0].message.content.strip()
            return sql_query if sql_query != "NO_DATA" else None
            
        except Exception as e:
            logger.error(f"Query parsing error: {e}")
            return None
    
    def format_response(self, data, original_query, language='en'):
        """Format database results into natural language response"""
        if not data:
            no_data_responses = {
                'en': "I don't know - I couldn't find that information in our database.",
                'es': "No lo sé - no pude encontrar esa información en nuestra base de datos.",
                'fr': "Je ne sais pas - je n'ai pas pu trouver cette information dans notre base de données."
            }
            return no_data_responses.get(language, no_data_responses['en'])
        
        try:
            # Language-specific response formatting prompts
            response_prompts = {
                'en': "Convert this database result into a natural, conversational response for an airport operations worker.",
                'es': "Convierte este resultado de la base de datos en una respuesta natural y conversacional para un trabajador de operaciones aeroportuarias.",
                'fr': "Convertissez ce résultat de base de données en une réponse naturelle et conversationnelle pour un travailleur des opérations aéroportuaires."
            }
            
            instruction_prompts = {
                'en': """Provide a comprehensive, detailed answer that includes ALL relevant information from the database results. 

For flight status queries, include:
- Flight number and current status
- Gate information (departure and arrival gates)
- Scheduled and actual departure/arrival times if available
- Aircraft type if available
- Any delay or operational information

For equipment queries, include:
- Equipment ID, type, and current status
- Current location and assignment details
- Operator information if available

For personnel queries, include:
- Full name, role, and current status
- Contact information if available
- Shift and location information

Make the response natural for voice output but don't omit important details. Users want complete information, not just brief summaries.""",
                'es': "Proporciona una respuesta detallada y completa que incluya TODA la información relevante de los resultados de la base de datos. Para consultas de estado de vuelo, incluye: número de vuelo, estado, puertas, horarios y tipo de aeronave. Haz que la respuesta sea natural para salida de voz pero no omitas detalles importantes.",
                'fr': "Fournissez une réponse détaillée et complète qui inclut TOUTES les informations pertinentes des résultats de la base de données. Pour les requêtes d'état de vol, incluez: numéro de vol, statut, portes, horaires et type d'avion. Rendez la réponse naturelle pour la sortie vocale mais n'omettez pas les détails importants."
            }
            
            main_prompt = response_prompts.get(language, response_prompts['en'])
            instruction = instruction_prompts.get(language, instruction_prompts['en'])
            
            prompt = f"""
            {main_prompt}
            
            Original Question: "{original_query}"
            Database Result: {json.dumps(data, indent=2)}
            
            {instruction}
            """
            
            response = openai_client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=150,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Response formatting error: {e}")
            return "I found some information but had trouble formatting the response."
    
    def detect_language(self, text):
        """Simple language detection based on common words"""
        spanish_words = ['que', 'cual', 'donde', 'cuando', 'como', 'vuelo', 'estado', 'equipo', 'personal']
        french_words = ['quel', 'ou', 'quand', 'comment', 'vol', 'statut', 'equipe', 'personnel']
        
        text_lower = text.lower()
        spanish_count = sum(1 for word in spanish_words if word in text_lower)
        french_count = sum(1 for word in french_words if word in text_lower)
        
        if spanish_count > 0:
            return 'es'
        elif french_count > 0:
            return 'fr'
        return 'en'
    
    def process_query(self, user_query, language=None, session_id=None, context_data=None):
        """Main processing pipeline with conversation context support"""
        start_time = time.time()
        
        # Auto-detect language if not provided
        if language is None:
            language = self.detect_language(user_query)
        
        # Handle conversation context
        context_prompt = ''
        if session_id and context_data:
            context_prompt = self.build_context_prompt(context_data)
        
        # Error messages by language
        error_messages = {
            'en': {
                'db_error': "I'm having trouble accessing the database right now.",
                'parse_error': "I don't know - I couldn't understand how to find that information.",
                'query_error': "I encountered an error while searching for that information."
            },
            'es': {
                'db_error': "Tengo problemas para acceder a la base de datos en este momento.",
                'parse_error': "No lo sé - no pude entender cómo encontrar esa información.",
                'query_error': "Encontré un error al buscar esa información."
            },
            'fr': {
                'db_error': "J'ai des difficultés à accéder à la base de données en ce moment.",
                'parse_error': "Je ne sais pas - je n'ai pas pu comprendre comment trouver cette information.",
                'query_error': "J'ai rencontré une erreur lors de la recherche de cette information."
            }
        }
        
        messages = error_messages.get(language, error_messages['en'])
        
        # Get database schema
        schema = self.get_database_schema()
        if not schema:
            return {
                "response": messages['db_error'],
                "confidence": 0.0,
                "latency": time.time() - start_time,
                "language": language
            }
        
        # Convert to SQL with context
        sql_query = self.parse_query_to_sql(user_query, schema, language, context_prompt)
        if not sql_query:
            return {
                "response": messages['parse_error'],
                "confidence": 0.0,
                "latency": time.time() - start_time,
                "language": language
            }
        
        # Execute query
        results = self.execute_query(sql_query)
        if results is None:
            return {
                "response": messages['query_error'],
                "confidence": 0.0,
                "latency": time.time() - start_time,
                "language": language
            }
        
        # Format response
        response_text = self.format_response(results, user_query, language)
        
        # Calculate confidence based on result quality
        confidence = 0.9 if results else 0.1
        if any(phrase in response_text.lower() for phrase in ["don't know", "no lo sé", "ne sais pas"]):
            confidence = 0.1
        
        return {
            "response": response_text,
            "confidence": confidence,
            "latency": time.time() - start_time,
            "sql_query": sql_query,
            "result_count": len(results) if results else 0,
            "language": language
        }
    
    def build_context_prompt(self, context_data):
        """Build context prompt from conversation history"""
        if not context_data or not context_data.get('relevantContext'):
            return ''
        
        context_prompt = '\nConversation Context:\n'
        for i, exchange in enumerate(context_data['relevantContext']):
            context_prompt += f"{i+1}. User: \"{exchange.get('userQuery', '')}\"\n"
            context_prompt += f"   Assistant: \"{exchange.get('assistantResponse', '')}\"\n"
        
        context_prompt += '\nPlease consider this conversation context when generating the SQL query.\n'
        return context_prompt
    
    def store_conversation_exchange(self, session_id, user_query, assistant_response):
        """Store conversation exchange for context"""
        if session_id not in self.conversation_sessions:
            self.conversation_sessions[session_id] = {
                'exchanges': [],
                'created': time.time(),
                'last_activity': time.time()
            }
        
        exchange = {
            'userQuery': user_query,
            'assistantResponse': assistant_response,
            'timestamp': time.time()
        }
        
        session = self.conversation_sessions[session_id]
        session['exchanges'].append(exchange)
        session['last_activity'] = time.time()
        
        # Keep only last 10 exchanges per session
        if len(session['exchanges']) > 10:
            session['exchanges'] = session['exchanges'][-10:]
    
    def cleanup_expired_sessions(self):
        """Remove expired conversation sessions"""
        current_time = time.time()
        expired_sessions = []
        
        for session_id, session in self.conversation_sessions.items():
            if (current_time - session['last_activity']) > self.session_timeout:
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            del self.conversation_sessions[session_id]
        
        return len(expired_sessions)

# Initialize assistant
assistant = AirportVoiceAssistant()

@app.route('/')
def index():
    """Serve the main web interface"""
    import time
    return render_template('index.html', timestamp=int(time.time()))

@app.route('/test-hybrid-speech.html')
def test_hybrid_speech():
    """Serve the hybrid speech test page"""
    from flask import send_from_directory
    return send_from_directory('.', 'test-hybrid-speech.html')

@app.route('/api/query', methods=['POST'])
def process_voice_query():
    """Process voice query and return response with conversation context"""
    try:
        data = request.get_json()
        user_query = data.get('query', '').strip()
        language = data.get('language', None)  # Optional language override
        session_id = data.get('sessionId', None)  # Session for conversation context
        context_data = data.get('contextData', None)  # Conversation context
        
        if not user_query:
            error_responses = {
                'en': "I didn't hear your question. Could you please repeat it?",
                'es': "No escuché tu pregunta. ¿Podrías repetirla por favor?",
                'fr': "Je n'ai pas entendu votre question. Pourriez-vous la répéter s'il vous plaît?"
            }
            detected_lang = language or assistant.detect_language(user_query) or 'en'
            return jsonify({
                "error": "No query provided",
                "response": error_responses.get(detected_lang, error_responses['en']),
                "language": detected_lang
            }), 400
        
        # Process the query with context
        result = assistant.process_query(user_query, language, session_id, context_data)
        
        # Store conversation exchange if session_id provided
        if session_id and result.get('response'):
            assistant.store_conversation_exchange(session_id, user_query, result['response'])
        
        # Add confidence disclosure if needed (language-specific)
        if result['confidence'] < assistant.confidence_threshold:
            confidence_prefixes = {
                'en': "I'm not entirely sure, but",
                'es': "No estoy completamente seguro, pero",
                'fr': "Je ne suis pas entièrement sûr, mais"
            }
            prefix = confidence_prefixes.get(result.get('language', 'en'), confidence_prefixes['en'])
            result['response'] = f"{prefix} {result['response']}"
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Query processing error: {e}")
        error_responses = {
            'en': "I'm having technical difficulties right now. Please try again.",
            'es': "Tengo dificultades técnicas en este momento. Por favor intenta de nuevo.",
            'fr': "J'ai des difficultés techniques en ce moment. Veuillez réessayer."
        }
        detected_lang = data.get('language') if 'data' in locals() else 'en'
        return jsonify({
            "error": str(e),
            "response": error_responses.get(detected_lang, error_responses['en']),
            "language": detected_lang
        }), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        schema = assistant.get_database_schema()
        return jsonify({
            "status": "healthy",
            "database_connected": schema is not None,
            "tables_found": len(schema) if schema else 0
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

@app.route('/api/languages', methods=['GET'])
def get_supported_languages():
    """Get supported languages and their wake words"""
    return jsonify(assistant.supported_languages)

@app.route('/api/test', methods=['GET'])
def test_queries():
    """Test endpoint with sample queries"""
    test_questions = {
        'en': [
            "What is the status of flight UA2406?",
            "What ramp team members are on break now?",
            "What is the nearest pushback tractor to gate A1?"
        ],
        'es': [
            "¿Cuál es el estado del vuelo UA2406?",
            "¿Qué miembros del equipo de rampa están en descanso ahora?",
            "¿Cuál es el tractor de empuje más cercano a la puerta A1?"
        ],
        'fr': [
            "Quel est le statut du vol UA2406?",
            "Quels membres de l'équipe de piste sont en pause maintenant?",
            "Quel est le tracteur de poussée le plus proche de la porte A1?"
        ]
    }
    
    language = request.args.get('language', 'en')
    questions = test_questions.get(language, test_questions['en'])
    
    results = []
    for question in questions:
        result = assistant.process_query(question, language)
        results.append({
            "question": question,
            "response": result["response"],
            "confidence": result["confidence"],
            "latency": result["latency"],
            "language": result.get("language", language)
        })
    
    return jsonify(results)

@app.route('/api/debug-query', methods=['POST'])
def debug_query():
    """Debug endpoint to track voice queries"""
    try:
        data = request.get_json()
        query = data.get('query', '').strip()
        original_transcript = data.get('originalTranscript', '')
        
        logger.info(f"Debug Query - Original: '{original_transcript}' | Processed: '{query}'")
        
        return jsonify({
            "received_query": query,
            "original_transcript": original_transcript,
            "timestamp": datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Debug query error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/improve-transcription', methods=['POST'])
def improve_transcription():
    """Improve speech transcription accuracy using OpenAI"""
    try:
        data = request.get_json()
        transcript = data.get('transcript', '').strip()
        context = data.get('context', 'general')
        
        if not transcript:
            return jsonify({
                "error": "No transcript provided",
                "improved_transcript": transcript
            }), 400
        
        # Use OpenAI to improve the transcription
        prompt = f"""
        You are helping improve speech-to-text transcription accuracy for an airport operations voice assistant.
        
        Context: {context}
        Original transcript: "{transcript}"
        
        The transcript may contain errors typical of speech recognition, especially with:
        - Flight numbers (like "U A 2406" should be "UA2406")
        - Aviation terminology
        - Fragmented numbers or letters
        
        Please correct any obvious transcription errors and return the improved version.
        Focus on:
        1. Fixing fragmented flight numbers (U A 2406 → UA2406)
        2. Correcting common aviation terms
        3. Maintaining the original meaning and structure
        
        Return only the corrected transcript, no explanations.
        """
        
        response = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.1
        )
        
        improved_transcript = response.choices[0].message.content.strip()
        
        # Log the improvement for debugging
        logger.info(f"Transcription improvement: '{transcript}' → '{improved_transcript}'")
        
        return jsonify({
            "original_transcript": transcript,
            "improved_transcript": improved_transcript,
            "improvement_applied": transcript != improved_transcript
        })
        
    except Exception as e:
        logger.error(f"Transcription improvement error: {e}")
        return jsonify({
            "error": str(e),
            "original_transcript": data.get('transcript', ''),
            "improved_transcript": data.get('transcript', '')
        }), 500

@app.route('/api/flights/status', methods=['GET'])
def flights_status():
    """Get all flights status"""
    try:
        results = assistant.execute_query("SELECT * FROM flights LIMIT 10")
        return jsonify({"flights": results or []})
    except Exception as e:
        logger.error(f"Flights status error: {e}")
        return jsonify({"error": str(e), "flights": []}), 500

@app.route('/api/personnel/status', methods=['GET'])
def personnel_status():
    """Get personnel status"""
    try:
        results = assistant.execute_query("SELECT * FROM employees LIMIT 10")
        return jsonify({"personnel": results or []})
    except Exception as e:
        logger.error(f"Personnel status error: {e}")
        return jsonify({"error": str(e), "personnel": []}), 500

@app.route('/api/equipment/status', methods=['GET'])
def equipment_status():
    """Get equipment status"""
    try:
        results = assistant.execute_query("SELECT * FROM equipment LIMIT 10")
        return jsonify({"equipment": results or []})
    except Exception as e:
        logger.error(f"Equipment status error: {e}")
        return jsonify({"error": str(e), "equipment": []}), 500

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=3000) 