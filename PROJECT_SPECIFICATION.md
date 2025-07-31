# Basic Airport Operations Voice AI Assistant
## Gauntlet AI Challenge

**Project Category:** AI Solution Building

## Problem Statement

Hundreds of millions of frontline workers work in an analog environment without access to information or communication. These end-users are using their hands and eyes for their core job and screened devices are difficult to use in the environment and mostly banned because of safety risks. The result is spending a lot of time physically walking over to team members or parsing through printed documents, and this is a huge productivity drain.

## Business Context & Impact

This problem especially affects aviation operations workers, such as those working in the bag room or on the ramp at major commercial airports. Their ability to access information quickly directly affects how quickly they can turn aircraft and whether bags are lost and planes are delayed. Currently they often have to get on a cart to drive over to the ops center to find out the new gate of a flight, for example. By enabling every team member to access information through a voice interface, there can be huge productivity advances.

## Technical Requirements

- Must be web-based
- Must be speech in and speech out
- Programming languages: up to individual
- AI/ML frameworks: up to individual
  - Frontier will provide credit card for any expenses or credits
- Development tools: up to individual
  - Frontier will provide credit card for any expenses or credits
- Cloud platforms: up to individual
  - Frontier will provide credit card for any expenses or credits
- Other specific requirements: use the dataset "united_airlines_normalized (Gauntlet).db" and should not answer from internet
  - Can use this site (https://inloop.github.io/sqlite-viewer/) to access database

## Implementation Details

- **Greenfield Project:** Build from scratch in isolated environment

## Access & Resources

- Database file mentioned above

## Database Schema Reference

The `united_airlines_normalized.db` contains the following key tables:

### **flights** table:
- `flight_number` (TEXT): Unique flight identifier (e.g., 'UA2406')
- `status` (TEXT): Flight status ('On Time', 'Delayed', 'Departed', 'Boarding', etc.)
- `departure_gate`, `arrival_gate` (TEXT): Gate assignments
- `scheduled_departure`, `actual_departure` (DATETIME): Departure times
- `scheduled_arrival`, `actual_arrival` (DATETIME): Arrival times
- `aircraft_type` (TEXT): Aircraft model

### **equipment** table:
- `equipment_id` (TEXT): Unique equipment identifier (e.g., 'T-42')
- `equipment_type` (TEXT): Type ('Pushback Tractor', 'Luggage Cart', etc.)
- `assigned_flight` (TEXT): Currently assigned flight number
- `current_location` (TEXT): Current gate or location
- `status` (TEXT): Equipment status ('Available', 'Assigned', 'Maintenance')

### **employees** table:
- `employee_id` (TEXT): Unique employee identifier
- `first_name`, `last_name` (TEXT): Employee name
- `role` (TEXT): Job role ('Cleaning Lead', 'Ramp Agent', etc.)
- `department` (TEXT): Department ('Cleaning', 'Ramp', 'Maintenance', etc.)
- `phone_number` (TEXT): Contact number
- `shift_start`, `shift_end` (TIME): Work schedule
- `status` (TEXT): Current status ('Working', 'Break', etc.)

### **assignments** table:
- `flight_number` (TEXT): Flight assignment
- `employee_id` (TEXT): Assigned employee
- `equipment_id` (TEXT): Assigned equipment (optional)
- `assignment_type` (TEXT): Type of assignment ('Cleaning', 'Baggage Loading', etc.)
- `start_time`, `end_time` (DATETIME): Assignment schedule
- `status` (TEXT): Assignment status

### **gates** table:
- `gate_number` (TEXT): Gate identifier (e.g., 'A8')
- `terminal` (TEXT): Terminal location
- `current_flight` (TEXT): Currently assigned flight
- `equipment_nearby` (TEXT): Equipment at this gate

## Test Questions

- **What is the status of flight UA2406?**
  - Expected Answer: "Flight UA2406 is On Time"
  - Expected SQL: `SELECT status FROM flights WHERE flight_number = 'UA2406'`

- **What push back tractor is assigned to flight UA2406?**
  - Expected Answer: "Pushback tractor T-42 is assigned to flight UA2406"
  - Expected SQL: `SELECT equipment_id FROM equipment WHERE equipment_type = 'Pushback Tractor' AND assigned_flight = 'UA2406'`

- **Who is the cleaning lead on flight UA2406 and what is their phone number?**
  - Expected Answer: "Maria Rodriguez is the cleaning lead on flight UA2406. Her phone number is 555-0123"
  - Expected SQL: `SELECT e.first_name, e.last_name, e.phone_number FROM employees e JOIN assignments a ON e.employee_id = a.employee_id WHERE a.flight_number = 'UA2406' AND e.role = 'Cleaning Lead'`

- **When does Maria Rodriguez's shift end?**
  - Expected Answer: "Maria Rodriguez's shift ends at 2:00 PM (14:00)"
  - Expected SQL: `SELECT shift_end FROM employees WHERE first_name = 'Maria' AND last_name = 'Rodriguez'`

- **What is the nearest pushback tractor to gate A8? The one that was assigned to flight UA5678 broke down.**
  - Expected Answer: "The nearest available pushback tractor to gate A8 is T-17 at gate A1" (based on available equipment)
  - Expected SQL: `SELECT e.equipment_id, e.current_location FROM equipment e JOIN gates g ON e.current_location = g.gate_number WHERE e.equipment_type = 'Pushback Tractor' AND e.status = 'Available' ORDER BY ABS(CAST(SUBSTR(g.gate_number, 2) AS INTEGER) - 8) LIMIT 1`

- **What ramp team members are on break now?**
  - Expected Answer: "John Smith is currently on break"
  - Expected SQL: `SELECT first_name, last_name FROM employees WHERE department = 'Ramp' AND status = 'Break'`

- **What is John Smith's next flight assignment?**
  - Expected Answer: "I don't have information about John Smith's next flight assignment" or specific assignment if available in database
  - Expected SQL: `SELECT a.flight_number, a.assignment_type, a.start_time FROM assignments a JOIN employees e ON a.employee_id = e.employee_id WHERE e.first_name = 'John' AND e.last_name = 'Smith' AND a.start_time > datetime('now') ORDER BY a.start_time LIMIT 1`

## Success Criteria

### 1. Functional Requirements
- Wake word of "Jarvis" or "Hey Jarvis"
- Latency under 3 seconds (end of query to start of answer) for 80% of queries
- Speech input and speech output
- Says "I don't know" if it doesn't have high confidence in answer OR gives disclosure with the answer

### 2. Performance Benchmarks
- Latency
- Accuracy in answers (should be 90%+)
- Rate of answers versus "I don't know" / answer with disclosure with the latter ("I don't know" / answer with disclosure) being much preferred

### 3. Bonus
- Conversational or turn taking
- Instead of saying "I don't know", it asks clarifying questions

### 4. Code Quality Expectations
First, make it work

### 5. Time Constraints
None, except document how many hours it took

## Additional Considerations

1. Candidate support

## Submission Requirements

- Demo video sharing screen and with video asking questions
- Demo link
- Brief technical writeup (<1 page)

---
**STRICTLY CONFIDENTIAL** 