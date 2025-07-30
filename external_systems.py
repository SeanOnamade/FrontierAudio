#!/usr/bin/env python3
"""
External System Integration Manager for Airport Operations Voice Assistant

This module provides integration with various airport systems:
- FIDS (Flight Information Display System) integration
- Ground handling system connectivity
- Baggage handling system integration
- Weather data integration
- Air traffic control system feeds
"""

import requests
import json
import time
import logging
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, asdict
from enum import Enum
import schedule
from abc import ABC, abstractmethod
import hashlib
import ssl
import xml.etree.ElementTree as ET

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SystemType(Enum):
    FIDS = "fids"
    GROUND_HANDLING = "ground_handling"
    BAGGAGE = "baggage"
    WEATHER = "weather"
    ATC = "atc"

@dataclass
class SystemConfig:
    """External system configuration"""
    system_type: SystemType
    endpoint_url: str
    api_key: str = None
    username: str = None
    password: str = None
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: int = 5
    ssl_verify: bool = True
    auth_header: str = "Authorization"
    data_format: str = "json"  # json, xml, csv

@dataclass
class FlightData:
    """Standardized flight data structure"""
    flight_number: str
    airline: str
    departure_airport: str
    arrival_airport: str
    departure_gate: str
    arrival_gate: str
    scheduled_departure: datetime
    actual_departure: Optional[datetime]
    scheduled_arrival: datetime
    actual_arrival: Optional[datetime]
    status: str
    aircraft_type: str
    delay_reason: Optional[str] = None
    updated_at: datetime = None

@dataclass
class EquipmentData:
    """Standardized equipment data structure"""
    equipment_id: str
    equipment_type: str
    current_location: str
    assigned_flight: Optional[str]
    status: str
    operator_id: Optional[str]
    maintenance_due: Optional[datetime]
    updated_at: datetime = None

@dataclass
class WeatherData:
    """Standardized weather data structure"""
    station_id: str
    temperature: float
    humidity: float
    wind_speed: float
    wind_direction: int
    visibility: float
    conditions: str
    timestamp: datetime

