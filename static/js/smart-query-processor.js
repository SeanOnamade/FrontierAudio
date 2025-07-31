// Smart Query Processing System for JARVIS
// Handles query clarification, suggestions, auto-completion, and expansion

console.log('🔄 Loading smart-query-processor.js...');

class SmartQueryProcessor {
    constructor() {
        console.log('🔧 SmartQueryProcessor constructor called');
        this.commonQueries = new Map();
        this.queryPatterns = new Map();
        console.log('📝 About to create AmbiguityDetector...');
        this.ambiguityDetector = new AmbiguityDetector();
        console.log('📝 About to create SuggestionEngine...');
        this.suggestionEngine = new SuggestionEngine();
        console.log('📝 About to create QueryAutoCompleter...');
        this.autoCompleter = new QueryAutoCompleter();
        
        // Aviation-specific terminology and synonyms
        this.aviationTerms = {
            aircraft: ['plane', 'airplane', 'aircraft', 'bird'],
            flight: ['flight', 'route', 'trip'],
            gate: ['gate', 'door', 'stand'],
            delay: ['delay', 'late', 'behind schedule', 'postponed'],
            equipment: ['equipment', 'gear', 'machinery', 'tools'],
            crew: ['crew', 'team', 'staff', 'personnel', 'workers'],
            maintenance: ['maintenance', 'repair', 'service', 'fix'],
            baggage: ['baggage', 'luggage', 'bags', 'cargo'],
            ramp: ['ramp', 'tarmac', 'apron', 'ground'],
            pushback: ['pushback', 'push back', 'tow', 'move']
        };
        
        // Query expansion rules
        this.expansionRules = new Map([
            ['status', ['current status', 'latest information', 'update']],
            ['location', ['where is', 'position of', 'find']],
            ['assignment', ['assigned to', 'working on', 'responsible for']],
            ['schedule', ['scheduled', 'timetable', 'when', 'time']]
        ]);
        
        this.initialize();
    }
    
    initialize() {
        this.loadCommonQueries();
        this.setupQueryPatterns();
        console.log('SmartQueryProcessor initialized');
    }
    
    loadCommonQueries() {
        // Pre-populate with common airport operations queries
        const queries = [
            { pattern: 'flight status', template: 'What is the status of flight {flight}?' },
            { pattern: 'gate assignment', template: 'Which gate is flight {flight} at?' },
            { pattern: 'equipment location', template: 'Where is {equipment} located?' },
            { pattern: 'crew assignment', template: 'Who is assigned to {flight}?' },
            { pattern: 'delay information', template: 'What delays are there for {flight}?' },
            { pattern: 'baggage status', template: 'What is the baggage status for {flight}?' },
            { pattern: 'maintenance status', template: 'What is the maintenance status of {equipment}?' },
            { pattern: 'break schedule', template: 'Who is on break in {department}?' },
            { pattern: 'pushback assignment', template: 'Which tractor is assigned to {flight}?' },
            { pattern: 'cleaning status', template: 'Has {flight} been cleaned?' }
        ];
        
        queries.forEach(query => {
            this.commonQueries.set(query.pattern, query.template);
        });
    }
    
    setupQueryPatterns() {
        // Define patterns for different types of queries
        this.queryPatterns.set('flight_status', {
            keywords: ['status', 'flight'],
            required: ['flight_number'],
            template: 'flight status inquiry'
        });
        
        this.queryPatterns.set('equipment_location', {
            keywords: ['where', 'location', 'find'],
            required: ['equipment_type'],
            template: 'equipment location inquiry'
        });
        
        this.queryPatterns.set('crew_assignment', {
            keywords: ['who', 'assigned', 'crew', 'team'],
            required: ['flight_number', 'role'],
            template: 'crew assignment inquiry'
        });
    }
    
    async processQuery(query, conversationContext = null) {
        const startTime = Date.now();
        
        // Step 1: Analyze the query
        const analysis = this.analyzeQuery(query);
        
        // Step 2: Check for ambiguities
        const ambiguityResult = this.ambiguityDetector.detectAmbiguities(query, analysis);
        
        // Step 3: Expand the query if needed
        const expandedQuery = this.expandQuery(query, conversationContext);
        
        // Step 4: Generate suggestions
        const suggestions = this.suggestionEngine.generateSuggestions(query, analysis, conversationContext);
        
        const processingTime = Date.now() - startTime;
        
        return {
            originalQuery: query,
            expandedQuery: expandedQuery,
            analysis: analysis,
            ambiguities: ambiguityResult,
            suggestions: suggestions,
            needsClarification: ambiguityResult.isAmbiguous,
            processingTime: processingTime
        };
    }
    
