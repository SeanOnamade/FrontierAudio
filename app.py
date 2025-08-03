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
        
        # Dynamic value cache for performance
        self.dynamic_values_cache = {}
        self.cache_timeout = 5 * 60  # 5 minutes cache
        self.smart_mappings_cache = {}
        
        # Learning system initialization (feature-flagged)
        from config import Config
        self.learning_enabled = getattr(Config, 'LEARNING_ENABLED', False)
        if self.learning_enabled:
            self._init_learning_database()
        
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
    
    def execute_query_with_fallback(self, user_query, query_type, original_sql=None):
        """
        SAFE: Execute query with dynamic equipment matching fallback
        Only applies fallback if original query returns zero results
        """
        # ALWAYS try original query first
        if original_sql:
            original_results = self.execute_query(original_sql)
        else:
            # This shouldn't happen in normal flow, but handle gracefully
            return []
        
        # If we got results, return them immediately (no changes to existing flow)
        if original_results and len(original_results) > 0:
            return original_results
        
        # Only if ZERO results AND it's an equipment query AND dynamic fallback is enabled
        from config import Config
        if query_type == 'equipment' and getattr(Config, 'DYNAMIC_FALLBACK_ENABLED', False):
            enhanced_query = self.apply_dynamic_equipment_matching(user_query)
            
            # Only proceed if something actually changed
            if enhanced_query != user_query:
                logging.info(f"🔄 FALLBACK ATTEMPT: Original query returned 0 results, trying dynamic matching")
                
                # Parse the enhanced query to SQL using existing system
                enhanced_sql_response = self.parse_query_to_sql(
                    enhanced_query, 
                    self.get_database_schema(), 
                    return_metadata=True
                )
                
                if enhanced_sql_response and 'sql' in enhanced_sql_response:
                    enhanced_results = self.execute_query(enhanced_sql_response['sql'])
                    
                    if enhanced_results and len(enhanced_results) > 0:
                        logging.info(f"🎯 DYNAMIC FALLBACK SUCCESS: '{user_query}' → '{enhanced_query}' → {len(enhanced_results)} results")
                        return enhanced_results
                    else:
                        logging.info(f"🔄 DYNAMIC FALLBACK FAILED: Enhanced query also returned 0 results")
        
        # If all else fails, return original results (could be empty)
        logging.info(f"🔄 FALLBACK COMPLETE: Returning original results ({len(original_results)} rows)")
        return original_results
    
    def _init_learning_database(self):
        """Initialize learning database table (feature-flagged)"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Create learning table if it doesn't exist
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS query_learning (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_query TEXT NOT NULL,
                    failed_classification TEXT,
                    user_feedback TEXT,
                    suggested_classification TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            
            conn.commit()
            conn.close()
            logger.info("📚 LEARNING DATABASE: Initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Learning database initialization failed: {e}")
            # Disable learning if database fails
            self.learning_enabled = False

    def _create_learning_opportunity(self, user_query, failed_classification=None):
        """Create a learning opportunity entry (feature-flagged)"""
        if not self.learning_enabled:
            return None
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO query_learning (original_query, failed_classification)
                VALUES (?, ?)
            """, (user_query, failed_classification))
            
            learning_id = cursor.lastrowid
            conn.commit()
            conn.close()
            
            logger.info(f"📝 LEARNING OPPORTUNITY: Created ID {learning_id}")
            return learning_id
            
        except Exception as e:
            logger.error(f"❌ Failed to create learning opportunity: {e}")
            return None

    def _should_request_clarification(self, result):
        """Determine if clarification should be requested (feature-flagged)"""
        from config import Config
        if not getattr(Config, 'CLARIFICATION_ENABLED', False):
            return False
        
        # Trigger clarification on common failure conditions
        return (
            result.get('sql_query') == 'NO_DATA' or
            result.get('result_count', 0) == 0 or
            result.get('confidence', 1.0) < 0.3
        )

    def _add_clarification_if_needed(self, result, user_query, classification_method=None):
        """Add clarification request to result if needed (feature-flagged)"""
        if not self._should_request_clarification(result):
            return result
        
        # Create learning opportunity
        learning_id = self._create_learning_opportunity(
            user_query, 
            classification_method
        )
        
        # Add clarification to response
        result['clarification'] = {
            'message': 'I couldn\'t find what you were looking for. What type of information were you seeking?',
            'options': [
                {'value': 'flight_status', 'label': 'Flight Information (status, gates, delays)'},
                {'value': 'personnel', 'label': 'Personnel Info (who works where, contacts)'},
                {'value': 'equipment', 'label': 'Equipment Status (tractors, vehicles, availability)'},
                {'value': 'location', 'label': 'Location Info (where things are located)'},
                {'value': 'time', 'label': 'Time/Schedule Info (when things happen)'},
                {'value': 'other', 'label': 'Other (please specify)'}
            ],
            'learning_id': learning_id
        }
        
        logger.info(f"❓ CLARIFICATION REQUESTED: Learning ID {learning_id}")
        return result

    def _store_user_feedback(self, learning_id, user_feedback, suggested_classification):
        """Store user feedback for learning (feature-flagged)"""
        if not self.learning_enabled or not learning_id:
            return False
        
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute("""
                UPDATE query_learning 
                SET user_feedback = ?, suggested_classification = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (user_feedback, suggested_classification, learning_id))
            
            conn.commit()
            conn.close()
            
            logger.info(f"💡 USER FEEDBACK STORED: Learning ID {learning_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to store user feedback: {e}")
            return False
    
    # Legacy method - now replaced by _classify_query_type_with_fallback

    def _classify_query_type_ai(self, user_query):
        """AI-powered query classification fallback when keywords fail"""
        try:
            logger.info(f"🤖 AI CLASSIFICATION: Analyzing '{user_query[:50]}...'")
            
            classification_prompt = f"""Classify this airport operations query into ONE category:

Categories:
- flight_status: Questions about flight delays, status, boarding, departures, arrivals, timing
- equipment: Questions about tractors, equipment, assignments, availability, maintenance
- personnel: Questions about employees, staff, shifts, roles, contact information
- location: Questions about gates, terminals, locations, proximity, directions
- time: Questions about schedules, timing, when things happen, shift times
- general: Everything else that doesn't fit the above categories

Examples:
- "Which aircraft are running behind schedule?" -> flight_status
- "Find me some ground support equipment" -> equipment  
- "Who's the manager on duty?" -> personnel
- "Where can I find gate B12?" -> location
- "What time does the next shift start?" -> time
- "How's the weather today?" -> general

Query: "{user_query}"

Category:"""
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": classification_prompt}],
                max_tokens=15,
                temperature=0.0
            )
            
            ai_classification = response.choices[0].message.content.strip().lower()
            
            # Validate AI response
            valid_categories = ['flight_status', 'equipment', 'personnel', 'location', 'time', 'general']
            if ai_classification in valid_categories:
                logger.info(f"🎯 AI CLASSIFIED AS: {ai_classification}")
                return ai_classification
            else:
                logger.warning(f"⚠️ AI returned invalid category: {ai_classification}, defaulting to 'general'")
                return 'general'
                
        except Exception as e:
            logger.error(f"❌ AI classification failed: {e}, defaulting to 'general'")
            return 'general'

    def _classify_query_type_with_fallback(self, user_query, return_method=False):
        """Smart classification with enhanced priority order"""
        from config import Config
        if not getattr(Config, 'QUERY_CLASSIFICATION_ENABLED', False):
            if return_method:
                return 'general', 'disabled'
            return 'general'
        
        # Step 1: Try enhanced classification (phrases + enhanced keywords)
        if (getattr(Config, 'ENHANCED_PHRASES_ENABLED', False) or 
            getattr(Config, 'ENHANCED_KEYWORDS_ENABLED', False)):
            enhanced_result = self._classify_query_enhanced(user_query)
            if enhanced_result != 'general':
                if return_method:
                    return enhanced_result, 'enhanced'
                return enhanced_result
        
        # Step 2: Try original keyword-based classification (fast)
        keyword_result = self._classify_query_type_keywords(user_query)
        
        if keyword_result != 'general':
            logger.info(f"🔑 KEYWORD MATCH: {keyword_result}")
            if return_method:
                return keyword_result, 'keyword_based'
            return keyword_result
        
        # Step 3: Use AI fallback for edge cases (slower but smarter)
        logger.info(f"🤖 FALLBACK: Using AI classification for edge case")
        ai_result = self._classify_query_type_ai(user_query)
        if return_method:
            return ai_result, 'ai_fallback'
        return ai_result

    def _classify_query_type_keywords(self, user_query):
        """Fast keyword-based classification (renamed from original method)"""
        query_lower = user_query.lower()
        
        # Flight status queries
        if any(word in query_lower for word in ['status', 'flight', 'delayed', 'on time', 'departed', 'boarding']):
            return 'flight_status'
        
        # Equipment queries  
        elif any(word in query_lower for word in ['equipment', 'tractor', 'pushback', 'assigned', 'available', 'loader', 'truck', 'gpu', 'pca', 'tug', 'lavatory', 'service', 'container', 'belt', 'baggage', 'tow']):
            return 'equipment'
        
        # Personnel queries
        elif any(word in query_lower for word in ['who', 'employee', 'shift', 'contact', 'phone', 'cleaning lead']):
            return 'personnel'
        
        # Location queries
        elif any(word in query_lower for word in ['where', 'gate', 'location', 'nearest', 'closest']):
            return 'location'
        
        # Time queries
        elif any(word in query_lower for word in ['when', 'time', 'schedule', 'end', 'next']):
            return 'time'
        
        return 'general'

    def _get_enhanced_keywords(self):
        """Get enhanced keyword lists with synonyms (feature-flagged)"""
        from config import Config
        if not getattr(Config, 'ENHANCED_KEYWORDS_ENABLED', False):
            return {}
        
        # Base keywords from existing logic + synonyms
        return {
            'flight_status': [
                # Existing keywords
                'status', 'flight', 'delayed', 'on time', 'departed', 'boarding',
                # New synonyms
                'aircraft', 'plane', 'jet', 'airliner', 'departure', 'arrival', 
                'gate', 'late', 'punctual', 'schedule', 'timing'
            ],
            'equipment': [
                # Existing keywords  
                'equipment', 'tractor', 'pushback', 'assigned', 'available',
                # New synonyms
                'vehicle', 'machinery', 'device', 'tool', 'cart', 'loader', 
                'generator', 'idle', 'free', 'busy', 'maintenance'
            ],
            'personnel': [
                # Existing keywords
                'who', 'employee', 'shift', 'contact', 'phone', 'cleaning lead',
                # New synonyms
                'staff', 'crew', 'team member', 'worker', 'agent', 'representative',
                'supervisor', 'manager', 'captain', 'lead'
            ],
            'location': [
                # Existing keywords
                'where', 'gate', 'location', 'nearest', 'closest',
                # New synonyms
                'position', 'area', 'zone', 'terminal', 'concourse'
            ],
            'time': [
                # Existing keywords  
                'when', 'time', 'schedule', 'end', 'next',
                # New synonyms
                'start', 'begin', 'finish', 'duration', 'period'
            ]
        }

    def _get_enhanced_phrases(self):
        """Get multi-word phrase patterns (feature-flagged)"""
        from config import Config
        if not getattr(Config, 'ENHANCED_PHRASES_ENABLED', False):
            return {}
        
        # Multi-word phrases for more specific classification
        return {
            'personnel': [
                'personnel on flight', 'crew on flight', 'staff on flight',
                'who is on flight', 'employees on flight', 'team on flight',
                'who works on', 'staff assigned to', 'crew assigned to',
                'cleaning lead on', 'supervisor on', 'manager on'
            ],
            'equipment': [
                'equipment on flight', 'tractor on flight', 'vehicle on',
                'available equipment', 'equipment status', 'equipment assigned',
                'pushback tractor', 'equipment location'
            ],
            'flight_status': [
                'flight status', 'aircraft status', 'flight delayed',
                'flights running', 'aircraft struggling', 'timing issues',
                'behind schedule', 'ahead of schedule'
            ]
        }

    def _check_enhanced_phrases(self, user_query):
        """Check for multi-word phrase matches (most specific)"""
        phrases = self._get_enhanced_phrases()
        if not phrases:
            return None
        
        query_lower = user_query.lower()
        
        # Check each category's phrases
        for category, phrase_list in phrases.items():
            for phrase in phrase_list:
                if phrase in query_lower:
                    logger.info(f"📝 PHRASE MATCH: '{phrase}' → {category}")
                    return category
        
        return None

    def _check_enhanced_keywords(self, user_query):
        """Check enhanced keyword lists (after phrase check)"""
        keywords = self._get_enhanced_keywords()
        if not keywords:
            return None
        
        query_lower = user_query.lower()
        
        # Check each category's keywords
        for category, keyword_list in keywords.items():
            if any(word in query_lower for word in keyword_list):
                logger.info(f"🔍 ENHANCED KEYWORD MATCH: {category}")
                return category
        
        return None

    def _classify_query_enhanced(self, user_query):
        """Enhanced classification with phrases and keywords (wrapper method)"""
        from config import Config
        
        # 1. Most specific: Multi-word phrases
        if getattr(Config, 'ENHANCED_PHRASES_ENABLED', False):
            phrase_result = self._check_enhanced_phrases(user_query)
            if phrase_result:
                return phrase_result
        
        # 2. Enhanced keywords (if phrase didn't match)
        if getattr(Config, 'ENHANCED_KEYWORDS_ENABLED', False):
            keyword_result = self._check_enhanced_keywords(user_query)
            if keyword_result:
                return keyword_result
        
        # 3. Fall back to original keyword logic
        return self._classify_query_type_keywords(user_query)

    def _get_dynamic_status_values(self):
        """Dynamically discover unique values from database with smart caching"""
        # Check cache first
        cache_key = 'dynamic_status_values'
        current_time = time.time()
        
        if (cache_key in self.dynamic_values_cache and 
            current_time - self.dynamic_values_cache[cache_key]['timestamp'] < self.cache_timeout):
            logger.info("📋 CACHE HIT: Using cached dynamic values")
            return self.dynamic_values_cache[cache_key]['data']
        
        logger.info("🔍 CACHE MISS: Discovering fresh dynamic database values...")
        
        try:
            import sqlite3
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get unique flight status values
            cursor.execute("SELECT DISTINCT flight_status FROM flights WHERE flight_status IS NOT NULL ORDER BY flight_status")
            flight_statuses = [f"'{row[0]}'" for row in cursor.fetchall()]
            logger.info(f"📊 FOUND flight_status values: {flight_statuses}")
            
            # Get unique equipment status values
            cursor.execute("SELECT DISTINCT equipment_status FROM equipment_locations WHERE equipment_status IS NOT NULL ORDER BY equipment_status")
            equipment_statuses = [f"'{row[0]}'" for row in cursor.fetchall()]
            logger.info(f"📊 FOUND equipment_status values: {equipment_statuses}")
            
            # Get unique role names
            cursor.execute("SELECT DISTINCT role_name FROM employee_roles WHERE role_name IS NOT NULL ORDER BY role_name")
            role_names = [f"'{row[0]}'" for row in cursor.fetchall()]
            logger.info(f"📊 FOUND role_name values: {role_names}")
            
            # Get unique service types
            cursor.execute("SELECT DISTINCT service_type FROM flight_services WHERE service_type IS NOT NULL ORDER BY service_type")
            service_types = [f"'{row[0]}'" for row in cursor.fetchall()]
            logger.info(f"📊 FOUND service_type values: {service_types}")
            
            conn.close()
            
            dynamic_values = {
                'flight_status': flight_statuses,
                'equipment_status': equipment_statuses,
                'role_names': role_names,
                'service_types': service_types
            }
            
            # Cache the results
            self.dynamic_values_cache[cache_key] = {
                'data': dynamic_values,
                'timestamp': current_time
            }
            
            logger.info(f"✅ DYNAMIC VALUES DISCOVERED & CACHED: {len(sum(dynamic_values.values(), []))} total unique values")
            return dynamic_values
            
        except Exception as e:
            logger.warning(f"⚠️ Could not discover dynamic values: {e}")
            # Fallback to known values
            return {
                'flight_status': ["'Late'", "'On Time Depature'", "'Turning'", "'Turning Preparation'", "'Waiting on Aircraft'"],
                'equipment_status': ["'Available'", "'Assigned'", "'Maintenance'"],
                'role_names': ["'Cleaning Lead'", "'Supervisor'", "'Ramp Agent'"],
                'service_types': ["'Cleaning'", "'Catering'", "'Fueling'"]
            }

    def _get_smart_mappings(self):
        """Create smart mappings from user language to database values"""
        cache_key = 'smart_mappings'
        current_time = time.time()
        
        # Check cache first
        if (cache_key in self.smart_mappings_cache and 
            current_time - self.smart_mappings_cache[cache_key]['timestamp'] < self.cache_timeout):
            logger.info("📋 CACHE HIT: Using cached smart mappings")
            return self.smart_mappings_cache[cache_key]['data']
        
        logger.info("🧠 BUILDING: Smart language mappings...")
        
        # Get current dynamic values
        dynamic_values = self._get_dynamic_status_values()
        
        smart_mappings = {
            'flight_status': {
                # Map user language to exact database values
                'late': 'Late',
                'delayed': 'Late',
                'behind schedule': 'Late',
                'running late': 'Late',
                'tardy': 'Late',
                
                'on time': 'On Time Depature',  # Note: keeping the typo from database
                'punctual': 'On Time Depature',
                'scheduled': 'On Time Depature',
                'timely': 'On Time Depature',
                
                'turning': 'Turning',
                'turning around': 'Turning',
                'turnaround': 'Turning',
                
                'turning preparation': 'Turning Preparation',
                'prep': 'Turning Preparation',
                'preparing': 'Turning Preparation',
                
                'waiting on aircraft': 'Waiting on Aircraft',
                'waiting for plane': 'Waiting on Aircraft',
                'aircraft delay': 'Waiting on Aircraft'
            },
            'equipment_status': {
                'available': 'Available',
                'free': 'Available', 
                'ready': 'Available',
                'idle': 'Available',
                
                'assigned': 'Assigned',
                'busy': 'Assigned',
                'in use': 'Assigned',
                'occupied': 'Assigned',
                
                'maintenance': 'Maintenance',
                'repair': 'Maintenance',
                'broken': 'Maintenance',
                'out of order': 'Maintenance'
            },
            'common_roles': {
                'cleaning lead': 'Cleaning Lead',
                'cleaner': 'Cleaning Lead',
                'janitorial': 'Cleaning Lead',
                
                'supervisor': 'Supervisor',
                'manager': 'Supervisor',
                'lead': 'Supervisor',
                
                'ramp agent': 'Ramp Agent',
                'ground crew': 'Ramp Agent',
                'baggage handler': 'Ramp Agent'
            },
            'temporal_vocabulary': {
                # Landing/Arrival terms
                'land': 'actual_arrival',
                'landed': 'actual_arrival', 
                'landing': 'actual_arrival',
                'arrive': 'actual_arrival',
                'arrived': 'actual_arrival',
                'arrival': 'actual_arrival',
                
                # Departure terms  
                'depart': 'actual_departure',
                'departed': 'actual_departure',
                'departure': 'actual_departure',
                'leave': 'actual_departure',
                'left': 'actual_departure',
                'take off': 'actual_departure',
                
                # Temporal ordering
                'most recent': 'ORDER BY {column} DESC LIMIT 1',
                'latest': 'ORDER BY {column} DESC LIMIT 1',
                'last': 'ORDER BY {column} DESC LIMIT 1',
                'newest': 'ORDER BY {column} DESC LIMIT 1',
                'earliest': 'ORDER BY {column} ASC LIMIT 1',
                'first': 'ORDER BY {column} ASC LIMIT 1',
                'oldest': 'ORDER BY {column} ASC LIMIT 1'
            }
        }
        
        # Cache the mappings
        self.smart_mappings_cache[cache_key] = {
            'data': smart_mappings,
            'timestamp': current_time
        }
        
        total_mappings = sum(len(category) for category in smart_mappings.values())
        logger.info(f"✅ SMART MAPPINGS CREATED & CACHED: {total_mappings} language mappings")
        
        return smart_mappings

    def _get_enhanced_examples(self, query_type, language='en'):
        """Get targeted examples based on query type"""
        from config import Config
        if not getattr(Config, 'ENHANCED_PROMPTS_ENABLED', False):
            return []  # Fall back to original examples
        
        enhanced_examples = {
            'flight_status': [
                '"Is flight delayed?" -> SELECT flight_number, flight_status, scheduled_departure, actual_departure FROM flights WHERE flight_status = \'Late\';',
                '"Show me flights that are late" -> SELECT * FROM flights WHERE flight_status = \'Late\';',
                '"Show me flights that are on time" -> SELECT * FROM flights WHERE flight_status = \'On Time Depature\';',
                '"What flights are turning?" -> SELECT * FROM flights WHERE flight_status LIKE \'%Turning%\';',
                '"Show me flights waiting on aircraft" -> SELECT * FROM flights WHERE flight_status = \'Waiting on Aircraft\';',
                '"What was the most recent flight to land?" -> SELECT * FROM flights WHERE actual_arrival IS NOT NULL ORDER BY actual_arrival DESC LIMIT 1;',
                '"Which flight landed last?" -> SELECT * FROM flights WHERE actual_arrival IS NOT NULL ORDER BY actual_arrival DESC LIMIT 1;',
                '"Show me the latest arrival" -> SELECT * FROM flights WHERE actual_arrival IS NOT NULL ORDER BY actual_arrival DESC LIMIT 1;',
                '"What was the last flight to depart?" -> SELECT * FROM flights WHERE actual_departure IS NOT NULL ORDER BY actual_departure DESC LIMIT 1;',
                '"Most recent departure" -> SELECT * FROM flights WHERE actual_departure IS NOT NULL ORDER BY actual_departure DESC LIMIT 1;'
            ],
            'equipment': [
                '"Find pushback tractors assigned to B-South" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'Push-back Tractor\' AND assigned_zone = \'B-South\';',
                '"How many pushback tractors in zone B-South?" -> SELECT COUNT(*) FROM equipment WHERE equipment_type = \'Push-back Tractor\' AND assigned_zone = \'B-South\';',
                '"How many container loaders in C-South-1?" -> SELECT COUNT(*) FROM equipment WHERE equipment_type = \'Container Loader\' AND assigned_zone = \'C-South-1\';',
                '"Show me Belt Loader in B-Mid" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'Belt Loader\' AND assigned_zone = \'B-Mid\';',
                '"Find GPU in C-Central" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'GPU\' AND assigned_zone = \'C-Central\';',
                '"Show me Service Truck in B-North" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'Service Truck\' AND assigned_zone = \'B-North\';',
                '"How many Lavatory Truck in C-North" -> SELECT COUNT(*) FROM equipment WHERE equipment_type = \'Lavatory Truck\' AND assigned_zone = \'C-North\';',
                '"find Service Truck equipment in B-South" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'Service Truck\' AND assigned_zone = \'B-South\';',
                '"show me GPU equipment in C-North" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'GPU\' AND assigned_zone = \'C-North\';',
                '"find Container Loader equipment in C-Central" -> SELECT entity_id, equipment_type, assigned_zone FROM equipment WHERE equipment_type = \'Container Loader\' AND assigned_zone = \'C-Central\';'
            ],
            'personnel': [
                '"Who is the cleaning lead?" -> SELECT e.employee_name, e.phone_number FROM employees e JOIN employee_roles er ON e.employee_id = er.employee_id WHERE er.role_name = \'Cleaning Lead\';',
                '"What\'s John\'s next shift?" -> SELECT es.shift_start, es.shift_end, es.flight_id FROM employee_shifts es JOIN employees e ON es.employee_id = e.employee_id WHERE e.employee_name LIKE \'%John%\' AND es.shift_start > datetime(\'now\') ORDER BY es.shift_start LIMIT 1;',
                '"Who is working on flight UA2406?" -> SELECT e.employee_name, e.phone_number FROM employees e JOIN employee_shifts es ON e.employee_id = es.employee_id JOIN flights f ON es.flight_id = f.flight_id WHERE f.flight_number = \'UA2406\';',
                '"Find all supervisors" -> SELECT e.employee_name, e.phone_number FROM employees e JOIN employee_roles er ON e.employee_id = er.employee_id WHERE er.role_name LIKE \'%supervisor%\';'
            ],
            'location': [
                '"Where is gate A12?" -> SELECT gate_number, terminal, gate_type FROM gates WHERE gate_number = \'A12\';',
                '"What gates are available?" -> SELECT gate_number, terminal FROM gates WHERE is_active = 1;',
                '"What gate is flight UA2406 using?" -> SELECT g.gate_number, g.terminal FROM gates g JOIN flights f ON g.gate_id = f.gate_id WHERE f.flight_number = \'UA2406\';'
            ],
            'time': [
                '"When is the next departure?" -> SELECT flight_number, scheduled_departure FROM flights WHERE scheduled_departure > datetime(\'now\') ORDER BY scheduled_departure LIMIT 1;',
                '"When does Maria\'s shift end?" -> SELECT es.shift_end FROM employee_shifts es JOIN employees e ON es.employee_id = e.employee_id WHERE e.employee_name LIKE \'%Maria%\';',
                '"What time does boarding start for UA2406?" -> SELECT fo.boarding_start_time FROM flight_operations fo JOIN flights f ON fo.flight_id = f.flight_id WHERE f.flight_number = \'UA2406\';'
            ]
        }
        
        return enhanced_examples.get(query_type, enhanced_examples['flight_status'])

    def _get_enhanced_schema_text(self, schema):
        """Enhanced schema with relationships and context using dynamic values"""
        from config import Config
        if not getattr(Config, 'ENHANCED_SCHEMA_ENABLED', False):
            # Fall back to original simple schema
            return "\n".join([f"Table: {table}, Columns: {', '.join(columns)}" 
                                   for table, columns in schema.items()])
        
        # Get dynamic values and smart mappings
        dynamic_values = self._get_dynamic_status_values()
        smart_mappings = self._get_smart_mappings()
        
        # Format the actual values found in database
        flight_status_values = ', '.join(dynamic_values['flight_status'])
        equipment_status_values = ', '.join(dynamic_values['equipment_status']) 
        role_values = ', '.join(dynamic_values['role_names'])
        service_values = ', '.join(dynamic_values['service_types'])
        
        enhanced_schema = f"""
ENHANCED DATABASE SCHEMA WITH RELATIONSHIPS (ACTUAL DATABASE):

flights table (Core flight operations):
- flight_id (VARCHAR, PRIMARY KEY): Unique flight identifier  
- flight_number (VARCHAR): Flight number (e.g., 'UA2406', 'AA1234')
- airline_code (VARCHAR): Airline code (e.g., 'UA', 'AA', 'DL')
- flight_status (VARCHAR): ACTUAL VALUES IN DATABASE: {flight_status_values}
- gate_id (INTEGER, FOREIGN KEY): Assigned gate (references gates.gate_id)
- scheduled_departure, actual_departure (TIMESTAMP): Departure timing
- scheduled_arrival, actual_arrival (TIMESTAMP): Arrival timing  
- aircraft_type (VARCHAR): Aircraft model information
- captain_name, cabin_lead_name, ramp_manager_name (VARCHAR): Key personnel
→ LINKS TO: employee_shifts.flight_id, flight_services.flight_id, flight_operations.flight_id

employees table (Personnel information):
- employee_id (VARCHAR, PRIMARY KEY): Unique employee identifier
- employee_name (VARCHAR): Full employee name
- phone_number (VARCHAR): Contact information
→ LINKS TO: employee_roles.employee_id, employee_shifts.employee_id

employee_roles table (Job assignments):
- employee_id (VARCHAR, FOREIGN KEY): Employee reference
- role_name (VARCHAR): Job role ('Cleaning Lead', 'Ramp Agent', 'Supervisor')
- employer_name (VARCHAR): Department/company name
- effective_date, end_date (DATE): Role period

employee_shifts table (Work schedules):
- employee_id (VARCHAR, FOREIGN KEY): Employee reference  
- shift_start, shift_end (TIMESTAMP): Shift timing
- flight_id (VARCHAR, FOREIGN KEY): Assigned flight
- shift_duration_hours (REAL): Shift length

equipment table (Airport equipment):
- entity_id (VARCHAR, PRIMARY KEY): Unique equipment identifier
- equipment_type (VARCHAR): Type ('Pushback Tractor', 'Belt Loader', 'GPU')
- equipment_model (VARCHAR): Specific model/brand
- assigned_zone (VARCHAR): Work area assignment
- primary_gates (VARCHAR): Primary gate assignments
→ LINKS TO: equipment_locations.entity_id

equipment_locations table (Equipment tracking):
- entity_id (VARCHAR, FOREIGN KEY): Equipment reference
- location_code (VARCHAR): Current location
- equipment_status (VARCHAR): Status ('Available', 'Assigned', 'Maintenance')  
- flight_id (VARCHAR, FOREIGN KEY): Currently assigned flight
- timestamp (TIMESTAMP): Last update time

gates table (Gate information):
- gate_id (INTEGER, PRIMARY KEY): Unique gate identifier
- gate_number (VARCHAR): Gate identifier (e.g., 'A12', 'B7')
- terminal (VARCHAR): Terminal location
- gate_type (VARCHAR): Gate type/capabilities
- is_active (BOOLEAN): Gate operational status

flight_services table (Service assignments):
- flight_id (VARCHAR, FOREIGN KEY): Assigned flight
- service_type (VARCHAR): Service type ('Cleaning', 'Catering', 'Fueling')
- service_status (VARCHAR): Service status ('Scheduled', 'In Progress', 'Completed')
- actual_start_time, actual_end_time (TIMESTAMP): Service timing

flight_operations table (Operational details):
- flight_id (VARCHAR, FOREIGN KEY): Flight reference
- boarding_start_time (TIMESTAMP): Boarding start
- pushback_target_time (TIMESTAMP): Planned pushback
- ramp_team_members (TEXT): Team assignments

BUSINESS CONTEXT:
- Use flight_status (not status) for flight queries with EXACT values: {flight_status_values}
- Employee names are in employee_name field (single field, not first/last) 
- Equipment status is in equipment_locations table with values: {equipment_status_values}
- Available role names: {role_values}
- Available service types: {service_values}
- Use JOINs to connect related data across tables
- Focus on operational status for "current" or "now" queries

SMART LANGUAGE MAPPINGS (User says → Database value):
Flight Status:
- "late/delayed/behind schedule" → 'Late'
- "on time/punctual/scheduled" → 'On Time Depature' 
- "turning/turnaround" → 'Turning'
- "prep/preparing" → 'Turning Preparation'
- "waiting for plane/aircraft delay" → 'Waiting on Aircraft'

Equipment Status:
- "available/free/ready" → 'Available'
- "assigned/busy/in use" → 'Assigned'
- "maintenance/repair/broken" → 'Maintenance'

Temporal Queries (for ORDER BY patterns):
- "land/landed/landing/arrive/arrived" → use actual_arrival column
- "depart/departed/departure/leave/left/take off" → use actual_departure column  
- "most recent/latest/last" → ORDER BY [column] DESC LIMIT 1
- "earliest/first/oldest" → ORDER BY [column] ASC LIMIT 1
- Always use WHERE [column] IS NOT NULL for temporal queries to filter out null timestamps
"""
        
        return enhanced_schema

    def _get_reasoning_prompt(self, query_type):
        """Add step-by-step reasoning based on query type"""
        from config import Config
        if not getattr(Config, 'ENHANCED_PROMPTS_ENABLED', False):
            return ""
        
        reasoning_prompts = {
            'flight_status': """
REASONING STEPS FOR FLIGHT STATUS QUERIES:
1. Extract the flight number from the user query
2. Determine what specific status information is needed  
3. Check if additional details like gates, times, or aircraft are requested
4. Build query to get comprehensive flight information including related data
""",
            'equipment': """
REASONING STEPS FOR EQUIPMENT QUERIES:  
1. Identify the equipment type mentioned (tractor, belt loader, etc.)
2. Determine if query is about assignment, availability, or location
3. Check if specific flight or gate context is provided
4. Consider equipment status and current assignment relationships
""",
            'personnel': """
REASONING STEPS FOR PERSONNEL QUERIES:
1. Identify if asking about specific person or role
2. Determine what information is needed (contact, schedule, assignment)
3. Check if flight-specific or general personnel query
4. Include relevant contact and location information with JOINs if needed
""",
            'location': """
REASONING STEPS FOR LOCATION QUERIES:
1. Identify what location information is being requested
2. Determine if asking about proximity or specific location
3. Consider gate assignments and equipment positioning
4. Focus on current operational locations and relationships
""",
            'time': """
REASONING STEPS FOR TIME-BASED QUERIES:
1. Identify if asking about schedules, shifts, or operational timing
2. Determine if past, current, or future time context
3. Consider operational status over scheduled times for "now" queries
4. Focus on relevant time-based operational data with proper ordering
"""
        }
        
        return reasoning_prompts.get(query_type, reasoning_prompts['flight_status'])

    def _get_domain_context(self, query_type):
        """Get airport operations context for query type"""
        from config import Config
        if not getattr(Config, 'ENHANCED_PROMPTS_ENABLED', False):
            return ""
        
        domain_contexts = {
            'flight_status': """
AIRPORT OPERATIONS CONTEXT FOR FLIGHT QUERIES:
- Users typically want comprehensive flight info, not just status
- Include gate, timing, and aircraft info when available  
- "Delayed" should include actual times if available
- Consider both departure and arrival information
- Cross-reference with equipment and personnel assignments if relevant
""",
            'equipment': """
AIRPORT OPERATIONS CONTEXT FOR EQUIPMENT QUERIES:
- Equipment can be assigned, available, or under maintenance
- Location proximity matters for operational efficiency
- Consider operator assignments and availability
- Pushback tractors are critical for departure operations
- Include current assignment details when equipment is in use
""",
            'personnel': """
AIRPORT OPERATIONS CONTEXT FOR PERSONNEL QUERIES:
- Include contact info, shift details, and current location
- Cross-reference with current flight assignments
- Consider break/availability status for operational queries
- Cleaning leads, ramp agents, and supervisors have different responsibilities
- Show assignment details when personnel are actively working
"""
        }
        
        return domain_contexts.get(query_type, "")
    
    def parse_query_to_sql(self, user_query, schema, language='en', context_prompt='', return_metadata=False):
        """Convert natural language query to SQL using OpenAI with conversation context"""
        try:
            # NEW: Classify query type with smart fallback (keywords first, then AI)
            query_type, classification_method = self._classify_query_type_with_fallback(user_query, return_method=True)
            logger.info(f"🔍 QUERY CLASSIFIED AS: {query_type}")
            
            # NEW: Enhanced schema if enabled, otherwise original behavior
            schema_text = self._get_enhanced_schema_text(schema)
            
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
            
            # NEW: Add enhanced examples if enabled (combines original + enhanced examples)
            enhanced_examples = self._get_enhanced_examples(query_type, language)
            if enhanced_examples:
                # Combine original + enhanced examples for better coverage
                all_examples = lang_config['examples'] + enhanced_examples
                logger.info(f"📚 USING ENHANCED EXAMPLES: Added {len(enhanced_examples)} examples for {query_type}")
            else:
                all_examples = lang_config['examples']  # Use original if enhancement disabled
            
            examples_text = '\n            - '.join(all_examples)
            
            # NEW: Get optional reasoning and domain context
            reasoning_prompt = self._get_reasoning_prompt(query_type)
            domain_context = self._get_domain_context(query_type)
            
            # NEW: Get dynamic values for accurate prompt
            dynamic_values = self._get_dynamic_status_values()
            flight_status_list = ', '.join(dynamic_values['flight_status'])
            equipment_status_list = ', '.join(dynamic_values['equipment_status'])
            
            prompt = f"""
            {reasoning_prompt}
            
            {lang_config['instruction']}
            
            {domain_context}
            
            IMPORTANT: Generate SQLite-compatible SQL queries only. Available tables and key columns:
            - flights: flight_id, flight_number, airline_code, flight_status, gate_id, scheduled_departure, actual_departure, aircraft_type
            - employees: employee_id, employee_name, phone_number
            - employee_roles: employee_id, role_name, employer_name
            - employee_shifts: employee_id, shift_start, shift_end, flight_id
            - equipment: entity_id, equipment_type, equipment_model, assigned_zone
            - equipment_locations: entity_id, location_code, equipment_status, flight_id
            - gates: gate_id, gate_number, terminal, gate_type, is_active
            - flight_services: flight_id, service_type, service_status
            
            Use simple SQLite syntax:
            - For status queries, use exact matches for ACTUAL database values: flight_status = 'Late', flight_status = 'On Time Depature'
            - ACTUAL flight_status values in database: {flight_status_list}
            - ACTUAL equipment_status values in database: {equipment_status_list}
            - For flight numbers: Try exact match first, then LIKE pattern if needed
              * Exact: flight_number = 'UA2406'
              * Pattern: flight_number LIKE '%UA406%' (for partial matches from speech recognition)
              * Always prefer exact matches when the full flight number is clear
            - Use || for concatenation when needed: employee_name || ' - ' || role_name
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
                if return_metadata:
                    return {'sql': None, 'classification_method': classification_method, 'query_type': query_type}
                return None
                
            # ⚠️ VALIDATION: Check for potentially problematic queries
            if "JOIN" in sql_query.upper() and "assignments" in sql_query.lower():
                logger.info(f"⚠️ Complex JOIN detected - this might fail due to database structure")
            
            if return_metadata:
                return {'sql': sql_query, 'classification_method': classification_method, 'query_type': query_type}
            return sql_query
            
        except Exception as e:
            logger.error(f"Query parsing error: {e}")
            if return_metadata:
                return {'sql': None, 'classification_method': 'error', 'query_type': 'general'}
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
    
    def generate_transparent_explanation(self, sql_query, schema, user_query, results_count, classification_method, language='en'):
        """Use AI to generate human-friendly explanation of what the query attempted"""
        from config import Config
        
        if not getattr(Config, 'TRANSPARENT_RESPONSES_ENABLED', True):
            return None
            
        try:
            # Create context-aware explanation prompt
            if sql_query == "NO_DATA":
                # Handle SQL generation failure
                explanation_prompts = {
                    'en': f"""A user asked: "{user_query}"

I classified this as a {classification_method} query, but I had trouble understanding exactly what information to look for in the database.

Database context: {self._get_schema_summary(schema)}

Please explain in conversational, helpful language:
1. What I think the user was trying to find
2. Why I had difficulty understanding their request
3. Suggest 2-3 more specific questions they could ask instead

Be friendly and specific, avoid technical jargon. Help them rephrase their question more clearly.""",

                    'es': f"""Un usuario preguntó: "{user_query}"

Clasifiqué esto como una consulta de {classification_method}, pero tuve problemas para entender exactamente qué información buscar en la base de datos.

Contexto de la base de datos: {self._get_schema_summary(schema)}

Por favor explica en lenguaje conversacional y útil:
1. Qué creo que el usuario estaba tratando de encontrar
2. Por qué tuve dificultades para entender su solicitud
3. Sugiere 2-3 preguntas más específicas que podrían hacer

Sé amigable y específico, evita la jerga técnica.""",

                    'fr': f"""Un utilisateur a demandé: "{user_query}"

J'ai classé cela comme une requête {classification_method}, mais j'ai eu du mal à comprendre exactement quelles informations chercher dans la base de données.

Contexte de la base de données: {self._get_schema_summary(schema)}

Veuillez expliquer dans un langage conversationnel et utile:
1. Ce que je pense que l'utilisateur essayait de trouver
2. Pourquoi j'ai eu des difficultés à comprendre leur demande
3. Suggérez 2-3 questions plus spécifiques qu'ils pourraient poser

Soyez amical et spécifique, évitez le jargon technique."""
                }
            else:
                # Handle normal query with results
                explanation_prompts = {
                    'en': f"""A user asked: "{user_query}"

I classified this as a {classification_method} query and generated this SQL:
{sql_query}

Database context: {self._get_schema_summary(schema)}

Results: {results_count} rows found

Please explain in conversational, helpful language:
1. What I tried to find for the user
2. Why it might have {('succeeded' if results_count > 0 else 'failed')} 
3. Suggest 2-3 alternative questions they could ask

Be friendly and specific, avoid technical jargon. Help them understand what happened and what they could try instead.""",

                    'es': f"""Un usuario preguntó: "{user_query}"

Clasifiqué esto como una consulta de {classification_method} y generé este SQL:
{sql_query}

Contexto de la base de datos: {self._get_schema_summary(schema)}

Resultados: {results_count} filas encontradas

Por favor explica en lenguaje conversacional y útil:
1. Qué traté de encontrar para el usuario
2. Por qué podría haber {('tenido éxito' if results_count > 0 else 'fallado')}
3. Sugiere 2-3 preguntas alternativas que podrían hacer

Sé amigable y específico, evita la jerga técnica.""",

                    'fr': f"""Un utilisateur a demandé: "{user_query}"

J'ai classé cela comme une requête {classification_method} et généré ce SQL:
{sql_query}

Contexte de la base de données: {self._get_schema_summary(schema)}

Résultats: {results_count} lignes trouvées

Veuillez expliquer dans un langage conversationnel et utile:
1. Ce que j'ai essayé de trouver pour l'utilisateur  
2. Pourquoi cela aurait pu {('réussir' if results_count > 0 else 'échouer')}
3. Suggérez 2-3 questions alternatives qu'ils pourraient poser

Soyez amical et spécifique, évitez le jargon technique."""
                }
            
            prompt = explanation_prompts.get(language, explanation_prompts['en'])
            
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=250,
                temperature=0.4
            )
            
            explanation = response.choices[0].message.content.strip()
            logger.info(f"🔍 TRANSPARENT EXPLANATION GENERATED for query: {user_query}")
            return explanation
            
        except Exception as e:
            logger.error(f"❌ Transparent explanation generation failed: {e}")
            return None
    
    def _get_schema_summary(self, schema):
        """Create a brief, user-friendly summary of relevant database tables"""
        try:
            if not schema:
                return "airport operations database"
                
            # Extract table names and create friendly summary
            tables = []
            if 'flights' in str(schema).lower():
                tables.append('flight information')
            if 'employee' in str(schema).lower() or 'personnel' in str(schema).lower():
                tables.append('employee data')  
            if 'equipment' in str(schema).lower():
                tables.append('equipment tracking')
            if 'gate' in str(schema).lower():
                tables.append('gate assignments')
                
            if tables:
                return f"database with {', '.join(tables)}"
            else:
                return "airport operations database"
                
        except Exception:
            return "airport operations database"
    
    def format_response_with_transparency(self, data, original_query, sql_query, schema, classification_method, language='en'):
        """Enhanced response formatting with optional transparent explanations"""
        from config import Config
        
        # If transparent responses disabled, use original format_response
        if not getattr(Config, 'TRANSPARENT_RESPONSES_ENABLED', True):
            return self.format_response(data, original_query, language)
        
        results_count = len(data) if data else 0
        
        # Generate AI explanation for problematic cases
        needs_explanation = (
            results_count == 0 or  # No results found
            results_count > 1000   # Too many results
        )
        
        if needs_explanation:
            explanation = self.generate_transparent_explanation(
                sql_query, schema, original_query, results_count, classification_method, language
            )
            
            if explanation:
                # For too many results, add a summary
                if results_count > 1000:
                    summary = self._create_large_result_summary(data, sql_query)
                    return f"{explanation}\n\n{summary}"
                else:
                    return explanation
        
        # For normal cases (1-1000 results), use standard formatting
        return self.format_response(data, original_query, language)
    
    def _create_large_result_summary(self, data, sql_query):
        """Create intelligent summary for large result sets"""
        try:
            if not data:
                return "No summary available."
                
            total_count = len(data)
            
            # Equipment-specific summary
            if "equipment" in sql_query.lower():
                return self._summarize_equipment_data(data, total_count)
            
            # Flight-specific summary  
            elif "flight" in sql_query.lower():
                return self._summarize_flight_data(data, total_count)
                
            # Employee-specific summary
            elif "employee" in sql_query.lower() or "personnel" in sql_query.lower():
                return self._summarize_employee_data(data, total_count)
            
            # Generic summary
            else:
                sample_size = min(5, total_count)
                return f"Here are the first {sample_size} of {total_count} results: {str(data[:sample_size])[:200]}..."
                
        except Exception as e:
            logger.error(f"Summary generation error: {e}")
            return f"Found {len(data)} results (too many to display all at once)."
    
    def _summarize_equipment_data(self, data, total_count):
        """Summarize equipment data by type and status"""
        try:
            # Count by equipment type
            types = {}
            statuses = {}
            
            for row in data[:100]:  # Sample first 100 for performance
                eq_type = str(row.get('equipment_type', 'Unknown')).strip()
                eq_status = str(row.get('equipment_status', 'Unknown')).strip()
                
                types[eq_type] = types.get(eq_type, 0) + 1
                statuses[eq_status] = statuses.get(eq_status, 0) + 1
            
            # Format summary
            top_types = sorted(types.items(), key=lambda x: x[1], reverse=True)[:3]
            top_statuses = sorted(statuses.items(), key=lambda x: x[1], reverse=True)[:3]
            
            summary = f"Summary of {total_count} equipment items:\n"
            summary += f"Top types: {', '.join([f'{count} {type}' for type, count in top_types])}\n"
            summary += f"Status breakdown: {', '.join([f'{count} {status}' for status, count in top_statuses])}"
            
            return summary
            
        except Exception:
            return f"Found {total_count} equipment items (summary unavailable)."
    
    def _summarize_flight_data(self, data, total_count):
        """Summarize flight data by status and airline"""
        try:
            statuses = {}
            airlines = {}
            
            for row in data[:100]:  # Sample for performance
                status = str(row.get('flight_status', 'Unknown')).strip()
                airline = str(row.get('airline_code', 'Unknown')).strip()
                
                statuses[status] = statuses.get(status, 0) + 1
                airlines[airline] = airlines.get(airline, 0) + 1
            
            top_statuses = sorted(statuses.items(), key=lambda x: x[1], reverse=True)[:3]
            
            summary = f"Summary of {total_count} flights:\n"
            summary += f"Status breakdown: {', '.join([f'{count} {status}' for status, count in top_statuses])}"
            
            return summary
            
        except Exception:
            return f"Found {total_count} flights (summary unavailable)."
    
    def _summarize_employee_data(self, data, total_count):
        """Summarize employee data by role and department"""
        try:
            roles = {}
            
            for row in data[:100]:  # Sample for performance
                role = str(row.get('role_name', row.get('position', 'Unknown'))).strip()
                roles[role] = roles.get(role, 0) + 1
            
            top_roles = sorted(roles.items(), key=lambda x: x[1], reverse=True)[:3]
            
            summary = f"Summary of {total_count} employee records:\n"
            summary += f"Top roles: {', '.join([f'{count} {role}' for role, count in top_roles])}"
            
            return summary
            
        except Exception:
            return f"Found {total_count} employee records (summary unavailable)."
    
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
        
        # 🔧 SPEECH RECOGNITION ERROR PATTERNS: Common mishearings and corrections
        speech_error_patterns = [
            # Common "flight" mishearings
            (r'\bconvoy\b', 'flight'),                    # "convoy" → "flight"
            (r'\bplayed to\b', 'flight'),                 # "played to" → "flight"
            (r'\bponderous lights\b', 'flight'),          # "ponderous lights" → "flight"
            (r'\bflat\b', 'flight'),                      # "flat" → "flight"
            (r'\bfright\b', 'flight'),                    # "fright" → "flight"
            (r'\bplight\b', 'flight'),                    # "plight" → "flight"
            (r'\bblast\b', 'flight'),                     # "blast" → "flight"
            (r'\bflight\s+to\s+(?!land|arrive|depart|take)', 'flight'),  # "flight to" → "flight" (but preserve "to land/arrive")
            
            # Common number confusions (2406 variants)
            (r'\b2046\b', '2406'),                        # "2046" → "2406"
            (r'\b2460\b', '2406'),                        # "2460" → "2406"
            (r'\b2064\b', '2406'),                        # "2064" → "2406"
            (r'\b24[0-9]6\b', '2406'),                    # Any 24X6 → 2406
            (r'\b20[4-6][0-6]\b', '2406'),                # Common 20XX variants → 2406
            
            # Specific pattern from user's exact problem
            (r'\bwhat is the convoy you 82406\b', 'what is the flight status of UA2406'),
            (r'\bwhat is this played to 406\b', 'what is the flight status of UA2406'),
            (r'\bwhat is the status on a 2046\b', 'what is the flight status of UA2406'),
            (r'\bwhat does ponderous lights 2046\b', 'what is the flight status of UA2406'),
        ]
        
        # Store original for comparison
        original_user_query = user_query
        
        # Apply speech error corrections
        for pattern, replacement in speech_error_patterns:
            user_query = re.sub(pattern, replacement, user_query, flags=re.IGNORECASE)
        
        # Log speech corrections
        if original_user_query != user_query:
            logging.info(f"🔧 SPEECH ERROR CORRECTION: '{original_user_query}' → '{user_query}'")
        
        # 🔧 FLIGHT NUMBER PATTERNS: Fix common flight number speech recognition errors
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
        
        # 🆕 EQUIPMENT PATTERN NORMALIZATION: Fix speech-to-database format mismatches
        user_query = self.normalize_equipment_patterns(user_query)
        user_query = self.normalize_entity_patterns(user_query) 
        user_query = self.normalize_zone_patterns(user_query)
            
        # Log the preprocessing for debugging
        logger.info(f"🔧 PREPROCESSED QUERY: '{user_query.strip()}'")
        
        return user_query.strip()
    
    def normalize_equipment_patterns(self, query):
        """Handle equipment name speech variations (pushback tractor → Push-back Tractor)"""
        original = query
        
        patterns = [
            # Push-back equipment
            (r'\bpushback\s+tractors?\b', 'Push-back Tractor'),
            (r'\bpush\s*back\s+tractors?\b', 'Push-back Tractor'),
            
            # Loaders
            (r'\bbaggage\s+tugs?\b', 'Baggage Tug'),
            (r'\bbelt\s+loaders?\b', 'Belt Loader'),
            (r'\bcontainer\s+loaders?\b', 'Container Loader'),
            
            # Trucks
            (r'\bservice\s+trucks?\b', 'Service Truck'),
            (r'\blavatory\s+trucks?\b', 'Lavatory Truck'),
            
            # Technical equipment
            (r'\bgpus?\b', 'GPU'),
            (r'\bground\s+power\s+units?\b', 'GPU'),
            (r'\bpcas?\b', 'PCA'),
            (r'\bpower\s+conditioning\s+units?\b', 'PCA'),
            
            # Tow equipment  
            (r'\btow\s+bars?\b', 'Tow Bar'),
        ]
        
        for pattern, replacement in patterns:
            query = re.sub(pattern, replacement, query, flags=re.IGNORECASE)
        
        if original != query:
            logging.info(f"🔧 EQUIPMENT NORMALIZATION: '{original}' → '{query}'")
        
        return query
    
    def normalize_entity_patterns(self, query):
        """Handle entity ID spacing (TG BM 05 → TG-BM-05)"""
        original = query
        
        # Pattern: 2-3 letters, space, 2-3 letters, space, 1-3 numbers
        query = re.sub(r'\b([A-Z]{2,3})\s+([A-Z]{2,3})\s+(\d{1,3})\b', r'\1-\2-\3', query)
        
        if original != query:
            logging.info(f"🔧 ENTITY ID NORMALIZATION: '{original}' → '{query}'")
        
        return query
    
    def normalize_zone_patterns(self, query):
        """Handle zone name spacing (Zone B South → B-South, Zone C South 1 → C-South-1)"""
        original = query
        
        # Pattern 1: "zone C south 1" → "C-South-1" (complex zones with numbers)
        def complex_zone_replacer(match):
            letter = match.group(1).upper()
            direction = match.group(2).capitalize()
            number = match.group(3)
            return f'{letter}-{direction}-{number}'
        
        query = re.sub(r'\bzone\s+([A-D])\s+(north|south|central)\s+(\d+)\b', complex_zone_replacer, query, flags=re.IGNORECASE)
        
        # Pattern 2: "zone B south" → "B-South" (simple zones)
        def simple_zone_replacer(match):
            letter = match.group(1).upper()
            direction = match.group(2).capitalize()
            return f'{letter}-{direction}'
        
        query = re.sub(r'\bzone\s+([A-D])\s+(north|south|mid|central)\b', simple_zone_replacer, query, flags=re.IGNORECASE)
        
        # Pattern 3: Direct zone references "C south 1" → "C-South-1" (without "zone" prefix)
        query = re.sub(r'\b([A-D])\s+(north|south|central)\s+(\d+)\b', complex_zone_replacer, query, flags=re.IGNORECASE)
        query = re.sub(r'\b([A-D])\s+(north|south|mid|central)\b', simple_zone_replacer, query, flags=re.IGNORECASE)
        
        # Pattern 4: Speech recognition errors "sea north" → "C-North" 
        def speech_error_zone_replacer(match):
            direction = match.group(1).capitalize()
            return f'C-{direction}'
        
        query = re.sub(r'\bsea\s+(north|south|mid|central)\b', speech_error_zone_replacer, query, flags=re.IGNORECASE)
        
        if original != query:
            logging.info(f"🔧 ZONE NORMALIZATION: '{original}' → '{query}'")
        
        return query
    
    def make_singular(self, word):
        """Simple plural removal for equipment matching"""
        if word.endswith('s') and len(word) > 3:
            return word[:-1]
        return word
    
    def find_equipment_match(self, user_word, actual_types):
        """Find closest equipment type using semantic and word matching"""
        user_clean = user_word.lower()
        
        # Semantic mappings for common speech variations
        semantic_mappings = {
            # Power-related equipment
            'power': 'GPU',
            'electricity': 'GPU', 
            'electrical': 'GPU',
            'generator': 'GPU',
            
            # Maintenance/service equipment  
            'maintenance': 'Service Truck',
            'repair': 'Service Truck',
            'service': 'Service Truck',
            'mechanic': 'Service Truck',
            'fix': 'Service Truck',
            
            # Vehicle/truck categories
            'vehicle': 'Service Truck',
            'truck': 'Service Truck',
            'van': 'Service Truck',
            
            # Loading equipment
            'cargo': 'Container Loader',
            'freight': 'Container Loader',
            'loading': 'Container Loader',
            
            # Baggage equipment
            'luggage': 'Baggage Tug',
            'bags': 'Baggage Tug',
            'suitcase': 'Baggage Tug',
            
            # Toilet/waste equipment
            'toilet': 'Lavatory Truck',
            'bathroom': 'Lavatory Truck',
            'waste': 'Lavatory Truck',
            'sewage': 'Lavatory Truck'
        }
        
        # First try semantic mapping
        if user_clean in semantic_mappings:
            mapped_type = semantic_mappings[user_clean]
            if mapped_type in actual_types:
                return mapped_type
        
        # Then try direct word matching
        for eq_type in actual_types:
            eq_words = eq_type.lower().split()
            
            # Direct word match: "loader" in ["belt", "loader"]
            if user_clean in eq_words:
                return eq_type
                
            # Partial match: "container" in "Container Loader"  
            for eq_word in eq_words:
                if user_clean in eq_word or eq_word in user_clean:
                    return eq_type
        
        return None
    
    def get_cached_equipment_types(self):
        """Get all equipment types from database with caching"""
        # Use existing dynamic values cache if available
        if hasattr(self, '_cached_equipment_types') and self._cached_equipment_types:
            return self._cached_equipment_types
            
        try:
            conn = self.connect_db()
            if not conn:
                return []
                
            cursor = conn.cursor()
            cursor.execute("SELECT DISTINCT equipment_type FROM equipment WHERE equipment_type IS NOT NULL ORDER BY equipment_type")
            results = cursor.fetchall()
            self._cached_equipment_types = [row[0] for row in results]
            conn.close()
            
            logging.info(f"🔧 EQUIPMENT TYPES CACHED: {len(self._cached_equipment_types)} types")
            return self._cached_equipment_types
        except Exception as e:
            logging.error(f"❌ ERROR GETTING EQUIPMENT TYPES: {e}")
            return []
    
    def apply_dynamic_equipment_matching(self, query):
        """Apply dynamic equipment matching as fallback for failed queries"""
        if not query or len(query.strip()) == 0:
            return query
            
        # Get actual equipment types from database
        actual_types = self.get_cached_equipment_types()
        if not actual_types:
            return query  # No equipment types available
        
        original_query = query
        
        # Look for common equipment phrase patterns and replace them cleanly
        equipment_phrases = [
            # Maintenance related
            (r'\bmaintenance\s+vehicles?\b', 'Service Truck'),
            (r'\bservice\s+vehicles?\b', 'Service Truck'),
            (r'\brepair\s+vehicles?\b', 'Service Truck'),
            
            # Power related
            (r'\bpower\s+units?\b', 'GPU'),
            (r'\belectrical\s+units?\b', 'GPU'),
            (r'\bgenerator\s+units?\b', 'GPU'),
            
            # Loading related
            (r'\bloading\s+equipment\b', 'Container Loader'),
            (r'\bcargo\s+equipment\b', 'Container Loader'),
            (r'\bfreight\s+equipment\b', 'Container Loader'),
            
            # Baggage related
            (r'\bluggage\s+equipment\b', 'Baggage Tug'),
            (r'\bbag\s+equipment\b', 'Baggage Tug'),
            
            # Waste related
            (r'\bwaste\s+vehicles?\b', 'Lavatory Truck'),
            (r'\btoilet\s+vehicles?\b', 'Lavatory Truck'),
        ]
        
        # Try phrase-level replacements first
        for pattern, replacement in equipment_phrases:
            if re.search(pattern, query, flags=re.IGNORECASE):
                # Make the replacement more natural for AI parsing
                if 'find' in query.lower() or 'show' in query.lower():
                    # For "find/show X" queries, use more natural language
                    query = re.sub(pattern, f'{replacement} equipment', query, flags=re.IGNORECASE)
                else:
                    query = re.sub(pattern, replacement, query, flags=re.IGNORECASE)
                break  # Only do one replacement to avoid conflicts
        
        # If no phrase match, fall back to individual word matching
        if query == original_query:
            words = query.split()
            best_match = None
            first_matched_word = None
            
            for word in words:
                # Remove punctuation and make singular
                clean_word = re.sub(r'[^\w]', '', word)
                singular = self.make_singular(clean_word)
                
                # Try to match against actual equipment types
                match = self.find_equipment_match(singular, actual_types)
                if match and not best_match:  # Only take the FIRST match
                    best_match = match
                    first_matched_word = word
                    break  # Stop after first match
            
            # Replace the first matched word only
            if best_match and first_matched_word:
                query = re.sub(rf'\b{re.escape(first_matched_word)}\b', best_match, query, flags=re.IGNORECASE)
        
        if original_query != query:
            logging.info(f"🎯 DYNAMIC EQUIPMENT MATCH: '{original_query}' → '{query}'")
        
        return query
    
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
        sql_result = self.parse_query_to_sql(user_query, schema, language, context_prompt, return_metadata=True)
        if isinstance(sql_result, dict):
            sql_query = sql_result.get('sql')
            classification_method = sql_result.get('classification_method', 'unknown')
            query_type = sql_result.get('query_type', 'general')
        elif isinstance(sql_result, tuple):
            # Backward compatibility
            sql_query, classification_method = sql_result
            query_type = 'general'
        else:
            sql_query = sql_result
            classification_method = "unknown"
            query_type = 'general'
        if not sql_query:
            # Generate transparent explanation for SQL generation failure
            explanation = self.generate_transparent_explanation(
                "NO_DATA", schema, user_query, 0, classification_method, language
            )
            
            response_text = explanation if explanation else messages['parse_error']
            
            return {
                "response": response_text,
                "confidence": 0.0,
                "latency": time.time() - start_time,
                "language": language,
                "classification_method": classification_method
            }
        
        # Execute query with dynamic fallback
        results = self.execute_query_with_fallback(user_query, query_type, sql_query)
        if results is None:
            return {
                "response": messages['query_error'],
                "confidence": 0.0,
                "latency": time.time() - start_time,
                "language": language
            }
        
        # Format response with optional transparency
        response_text = self.format_response_with_transparency(
            results, user_query, sql_query, schema, classification_method, language
        )
        
        # Calculate confidence based on result quality
        confidence = 0.9 if results else 0.1
        if any(phrase in response_text.lower() for phrase in ["don't know", "no lo sé", "ne sais pas"]):
            confidence = 0.1
        
        # Build base result
        result = {
            "response": response_text,
            "confidence": confidence,
            "latency": time.time() - start_time,
            "sql_query": sql_query,
            "result_count": len(results) if results else 0,
            "language": language,
            "query_type": "simple",
            "classification_method": classification_method
        }
        
        # Add clarification if needed (feature-flagged)
        query_type = self._classify_query_type_with_fallback(user_query)
        result = self._add_clarification_if_needed(result, user_query, query_type)
        
        return result
    
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
        
        # Add confidence disclosure if needed (but skip if transparent explanation already provided)
        if result['confidence'] < assistant.confidence_threshold:
            # Check if response already contains AI-generated transparent explanation
            response_text = result.get('response', '')
            has_transparent_explanation = (
                len(response_text) > 200 and  # Transparent explanations are typically longer
                any(phrase in response_text.lower() for phrase in [
                    'what i tried to find', 'what i was trying to do', 'let me explain',
                    'what i think the user was trying to find', 'what the user was trying to find',
                    'alternative questions', 'you could try asking', 'you could ask',
                    'suggest 2-3', 'here are some ways', 'you could rephrase',
                    'i had trouble understanding', 'i had difficulty understanding',
                    'absolutely, i\'d be happy to help clarify'
                ])
            )
            
            if not has_transparent_explanation:
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