class ExternalSystemAdapter(ABC):
    """Abstract base class for external system adapters"""
    
    def __init__(self, config: SystemConfig):
        self.config = config
        self.session = requests.Session()
        self.last_sync = None
        self.error_count = 0
        self.success_count = 0
        self._setup_session()
    
    def _setup_session(self):
        """Setup HTTP session with authentication and headers"""
        if self.config.api_key:
            self.session.headers.update({
                self.config.auth_header: f"Bearer {self.config.api_key}"
            })
        elif self.config.username and self.config.password:
            self.session.auth = (self.config.username, self.config.password)
        
        # SSL verification
        if not self.config.ssl_verify:
            self.session.verify = False
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    
    @abstractmethod
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch data from external system"""
        pass
    
    @abstractmethod
    def transform_data(self, raw_data: Any) -> List[Dict]:
        """Transform raw data to standardized format"""
        pass
    
    def sync_data(self) -> Optional[List[Dict]]:
        """Synchronize data from external system"""
        try:
            raw_data = self.fetch_data()
            if raw_data:
                transformed_data = self.transform_data(raw_data)
                self.last_sync = datetime.now()
                self.success_count += 1
                logger.info(f"{self.config.system_type.value} sync successful: {len(transformed_data)} records")
                return transformed_data
            else:
                logger.warning(f"{self.config.system_type.value} sync returned no data")
                return []
                
        except Exception as e:
            self.error_count += 1
            logger.error(f"{self.config.system_type.value} sync failed: {e}")
            return None
    
    def get_health_status(self) -> Dict:
        """Get adapter health status"""
        return {
            'system_type': self.config.system_type.value,
            'last_sync': self.last_sync.isoformat() if self.last_sync else None,
            'success_count': self.success_count,
            'error_count': self.error_count,
            'health_score': self.success_count / max(1, self.success_count + self.error_count)
        }

class FIDSAdapter(ExternalSystemAdapter):
    """Flight Information Display System adapter"""
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch flight data from FIDS"""
        try:
            response = self.session.get(
                f"{self.config.endpoint_url}/flights",
                timeout=self.config.timeout,
                params={'format': 'json', 'active': 'true'}
            )
            response.raise_for_status()
            
            if self.config.data_format == 'xml':
                return self._parse_xml_response(response.text)
            else:
                return response.json()
                
        except requests.RequestException as e:
            logger.error(f"FIDS API request failed: {e}")
            raise
    
    def transform_data(self, raw_data: Any) -> List[FlightData]:
        """Transform FIDS data to standardized format"""
        flights = []
        
        for flight_info in raw_data.get('flights', []):
            try:
                flight = FlightData(
                    flight_number=flight_info.get('flightNumber'),
                    airline=flight_info.get('airline', {}).get('name'),
                    departure_airport=flight_info.get('departure', {}).get('airport'),
                    arrival_airport=flight_info.get('arrival', {}).get('airport'),
                    departure_gate=flight_info.get('departure', {}).get('gate'),
                    arrival_gate=flight_info.get('arrival', {}).get('gate'),
                    scheduled_departure=self._parse_datetime(flight_info.get('departure', {}).get('scheduled')),
                    actual_departure=self._parse_datetime(flight_info.get('departure', {}).get('actual')),
                    scheduled_arrival=self._parse_datetime(flight_info.get('arrival', {}).get('scheduled')),
                    actual_arrival=self._parse_datetime(flight_info.get('arrival', {}).get('actual')),
                    status=flight_info.get('status'),
                    aircraft_type=flight_info.get('aircraft', {}).get('type'),
                    delay_reason=flight_info.get('delayReason'),
                    updated_at=datetime.now()
                )
                flights.append(asdict(flight))
            except Exception as e:
                logger.warning(f"Failed to transform flight data: {e}")
                continue
        
        return flights
    
    def _parse_xml_response(self, xml_text: str) -> Dict:
        """Parse XML response to dictionary"""
        root = ET.fromstring(xml_text)
        # Simplified XML parsing - would need more robust implementation
        flights = []
        for flight_elem in root.findall('.//flight'):
            flight_data = {}
            for child in flight_elem:
                flight_data[child.tag] = child.text
            flights.append(flight_data)
        return {'flights': flights}
    
    def _parse_datetime(self, dt_string: str) -> Optional[datetime]:
        """Parse datetime string"""
        if not dt_string:
            return None
        try:
            return datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
        except ValueError:
            try:
                return datetime.strptime(dt_string, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                return None

class GroundHandlingAdapter(ExternalSystemAdapter):
    """Ground handling system adapter"""
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch ground handling data"""
        try:
            response = self.session.get(
                f"{self.config.endpoint_url}/equipment/status",
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"Ground handling API request failed: {e}")
            raise
    
    def transform_data(self, raw_data: Any) -> List[EquipmentData]:
        """Transform ground handling data to standardized format"""
        equipment_list = []
        
        for equipment_info in raw_data.get('equipment', []):
            try:
                equipment = EquipmentData(
                    equipment_id=equipment_info.get('id'),
                    equipment_type=equipment_info.get('type'),
                    current_location=equipment_info.get('location'),
                    assigned_flight=equipment_info.get('assignedFlight'),
                    status=equipment_info.get('status'),
                    operator_id=equipment_info.get('operatorId'),
                    maintenance_due=self._parse_datetime(equipment_info.get('maintenanceDue')),
                    updated_at=datetime.now()
                )
                equipment_list.append(asdict(equipment))
            except Exception as e:
                logger.warning(f"Failed to transform equipment data: {e}")
                continue
        
        return equipment_list
    
    def _parse_datetime(self, dt_string: str) -> Optional[datetime]:
        """Parse datetime string"""
        if not dt_string:
            return None
        try:
            return datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
        except ValueError:
            return None

class BaggageSystemAdapter(ExternalSystemAdapter):
    """Baggage handling system adapter"""
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch baggage system data"""
        try:
            response = self.session.get(
                f"{self.config.endpoint_url}/baggage/status",
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"Baggage system API request failed: {e}")
            raise
    
    def transform_data(self, raw_data: Any) -> List[Dict]:
        """Transform baggage data to standardized format"""
        baggage_data = []
        
        for bag_info in raw_data.get('bags', []):
            try:
                bag_data = {
                    'bag_id': bag_info.get('bagId'),
                    'flight_number': bag_info.get('flightNumber'),
                    'passenger_name': bag_info.get('passengerName'),
                    'current_location': bag_info.get('currentLocation'),
                    'status': bag_info.get('status'),
                    'destination': bag_info.get('destination'),
                    'updated_at': datetime.now().isoformat()
                }
                baggage_data.append(bag_data)
            except Exception as e:
                logger.warning(f"Failed to transform baggage data: {e}")
                continue
        
        return baggage_data

class WeatherAdapter(ExternalSystemAdapter):
    """Weather data integration adapter"""
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch weather data"""
        try:
            response = self.session.get(
                f"{self.config.endpoint_url}/current",
                timeout=self.config.timeout,
                params={'format': 'json'}
            )
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"Weather API request failed: {e}")
            raise
    
    def transform_data(self, raw_data: Any) -> List[WeatherData]:
        """Transform weather data to standardized format"""
        weather_data = []
        
        for station_data in raw_data.get('stations', []):
            try:
                weather = WeatherData(
                    station_id=station_data.get('stationId'),
                    temperature=float(station_data.get('temperature', 0)),
                    humidity=float(station_data.get('humidity', 0)),
                    wind_speed=float(station_data.get('windSpeed', 0)),
                    wind_direction=int(station_data.get('windDirection', 0)),
                    visibility=float(station_data.get('visibility', 0)),
                    conditions=station_data.get('conditions'),
                    timestamp=self._parse_datetime(station_data.get('timestamp'))
                )
                weather_data.append(asdict(weather))
            except Exception as e:
                logger.warning(f"Failed to transform weather data: {e}")
                continue
        
        return weather_data
    
    def _parse_datetime(self, dt_string: str) -> datetime:
        """Parse datetime string"""
        if not dt_string:
            return datetime.now()
        try:
            return datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
        except ValueError:
            return datetime.now()

class ATCAdapter(ExternalSystemAdapter):
    """Air Traffic Control system adapter"""
    
    def fetch_data(self) -> Dict[str, Any]:
        """Fetch ATC data"""
        try:
            response = self.session.get(
                f"{self.config.endpoint_url}/flights/active",
                timeout=self.config.timeout
            )
            response.raise_for_status()
            return response.json()
            
        except requests.RequestException as e:
            logger.error(f"ATC API request failed: {e}")
            raise
    
    def transform_data(self, raw_data: Any) -> List[Dict]:
        """Transform ATC data to standardized format"""
        atc_data = []
        
        for flight_info in raw_data.get('flights', []):
            try:
                flight_data = {
                    'flight_number': flight_info.get('callsign'),
                    'aircraft_type': flight_info.get('aircraftType'),
                    'altitude': flight_info.get('altitude'),
                    'speed': flight_info.get('groundSpeed'),
                    'heading': flight_info.get('heading'),
                    'latitude': flight_info.get('latitude'),
                    'longitude': flight_info.get('longitude'),
                    'estimated_arrival': self._parse_datetime(flight_info.get('estimatedArrival')),
                    'runway': flight_info.get('runway'),
                    'updated_at': datetime.now().isoformat()
                }
                atc_data.append(flight_data)
            except Exception as e:
                logger.warning(f"Failed to transform ATC data: {e}")
                continue
        
        return atc_data
    
    def _parse_datetime(self, dt_string: str) -> Optional[str]:
        """Parse datetime string"""
        if not dt_string:
            return None
        try:
            dt = datetime.fromisoformat(dt_string.replace('Z', '+00:00'))
            return dt.isoformat()
        except ValueError:
            return None

class ExternalSystemManager:
    """Manager for all external system integrations"""
    
    def __init__(self, database_manager=None):
        self.adapters = {}
        self.sync_schedules = {}
        self.database_manager = database_manager
        self.sync_thread = None
        self.running = False
        self.data_callbacks = {}
        self._lock = threading.RLock()
        
        # Error handling and retry configuration
        self.max_retries = 3
        self.retry_delay = 5
        
    def register_adapter(self, adapter: ExternalSystemAdapter, sync_interval: int = 300):
        """Register external system adapter"""
        system_type = adapter.config.system_type
        self.adapters[system_type] = adapter
        self.sync_schedules[system_type] = sync_interval
        
        logger.info(f"Registered {system_type.value} adapter with {sync_interval}s sync interval")
    
    def register_data_callback(self, system_type: SystemType, callback: Callable):
        """Register callback for data updates"""
        if system_type not in self.data_callbacks:
            self.data_callbacks[system_type] = []
        self.data_callbacks[system_type].append(callback)
    
    def start_sync(self):
        """Start automatic synchronization"""
        if self.running:
            return
        
        self.running = True
        self.sync_thread = threading.Thread(target=self._sync_worker)
        self.sync_thread.daemon = True
        self.sync_thread.start()
        
        # Schedule periodic syncs
        for system_type, interval in self.sync_schedules.items():
            schedule.every(interval).seconds.do(self._sync_system, system_type)
        
        logger.info("External system synchronization started")
    
    def stop_sync(self):
        """Stop automatic synchronization"""
        self.running = False
        if self.sync_thread:
            self.sync_thread.join()
        schedule.clear()
        logger.info("External system synchronization stopped")
    
    def _sync_worker(self):
        """Worker thread for handling scheduled syncs"""
        while self.running:
            try:
                schedule.run_pending()
                time.sleep(1)
            except Exception as e:
                logger.error(f"Sync worker error: {e}")
    
    def _sync_system(self, system_type: SystemType):
        """Synchronize data from specific system"""
        adapter = self.adapters.get(system_type)
        if not adapter:
            return
        
        try:
            data = adapter.sync_data()
            if data is not None:
                # Store data in database if manager is available
                if self.database_manager:
                    self._store_external_data(system_type, data)
                
                # Notify callbacks
                self._notify_callbacks(system_type, data)
                
        except Exception as e:
            logger.error(f"System sync failed for {system_type.value}: {e}")
    
    def _store_external_data(self, system_type: SystemType, data: List[Dict]):
        """Store external data in database"""
        try:
            # Create table name based on system type
            table_name = f"external_{system_type.value}"
            
            # This would be implemented based on specific database schema
            # For now, we'll just log the operation
            logger.info(f"Storing {len(data)} records from {system_type.value} to {table_name}")
            
        except Exception as e:
            logger.error(f"Failed to store external data: {e}")
    
    def _notify_callbacks(self, system_type: SystemType, data: List[Dict]):
        """Notify registered callbacks of data updates"""
        callbacks = self.data_callbacks.get(system_type, [])
        for callback in callbacks:
            try:
                callback(system_type, data)
            except Exception as e:
                logger.error(f"Callback notification failed: {e}")
    
    def manual_sync(self, system_type: SystemType = None) -> Dict:
        """Manually trigger synchronization"""
        if system_type:
            systems_to_sync = [system_type]
        else:
            systems_to_sync = list(self.adapters.keys())
        
        results = {}
        
        for sys_type in systems_to_sync:
            adapter = self.adapters.get(sys_type)
            if adapter:
                data = adapter.sync_data()
                results[sys_type.value] = {
                    'success': data is not None,
                    'record_count': len(data) if data else 0
                }
            else:
                results[sys_type.value] = {
                    'success': False,
                    'error': 'Adapter not registered'
                }
        
        return results
    
    def get_system_status(self) -> Dict:
        """Get status of all external systems"""
        status = {}
        
        for system_type, adapter in self.adapters.items():
            status[system_type.value] = adapter.get_health_status()
        
        return status
    
    def configure_fids_integration(self, endpoint_url: str, api_key: str = None):
        """Configure FIDS integration"""
        config = SystemConfig(
            system_type=SystemType.FIDS,
            endpoint_url=endpoint_url,
            api_key=api_key
        )
        adapter = FIDSAdapter(config)
        self.register_adapter(adapter, sync_interval=60)  # Sync every minute
    
    def configure_ground_handling_integration(self, endpoint_url: str, api_key: str = None):
        """Configure ground handling integration"""
        config = SystemConfig(
            system_type=SystemType.GROUND_HANDLING,
            endpoint_url=endpoint_url,
            api_key=api_key
        )
        adapter = GroundHandlingAdapter(config)
        self.register_adapter(adapter, sync_interval=120)  # Sync every 2 minutes
    
    def configure_baggage_integration(self, endpoint_url: str, api_key: str = None):
        """Configure baggage system integration"""
        config = SystemConfig(
            system_type=SystemType.BAGGAGE,
            endpoint_url=endpoint_url,
            api_key=api_key
        )
        adapter = BaggageSystemAdapter(config)
        self.register_adapter(adapter, sync_interval=180)  # Sync every 3 minutes
    
    def configure_weather_integration(self, endpoint_url: str, api_key: str = None):
        """Configure weather data integration"""
        config = SystemConfig(
            system_type=SystemType.WEATHER,
            endpoint_url=endpoint_url,
            api_key=api_key
        )
        adapter = WeatherAdapter(config)
        self.register_adapter(adapter, sync_interval=300)  # Sync every 5 minutes
    
    def configure_atc_integration(self, endpoint_url: str, api_key: str = None):
        """Configure ATC integration"""
        config = SystemConfig(
            system_type=SystemType.ATC,
            endpoint_url=endpoint_url,
            api_key=api_key
        )
        adapter = ATCAdapter(config)
        self.register_adapter(adapter, sync_interval=30)  # Sync every 30 seconds