    analyzeQuery(query) {
        const tokens = this.tokenize(query);
        const entities = this.extractEntities(query);
        const intent = this.detectIntent(query, tokens);
        const confidence = this.calculateConfidence(query, tokens, entities, intent);
        
        return {
            tokens,
            entities,
            intent,
            confidence,
            queryType: this.classifyQuery(query, intent),
            missingElements: this.detectMissingElements(query, intent)
        };
    }
    
    tokenize(query) {
        return query.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(token => token.length > 0);
    }
    
    extractEntities(query) {
        const entities = {
            flights: [],
            gates: [],
            equipment: [],
            personnel: [],
            departments: [],
            times: []
        };
        
        // Flight numbers
        const flightPattern = /\b[a-z]{2,3}\s?\d{3,4}\b/gi;
        entities.flights = [...(query.match(flightPattern) || [])];
        
        // Gates
        const gatePattern = /\bgate\s+([a-z]?\d+[a-z]?)\b/gi;
        const gateMatches = query.match(gatePattern) || [];
        entities.gates = gateMatches.map(g => g.replace(/gate\s+/i, ''));
        
        // Equipment types
        const equipmentTerms = ['tractor', 'loader', 'belt', 'conveyor', 'truck', 'pushback'];
        entities.equipment = equipmentTerms.filter(term => 
            query.toLowerCase().includes(term)
        );
        
        // Departments
        const departments = ['ramp', 'baggage', 'cleaning', 'maintenance', 'crew', 'ground'];
        entities.departments = departments.filter(dept => 
            query.toLowerCase().includes(dept)
        );
        
        // Time expressions
        const timePattern = /\b\d{1,2}:\d{2}(\s?(am|pm))?\b/gi;
        entities.times = [...(query.match(timePattern) || [])];
        
        return entities;
    }
    
    detectIntent(query, tokens) {
        const intentPatterns = {
            STATUS_INQUIRY: ['status', 'what', 'how', 'is'],
            LOCATION_INQUIRY: ['where', 'location', 'find', 'locate'],
            ASSIGNMENT_INQUIRY: ['who', 'assigned', 'responsible'],
            SCHEDULE_INQUIRY: ['when', 'time', 'schedule'],
            AVAILABILITY_INQUIRY: ['available', 'free', 'busy'],
            UPDATE_REQUEST: ['update', 'change', 'modify'],
            LIST_REQUEST: ['list', 'show', 'all']
        };
        
        let bestIntent = 'UNKNOWN';
        let maxScore = 0;
        
        Object.entries(intentPatterns).forEach(([intent, keywords]) => {
            const score = keywords.reduce((acc, keyword) => {
                return acc + (tokens.includes(keyword) ? 1 : 0);
            }, 0) / keywords.length;
            
            if (score > maxScore) {
                maxScore = score;
                bestIntent = intent;
            }
        });
        
        return {
            intent: bestIntent,
            confidence: maxScore,
            keywords: intentPatterns[bestIntent] || []
        };
    }
    
    classifyQuery(query, intent) {
        const types = {
            'STATUS_INQUIRY': 'information_request',
            'LOCATION_INQUIRY': 'location_request',
            'ASSIGNMENT_INQUIRY': 'assignment_request',
            'SCHEDULE_INQUIRY': 'schedule_request',
            'AVAILABILITY_INQUIRY': 'availability_request',
            'UPDATE_REQUEST': 'action_request',
            'LIST_REQUEST': 'list_request'
        };
        
        return types[intent.intent] || 'general_inquiry';
    }
    
    detectMissingElements(query, intent) {
        const missing = [];
        
        // Check for required elements based on intent
        switch (intent.intent) {
            case 'STATUS_INQUIRY':
                if (!this.hasFlightNumber(query) && !this.hasEquipment(query)) {
                    missing.push('subject_identifier');
                }
                break;
                
            case 'LOCATION_INQUIRY':
                if (!this.hasEquipment(query) && !this.hasPersonnel(query)) {
                    missing.push('target_object');
                }
                break;
                
            case 'ASSIGNMENT_INQUIRY':
                if (!this.hasFlightNumber(query) && !this.hasEquipment(query)) {
                    missing.push('assignment_target');
                }
                break;
        }
        
        return missing;
    }
    
    hasFlightNumber(query) {
        return /\b[a-z]{2,3}\s?\d{3,4}\b/i.test(query);
    }
    
    hasEquipment(query) {
        const equipmentTerms = ['tractor', 'loader', 'belt', 'conveyor', 'truck'];
        return equipmentTerms.some(term => query.toLowerCase().includes(term));
    }
    
