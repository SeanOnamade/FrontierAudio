/**
 * Audio Environment Detection & Quality Assessment Module
 * Part of Hybrid Speech Recognition System
 * 
 * Implements Task 1: Real-time audio environment analysis to determine
 * optimal speech recognition path (Web Speech API vs Whisper AI)
 */

class AudioEnvironmentDetector {
    constructor() {
        // Core audio analysis
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.isMonitoring = false;
        
        // Noise level monitoring (Task 1.1)
        this.noiseHistory = [];
        this.noiseWindow = 5000; // 5-second sliding window
        this.currentNoiseLevel = -Infinity;
        this.noiseFloor = -60; // baseline noise floor in dB FS
        
        // Speech quality scoring (Task 1.2)
        this.speechBuffer = [];
        this.vadThreshold = 0.1; // Voice Activity Detection threshold
        this.qualityHistory = [];
        
        // Dynamic routing (Task 1.3)
        this.routingConfig = {
            highNoiseThreshold: -40, // dB FS
            lowQualityThreshold: 0.6,
            defaultProvider: 'webspeech',
            rateLimitFallback: true
        };
        
        // Performance metrics
        this.metrics = {
            noiseReadings: 0,
            qualityScores: 0,
            routingDecisions: 0,
            providerSwitches: 0
        };
        
        // Callbacks
        this.onNoiseUpdate = null;
        this.onQualityUpdate = null;
        this.onRoutingDecision = null;
        this.onEnvironmentChange = null;
        
        this.init();
    }
    
    async init() {
        try {
            await this.setupAudioContext();
            this.startMonitoring();
            console.log('✅ AudioEnvironmentDetector initialized');
        } catch (error) {
            console.error('❌ Failed to initialize AudioEnvironmentDetector:', error);
            throw error;
        }
    }
    
