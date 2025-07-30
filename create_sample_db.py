#!/usr/bin/env python3
"""
Sample Database Generator for Airport Operations Voice Assistant

This script creates a sample SQLite database with airport operations data
for testing the voice assistant when the actual United Airlines database
is not available.
"""

import sqlite3
import random
from datetime import datetime, timedelta

def create_sample_database(db_path='united_airlines_normalized.db'):
    """Create a sample database with airport operations data"""
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create tables
    create_tables(cursor)
    
    # Insert sample data
    insert_sample_data(cursor)
    
    # Commit and close
    conn.commit()
    conn.close()
    
    print(f"Sample database created: {db_path}")

def create_tables(cursor):
    """Create database tables"""
    
    # Flights table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flights (
            id INTEGER PRIMARY KEY,
            flight_number TEXT UNIQUE NOT NULL,
            airline TEXT NOT NULL,
            departure_airport TEXT,
            arrival_airport TEXT,
            departure_gate TEXT,
            arrival_gate TEXT,
            scheduled_departure DATETIME,
            actual_departure DATETIME,
            scheduled_arrival DATETIME,
            actual_arrival DATETIME,
            status TEXT,
            aircraft_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Equipment table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS equipment (
            id INTEGER PRIMARY KEY,
            equipment_id TEXT UNIQUE NOT NULL,
            equipment_type TEXT NOT NULL,
            current_location TEXT,
            assigned_flight TEXT,
            status TEXT,
            operator_id INTEGER,
            last_maintenance DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Employees table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY,
            employee_id TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            department TEXT,
            role TEXT,
            phone_number TEXT,
            email TEXT,
            shift_start TIME,
            shift_end TIME,
            status TEXT,
            current_location TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Gates table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS gates (
            id INTEGER PRIMARY KEY,
            gate_number TEXT UNIQUE NOT NULL,
            terminal TEXT,
            status TEXT,
            current_flight TEXT,
            equipment_nearby TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Assignments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY,
            flight_number TEXT,
            employee_id TEXT,
            equipment_id TEXT,
            assignment_type TEXT,
            start_time DATETIME,
            end_time DATETIME,
            status TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

def insert_sample_data(cursor):
    """Insert sample data into tables"""
    
    # Sample flights
    flights_data = [
        ('UA2406', 'United Airlines', 'DEN', 'LAX', 'A12', 'B6', 
         datetime.now() + timedelta(hours=2), None,
         datetime.now() + timedelta(hours=4, minutes=30), None,
         'On Time', 'Boeing 737'),
        ('UA1234', 'United Airlines', 'DEN', 'ORD', 'B4', 'C8',
         datetime.now() + timedelta(hours=1), None,
         datetime.now() + timedelta(hours=3), None,
         'Delayed', 'Airbus A320'),
        ('UA5678', 'United Airlines', 'DEN', 'SFO', 'A8', 'A12',
         datetime.now() - timedelta(minutes=30), datetime.now() - timedelta(minutes=15),
         datetime.now() + timedelta(hours=1, minutes=45), None,
         'Departed', 'Boeing 757'),
        ('UA9999', 'United Airlines', 'DEN', 'JFK', 'C2', 'D4',
         datetime.now() + timedelta(hours=3, minutes=15), None,
         datetime.now() + timedelta(hours=7), None,
         'On Time', 'Boeing 777'),
        ('UA1111', 'United Airlines', 'LAX', 'DEN', 'D1', 'A1',
         datetime.now() + timedelta(minutes=45), None,
         datetime.now() + timedelta(hours=2, minutes=15), None,
         'Boarding', 'Airbus A319')
    ]
    
    for flight in flights_data:
        cursor.execute('''
            INSERT OR REPLACE INTO flights 
            (flight_number, airline, departure_airport, arrival_airport, 
             departure_gate, arrival_gate, scheduled_departure, actual_departure,
             scheduled_arrival, actual_arrival, status, aircraft_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', flight)
    
    # Sample equipment
    equipment_data = [
        ('T-42', 'Pushback Tractor', 'Gate B6', 'UA2406', 'Assigned', 1),
        ('T-17', 'Pushback Tractor', 'Gate A1', None, 'Available', None),
        ('T-23', 'Pushback Tractor', 'Maintenance Bay', None, 'Maintenance', 3),
        ('L-01', 'Luggage Cart', 'Gate A12', 'UA2406', 'In Use', 2),
        ('L-05', 'Luggage Cart', 'Baggage Claim 3', None, 'Available', None),
        ('C-12', 'Catering Truck', 'Gate B4', 'UA1234', 'Loading', 4),
        ('F-08', 'Fuel Truck', 'Gate A8', 'UA5678', 'Fueling', 5),
        ('GP-15', 'Ground Power Unit', 'Gate C2', 'UA9999', 'Connected', 6)
    ]
    
    for equipment in equipment_data:
        cursor.execute('''
            INSERT OR REPLACE INTO equipment 
            (equipment_id, equipment_type, current_location, assigned_flight, 
             status, operator_id, last_maintenance)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', equipment + (datetime.now() - timedelta(days=random.randint(1, 30)),))
    
    # Sample employees
    employees_data = [
        ('EMP001', 'Maria', 'Rodriguez', 'Cleaning', 'Cleaning Lead', '555-0123', 'maria.r@airport.com', '06:00', '14:00', 'Working', 'Terminal A'),
        ('EMP002', 'John', 'Smith', 'Ramp', 'Ramp Agent', '555-0124', 'john.s@airport.com', '08:00', '16:00', 'Break', 'Break Room'),
        ('EMP003', 'Sarah', 'Johnson', 'Maintenance', 'Mechanic', '555-0125', 'sarah.j@airport.com', '22:00', '06:00', 'Working', 'Maintenance Bay'),
        ('EMP004', 'Mike', 'Chen', 'Catering', 'Catering Supervisor', '555-0126', 'mike.c@airport.com', '04:00', '12:00', 'Working', 'Gate B4'),
        ('EMP005', 'Lisa', 'Wilson', 'Ramp', 'Equipment Operator', '555-0127', 'lisa.w@airport.com', '10:00', '18:00', 'Working', 'Gate A12'),
        ('EMP006', 'David', 'Brown', 'Security', 'Security Officer', '555-0128', 'david.b@airport.com', '14:00', '22:00', 'Working', 'Terminal B'),
        ('EMP007', 'Amy', 'Davis', 'Ground Crew', 'Ground Crew Lead', '555-0129', 'amy.d@airport.com', '06:00', '14:00', 'Break', 'Break Room'),
        ('EMP008', 'Robert', 'Miller', 'Baggage', 'Baggage Handler', '555-0130', 'robert.m@airport.com', '16:00', '00:00', 'Working', 'Baggage Sort')
    ]
    
    for employee in employees_data:
        cursor.execute('''
            INSERT OR REPLACE INTO employees 
            (employee_id, first_name, last_name, department, role, 
             phone_number, email, shift_start, shift_end, status, current_location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', employee)
    
    # Sample gates
    gates_data = [
        ('A1', 'Terminal A', 'Available', None, 'T-17'),
        ('A8', 'Terminal A', 'Occupied', 'UA5678', 'F-08'),
        ('A12', 'Terminal A', 'Occupied', 'UA2406', 'L-01,T-42'),
        ('B4', 'Terminal B', 'Occupied', 'UA1234', 'C-12'),
        ('B6', 'Terminal B', 'Available', None, None),
        ('C2', 'Terminal C', 'Occupied', 'UA9999', 'GP-15'),
        ('D1', 'Terminal D', 'Occupied', 'UA1111', None)
    ]
    
    for gate in gates_data:
        cursor.execute('''
            INSERT OR REPLACE INTO gates 
            (gate_number, terminal, status, current_flight, equipment_nearby)
            VALUES (?, ?, ?, ?, ?)
        ''', gate)
    
    # Sample assignments
    assignments_data = [
        ('UA2406', 'EMP001', None, 'Cleaning', datetime.now() + timedelta(hours=1), datetime.now() + timedelta(hours=2), 'Scheduled'),
        ('UA2406', 'EMP005', 'L-01', 'Baggage Loading', datetime.now() + timedelta(minutes=30), datetime.now() + timedelta(hours=1, minutes=30), 'In Progress'),
        ('UA1234', 'EMP004', 'C-12', 'Catering', datetime.now() + timedelta(minutes=15), datetime.now() + timedelta(minutes=45), 'In Progress'),
        ('UA5678', 'EMP005', 'F-08', 'Refueling', datetime.now() - timedelta(minutes=45), datetime.now() - timedelta(minutes=15), 'Completed'),
        ('UA9999', 'EMP006', 'GP-15', 'Ground Power', datetime.now() + timedelta(hours=2), datetime.now() + timedelta(hours=3), 'Scheduled')
    ]
    
    for assignment in assignments_data:
        cursor.execute('''
            INSERT OR REPLACE INTO assignments 
            (flight_number, employee_id, equipment_id, assignment_type, 
             start_time, end_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', assignment)

def print_sample_data(db_path='united_airlines_normalized.db'):
    """Print sample data from the database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print("\n=== SAMPLE DATABASE CONTENTS ===\n")
    
    # Flights
    print("FLIGHTS:")
    cursor.execute("SELECT flight_number, status, departure_gate, scheduled_departure FROM flights LIMIT 5")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]} - Gate {row[2]} at {row[3]}")
    
    # Equipment
    print("\nEQUIPMENT:")
    cursor.execute("SELECT equipment_id, equipment_type, current_location, status FROM equipment LIMIT 5")
    for row in cursor.fetchall():
        print(f"  {row[0]} ({row[1]}): {row[2]} - {row[3]}")
    
    # Employees
    print("\nEMPLOYEES:")
    cursor.execute("SELECT first_name, last_name, role, status, current_location FROM employees LIMIT 5")
    for row in cursor.fetchall():
        print(f"  {row[0]} {row[1]} ({row[2]}): {row[3]} at {row[4]}")
    
    print("\n=== SAMPLE QUERIES TO TRY ===")
    print('- "Jarvis, what is the status of flight UA2406?"')
    print('- "Hey Jarvis, what pushback tractor is assigned to flight UA2406?"')
    print('- "Jarvis, who is the cleaning lead on flight UA2406?"')
    print('- "Hey Jarvis, what ramp team members are on break now?"')
    print('- "Jarvis, what is the nearest pushback tractor to gate A1?"')
    
    conn.close()

if __name__ == '__main__':
    import sys
    
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'united_airlines_normalized.db'
    
    print(f"Creating sample database: {db_path}")
    create_sample_database(db_path)
    print_sample_data(db_path)
    print(f"\nDatabase ready! Run 'python app.py' to start the voice assistant.") 