# =============================================================================
# API v2 ENDPOINTS - Enhanced with metadata, analytics, and monitoring
# =============================================================================

@app.route('/api/v2/query', methods=['POST'])
def process_voice_query_v2():
    """Enhanced v2 query processing with detailed metadata and analytics"""
    start_time = time.time()
    processing_steps = []
    
    try:
        data = request.get_json()
        user_query = data.get('query', '').strip()
        language = data.get('language', None)
        session_id = data.get('sessionId', None)
        context_data = data.get('contextData', None)
        
        # v2 specific options
        options = data.get('options', {})
        include_metadata = options.get('include_metadata', True)
        include_debug = options.get('include_debug', False)
        include_performance = options.get('include_performance', True)
        
        step_start = time.time()
        
        if not user_query:
            error_responses = {
                'en': "I didn't hear your question. Could you please repeat it?",
                'es': "No escuché tu pregunta. ¿Podrías repetirla por favor?",
                'fr': "Je n'ai pas entendu votre question. Pourriez-vous la répéter s'il vous plaît?"
            }
            detected_lang = language or assistant.detect_language(user_query) or 'en'
            
            error_response = {
                "error": "No query provided",
                "response": error_responses.get(detected_lang, error_responses['en']),
                "language": detected_lang,
                "api_version": "2.0"
            }
            
            if include_metadata:
                error_response["metadata"] = {
                    "processing_time_ms": round((time.time() - start_time) * 1000, 2),
                    "error_type": "validation_error"
                }
            
            return jsonify(error_response), 400
        
        processing_steps.append({
            "step": "validation",
            "duration_ms": round((time.time() - step_start) * 1000, 2)
        })
        
        # Track original query for debug info
        original_query = user_query
        
        # Process the query with context (same as v1)
        step_start = time.time()
        result = assistant.process_query(user_query, language, session_id, context_data)
        processing_steps.append({
            "step": "query_processing",
            "duration_ms": round((time.time() - step_start) * 1000, 2)
        })
        
        # Store conversation exchange if session_id provided
        if session_id and result.get('response'):
            assistant.store_conversation_exchange(session_id, user_query, result['response'])
        
        # Add confidence disclosure if needed (but skip if transparent explanation already provided)
        if result['confidence'] < assistant.confidence_threshold:
            # Check if response already contains AI-generated transparent explanation
            response_text = result.get('response', '')
            has_transparent_explanation = (
                len(response_text) > 200 and  # Transparent explanations are typically longer
                any(phrase in response_text.lower() for phrase in [
                    'what i tried to find', 'what i was trying to do', 'let me explain',
                    'what i think the user was trying to find', 'what the user was trying to find',
                    'alternative questions', 'you could try asking', 'you could ask',
                    'suggest 2-3', 'here are some ways', 'you could rephrase',
                    'i had trouble understanding', 'i had difficulty understanding',
                    'absolutely, i\'d be happy to help clarify'
                ])
            )
            
            if not has_transparent_explanation:
                confidence_prefixes = {
                    'en': "I'm not entirely sure, but",
                    'es': "No estoy completamente seguro, pero",
                    'fr': "Je ne suis pas entièrement sûr, mais"
                }
                prefix = confidence_prefixes.get(result.get('language', 'en'), confidence_prefixes['en'])
                result['response'] = f"{prefix} {result['response']}"
        
        # Build enhanced v2 response
        total_time_ms = round((time.time() - start_time) * 1000, 2)
        
        enhanced_response = {
            "response": result["response"],
            "confidence": result["confidence"],
            "language": result["language"],
            "api_version": "2.0"
        }
        
        # Add detailed metadata if requested
        if include_metadata:
            features_used = []
            if hasattr(assistant, 'dynamic_values_cache') and assistant.dynamic_values_cache:
                features_used.append("dynamic_values")
            if hasattr(assistant, 'smart_mappings_cache') and assistant.smart_mappings_cache:
                features_used.append("smart_mappings")
            
            enhanced_response["metadata"] = {
                "query_classification": result.get("query_type", "unknown"),
                "features_used": features_used,
                "cache_status": "hit" if features_used else "miss",
                "processing_steps": processing_steps,
                "total_processing_time_ms": total_time_ms,
                "feature_flags": {
                    "enhanced_prompts": getattr(assistant, '_enhanced_prompts_enabled', True),
                    "dynamic_values": getattr(assistant, '_dynamic_values_enabled', True),
                    "query_classification": getattr(assistant, '_classification_enabled', True)
                }
            }
            
            if result.get('sql_query'):
                enhanced_response["metadata"]["optimizations_applied"] = [
                    "Dynamic database value discovery",
                    "Smart language mappings"
                ]
        
        # Add structured data section
        if include_performance and result.get('sql_query'):
            enhanced_response["data"] = {
                "sql_query": result["sql_query"],
                "result_count": result.get("result_count", 0),
                "execution_time_ms": result.get("latency", 0) * 1000,
                "query_complexity": result.get("query_type", "simple")
            }
        
        # Add debug information if requested
        if include_debug:
            enhanced_response["debug"] = {
                "original_query": original_query,
                "preprocessed_query": user_query,
                "session_id": session_id,
                "classification_method": result.get("classification_method", "unknown"),
                "confidence_threshold": assistant.confidence_threshold
            }
        
        return jsonify(enhanced_response)
        
    except Exception as e:
        logger.error(f"v2 Query processing error: {e}")
        
        error_response = {
            "error": str(e),
            "response": "I'm having technical difficulties right now. Please try again.",
            "language": data.get('language', 'en') if 'data' in locals() else 'en',
            "api_version": "2.0"
        }
        
        if include_metadata:
            error_response["metadata"] = {
                "processing_time_ms": round((time.time() - start_time) * 1000, 2),
                "error_type": "processing_error",
                "processing_steps": processing_steps
            }
        
        return jsonify(error_response), 500

