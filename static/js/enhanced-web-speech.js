/**
 * Enhanced Web Speech API Implementation
 * Part of Hybrid Speech Recognition System
 * 
 * Implements Task 2: Web Speech API optimization with confidence scoring,
 * error recovery, and performance enhancements for airport environments
 */

class EnhancedWebSpeechAPI {
    constructor(options = {}) {
        // Core Web Speech API
        this.recognition = null;
        this.isListening = false;
        this.isInitialized = false;
        
        // Configuration
        this.config = {
            continuous: options.continuous ?? true,
            interimResults: options.interimResults ?? true,
            language: options.language ?? 'en-US',
            maxAlternatives: options.maxAlternatives ?? 3, // Increased for better confidence analysis
            
            // Enhanced features
            enableConfidenceNormalization: options.enableConfidenceNormalization ?? true,
            enableErrorRecovery: options.enableErrorRecovery ?? true,
            enableAviationOptimization: options.enableAviationOptimization ?? true,
            
            // Retry configuration
            maxRetries: options.maxRetries ?? 3,
            retryDelay: options.retryDelay ?? 1000, // Base delay in ms
            exponentialBackoff: options.exponentialBackoff ?? true
        };
        
        // Confidence enhancement (Task 2.1)
        this.confidenceNormalizer = new ConfidenceNormalizer();
        this.lastResults = [];
        this.confidenceHistory = [];
        
        // Error recovery (Task 2.2)
        this.errorRecovery = new ErrorRecoveryManager(this.config);
        this.retryCount = 0;
        this.lastError = null;
        this.retryTimeout = null; // Track retry timeouts for cleanup
        
        // Performance optimization (Task 2.3)
        this.aviationOptimizer = new AviationTerminologyOptimizer();
        this.performanceMetrics = {
            recognitionAttempts: 0,
            successfulRecognitions: 0,
            averageLatency: 0,
            confidenceScores: [],
            errorCounts: {}
        };
        
        // Callbacks
        this.onResult = null;
        this.onError = null;
        this.onStart = null;
        this.onEnd = null;
        this.onConfidenceUpdate = null;
        this.onPerformanceUpdate = null;
        
        this.init();
    }
    
    /**
     * Initialize Enhanced Web Speech API
     */
    async init() {
        try {
            if (!this.isWebSpeechSupported()) {
                throw new Error('Web Speech API not supported in this browser');
            }
            
            this.setupSpeechRecognition();
            this.isInitialized = true;
            
            console.log('✅ Enhanced Web Speech API initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Enhanced Web Speech API:', error);
            throw error;
        }
    }
    
