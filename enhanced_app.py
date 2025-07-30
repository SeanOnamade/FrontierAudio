"""
JARVIS Enhanced Application - High-performance, scalable airport operations assistant
Includes caching, database optimization, compression, monitoring, and analytics
"""

import os
import time
import gzip
import logging
from datetime import datetime, timedelta
from functools import wraps
from typing import Dict, List, Any, Optional

from flask import Flask, request, jsonify, render_template, g
from flask_cors import CORS
import openai
from dotenv import load_dotenv

# Enhanced components
from cache_manager import init_cache_manager, get_cache_manager, get_query_cache
from database_optimizer import init_database_pool, get_database_pool, execute_query_cached
from performance_monitor import init_performance_monitor, get_performance_monitor, track_performance

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('jarvis.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config.update({
    'CACHE_REDIS_HOST': os.getenv('REDIS_HOST', 'localhost'),
    'CACHE_REDIS_PORT': int(os.getenv('REDIS_PORT', 6379)),
    'CACHE_REDIS_DB': int(os.getenv('REDIS_DB', 0)),
    'CACHE_DEFAULT_TTL': int(os.getenv('CACHE_TTL', 3600)),
    'DB_POOL_SIZE': int(os.getenv('DB_POOL_SIZE', 20)),
    'DB_MAX_CONNECTIONS': int(os.getenv('DB_MAX_CONNECTIONS', 50)),
    'COMPRESSION_LEVEL': int(os.getenv('COMPRESSION_LEVEL', 6)),
    'OPENAI_API_KEY': os.getenv('OPENAI_API_KEY'),
    'DATABASE_PATH': os.getenv('DATABASE_PATH', 'united_airlines_normalized.db')
})

# Initialize enhanced components
def init_enhanced_components():
    """Initialize all enhanced performance components"""
    try:
        # Initialize cache manager
        cache_manager = init_cache_manager(
            redis_host=app.config['CACHE_REDIS_HOST'],
            redis_port=app.config['CACHE_REDIS_PORT'],
            redis_db=app.config['CACHE_REDIS_DB'],
            default_ttl=app.config['CACHE_DEFAULT_TTL']
        )
        logger.info("Cache manager initialized")
        
        # Initialize database pool
        db_pool = init_database_pool(
            database_path=app.config['DATABASE_PATH'],
            pool_size=app.config['DB_POOL_SIZE'],
            max_connections=app.config['DB_MAX_CONNECTIONS']
        )
        logger.info("Database pool initialized")
        
        # Initialize performance monitor
        perf_monitor = init_performance_monitor()
        
        # Add alert callback for critical issues
        def alert_callback(alert):
            logger.critical(f"ALERT: {alert['message']} - {alert.get('details', '')}")
            # In production, this would send to monitoring systems
        
        perf_monitor.add_alert_callback(alert_callback)
        logger.info("Performance monitor initialized")
        
        # Initialize OpenAI
        if app.config['OPENAI_API_KEY']:
            openai.api_key = app.config['OPENAI_API_KEY']
            logger.info("OpenAI client initialized")
        else:
            logger.warning("OpenAI API key not found")
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize enhanced components: {e}")
        return False

# Compression middleware
def compress_response(response):
    """Compress response if appropriate"""
    if (response.status_code == 200 and 
        response.content_length and response.content_length > 1024 and
        'gzip' in request.headers.get('Accept-Encoding', '')):
        
        try:
            compressed_data = gzip.compress(response.get_data(), compresslevel=app.config['COMPRESSION_LEVEL'])
            if len(compressed_data) < response.content_length:
                response.set_data(compressed_data)
                response.headers['Content-Encoding'] = 'gzip'
                response.headers['Content-Length'] = len(compressed_data)
        except Exception as e:
            logger.warning(f"Compression failed: {e}")
    
    return response

# Performance tracking middleware
@app.before_request
def before_request():
    """Track request start time and user activity"""
    g.start_time = time.time()
    
    # Track user activity for analytics
    perf_monitor = get_performance_monitor()
    if perf_monitor:
        user_id = request.headers.get('X-User-ID', 'anonymous')
        session_id = request.headers.get('X-Session-ID', 'unknown')
        user_role = request.headers.get('X-User-Role')
        
        perf_monitor.track_user_event(
            user_id=user_id,
            event_type='api_request',
            event_data={
                'endpoint': request.endpoint,
                'method': request.method,
                'path': request.path,
                'user_agent': request.headers.get('User-Agent', '')
            },
            session_id=session_id,
            user_role=user_role
        )

