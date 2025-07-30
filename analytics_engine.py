#!/usr/bin/env python3
"""
Predictive Analytics and Optimization Engine for Airport Operations Voice Assistant

This module provides:
- Predictive analytics for flight delays and operational disruptions
- Equipment usage optimization and maintenance scheduling
- Staff workload balancing and shift optimization
- Machine learning models for operational insights
- Performance optimization algorithms
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor, GradientBoostingClassifier
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score, f1_score
import joblib
import logging
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
import json
from collections import defaultdict
import math

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class PredictionResult:
    """Prediction result structure"""
    prediction: Any
    confidence: float
    model_name: str
    timestamp: datetime
    input_features: Dict
    explanation: str = None

@dataclass
class OptimizationResult:
    """Optimization result structure"""
    solution: Dict
    objective_value: float
    algorithm: str
    execution_time: float
    constraints_satisfied: bool
    recommendations: List[str]

class PredictiveAnalytics:
    """Predictive analytics engine for airport operations"""
    
    def __init__(self, database_manager=None):
        self.database_manager = database_manager
        self.models = {}
        self.scalers = {}
        self.encoders = {}
        self.model_metadata = {}
        self.training_history = {}
        
        # Initialize models
        self._initialize_models()
        
    def _initialize_models(self):
        """Initialize machine learning models"""
        # Delay prediction model
        self.models['delay_prediction'] = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42
        )
        
        # Equipment failure prediction
        self.models['equipment_failure'] = GradientBoostingClassifier(
            n_estimators=100,
            learning_rate=0.1,
            max_depth=6,
            random_state=42
        )
        
        # Gate assignment optimization
        self.models['gate_demand'] = LinearRegression()
        
        # Staff workload prediction
        self.models['staff_workload'] = RandomForestRegressor(
            n_estimators=50,
            max_depth=8,
            random_state=42
        )
        
        logger.info("Predictive models initialized")
    
    def train_delay_prediction_model(self, historical_data: pd.DataFrame) -> Dict:
        """Train flight delay prediction model"""
        try:
            # Prepare features for delay prediction
            features = self._prepare_delay_features(historical_data)
            target = historical_data['delay_minutes'].fillna(0)
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                features, target, test_size=0.2, random_state=42
            )
            
            # Scale features
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)
            
            # Train model
            model = self.models['delay_prediction']
            model.fit(X_train_scaled, y_train)
            
            # Evaluate
            y_pred = model.predict(X_test_scaled)
            mae = mean_absolute_error(y_test, y_pred)
            
            # Store model and scaler
            self.scalers['delay_prediction'] = scaler
            
            # Save model metadata
            self.model_metadata['delay_prediction'] = {
                'trained_at': datetime.now(),
                'feature_columns': list(features.columns),
                'mae': mae,
                'training_samples': len(X_train)
            }
            
            logger.info(f"Delay prediction model trained with MAE: {mae:.2f} minutes")
            
            return {
                'model': 'delay_prediction',
                'mae': mae,
                'training_samples': len(X_train),
                'feature_importance': dict(zip(features.columns, model.feature_importances_))
            }
            
        except Exception as e:
            logger.error(f"Delay prediction model training failed: {e}")
            raise
    
    def _prepare_delay_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for delay prediction"""
        features = pd.DataFrame()
        
        # Time-based features
        data['departure_time'] = pd.to_datetime(data['scheduled_departure'])
        features['hour_of_day'] = data['departure_time'].dt.hour
        features['day_of_week'] = data['departure_time'].dt.dayofweek
        features['month'] = data['departure_time'].dt.month
        features['is_weekend'] = (data['departure_time'].dt.dayofweek >= 5).astype(int)
        
        # Airport features
        features['departure_airport_encoded'] = LabelEncoder().fit_transform(
            data['departure_airport'].fillna('UNKNOWN')
        )
        features['arrival_airport_encoded'] = LabelEncoder().fit_transform(
            data['arrival_airport'].fillna('UNKNOWN')
        )
        
        # Aircraft features
        features['aircraft_type_encoded'] = LabelEncoder().fit_transform(
            data['aircraft_type'].fillna('UNKNOWN')
        )
        
        # Weather features (if available)
        if 'weather_conditions' in data.columns:
            features['weather_encoded'] = LabelEncoder().fit_transform(
                data['weather_conditions'].fillna('CLEAR')
            )
        else:
            features['weather_encoded'] = 0
        
        # Historical delay patterns
        if 'previous_delays' in data.columns:
            features['avg_previous_delays'] = data['previous_delays'].fillna(0)
        else:
            features['avg_previous_delays'] = 0
        
        return features.fillna(0)
    
    def predict_flight_delay(self, flight_data: Dict) -> PredictionResult:
        """Predict flight delay for a specific flight"""
        try:
            if 'delay_prediction' not in self.model_metadata:
                return PredictionResult(
                    prediction=0,
                    confidence=0.0,
                    model_name='delay_prediction',
                    timestamp=datetime.now(),
                    input_features=flight_data,
                    explanation="Model not trained"
                )
            
            # Prepare features
            features_df = self._prepare_single_flight_features(flight_data)
            model = self.models['delay_prediction']
            scaler = self.scalers['delay_prediction']
            
            # Scale features
            features_scaled = scaler.transform(features_df)
            
            # Predict
            delay_prediction = model.predict(features_scaled)[0]
            
            # Calculate confidence based on feature importance and historical accuracy
            confidence = self._calculate_delay_confidence(features_df, delay_prediction)
            
            explanation = self._generate_delay_explanation(delay_prediction, features_df)
            
            return PredictionResult(
                prediction=max(0, round(delay_prediction, 1)),  # No negative delays
                confidence=confidence,
                model_name='delay_prediction',
                timestamp=datetime.now(),
                input_features=flight_data,
                explanation=explanation
            )
            
        except Exception as e:
            logger.error(f"Delay prediction failed: {e}")
            return PredictionResult(
                prediction=0,
                confidence=0.0,
                model_name='delay_prediction',
                timestamp=datetime.now(),
                input_features=flight_data,
                explanation=f"Prediction failed: {str(e)}"
            )
    
    def _prepare_single_flight_features(self, flight_data: Dict) -> pd.DataFrame:
        """Prepare features for a single flight prediction"""
        features = pd.DataFrame()
        
        # Parse departure time
        departure_time = pd.to_datetime(flight_data.get('scheduled_departure'))
        
        # Time features
        features.loc[0, 'hour_of_day'] = departure_time.hour
        features.loc[0, 'day_of_week'] = departure_time.dayofweek
        features.loc[0, 'month'] = departure_time.month
        features.loc[0, 'is_weekend'] = int(departure_time.dayofweek >= 5)
        
        # Airport features (simplified encoding for single prediction)
        airport_encoding = {'DEN': 1, 'LAX': 2, 'ORD': 3, 'SFO': 4, 'JFK': 5}
        features.loc[0, 'departure_airport_encoded'] = airport_encoding.get(
            flight_data.get('departure_airport'), 0
        )
        features.loc[0, 'arrival_airport_encoded'] = airport_encoding.get(
            flight_data.get('arrival_airport'), 0
        )
        
        # Aircraft features
        aircraft_encoding = {'Boeing 737': 1, 'Airbus A320': 2, 'Boeing 757': 3, 'Boeing 777': 4}
        features.loc[0, 'aircraft_type_encoded'] = aircraft_encoding.get(
            flight_data.get('aircraft_type'), 0
        )
        
        # Default values for missing features
        features.loc[0, 'weather_encoded'] = 0
        features.loc[0, 'avg_previous_delays'] = 0
        
        return features.fillna(0)
    
    def _calculate_delay_confidence(self, features: pd.DataFrame, prediction: float) -> float:
        """Calculate confidence score for delay prediction"""
        base_confidence = 0.7
        
        # Adjust based on prediction magnitude
        if prediction < 15:  # Short delays are more predictable
            confidence_adjustment = 0.2
        elif prediction < 60:  # Medium delays
            confidence_adjustment = 0.0
        else:  # Long delays are less predictable
            confidence_adjustment = -0.2
        
        # Adjust based on time of day (rush hours less predictable)
        hour = features.iloc[0]['hour_of_day']
        if hour in [7, 8, 17, 18, 19]:  # Rush hours
            confidence_adjustment -= 0.1
        
        return max(0.1, min(0.95, base_confidence + confidence_adjustment))
    
    def _generate_delay_explanation(self, prediction: float, features: pd.DataFrame) -> str:
        """Generate human-readable explanation for delay prediction"""
        if prediction < 5:
            return "Flight is expected to be on time"
        elif prediction < 15:
            return f"Minor delay of {prediction:.0f} minutes expected"
        elif prediction < 60:
            return f"Moderate delay of {prediction:.0f} minutes expected"
        else:
            return f"Significant delay of {prediction:.0f} minutes expected"
    
    def train_equipment_failure_model(self, equipment_data: pd.DataFrame) -> Dict:
        """Train equipment failure prediction model"""
        try:
            # Prepare features
            features = self._prepare_equipment_features(equipment_data)
            target = equipment_data['failure_within_week'].fillna(0)
            
            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                features, target, test_size=0.2, random_state=42, stratify=target
            )
            
            # Scale features
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)
            
            # Train model
            model = self.models['equipment_failure']
            model.fit(X_train_scaled, y_train)
            
            # Evaluate
            y_pred = model.predict(X_test_scaled)
            accuracy = accuracy_score(y_test, y_pred)
            f1 = f1_score(y_test, y_pred, average='weighted')
            
            # Store model and scaler
            self.scalers['equipment_failure'] = scaler
            
            self.model_metadata['equipment_failure'] = {
                'trained_at': datetime.now(),
                'feature_columns': list(features.columns),
                'accuracy': accuracy,
                'f1_score': f1,
                'training_samples': len(X_train)
            }
            
            logger.info(f"Equipment failure model trained with accuracy: {accuracy:.3f}")
            
            return {
                'model': 'equipment_failure',
                'accuracy': accuracy,
                'f1_score': f1,
                'training_samples': len(X_train)
            }
            
        except Exception as e:
            logger.error(f"Equipment failure model training failed: {e}")
            raise
    
    def _prepare_equipment_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for equipment failure prediction"""
        features = pd.DataFrame()
        
        # Age and usage features
        features['days_since_maintenance'] = (
            datetime.now() - pd.to_datetime(data['last_maintenance'])
        ).dt.days
        features['usage_hours_per_day'] = data['daily_usage_hours'].fillna(8)
        features['total_operating_hours'] = data['total_hours'].fillna(1000)
        
        # Equipment type
        features['equipment_type_encoded'] = LabelEncoder().fit_transform(
            data['equipment_type'].fillna('UNKNOWN')
        )
        
        # Operational stress indicators
        features['assignments_per_day'] = data['daily_assignments'].fillna(3)
        features['maintenance_frequency'] = data['maintenance_count_last_year'].fillna(4)
        
        return features.fillna(0)

class OptimizationEngine:
    """Optimization engine for resource allocation and scheduling"""
    
    def __init__(self, database_manager=None):
        self.database_manager = database_manager
        self.optimization_history = []
        
    def optimize_gate_assignments(self, flights: List[Dict], gates: List[Dict]) -> OptimizationResult:
        """Optimize gate assignments for flights"""
        start_time = time.time()
        
        try:
            # Simple greedy algorithm for gate assignment
            solution = self._greedy_gate_assignment(flights, gates)
            
            # Calculate objective value (minimize walking distance + conflicts)
            objective_value = self._calculate_gate_objective(solution, flights, gates)
            
            # Generate recommendations
            recommendations = self._generate_gate_recommendations(solution, flights, gates)
            
            result = OptimizationResult(
                solution=solution,
                objective_value=objective_value,
                algorithm='greedy_gate_assignment',
                execution_time=time.time() - start_time,
                constraints_satisfied=self._check_gate_constraints(solution, flights),
                recommendations=recommendations
            )
            
            self.optimization_history.append(result)
            return result
            
        except Exception as e:
            logger.error(f"Gate assignment optimization failed: {e}")
            raise
    
    def _greedy_gate_assignment(self, flights: List[Dict], gates: List[Dict]) -> Dict:
        """Greedy algorithm for gate assignment"""
        assignment = {}
        gate_schedule = {gate['gate_number']: [] for gate in gates}
        
        # Sort flights by departure time
        sorted_flights = sorted(flights, key=lambda f: f.get('scheduled_departure', ''))
        
        for flight in sorted_flights:
            flight_number = flight['flight_number']
            departure_time = pd.to_datetime(flight['scheduled_departure'])
            arrival_time = departure_time - timedelta(hours=2)  # Assume 2 hours before departure
            
            # Find best available gate
            best_gate = None
            min_conflicts = float('inf')
            
            for gate in gates:
                gate_number = gate['gate_number']
                conflicts = self._count_gate_conflicts(
                    gate_schedule[gate_number], arrival_time, departure_time
                )
                
                if conflicts < min_conflicts:
                    min_conflicts = conflicts
                    best_gate = gate_number
            
            if best_gate:
                assignment[flight_number] = best_gate
                gate_schedule[best_gate].append({
                    'flight': flight_number,
                    'arrival': arrival_time,
                    'departure': departure_time
                })
        
        return assignment
    
    def _count_gate_conflicts(self, schedule: List[Dict], arrival_time: datetime, departure_time: datetime) -> int:
        """Count scheduling conflicts for a gate"""
        conflicts = 0
        for slot in schedule:
            if (arrival_time < slot['departure'] and departure_time > slot['arrival']):
                conflicts += 1
        return conflicts
    
    def _calculate_gate_objective(self, solution: Dict, flights: List[Dict], gates: List[Dict]) -> float:
        """Calculate objective value for gate assignment"""
        # Simplified objective: minimize unassigned flights
        total_flights = len(flights)
        assigned_flights = len(solution)
        unassigned_penalty = (total_flights - assigned_flights) * 100
        
        return unassigned_penalty
    
    def _check_gate_constraints(self, solution: Dict, flights: List[Dict]) -> bool:
        """Check if gate assignment satisfies constraints"""
        # Simplified constraint checking
        return len(solution) > 0
    
    def _generate_gate_recommendations(self, solution: Dict, flights: List[Dict], gates: List[Dict]) -> List[str]:
        """Generate recommendations for gate assignments"""
        recommendations = []
        
        unassigned_flights = [f for f in flights if f['flight_number'] not in solution]
        if unassigned_flights:
            recommendations.append(f"{len(unassigned_flights)} flights could not be assigned gates")
        
        # Check for gate utilization
        gate_usage = defaultdict(int)
        for gate in solution.values():
            gate_usage[gate] += 1
        
        underutilized_gates = [gate for gate, count in gate_usage.items() if count < 2]
        if underutilized_gates:
            recommendations.append(f"Gates {', '.join(underutilized_gates)} are underutilized")
        
        return recommendations
    
    def optimize_staff_scheduling(self, staff: List[Dict], shifts: List[Dict]) -> OptimizationResult:
        """Optimize staff scheduling for shifts"""
        start_time = time.time()
        
        try:
            # Simple assignment based on availability and skills
            solution = self._assign_staff_to_shifts(staff, shifts)
            
            # Calculate workload balance
            objective_value = self._calculate_workload_balance(solution, staff)
            
            # Generate recommendations
            recommendations = self._generate_staff_recommendations(solution, staff, shifts)
            
            result = OptimizationResult(
                solution=solution,
                objective_value=objective_value,
                algorithm='staff_scheduling',
                execution_time=time.time() - start_time,
                constraints_satisfied=True,
                recommendations=recommendations
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Staff scheduling optimization failed: {e}")
            raise
    
    def _assign_staff_to_shifts(self, staff: List[Dict], shifts: List[Dict]) -> Dict:
        """Assign staff to shifts based on availability and skills"""
        assignment = {}
        
        for shift in shifts:
            shift_id = shift['shift_id']
            required_skills = shift.get('required_skills', [])
            
            # Find available staff with required skills
            available_staff = [
                s for s in staff 
                if s.get('status') == 'Available' and 
                all(skill in s.get('skills', []) for skill in required_skills)
            ]
            
            if available_staff:
                # Assign staff with least current workload
                selected_staff = min(available_staff, key=lambda s: s.get('current_workload', 0))
                assignment[shift_id] = selected_staff['employee_id']
                
                # Update staff workload
                selected_staff['current_workload'] = selected_staff.get('current_workload', 0) + 1
        
        return assignment
    
    def _calculate_workload_balance(self, solution: Dict, staff: List[Dict]) -> float:
        """Calculate workload balance objective"""
        workloads = [s.get('current_workload', 0) for s in staff]
        
        if not workloads:
            return 0.0
        
        mean_workload = sum(workloads) / len(workloads)
        variance = sum((w - mean_workload) ** 2 for w in workloads) / len(workloads)
        
        return math.sqrt(variance)  # Standard deviation as balance metric
    
    def _generate_staff_recommendations(self, solution: Dict, staff: List[Dict], shifts: List[Dict]) -> List[str]:
        """Generate staff scheduling recommendations"""
        recommendations = []
        
        unassigned_shifts = len(shifts) - len(solution)
        if unassigned_shifts > 0:
            recommendations.append(f"{unassigned_shifts} shifts remain unassigned")
        
        # Check for overworked staff
        overworked_staff = [s for s in staff if s.get('current_workload', 0) > 8]
        if overworked_staff:
            recommendations.append(f"{len(overworked_staff)} staff members may be overworked")
        
        return recommendations

class MLModelManager:
    """Machine learning model lifecycle management"""
    
    def __init__(self):
        self.model_registry = {}
        self.model_versions = defaultdict(list)
        self.performance_history = defaultdict(list)
        
    def register_model(self, name: str, model: Any, version: str, metadata: Dict):
        """Register a trained model"""
        self.model_registry[name] = {
            'model': model,
            'version': version,
            'metadata': metadata,
            'registered_at': datetime.now()
        }
        
        self.model_versions[name].append(version)
        logger.info(f"Registered model {name} version {version}")
    
    def get_model(self, name: str, version: str = None) -> Optional[Any]:
        """Get model by name and version"""
        if name not in self.model_registry:
            return None
        
        model_info = self.model_registry[name]
        if version is None or model_info['version'] == version:
            return model_info['model']
        
        return None
    
    def update_performance(self, model_name: str, metrics: Dict):
        """Update model performance metrics"""
        performance_entry = {
            'timestamp': datetime.now(),
            'metrics': metrics
        }
        self.performance_history[model_name].append(performance_entry)
    
    def get_model_performance(self, model_name: str) -> List[Dict]:
        """Get model performance history"""
        return self.performance_history.get(model_name, [])
    
    def save_model(self, model_name: str, filepath: str):
        """Save model to disk"""
        if model_name in self.model_registry:
            model_info = self.model_registry[model_name]
            joblib.dump(model_info, filepath)
            logger.info(f"Model {model_name} saved to {filepath}")
    
    def load_model(self, model_name: str, filepath: str):
        """Load model from disk"""
        try:
            model_info = joblib.load(filepath)
            self.model_registry[model_name] = model_info
            logger.info(f"Model {model_name} loaded from {filepath}")
        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")

class PerformanceMonitor:
    """Monitor analytics and optimization performance"""
    
    def __init__(self):
        self.metrics = {
            'predictions_made': 0,
            'optimizations_run': 0,
            'avg_prediction_time': 0.0,
            'avg_optimization_time': 0.0,
            'prediction_accuracy': 0.0
        }
        self.recent_predictions = []
        self.recent_optimizations = []
        
    def record_prediction(self, execution_time: float, accuracy: float = None):
        """Record prediction performance"""
        self.metrics['predictions_made'] += 1
        
        # Update average prediction time
        current_avg = self.metrics['avg_prediction_time']
        count = self.metrics['predictions_made']
        self.metrics['avg_prediction_time'] = (current_avg * (count - 1) + execution_time) / count
        
        # Update accuracy if provided
        if accuracy is not None:
            current_accuracy = self.metrics['prediction_accuracy']
            self.metrics['prediction_accuracy'] = (current_accuracy * (count - 1) + accuracy) / count
        
        # Store recent prediction
        self.recent_predictions.append({
            'timestamp': datetime.now(),
            'execution_time': execution_time,
            'accuracy': accuracy
        })
        
        # Keep only recent predictions (last 100)
        if len(self.recent_predictions) > 100:
            self.recent_predictions = self.recent_predictions[-100:]
    
    def record_optimization(self, execution_time: float, objective_value: float):
        """Record optimization performance"""
        self.metrics['optimizations_run'] += 1
        
        # Update average optimization time
        current_avg = self.metrics['avg_optimization_time']
        count = self.metrics['optimizations_run']
        self.metrics['avg_optimization_time'] = (current_avg * (count - 1) + execution_time) / count
        
        # Store recent optimization
        self.recent_optimizations.append({
            'timestamp': datetime.now(),
            'execution_time': execution_time,
            'objective_value': objective_value
        })
        
        # Keep only recent optimizations (last 100)
        if len(self.recent_optimizations) > 100:
            self.recent_optimizations = self.recent_optimizations[-100:]
    
    def get_performance_summary(self) -> Dict:
        """Get performance summary"""
        return {
            **self.metrics,
            'recent_predictions_count': len(self.recent_predictions),
            'recent_optimizations_count': len(self.recent_optimizations)
        }