    /**
     * Setup WebRTC AudioContext for real-time analysis
     */
    async setupAudioContext() {
        try {
            // Initialize audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            
            // Configure analyser for optimal noise detection
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.3;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: false, // We want raw noise data
                    autoGainControl: false,
                    sampleRate: 44100
                }
            });
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            console.log('🎤 Audio context and microphone initialized');
        } catch (error) {
            console.error('Failed to setup audio context:', error);
            throw new Error(`Microphone access required for audio environment detection: ${error.message}`);
        }
    }
    
    /**
     * Start continuous audio environment monitoring
     */
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitoringLoop();
        console.log('🔄 Started audio environment monitoring');
    }
    
    /**
     * Stop audio environment monitoring
     */
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('⏹️ Stopped audio environment monitoring');
    }
    
    /**
     * Main monitoring loop - runs continuously while active
     */
    monitoringLoop() {
        if (!this.isMonitoring || !this.analyser) return;
        
        try {
            // Update noise level
            this.updateNoiseLevel();
            
            // Update speech quality (if speech is detected)
            this.updateSpeechQuality();
            
            // Clean up old history data
            this.cleanupHistory();
            
        } catch (error) {
            console.warn('Error in monitoring loop:', error);
        }
        
        // Continue monitoring
        requestAnimationFrame(() => this.monitoringLoop());
    }
    
    /**
     * Task 1.1: Noise Level Detection Module
     * Calculate RMS energy levels and noise floor
     */
    updateNoiseLevel() {
        const dataArray = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(dataArray);
        
        // Calculate RMS (Root Mean Square) energy
        let sum = 0;
        let validSamples = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] !== -Infinity) {
                sum += Math.pow(10, dataArray[i] / 10); // Convert dB to linear
                validSamples++;
            }
        }
        
        if (validSamples === 0) return;
        
        // Convert back to dB FS
        const rmsLinear = sum / validSamples;
        const rmsDb = 10 * Math.log10(rmsLinear);
        
        // Update current noise level
        this.currentNoiseLevel = rmsDb;
        
        // Add to history with timestamp
        const timestamp = Date.now();
        this.noiseHistory.push({
            timestamp,
            level: rmsDb
        });
        
        // Update metrics
        this.metrics.noiseReadings++;
        
        // Trigger callback if provided
        if (this.onNoiseUpdate) {
            this.onNoiseUpdate(rmsDb, this.getNoiseCharacterization(rmsDb));
        }
    }
    
    /**
     * Get current noise level in dB FS
     * @returns {number} Current noise level in decibels
     */
    getNoiseLevel() {
        return this.currentNoiseLevel;
    }
    
    /**
     * Get noise level characterization for human understanding
     * @param {number} dbLevel - Noise level in dB FS
     * @returns {string} Human-readable noise characterization
     */
    getNoiseCharacterization(dbLevel) {
        if (dbLevel > -20) return 'very_loud';
        if (dbLevel > -30) return 'loud';
        if (dbLevel > -40) return 'moderate';
        if (dbLevel > -50) return 'quiet';
        return 'very_quiet';
    }
    
    /**
     * Calculate noise floor from sliding window
     * @returns {number} Noise floor in dB FS
     */
    calculateNoiseFloor() {
        const cutoff = Date.now() - this.noiseWindow;
        const recentReadings = this.noiseHistory
            .filter(reading => reading.timestamp > cutoff)
            .map(reading => reading.level)
            .filter(level => level !== -Infinity);
        
        if (recentReadings.length === 0) return this.noiseFloor;
        
        // Use 10th percentile as noise floor (removes speech peaks)
        recentReadings.sort((a, b) => a - b);
        const percentileIndex = Math.floor(recentReadings.length * 0.1);
        return recentReadings[percentileIndex] || this.noiseFloor;
    }
    
    /**
     * Task 1.2: Speech Quality Confidence Scoring
     * Analyze incoming speech audio quality and predict recognition confidence
     */
    updateSpeechQuality() {
        const timeDomainData = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(timeDomainData);
        
        // Voice Activity Detection (VAD)
        const speechDetected = this.detectSpeechActivity(timeDomainData);
        
        if (speechDetected) {
            const quality = this.calculateSpeechQuality(timeDomainData);
            
            // Add to quality history
            this.qualityHistory.push({
                timestamp: Date.now(),
                quality: quality.score,
                snr: quality.snr,
                clarity: quality.clarity,
                clipping: quality.clipping
            });
            
            this.metrics.qualityScores++;
            
            // Trigger callback
            if (this.onQualityUpdate) {
                this.onQualityUpdate(quality);
            }
        }
    }
    
    /**
     * Voice Activity Detection using energy and zero-crossing rate
     * @param {Float32Array} timeDomainData - Raw audio samples
     * @returns {boolean} True if speech is detected
     */
    detectSpeechActivity(timeDomainData) {
        // Calculate RMS energy
        let energy = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
            energy += timeDomainData[i] * timeDomainData[i];
        }
        energy = Math.sqrt(energy / timeDomainData.length);
        
        // Calculate zero-crossing rate
        let zeroCrossings = 0;
        for (let i = 1; i < timeDomainData.length; i++) {
            if ((timeDomainData[i] >= 0) !== (timeDomainData[i - 1] >= 0)) {
                zeroCrossings++;
            }
        }
        const zcr = zeroCrossings / timeDomainData.length;
        
        // Speech detection thresholds (tuned for airport environment)
        const energyThreshold = this.vadThreshold;
        const zcrMin = 0.01; // Minimum ZCR for speech
        const zcrMax = 0.3;  // Maximum ZCR for speech
        
        return energy > energyThreshold && zcr >= zcrMin && zcr <= zcrMax;
    }
    
    /**
     * Calculate comprehensive speech quality metrics
     * @param {Float32Array} timeDomainData - Raw audio samples
     * @returns {Object} Quality assessment object
     */
    calculateSpeechQuality(timeDomainData) {
        // Signal-to-Noise Ratio (SNR)
        const snr = this.calculateSNR(timeDomainData);
        
        // Audio clarity (frequency spectrum analysis)
        const clarity = this.calculateClarity();
        
        // Clipping detection
        const clipping = this.detectClipping(timeDomainData);
        
        // Combined quality score (0.0 - 1.0)
        let qualityScore = 0.5; // baseline
        
        // SNR contribution (40% weight)
        if (snr > 20) qualityScore += 0.4;
        else if (snr > 10) qualityScore += 0.3;
        else if (snr > 5) qualityScore += 0.2;
        else if (snr > 0) qualityScore += 0.1;
        
        // Clarity contribution (40% weight)
        qualityScore += clarity * 0.4;
        
        // Clipping penalty (20% weight)
        qualityScore -= clipping * 0.2;
        
        // Clamp to valid range
        qualityScore = Math.max(0.0, Math.min(1.0, qualityScore));
        
        return {
            score: qualityScore,
            snr: snr,
            clarity: clarity,
            clipping: clipping,
            recommendation: qualityScore >= 0.6 ? 'webspeech' : 'whisper'
        };
    }
    
    /**
     * Calculate Signal-to-Noise Ratio
     * @param {Float32Array} timeDomainData - Raw audio samples
     * @returns {number} SNR in decibels
     */
    calculateSNR(timeDomainData) {
        // Calculate signal power
        let signalPower = 0;
        for (let i = 0; i < timeDomainData.length; i++) {
            signalPower += timeDomainData[i] * timeDomainData[i];
        }
        signalPower /= timeDomainData.length;
        
        // Estimate noise power from noise floor
        const noiseFloorDb = this.calculateNoiseFloor();
        const noisePowerLinear = Math.pow(10, noiseFloorDb / 10);
        
        // Calculate SNR
        if (noisePowerLinear <= 0) return 30; // High SNR if no noise detected
        
        const snrLinear = signalPower / noisePowerLinear;
        return 10 * Math.log10(snrLinear);
    }
    
    /**
     * Calculate audio clarity using frequency spectrum analysis
     * @returns {number} Clarity score (0.0 - 1.0)
     */
    calculateClarity() {
        const frequencyData = new Float32Array(this.analyser.frequencyBinCount);
        this.analyser.getFloatFrequencyData(frequencyData);
        
        const sampleRate = this.audioContext.sampleRate;
        const nyquist = sampleRate / 2;
        const binWidth = nyquist / frequencyData.length;
        
        // Focus on speech frequency range (300Hz - 3400Hz)
        const speechStart = Math.floor(300 / binWidth);
        const speechEnd = Math.floor(3400 / binWidth);
        
        let speechEnergy = 0;
        let totalEnergy = 0;
        
        for (let i = 0; i < frequencyData.length; i++) {
            const energy = Math.pow(10, frequencyData[i] / 10);
            totalEnergy += energy;
            
            if (i >= speechStart && i <= speechEnd) {
                speechEnergy += energy;
            }
        }
        
        // Clarity = ratio of speech band energy to total energy
        return totalEnergy > 0 ? (speechEnergy / totalEnergy) : 0;
    }
    
    /**
     * Detect audio clipping distortion
     * @param {Float32Array} timeDomainData - Raw audio samples
     * @returns {number} Clipping severity (0.0 - 1.0)
     */
    detectClipping(timeDomainData) {
        const clipThreshold = 0.95; // 95% of maximum amplitude
        let clippedSamples = 0;
        
        for (let i = 0; i < timeDomainData.length; i++) {
            if (Math.abs(timeDomainData[i]) >= clipThreshold) {
                clippedSamples++;
            }
        }
        
        return clippedSamples / timeDomainData.length;
    }
    
    /**
     * Export function for external use
     * @param {AudioBuffer} audioBuffer - External audio buffer
     * @returns {Object} Quality prediction
     */
    predictRecognitionQuality(audioBuffer) {
        if (!audioBuffer) {
            console.warn('No audio buffer provided for quality prediction');
            return { score: 0.5, recommendation: 'webspeech' };
        }
        
        // For external audio buffers, perform simplified analysis
        const channelData = audioBuffer.getChannelData(0);
        
        // Basic quality assessment
        let energy = 0;
        let clipping = 0;
        const clipThreshold = 0.95;
        
        for (let i = 0; i < channelData.length; i++) {
            energy += channelData[i] * channelData[i];
            if (Math.abs(channelData[i]) >= clipThreshold) {
                clipping++;
            }
        }
        
        energy = Math.sqrt(energy / channelData.length);
        clipping = clipping / channelData.length;
        
        // Simple scoring
        let score = 0.5;
        if (energy > 0.1) score += 0.3;
        if (energy > 0.05) score += 0.2;
        score -= clipping * 0.5;
        score = Math.max(0.0, Math.min(1.0, score));
        
        return {
            score: score,
            energy: energy,
            clipping: clipping,
            recommendation: score >= 0.6 ? 'webspeech' : 'whisper'
        };
    }
    
    /**
     * Task 1.3: Dynamic Routing Decision Engine
     * Central decision logic for provider selection
     */
    getRoutingRecommendation(options = {}) {
        const {
            userPreference = null,
            rateLimitApproaching = false,
            forceProvider = null
        } = options;
        
        // Override logic
        if (forceProvider) {
            return this.createRoutingDecision(forceProvider, 1.0, 'forced');
        }
        
        // Rate limit fallback
        if (rateLimitApproaching && this.routingConfig.rateLimitFallback) {
            return this.createRoutingDecision('webspeech', 0.8, 'rate_limit');
        }
        
        // Environmental analysis
        const noiseLevel = this.getNoiseLevel();
        const recentQuality = this.getRecentQualityScore();
        
        let provider = this.routingConfig.defaultProvider;
        let confidence = 0.5;
        let reason = 'default';
        
        // High noise environment check
        if (noiseLevel > this.routingConfig.highNoiseThreshold) {
            provider = 'whisper';
            confidence = 0.8;
            reason = 'high_noise';
        }
        // Low quality prediction check
        else if (recentQuality !== null && recentQuality < this.routingConfig.lowQualityThreshold) {
            provider = 'whisper';
            confidence = 0.7;
            reason = 'low_quality';
        }
        // Good conditions - use faster Web Speech API
        else {
            provider = 'webspeech';
            confidence = 0.8;
            reason = 'good_conditions';
        }
        
        // User preference override (if provided)
        if (userPreference && ['webspeech', 'whisper'].includes(userPreference)) {
            provider = userPreference;
            confidence = Math.max(confidence, 0.6);
            reason = 'user_preference';
        }
        
        const decision = this.createRoutingDecision(provider, confidence, reason);
        this.metrics.routingDecisions++;
        
        // Trigger callback
        if (this.onRoutingDecision) {
            this.onRoutingDecision(decision);
        }
        
        return decision;
    }
    
    /**
     * Create standardized routing decision object
     */
    createRoutingDecision(provider, confidence, reason) {
        return {
            provider: provider,
            confidence: confidence,
            reason: reason,
            timestamp: Date.now(),
            environmentalFactors: {
                noiseLevel: this.getNoiseLevel(),
                noiseCharacterization: this.getNoiseCharacterization(this.getNoiseLevel()),
                qualityScore: this.getRecentQualityScore()
            }
        };
    }
    
    /**
     * Get most recent speech quality score
     * @returns {number|null} Recent quality score or null if no data
     */
    getRecentQualityScore() {
        if (this.qualityHistory.length === 0) return null;
        
        const cutoff = Date.now() - 5000; // Last 5 seconds
        const recentScores = this.qualityHistory
            .filter(entry => entry.timestamp > cutoff)
            .map(entry => entry.quality);
        
        if (recentScores.length === 0) return null;
        
        // Return average of recent scores
        return recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length;
    }
    
    /**
     * Clean up old history data to prevent memory bloat
     */
    cleanupHistory() {
        const cutoff = Date.now() - (this.noiseWindow * 2); // Keep 2x window size
        
        this.noiseHistory = this.noiseHistory.filter(entry => entry.timestamp > cutoff);
        this.qualityHistory = this.qualityHistory.filter(entry => entry.timestamp > cutoff);
    }
    
    /**
     * Update configuration at runtime
     * @param {Object} newConfig - Configuration updates
     */
    updateConfiguration(newConfig) {
        this.routingConfig = { ...this.routingConfig, ...newConfig };
        console.log('Updated routing configuration:', this.routingConfig);
    }
    
    /**
     * Get current performance metrics
     * @returns {Object} Performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.metrics,
            currentNoiseLevel: this.currentNoiseLevel,
            noiseCharacterization: this.getNoiseCharacterization(this.currentNoiseLevel),
            recentQualityScore: this.getRecentQualityScore(),
            historySize: {
                noise: this.noiseHistory.length,
                quality: this.qualityHistory.length
            }
        };
    }
    
    /**
     * Get environmental status summary
     * @returns {Object} Current environmental status
     */
    getEnvironmentalStatus() {
        const noiseLevel = this.getNoiseLevel();
        const qualityScore = this.getRecentQualityScore();
        const routing = this.getRoutingRecommendation();
        
        return {
            noise: {
                level: noiseLevel,
                characterization: this.getNoiseCharacterization(noiseLevel),
                floor: this.calculateNoiseFloor()
            },
            speech: {
                qualityScore: qualityScore,
                detected: qualityScore !== null
            },
            routing: routing,
            isOptimal: routing.provider === 'webspeech' && routing.confidence >= 0.7
        };
    }
    
    /**
     * Cleanup and dispose of audio resources
     */
    dispose() {
        this.stopMonitoring();
        
        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        console.log('AudioEnvironmentDetector disposed');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEnvironmentDetector;
}