@app.after_request
def after_request(response):
    """Track request completion and apply compression"""
    # Track performance
    if hasattr(g, 'start_time'):
        duration = time.time() - g.start_time
        success = 200 <= response.status_code < 400
        
        perf_monitor = get_performance_monitor()
        if perf_monitor:
            perf_monitor.record_request(duration, success)
    
    # Apply compression
    response = compress_response(response)
    
    # Add performance headers
    response.headers['X-Response-Time'] = f"{getattr(g, 'start_time', 0) and (time.time() - g.start_time):.3f}"
    response.headers['X-Cache-Status'] = getattr(g, 'cache_status', 'miss')
    
    # Security headers
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    
    return response

# Cache-aware database query function
def execute_optimized_query(query: str, params: tuple = (), cache_ttl: int = None) -> List[Dict]:
    """Execute database query with caching and optimization"""
    cache_manager = get_cache_manager()
    db_pool = get_database_pool()
    
    if not db_pool:
        raise Exception("Database pool not initialized")
    
    try:
        results = db_pool.execute_query(query, params, cache_manager)
        g.cache_status = 'hit' if cache_manager and cache_manager.get('query', query + str(params)) else 'miss'
        return results
    except Exception as e:
        logger.error(f"Query execution failed: {query[:100]}... - {str(e)}")
        raise

# Enhanced route handlers
@app.route('/')
def index():
    """Serve the enhanced main interface"""
    return render_template('index.html')

@app.route('/api/health')
@track_performance
def health_check():
    """Comprehensive health check endpoint"""
    perf_monitor = get_performance_monitor()
    cache_manager = get_cache_manager()
    db_pool = get_database_pool()
    
    health_data = {
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'version': '2.0.0',
        'components': {}
    }
    
    # Check database
    try:
        test_result = execute_optimized_query("SELECT 1", ())
        health_data['components']['database'] = {
            'status': 'healthy',
            'response_time': getattr(g, 'start_time', 0) and (time.time() - g.start_time)
        }
    except Exception as e:
        health_data['components']['database'] = {
            'status': 'unhealthy',
            'error': str(e)
        }
        health_data['status'] = 'degraded'
    
    # Check cache
    if cache_manager:
        try:
            cache_stats = cache_manager.get_stats()
            health_data['components']['cache'] = {
                'status': 'healthy' if cache_stats['redis_available'] else 'degraded',
                'hit_rate': cache_stats['hit_rate'],
                'total_operations': cache_stats['total_operations']
            }
        except Exception as e:
            health_data['components']['cache'] = {
                'status': 'unhealthy',
                'error': str(e)
            }
    
    # Check performance monitor
    if perf_monitor:
        try:
            current_health = perf_monitor.last_health_check
            if current_health:
                health_data['components']['system'] = {
                    'status': current_health.status,
                    'cpu_usage': current_health.cpu_usage,
                    'memory_usage': current_health.memory_usage,
                    'response_time': current_health.response_time
                }
        except Exception as e:
            health_data['components']['system'] = {
                'status': 'unknown',
                'error': str(e)
            }
    
    return jsonify(health_data)

@app.route('/api/query', methods=['POST'])
@track_performance
def process_query():
    """Enhanced query processing with caching and optimization"""
    try:
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({'error': 'Query is required'}), 400
        
        user_query = data['query'].strip()
        language = data.get('language', 'en')
        user_role = request.headers.get('X-User-Role', 'guest')
        
        if not user_query:
            return jsonify({'error': 'Query cannot be empty'}), 400
        
        logger.info(f"Processing query: {user_query[:100]}... (role: {user_role})")
        
        # Check for cached response first
        cache_manager = get_cache_manager()
        query_cache = get_query_cache()
        
        cache_key = f"{user_query}:{language}:{user_role}"
        if cache_manager:
            cached_response = cache_manager.get('query_response', cache_key)
            if cached_response:
                g.cache_status = 'hit'
                return jsonify(cached_response)
        
        # Process with OpenAI
        start_time = time.time()
        
        # Generate SQL query using AI
        sql_query = generate_sql_query(user_query, language)
        
        # Execute optimized database query
        results = execute_optimized_query(sql_query)
        
        # Generate natural language response
        response_text = generate_response(user_query, results, language)
        
        processing_time = time.time() - start_time
        
        response_data = {
            'query': user_query,
            'response': response_text,
            'results_count': len(results),
            'processing_time': round(processing_time, 3),
            'language': language,
            'confidence': 0.9,  # Placeholder
            'cached': False
        }
        
        # Cache the response
        if cache_manager:
            cache_ttl = 300 if 'flight' in user_query.lower() else 1800  # 5 min for flights, 30 min others
            cache_manager.set('query_response', cache_key, response_data, cache_ttl)
        
        # Track user behavior
        perf_monitor = get_performance_monitor()
        if perf_monitor:
            user_id = request.headers.get('X-User-ID', 'anonymous')
            session_id = request.headers.get('X-Session-ID', 'unknown')
            
            perf_monitor.track_user_event(
                user_id=user_id,
                event_type='voice_query',
                event_data={
                    'query': user_query,
                    'language': language,
                    'processing_time': processing_time,
                    'results_count': len(results)
                },
                session_id=session_id,
                user_role=user_role
            )
        
        return jsonify(response_data)
        
    except Exception as e:
        logger.error(f"Query processing failed: {str(e)}")
        return jsonify({
            'error': 'Failed to process query',
            'message': str(e)
        }), 500

