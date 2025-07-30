"""
JARVIS Cache Manager - Multi-layer caching system with Redis
Handles intelligent caching, invalidation, and performance optimization
"""

import redis
import json
import hashlib
import time
import logging
from typing import Any, Optional, Dict, List, Tuple
from datetime import datetime, timedelta
from functools import wraps
import pickle
import gzip

class CacheManager:
    def __init__(self, redis_host='localhost', redis_port=6379, redis_db=0, 
                 redis_password=None, default_ttl=3600):
        """
        Initialize cache manager with Redis connection and configuration
        
        Args:
            redis_host: Redis server host
            redis_port: Redis server port
            redis_db: Redis database number
            redis_password: Redis password if required
            default_ttl: Default time-to-live in seconds
        """
        self.logger = logging.getLogger(__name__)
        self.default_ttl = default_ttl
        self.compression_threshold = 1024  # Compress data larger than 1KB
        
        try:
            self.redis_client = redis.Redis(
                host=redis_host,
                port=redis_port,
                db=redis_db,
                password=redis_password,
                decode_responses=False,  # We handle encoding ourselves
                socket_connect_timeout=5,
                socket_timeout=5,
                retry_on_timeout=True,
                health_check_interval=30
            )
            
            # Test connection
            self.redis_client.ping()
            self.redis_available = True
            self.logger.info(f"Redis connection established: {redis_host}:{redis_port}")
            
        except (redis.ConnectionError, redis.TimeoutError) as e:
            self.logger.warning(f"Redis connection failed: {e}. Falling back to in-memory cache.")
            self.redis_available = False
            self._memory_cache = {}
            self._cache_times = {}
        
        # Cache hit/miss statistics
        self.stats = {
            'hits': 0,
            'misses': 0,
            'sets': 0,
            'deletes': 0,
            'errors': 0
        }
        
        # Cache key prefixes for different data types
        self.key_prefixes = {
            'query': 'jarvis:query:',
            'user': 'jarvis:user:',
            'flight': 'jarvis:flight:',
            'equipment': 'jarvis:equipment:',
            'staff': 'jarvis:staff:',
            'analytics': 'jarvis:analytics:',
            'session': 'jarvis:session:'
        }
    
    def _generate_cache_key(self, prefix: str, identifier: str, params: Dict = None) -> str:
        """Generate a unique cache key based on prefix, identifier, and parameters"""
        if params:
            param_string = json.dumps(params, sort_keys=True)
            param_hash = hashlib.md5(param_string.encode()).hexdigest()
            return f"{self.key_prefixes.get(prefix, 'jarvis:')}{identifier}:{param_hash}"
        return f"{self.key_prefixes.get(prefix, 'jarvis:')}{identifier}"
    
    def _serialize_data(self, data: Any) -> bytes:
        """Serialize data with optional compression"""
        try:
            serialized = pickle.dumps(data)
            
            # Compress if data is large enough
            if len(serialized) > self.compression_threshold:
                compressed = gzip.compress(serialized)
                # Only use compression if it actually reduces size
                if len(compressed) < len(serialized):
                    return b'compressed:' + compressed
            
            return serialized
        except Exception as e:
            self.logger.error(f"Data serialization failed: {e}")
            raise
    
    def _deserialize_data(self, data: bytes) -> Any:
        """Deserialize data with decompression support"""
        try:
            if data.startswith(b'compressed:'):
                compressed_data = data[11:]  # Remove 'compressed:' prefix
                decompressed = gzip.decompress(compressed_data)
                return pickle.loads(decompressed)
            else:
                return pickle.loads(data)
        except Exception as e:
            self.logger.error(f"Data deserialization failed: {e}")
            raise
    
    def get(self, prefix: str, identifier: str, params: Dict = None) -> Optional[Any]:
        """
        Retrieve data from cache
        
        Args:
            prefix: Cache key prefix (query, user, flight, etc.)
            identifier: Unique identifier
            params: Additional parameters for key generation
            
        Returns:
            Cached data or None if not found
        """
        cache_key = self._generate_cache_key(prefix, identifier, params)
        
        try:
            if self.redis_available:
                cached_data = self.redis_client.get(cache_key)
                if cached_data:
                    self.stats['hits'] += 1
                    return self._deserialize_data(cached_data)
            else:
                # Fallback to memory cache
                if cache_key in self._memory_cache:
                    cache_time = self._cache_times.get(cache_key, 0)
                    if time.time() - cache_time < self.default_ttl:
                        self.stats['hits'] += 1
                        return self._memory_cache[cache_key]
                    else:
                        # Expired
                        del self._memory_cache[cache_key]
                        del self._cache_times[cache_key]
            
            self.stats['misses'] += 1
            return None
            
        except Exception as e:
            self.logger.error(f"Cache get error for key {cache_key}: {e}")
            self.stats['errors'] += 1
            return None
    
    def set(self, prefix: str, identifier: str, data: Any, ttl: int = None, params: Dict = None) -> bool:
        """
        Store data in cache
        
        Args:
            prefix: Cache key prefix
            identifier: Unique identifier
            data: Data to cache
            ttl: Time-to-live in seconds (uses default if None)
            params: Additional parameters for key generation
            
        Returns:
            True if successfully cached, False otherwise
        """
        cache_key = self._generate_cache_key(prefix, identifier, params)
        cache_ttl = ttl or self.default_ttl
        
        try:
            serialized_data = self._serialize_data(data)
            
            if self.redis_available:
                success = self.redis_client.setex(cache_key, cache_ttl, serialized_data)
                if success:
                    self.stats['sets'] += 1
                return success
            else:
                # Fallback to memory cache
                self._memory_cache[cache_key] = data
                self._cache_times[cache_key] = time.time()
                self.stats['sets'] += 1
                return True
                
        except Exception as e:
            self.logger.error(f"Cache set error for key {cache_key}: {e}")
            self.stats['errors'] += 1
            return False
    
    def delete(self, prefix: str, identifier: str, params: Dict = None) -> bool:
        """Delete data from cache"""
        cache_key = self._generate_cache_key(prefix, identifier, params)
        
        try:
            if self.redis_available:
                deleted = self.redis_client.delete(cache_key)
                if deleted:
                    self.stats['deletes'] += 1
                return bool(deleted)
            else:
                if cache_key in self._memory_cache:
                    del self._memory_cache[cache_key]
                    del self._cache_times[cache_key]
                    self.stats['deletes'] += 1
                    return True
                return False
                
        except Exception as e:
            self.logger.error(f"Cache delete error for key {cache_key}: {e}")
            self.stats['errors'] += 1
            return False
    
    def invalidate_pattern(self, pattern: str) -> int:
        """
        Invalidate all cache keys matching a pattern
        
        Args:
            pattern: Redis pattern (e.g., 'jarvis:flight:*')
            
        Returns:
            Number of keys deleted
        """
        try:
            if self.redis_available:
                keys = self.redis_client.keys(pattern)
                if keys:
                    deleted = self.redis_client.delete(*keys)
                    self.stats['deletes'] += deleted
                    return deleted
            else:
                # Memory cache pattern matching
                import fnmatch
                matching_keys = [key for key in self._memory_cache.keys() 
                               if fnmatch.fnmatch(key, pattern)]
                for key in matching_keys:
                    del self._memory_cache[key]
                    del self._cache_times[key]
                self.stats['deletes'] += len(matching_keys)
                return len(matching_keys)
            
            return 0
            
        except Exception as e:
            self.logger.error(f"Cache pattern invalidation error for {pattern}: {e}")
            self.stats['errors'] += 1
            return 0
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        total_operations = self.stats['hits'] + self.stats['misses']
        hit_rate = (self.stats['hits'] / total_operations * 100) if total_operations > 0 else 0
        
        return {
            **self.stats,
            'hit_rate': round(hit_rate, 2),
            'total_operations': total_operations,
            'redis_available': self.redis_available
        }
    
    def clear_stats(self):
        """Clear cache statistics"""
        self.stats = {key: 0 for key in self.stats.keys()}
    
    def flush_all(self) -> bool:
        """Clear all cache data"""
        try:
            if self.redis_available:
                # Only flush our keys, not the entire Redis instance
                pattern = 'jarvis:*'
                keys = self.redis_client.keys(pattern)
                if keys:
                    self.redis_client.delete(*keys)
            else:
                self._memory_cache.clear()
                self._cache_times.clear()
            
            return True
        except Exception as e:
            self.logger.error(f"Cache flush error: {e}")
            return False