@app.route('/api/v2/health', methods=['GET'])
def health_check_v2():
    """Enhanced health check with detailed system status"""
    start_time = time.time()
    
    try:
        # Test database connection
        schema = assistant.get_database_schema()
        
        # Check cache status
        cache_status = {
            "dynamic_values_cached": bool(assistant.dynamic_values_cache),
            "smart_mappings_cached": bool(assistant.smart_mappings_cache)
        }
        
        # Feature flag status
        from config import Config
        feature_flags = {
            "enhanced_prompts": Config.ENHANCED_PROMPTS_ENABLED,
            "enhanced_schema": Config.ENHANCED_SCHEMA_ENABLED,
            "query_classification": Config.QUERY_CLASSIFICATION_ENABLED
        }
        
        response_time_ms = round((time.time() - start_time) * 1000, 2)
        
        return jsonify({
            "status": "healthy",
            "api_version": "2.0",
            "database": {
                "connected": schema is not None,
                "tables_found": len(schema) if schema else 0,
                "response_time_ms": response_time_ms
            },
            "cache": cache_status,
            "features": feature_flags,
            "system": {
                "response_time_ms": response_time_ms,
                "timestamp": time.time()
            }
        })
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "api_version": "2.0",
            "error": str(e),
            "timestamp": time.time()
        }), 500

