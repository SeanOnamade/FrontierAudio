class EnhancedWakeWordDetector {
    constructor(languageManager) {
        this.languageManager = languageManager;
        this.isActive = false;
        this.confidenceThreshold = 0.7;
        this.sensitivityLevel = 'medium'; // low, medium, high
        this.customWakeWords = [];
        this.detectionHistory = [];
        this.noiseLevel = 0;
        this.adaptiveThreshold = 0.7;
        
        // Performance metrics
        this.metrics = {
            totalDetections: 0,
            falsePositives: 0,
            truePositives: 0,
            averageConfidence: 0,
            responseTime: []
        };
        
        // Sensitivity mappings
        this.sensitivityMappings = {
            'low': { threshold: 0.8, variations: false },
            'medium': { threshold: 0.7, variations: true },
            'high': { threshold: 0.6, variations: true }
        };
        
        // Audio analysis for stress detection
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        
        // Callbacks
        this.onWakeWordDetected = null;
        this.onConfidenceScore = null;
        this.onStressDetected = null;
        this.onNoiseAdaptation = null;
        
        this.init();
    }
    
    async init() {
        await this.loadCustomWakeWords();
        this.setupAudioAnalysis();
        this.startNoiseMonitoring();
    }
    
    async loadCustomWakeWords() {
        const saved = localStorage.getItem('jarvis-custom-wake-words');
        if (saved) {
            try {
                this.customWakeWords = JSON.parse(saved);
            } catch (error) {
                console.error('Failed to load custom wake words:', error);
                this.customWakeWords = [];
            }
        }
    }
    
    saveCustomWakeWords() {
        localStorage.setItem('jarvis-custom-wake-words', JSON.stringify(this.customWakeWords));
    }
    
    async setupAudioAnalysis() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            
            // Get microphone access for advanced analysis
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            console.log('Advanced audio analysis initialized');
        } catch (error) {
            console.warn('Advanced audio analysis not available:', error.message);
        }
    }
    
    startNoiseMonitoring() {
        if (!this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        const monitorNoise = () => {
            this.analyser.getByteFrequencyData(dataArray);
            
            // Calculate average noise level
            const sum = dataArray.reduce((a, b) => a + b, 0);
            this.noiseLevel = sum / dataArray.length;
            
            // Adapt threshold based on noise level
            this.adaptThresholdToNoise();
            
            if (this.isActive) {
                requestAnimationFrame(monitorNoise);
            }
        };
        
        monitorNoise();
    }
    
    adaptThresholdToNoise() {
        // Increase threshold in noisy environments
        const baseThreshold = this.sensitivityMappings[this.sensitivityLevel].threshold;
        
        if (this.noiseLevel > 100) {
            this.adaptiveThreshold = Math.min(baseThreshold + 0.1, 0.9);
        } else if (this.noiseLevel > 60) {
            this.adaptiveThreshold = baseThreshold + 0.05;
        } else {
            this.adaptiveThreshold = baseThreshold;
        }
        
        if (this.onNoiseAdaptation) {
            this.onNoiseAdaptation(this.noiseLevel, this.adaptiveThreshold);
        }
    }
    
    detect(transcript, isFinal = false) {
        if (!transcript || typeof transcript !== 'string') {
            return { detected: false, confidence: 0, word: null, language: null };
        }
        
        const startTime = performance.now();
        const currentLanguage = this.languageManager ? this.languageManager.getCurrentLanguage() : 'en';
        const normalizedTranscript = this.normalizeText(transcript);
        
        // Get all applicable wake words
        const defaultWakeWords = ['jarvis', 'hey jarvis', 'hello jarvis'];
        const allWakeWords = [
            ...(this.languageManager ? this.languageManager.getWakeWords() : defaultWakeWords),
            ...this.customWakeWords,
            ...this.getVariationsForLanguage(currentLanguage)
        ];
        
        const result = this.findBestMatch(normalizedTranscript, allWakeWords, currentLanguage);
        const endTime = performance.now();
        
        // Record detection attempt
        this.recordDetection(result, endTime - startTime);
        
        // Check stress levels if advanced audio analysis is available
        if (result.detected && this.analyser) {
            this.analyzeStressLevel(transcript);
        }
        
        if (result.confidence >= this.adaptiveThreshold) {
            this.metrics.totalDetections++;
            
            if (this.onWakeWordDetected) {
                this.onWakeWordDetected(result);
            }
            
            return { ...result, detected: true, language: currentLanguage };
        }
        
        if (this.onConfidenceScore) {
            this.onConfidenceScore(result.confidence);
        }
        
        return { ...result, detected: false, language: currentLanguage };
    }
    
    getVariationsForLanguage(language) {
        const variations = {
            'en': ['jarvis', 'jarves', 'jarvus', 'jervis', 'hey jarvis', 'hi jarvis', 'hello jarvis'],
            'es': ['jaime', 'jayme', 'hola jaime', 'oye jaime', 'hey jaime'],
            'fr': ['jacques', 'jack', 'salut jacques', 'hey jacques', 'bonjour jacques']
        };
        
        return variations[language] || [];
    }
    
    findBestMatch(transcript, wakeWords, language) {
        let bestMatch = { word: null, confidence: 0, position: -1, method: 'none' };
        
        // 1. Exact matches (highest priority)
        for (const wakeWord of wakeWords) {
            const exactMatch = this.findExactMatch(transcript, wakeWord);
            if (exactMatch.confidence > bestMatch.confidence) {
                bestMatch = { ...exactMatch, method: 'exact' };
            }
        }
        
        // 2. Fuzzy matches if no exact match found
        if (bestMatch.confidence < this.adaptiveThreshold && 
            this.sensitivityMappings[this.sensitivityLevel].variations) {
            
            for (const wakeWord of wakeWords) {
                const fuzzyMatch = this.findFuzzyMatch(transcript, wakeWord);
                if (fuzzyMatch.confidence > bestMatch.confidence) {
                    bestMatch = { ...fuzzyMatch, method: 'fuzzy' };
                }
            }
        }
        
        // 3. Phonetic matches for mispronunciations
        if (bestMatch.confidence < this.adaptiveThreshold) {
            for (const wakeWord of wakeWords) {
                const phoneticMatch = this.findPhoneticMatch(transcript, wakeWord);
                if (phoneticMatch.confidence > bestMatch.confidence) {
                    bestMatch = { ...phoneticMatch, method: 'phonetic' };
                }
            }
        }
        
        return bestMatch;
    }
    
    findExactMatch(transcript, wakeWord) {
        const position = transcript.indexOf(wakeWord.toLowerCase());
        if (position !== -1) {
            return {
                word: wakeWord,
                confidence: 1.0,
                position: position
            };
        }
        return { word: null, confidence: 0, position: -1 };
    }
    
    findFuzzyMatch(transcript, wakeWord) {
        const words = transcript.split(' ');
        let bestScore = 0;
        let bestPosition = -1;
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            
            // Single word similarity
            const similarity = this.calculateSimilarity(word, wakeWord);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestPosition = i;
            }
            
            // Multi-word phrase matching
            if (wakeWord.includes(' ') && i < words.length - 1) {
                const wordCount = wakeWord.split(' ').length;
                const phrase = words.slice(i, i + wordCount).join(' ');
                const phraseSimilarity = this.calculateSimilarity(phrase, wakeWord);
                
                if (phraseSimilarity > bestScore) {
                    bestScore = phraseSimilarity;
                    bestPosition = i;
                }
            }
        }
        
        return {
            word: wakeWord,
            confidence: bestScore,
            position: bestPosition
        };
    }
    
    findPhoneticMatch(transcript, wakeWord) {
        // Simple phonetic matching using Soundex-like algorithm
        const phoneticTranscript = this.getPhoneticKey(transcript);
        const phoneticWakeWord = this.getPhoneticKey(wakeWord);
        
        const similarity = this.calculateSimilarity(phoneticTranscript, phoneticWakeWord);
        
        return {
            word: wakeWord,
            confidence: similarity * 0.8, // Lower confidence for phonetic matches
            position: transcript.toLowerCase().indexOf(wakeWord.toLowerCase())
        };
    }
    
    getPhoneticKey(text) {
        // Simplified phonetic algorithm
        return text.toLowerCase()
            .replace(/[aeiou]/g, '') // Remove vowels
            .replace(/[^a-z]/g, '') // Remove non-letters
            .substring(0, 4); // First 4 consonants
    }
    
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1.0;
        
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / maxLength);
    }
    
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    analyzeStressLevel(transcript) {
        if (!this.analyser) return;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        // Analyze frequency patterns for stress indicators
        const highFrequency = dataArray.slice(Math.floor(dataArray.length * 0.7)).reduce((a, b) => a + b, 0);
        const totalEnergy = dataArray.reduce((a, b) => a + b, 0);
        const stressRatio = highFrequency / totalEnergy;
        
        // Simple stress detection based on high-frequency content
        if (stressRatio > 0.3) {
            console.log('Potential stress detected in voice');
            if (this.onStressDetected) {
                this.onStressDetected({
                    level: stressRatio,
                    transcript: transcript,
                    timestamp: Date.now()
                });
            }
        }
    }
    
    normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    recordDetection(result, responseTime) {
        this.detectionHistory.push({
            timestamp: Date.now(),
            confidence: result.confidence,
            detected: result.confidence >= this.adaptiveThreshold,
            responseTime: responseTime,
            noiseLevel: this.noiseLevel,
            threshold: this.adaptiveThreshold
        });
        
        // Keep only last 100 detections
        if (this.detectionHistory.length > 100) {
            this.detectionHistory = this.detectionHistory.slice(-100);
        }
        
        this.metrics.responseTime.push(responseTime);
        if (this.metrics.responseTime.length > 50) {
            this.metrics.responseTime = this.metrics.responseTime.slice(-50);
        }
    }
    
    // Configuration methods
    setSensitivity(level) {
        if (['low', 'medium', 'high'].includes(level)) {
            this.sensitivityLevel = level;
            const config = this.sensitivityMappings[level];
            this.confidenceThreshold = config.threshold;
            localStorage.setItem('jarvis-wake-word-sensitivity', level);
        }
    }
    
    addCustomWakeWord(wakeWord) {
        if (wakeWord && !this.customWakeWords.includes(wakeWord.toLowerCase())) {
            this.customWakeWords.push(wakeWord.toLowerCase());
            this.saveCustomWakeWords();
            return true;
        }
        return false;
    }
    
    removeCustomWakeWord(wakeWord) {
        const index = this.customWakeWords.indexOf(wakeWord.toLowerCase());
        if (index > -1) {
            this.customWakeWords.splice(index, 1);
            this.saveCustomWakeWords();
            return true;
        }
        return false;
    }
    
    // Analytics and performance
    getPerformanceMetrics() {
        const avgResponseTime = this.metrics.responseTime.length > 0 
            ? this.metrics.responseTime.reduce((a, b) => a + b, 0) / this.metrics.responseTime.length 
            : 0;
        
        const recentDetections = this.detectionHistory.slice(-20);
        const avgConfidence = recentDetections.length > 0
            ? recentDetections.reduce((sum, d) => sum + d.confidence, 0) / recentDetections.length
            : 0;
        
        return {
            totalDetections: this.metrics.totalDetections,
            averageResponseTime: avgResponseTime,
            averageConfidence: avgConfidence,
            currentThreshold: this.adaptiveThreshold,
            noiseLevel: this.noiseLevel,
            sensitivityLevel: this.sensitivityLevel,
            customWakeWordsCount: this.customWakeWords.length
        };
    }
    
    exportConfiguration() {
        return {
            customWakeWords: this.customWakeWords,
            sensitivityLevel: this.sensitivityLevel,
            confidenceThreshold: this.confidenceThreshold,
            metrics: this.metrics,
            detectionHistory: this.detectionHistory.slice(-50) // Export recent history
        };
    }
    
    importConfiguration(config) {
        if (config.customWakeWords) {
            this.customWakeWords = config.customWakeWords;
            this.saveCustomWakeWords();
        }
        if (config.sensitivityLevel) {
            this.setSensitivity(config.sensitivityLevel);
        }
        if (config.confidenceThreshold) {
            this.confidenceThreshold = config.confidenceThreshold;
        }
    }
    
    // Training mode for wake word optimization
    startTrainingMode() {
        this.trainingMode = true;
        this.trainingData = [];
        console.log('Wake word training mode started');
    }
    
    stopTrainingMode() {
        this.trainingMode = false;
        if (this.trainingData && this.trainingData.length > 0) {
            this.optimizeThreshold();
        }
        console.log('Wake word training mode stopped');
    }
    
    recordTrainingSample(transcript, isValidWakeWord) {
        if (this.trainingMode) {
            this.trainingData.push({
                transcript: transcript,
                isValid: isValidWakeWord,
                confidence: this.detect(transcript, true).confidence,
                timestamp: Date.now()
            });
        }
    }
    
    optimizeThreshold() {
        if (!this.trainingData || this.trainingData.length < 10) {
            console.warn('Insufficient training data for optimization');
            return;
        }
        
        // Find optimal threshold using training data
        let bestThreshold = this.confidenceThreshold;
        let bestAccuracy = 0;
        
        for (let threshold = 0.5; threshold <= 0.9; threshold += 0.05) {
            let correct = 0;
            
            this.trainingData.forEach(sample => {
                const predicted = sample.confidence >= threshold;
                if (predicted === sample.isValid) {
                    correct++;
                }
            });
            
            const accuracy = correct / this.trainingData.length;
            if (accuracy > bestAccuracy) {
                bestAccuracy = accuracy;
                bestThreshold = threshold;
            }
        }
        
        this.confidenceThreshold = bestThreshold;
        console.log(`Optimized threshold to ${bestThreshold} with ${(bestAccuracy * 100).toFixed(1)}% accuracy`);
    }
    
    reset() {
        this.isActive = false;
        this.detectionHistory = [];
        this.metrics = {
            totalDetections: 0,
            falsePositives: 0,
            truePositives: 0,
            averageConfidence: 0,
            responseTime: []
        };
    }
}