    /**
     * Check Web Speech API support
     */
    isWebSpeechSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }
    
    /**
     * Setup SpeechRecognition with enhanced configuration
     */
    setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Apply configuration
        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.lang = this.config.language;
        this.recognition.maxAlternatives = this.config.maxAlternatives;
        
        // Aviation-specific optimizations
        if (this.config.enableAviationOptimization) {
            this.aviationOptimizer.applyOptimizations(this.recognition);
        }
        
        // Setup event handlers
        this.setupEventHandlers();
    }
    
    /**
     * Setup enhanced event handlers
     */
    setupEventHandlers() {
        // Start event
        this.recognition.onstart = () => {
            this.isListening = true;
            this.performanceMetrics.recognitionAttempts++;
            
            if (this.onStart) {
                this.onStart();
            }
        };
        
        // Result event with confidence enhancement
        this.recognition.onresult = (event) => {
            this.handleResult(event);
        };
        
        // Error event with recovery
        this.recognition.onerror = (event) => {
            this.handleError(event);
        };
        
        // End event with auto-restart logic
        this.recognition.onend = () => {
            this.handleEnd();
        };
    }
    
    /**
     * Task 2.1: Enhanced result handling with confidence scoring
     */
    handleResult(event) {
        const startTime = Date.now();
        
        try {
            const enhancedResults = this.processResults(event.results);
            
            // Update performance metrics
            this.performanceMetrics.successfulRecognitions++;
            const latency = Date.now() - startTime;
            this.updateLatencyMetrics(latency);
            
            // Store results for confidence analysis
            this.lastResults = enhancedResults;
            
            // Trigger callback with enhanced results
            if (this.onResult) {
                this.onResult(enhancedResults);
            }
            
            // Update confidence metrics
            if (enhancedResults.length > 0 && this.onConfidenceUpdate) {
                this.onConfidenceUpdate(enhancedResults[0].confidence);
            }
            
        } catch (error) {
            console.error('Error processing speech results:', error);
            this.handleError({ error: 'processing-error', message: error.message });
        }
    }
    
    /**
     * Process raw Web Speech API results with confidence enhancement
     */
    processResults(results) {
        const enhancedResults = [];
        
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            
            for (let j = 0; j < result.length; j++) {
                const alternative = result[j];
                
                // Extract and normalize confidence
                const rawConfidence = alternative.confidence;
                const normalizedConfidence = this.confidenceNormalizer.normalize(
                    rawConfidence, 
                    alternative.transcript,
                    this.getBrowserInfo()
                );
                
                // Apply aviation-specific confidence adjustments
                const adjustedConfidence = this.aviationOptimizer.adjustConfidence(
                    normalizedConfidence,
                    alternative.transcript
                );
                
                const enhancedResult = {
                    transcript: alternative.transcript,
                    confidence: adjustedConfidence,
                    rawConfidence: rawConfidence,
                    isFinal: result.isFinal,
                    timestamp: Date.now(),
                    alternativeIndex: j,
                    resultIndex: i,
                    
                    // Additional metadata
                    wordCount: alternative.transcript.split(' ').length,
                    hasAviationTerms: this.aviationOptimizer.containsAviationTerms(alternative.transcript),
                    qualityScore: this.calculateTranscriptQuality(alternative.transcript, adjustedConfidence)
                };
                
                enhancedResults.push(enhancedResult);
                
                // Store confidence for metrics
                this.confidenceHistory.push({
                    confidence: adjustedConfidence,
                    timestamp: Date.now(),
                    isFinal: result.isFinal
                });
            }
        }
        
        // Sort by confidence (highest first)
        enhancedResults.sort((a, b) => b.confidence - a.confidence);
        
        return enhancedResults;
    }
    
    /**
     * Calculate transcript quality score
     */
    calculateTranscriptQuality(transcript, confidence) {
        let qualityScore = confidence;
        
        // Boost for aviation terminology
        if (this.aviationOptimizer.containsAviationTerms(transcript)) {
            qualityScore = Math.min(1.0, qualityScore + 0.1);
        }
        
        // Penalty for very short transcripts
        if (transcript.length < 3) {
            qualityScore *= 0.7;
        }
        
        // Penalty for excessive repetition
        const words = transcript.toLowerCase().split(' ');
        const uniqueWords = new Set(words);
        const repetitionRatio = words.length / uniqueWords.size;
        if (repetitionRatio > 2) {
            qualityScore *= 0.8;
        }
        
        return Math.max(0.0, Math.min(1.0, qualityScore));
    }
    
    /**
     * Task 2.2: Enhanced error handling with recovery
     */
    handleError(event) {
        this.lastError = event;
        
        // Track error in metrics
        const errorType = event.error || 'unknown';
        this.performanceMetrics.errorCounts[errorType] = 
            (this.performanceMetrics.errorCounts[errorType] || 0) + 1;
        
        console.error(`Enhanced Web Speech API error: ${errorType}`, event);
        
        // Determine if error is recoverable
        const isRecoverable = this.errorRecovery.isRecoverable(errorType);
        
        if (isRecoverable && this.config.enableErrorRecovery) {
            this.attemptRecovery(errorType);
        } else {
            // Non-recoverable error - notify callback
            if (this.onError) {
                this.onError({
                    type: errorType,
                    message: event.message || `Speech recognition error: ${errorType}`,
                    recoverable: false,
                    retryCount: this.retryCount
                });
            }
        }
    }
    
    /**
     * Attempt error recovery with exponential backoff
     */
    async attemptRecovery(errorType) {
        if (this.retryCount >= this.config.maxRetries) {
            console.error(`Max retries (${this.config.maxRetries}) exceeded for error: ${errorType}`);
            
            if (this.onError) {
                this.onError({
                    type: errorType,
                    message: `Speech recognition failed after ${this.config.maxRetries} attempts`,
                    recoverable: false,
                    retryCount: this.retryCount
                });
            }
            return;
        }
        
        this.retryCount++;
        
        // Calculate delay with exponential backoff
        const delay = this.config.exponentialBackoff 
            ? this.config.retryDelay * Math.pow(2, this.retryCount - 1)
            : this.config.retryDelay;
        
        console.log(`Attempting recovery for ${errorType} in ${delay}ms (attempt ${this.retryCount}/${this.config.maxRetries})`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        try {
            // Attempt to restart recognition
            if (this.isListening) {
                this.recognition.stop();
            }
            
            // Brief pause before restart
            setTimeout(() => {
                if (!this.isListening) {
                    this.start();
                }
            }, 100);
            
        } catch (recoveryError) {
            console.error('Recovery attempt failed:', recoveryError);
            this.handleError({ error: 'recovery-failed', message: recoveryError.message });
        }
    }
    
    /**
     * Handle end event
     */
    handleEnd() {
        this.isListening = false;
        
        // Reset retry count on successful completion
        if (this.lastError === null) {
            this.retryCount = 0;
        }
        
        if (this.onEnd) {
            this.onEnd();
        }
    }
    
    /**
     * Start speech recognition
     */
    start() {
        if (!this.isInitialized) {
            throw new Error('Enhanced Web Speech API not initialized');
        }
        
        if (this.isListening) {
            console.warn('Speech recognition already running');
            return;
        }
        
        // Ensure recognition object exists and is in proper state
        if (!this.recognition) {
            console.log('🔄 Recognition object missing, reinitializing...');
            this.setupSpeechRecognition();
        }
        
        try {
            this.lastError = null;
            this.isListening = true; // Set before starting to prevent race conditions
            this.recognition.start();
        } catch (error) {
            this.isListening = false; // Reset on error
            console.error('Failed to start speech recognition:', error);
            this.handleError({ error: 'start-failed', message: error.message });
        }
    }
    
    /**
     * Stop speech recognition
     */
    stop() {
        if (this.isListening && this.recognition) {
            this.recognition.stop();
        }
    }
    
    /**
     * Abort speech recognition
     */
    abort() {
        if (this.recognition) {
            this.recognition.abort();
            this.isListening = false;
        }
    }
    
    /**
     * Complete reset of Enhanced Web Speech API state
     */
    reset() {
        console.log('🔄 Resetting Enhanced Web Speech API state...');
        
        return new Promise((resolve) => {
            // Clear any existing timeouts or intervals that might interfere
            if (this.retryTimeout) {
                clearTimeout(this.retryTimeout);
                this.retryTimeout = null;
            }
            
            // Stop any active recognition and wait for it to fully end
            if (this.recognition) {
                const handleResetEnd = () => {
                    // Remove the temporary event listener
                    if (this.recognition && this.recognition.removeEventListener) {
                        this.recognition.removeEventListener('end', handleResetEnd);
                    }
                    
                    // Reset all state variables
                    this.isListening = false;
                    this.lastResults = [];
                    this.confidenceHistory = [];
                    this.retryCount = 0;
                    this.lastError = null;
                    
                    // Reset performance metrics
                    this.performanceMetrics = {
                        recognitionAttempts: 0,
                        successfulRecognitions: 0,
                        averageLatency: 0,
                        confidenceScores: [],
                        errorCounts: {}
                    };
                    
                    // Completely reinitialize the recognition object for clean state
                    this.recognition = null; // Clear the old one first
                    setTimeout(() => {
                        this.setupSpeechRecognition();
                        console.log('✅ Enhanced Web Speech API state reset complete');
                        resolve();
                    }, 50); // Small delay to ensure clean initialization
                };
                
                if (this.isListening) {
                    // Add temporary event listener for this reset operation
                    this.recognition.addEventListener('end', handleResetEnd);
                    try {
                        this.recognition.abort();
                    } catch (error) {
                        console.warn('Error aborting recognition during reset:', error);
                        // If abort fails, still proceed with reset after a short delay
                        setTimeout(handleResetEnd, 100);
                    }
                } else {
                    // Not listening, can reset immediately
                    handleResetEnd();
                }
            } else {
                // No recognition object, just reset state and create new one
                this.isListening = false;
                this.lastResults = [];
                this.confidenceHistory = [];
                this.retryCount = 0;
                this.lastError = null;
                
                this.performanceMetrics = {
                    recognitionAttempts: 0,
                    successfulRecognitions: 0,
                    averageLatency: 0,
                    confidenceScores: [],
                    errorCounts: {}
                };
                
                this.setupSpeechRecognition();
                console.log('✅ Enhanced Web Speech API state reset complete');
                resolve();
            }
        });
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            isListening: this.isListening,
            isInitialized: this.isInitialized,
            retryCount: this.retryCount,
            lastError: this.lastError,
            config: this.config
        };
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        const avgConfidence = this.confidenceHistory.length > 0
            ? this.confidenceHistory.reduce((sum, entry) => sum + entry.confidence, 0) / this.confidenceHistory.length
            : 0;
        
        return {
            ...this.performanceMetrics,
            averageConfidence: avgConfidence,
            confidenceHistorySize: this.confidenceHistory.length,
            currentRetryCount: this.retryCount,
            lastError: this.lastError?.error || null
        };
    }
    
    /**
     * Update configuration at runtime
     */
    updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        
        // Apply changes to recognition if active
        if (this.recognition) {
            if (newConfig.language) this.recognition.lang = newConfig.language;
            if (newConfig.maxAlternatives) this.recognition.maxAlternatives = newConfig.maxAlternatives;
            if (newConfig.continuous !== undefined) this.recognition.continuous = newConfig.continuous;
            if (newConfig.interimResults !== undefined) this.recognition.interimResults = newConfig.interimResults;
        }
        
        console.log('Enhanced Web Speech API configuration updated:', newConfig);
    }
    
    /**
     * Helper: Update latency metrics
     */
    updateLatencyMetrics(latency) {
        const metrics = this.performanceMetrics;
        
        // Update running average
        const totalLatency = metrics.averageLatency * (metrics.successfulRecognitions - 1) + latency;
        metrics.averageLatency = totalLatency / metrics.successfulRecognitions;
        
        // Trigger performance callback
        if (this.onPerformanceUpdate) {
            this.onPerformanceUpdate({
                latency: latency,
                averageLatency: metrics.averageLatency,
                successRate: metrics.successfulRecognitions / metrics.recognitionAttempts
            });
        }
    }
    
    /**
     * Helper: Get browser information for confidence normalization
     */
    getBrowserInfo() {
        const userAgent = navigator.userAgent;
        
        if (userAgent.includes('Chrome')) return 'chrome';
        if (userAgent.includes('Firefox')) return 'firefox';
        if (userAgent.includes('Safari')) return 'safari';
        if (userAgent.includes('Edge')) return 'edge';
        
        return 'unknown';
    }
    
    /**
     * Cleanup and dispose
     */
    dispose() {
        if (this.isListening) {
            this.stop();
        }
        
        this.recognition = null;
        this.isInitialized = false;
        
        console.log('Enhanced Web Speech API disposed');
    }
}

