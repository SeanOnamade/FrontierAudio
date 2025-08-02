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
    def __init__(self, db_path='united_airlines_normalized (Gauntlet).db'):
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
            
            # 🔍 DEBUGGING: Log SQL execution results
            results_dict = [dict(row) for row in results]
            logger.info(f"📊 SQL RESULTS: Found {len(results_dict)} rows")
            if results_dict:
                logger.info(f"📋 FIRST ROW: {results_dict[0]}")
            else:
                logger.warning(f"❌ NO RESULTS for query: {query}")
            
            conn.close()
            return results_dict
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
                    'instruction': "You are an AI assistant that converts natural language queries about airport operations into SQLite queries.",
                    'examples': [
                        # SPECIFICATION TEST CASES (Critical for 100% compliance)
                        '"What is the status of flight UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
                        '"What is the status of flight UA406?" -> SELECT * FROM flights WHERE flight_number LIKE \'%UA406%\';',
                        '"Status of flight 406" -> SELECT * FROM flights WHERE flight_number LIKE \'%406%\';',
                        '"What pushback tractor is assigned to flight UA2406?" -> SELECT * FROM equipment WHERE assigned_flight = \'UA2406\' AND equipment_type = \'Pushback Tractor\';',
                        '"Who is the cleaning lead on flight UA2406 and what is their phone number?" -> SELECT e.first_name, e.last_name, e.phone_number FROM employees e JOIN assignments a ON e.employee_id = a.employee_id WHERE a.flight_number = \'UA2406\' AND a.assignment_type = \'Cleaning\' AND e.role = \'Cleaning Lead\';',
                        '"Who was the cleaning lead on flight UA2406 and what is their phone number?" -> SELECT e.first_name, e.last_name, e.phone_number FROM employees e JOIN assignments a ON e.employee_id = a.employee_id WHERE a.flight_number = \'UA2406\' AND a.assignment_type = \'Cleaning\' AND e.role = \'Cleaning Lead\';',
                        '"Who is the lead cleaning for flight UA1234?" -> SELECT e.first_name, e.last_name FROM employees e JOIN assignments a ON e.employee_id = a.employee_id WHERE a.flight_number = \'UA1234\' AND a.assignment_type = \'Cleaning\' AND e.role = \'Cleaning Lead\';',
                        '"Who is the cleaning lead and what is their phone number?" -> SELECT first_name, last_name, phone_number FROM employees WHERE role = \'Cleaning Lead\';',
                        '"When does Maria Rodriguez shift end?" -> SELECT shift_end FROM employees WHERE first_name = \'Maria\' AND last_name = \'Rodriguez\';',
                        '"What is the nearest pushback tractor to gate A8?" -> SELECT * FROM equipment WHERE equipment_type = \'Pushback Tractor\' AND status = \'Available\' ORDER BY current_location;',
                        '"Find available pushback tractors near gate A12" -> SELECT * FROM equipment WHERE equipment_type = \'Pushback Tractor\' AND status = \'Available\';',
                        '"Which pushback tractors are not assigned?" -> SELECT * FROM equipment WHERE equipment_type = \'Pushback Tractor\' AND assigned_flight IS NULL;',
                        '"What equipment is assigned to UA2406?" -> SELECT * FROM equipment WHERE assigned_flight = \'UA2406\';',
                        '"What ramp team members are on break now?" -> SELECT * FROM employees WHERE department = \'Ramp\' AND status = \'Break\';',
                        '"What is John Smith next flight assignment?" -> SELECT a.flight_number, a.assignment_type, a.start_time, a.end_time, a.status, f.departure_gate FROM assignments a JOIN flights f ON a.flight_number = f.flight_number JOIN employees e ON a.employee_id = e.employee_id WHERE e.first_name = \'John\' AND e.last_name = \'Smith\' AND a.status = \'Scheduled\' ORDER BY a.start_time LIMIT 1;',
                        '"What is John Smith assignment?" -> SELECT a.flight_number, a.assignment_type, a.start_time, a.end_time, a.status FROM assignments a JOIN employees e ON a.employee_id = e.employee_id WHERE e.first_name = \'John\' AND e.last_name = \'Smith\';',
                        
                        # ADDITIONAL COMMON PATTERNS
                        '"What flights are delayed?" -> SELECT * FROM flights WHERE status LIKE \'%delay%\';',
                        '"What flights are on time now?" -> SELECT * FROM flights WHERE status LIKE \'%time%\';',
                        '"Show me all United Airlines flights" -> SELECT * FROM flights WHERE airline = \'United Airlines\';',
                        '"What equipment is available?" -> SELECT * FROM equipment WHERE status = \'available\';',
                        '"Who is working in baggage handling?" -> SELECT * FROM employees WHERE department = \'baggage\';'
                    ]
                },
                'es': {
                    'instruction': "Eres un asistente de IA que convierte consultas en lenguaje natural sobre operaciones aeroportuarias en consultas SQLite.",
                    'examples': [
                        '"¿Cuál es el estado del vuelo UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
                        '"¿Qué miembros del equipo de rampa están en descanso?" -> SELECT * FROM employees WHERE status = \'on_break\' AND department = \'ramp\';',
                        '"¿Qué vuelos están retrasados hoy?" -> SELECT * FROM flights WHERE status LIKE \'%delay%\' AND date(scheduled_departure) = date(\'now\');'
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
            
            IMPORTANT: Generate SQLite-compatible SQL queries only. Available tables and key columns:
            - flights: flight_number, airline, status, departure_gate, arrival_gate, scheduled_departure, actual_departure, aircraft_type
            - employees: employee_id, first_name, last_name, department, role, status, current_location, phone_number
            - equipment: equipment_id, equipment_type, current_location, status, assigned_flight, operator_id
            - gates: gate_number, terminal, status, current_flight
            - assignments: flight_number, employee_id, equipment_id, assignment_type, status
            
            Use simple SQLite syntax:
            - Use LIKE for status queries (case insensitive): status LIKE '%delay%', status LIKE '%board%'
            - For flight numbers: Try exact match first, then LIKE pattern if needed
              * Exact: flight_number = 'UA2406'
              * Pattern: flight_number LIKE '%UA406%' (for partial matches from speech recognition)
              * Always prefer exact matches when the full flight number is clear
            - Use || for concatenation: first_name || ' ' || last_name
            - Always use LIKE when searching for status, department, or descriptive fields
            - For operational questions about "today", "now", or "current", focus on STATUS rather than dates
            - When users ask about delayed/on-time flights "today", they want current operational status regardless of schedule date
            - Avoid date filters unless specifically asking for flights on a particular date
            
            FLIGHT NUMBER MATCHING STRATEGY:
            - If user says "UA406" but no exact match exists, try "flight_number LIKE '%UA406%'"
            - If user says partial number like "406", try "flight_number LIKE '%406%'"
            - This handles speech recognition errors where "UA2406" becomes "UA406"
            
            Database Schema:
            {schema_text}
            {context_prompt}
            User Query: "{user_query}"
            
            Convert this to a SQLite-compatible SQL query. Only return the SQL query, nothing else.
            If the query cannot be answered with the available data, return "NO_DATA".
            
            Examples:
            - {examples_text}
            
            SQL Query:"""
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=200,
                temperature=0.1
            )
            
            sql_query = response.choices[0].message.content.strip()
            
            # Clean up markdown formatting that GPT-3.5-turbo might add
            if sql_query.startswith('```sql'):
                sql_query = sql_query.replace('```sql', '').replace('```', '').strip()
            elif sql_query.startswith('```'):
                sql_query = sql_query.replace('```', '').strip()
            
            # 🔍 DEBUGGING: Log the generated SQL query
            logger.info(f"📝 GENERATED SQL QUERY: {sql_query}")
            
            # ✅ FALLBACK HANDLING: Check for complex queries that might fail
            if sql_query == "NO_DATA" or not sql_query:
                logger.warning(f"🚫 SQL generation failed for query: {user_query}")
                return None
                
            # ⚠️ VALIDATION: Check for potentially problematic queries
            if "JOIN" in sql_query.upper() and "assignments" in sql_query.lower():
                logger.info(f"⚠️ Complex JOIN detected - this might fail due to database structure")
            
            return sql_query
            
        except Exception as e:
            logger.error(f"Query parsing error: {e}")
            return None
    
    def format_response(self, data, original_query, language='en'):
        """Format database results into natural language response"""
        if not data:
            # ✅ SMART FALLBACK: Provide context-aware "I don't know" responses
            if "nearest" in original_query.lower():
                no_data_responses = {
                    'en': "I don't know the exact location details. The database may not have complete proximity information for that equipment.",
                    'es': "No conozco los detalles exactos de ubicación. Es posible que la base de datos no tenga información completa de proximidad para ese equipo.",
                    'fr': "Je ne connais pas les détails exacts de l'emplacement. La base de données peut ne pas avoir d'informations de proximité complètes pour cet équipement."
                }
            elif "assignment" in original_query.lower() or "next" in original_query.lower():
                no_data_responses = {
                    'en': "I don't know - I couldn't find current assignment information for that person.",
                    'es': "No lo sé - no pude encontrar información de asignación actual para esa persona.",
                    'fr': "Je ne sais pas - je n'ai pas pu trouver d'informations d'affectation actuelles pour cette personne."
                }
            else:
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
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300,
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
    
    def preprocess_speech_query(self, user_query):
        """Clean up common speech recognition errors in queries"""
        # Remove wake words at the beginning
        wake_word_patterns = ['jarvis', 'hey jarvis', 'jaime', 'hola jaime', 'oye jaime', 'jacques', 'salut jacques', 'hey jacques']
        query_lower = user_query.lower().strip()
        
        for wake_word in wake_word_patterns:
            if query_lower.startswith(wake_word):
                user_query = user_query[len(wake_word):].strip()
                break
        
        # Fix common flight number speech recognition errors
        # "UA to 406" -> "UA406", "United to 406" -> "UA406"
        # "you 82406" -> "UA2406", "a 2406" -> "UA2406"
        flight_patterns = [
            (r'\b(UA|United|united)\s+to\s+(\d+)', r'UA\2'),  # "UA to 406" -> "UA406"
            (r'\b(UA|United|united)\s+(\d+)', r'UA\2'),       # "UA 406" -> "UA406"
            (r'\bflight\s+(UA|United|united)\s+to\s+(\d+)', r'flight UA\2'),  # "flight UA to 406" -> "flight UA406"
            (r'\bflight\s+(UA|United|united)\s+(\d+)', r'flight UA\2'),       # "flight UA 406" -> "flight UA406"
            # Common mishearing patterns
            (r'\byou\s+(\d{2,5})', r'UA\1'),              # "you 82406" -> "UA82406", "you 2406" -> "UA2406"
            (r'\ba\s+(\d{4,5})', r'UA\1'),                # "a 2406" -> "UA2406"
            (r'\bflight\s+you\s+(\d{2,5})', r'flight UA\1'),  # "flight you 82406" -> "flight UA82406"
            (r'\bflight\s+a\s+(\d{4,5})', r'flight UA\1'),    # "flight a 2406" -> "flight UA2406"
            (r'\b8(\d{4})', r'UA\1'),                     # "82406" -> "UA2406" (common 8/UA confusion)
            # Standalone 4-digit flight numbers
            (r'\bflight\s+(\d{4})\b', r'flight UA\1'),    # "flight 1212" -> "flight UA1212"
            (r'\b(\d{4})\b(?=\s|$)', r'UA\1'),           # "1212" -> "UA1212" (standalone 4-digit numbers)
        ]
        
        # Apply flight number fixes
        original_query = user_query
        for pattern, replacement in flight_patterns:
            user_query = re.sub(pattern, replacement, user_query, flags=re.IGNORECASE)
        
        # Log preprocessing changes if flight numbers were modified
        if original_query != user_query:
            logging.info(f"🔧 FLIGHT NUMBER CORRECTION: '{original_query}' → '{user_query}'")
        
        # Common word corrections for airport operations
        corrections = [
            ('pushback tractor', 'pushback tractor'),
            ('cleaning lead', 'cleaning lead'),
            ('what is', 'what is'),
            ('when does', 'when does'),
            ('who is', 'who is'),
            ('where is', 'where is'),
        ]
        
        # Apply corrections (case insensitive)
        for wrong, correct in corrections:
            user_query = re.sub(re.escape(wrong), correct, user_query, flags=re.IGNORECASE)
            
        # Log the preprocessing for debugging
        logger.info(f"🔧 PREPROCESSED QUERY: '{user_query.strip()}'")
        
        return user_query.strip()
    
    def is_complex_query(self, user_query):
        """Detect if this is a complex multi-step query that requires advanced reasoning"""
        complex_indicators = [
            # Scenario-based queries
            'broke down', 'broken', 'failed', 'out of service', 'unavailable',
            'next closest', 'nearest available', 'alternative', 'backup',
            'if', 'what if', 'suppose', 'assuming',
            # Multi-step reasoning
            'then what', 'what happens', 'where else', 'what other',
            'reassign', 'reallocate', 'move to', 'switch to',
            # Proximity/location reasoning  
            'closest', 'nearest', 'next available', 'furthest',
            'best option', 'optimal', 'recommend'
        ]
        
        query_lower = user_query.lower()
        return any(indicator in query_lower for indicator in complex_indicators)
    
    def process_complex_query(self, user_query, schema, language='en'):
        """Handle complex multi-step queries requiring advanced reasoning"""
        try:
            schema_text = "\n".join([f"Table: {table}, Columns: {', '.join(columns)}" 
                                   for table, columns in schema.items()])
            
            prompt = f"""
            You are an advanced airport operations AI that can handle complex, multi-step queries.
            
            TASK: Analyze this complex query and break it down into logical steps, then provide a comprehensive response.
            
                         Available Database Schema:
             {schema_text}
             
             IMPORTANT SCHEMA NOTES:
             - Equipment assignments are tracked via 'assigned_flight' column in equipment table
             - No separate assignments table exists
             - Use equipment.assigned_flight to find what's assigned to which flight
             - Use equipment.status for availability ('Available', 'Assigned', 'Maintenance', etc.)
             - Use equipment.current_location for proximity calculations
            
            COMPLEX QUERY HANDLING INSTRUCTIONS:
            1. Break down the query into logical steps
            2. Identify what information needs to be gathered
            3. Determine the sequence of operations
            4. Consider operational constraints and proximity
            5. Provide actionable recommendations
            
                         EXAMPLE COMPLEX SCENARIOS:
             
             "Pushback tractor broke down for UA2406, where is the next closest one?"
             Analysis:
             1. Find current pushback tractor for UA2406: SELECT * FROM equipment WHERE assigned_flight = 'UA2406' AND equipment_type = 'Pushback Tractor';
             2. Find all available pushback tractors: SELECT * FROM equipment WHERE equipment_type = 'Pushback Tractor' AND status = 'Available';
             3. Get UA2406's gate: SELECT departure_gate FROM flights WHERE flight_number = 'UA2406';
             4. Recommend the closest available option based on gate proximity
             5. Consider operational impact and reassignment
            
            "If gate A12 becomes unavailable, what's the best alternative for UA2406?"
            Analysis:
            1. Find UA2406's current gate (A12)
            2. Find available gates 
            3. Consider aircraft type compatibility
            4. Assess proximity to minimize passenger disruption
            5. Check equipment reassignment needs
            
            OPERATIONAL KNOWLEDGE:
            - Gates in same terminal are closer than different terminals
            - Equipment proximity matters for operational efficiency
            - Aircraft type affects gate compatibility
            - Available status means ready for immediate use
            - Consider crew schedules and passenger impact
            
            Current Query: "{user_query}"
            
            Provide a detailed analysis following this format:
            1. SITUATION ANALYSIS: What's happening?
            2. INFORMATION NEEDED: What data to gather?
            3. STEP-BY-STEP PROCESS: How to solve it?
            4. RECOMMENDATIONS: What actions to take?
            5. SQL QUERIES: What queries to run? (provide multiple if needed)
            
            Focus on practical, actionable airport operations advice.
            """
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
                temperature=0.2
            )
            
            analysis = response.choices[0].message.content.strip()
            
            # Extract SQL queries from the analysis
            sql_queries = []
            lines = analysis.split('\n')
            in_sql_section = False
            
            for line in lines:
                if 'SQL QUERIES:' in line.upper() or 'SQL QUERY:' in line.upper():
                    in_sql_section = True
                    continue
                    
                if in_sql_section and 'SELECT' in line.upper():
                    # Extract the SQL query
                    sql_start = line.upper().find('SELECT')
                    if sql_start != -1:
                        sql_query = line[sql_start:].strip()
                        # Clean up common formatting
                        sql_query = sql_query.replace('```sql', '').replace('```', '').strip()
                        if sql_query.endswith('.'):
                            sql_query = sql_query[:-1]
                        sql_queries.append(sql_query)
            
            # Execute the queries and gather results
            all_results = []
            for sql_query in sql_queries[:3]:  # Limit to 3 queries for performance
                try:
                    logger.info(f"🔍 COMPLEX QUERY SQL: {sql_query}")
                    results = self.execute_query(sql_query)
                    if results:
                        all_results.extend(results)
                        logger.info(f"📊 COMPLEX QUERY RESULTS: Found {len(results)} rows")
                except Exception as e:
                    logger.error(f"Complex query SQL error: {e}")
                    continue
            
            # Combine analysis with data
            if all_results:
                # Format the final response
                final_response = self.format_complex_response(analysis, all_results, user_query, language)
                return {
                    "response": final_response,
                    "confidence": 0.85,
                    "analysis": analysis,
                    "data_points": len(all_results),
                    "query_type": "complex"
                }
            else:
                # Even without specific data, provide a formatted response
                formatted_response = self.format_complex_response(analysis, [], user_query, language)
                return {
                    "response": formatted_response,
                    "confidence": 0.65,
                    "analysis": analysis,
                    "data_points": 0,
                    "query_type": "complex"
                }
                
        except Exception as e:
            logger.error(f"Complex query processing error: {e}")
            return None
    
    def format_complex_response(self, analysis, data_results, original_query, language='en'):
        """Format a comprehensive response for complex queries"""
        try:
            # Summarize the data for context
            data_summary = []
            if data_results:
                # Group data by type
                flights = [r for r in data_results if 'flight_number' in r]
                equipment = [r for r in data_results if 'equipment_type' in r]
                gates = [r for r in data_results if 'gate_number' in r]
                
                if flights:
                    data_summary.append(f"Flights found: {len(flights)}")
                if equipment:
                    available_equipment = [e for e in equipment if e.get('status', '').lower() in ['available', 'ready']]
                    data_summary.append(f"Equipment available: {len(available_equipment)}/{len(equipment)}")
                if gates:
                    data_summary.append(f"Gates analyzed: {len(gates)}")
            
            # Create a focused response prompt
            prompt = f"""
            Based on this complex airport operations analysis and real data, provide a clear, actionable response.
            
            Original Question: "{original_query}"
            
            Analysis Performed:
            {analysis}
            
            Real Data Summary: {'; '.join(data_summary) if data_summary else 'No specific data retrieved'}
            
            Data Details: {str(data_results[:5]) if data_results else 'No data available'}
            
            Provide a concise, practical response that:
            1. Directly answers the original question
            2. Gives specific recommendations based on the data
            3. Mentions any important operational considerations
            4. Uses clear, professional language suitable for airport operations
            
            Keep the response focused and actionable - airport operations staff need quick, clear guidance.
            """
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=400,
                temperature=0.3
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            logger.error(f"Complex response formatting error: {e}")
            return "I've analyzed your complex query but had trouble formatting the final response. Please try rephrasing your question."

    def process_query(self, user_query, language=None, session_id=None, context_data=None):
        """Main processing pipeline with conversation context support"""
        start_time = time.time()
        
        # Preprocess speech recognition errors
        user_query = self.preprocess_speech_query(user_query)
        
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
        
        # Check if this is a complex query requiring multi-step reasoning
        if self.is_complex_query(user_query):
            logger.info(f"🧠 COMPLEX QUERY DETECTED: {user_query}")
            complex_result = self.process_complex_query(user_query, schema, language)
            
            if complex_result:
                complex_result["latency"] = time.time() - start_time
                complex_result["language"] = language
                return complex_result
            else:
                # Fall back to simple processing if complex processing fails
                logger.warning("Complex query processing failed, falling back to simple processing")
        
        # Convert to SQL with context (simple processing)
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
            "language": language,
            "query_type": "simple"
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
    return render_template('index.html', timestamp=int(time.time() * 1000))

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
        - "assigned" misheard as "a sign to" or "assigned to fly to"
        - "pushback tractor" misheard as "pushback transfer" or "push back track door"
        - Aviation terminology and equipment names
        - Fragmented numbers or letters
        
        Please correct any obvious transcription errors and return the improved version.
        Focus on:
        1. Fixing fragmented flight numbers (U A 2406 → UA2406)
        2. Correcting "a sign to" → "assigned to"
        3. Correcting "pushback transfer" → "pushback tractor"
        4. Correcting "what's" → "what" for questions
        5. Maintaining the original meaning and structure
        
        Return only the corrected transcript, no explanations.
        """
        
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
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
    app.run(debug=False, host='localhost', port=3000) 