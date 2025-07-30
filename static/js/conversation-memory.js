// Conversational Memory System for JARVIS
// Provides context retention, reference resolution, and session management

class ConversationMemory {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.contextWindow = 10; // Number of exchanges to keep in active context
        this.maxContextAge = 30 * 60 * 1000; // 30 minutes in milliseconds
        
        // Conversation storage
        this.conversationHistory = [];
        this.activeContext = [];
        this.contextMap = new Map(); // For quick reference resolution
        this.entityTracker = new Map(); // Track entities mentioned
        
        // Context relevance weights
        this.relevanceWeights = {
            recency: 0.4,
            entityMatch: 0.3,
            topicSimilarity: 0.2,
            userReference: 0.1
        };
        
        // Initialize from session storage if available
        this.loadFromSession();
        
        console.log('ConversationMemory initialized with session:', this.sessionId);
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    addExchange(userQuery, assistantResponse, metadata = {}) {
        const exchange = {
            id: this.generateExchangeId(),
            timestamp: Date.now(),
            userQuery: userQuery,
            assistantResponse: assistantResponse,
            entities: this.extractEntities(userQuery),
            topics: this.extractTopics(userQuery),
            metadata: metadata
        };
        
        // Add to conversation history
        this.conversationHistory.push(exchange);
        
        // Update active context
        this.updateActiveContext(exchange);
        
        // Track entities
        this.updateEntityTracker(exchange);
        
        // Save to session storage
        this.saveToSession();
        
        console.log('Added conversation exchange:', exchange.id);
        return exchange.id;
    }
    