/**
 * Confidence Normalization Helper Class
 * Handles browser-specific confidence score normalization
 */
class ConfidenceNormalizer {
    constructor() {
        // Browser-specific confidence characteristics
        this.browserProfiles = {
            chrome: {
                baseConfidence: 0.8,
                varianceRange: [0.1, 0.95],
                defaultConfidence: 0.8
            },
            firefox: {
                baseConfidence: 0.7,
                varianceRange: [0.2, 0.9],
                defaultConfidence: 0.7
            },
            safari: {
                baseConfidence: 0.75,
                varianceRange: [0.15, 0.92],
                defaultConfidence: 0.75
            },
            edge: {
                baseConfidence: 0.8,
                varianceRange: [0.1, 0.95],
                defaultConfidence: 0.8
            },
            unknown: {
                baseConfidence: 0.7,
                varianceRange: [0.2, 0.9],
                defaultConfidence: 0.7
            }
        };
    }
    
    /**
     * Normalize confidence score across browsers
     */
    normalize(rawConfidence, transcript, browserType = 'unknown') {
        const profile = this.browserProfiles[browserType] || this.browserProfiles.unknown;
        
        // Handle missing confidence (common in some browsers)
        if (rawConfidence === undefined || rawConfidence === null) {
            return this.estimateConfidence(transcript, profile);
        }
        
        // Handle invalid confidence values
        if (isNaN(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
            console.warn(`Invalid confidence value: ${rawConfidence}, using default`);
            return profile.defaultConfidence;
        }
        
        // Apply browser-specific normalization
        let normalizedConfidence = this.applyBrowserNormalization(rawConfidence, profile);
        
        // Apply transcript-based adjustments
        normalizedConfidence = this.applyTranscriptAdjustments(normalizedConfidence, transcript);
        
        // Ensure valid range
        return Math.max(0.0, Math.min(1.0, normalizedConfidence));
    }
    
    /**
     * Apply browser-specific confidence normalization
     */
    applyBrowserNormalization(rawConfidence, profile) {
        // Chrome tends to be more conservative, Firefox more liberal
        const [minVar, maxVar] = profile.varianceRange;
        
        // Rescale to browser's typical range
        const rescaled = minVar + (rawConfidence * (maxVar - minVar));
        
        return rescaled;
    }
    
    /**
     * Apply transcript-based confidence adjustments
     */
    applyTranscriptAdjustments(confidence, transcript) {
        let adjusted = confidence;
        
        // Length-based adjustment
        if (transcript.length < 3) {
            adjusted *= 0.8; // Reduce confidence for very short transcripts
        } else if (transcript.length > 50) {
            adjusted *= 1.1; // Boost confidence for longer, complete sentences
        }
        
        // Word count adjustment
        const wordCount = transcript.split(' ').length;
        if (wordCount === 1) {
            adjusted *= 0.9; // Single words are less reliable
        } else if (wordCount >= 5) {
            adjusted *= 1.05; // Multi-word phrases are more reliable
        }
        
        return adjusted;
    }
    
    /**
     * Estimate confidence when none is provided
     */
    estimateConfidence(transcript, profile) {
        let estimated = profile.defaultConfidence;
        
        // Estimate based on transcript characteristics
        const length = transcript.length;
        const wordCount = transcript.split(' ').length;
        
        // Longer transcripts generally indicate better recognition
        if (length > 20) estimated += 0.1;
        if (length > 50) estimated += 0.1;
        
        // Multiple words indicate better context
        if (wordCount >= 3) estimated += 0.05;
        if (wordCount >= 5) estimated += 0.05;
        
        // Reduce for potential noise indicators
        if (transcript.includes('...') || transcript.includes('uh') || transcript.includes('um')) {
            estimated -= 0.1;
        }
        
        return Math.max(0.1, Math.min(1.0, estimated));
    }
}

/**
 * Error Recovery Manager
 * Handles Web Speech API error classification and recovery strategies
 */
class ErrorRecoveryManager {
    constructor(config) {
        this.config = config;
        
        // Error classification
        this.recoverableErrors = new Set([
            'no-speech',
            'aborted',
            'network',
            'audio-capture',
            'start-failed'
        ]);
        
        this.criticalErrors = new Set([
            'not-allowed',
            'service-not-allowed',
            'bad-grammar'
        ]);
    }
    
