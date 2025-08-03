# Quick Wins Implementation Plan: Text-to-SQL Improvements

## Overview
This document outlines the implementation plan for the two quick wins identified:
1. **Advanced Prompt Engineering** (1-2 weeks)
2. **Enhanced Schema Integration** (2-3 weeks)

Total timeline: **3-5 weeks**

---

## Phase 1: Advanced Prompt Engineering (Week 1-2)

### Goal
Improve query accuracy by 15-25% through sophisticated prompt engineering without major infrastructure changes.

### Implementation Steps

#### Step 1.1: Create Query Classification System (2 days)
```python
# File: query_classifier.py (NEW)
class QueryClassifier:
    def __init__(self):
        self.query_types = {
            'flight_status': ['status', 'flight', 'delayed', 'on time'],
            'equipment_assignment': ['equipment', 'assigned', 'tractor', 'pushback'],
            'personnel_info': ['who', 'employee', 'shift', 'contact'],
            'location_query': ['where', 'gate', 'location', 'nearest'],
            'time_query': ['when', 'schedule', 'time', 'shift end']
        }
    
    def classify_query(self, user_query):
        """Classify query type for targeted prompt selection"""
        # Implementation details
        pass
```

#### Step 1.2: Build Dynamic Example Selection (2 days)
```python
# Enhancement to app.py parse_query_to_sql method
def get_relevant_examples(self, query_type, language='en'):
    """Get most relevant examples based on query classification"""
    examples_by_type = {
        'flight_status': [
            '"What is the status of flight UA2406?" -> SELECT * FROM flights WHERE flight_number = \'UA2406\';',
            '"Is flight UA406 delayed?" -> SELECT flight_number, status, scheduled_departure, actual_departure FROM flights WHERE flight_number LIKE \'%UA406%\';'
        ],
        'equipment_assignment': [
            '"What pushback tractor is assigned to flight UA2406?" -> SELECT * FROM equipment WHERE assigned_flight = \'UA2406\' AND equipment_type = \'Pushback Tractor\';',
            '"Which equipment is available at gate A8?" -> SELECT * FROM equipment WHERE current_location = \'A8\' AND status = \'Available\';'
        ],
        # ... more examples by type
    }
    return examples_by_type.get(query_type, examples_by_type['flight_status'])
```

#### Step 1.3: Implement Chain-of-Thought Prompting (2 days)
```python
def build_reasoning_prompt(self, user_query, query_type):
    """Build step-by-step reasoning prompt"""
    reasoning_steps = {
        'flight_status': """
        Think step by step:
        1. Extract the flight number from the query
        2. Determine what status information is needed
        3. Check if additional details like gates or times are requested
        4. Build query to get comprehensive flight information
        """,
        'equipment_assignment': """
        Think step by step:
        1. Identify the equipment type mentioned
        2. Determine if query is about assignment or availability
        3. Check if location context is provided
        4. Build query considering equipment status and location
        """
    }
    return reasoning_steps.get(query_type, reasoning_steps['flight_status'])
```

#### Step 1.4: Add Domain-Specific Rules (1 day)
```python
def get_airport_domain_rules(self):
    """Airport operations specific rules for query generation"""
    return """
    AIRPORT OPERATIONS RULES:
    - Flight numbers: Always try exact match first (flight_number = 'UA2406'), then pattern (LIKE '%UA406%')
    - Status queries: Use LIKE for flexible matching - 'delayed', 'boarding', 'departed'
    - Equipment: Consider both assignment and availability status
    - Personnel: Include shift timing and current location context
    - Gates: Cross-reference with current flight assignments
    - Time queries: Focus on operational status over scheduled times for "now" or "today"
    """
```

#### Step 1.5: Testing & Validation (1 day)
- Create test suite with 50+ query variations
- A/B test against current implementation
- Measure accuracy improvement

**Phase 1 Deliverables:**
- Enhanced prompt system with classification
- 15-25% accuracy improvement
- Comprehensive test coverage

---

## Phase 2: Enhanced Schema Integration (Week 3-5)