@app.route('/api/analytics/performance')
@track_performance
def get_performance_analytics():
    """Get comprehensive performance analytics"""
    try:
        hours = request.args.get('hours', 24, type=int)
        
        perf_monitor = get_performance_monitor()
        cache_manager = get_cache_manager()
        db_pool = get_database_pool()
        
        analytics = {}
        
        # Performance summary
        if perf_monitor:
            analytics['performance'] = perf_monitor.get_performance_summary(hours)
            analytics['maintenance_predictions'] = perf_monitor.predict_maintenance_needs()
        
        # Cache statistics
        if cache_manager:
            analytics['cache'] = cache_manager.get_stats()
        
        # Database performance
        if db_pool:
            analytics['database'] = db_pool.get_performance_stats()
            analytics['slow_queries'] = db_pool.get_slow_queries(10)
        
        return jsonify(analytics)
        
    except Exception as e:
        logger.error(f"Analytics retrieval failed: {str(e)}")
        return jsonify({'error': 'Failed to retrieve analytics'}), 500

@app.route('/api/analytics/users')
@track_performance
def get_user_analytics():
    """Get user behavior analytics"""
    try:
        hours = request.args.get('hours', 24, type=int)
        user_id = request.args.get('user_id')
        
        perf_monitor = get_performance_monitor()
        if not perf_monitor:
            return jsonify({'error': 'Performance monitor not available'}), 503
        
        user_analytics = perf_monitor.get_user_behavior_analysis(user_id, hours)
        
        return jsonify(user_analytics)
        
    except Exception as e:
        logger.error(f"User analytics retrieval failed: {str(e)}")
        return jsonify({'error': 'Failed to retrieve user analytics'}), 500

@app.route('/api/cache/stats')
@track_performance
def get_cache_stats():
    """Get detailed cache statistics"""
    cache_manager = get_cache_manager()
    if not cache_manager:
        return jsonify({'error': 'Cache manager not available'}), 503
    
    return jsonify(cache_manager.get_stats())

@app.route('/api/cache/clear', methods=['POST'])
@track_performance
def clear_cache():
    """Clear cache (admin operation)"""
    try:
        cache_manager = get_cache_manager()
        if not cache_manager:
            return jsonify({'error': 'Cache manager not available'}), 503
        
        pattern = request.json.get('pattern', 'jarvis:*') if request.json else 'jarvis:*'
        
        if pattern == 'all':
            success = cache_manager.flush_all()
        else:
            deleted_count = cache_manager.invalidate_pattern(pattern)
            success = deleted_count >= 0
        
        return jsonify({
            'success': success,
            'message': 'Cache cleared successfully' if success else 'Failed to clear cache'
        })
        
    except Exception as e:
        logger.error(f"Cache clear failed: {str(e)}")
        return jsonify({'error': 'Failed to clear cache'}), 500

# Helper functions (simplified versions)
def generate_sql_query(user_query: str, language: str = 'en') -> str:
    """Generate SQL query from natural language (placeholder)"""
    # This would use OpenAI in production
    query_lower = user_query.lower()
    
    if 'flight' in query_lower and 'status' in query_lower:
        return "SELECT * FROM flights WHERE flight_number LIKE '%UA%' LIMIT 10"
    elif 'equipment' in query_lower:
        return "SELECT * FROM equipment WHERE equipment_type = 'pushback_tractor' LIMIT 10"
    elif 'staff' in query_lower:
        return "SELECT * FROM staff WHERE role = 'ramp_worker' LIMIT 10"
    else:
        return "SELECT 'No specific query pattern matched' as message"

def generate_response(user_query: str, results: List[Dict], language: str = 'en') -> str:
    """Generate natural language response (placeholder)"""
    if not results:
        return "I couldn't find any information for your query."
    
    if len(results) == 1 and 'message' in results[0]:
        return results[0]['message']
    
    return f"I found {len(results)} results for your query about airport operations."

# Initialize components on startup
if not init_enhanced_components():
    logger.error("Failed to initialize enhanced components")
    exit(1)

if __name__ == '__main__':
    logger.info("Starting JARVIS Enhanced Application")
    app.run(debug=False, host='0.0.0.0', port=5001, threaded=True)