    hasPersonnel(query) {
        const personnelTerms = ['crew', 'team', 'staff', 'worker', 'lead'];
        return personnelTerms.some(term => query.toLowerCase().includes(term));
    }
    
    calculateConfidence(query, tokens, entities, intent) {
        let confidence = 0;
        
        // Base confidence from intent detection
        confidence += intent.confidence * 0.4;
        
        // Boost for recognized entities
        const entityCount = Object.values(entities).flat().length;
        confidence += Math.min(entityCount / 3, 1) * 0.3;
        
        // Boost for aviation terminology
        const aviationTermCount = tokens.filter(token => 
            Object.values(this.aviationTerms).flat().includes(token)
        ).length;
        confidence += Math.min(aviationTermCount / tokens.length, 0.5) * 0.3;
        
        return Math.min(confidence, 1);
    }
    
    expandQuery(query, conversationContext) {
        let expanded = query;
        
        // Add synonyms for aviation terms
        Object.entries(this.aviationTerms).forEach(([canonical, synonyms]) => {
            synonyms.forEach(synonym => {
                if (query.toLowerCase().includes(synonym) && synonym !== canonical) {
                    expanded += ` (${canonical})`;
                }
            });
        });
        
        // Add context from conversation if available
        if (conversationContext && conversationContext.relevantContext.length > 0) {
            const recentContext = conversationContext.relevantContext[0];
            
            // Add implied subjects from context
            if (!this.hasFlightNumber(query) && recentContext.entities.flights.length > 0) {
                expanded += ` [Context: regarding flight ${recentContext.entities.flights[0]}]`;
            }
        }
        
        return expanded;
    }
    
    getQuerySuggestions(partialQuery) {
        return this.autoCompleter.getSuggestions(partialQuery);
    }
}

// Ambiguity Detection Component
class AmbiguityDetector {
    constructor() {
        this.ambiguityPatterns = [
            {
                name: 'missing_flight_number',
                pattern: /\b(flight|plane)\b(?!\s+[a-z]{2,3}\s?\d+)/i,
                message: 'Which flight are you asking about?'
            },
            {
                name: 'vague_equipment',
                pattern: /\b(equipment|gear)\b(?!\s+(tractor|loader|belt))/i,
                message: 'What type of equipment do you mean?'
            },
            {
                name: 'unclear_person',
                pattern: /\b(who|person|guy)\b/i,
                message: 'Which team member or role are you referring to?'
            },
            {
                name: 'multiple_possible_meanings',
                pattern: /\b(it|that|this)\b/i,
                message: 'What specifically are you referring to?'
            }
        ];
    }
    
    detectAmbiguities(query, analysis) {
        const ambiguities = [];
        
        this.ambiguityPatterns.forEach(pattern => {
            if (pattern.pattern.test(query)) {
                ambiguities.push({
                    type: pattern.name,
                    message: pattern.message,
                    severity: this.calculateSeverity(pattern.name, analysis)
                });
            }
        });
        
        // Check for context-dependent ambiguities
        if (analysis.missingElements.length > 0) {
            ambiguities.push({
                type: 'missing_required_info',
                message: 'I need more information to help you with that.',
                severity: 0.8
            });
        }
        
        const isAmbiguous = ambiguities.some(amb => amb.severity > 0.6);
        
        return {
            isAmbiguous,
            ambiguities,
            clarificationNeeded: isAmbiguous,
            suggestions: this.generateClarificationSuggestions(ambiguities)
        };
    }
    
    calculateSeverity(patternName, analysis) {
        // Base severity
        let severity = 0.5;
        
        // Increase severity if confidence is low
        if (analysis.confidence < 0.5) {
            severity += 0.3;
        }
        
        // Increase severity for critical missing elements
        if (patternName === 'missing_flight_number' && analysis.intent.intent === 'STATUS_INQUIRY') {
            severity += 0.4;
        }
        
        return Math.min(severity, 1);
    }
    
    generateClarificationSuggestions(ambiguities) {
        const suggestions = [];
        
        ambiguities.forEach(ambiguity => {
            switch (ambiguity.type) {
                case 'missing_flight_number':
                    suggestions.push('Please specify the flight number (e.g., UA2406)');
                    break;
                case 'vague_equipment':
                    suggestions.push('Please specify the equipment type (tractor, loader, belt loader, etc.)');
                    break;
                case 'unclear_person':
                    suggestions.push('Please specify the role or name (cleaning lead, ramp team, etc.)');
                    break;
                default:
                    suggestions.push('Could you be more specific?');
            }
        });
        
        return suggestions;
    }
}