# Cache decorators for automatic caching
def cache_result(prefix: str, ttl: int = 3600, key_func=None):
    """
    Decorator for automatic function result caching
    
    Args:
        prefix: Cache key prefix
        ttl: Time-to-live in seconds
        key_func: Function to generate cache key from arguments
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Get cache manager instance
            cache_manager = getattr(wrapper, '_cache_manager', None)
            if not cache_manager:
                return func(*args, **kwargs)
            
            # Generate cache key
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # Default key generation from function name and arguments
                arg_hash = hashlib.md5(str(args + tuple(kwargs.items())).encode()).hexdigest()
                cache_key = f"{func.__name__}:{arg_hash}"
            
            # Try to get from cache
            cached_result = cache_manager.get(prefix, cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache_manager.set(prefix, cache_key, result, ttl)
            
            return result
        
        return wrapper
    return decorator

# Query-specific caching utilities
class QueryCache:
    """Specialized caching for database queries"""
    
    def __init__(self, cache_manager: CacheManager):
        self.cache = cache_manager
        self.logger = logging.getLogger(__name__)
    
    def get_flight_status(self, flight_number: str, date: str = None) -> Optional[Dict]:
        """Get cached flight status"""
        params = {'date': date} if date else None
        return self.cache.get('flight', flight_number, params)
    
    def set_flight_status(self, flight_number: str, data: Dict, date: str = None, ttl: int = 300):
        """Cache flight status (5 minutes default TTL for real-time data)"""
        params = {'date': date} if date else None
        return self.cache.set('flight', flight_number, data, ttl, params)
    
    def get_equipment_location(self, equipment_id: str) -> Optional[Dict]:
        """Get cached equipment location"""
        return self.cache.get('equipment', equipment_id)
    
    def set_equipment_location(self, equipment_id: str, data: Dict, ttl: int = 600):
        """Cache equipment location (10 minutes default TTL)"""
        return self.cache.set('equipment', equipment_id, data, ttl)
    
    def get_staff_assignment(self, staff_id: str, shift_date: str = None) -> Optional[Dict]:
        """Get cached staff assignment"""
        params = {'shift_date': shift_date} if shift_date else None
        return self.cache.get('staff', staff_id, params)
    
    def set_staff_assignment(self, staff_id: str, data: Dict, shift_date: str = None, ttl: int = 1800):
        """Cache staff assignment (30 minutes default TTL)"""
        params = {'shift_date': shift_date} if shift_date else None
        return self.cache.set('staff', staff_id, data, ttl, params)
    
    def invalidate_flight_data(self, flight_number: str = None):
        """Invalidate flight-related cache data"""
        if flight_number:
            pattern = f"jarvis:flight:{flight_number}*"
        else:
            pattern = "jarvis:flight:*"
        return self.cache.invalidate_pattern(pattern)
    
    def invalidate_equipment_data(self, equipment_id: str = None):
        """Invalidate equipment-related cache data"""
        if equipment_id:
            pattern = f"jarvis:equipment:{equipment_id}*"
        else:
            pattern = "jarvis:equipment:*"
        return self.cache.invalidate_pattern(pattern)

# Initialize global cache manager
cache_manager = None
query_cache = None

def init_cache_manager(redis_host='localhost', redis_port=6379, redis_db=0, 
                      redis_password=None, default_ttl=3600):
    """Initialize global cache manager"""
    global cache_manager, query_cache
    
    cache_manager = CacheManager(
        redis_host=redis_host,
        redis_port=redis_port,
        redis_db=redis_db,
        redis_password=redis_password,
        default_ttl=default_ttl
    )
    
    query_cache = QueryCache(cache_manager)
    
    return cache_manager

def get_cache_manager() -> Optional[CacheManager]:
    """Get global cache manager instance"""
    return cache_manager

def get_query_cache() -> Optional[QueryCache]:
    """Get global query cache instance"""
    return query_cache
