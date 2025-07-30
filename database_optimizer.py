"""
JARVIS Database Optimizer - Advanced database performance optimization
Includes connection pooling, query optimization, indexing, and performance monitoring
"""

import sqlite3
import threading
import time
import logging
import queue
from typing import Any, Dict, List, Optional, Tuple, Union
from datetime import datetime, timedelta
from contextlib import contextmanager
from dataclasses import dataclass
import json
import hashlib
from concurrent.futures import ThreadPoolExecutor

@dataclass
class QueryPerformance:
    """Query performance metrics"""
    query_hash: str
    query: str
    execution_time: float
    timestamp: datetime
    result_count: int
    cache_hit: bool = False

class DatabaseConnectionPool:
    """Advanced SQLite connection pool with performance monitoring"""
    
    def __init__(self, database_path: str, pool_size: int = 20, 
                 max_connections: int = 50, timeout: float = 30.0):
        self.database_path = database_path
        self.pool_size = pool_size
        self.max_connections = max_connections
        self.timeout = timeout
        self.logger = logging.getLogger(__name__)
        
        # Connection pool
        self._pool = queue.Queue(maxsize=max_connections)
        self._pool_lock = threading.Lock()
        self._active_connections = 0
        self._total_connections = 0
        
        # Performance monitoring
        self.query_stats = {}
        self.performance_history = []
        self.slow_query_threshold = 1.0  # seconds
        
        # Initialize pool
        self._initialize_pool()
        
        # Create optimized indexes
        self._create_indexes()
    
    def _initialize_pool(self):
        """Initialize the connection pool"""
        try:
            for _ in range(self.pool_size):
                conn = self._create_connection()
                if conn:
                    self._pool.put(conn)
                    self._total_connections += 1
        except Exception as e:
            self.logger.error(f"Failed to initialize connection pool: {e}")
    
    def _create_connection(self) -> Optional[sqlite3.Connection]:
        """Create optimized SQLite connection"""
        try:
            conn = sqlite3.connect(
                self.database_path,
                timeout=self.timeout,
                check_same_thread=False,
                isolation_level=None  # Autocommit mode
            )
            
            # SQLite performance optimizations
            conn.execute("PRAGMA journal_mode = WAL")  # Write-Ahead Logging
            conn.execute("PRAGMA synchronous = NORMAL")  # Balanced safety/performance
            conn.execute("PRAGMA cache_size = -64000")  # 64MB cache
            conn.execute("PRAGMA temp_store = MEMORY")  # Temp tables in memory
            conn.execute("PRAGMA mmap_size = 268435456")  # 256MB memory map
            conn.execute("PRAGMA optimize")  # Query planner optimization
            
            # Enable foreign keys
            conn.execute("PRAGMA foreign_keys = ON")
            
            conn.row_factory = sqlite3.Row  # Dict-like row access
            
            return conn
            
        except Exception as e:
            self.logger.error(f"Failed to create database connection: {e}")
            return None
    
    def _create_indexes(self):
        """Create optimized indexes for better query performance"""
        indexes = [
            # Flight data indexes
            "CREATE INDEX IF NOT EXISTS idx_flights_flight_number ON flights(flight_number)",
            "CREATE INDEX IF NOT EXISTS idx_flights_departure_time ON flights(departure_time)",
            "CREATE INDEX IF NOT EXISTS idx_flights_arrival_time ON flights(arrival_time)",
            "CREATE INDEX IF NOT EXISTS idx_flights_status ON flights(status)",
            "CREATE INDEX IF NOT EXISTS idx_flights_gate ON flights(gate)",
            
            # Equipment indexes
            "CREATE INDEX IF NOT EXISTS idx_equipment_equipment_id ON equipment(equipment_id)",
            "CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(equipment_type)",
            "CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status)",
            "CREATE INDEX IF NOT EXISTS idx_equipment_location ON equipment(current_location)",
            
            # Staff indexes
            "CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id)",
            "CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role)",
            "CREATE INDEX IF NOT EXISTS idx_staff_shift ON staff(shift)",
            "CREATE INDEX IF NOT EXISTS idx_staff_department ON staff(department)",
            
            # Composite indexes for common queries
            "CREATE INDEX IF NOT EXISTS idx_flights_composite ON flights(flight_number, departure_time, status)",
            "CREATE INDEX IF NOT EXISTS idx_equipment_composite ON equipment(equipment_type, status, current_location)",
            "CREATE INDEX IF NOT EXISTS idx_staff_composite ON staff(role, shift, department)",
        ]
        
        with self.get_connection() as conn:
            for index_sql in indexes:
                try:
                    conn.execute(index_sql)
                except Exception as e:
                    self.logger.warning(f"Index creation warning: {e}")
    
    @contextmanager
    def get_connection(self):
        """Get connection from pool with automatic return"""
        conn = None
        try:
            # Try to get connection from pool
            try:
                conn = self._pool.get(timeout=self.timeout)
                self._active_connections += 1
            except queue.Empty:
                # Pool exhausted, create new connection if under limit
                with self._pool_lock:
                    if self._total_connections < self.max_connections:
                        conn = self._create_connection()
                        if conn:
                            self._total_connections += 1
                            self._active_connections += 1
                        else:
                            raise Exception("Failed to create new connection")
                    else:
                        raise Exception("Connection pool exhausted")
            
            yield conn
            
        finally:
            if conn:
                try:
                    # Return connection to pool
                    self._pool.put(conn, timeout=1.0)
                    self._active_connections -= 1
                except queue.Full:
                    # Pool is full, close connection
                    conn.close()
                    with self._pool_lock:
                        self._total_connections -= 1
                        self._active_connections -= 1
                except Exception as e:
                    self.logger.error(f"Error returning connection to pool: {e}")
                    conn.close()
                    with self._pool_lock:
                        self._total_connections -= 1
                        self._active_connections -= 1
    
    def execute_query(self, query: str, params: Tuple = (), 
                     cache_manager=None) -> List[Dict]:
        """Execute query with performance monitoring and caching"""
        start_time = time.time()
        query_hash = hashlib.md5(f"{query}{params}".encode()).hexdigest()
        
        # Check cache first
        if cache_manager:
            cached_result = cache_manager.get('query', query_hash)
            if cached_result is not None:
                # Record cache hit
                execution_time = time.time() - start_time
                self._record_query_performance(
                    query_hash, query, execution_time, len(cached_result), True
                )
                return cached_result
        
        try:
            with self.get_connection() as conn:
                cursor = conn.execute(query, params)
                results = [dict(row) for row in cursor.fetchall()]
                
                execution_time = time.time() - start_time
                
                # Record performance
                self._record_query_performance(
                    query_hash, query, execution_time, len(results), False
                )
                
                # Cache result if cache manager available
                if cache_manager and results:
                    # Determine TTL based on query type
                    ttl = self._determine_cache_ttl(query)
                    cache_manager.set('query', query_hash, results, ttl)
                
                return results
                
        except Exception as e:
            execution_time = time.time() - start_time
            self.logger.error(f"Query execution failed: {e}")
            self.logger.error(f"Query: {query}")
            self.logger.error(f"Params: {params}")
            
            # Record failed query
            self._record_query_performance(
                query_hash, query, execution_time, 0, False
            )
            
            raise
    
    def _determine_cache_ttl(self, query: str) -> int:
        """Determine appropriate cache TTL based on query type"""
        query_lower = query.lower()
        
        if 'flight' in query_lower and ('status' in query_lower or 'departure' in query_lower):
            return 300  # 5 minutes for real-time flight data
        elif 'equipment' in query_lower and 'location' in query_lower:
            return 600  # 10 minutes for equipment location
        elif 'staff' in query_lower:
            return 1800  # 30 minutes for staff data
        elif 'schedule' in query_lower:
            return 3600  # 1 hour for schedule data
        else:
            return 1800  # 30 minutes default
    
    def _record_query_performance(self, query_hash: str, query: str, 
                                 execution_time: float, result_count: int, 
                                 cache_hit: bool):
        """Record query performance metrics"""
        performance = QueryPerformance(
            query_hash=query_hash,
            query=query,
            execution_time=execution_time,
            timestamp=datetime.now(),
            result_count=result_count,
            cache_hit=cache_hit
        )
        
        # Update statistics
        if query_hash not in self.query_stats:
            self.query_stats[query_hash] = {
                'query': query,
                'total_executions': 0,
                'total_time': 0.0,
                'average_time': 0.0,
                'min_time': float('inf'),
                'max_time': 0.0,
                'cache_hits': 0,
                'total_results': 0
            }
        
        stats = self.query_stats[query_hash]
        stats['total_executions'] += 1
        stats['total_time'] += execution_time
        stats['average_time'] = stats['total_time'] / stats['total_executions']
        stats['min_time'] = min(stats['min_time'], execution_time)
        stats['max_time'] = max(stats['max_time'], execution_time)
        stats['total_results'] += result_count
        
        if cache_hit:
            stats['cache_hits'] += 1
        
        # Keep performance history (limit to last 1000 entries)
        self.performance_history.append(performance)
        if len(self.performance_history) > 1000:
            self.performance_history.pop(0)
        
        # Log slow queries
        if execution_time > self.slow_query_threshold and not cache_hit:
            self.logger.warning(f"Slow query detected ({execution_time:.2f}s): {query[:100]}...")
    
    def get_performance_stats(self) -> Dict:
        """Get comprehensive performance statistics"""
        total_queries = len(self.performance_history)
        if total_queries == 0:
            return {}
        
        recent_queries = [p for p in self.performance_history 
                         if (datetime.now() - p.timestamp).seconds < 3600]  # Last hour
        
        cache_hits = sum(1 for p in recent_queries if p.cache_hit)
        total_time = sum(p.execution_time for p in recent_queries if not p.cache_hit)
        db_queries = len([p for p in recent_queries if not p.cache_hit])
        
        slow_queries = [p for p in recent_queries 
                       if p.execution_time > self.slow_query_threshold and not p.cache_hit]
        
        return {
            'total_queries_all_time': total_queries,
            'queries_last_hour': len(recent_queries),
            'cache_hit_rate': (cache_hits / len(recent_queries) * 100) if recent_queries else 0,
            'average_db_query_time': (total_time / db_queries) if db_queries > 0 else 0,
            'slow_queries_last_hour': len(slow_queries),
            'active_connections': self._active_connections,
            'total_connections': self._total_connections,
            'pool_utilization': (self._active_connections / self._total_connections * 100) if self._total_connections > 0 else 0
        }
    
    def get_slow_queries(self, limit: int = 10) -> List[Dict]:
        """Get slowest queries for optimization"""
        sorted_stats = sorted(
            self.query_stats.items(),
            key=lambda x: x[1]['average_time'],
            reverse=True
        )
        
        return [
            {
                'query_hash': query_hash,
                'query': stats['query'][:200] + '...' if len(stats['query']) > 200 else stats['query'],
                'average_time': stats['average_time'],
                'total_executions': stats['total_executions'],
                'cache_hit_rate': (stats['cache_hits'] / stats['total_executions'] * 100) if stats['total_executions'] > 0 else 0
            }
            for query_hash, stats in sorted_stats[:limit]
        ]
    
    def optimize_database(self):
        """Run database optimization commands"""
        optimization_commands = [
            "PRAGMA optimize",
            "PRAGMA vacuum",
            "ANALYZE"
        ]
        
        try:
            with self.get_connection() as conn:
                for command in optimization_commands:
                    conn.execute(command)
            self.logger.info("Database optimization completed")
        except Exception as e:
            self.logger.error(f"Database optimization failed: {e}")
    
    def close_all_connections(self):
        """Close all connections in the pool"""
        try:
            while not self._pool.empty():
                conn = self._pool.get_nowait()
                conn.close()
            self._total_connections = 0
            self._active_connections = 0
        except Exception as e:
            self.logger.error(f"Error closing connections: {e}")