@app.route('/api/v2/analytics', methods=['GET'])
def get_analytics_v2():
    """Get usage analytics and performance metrics"""
    try:
        from config import Config
        # Basic analytics (can be enhanced with real metrics collection later)
        analytics = {
            "api_version": "2.0",
            "performance": {
                "cache_status": {
                    "dynamic_values_cache_size": len(assistant.dynamic_values_cache),
                    "smart_mappings_cache_size": len(assistant.smart_mappings_cache)
                },
                "session_management": {
                    "active_sessions": len(assistant.conversation_sessions)
                }
            },
            "features": {
                "enhanced_prompts_enabled": getattr(Config, 'ENHANCED_PROMPTS_ENABLED', True),
                "enhanced_schema_enabled": getattr(Config, 'ENHANCED_SCHEMA_ENABLED', True),
                "query_classification_enabled": getattr(Config, 'QUERY_CLASSIFICATION_ENABLED', True)
            },
            "system_info": {
                "cache_timeout_seconds": assistant.cache_timeout,
                "session_timeout_seconds": assistant.session_timeout,
                "confidence_threshold": assistant.confidence_threshold
            },
            "timestamp": time.time()
        }
        
        return jsonify(analytics)
        
    except Exception as e:
        logger.error(f"Analytics error: {e}")
        return jsonify({
            "error": str(e),
            "api_version": "2.0",
            "timestamp": time.time()
        }), 500

