/**
 * Whisper AI Integration & Fallback System
 * Part of Hybrid Speech Recognition System
 * 
 * Implements Task 3: Whisper AI as high-accuracy fallback for challenging audio conditions
 * with cost control, rate limiting, and intelligent audio segmentation
 */

class WhisperAPIClient {
    constructor(options = {}) {
        // API Configuration
        this.config = {
            apiKey: options.apiKey || null, // Will be set from environment or config
            baseURL: options.baseURL || 'https://api.openai.com/v1',
            model: options.model || 'whisper-1',
            language: options.language || 'en',
            
            // Audio processing
            targetSampleRate: options.targetSampleRate || 16000, // 16kHz for Whisper
            targetChannels: options.targetChannels || 1, // Mono
            maxFileSize: options.maxFileSize || 25 * 1024 * 1024, // 25MB limit
            maxDuration: options.maxDuration || 30, // 30 seconds max per request
            
            // Request configuration
            timeout: options.timeout || 5000, // 5 second timeout
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            
            // Response format
            responseFormat: options.responseFormat || 'verbose_json', // For confidence scores
            temperature: options.temperature || 0 // Deterministic output
        };
        
        // Cost Control & Rate Limiting (Task 3.2)
        this.costController = new WhisperCostController(options.costLimits);
        this.rateLimiter = new WhisperRateLimiter(options.rateLimits);
        
        // Audio Segmentation (Task 3.3)
        this.audioSegmenter = new AudioSegmenter(options.segmentationConfig);
        
        // State management
        this.isInitialized = false;
        this.activeRequests = new Map(); // Track ongoing requests
        this.requestQueue = []; // Queue for rate-limited requests
        
        // Performance metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalCost: 0,
            averageLatency: 0,
            averageConfidence: 0,
            bytesProcessed: 0
        };
        
        // Callbacks
        this.onResult = null;
        this.onError = null;
        this.onCostUpdate = null;
        this.onRateLimitWarning = null;
        this.onProgress = null;
        