    /**
     * Determine if an error is recoverable
     */
    isRecoverable(errorType) {
        return this.recoverableErrors.has(errorType) && !this.criticalErrors.has(errorType);
    }
    
    /**
     * Get recovery strategy for error type
     */
    getRecoveryStrategy(errorType) {
        const strategies = {
            'no-speech': 'restart',
            'aborted': 'restart',
            'network': 'retry-with-delay',
            'audio-capture': 'check-permissions',
            'start-failed': 'reinitialize'
        };
        
        return strategies[errorType] || 'retry';
    }
}

/**
 * Aviation Terminology Optimizer
 * Optimizes Web Speech API for airport/aviation terminology
 */
class AviationTerminologyOptimizer {
    constructor() {
        // Aviation-specific terms and patterns
        this.aviationTerms = new Set([
            'jarvis', 'flight', 'gate', 'pushback', 'tractor', 'equipment',
            'ramp', 'cleaning', 'maintenance', 'status', 'departure',
            'arrival', 'delay', 'boarding', 'baggage', 'aircraft'
        ]);
        
        this.flightNumberPattern = /\b[A-Z]{1,3}\s*\d{3,4}\b/gi;
        this.gatePattern = /\bgate\s+[A-Z]?\d+\b/gi;
    }
    
    /**
     * Apply aviation-specific optimizations to recognition
     */
    applyOptimizations(recognition) {
        // Note: Web Speech API has limited customization options
        // These are the available optimizations
        
        // Use aviation-friendly language model if available
        if (recognition.grammars && window.SpeechGrammarList) {
            const grammarList = new window.SpeechGrammarList();
            const aviationGrammar = this.createAviationGrammar();
            grammarList.addFromString(aviationGrammar, 1);
            recognition.grammars = grammarList;
        }
    }
    