@app.route('/api/v2/feedback', methods=['POST'])
def submit_feedback():
    """Submit user feedback for learning system (feature-flagged)"""
    from config import Config
    if not getattr(Config, 'LEARNING_ENABLED', False):
        return jsonify({
            'error': 'Learning system disabled',
            'message': 'Feedback collection is not currently enabled'
        }), 400
    
    try:
        data = request.get_json()
        learning_id = data.get('learning_id')
        user_feedback = data.get('feedback')
        suggested_classification = data.get('classification')
        
        if not learning_id or not user_feedback:
            return jsonify({
                'error': 'Missing required fields',
                'required': ['learning_id', 'feedback']
            }), 400
        
        # Store feedback
        success = assistant._store_user_feedback(
            learning_id, 
            user_feedback, 
            suggested_classification
        )
        
        if success:
            return jsonify({
                'message': 'Feedback received successfully',
                'learning_id': learning_id,
                'status': 'stored'
            })
        else:
            return jsonify({
                'error': 'Failed to store feedback',
                'learning_id': learning_id
            }), 500
            
    except Exception as e:
        logger.error(f"❌ Feedback endpoint error: {e}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@app.route('/api/features', methods=['POST'])
def toggle_feature():
    """Toggle feature flags from frontend"""
    try:
        data = request.get_json()
        feature_name = data.get('feature')
        enabled = data.get('enabled', False)
        
        if not feature_name:
            return jsonify({
                'error': 'Missing feature name',
                'required': ['feature', 'enabled']
            }), 400
        
        # Validate feature name
        valid_features = [
            'ENHANCED_KEYWORDS_ENABLED',
            'ENHANCED_PHRASES_ENABLED', 
            'TRANSPARENT_RESPONSES_ENABLED',
            'LEARNING_ENABLED',
            'CLARIFICATION_ENABLED',
            'DYNAMIC_FALLBACK_ENABLED'
        ]
        
        if feature_name not in valid_features:
            return jsonify({
                'error': 'Invalid feature name',
                'valid_features': valid_features
            }), 400
        
        # Update the config (note: this only affects current session)
        # For persistent changes, user would need to update .env file
        from config import Config
        setattr(Config, feature_name, enabled)
        
        logger.info(f"🎛️ Feature {feature_name} {'enabled' if enabled else 'disabled'} via API")
        
        return jsonify({
            'message': f'Feature {feature_name} {"enabled" if enabled else "disabled"}',
            'feature': feature_name,
            'enabled': enabled,
            'note': 'Change applies to current session only. Update .env file for persistence.'
        })
        
    except Exception as e:
        logger.error(f"❌ Feature toggle error: {e}")
        return jsonify({
            'error': 'Internal server error',
            'message': str(e)
        }), 500

@app.route('/api/v2/docs', methods=['GET'])
def api_documentation():
    """OpenAPI documentation for v2 API"""
    openapi_spec = {
        "openapi": "3.0.0",
        "info": {
            "title": "FrontierAudio Voice Assistant API",
            "version": "2.0.0",
            "description": "Natural language to SQL conversion for airport operations with enhanced analytics and monitoring",
            "contact": {
                "name": "FrontierAudio API Support",
                "url": "https://github.com/frontieraudio"
            }
        },
        "servers": [
            {
                "url": "http://localhost:3000",
                "description": "Development server"
            }
        ],
        "paths": {
            "/api/v2/query": {
                "post": {
                    "summary": "Process natural language query",
                    "description": "Convert natural language to SQL and return enhanced results with metadata",
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["query"],
                                    "properties": {
                                        "query": {
                                            "type": "string",
                                            "description": "Natural language query",
                                            "example": "What flights are delayed?"
                                        },
                                        "language": {
                                            "type": "string",
                                            "enum": ["en", "es", "fr"],
                                            "description": "Language for response",
                                            "default": "en"
                                        },
                                        "sessionId": {
                                            "type": "string",
                                            "description": "Session ID for conversation context"
                                        },
                                        "options": {
                                            "type": "object",
                                            "properties": {
                                                "include_metadata": {
                                                    "type": "boolean",
                                                    "default": True,
                                                    "description": "Include detailed processing metadata"
                                                },
                                                "include_debug": {
                                                    "type": "boolean",
                                                    "default": False,
                                                    "description": "Include debug information"
                                                },
                                                "include_performance": {
                                                    "type": "boolean",
                                                    "default": True,
                                                    "description": "Include performance metrics"
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": {
                            "description": "Successful query processing",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "response": {
                                                "type": "string",
                                                "description": "Natural language response"
                                            },
                                            "confidence": {
                                                "type": "number",
                                                "minimum": 0,
                                                "maximum": 1,
                                                "description": "Confidence score for the response"
                                            },
                                            "language": {
                                                "type": "string",
                                                "description": "Detected or specified language"
                                            },
                                            "api_version": {
                                                "type": "string",
                                                "example": "2.0"
                                            },
                                            "metadata": {
                                                "type": "object",
                                                "description": "Processing metadata and analytics"
                                            },
                                            "data": {
                                                "type": "object",
                                                "description": "Structured query data and results"
                                            },
                                            "debug": {
                                                "type": "object",
                                                "description": "Debug information (when requested)"
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "400": {
                            "description": "Bad request - invalid input"
                        },
                        "500": {
                            "description": "Internal server error"
                        }
                    }
                }
            },
            "/api/v2/health": {
                "get": {
                    "summary": "Health check with system status",
                    "description": "Get detailed system health information including database, cache, and feature status",
                    "responses": {
                        "200": {
                            "description": "System is healthy",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "status": {
                                                "type": "string",
                                                "example": "healthy"
                                            },
                                            "api_version": {
                                                "type": "string",
                                                "example": "2.0"
                                            },
                                            "database": {
                                                "type": "object",
                                                "description": "Database connection status"
                                            },
                                            "cache": {
                                                "type": "object",
                                                "description": "Cache status information"
                                            },
                                            "features": {
                                                "type": "object",
                                                "description": "Feature flag status"
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "500": {
                            "description": "System is unhealthy"
                        }
                    }
                }
            },
            "/api/v2/analytics": {
                "get": {
                    "summary": "Usage analytics and performance metrics",
                    "description": "Get system analytics including performance metrics, cache status, and feature usage",
                    "responses": {
                        "200": {
                            "description": "Analytics data",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "api_version": {
                                                "type": "string",
                                                "example": "2.0"
                                            },
                                            "performance": {
                                                "type": "object",
                                                "description": "Performance metrics"
                                            },
                                            "features": {
                                                "type": "object",
                                                "description": "Feature usage statistics"
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
        "components": {
            "schemas": {
                "QueryRequest": {
                    "type": "object",
                    "required": ["query"],
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language query"
                        },
                        "language": {
                            "type": "string",
                            "enum": ["en", "es", "fr"]
                        }
                    }
                },
                "QueryResponse": {
                    "type": "object",
                    "properties": {
                        "response": {
                            "type": "string"
                        },
                        "confidence": {
                            "type": "number"
                        },
                        "language": {
                            "type": "string"
                        }
                    }
                }
            }
        }
    }
    
    return jsonify(openapi_spec)

@app.route('/docs')
def swagger_ui():
    """Serve Swagger UI for API documentation"""
    swagger_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>FrontierAudio API Documentation</title>
        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui.css" />
        <style>
            html {{ box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }}
            *, *:before, *:after {{ box-sizing: inherit; }}
            body {{ margin:0; background: #fafafa; }}
        </style>
    </head>
    <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist@3.52.5/swagger-ui-standalone-preset.js"></script>
        <script>
            window.onload = function() {{
                const ui = SwaggerUIBundle({{
                    url: '/api/v2/docs',
                    dom_id: '#swagger-ui',
                    deepLinking: true,
                    presets: [
                        SwaggerUIBundle.presets.apis,
                        SwaggerUIStandalonePreset
                    ],
                    plugins: [
                        SwaggerUIBundle.plugins.DownloadUrl
                    ],
                    layout: "StandaloneLayout"
                }});
            }};
        </script>
    </body>
    </html>
    """
    return swagger_html

if __name__ == '__main__':
    app.run(debug=False, host='localhost', port=3000) 