        this.init();
    }
    
    /**
     * Initialize Whisper API Client
     */
    async init() {
        try {
            // Validate configuration
            if (!this.config.apiKey) {
                console.warn('Whisper API key not provided - will need to be set before use');
            }
            
            // Initialize audio context for processing
            await this.initializeAudioContext();
            
            // Test API connectivity (if API key is available)
            if (this.config.apiKey) {
                await this.testAPIConnectivity();
            }
            
            this.isInitialized = true;
            console.log('✅ Whisper API Client initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize Whisper API Client:', error);
            throw error;
        }
    }
    
    /**
     * Initialize audio context for processing
     */
    async initializeAudioContext() {
        if (!window.AudioContext && !window.webkitAudioContext) {
            throw new Error('AudioContext not supported - required for audio processing');
        }
        
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('🎤 Audio context initialized for Whisper processing');
    }
    
    /**
     * Test API connectivity
     */
    async testAPIConnectivity() {
        try {
            // Simple API test with minimal request
            const response = await fetch(`${this.config.baseURL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(this.config.timeout)
            });
            
            if (!response.ok) {
                throw new Error(`API connectivity test failed: ${response.status} ${response.statusText}`);
            }
            
            console.log('✅ Whisper API connectivity verified');
            
        } catch (error) {
            console.warn('⚠️ Whisper API connectivity test failed:', error.message);
            // Don't throw - allow initialization to continue for offline testing
        }
    }
    
    /**
     * Main transcription method
     * @param {AudioBuffer|Blob|File} audioInput - Audio input to transcribe
     * @param {Object} options - Transcription options
     * @returns {Promise<Object>} Transcription result
     */
    async transcribe(audioInput, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Whisper API Client not initialized');
        }
        
        if (!this.config.apiKey) {
            throw new Error('Whisper API key not configured');
        }
        
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        
        try {
            // Check rate limits
            await this.rateLimiter.checkAndWait();
            
            // Check cost limits
            const estimatedCost = this.costController.estimateRequestCost(audioInput);
            this.costController.checkCostLimit(estimatedCost);
            
            // Process audio input
            const processedAudio = await this.processAudioInput(audioInput, options);
            
            // Segment audio if needed
            const audioSegments = await this.audioSegmenter.segmentAudio(processedAudio);
            
            // Transcribe segments
            const segmentResults = [];
            for (let i = 0; i < audioSegments.length; i++) {
                const segment = audioSegments[i];
                
                if (this.onProgress) {
                    this.onProgress({
                        requestId,
                        segmentIndex: i,
                        totalSegments: audioSegments.length,
                        progress: i / audioSegments.length
                    });
                }
                
                const segmentResult = await this.transcribeSegment(segment, options, requestId);
                segmentResults.push(segmentResult);
            }
            
            // Combine segment results
            const combinedResult = this.combineSegmentResults(segmentResults, requestId);
            
            // Update metrics and costs
            const latency = Date.now() - startTime;
            this.updateMetrics(true, latency, combinedResult.confidence, estimatedCost, processedAudio.byteLength);
            
            // Trigger callbacks
            if (this.onResult) {
                this.onResult(combinedResult);
            }
            
            if (this.onCostUpdate) {
                this.onCostUpdate(this.costController.getCurrentCosts());
            }
            
            return combinedResult;
            
        } catch (error) {
            console.error(`Whisper transcription failed (${requestId}):`, error);
            
            const latency = Date.now() - startTime;
            this.updateMetrics(false, latency, 0, 0, 0);
            
            if (this.onError) {
                this.onError({
                    requestId,
                    error: error.message,
                    type: this.classifyError(error),
                    recoverable: this.isRecoverableError(error)
                });
            }
            
            throw error;
        } finally {
            this.activeRequests.delete(requestId);
        }
    }
    
    /**
     * Process various audio input types into Whisper-compatible format
     */
    async processAudioInput(audioInput, options = {}) {
        if (audioInput instanceof AudioBuffer) {
            return await this.convertAudioBufferToWav(audioInput);
        } else if (audioInput instanceof Blob || audioInput instanceof File) {
            return await this.convertBlobToWav(audioInput);
        } else if (typeof audioInput === 'string') {
            // Assume it's a data URL or base64
            return await this.convertDataURLToWav(audioInput);
        } else {
            throw new Error('Unsupported audio input type');
        }
    }
    
    /**
     * Convert AudioBuffer to WAV format suitable for Whisper
     */
    async convertAudioBufferToWav(audioBuffer) {
        // Resample to target sample rate if needed
        const resampledBuffer = await this.resampleAudioBuffer(audioBuffer, this.config.targetSampleRate);
        
        // Convert to mono if needed
        const monoBuffer = this.convertToMono(resampledBuffer);
        
        // Convert to WAV format
        const wavBlob = this.audioBufferToWav(monoBuffer);
        
        // Validate file size
        if (wavBlob.size > this.config.maxFileSize) {
            throw new Error(`Audio file too large: ${wavBlob.size} bytes (max: ${this.config.maxFileSize})`);
        }
        
        return wavBlob;
    }
    
    /**
     * Convert Blob/File to WAV format
     */
    async convertBlobToWav(blob) {
        // Decode audio blob to AudioBuffer
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // Process as AudioBuffer
        return await this.convertAudioBufferToWav(audioBuffer);
    }
    
    /**
     * Convert data URL to WAV format
     */
    async convertDataURLToWav(dataURL) {
        // Convert data URL to blob
        const response = await fetch(dataURL);
        const blob = await response.blob();
        
        // Process as blob
        return await this.convertBlobToWav(blob);
    }
    
    /**
     * Resample audio buffer to target sample rate
     */
    async resampleAudioBuffer(audioBuffer, targetSampleRate) {
        if (audioBuffer.sampleRate === targetSampleRate) {
            return audioBuffer;
        }
        
        // Create offline audio context for resampling
        const offlineContext = new OfflineAudioContext(
            audioBuffer.numberOfChannels,
            Math.ceil(audioBuffer.duration * targetSampleRate),
            targetSampleRate
        );
        
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        
        return await offlineContext.startRendering();
    }
    
    /**
     * Convert stereo audio to mono
     */
    convertToMono(audioBuffer) {
        if (audioBuffer.numberOfChannels === 1) {
            return audioBuffer;
        }
        
        // Create mono buffer
        const monoBuffer = this.audioContext.createBuffer(
            1,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        
        const monoData = monoBuffer.getChannelData(0);
        
        // Mix channels to mono
        for (let i = 0; i < audioBuffer.length; i++) {
            let sample = 0;
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                sample += audioBuffer.getChannelData(channel)[i];
            }
            monoData[i] = sample / audioBuffer.numberOfChannels;
        }
        
        return monoBuffer;
    }
    
    /**
     * Convert AudioBuffer to WAV blob
     */
    audioBufferToWav(audioBuffer) {
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        
        // WAV file structure
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert float samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
    
    /**
     * Transcribe a single audio segment
     */
    async transcribeSegment(audioSegment, options = {}, requestId) {
        const formData = new FormData();
        formData.append('file', audioSegment.blob, `audio_${requestId}_${audioSegment.index}.wav`);
        formData.append('model', this.config.model);
        formData.append('language', options.language || this.config.language);
        formData.append('response_format', this.config.responseFormat);
        formData.append('temperature', this.config.temperature.toString());
        
        // Add optional parameters
        if (options.prompt) {
            formData.append('prompt', options.prompt);
        }
        
        const response = await fetch(`${this.config.baseURL}/audio/transcriptions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: formData,
            signal: AbortSignal.timeout(this.config.timeout)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Whisper API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        return {
            segmentIndex: audioSegment.index,
            startTime: audioSegment.startTime,
            endTime: audioSegment.endTime,
            text: result.text,
            confidence: this.extractConfidence(result),
            words: result.words || [],
            language: result.language || this.config.language,
            duration: audioSegment.endTime - audioSegment.startTime,
            rawResult: result
        };
    }
    
    /**
     * Extract confidence score from Whisper response
     */
    extractConfidence(result) {
        // Whisper doesn't provide explicit confidence scores
        // We estimate based on available information
        
        if (result.words && result.words.length > 0) {
            // Average word-level probabilities if available
            const wordConfidences = result.words
                .filter(word => word.probability !== undefined)
                .map(word => word.probability);
            
            if (wordConfidences.length > 0) {
                return wordConfidences.reduce((sum, conf) => sum + conf, 0) / wordConfidences.length;
            }
        }
        
        // Fallback estimation based on text characteristics
        const text = result.text || '';
        let estimatedConfidence = 0.8; // Base confidence for Whisper
        
        // Adjust based on text length
        if (text.length < 10) estimatedConfidence -= 0.1;
        if (text.length > 50) estimatedConfidence += 0.1;
        
        // Adjust based on repeated words (sign of uncertainty)
        const words = text.toLowerCase().split(' ');
        const uniqueWords = new Set(words);
        const repetitionRatio = words.length / uniqueWords.size;
        if (repetitionRatio > 1.5) estimatedConfidence -= 0.15;
        
        // Adjust based on presence of filler words
        const fillerWords = ['um', 'uh', 'er', 'ah'];
        const hasFillers = fillerWords.some(filler => text.toLowerCase().includes(filler));
        if (hasFillers) estimatedConfidence -= 0.1;
        
        return Math.max(0.1, Math.min(1.0, estimatedConfidence));
    }
    
    /**
     * Combine results from multiple segments
     */
    combineSegmentResults(segmentResults, requestId) {
        if (segmentResults.length === 0) {
            throw new Error('No segment results to combine');
        }
        
        if (segmentResults.length === 1) {
            return {
                requestId,
                text: segmentResults[0].text,
                confidence: segmentResults[0].confidence,
                language: segmentResults[0].language,
                duration: segmentResults[0].duration,
                segments: segmentResults,
                timestamp: Date.now()
            };
        }
        
        // Combine multiple segments
        const combinedText = segmentResults
            .sort((a, b) => a.segmentIndex - b.segmentIndex)
            .map(segment => segment.text.trim())
            .join(' ');
        
        // Calculate weighted average confidence
        const totalDuration = segmentResults.reduce((sum, segment) => sum + segment.duration, 0);
        const weightedConfidence = segmentResults.reduce((sum, segment) => {
            const weight = segment.duration / totalDuration;
            return sum + (segment.confidence * weight);
        }, 0);
        
        // Use most common language
        const languages = segmentResults.map(s => s.language);
        const language = this.getMostFrequent(languages);
        
        return {
            requestId,
            text: combinedText,
            confidence: weightedConfidence,
            language: language,
            duration: totalDuration,
            segments: segmentResults,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get most frequent element from array
     */
    getMostFrequent(array) {
        const frequency = {};
        let maxCount = 0;
        let mostFrequent = array[0];
        
        for (const item of array) {
            frequency[item] = (frequency[item] || 0) + 1;
            if (frequency[item] > maxCount) {
                maxCount = frequency[item];
                mostFrequent = item;
            }
        }
        
        return mostFrequent;
    }
    
    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `whisper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    /**
     * Update performance metrics
     */
    updateMetrics(success, latency, confidence, cost, bytes) {
        this.metrics.totalRequests++;
        
        if (success) {
            this.metrics.successfulRequests++;
            
            // Update running averages
            const successCount = this.metrics.successfulRequests;
            this.metrics.averageLatency = 
                (this.metrics.averageLatency * (successCount - 1) + latency) / successCount;
            this.metrics.averageConfidence = 
                (this.metrics.averageConfidence * (successCount - 1) + confidence) / successCount;
        } else {
            this.metrics.failedRequests++;
        }
        
        this.metrics.totalCost += cost;
        this.metrics.bytesProcessed += bytes;
    }
    
    /**
     * Classify error types
     */
    classifyError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('timeout') || message.includes('network')) {
            return 'network';
        } else if (message.includes('401') || message.includes('unauthorized')) {
            return 'authentication';
        } else if (message.includes('429') || message.includes('rate limit')) {
            return 'rate_limit';
        } else if (message.includes('413') || message.includes('too large')) {
            return 'file_size';
        } else if (message.includes('400') || message.includes('bad request')) {
            return 'invalid_input';
        } else if (message.includes('cost') || message.includes('budget')) {
            return 'cost_limit';
        } else {
            return 'unknown';
        }
    }
    
    /**
     * Check if error is recoverable
     */
    isRecoverableError(error) {
        const errorType = this.classifyError(error);
        const recoverableTypes = ['network', 'timeout', 'rate_limit'];
        return recoverableTypes.includes(errorType);
    }
    
    /**
     * Set API key
     */
    setAPIKey(apiKey) {
        this.config.apiKey = apiKey;
        console.log('🔑 Whisper API key updated');
    }
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            hasAPIKey: !!this.config.apiKey,
            activeRequests: this.activeRequests.size,
            queuedRequests: this.requestQueue.length,
            metrics: this.metrics,
            costStatus: this.costController.getStatus(),
            rateLimitStatus: this.rateLimiter.getStatus()
        };
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.metrics,
            successRate: this.metrics.totalRequests > 0 
                ? this.metrics.successfulRequests / this.metrics.totalRequests 
                : 0,
            costPerRequest: this.metrics.totalRequests > 0 
                ? this.metrics.totalCost / this.metrics.totalRequests 
                : 0,
            bytesPerRequest: this.metrics.totalRequests > 0 
                ? this.metrics.bytesProcessed / this.metrics.totalRequests 
                : 0
        };
    }
    
    /**
     * Update configuration
     */
    updateConfiguration(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('🔧 Whisper API configuration updated');
    }
    
    /**
     * Dispose and cleanup
     */
    dispose() {
        // Cancel active requests
        for (const [requestId, abortController] of this.activeRequests) {
            abortController.abort();
        }
        this.activeRequests.clear();
        
        // Clear queue
        this.requestQueue = [];
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        this.isInitialized = false;
        console.log('🧹 Whisper API Client disposed');
    }
}

/**
 * Cost Controller for Whisper API usage
 * Implements Task 3.2: Cost Control & Rate Limiting
 */
class WhisperCostController {
    constructor(limits = {}) {
        this.limits = {
            dailyCostLimit: limits.dailyCostLimit || 10.0, // $10 per day default
            monthlyCostLimit: limits.monthlyCostLimit || 100.0, // $100 per month default
            requestCostLimit: limits.requestCostLimit || 1.0, // $1 per request default
            ...limits
        };
        
        this.costs = {
            daily: 0,
            monthly: 0,
            total: 0
        };
        
        this.resetDate = {
            daily: new Date().toDateString(),
            monthly: this.getCurrentMonth()
        };
        
        // Whisper pricing (as of 2024)
        this.pricing = {
            perMinute: 0.006 // $0.006 per minute
        };
    }
    
    /**
     * Estimate cost for a request
     */
    estimateRequestCost(audioInput) {
        let durationMinutes = 0;
        
        if (audioInput instanceof AudioBuffer) {
            durationMinutes = audioInput.duration / 60;
        } else if (audioInput instanceof Blob) {
            // Estimate based on file size (rough approximation)
            const bytesPerSecond = 16000 * 2; // 16kHz * 16-bit
            const estimatedDuration = audioInput.size / bytesPerSecond;
            durationMinutes = estimatedDuration / 60;
        } else {
            // Conservative estimate
            durationMinutes = 0.5; // 30 seconds
        }
        
        return Math.max(0.001, durationMinutes * this.pricing.perMinute); // Minimum 0.1 cent
    }
    
    /**
     * Check if request would exceed cost limits
     */
    checkCostLimit(estimatedCost) {
        this.resetCostsIfNeeded();
        
        // Check individual request limit
        if (estimatedCost > this.limits.requestCostLimit) {
            throw new Error(`Request cost $${estimatedCost.toFixed(3)} exceeds limit $${this.limits.requestCostLimit}`);
        }
        
        // Check daily limit
        if (this.costs.daily + estimatedCost > this.limits.dailyCostLimit) {
            throw new Error(`Daily cost limit exceeded: $${(this.costs.daily + estimatedCost).toFixed(3)} > $${this.limits.dailyCostLimit}`);
        }
        
        // Check monthly limit
        if (this.costs.monthly + estimatedCost > this.limits.monthlyCostLimit) {
            throw new Error(`Monthly cost limit exceeded: $${(this.costs.monthly + estimatedCost).toFixed(3)} > $${this.limits.monthlyCostLimit}`);
        }
    }
    
    /**
     * Record actual cost
     */
    recordCost(actualCost) {
        this.resetCostsIfNeeded();
        
        this.costs.daily += actualCost;
        this.costs.monthly += actualCost;
        this.costs.total += actualCost;
    }
    
    /**
     * Reset costs if time period has changed
     */
    resetCostsIfNeeded() {
        const currentDate = new Date().toDateString();
        const currentMonth = this.getCurrentMonth();
        
        // Reset daily costs
        if (this.resetDate.daily !== currentDate) {
            this.costs.daily = 0;
            this.resetDate.daily = currentDate;
        }
        
        // Reset monthly costs
        if (this.resetDate.monthly !== currentMonth) {
            this.costs.monthly = 0;
            this.resetDate.monthly = currentMonth;
        }
    }
    
    /**
     * Get current month string
     */
    getCurrentMonth() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    /**
     * Get current cost status
     */
    getStatus() {
        this.resetCostsIfNeeded();
        
        return {
            costs: { ...this.costs },
            limits: { ...this.limits },
            remaining: {
                daily: Math.max(0, this.limits.dailyCostLimit - this.costs.daily),
                monthly: Math.max(0, this.limits.monthlyCostLimit - this.costs.monthly)
            },
            percentageUsed: {
                daily: (this.costs.daily / this.limits.dailyCostLimit) * 100,
                monthly: (this.costs.monthly / this.limits.monthlyCostLimit) * 100
            }
        };
    }
    
    /**
     * Get current costs
     */
    getCurrentCosts() {
        this.resetCostsIfNeeded();
        return { ...this.costs };
    }
}

/**
 * Rate Limiter for Whisper API requests
 * Implements intelligent queuing and circuit breaker patterns
 */
class WhisperRateLimiter {
    constructor(limits = {}) {
        this.limits = {
            requestsPerMinute: limits.requestsPerMinute || 50,
            requestsPerHour: limits.requestsPerHour || 1000,
            requestsPerDay: limits.requestsPerDay || 10000,
            concurrentRequests: limits.concurrentRequests || 3,
            ...limits
        };
        
        this.requestHistory = {
            minute: [],
            hour: [],
            day: []
        };
        
        this.activeRequests = 0;
        this.queue = [];
        this.circuitBreaker = {
            isOpen: false,
            failures: 0,
            lastFailureTime: 0,
            threshold: 5, // Open circuit after 5 failures
            timeout: 60000 // 1 minute timeout
        };
    }
    
    /**
     * Check rate limits and wait if necessary
     */
    async checkAndWait() {
        this.cleanupOldRequests();
        
        // Check circuit breaker
        if (this.circuitBreaker.isOpen) {
            const now = Date.now();
            if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.timeout) {
                this.circuitBreaker.isOpen = false;
                this.circuitBreaker.failures = 0;
                console.log('🔄 Circuit breaker reset');
            } else {
                throw new Error('Circuit breaker is open - too many recent failures');
            }
        }
        
        // Check concurrent request limit
        if (this.activeRequests >= this.limits.concurrentRequests) {
            console.log('⏳ Waiting for concurrent request slot...');
            await this.waitForSlot();
        }
        
        // Check rate limits
        if (this.requestHistory.minute.length >= this.limits.requestsPerMinute) {
            const waitTime = 60000 - (Date.now() - this.requestHistory.minute[0]);
            if (waitTime > 0) {
                console.log(`⏳ Rate limit reached, waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        if (this.requestHistory.hour.length >= this.limits.requestsPerHour) {
            const waitTime = 3600000 - (Date.now() - this.requestHistory.hour[0]);
            if (waitTime > 0) {
                throw new Error(`Hourly rate limit exceeded, wait ${Math.ceil(waitTime / 60000)} minutes`);
            }
        }
        
        if (this.requestHistory.day.length >= this.limits.requestsPerDay) {
            const waitTime = 86400000 - (Date.now() - this.requestHistory.day[0]);
            if (waitTime > 0) {
                throw new Error(`Daily rate limit exceeded, wait ${Math.ceil(waitTime / 3600000)} hours`);
            }
        }
        
        // Record this request
        const now = Date.now();
        this.requestHistory.minute.push(now);
        this.requestHistory.hour.push(now);
        this.requestHistory.day.push(now);
        this.activeRequests++;
    }
    
    /**
     * Wait for a concurrent request slot
     */
    async waitForSlot() {
        return new Promise((resolve) => {
            const checkSlot = () => {
                if (this.activeRequests < this.limits.concurrentRequests) {
                    resolve();
                } else {
                    setTimeout(checkSlot, 100);
                }
            };
            checkSlot();
        });
    }
    
    /**
     * Release a request slot
     */
    releaseSlot() {
        this.activeRequests = Math.max(0, this.activeRequests - 1);
    }
    
    /**
     * Record request success
     */
    recordSuccess() {
        this.releaseSlot();
        
        // Reset circuit breaker on success
        if (this.circuitBreaker.failures > 0) {
            this.circuitBreaker.failures = Math.max(0, this.circuitBreaker.failures - 1);
        }
    }
    
    /**
     * Record request failure
     */
    recordFailure() {
        this.releaseSlot();
        
        this.circuitBreaker.failures++;
        this.circuitBreaker.lastFailureTime = Date.now();
        
        if (this.circuitBreaker.failures >= this.circuitBreaker.threshold) {
            this.circuitBreaker.isOpen = true;
            console.warn('🚨 Circuit breaker opened due to excessive failures');
        }
    }
    
    /**
     * Clean up old request timestamps
     */
    cleanupOldRequests() {
        const now = Date.now();
        
        this.requestHistory.minute = this.requestHistory.minute.filter(time => now - time < 60000);
        this.requestHistory.hour = this.requestHistory.hour.filter(time => now - time < 3600000);
        this.requestHistory.day = this.requestHistory.day.filter(time => now - time < 86400000);
    }
    
    /**
     * Get current rate limit status
     */
    getStatus() {
        this.cleanupOldRequests();
        
        return {
            activeRequests: this.activeRequests,
            requestsThisMinute: this.requestHistory.minute.length,
            requestsThisHour: this.requestHistory.hour.length,
            requestsThisDay: this.requestHistory.day.length,
            limits: { ...this.limits },
            circuitBreaker: { ...this.circuitBreaker },
            available: {
                concurrent: this.limits.concurrentRequests - this.activeRequests,
                minute: this.limits.requestsPerMinute - this.requestHistory.minute.length,
                hour: this.limits.requestsPerHour - this.requestHistory.hour.length,
                day: this.limits.requestsPerDay - this.requestHistory.day.length
            }
        };
    }
}

/**
 * Audio Segmentation for optimizing Whisper processing
 * Implements Task 3.3: Audio Segmentation & Chunking
 */
class AudioSegmenter {
    constructor(config = {}) {
        this.config = {
            maxSegmentDuration: config.maxSegmentDuration || 30, // 30 seconds max
            minSegmentDuration: config.minSegmentDuration || 1, // 1 second min
            overlapDuration: config.overlapDuration || 0.5, // 0.5 second overlap
            vadThreshold: config.vadThreshold || 0.01, // Voice activity detection threshold
            silenceThreshold: config.silenceThreshold || 0.005, // Silence detection threshold
            enableVAD: config.enableVAD ?? true,
            ...config
        };
    }
    
    /**
     * Segment audio into optimal chunks for Whisper processing
     */
    async segmentAudio(audioBlob) {
        // For segments under max duration, return as single segment
        const audioDuration = await this.getAudioDuration(audioBlob);
        
        if (audioDuration <= this.config.maxSegmentDuration) {
            return [{
                index: 0,
                startTime: 0,
                endTime: audioDuration,
                blob: audioBlob,
                duration: audioDuration
            }];
        }
        
        // Convert blob to audio buffer for processing
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Find optimal segment boundaries
        const segments = this.config.enableVAD 
            ? await this.segmentWithVAD(audioBuffer)
            : this.segmentByTime(audioBuffer);
        
        // Convert segments back to blobs
        const segmentBlobs = await Promise.all(
            segments.map(segment => this.createSegmentBlob(audioBuffer, segment))
        );
        
        audioContext.close();
        
        return segmentBlobs;
    }
    
    /**
     * Get audio duration from blob
     */
    async getAudioDuration(audioBlob) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.onloadedmetadata = () => {
                resolve(audio.duration);
            };
            audio.onerror = () => {
                reject(new Error('Failed to load audio metadata'));
            };
            audio.src = URL.createObjectURL(audioBlob);
        });
    }
    
    /**
     * Segment audio using Voice Activity Detection
     */
    async segmentWithVAD(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const segments = [];
        
        // Analyze audio in small windows to find speech boundaries
        const windowSize = Math.floor(sampleRate * 0.1); // 100ms windows
        const speechRegions = [];
        let currentRegion = null;
        
        for (let i = 0; i < channelData.length; i += windowSize) {
            const windowEnd = Math.min(i + windowSize, channelData.length);
            const window = channelData.slice(i, windowEnd);
            
            // Calculate RMS energy for this window
            const energy = this.calculateRMS(window);
            const isSpeech = energy > this.config.vadThreshold;
            
            const timeStart = i / sampleRate;
            const timeEnd = windowEnd / sampleRate;
            
            if (isSpeech) {
                if (!currentRegion) {
                    currentRegion = { start: timeStart, end: timeEnd };
                } else {
                    currentRegion.end = timeEnd;
                }
            } else {
                if (currentRegion) {
                    speechRegions.push(currentRegion);
                    currentRegion = null;
                }
            }
        }
        
        // Add final region if exists
        if (currentRegion) {
            speechRegions.push(currentRegion);
        }
        
        // Create segments from speech regions
        let segmentIndex = 0;
        
        for (const region of speechRegions) {
            let regionStart = region.start;
            
            while (regionStart < region.end) {
                const segmentEnd = Math.min(
                    regionStart + this.config.maxSegmentDuration,
                    region.end
                );
                
                // Ensure minimum duration
                if (segmentEnd - regionStart >= this.config.minSegmentDuration) {
                    segments.push({
                        index: segmentIndex++,
                        startTime: regionStart,
                        endTime: segmentEnd,
                        duration: segmentEnd - regionStart
                    });
                }
                
                regionStart = segmentEnd - this.config.overlapDuration;
            }
        }
        
        return segments;
    }
    
    /**
     * Segment audio by fixed time intervals
     */
    segmentByTime(audioBuffer) {
        const duration = audioBuffer.duration;
        const segments = [];
        let segmentIndex = 0;
        let currentTime = 0;
        
        while (currentTime < duration) {
            const segmentEnd = Math.min(
                currentTime + this.config.maxSegmentDuration,
                duration
            );
            
            segments.push({
                index: segmentIndex++,
                startTime: currentTime,
                endTime: segmentEnd,
                duration: segmentEnd - currentTime
            });
            
            currentTime = segmentEnd - this.config.overlapDuration;
        }
        
        return segments;
    }
    
    /**
     * Calculate RMS energy of audio window
     */
    calculateRMS(samples) {
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
        }
        return Math.sqrt(sum / samples.length);
    }
    
    /**
     * Create audio blob for a specific segment
     */
    async createSegmentBlob(audioBuffer, segment) {
        const sampleRate = audioBuffer.sampleRate;
        const startSample = Math.floor(segment.startTime * sampleRate);
        const endSample = Math.floor(segment.endTime * sampleRate);
        const segmentLength = endSample - startSample;
        
        // Create new audio buffer for segment
        const segmentBuffer = new AudioContext().createBuffer(
            1, // Mono
            segmentLength,
            sampleRate
        );
        
        const sourceData = audioBuffer.getChannelData(0);
        const segmentData = segmentBuffer.getChannelData(0);
        
        // Copy audio data
        for (let i = 0; i < segmentLength; i++) {
            segmentData[i] = sourceData[startSample + i] || 0;
        }
        
        // Convert to WAV blob
        const wavBlob = this.audioBufferToWav(segmentBuffer);
        
        return {
            index: segment.index,
            startTime: segment.startTime,
            endTime: segment.endTime,
            duration: segment.duration,
            blob: wavBlob
        };
    }
    
    /**
     * Convert AudioBuffer to WAV blob (simplified version)
     */
    audioBufferToWav(audioBuffer) {
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert samples to 16-bit PCM
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WhisperAPIClient, WhisperCostController, WhisperRateLimiter, AudioSegmenter };
}
