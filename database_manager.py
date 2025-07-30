#!/usr/bin/env python3
"""
Enhanced Database Management System for Airport Operations Voice Assistant

This module provides advanced database capabilities including:
- Multi-source database integration (SQLite, PostgreSQL, MySQL)
- Intelligent caching with TTL and invalidation
- Real-time synchronization across instances
- Connection pooling and optimization
- Performance monitoring and analytics
"""

import sqlite3
import psycopg2
import mysql.connector
import redis
import json
import time
import threading
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
from enum import Enum
import hashlib
import queue
import concurrent.futures
from contextlib import contextmanager

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class DatabaseType(Enum):
    SQLITE = "sqlite"
    POSTGRESQL = "postgresql"
    MYSQL = "mysql"

@dataclass
class DatabaseConfig:
    """Database configuration"""
    db_type: DatabaseType
    host: str = None
    port: int = None
    database: str = None
    username: str = None
    password: str = None
    pool_size: int = 5
    max_overflow: int = 10
    pool_timeout: int = 30

@dataclass
class CacheEntry:
    """Cache entry with metadata"""
    data: Any
    created_at: float
    ttl: int
    access_count: int = 0
    last_accessed: float = 0

class DatabaseManager:
    """Advanced database manager with multi-source support"""
    
    def __init__(self, primary_config: DatabaseConfig, cache_config: dict = None):
        self.primary_config = primary_config
        self.secondary_configs = {}
        self.connection_pools = {}
        self.cache_manager = CacheManager(cache_config or {})
        self.sync_manager = RealTimeSyncManager()
        self.performance_monitor = DatabaseMonitor()
        self.schema_cache = {}
        self.query_cache = {}
        self._lock = threading.RLock()
        
        # Initialize primary database
        self._initialize_database(primary_config, is_primary=True)
        
    def add_secondary_database(self, name: str, config: DatabaseConfig):
        """Add secondary database source"""
        self.secondary_configs[name] = config
        self._initialize_database(config, name)
        logger.info(f"Added secondary database: {name}")
    
    def _initialize_database(self, config: DatabaseConfig, name: str = "primary", is_primary: bool = False):
        """Initialize database connection pool"""
        try:
            if config.db_type == DatabaseType.SQLITE:
                pool = SQLiteConnectionPool(config)
            elif config.db_type == DatabaseType.POSTGRESQL:
                pool = PostgreSQLConnectionPool(config)
            elif config.db_type == DatabaseType.MYSQL:
                pool = MySQLConnectionPool(config)
            else:
                raise ValueError(f"Unsupported database type: {config.db_type}")
            
            self.connection_pools[name] = pool
            
            if is_primary:
                self.primary_pool = pool
                
        except Exception as e:
            logger.error(f"Failed to initialize database {name}: {e}")
            raise
    
    @contextmanager
    def get_connection(self, database_name: str = "primary"):
        """Get database connection with automatic cleanup"""
        pool = self.connection_pools.get(database_name)
        if not pool:
            raise ValueError(f"Database {database_name} not configured")
        
        conn = None
        try:
            conn = pool.get_connection()
            yield conn
        finally:
            if conn:
                pool.return_connection(conn)
    
    def execute_query(self, query: str, params: tuple = None, database_name: str = "primary", cache_ttl: int = 300) -> List[Dict]:
        """Execute query with caching and performance monitoring"""
        start_time = time.time()
        
        # Generate cache key
        cache_key = self._generate_cache_key(query, params, database_name)
        
        # Try cache first
        cached_result = self.cache_manager.get(cache_key)
        if cached_result is not None:
            self.performance_monitor.record_cache_hit(time.time() - start_time)
            return cached_result
        
        # Execute query
        try:
            with self.get_connection(database_name) as conn:
                cursor = conn.cursor()
                
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                
                # Fetch results and convert to dict format
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                rows = cursor.fetchall()
                results = [dict(zip(columns, row)) for row in rows]
                
                # Cache results
                if cache_ttl > 0:
                    self.cache_manager.set(cache_key, results, cache_ttl)
                
                # Record performance metrics
                latency = time.time() - start_time
                self.performance_monitor.record_query(query, latency, len(results), database_name)
                
                return results
                
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            self.performance_monitor.record_error(query, str(e), database_name)
            raise
    
    def get_schema(self, database_name: str = "primary") -> Dict[str, List[str]]:
        """Get database schema with caching"""
        cache_key = f"schema_{database_name}"
        cached_schema = self.schema_cache.get(cache_key)
        
        if cached_schema and (time.time() - cached_schema['timestamp']) < 3600:  # 1 hour cache
            return cached_schema['schema']
        
        try:
            with self.get_connection(database_name) as conn:
                pool = self.connection_pools[database_name]
                schema = pool.get_schema(conn)
                
                # Cache schema
                self.schema_cache[cache_key] = {
                    'schema': schema,
                    'timestamp': time.time()
                }
                
                return schema
                
        except Exception as e:
            logger.error(f"Schema retrieval failed for {database_name}: {e}")
            return {}
    
    def invalidate_cache(self, pattern: str = None):
        """Invalidate cache entries"""
        self.cache_manager.invalidate(pattern)
        
    def _generate_cache_key(self, query: str, params: tuple, database_name: str) -> str:
        """Generate cache key from query and parameters"""
        key_data = f"{database_name}_{query}_{params}"
        return hashlib.md5(key_data.encode()).hexdigest()
    
    def get_performance_metrics(self) -> Dict:
        """Get performance metrics"""
        return self.performance_monitor.get_metrics()