### Goal
Provide AI with richer database context including relationships, constraints, and business context.

### Implementation Steps

#### Step 2.1: Create Enhanced Schema Representation (3 days)
```python
# File: enhanced_schema.py (NEW)
class EnhancedSchemaManager:
    def __init__(self, db_connection):
        self.conn = db_connection
        self.schema_cache = {}
        
    def get_enhanced_schema(self):
        """Generate comprehensive schema with relationships and context"""
        return {
            'flights': {
                'table_description': 'Core flight operations data with real-time status',
                'columns': {
                    'flight_number': {
                        'type': 'VARCHAR(10)',
                        'constraints': ['PRIMARY KEY', 'NOT NULL'],
                        'description': 'Unique flight identifier (e.g., UA2406)',
                        'examples': ['UA2406', 'AA1234', 'DL5678']
                    },
                    'status': {
                        'type': 'VARCHAR(50)',
                        'possible_values': ['On Time', 'Delayed', 'Boarding', 'Departed', 'Cancelled'],
                        'description': 'Current operational status of the flight'
                    },
                    # ... more columns
                },
                'relationships': [
                    {
                        'table': 'assignments',
                        'type': 'one_to_many',
                        'foreign_key': 'flight_number',
                        'description': 'Flight can have multiple crew/equipment assignments'
                    }
                ],
                'common_queries': [
                    'Flight status lookups',
                    'Gate assignments',
                    'Departure/arrival times'
                ]
            }
            # ... other tables
        }
```

#### Step 2.2: Add Relationship Mapping (2 days)
```python
def build_relationship_context(self, schema):
    """Build context about table relationships for AI"""
    relationships = []
    
    for table_name, table_info in schema.items():
        for rel in table_info.get('relationships', []):
            relationships.append(f"""
            {table_name} -> {rel['table']} ({rel['type']}):
            {rel['description']}
            JOIN example: {self.generate_join_example(table_name, rel)}
            """)
    
    return "\n".join(relationships)

def generate_join_example(self, table1, relationship):
    """Generate example JOIN syntax for relationship"""
    if relationship['table'] == 'assignments':
        return f"JOIN assignments a ON {table1}.flight_number = a.flight_number"
    # ... more JOIN examples
```

#### Step 2.3: Implement Business Context Integration (2 days)
```python
def get_business_context(self, query_type):
    """Provide business context for different query types"""
    contexts = {
        'flight_status': """
        BUSINESS CONTEXT:
        - Users typically want comprehensive flight info, not just status
        - Include gate, timing, and aircraft info when available
        - "Delayed" status should include reason if available
        """,
        'equipment_assignment': """
        BUSINESS CONTEXT:
        - Equipment can be assigned, available, or under maintenance
        - Location proximity matters for efficiency
        - Consider operator assignments for equipment
        """,
        'personnel_info': """
        BUSINESS CONTEXT:
        - Include contact info, shift details, and current location
        - Cross-reference with current assignments
        - Consider break/availability status
        """
    }
    return contexts.get(query_type, '')
```

#### Step 2.4: Schema Validation & Error Handling (2 days)
```python
def validate_schema_consistency(self, schema):
    """Validate schema for consistency and completeness"""
    validation_results = {
        'missing_relationships': [],
        'orphaned_foreign_keys': [],
        'missing_descriptions': [],
        'inconsistent_types': []
    }
    
    # Check for missing relationship definitions
    # Validate foreign key references
    # Ensure all tables have business context
    
    return validation_results

def handle_schema_errors(self, error_type, details):
    """Handle schema-related errors gracefully"""
    fallback_strategies = {
        'missing_table': lambda: self.get_basic_schema(),
        'invalid_relationship': lambda: self.use_simple_joins(),
        'outdated_schema': lambda: self.refresh_schema_cache()
    }
    return fallback_strategies.get(error_type, lambda: None)()
```