// Suggestion Engine Component
class SuggestionEngine {
    constructor() {
        this.followUpTemplates = {
            flight_status: [
                'Would you like to know the gate assignment for this flight?',
                'Do you need information about baggage loading?',
                'Would you like to see the crew assignments?'
            ],
            equipment_location: [
                'Would you like to know the maintenance status?',
                'Do you need to assign this equipment to a flight?',
                'Would you like to see other available equipment?'
            ],
            crew_assignment: [
                'Would you like to see their contact information?',
                'Do you need to know their break schedule?',
                'Would you like to see other team members?'
            ]
        };
    }
    
    generateSuggestions(query, analysis, conversationContext) {
        const suggestions = {
            followUp: [],
            clarification: [],
            related: [],
            autoComplete: []
        };
        
        // Generate follow-up suggestions based on query type
        const queryType = analysis.queryType;
        if (this.followUpTemplates[queryType]) {
            suggestions.followUp = this.followUpTemplates[queryType].slice(0, 2);
        }
        
        // Generate related query suggestions
        suggestions.related = this.generateRelatedSuggestions(analysis);
        
        // Generate clarification suggestions if needed
        if (analysis.missingElements.length > 0) {
            suggestions.clarification = this.generateClarificationSuggestions(analysis);
        }
        
        return suggestions;
    }
    
    generateRelatedSuggestions(analysis) {
        const related = [];
        
        // Extract entities and suggest related queries
        analysis.entities.flights.forEach(flight => {
            related.push(`What gate is ${flight} at?`);
            related.push(`Who is the crew for ${flight}?`);
        });
        
        analysis.entities.equipment.forEach(equipment => {
            related.push(`Where is the ${equipment} located?`);
            related.push(`Is the ${equipment} available?`);
        });
        
        return related.slice(0, 3); // Limit to 3 suggestions
    }
    
    generateClarificationSuggestions(analysis) {
        const suggestions = [];
        
        analysis.missingElements.forEach(element => {
            switch (element) {
                case 'subject_identifier':
                    suggestions.push('Please specify which flight or equipment you\'re asking about');
                    break;
                case 'target_object':
                    suggestions.push('What would you like to locate?');
                    break;
                case 'assignment_target':
                    suggestions.push('Which flight or task are you asking about?');
                    break;
            }
        });
        
        return suggestions;
    }
}

// Auto-completion Component
class QueryAutoCompleter {
    constructor() {
        this.commonCompletions = [
            'What is the status of flight',
            'Where is the pushback tractor',
            'Who is assigned to flight',
            'What gate is flight',
            'Is the cleaning crew available',
            'What equipment is at gate',
            'When is the next break for',
            'What is the delay for flight',
            'Where is the baggage for flight',
            'Who is the lead for'
        ];
        
        this.flightNumbers = ['UA2406', 'AA1234', 'DL5678', 'SW9012'];
        this.equipmentTypes = ['pushback tractor', 'belt loader', 'baggage cart', 'fuel truck'];
        this.gates = ['A1', 'A2', 'B6', 'B12', 'C3', 'C8'];
    }
    
    getSuggestions(partialQuery) {
        const partial = partialQuery.toLowerCase().trim();
        
        if (partial.length < 2) {
            return [];
        }
        
        const suggestions = [];
        
        // Match common completions
        this.commonCompletions.forEach(completion => {
            if (completion.toLowerCase().startsWith(partial)) {
                suggestions.push(completion);
            }
        });
        
        // Smart completions based on context
        if (partial.includes('flight') && !this.hasFlightNumber(partialQuery)) {
            this.flightNumbers.forEach(flight => {
                suggestions.push(`${partialQuery} ${flight}`);
            });
        }
        
        if (partial.includes('gate') && !this.hasGateNumber(partialQuery)) {
            this.gates.forEach(gate => {
                suggestions.push(`${partialQuery} ${gate}`);
            });
        }
        
        if (partial.includes('equipment') || partial.includes('tractor')) {
            this.equipmentTypes.forEach(equipment => {
                if (!partialQuery.includes(equipment)) {
                    suggestions.push(`${partialQuery} ${equipment}`);
                }
            });
        }
        
        return suggestions.slice(0, 5); // Limit to 5 suggestions
    }
    
    hasFlightNumber(query) {
        return /\b[a-z]{2,3}\s?\d{3,4}\b/i.test(query);
    }
    
    hasGateNumber(query) {
        return /\bgate\s+[a-z]?\d+[a-z]?\b/i.test(query);
    }
}

console.log('✅ SmartQueryProcessor class definition completed');
console.log('SmartQueryProcessor type:', typeof SmartQueryProcessor);
