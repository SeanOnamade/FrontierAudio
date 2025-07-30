class WakeWordDetector {
    constructor() {
        this.wakeWords = [
            'jarvis',
            'hey jarvis',
            'hello jarvis',
            'jarvis hello'
        ];
        
        this.variations = [
            'jarvis',
            'jarves',
            'jarvus',
            'jervis',
            'hey jarvis',
            'hi jarvis',
            'hello jarvis'
        ];
        
        this.confidenceThreshold = 0.7;
        this.isActive = false;
        
        // Callbacks
        this.onWakeWordDetected = null;
        this.onConfidenceScore = null;
    }
    
    /**
     * Analyze transcript for wake word presence
     * @param {string} transcript - The speech transcript to analyze
     * @param {boolean} isFinal - Whether this is a final result
     * @returns {object} Detection result
     */
    detect(transcript, isFinal = false) {
        if (!transcript || typeof transcript !== 'string') {
            return { detected: false, confidence: 0, word: null };
        }
        
        const normalizedTranscript = this.normalizeText(transcript);
        const result = this.findBestMatch(normalizedTranscript);
        
        // Log detection attempts for debugging
        console.log(`Wake word detection: "${transcript}" -> confidence: ${result.confidence}`);
        
        if (result.confidence >= this.confidenceThreshold) {
            if (this.onWakeWordDetected) {
                this.onWakeWordDetected(result);
            }
            return { ...result, detected: true };
        }
        
        if (this.onConfidenceScore) {
            this.onConfidenceScore(result.confidence);
        }
        
        return { ...result, detected: false };
    }
    
    /**
     * Find the best matching wake word in the transcript
     * @param {string} transcript - Normalized transcript
     * @returns {object} Best match result
     */
    findBestMatch(transcript) {
        let bestMatch = { word: null, confidence: 0, position: -1 };
        
        // Check exact matches first
        for (const wakeWord of this.wakeWords) {
            const exactMatch = this.findExactMatch(transcript, wakeWord);
            if (exactMatch.confidence > bestMatch.confidence) {
                bestMatch = exactMatch;
            }
        }
        
        // If no exact match, try variations
        if (bestMatch.confidence < this.confidenceThreshold) {
            for (const variation of this.variations) {
                const variationMatch = this.findVariationMatch(transcript, variation);
                if (variationMatch.confidence > bestMatch.confidence) {
                    bestMatch = variationMatch;
                }
            }
        }
        
        return bestMatch;
    }
    
    /**
     * Find exact wake word match
     * @param {string} transcript - Normalized transcript
     * @param {string} wakeWord - Wake word to search for
     * @returns {object} Match result
     */
    findExactMatch(transcript, wakeWord) {
        const position = transcript.indexOf(wakeWord);
        if (position !== -1) {
            return {
                word: wakeWord,
                confidence: 1.0,
                position: position
            };
        }
        return { word: null, confidence: 0, position: -1 };
    }
    
    /**
     * Find approximate wake word match using fuzzy matching
     * @param {string} transcript - Normalized transcript
     * @param {string} variation - Variation to search for
     * @returns {object} Match result
     */
    findVariationMatch(transcript, variation) {
        const words = transcript.split(' ');
        let bestScore = 0;
        let bestPosition = -1;
        
        // Check single words and phrases
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const similarity = this.calculateSimilarity(word, variation);
            
            if (similarity > bestScore) {
                bestScore = similarity;
                bestPosition = i;
            }
            
            // Check phrases (for "hey jarvis", etc.)
            if (i < words.length - 1 && variation.includes(' ')) {
                const phrase = `${word} ${words[i + 1]}`;
                const phraseSimilarity = this.calculateSimilarity(phrase, variation);
                
                if (phraseSimilarity > bestScore) {
                    bestScore = phraseSimilarity;
                    bestPosition = i;
                }
            }
        }
        
        return {
            word: variation,
            confidence: bestScore,
            position: bestPosition
        };
    }
    
    /**
     * Calculate string similarity using Levenshtein distance
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Similarity score (0-1)
     */
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1.0;
        
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / maxLength);
    }
    
    /**
     * Calculate Levenshtein distance between two strings
     * @param {string} str1 - First string
     * @param {string} str2 - Second string
     * @returns {number} Edit distance
     */
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
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    /**
     * Normalize text for consistent processing
     * @param {string} text - Text to normalize
     * @returns {string} Normalized text
     */
    normalizeText(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ')    // Normalize whitespace
            .trim();
    }
    
    /**
     * Extract command from transcript after wake word detection
     * @param {string} transcript - Full transcript
     * @param {object} wakeWordResult - Wake word detection result
     * @returns {string} Extracted command
     */
    extractCommand(transcript, wakeWordResult) {
        if (!wakeWordResult.detected || wakeWordResult.position === -1) {
            return transcript;
        }
        
        const normalizedTranscript = this.normalizeText(transcript);
        const wakeWordEnd = wakeWordResult.position + wakeWordResult.word.length;
        
        let command = normalizedTranscript.substring(wakeWordEnd).trim();
        
        // Remove common filler words that might appear after wake word
        const fillerWords = ['um', 'uh', 'er', 'ah', 'well', 'so'];
        const words = command.split(' ');
        
        while (words.length > 0 && fillerWords.includes(words[0])) {
            words.shift();
        }
        
        return words.join(' ').trim();
    }
    
    /**
     * Set confidence threshold for wake word detection
     * @param {number} threshold - Confidence threshold (0-1)
     */
    setConfidenceThreshold(threshold) {
        if (threshold >= 0 && threshold <= 1) {
            this.confidenceThreshold = threshold;
        }
    }
    
    /**
     * Add custom wake word variations
     * @param {string[]} variations - Array of variations to add
     */
    addVariations(variations) {
        if (Array.isArray(variations)) {
            this.variations.push(...variations.map(v => this.normalizeText(v)));
        }
    }
    
    /**
     * Get current wake word configuration
     * @returns {object} Configuration object
     */
    getConfig() {
        return {
            wakeWords: [...this.wakeWords],
            variations: [...this.variations],
            confidenceThreshold: this.confidenceThreshold,
            isActive: this.isActive
        };
    }
    
    /**
     * Reset the detector state
     */
    reset() {
        this.isActive = false;
    }
    
    /**
     * Enable debug mode for detailed logging
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
} 