#### Step 2.5: Integration with Existing System (2 days)
```python
# Modify existing parse_query_to_sql method in app.py
def parse_query_to_sql(self, user_query, schema, language='en', context_prompt=''):
    """Enhanced version with rich schema context"""
    
    # Get enhanced schema
    enhanced_schema = self.enhanced_schema_manager.get_enhanced_schema()
    
    # Classify query type
    query_type = self.query_classifier.classify_query(user_query)
    
    # Get relevant examples and context
    examples = self.get_relevant_examples(query_type, language)
    business_context = self.get_business_context(query_type)
    relationship_context = self.build_relationship_context(enhanced_schema)
    
    # Build comprehensive prompt
    enhanced_prompt = f"""
    {self.build_reasoning_prompt(user_query, query_type)}
    
    ENHANCED DATABASE SCHEMA:
    {self.format_enhanced_schema(enhanced_schema)}
    
    RELATIONSHIPS:
    {relationship_context}
    
    {business_context}
    
    {self.get_airport_domain_rules()}
    
    RELEVANT EXAMPLES:
    {chr(10).join(examples)}
    
    User Query: "{user_query}"
    
    Generate SQLite-compatible SQL query:
    """
    
    # Rest of the method remains similar
```

#### Step 2.6: Performance Optimization (1 day)
```python
def cache_schema_context(self):
    """Cache expensive schema operations"""
    if 'enhanced_schema' not in self.schema_cache:
        self.schema_cache['enhanced_schema'] = self.get_enhanced_schema()
        self.schema_cache['relationship_context'] = self.build_relationship_context(
            self.schema_cache['enhanced_schema']
        )
    return self.schema_cache

def update_schema_cache(self, force=False):
    """Update schema cache when database changes"""
    if force or self.is_schema_outdated():
        self.schema_cache.clear()
        self.cache_schema_context()
```

#### Step 2.7: Testing & Validation (2 days)
- Test with complex queries requiring multiple JOINs
- Validate relationship context accuracy
- Performance testing with enhanced prompts
- Accuracy measurement against current system

**Phase 2 Deliverables:**
- Rich schema representation with relationships
- Business context integration
- 40-60% accuracy improvement (combined with Phase 1)
- Maintained or improved performance

---

## Success Criteria

### Phase 1 (Advanced Prompt Engineering)
- [ ] 15-25% improvement in query accuracy
- [ ] Successful classification of 90%+ query types
- [ ] No performance degradation
- [ ] Comprehensive test coverage (50+ test cases)

### Phase 2 (Enhanced Schema Integration)
- [ ] 40-60% total improvement in query accuracy (cumulative)
- [ ] Successful handling of complex multi-table queries
- [ ] Schema validation catches 95%+ of potential issues
- [ ] Response time under 2 seconds for 95% of queries

### Combined Success Metrics
- [ ] User satisfaction improvement (measured via feedback)
- [ ] Reduced "I don't know" responses by 50%+
- [ ] Better handling of speech recognition errors
- [ ] Improved query explanation capabilities

## Risk Mitigation

1. **Prompt Size Growth**: Monitor token usage and implement prompt optimization
2. **Performance Impact**: Benchmark each change and optimize hot paths
3. **Accuracy Regression**: Maintain comprehensive test suite with before/after comparisons
4. **Complexity Management**: Modular design allows individual feature rollback

## Testing Strategy

1. **Unit Tests**: Each new component has comprehensive unit tests
2. **Integration Tests**: Test end-to-end query flow with various query types
3. **Performance Tests**: Benchmark response times and accuracy
4. **A/B Testing**: Run parallel systems to measure improvement
5. **User Acceptance Testing**: Test with real airport operation scenarios

## Timeline Summary

| Week | Phase | Tasks |
|------|-------|-------|
| 1 | Phase 1 | Query classification, example selection, reasoning prompts |
| 2 | Phase 1 | Domain rules, testing, validation |
| 3 | Phase 2 | Enhanced schema representation, relationship mapping |
| 4 | Phase 2 | Business context, validation, error handling |
| 5 | Phase 2 | Integration, optimization, testing |

**Total Duration: 5 weeks**
**Expected ROI: 40-60% accuracy improvement with minimal infrastructure changes**