    /**
     * Create aviation-specific grammar (JSGF format)
     */
    createAviationGrammar() {
        return `
            #JSGF V1.0;
            grammar aviation;
            public <command> = <wake_word> <query>;
            <wake_word> = jarvis | hey jarvis;
            <query> = <flight_query> | <equipment_query> | <status_query>;
            <flight_query> = what is the status of flight <flight_number>;
            <equipment_query> = what pushback tractor is assigned to flight <flight_number>;
            <status_query> = <flight_number> status;
            <flight_number> = <airline> <number>;
            <airline> = UA | united | american | delta | southwest;
            <number> = <digit> <digit> <digit> <digit>;
            <digit> = zero | one | two | three | four | five | six | seven | eight | nine;
        `;
    }
    
    /**
     * Check if transcript contains aviation terms
     */
    containsAviationTerms(transcript) {
        const lowerTranscript = transcript.toLowerCase();
        
        // Check for known aviation terms
        for (const term of this.aviationTerms) {
            if (lowerTranscript.includes(term)) {
                return true;
            }
        }
        
        // Check for flight number patterns
        if (this.flightNumberPattern.test(transcript)) {
            return true;
        }
        
        // Check for gate patterns
        if (this.gatePattern.test(transcript)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Adjust confidence for aviation-specific content
     */
    adjustConfidence(confidence, transcript) {
        if (this.containsAviationTerms(transcript)) {
            // Boost confidence for aviation terminology
            return Math.min(1.0, confidence + 0.1);
        }
        
        return confidence;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EnhancedWebSpeechAPI, ConfidenceNormalizer, ErrorRecoveryManager, AviationTerminologyOptimizer };
}