    generateExchangeId() {
        return 'exchange_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    }
    
    updateActiveContext(exchange) {
        this.activeContext.push(exchange);
        
        // Keep only recent exchanges in active context
        if (this.activeContext.length > this.contextWindow) {
            this.activeContext = this.activeContext.slice(-this.contextWindow);
        }
        
        // Remove expired context
        const now = Date.now();
        this.activeContext = this.activeContext.filter(
            ex => (now - ex.timestamp) < this.maxContextAge
        );
    }
    
    extractEntities(text) {
        const entities = {
            flights: [],
            gates: [],
            equipment: [],
            personnel: [],
            locations: [],
            times: []
        };
        
        const textLower = text.toLowerCase();
        
        // Flight numbers (pattern: letters followed by numbers)
        const flightPattern = /\b[a-z]{2,3}\s?\d{3,4}\b/gi;
        const flights = text.match(flightPattern) || [];
        entities.flights = flights.map(f => f.replace(/\s/g, '').toUpperCase());
        
        // Gates (A1, B12, etc.)
        const gatePattern = /\bgate\s+([a-z]\d+|\d+[a-z]?)\b/gi;
        const gateMatches = text.match(gatePattern) || [];
        entities.gates = gateMatches.map(g => g.replace(/gate\s+/i, '').toUpperCase());
        
        // Equipment (tractors, loaders, etc.)
        const equipmentKeywords = ['tractor', 'loader', 'pushback', 'belt', 'conveyor', 'truck'];
        equipmentKeywords.forEach(keyword => {
            if (textLower.includes(keyword)) {
                entities.equipment.push(keyword);
            }
        });
        
        // Personnel roles
        const roleKeywords = ['ramp', 'baggage', 'cleaning', 'maintenance', 'crew', 'team', 'lead', 'supervisor'];
        roleKeywords.forEach(role => {
            if (textLower.includes(role)) {
                entities.personnel.push(role);
            }
        });
        
        // Time expressions
        const timePattern = /\b\d{1,2}:\d{2}(\s?(am|pm))?\b/gi;
        const times = text.match(timePattern) || [];
        entities.times = times;
        
        return entities;
    }
    
    extractTopics(text) {
        const topics = [];
        const textLower = text.toLowerCase();
        
        // Topic categories based on airport operations
        const topicMap = {
            'flight_status': ['status', 'delay', 'on time', 'departure', 'arrival', 'cancelled'],
            'equipment': ['tractor', 'loader', 'equipment', 'maintenance', 'available'],
            'personnel': ['team', 'crew', 'staff', 'break', 'shift', 'schedule'],
            'location': ['gate', 'terminal', 'ramp', 'baggage', 'area'],
            'operations': ['cleaning', 'loading', 'unloading', 'service', 'ground']
        };
        
        Object.entries(topicMap).forEach(([topic, keywords]) => {
            if (keywords.some(keyword => textLower.includes(keyword))) {
                topics.push(topic);
            }
        });
        
        return topics;
    }
    
    updateEntityTracker(exchange) {
        Object.entries(exchange.entities).forEach(([entityType, entities]) => {
            entities.forEach(entity => {
                if (!this.entityTracker.has(entity)) {
                    this.entityTracker.set(entity, {
                        firstMentioned: exchange.timestamp,
                        lastMentioned: exchange.timestamp,
                        mentionCount: 1,
                        type: entityType,
                        contexts: [exchange.id]
                    });
                } else {
                    const entityData = this.entityTracker.get(entity);
                    entityData.lastMentioned = exchange.timestamp;
                    entityData.mentionCount++;
                    entityData.contexts.push(exchange.id);
                }
            });
        });
    }
    
    getContextForQuery(query) {
        const queryEntities = this.extractEntities(query);
        const queryTopics = this.extractTopics(query);
        const references = this.detectReferences(query);
        
        // Score context relevance
        const contextScores = this.activeContext.map(exchange => ({
            exchange,
            score: this.calculateRelevanceScore(exchange, queryEntities, queryTopics, references)
        }));
        
        // Sort by relevance and return top contexts
        contextScores.sort((a, b) => b.score - a.score);
        
        const relevantContext = contextScores
            .filter(item => item.score > 0.3) // Minimum relevance threshold
            .slice(0, 3) // Top 3 most relevant
            .map(item => item.exchange);
        
        return {
            relevantContext,
            entities: queryEntities,
            topics: queryTopics,
            references
        };
    }
    
    calculateRelevanceScore(exchange, queryEntities, queryTopics, references) {
        let score = 0;
        
        // Recency score
        const age = Date.now() - exchange.timestamp;
        const recencyScore = Math.max(0, 1 - (age / this.maxContextAge));
        score += recencyScore * this.relevanceWeights.recency;
        
        // Entity match score
        let entityMatches = 0;
        Object.entries(queryEntities).forEach(([type, entities]) => {
            const exchangeEntities = exchange.entities[type] || [];
            entityMatches += entities.filter(e => exchangeEntities.includes(e)).length;
        });
        const entityScore = Math.min(1, entityMatches / 3); // Normalize
        score += entityScore * this.relevanceWeights.entityMatch;
        
        // Topic similarity score
        const topicMatches = queryTopics.filter(topic => exchange.topics.includes(topic)).length;
        const topicScore = Math.min(1, topicMatches / Math.max(1, queryTopics.length));
        score += topicScore * this.relevanceWeights.topicSimilarity;
        
        // Reference score (if query references this exchange)
        const referenceScore = references.some(ref => ref.exchangeId === exchange.id) ? 1 : 0;
        score += referenceScore * this.relevanceWeights.userReference;
        
        return score;
    }
    
    detectReferences(query) {
        const references = [];
        const queryLower = query.toLowerCase();
        
        // Pronoun references
        const pronounPatterns = [
            { pattern: /\b(that|this|it)\b/, type: 'pronoun' },
            { pattern: /\b(before|earlier|previous)\b/, type: 'temporal' },
            { pattern: /\b(same|similar)\b/, type: 'similarity' }
        ];
        
        pronounPatterns.forEach(({ pattern, type }) => {
            if (pattern.test(queryLower)) {
                references.push({
                    type,
                    text: query.match(pattern)[0],
                    needsResolution: true
                });
            }
        });
        
        return references;
    }
    
    resolveReferences(query, context) {
        const references = this.detectReferences(query);
        let resolvedQuery = query;
        
        references.forEach(ref => {
            if (ref.needsResolution && context.relevantContext.length > 0) {
                const mostRecentContext = context.relevantContext[0];
                
                switch (ref.type) {
                    case 'pronoun':
                        // Replace pronouns with specific entities from context
                        const entities = mostRecentContext.entities;
                        if (entities.flights.length > 0) {
                            resolvedQuery = resolvedQuery.replace(
                                new RegExp(`\\b${ref.text}\\b`, 'gi'),
                                `flight ${entities.flights[0]}`
                            );
                        } else if (entities.gates.length > 0) {
                            resolvedQuery = resolvedQuery.replace(
                                new RegExp(`\\b${ref.text}\\b`, 'gi'),
                                `gate ${entities.gates[0]}`
                            );
                        }
                        break;
                        
                    case 'temporal':
                        // Add context about what was discussed before
                        resolvedQuery += ` (referring to ${mostRecentContext.userQuery})`;
                        break;
                        
                    case 'similarity':
                        // Add context about similar items
                        resolvedQuery += ` (like in the previous query about ${mostRecentContext.entities.flights[0] || 'the previous topic'})`;
                        break;
                }
            }
        });
        
        return resolvedQuery;
    }
    
    buildContextPrompt(query) {
        const context = this.getContextForQuery(query);
        const resolvedQuery = this.resolveReferences(query, context);
        
        if (context.relevantContext.length === 0) {
            return {
                enhancedQuery: resolvedQuery,
                contextPrompt: '',
                hasContext: false
            };
        }
        
        // Build context prompt for the AI
        let contextPrompt = '\nConversation Context:\n';
        context.relevantContext.forEach((exchange, index) => {
            contextPrompt += `${index + 1}. User asked: "${exchange.userQuery}"\n`;
            contextPrompt += `   Assistant responded: "${exchange.assistantResponse}"\n`;
        });
        
        contextPrompt += `\nCurrent query: "${resolvedQuery}"\n`;
        contextPrompt += 'Please consider the conversation context when answering.\n';
        
        return {
            enhancedQuery: resolvedQuery,
            contextPrompt,
            hasContext: true,
            relevantExchanges: context.relevantContext.length
        };
    }
    
    clearExpiredContext() {
        const now = Date.now();
        
        // Remove expired exchanges from active context
        this.activeContext = this.activeContext.filter(
            exchange => (now - exchange.timestamp) < this.maxContextAge
        );
        
        // Clean up entity tracker
        for (const [entity, data] of this.entityTracker.entries()) {
            if ((now - data.lastMentioned) > this.maxContextAge) {
                this.entityTracker.delete(entity);
            }
        }
        
        this.saveToSession();
    }
    
    resetSession() {
        this.sessionId = this.generateSessionId();
        this.conversationHistory = [];
        this.activeContext = [];
        this.contextMap.clear();
        this.entityTracker.clear();
        
        // Clear session storage
        sessionStorage.removeItem('jarvis_conversation_memory');
        
        console.log('Conversation memory reset. New session:', this.sessionId);
    }
    
    saveToSession() {
        try {
            const data = {
                sessionId: this.sessionId,
                conversationHistory: this.conversationHistory.slice(-20), // Keep last 20
                activeContext: this.activeContext,
                entityTracker: Array.from(this.entityTracker.entries()),
                lastSaved: Date.now()
            };
            
            sessionStorage.setItem('jarvis_conversation_memory', JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to save conversation memory to session storage:', error);
        }
    }
    
    loadFromSession() {
        try {
            const data = sessionStorage.getItem('jarvis_conversation_memory');
            if (data) {
                const parsed = JSON.parse(data);
                
                // Check if session is too old (24 hours)
                const age = Date.now() - (parsed.lastSaved || 0);
                if (age > 24 * 60 * 60 * 1000) {
                    console.log('Session too old, starting fresh');
                    return;
                }
                
                this.sessionId = parsed.sessionId || this.sessionId;
                this.conversationHistory = parsed.conversationHistory || [];
                this.activeContext = parsed.activeContext || [];
                
                // Restore entity tracker
                if (parsed.entityTracker) {
                    this.entityTracker = new Map(parsed.entityTracker);
                }
                
                console.log('Loaded conversation memory from session storage');
            }
        } catch (error) {
            console.warn('Failed to load conversation memory from session storage:', error);
        }
    }
    
    getSessionStats() {
        return {
            sessionId: this.sessionId,
            totalExchanges: this.conversationHistory.length,
            activeContextSize: this.activeContext.length,
            entitiesTracked: this.entityTracker.size,
            sessionAge: Date.now() - (this.conversationHistory[0]?.timestamp || Date.now())
        };
    }
    
    // Development helper methods
    debugContext() {
        console.log('=== Conversation Memory Debug ===');
        console.log('Session ID:', this.sessionId);
        console.log('Total exchanges:', this.conversationHistory.length);
        console.log('Active context:', this.activeContext.length);
        console.log('Entities tracked:', this.entityTracker.size);
        console.log('Recent exchanges:', this.activeContext.slice(-3));
        console.log('================================');
    }
    
    exportMemory() {
        return {
            sessionId: this.sessionId,
            conversationHistory: this.conversationHistory,
            activeContext: this.activeContext,
            entityTracker: Array.from(this.entityTracker.entries()),
            stats: this.getSessionStats()
        };
    }
}