class QueryOptimizer:
    """Advanced query optimization and analysis"""
    
    def __init__(self, db_pool: DatabaseConnectionPool):
        self.db_pool = db_pool
        self.logger = logging.getLogger(__name__)
        
        # Common query patterns and their optimizations
        self.optimization_patterns = {
            'flight_status_by_number': {
                'pattern': r'SELECT.*FROM.*flights.*WHERE.*flight_number.*=.*',
                'optimized_query': '''
                    SELECT flight_number, status, departure_time, arrival_time, gate, terminal
                    FROM flights 
                    WHERE flight_number = ? 
                    AND date(departure_time) = date('now')
                    LIMIT 1
                '''
            },
            'equipment_by_type_location': {
                'pattern': r'SELECT.*FROM.*equipment.*WHERE.*equipment_type.*AND.*location.*',
                'optimized_query': '''
                    SELECT equipment_id, equipment_type, status, current_location, assigned_flight
                    FROM equipment 
                    WHERE equipment_type = ? AND current_location = ?
                    AND status IN ('available', 'in_use')
                '''
            },
            'staff_by_role_shift': {
                'pattern': r'SELECT.*FROM.*staff.*WHERE.*role.*AND.*shift.*',
                'optimized_query': '''
                    SELECT employee_id, name, role, department, contact_info
                    FROM staff 
                    WHERE role = ? AND shift = ?
                    AND status = 'active'
                '''
            }
        }
    
    def analyze_query_plan(self, query: str, params: Tuple = ()) -> Dict:
        """Analyze query execution plan"""
        try:
            explain_query = f"EXPLAIN QUERY PLAN {query}"
            with self.db_pool.get_connection() as conn:
                cursor = conn.execute(explain_query, params)
                plan = cursor.fetchall()
                
                return {
                    'query': query,
                    'plan': [dict(row) for row in plan],
                    'analysis': self._analyze_plan_performance(plan)
                }
        except Exception as e:
            self.logger.error(f"Query plan analysis failed: {e}")
            return {'error': str(e)}
    
    def _analyze_plan_performance(self, plan: List) -> Dict:
        """Analyze query plan for performance issues"""
        analysis = {
            'issues': [],
            'recommendations': [],
            'estimated_performance': 'good'
        }
        
        for step in plan:
            detail = step[3] if len(step) > 3 else str(step)
            
            if 'SCAN TABLE' in detail and 'USING INDEX' not in detail:
                analysis['issues'].append('Full table scan detected')
                analysis['recommendations'].append('Consider adding appropriate indexes')
                analysis['estimated_performance'] = 'poor'
            
            if 'TEMP B-TREE' in detail:
                analysis['issues'].append('Temporary B-tree created')
                analysis['recommendations'].append('Consider optimizing ORDER BY or GROUP BY clauses')
                if analysis['estimated_performance'] == 'good':
                    analysis['estimated_performance'] = 'fair'
        
        return analysis
    
    def suggest_indexes(self, query: str) -> List[str]:
        """Suggest indexes based on query analysis"""
        suggestions = []
        query_lower = query.lower()
        
        # Simple heuristics for index suggestions
        if 'where' in query_lower:
            # Extract WHERE conditions
            where_part = query_lower.split('where')[1].split('order by')[0].split('group by')[0]
            
            if 'flight_number' in where_part:
                suggestions.append("CREATE INDEX IF NOT EXISTS idx_flights_flight_number ON flights(flight_number)")
            
            if 'equipment_type' in where_part:
                suggestions.append("CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment(equipment_type)")
            
            if 'employee_id' in where_part:
                suggestions.append("CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id)")
        
        return suggestions

# Global database pool instance
db_pool = None

def init_database_pool(database_path: str, pool_size: int = 20, 
                      max_connections: int = 50, timeout: float = 30.0) -> DatabaseConnectionPool:
    """Initialize global database pool"""
    global db_pool
    db_pool = DatabaseConnectionPool(database_path, pool_size, max_connections, timeout)
    return db_pool

def get_database_pool() -> Optional[DatabaseConnectionPool]:
    """Get global database pool instance"""
    return db_pool

# Convenience functions for common operations
def execute_query_cached(query: str, params: Tuple = (), 
                        cache_manager=None) -> List[Dict]:
    """Execute query with caching through global pool"""
    if db_pool:
        return db_pool.execute_query(query, params, cache_manager)
    else:
        raise Exception("Database pool not initialized")

def get_db_performance_stats() -> Dict:
    """Get database performance statistics"""
    if db_pool:
        return db_pool.get_performance_stats()
    else:
        return {}
