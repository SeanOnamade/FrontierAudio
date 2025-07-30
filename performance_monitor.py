"""
JARVIS Performance Monitor - Comprehensive monitoring and analytics system
Tracks system performance, user behavior, and predictive maintenance
"""

import time
import threading
import logging
import json
import psutil
import sqlite3
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
from collections import defaultdict, deque
import statistics
import asyncio
from concurrent.futures import ThreadPoolExecutor
import warnings
warnings.filterwarnings('ignore')

@dataclass
class PerformanceMetric:
    """Individual performance metric"""
    timestamp: datetime
    metric_name: str
    value: float
    tags: Dict[str, str] = None

@dataclass
class SystemHealthStatus:
    """System health status"""
    timestamp: datetime
    cpu_usage: float
    memory_usage: float
    disk_usage: float
    response_time: float
    active_users: int
    cache_hit_rate: float
    error_rate: float
    status: str  # healthy, warning, critical

@dataclass
class UserBehaviorEvent:
    """User behavior tracking event"""
    timestamp: datetime
    user_id: str
    event_type: str
    event_data: Dict[str, Any]
    session_id: str
    user_role: str = None

class PerformanceMonitor:
    """Advanced performance monitoring system"""
    
    def __init__(self, db_path: str = "performance_metrics.db"):
        self.db_path = db_path
        self.logger = logging.getLogger(__name__)
        
        # Metrics storage
        self.metrics_buffer = deque(maxlen=10000)
        self.health_history = deque(maxlen=1440)  # 24 hours at 1-minute intervals
        self.user_events = deque(maxlen=50000)
        
        # Performance thresholds
        self.thresholds = {
            'response_time_warning': 2.0,  # seconds
            'response_time_critical': 5.0,
            'cpu_warning': 70.0,  # percentage
            'cpu_critical': 90.0,
            'memory_warning': 80.0,
            'memory_critical': 95.0,
            'error_rate_warning': 5.0,  # percentage
            'error_rate_critical': 15.0,
            'cache_hit_rate_warning': 70.0,  # percentage (below this is warning)
        }
        
        # Alert callbacks
        self.alert_callbacks = []
        
        # Monitoring state
        self.monitoring_active = False
        self.monitoring_thread = None
        self.last_health_check = None
        
        # Request tracking
        self.request_times = deque(maxlen=1000)
        self.error_count = 0
        self.total_requests = 0
        
        # User session tracking
        self.active_sessions = {}
        self.session_timeout = 1800  # 30 minutes
        
        # Initialize database
        self._init_database()
        
        # Start monitoring
        self.start_monitoring()
    
    def _init_database(self):
        """Initialize SQLite database for metrics storage"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS performance_metrics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME,
                        metric_name TEXT,
                        value REAL,
                        tags TEXT
                    )
                ''')
                
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS system_health (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME,
                        cpu_usage REAL,
                        memory_usage REAL,
                        disk_usage REAL,
                        response_time REAL,
                        active_users INTEGER,
                        cache_hit_rate REAL,
                        error_rate REAL,
                        status TEXT
                    )
                ''')
                
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS user_behavior (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME,
                        user_id TEXT,
                        event_type TEXT,
                        event_data TEXT,
                        session_id TEXT,
                        user_role TEXT
                    )
                ''')
                
                # Create indexes for better query performance
                conn.execute('CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON performance_metrics(timestamp)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_metrics_name ON performance_metrics(metric_name)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_health_timestamp ON system_health(timestamp)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_behavior_timestamp ON user_behavior(timestamp)')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_behavior_user ON user_behavior(user_id)')
                
        except Exception as e:
            self.logger.error(f"Failed to initialize performance database: {e}")
    
    def start_monitoring(self):
        """Start the monitoring thread"""
        if not self.monitoring_active:
            self.monitoring_active = True
            self.monitoring_thread = threading.Thread(target=self._monitoring_loop, daemon=True)
            self.monitoring_thread.start()
            self.logger.info("Performance monitoring started")
    
    def stop_monitoring(self):
        """Stop the monitoring thread"""
        self.monitoring_active = False
        if self.monitoring_thread:
            self.monitoring_thread.join(timeout=5)
        self.logger.info("Performance monitoring stopped")
    
    def _monitoring_loop(self):
        """Main monitoring loop"""
        while self.monitoring_active:
            try:
                # Collect system metrics
                self._collect_system_metrics()
                
                # Check system health
                health_status = self._check_system_health()
                self.health_history.append(health_status)
                
                # Trigger alerts if necessary
                self._check_alerts(health_status)
                
                # Clean up old sessions
                self._cleanup_expired_sessions()
                
                # Persist metrics to database (every 5 minutes)
                if len(self.metrics_buffer) > 0 and len(self.metrics_buffer) % 300 == 0:
                    self._persist_metrics()
                
                time.sleep(60)  # Check every minute
                
            except Exception as e:
                self.logger.error(f"Error in monitoring loop: {e}")
                time.sleep(60)
    
    def _collect_system_metrics(self):
        """Collect system performance metrics"""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            self.record_metric("system.cpu_usage", cpu_percent, {"unit": "percentage"})
            
            # Memory usage
            memory = psutil.virtual_memory()
            self.record_metric("system.memory_usage", memory.percent, {"unit": "percentage"})
            self.record_metric("system.memory_available", memory.available / (1024**3), {"unit": "GB"})
            
            # Disk usage
            disk = psutil.disk_usage('/')
            disk_percent = (disk.used / disk.total) * 100
            self.record_metric("system.disk_usage", disk_percent, {"unit": "percentage"})
            
            # Network stats (if available)
            try:
                network = psutil.net_io_counters()
                self.record_metric("system.network_bytes_sent", network.bytes_sent, {"unit": "bytes"})
                self.record_metric("system.network_bytes_recv", network.bytes_recv, {"unit": "bytes"})
            except Exception:
                pass  # Network stats might not be available
            
        except Exception as e:
            self.logger.error(f"Failed to collect system metrics: {e}")
    
    def _check_system_health(self) -> SystemHealthStatus:
        """Check overall system health"""
        try:
            # Get current metrics
            cpu_usage = psutil.cpu_percent()
            memory_usage = psutil.virtual_memory().percent
            disk_usage = (psutil.disk_usage('/').used / psutil.disk_usage('/').total) * 100
            
            # Calculate average response time
            avg_response_time = statistics.mean(self.request_times) if self.request_times else 0
            
            # Calculate error rate
            error_rate = (self.error_count / max(self.total_requests, 1)) * 100
            
            # Get cache hit rate (from cache manager if available)
            cache_hit_rate = 0
            try:
                from cache_manager import get_cache_manager
                cache_manager = get_cache_manager()
                if cache_manager:
                    stats = cache_manager.get_stats()
                    cache_hit_rate = stats.get('hit_rate', 0)
            except Exception:
                pass
            
            # Active users count
            active_users = len(self.active_sessions)
            
            # Determine overall status
            status = "healthy"
            if (cpu_usage > self.thresholds['cpu_critical'] or 
                memory_usage > self.thresholds['memory_critical'] or
                avg_response_time > self.thresholds['response_time_critical'] or
                error_rate > self.thresholds['error_rate_critical']):
                status = "critical"
            elif (cpu_usage > self.thresholds['cpu_warning'] or 
                  memory_usage > self.thresholds['memory_warning'] or
                  avg_response_time > self.thresholds['response_time_warning'] or
                  error_rate > self.thresholds['error_rate_warning'] or
                  cache_hit_rate < self.thresholds['cache_hit_rate_warning']):
                status = "warning"
            
            health_status = SystemHealthStatus(
                timestamp=datetime.now(),
                cpu_usage=cpu_usage,
                memory_usage=memory_usage,
                disk_usage=disk_usage,
                response_time=avg_response_time,
                active_users=active_users,
                cache_hit_rate=cache_hit_rate,
                error_rate=error_rate,
                status=status
            )
            
            self.last_health_check = health_status
            return health_status
            
        except Exception as e:
            self.logger.error(f"Health check failed: {e}")
            return SystemHealthStatus(
                timestamp=datetime.now(),
                cpu_usage=0, memory_usage=0, disk_usage=0,
                response_time=0, active_users=0, cache_hit_rate=0,
                error_rate=100, status="critical"
            )
    
    def _check_alerts(self, health_status: SystemHealthStatus):
        """Check for alert conditions and trigger callbacks"""
        alerts = []
        
        if health_status.status == "critical":
            alerts.append({
                "level": "critical",
                "message": "System health is critical",
                "details": asdict(health_status)
            })
        elif health_status.status == "warning":
            alerts.append({
                "level": "warning", 
                "message": "System health warning",
                "details": asdict(health_status)
            })
        
        # Specific alerts
        if health_status.response_time > self.thresholds['response_time_critical']:
            alerts.append({
                "level": "critical",
                "message": f"Response time critical: {health_status.response_time:.2f}s",
                "metric": "response_time",
                "value": health_status.response_time
            })
        
        if health_status.cache_hit_rate < self.thresholds['cache_hit_rate_warning']:
            alerts.append({
                "level": "warning",
                "message": f"Low cache hit rate: {health_status.cache_hit_rate:.1f}%",
                "metric": "cache_hit_rate",
                "value": health_status.cache_hit_rate
            })
        
        # Trigger alert callbacks
        for alert in alerts:
            for callback in self.alert_callbacks:
                try:
                    callback(alert)
                except Exception as e:
                    self.logger.error(f"Alert callback failed: {e}")
    
    def _cleanup_expired_sessions(self):
        """Remove expired user sessions"""
        now = datetime.now()
        expired_sessions = []
        
        for session_id, session_data in self.active_sessions.items():
            if (now - session_data['last_activity']).seconds > self.session_timeout:
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            del self.active_sessions[session_id]
    
    def _persist_metrics(self):
        """Persist metrics buffer to database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Persist performance metrics
                for metric in list(self.metrics_buffer):
                    conn.execute(
                        "INSERT INTO performance_metrics (timestamp, metric_name, value, tags) VALUES (?, ?, ?, ?)",
                        (metric.timestamp, metric.metric_name, metric.value, 
                         json.dumps(metric.tags) if metric.tags else None)
                    )
                
                # Persist health history
                for health in list(self.health_history):
                    conn.execute(
                        "INSERT INTO system_health (timestamp, cpu_usage, memory_usage, disk_usage, response_time, active_users, cache_hit_rate, error_rate, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (health.timestamp, health.cpu_usage, health.memory_usage, 
                         health.disk_usage, health.response_time, health.active_users,
                         health.cache_hit_rate, health.error_rate, health.status)
                    )
                
                # Persist user behavior events
                for event in list(self.user_events):
                    conn.execute(
                        "INSERT INTO user_behavior (timestamp, user_id, event_type, event_data, session_id, user_role) VALUES (?, ?, ?, ?, ?, ?)",
                        (event.timestamp, event.user_id, event.event_type,
                         json.dumps(event.event_data), event.session_id, event.user_role)
                    )
                
                # Clear buffers after persisting
                self.metrics_buffer.clear()
                self.user_events.clear()
                
        except Exception as e:
            self.logger.error(f"Failed to persist metrics: {e}")
    
    def record_metric(self, name: str, value: float, tags: Dict[str, str] = None):
        """Record a performance metric"""
        metric = PerformanceMetric(
            timestamp=datetime.now(),
            metric_name=name,
            value=value,
            tags=tags or {}
        )
        self.metrics_buffer.append(metric)
    
    def record_request(self, duration: float, success: bool = True):
        """Record API request performance"""
        self.request_times.append(duration)
        self.total_requests += 1
        
        if not success:
            self.error_count += 1
        
        # Record as metric
        self.record_metric("api.request_duration", duration, {"success": str(success)})
    
    def track_user_event(self, user_id: str, event_type: str, event_data: Dict[str, Any], 
                        session_id: str, user_role: str = None):
        """Track user behavior event"""
        event = UserBehaviorEvent(
            timestamp=datetime.now(),
            user_id=user_id,
            event_type=event_type,
            event_data=event_data,
            session_id=session_id,
            user_role=user_role
        )
        self.user_events.append(event)
        
        # Update session activity
        self.active_sessions[session_id] = {
            'user_id': user_id,
            'user_role': user_role,
            'last_activity': datetime.now()
        }
    
    def add_alert_callback(self, callback: Callable[[Dict], None]):
        """Add alert callback function"""
        self.alert_callbacks.append(callback)
    
    def get_performance_summary(self, hours: int = 24) -> Dict:
        """Get performance summary for the last N hours"""
        try:
            since = datetime.now() - timedelta(hours=hours)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                # Get average metrics
                cursor = conn.execute("""
                    SELECT metric_name, AVG(value) as avg_value, MIN(value) as min_value, 
                           MAX(value) as max_value, COUNT(*) as count
                    FROM performance_metrics 
                    WHERE timestamp > ? 
                    GROUP BY metric_name
                """, (since,))
                
                metrics = {row['metric_name']: {
                    'average': row['avg_value'],
                    'minimum': row['min_value'],
                    'maximum': row['max_value'],
                    'count': row['count']
                } for row in cursor.fetchall()}
                
                # Get health status distribution
                cursor = conn.execute("""
                    SELECT status, COUNT(*) as count
                    FROM system_health 
                    WHERE timestamp > ?
                    GROUP BY status
                """, (since,))
                
                health_distribution = {row['status']: row['count'] for row in cursor.fetchall()}
                
                # Get user activity
                cursor = conn.execute("""
                    SELECT COUNT(DISTINCT user_id) as unique_users,
                           COUNT(*) as total_events
                    FROM user_behavior 
                    WHERE timestamp > ?
                """, (since,))
                
                user_stats = cursor.fetchone()
                
                return {
                    'time_period_hours': hours,
                    'metrics': metrics,
                    'health_distribution': health_distribution,
                    'user_activity': {
                        'unique_users': user_stats['unique_users'] if user_stats else 0,
                        'total_events': user_stats['total_events'] if user_stats else 0
                    },
                    'current_health': asdict(self.last_health_check) if self.last_health_check else None
                }
                
        except Exception as e:
            self.logger.error(f"Failed to get performance summary: {e}")
            return {}
    
    def get_user_behavior_analysis(self, user_id: str = None, hours: int = 24) -> Dict:
        """Analyze user behavior patterns"""
        try:
            since = datetime.now() - timedelta(hours=hours)
            
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                
                # Base query
                base_query = "SELECT * FROM user_behavior WHERE timestamp > ?"
                params = [since]
                
                if user_id:
                    base_query += " AND user_id = ?"
                    params.append(user_id)
                
                cursor = conn.execute(base_query, params)
                events = cursor.fetchall()
                
                # Analyze patterns
                event_types = defaultdict(int)
                hourly_activity = defaultdict(int)
                role_activity = defaultdict(int)
                
                for event in events:
                    event_types[event['event_type']] += 1
                    hour = datetime.fromisoformat(event['timestamp']).hour
                    hourly_activity[hour] += 1
                    if event['user_role']:
                        role_activity[event['user_role']] += 1
                
                return {
                    'total_events': len(events),
                    'event_types': dict(event_types),
                    'hourly_activity': dict(hourly_activity),
                    'role_activity': dict(role_activity),
                    'analysis_period_hours': hours
                }
                
        except Exception as e:
            self.logger.error(f"Failed to analyze user behavior: {e}")
            return {}
    
    def predict_maintenance_needs(self) -> List[Dict]:
        """Predict maintenance needs based on performance trends"""
        predictions = []
        
        try:
            # Analyze CPU trend
            recent_cpu = [h.cpu_usage for h in list(self.health_history)[-60:]]  # Last hour
            if len(recent_cpu) > 10:
                cpu_trend = statistics.mean(recent_cpu[-10:]) - statistics.mean(recent_cpu[:10])
                if cpu_trend > 10:  # CPU usage increasing by >10%
                    predictions.append({
                        'type': 'high_cpu_usage',
                        'severity': 'warning',
                        'message': 'CPU usage trending upward - consider scaling',
                        'recommended_action': 'Scale up server resources',
                        'confidence': min(cpu_trend * 5, 90)
                    })
            
            # Analyze memory trend
            recent_memory = [h.memory_usage for h in list(self.health_history)[-60:]]
            if len(recent_memory) > 10:
                memory_trend = statistics.mean(recent_memory[-10:]) - statistics.mean(recent_memory[:10])
                if memory_trend > 15:  # Memory usage increasing by >15%
                    predictions.append({
                        'type': 'memory_pressure',
                        'severity': 'warning',
                        'message': 'Memory usage trending upward - potential memory leak',
                        'recommended_action': 'Investigate memory usage and restart services',
                        'confidence': min(memory_trend * 3, 85)
                    })
            
            # Analyze response time trend
            if len(self.request_times) > 100:
                recent_times = list(self.request_times)[-50:]
                older_times = list(self.request_times)[-100:-50]
                
                recent_avg = statistics.mean(recent_times)
                older_avg = statistics.mean(older_times)
                
                if recent_avg > older_avg * 1.5:  # 50% increase in response time
                    predictions.append({
                        'type': 'performance_degradation',
                        'severity': 'critical' if recent_avg > 3.0 else 'warning',
                        'message': 'Response times increasing - system performance degrading',
                        'recommended_action': 'Check database performance and cache hit rates',
                        'confidence': 75
                    })
            
        except Exception as e:
            self.logger.error(f"Predictive analysis failed: {e}")
        
        return predictions

# Global performance monitor instance
performance_monitor = None

def init_performance_monitor(db_path: str = "performance_metrics.db") -> PerformanceMonitor:
    """Initialize global performance monitor"""
    global performance_monitor
    performance_monitor = PerformanceMonitor(db_path)
    return performance_monitor

def get_performance_monitor() -> Optional[PerformanceMonitor]:
    """Get global performance monitor instance"""
    return performance_monitor

# Decorator for automatic request tracking
def track_performance(func):
    """Decorator to automatically track function performance"""
    def wrapper(*args, **kwargs):
        start_time = time.time()
        success = True
        
        try:
            result = func(*args, **kwargs)
            return result
        except Exception as e:
            success = False
            raise
        finally:
            duration = time.time() - start_time
            if performance_monitor:
                performance_monitor.record_request(duration, success)
    
    return wrapper