class CacheManager:
    """Intelligent caching system with TTL and invalidation"""
    
    def __init__(self, config: dict):
        self.use_redis = config.get('use_redis', False)
        self.redis_host = config.get('redis_host', 'localhost')
        self.redis_port = config.get('redis_port', 6379)
        self.memory_cache = {}
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'invalidations': 0
        }
        self._lock = threading.RLock()
        
        if self.use_redis:
            try:
                self.redis_client = redis.Redis(host=self.redis_host, port=self.redis_port, decode_responses=True)
                self.redis_client.ping()
                logger.info("Redis cache initialized")
            except Exception as e:
                logger.warning(f"Redis connection failed, using memory cache: {e}")
                self.use_redis = False
    
    def get(self, key: str) -> Any:
        """Get cached value"""
        with self._lock:
            if self.use_redis:
                try:
                    cached = self.redis_client.get(key)
                    if cached:
                        self.cache_stats['hits'] += 1
                        return json.loads(cached)
                except Exception as e:
                    logger.warning(f"Redis get failed: {e}")
            
            # Fallback to memory cache
            entry = self.memory_cache.get(key)
            if entry:
                # Check TTL
                if time.time() - entry.created_at < entry.ttl:
                    entry.access_count += 1
                    entry.last_accessed = time.time()
                    self.cache_stats['hits'] += 1
                    return entry.data
                else:
                    # Expired
                    del self.memory_cache[key]
            
            self.cache_stats['misses'] += 1
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set cached value with TTL"""
        with self._lock:
            if self.use_redis:
                try:
                    self.redis_client.setex(key, ttl, json.dumps(value))
                    self.cache_stats['sets'] += 1
                    return
                except Exception as e:
                    logger.warning(f"Redis set failed: {e}")
            
            # Fallback to memory cache
            self.memory_cache[key] = CacheEntry(
                data=value,
                created_at=time.time(),
                ttl=ttl
            )
            self.cache_stats['sets'] += 1
            
            # Cleanup expired entries periodically
            if len(self.memory_cache) % 100 == 0:
                self._cleanup_expired()
    
    def invalidate(self, pattern: str = None):
        """Invalidate cache entries"""
        with self._lock:
            if pattern is None:
                # Clear all
                if self.use_redis:
                    try:
                        self.redis_client.flushdb()
                    except Exception as e:
                        logger.warning(f"Redis flush failed: {e}")
                self.memory_cache.clear()
            else:
                # Pattern-based invalidation
                if self.use_redis:
                    try:
                        keys = self.redis_client.keys(pattern)
                        if keys:
                            self.redis_client.delete(*keys)
                    except Exception as e:
                        logger.warning(f"Redis pattern delete failed: {e}")
                
                # Memory cache pattern deletion
                keys_to_delete = [k for k in self.memory_cache.keys() if pattern in k]
                for key in keys_to_delete:
                    del self.memory_cache[key]
            
            self.cache_stats['invalidations'] += 1
    
    def _cleanup_expired(self):
        """Remove expired entries from memory cache"""
        current_time = time.time()
        expired_keys = []
        
        for key, entry in self.memory_cache.items():
            if current_time - entry.created_at > entry.ttl:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.memory_cache[key]
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        with self._lock:
            total_requests = self.cache_stats['hits'] + self.cache_stats['misses']
            hit_rate = self.cache_stats['hits'] / total_requests if total_requests > 0 else 0
            
            return {
                **self.cache_stats,
                'hit_rate': hit_rate,
                'memory_entries': len(self.memory_cache),
                'using_redis': self.use_redis
            }

class RealTimeSyncManager:
    """Real-time synchronization manager"""
    
    def __init__(self):
        self.sync_queue = queue.Queue()
        self.subscribers = {}
        self.running = False
        self.sync_thread = None
        self._lock = threading.Lock()
    
    def start(self):
        """Start real-time sync"""
        if not self.running:
            self.running = True
            self.sync_thread = threading.Thread(target=self._sync_worker)
            self.sync_thread.daemon = True
            self.sync_thread.start()
            logger.info("Real-time sync started")
    
    def stop(self):
        """Stop real-time sync"""
        self.running = False
        if self.sync_thread:
            self.sync_thread.join()
        logger.info("Real-time sync stopped")
    
    def notify_change(self, table: str, operation: str, data: Dict):
        """Notify about data change"""
        change_event = {
            'table': table,
            'operation': operation,
            'data': data,
            'timestamp': time.time()
        }
        self.sync_queue.put(change_event)
    
    def subscribe(self, callback, tables: List[str] = None):
        """Subscribe to data changes"""
        with self._lock:
            subscriber_id = id(callback)
            self.subscribers[subscriber_id] = {
                'callback': callback,
                'tables': tables or []
            }
            return subscriber_id
    
    def unsubscribe(self, subscriber_id: int):
        """Unsubscribe from data changes"""
        with self._lock:
            self.subscribers.pop(subscriber_id, None)
    
    def _sync_worker(self):
        """Worker thread for processing sync events"""
        while self.running:
            try:
                # Get sync event with timeout
                event = self.sync_queue.get(timeout=1.0)
                
                # Notify subscribers
                with self._lock:
                    for subscriber in self.subscribers.values():
                        tables = subscriber['tables']
                        if not tables or event['table'] in tables:
                            try:
                                subscriber['callback'](event)
                            except Exception as e:
                                logger.error(f"Subscriber callback failed: {e}")
                
                self.sync_queue.task_done()
                
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Sync worker error: {e}")

class DatabaseMonitor:
    """Database performance monitoring"""
    
    def __init__(self):
        self.metrics = {
            'queries': [],
            'cache_hits': 0,
            'cache_misses': 0,
            'errors': [],
            'connections_active': 0,
            'avg_latency': 0.0,
            'total_queries': 0
        }
        self._lock = threading.Lock()
    
    def record_query(self, query: str, latency: float, result_count: int, database: str):
        """Record query metrics"""
        with self._lock:
            query_metric = {
                'query': query[:100],  # Truncate for storage
                'latency': latency,
                'result_count': result_count,
                'database': database,
                'timestamp': time.time()
            }
            
            self.metrics['queries'].append(query_metric)
            self.metrics['total_queries'] += 1
            
            # Keep only recent queries (last 1000)
            if len(self.metrics['queries']) > 1000:
                self.metrics['queries'] = self.metrics['queries'][-1000:]
            
            # Update average latency
            recent_queries = self.metrics['queries'][-100:]  # Last 100 queries
            self.metrics['avg_latency'] = sum(q['latency'] for q in recent_queries) / len(recent_queries)
    
    def record_cache_hit(self, latency: float):
        """Record cache hit"""
        with self._lock:
            self.metrics['cache_hits'] += 1
    
    def record_cache_miss(self):
        """Record cache miss"""
        with self._lock:
            self.metrics['cache_misses'] += 1
    
    def record_error(self, query: str, error: str, database: str):
        """Record query error"""
        with self._lock:
            error_metric = {
                'query': query[:100],
                'error': error,
                'database': database,
                'timestamp': time.time()
            }
            
            self.metrics['errors'].append(error_metric)
            
            # Keep only recent errors (last 100)
            if len(self.metrics['errors']) > 100:
                self.metrics['errors'] = self.metrics['errors'][-100:]
    
    def get_metrics(self) -> Dict:
        """Get performance metrics"""
        with self._lock:
            total_cache_requests = self.metrics['cache_hits'] + self.metrics['cache_misses']
            cache_hit_rate = self.metrics['cache_hits'] / total_cache_requests if total_cache_requests > 0 else 0
            
            return {
                'avg_latency': self.metrics['avg_latency'],
                'total_queries': self.metrics['total_queries'],
                'cache_hit_rate': cache_hit_rate,
                'recent_errors': len([e for e in self.metrics['errors'] 
                                   if time.time() - e['timestamp'] < 3600]),  # Last hour
                'queries_per_minute': len([q for q in self.metrics['queries'] 
                                        if time.time() - q['timestamp'] < 60])  # Last minute
            }

# Connection Pool Implementations

class SQLiteConnectionPool:
    """SQLite connection pool"""
    
    def __init__(self, config: DatabaseConfig):
        self.database_path = config.database
        self.pool_size = config.pool_size
        self.connections = queue.Queue(maxsize=self.pool_size)
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        for _ in range(self.pool_size):
            conn = sqlite3.connect(self.database_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            self.connections.put(conn)
    
    def get_connection(self):
        """Get connection from pool"""
        return self.connections.get()
    
    def return_connection(self, conn):
        """Return connection to pool"""
        self.connections.put(conn)
    
    def get_schema(self, conn) -> Dict[str, List[str]]:
        """Get database schema"""
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        
        schema = {}
        for table in tables:
            table_name = table[0]
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            schema[table_name] = [col[1] for col in columns]
        
        return schema

class PostgreSQLConnectionPool:
    """PostgreSQL connection pool"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.connections = queue.Queue(maxsize=config.pool_size)
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        for _ in range(self.config.pool_size):
            conn = psycopg2.connect(
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.username,
                password=self.config.password
            )
            self.connections.put(conn)
    
    def get_connection(self):
        """Get connection from pool"""
        return self.connections.get()
    
    def return_connection(self, conn):
        """Return connection to pool"""
        self.connections.put(conn)
    
    def get_schema(self, conn) -> Dict[str, List[str]]:
        """Get database schema"""
        cursor = conn.cursor()
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public'
        """)
        tables = cursor.fetchall()
        
        schema = {}
        for table in tables:
            table_name = table[0]
            cursor.execute("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_name = %s
            """, (table_name,))
            columns = cursor.fetchall()
            schema[table_name] = [col[0] for col in columns]
        
        return schema

class MySQLConnectionPool:
    """MySQL connection pool"""
    
    def __init__(self, config: DatabaseConfig):
        self.config = config
        self.connections = queue.Queue(maxsize=config.pool_size)
        self._initialize_pool()
    
    def _initialize_pool(self):
        """Initialize connection pool"""
        for _ in range(self.config.pool_size):
            conn = mysql.connector.connect(
                host=self.config.host,
                port=self.config.port,
                database=self.config.database,
                user=self.config.username,
                password=self.config.password
            )
            self.connections.put(conn)
    
    def get_connection(self):
        """Get connection from pool"""
        return self.connections.get()
    
    def return_connection(self, conn):
        """Return connection to pool"""
        self.connections.put(conn)
    
    def get_schema(self, conn) -> Dict[str, List[str]]:
        """Get database schema"""
        cursor = conn.cursor()
        cursor.execute("SHOW TABLES")
        tables = cursor.fetchall()
        
        schema = {}
        for table in tables:
            table_name = table[0]
            cursor.execute(f"DESCRIBE {table_name}")
            columns = cursor.fetchall()
            schema[table_name] = [col[0] for col in columns]
        
        return schema
