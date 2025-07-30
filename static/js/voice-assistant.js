class VoiceAssistant {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isProcessing = false;
        this.wakeWordDetected = false;
        this.isSpeaking = false; // Flag to prevent self-interruption
        this.lastTranscript = '';
        this.lastCommandTime = 0; // Add debouncing for commands
        this.commandTimeout = null; // Timer for processing commands
        this.processingLock = false; // Prevent multiple processing attempts
        this.lastWakeWordTime = 0; // Timestamp of last wake word detection
        this.globalCooldown = 500; // 0.5 second cooldown between wake words
        this.microphoneTested = false; // Track if microphone has been tested
        
        // Enhanced features
        this.languageManager = null;
        this.enhancedWakeWordDetector = null;
        this.voiceBiometrics = null;
        this.currentUser = null;
        this.stressDetectionEnabled = true;
        
        // Conversation & Context features
        this.conversationMemory = null;
        this.smartQueryProcessor = null;
        this.proactiveAssistant = null;
        
        // Configuration
        this.config = {
            continuous: true,
            interimResults: true,
            language: 'en-US',
            maxAlternatives: 1,
            enableBiometrics: false,
            enableStressDetection: true,
            autoLanguageDetection: false  // Disable auto language detection to stay in English
        };
        
        // Aviation terminology normalization
        this.aviationTerminology = {
            // Flight number patterns
            flightNumberPatterns: [
                /\b([A-Z]{1,3})\s*(\d{1,4})\b/gi,  // "UA 2406" -> "UA2406"
                /\b([A-Z])\s*([A-Z])\s*(\d{1,4})\b/gi,  // "U A 2406" -> "UA2406"
                /\b([A-Z])\.?\s*([A-Z])\.?\s*(\d{1,4})\b/gi,  // "U.A. 2406" -> "UA2406"
                /\b([A-Z]{1,3})\s*(\d)\s*(\d)\s*(\d)\s*(\d)\b/gi  // "UA 2 4 0 6" -> "UA2406"
            ],
            
            // Common misheard terms
            termCorrections: {
                'you a': 'UA',
                'u a': 'UA',
                'u. a.': 'UA',
                'you eight': 'UA',
                'united airlines': 'UA',
                'american airlines': 'AA',
                'delta': 'DL',
                'southwest': 'WN',
                'pushback': 'pushback',
                'gate': 'gate',
                'flight': 'flight',
                'status': 'status',
                'tractor': 'tractor',
                'equipment': 'equipment',
                'ramp': 'ramp',
                'cleaning': 'cleaning',
                'maintenance': 'maintenance'
            }
        };
        
        // Callbacks
        this.onStatusChange = null;
        this.onListeningChange = null;
        this.onTranscriptReceived = null;
        this.onResponseReceived = null;
        this.onError = null;
        this.onLanguageDetected = null;
        this.onUserAuthenticated = null;
        this.onStressDetected = null;
        
        this.init();
    }
    
    async init() {
        // Initialize conversation memory
        this.conversationMemory = new ConversationMemory();
        
        // Initialize smart query processor
        this.smartQueryProcessor = new SmartQueryProcessor();
        
        // Initialize proactive assistant with reference to this voice assistant
        this.proactiveAssistant = new ProactiveAssistant('/api', this);
        this.proactiveAssistant.onNotification = (alert) => {
            console.log('Proactive notification:', alert);
        };
        this.proactiveAssistant.onAlert = (alert) => {
            console.log('Proactive alert:', alert);
        };
        this.proactiveAssistant.onCriticalAlert = (alert) => {
            console.log('Critical alert:', alert);
            if (this.onStatusChange) {
                this.onStatusChange(`ALERT: ${alert.message}`);
            }
        };
        
        // Initialize language manager with retry logic
        if (typeof LanguageManager !== 'undefined') {
            this.languageManager = new LanguageManager();
            this.languageManager.onLanguageChange = (language) => {
                this.updateLanguage(language);
                if (this.onLanguageDetected) {
                    this.onLanguageDetected(language);
                }
            };
            
            // Wait for language manager to initialize
            await this.waitForLanguageManager();
        }
        
        // Initialize enhanced wake word detector (with or without language manager)
        if (typeof EnhancedWakeWordDetector !== 'undefined') {
            console.log('Initializing enhanced wake word detector...');
            this.enhancedWakeWordDetector = new EnhancedWakeWordDetector(this.languageManager);
            this.enhancedWakeWordDetector.onWakeWordDetected = (result) => {
                this.handleWakeWordDetection(result);
            };
            this.enhancedWakeWordDetector.onStressDetected = (stressInfo) => {
                this.handleStressDetection(stressInfo);
            };
            console.log('Enhanced wake word detector initialized');
        } else {
            console.warn('EnhancedWakeWordDetector not available, using basic wake word detection');
        }
        
        // Initialize voice biometrics if enabled
        if (this.config.enableBiometrics && typeof VoiceBiometrics !== 'undefined') {
            this.voiceBiometrics = new VoiceBiometrics();
            this.voiceBiometrics.onAuthenticationSuccess = (userId, confidence) => {
                this.handleUserAuthentication(userId, confidence);
            };
            this.voiceBiometrics.onAuthenticationFailure = (confidence) => {
                this.handleAuthenticationFailure(confidence);
            };
        }
        
        this.initializeSpeechRecognition();
    }
    
    async waitForLanguageManager() {
        if (!this.languageManager) return;
        
        // Wait up to 3 seconds for language manager to initialize
        const maxWait = 3000;
        const startTime = Date.now();
        
        while (!this.languageManager.supportedLanguages || Object.keys(this.languageManager.supportedLanguages).length === 0) {
            if (Date.now() - startTime > maxWait) {
                console.warn('Language manager initialization timeout, proceeding with defaults');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Speech recognition not supported in this browser');
            this.showError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        // Enhanced configuration
        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.lang = this.config.language;
        this.recognition.maxAlternatives = this.config.maxAlternatives;
        
        // Add error handling
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            switch(event.error) {
                case 'no-speech':
                    console.log('No speech was detected. Try speaking more clearly.');
                    // Don't treat this as a critical error - just restart
                    break;
                case 'audio-capture':
                    console.error('No microphone found or microphone access denied.');
                    this.showError('Microphone access denied. Please allow microphone access and refresh the page.');
                    this.isListening = false;
                    return;
                case 'not-allowed':
                    console.error('Microphone permission denied by user.');
                    this.showError('Please allow microphone access in your browser settings and refresh the page.');
                    this.isListening = false;
                    return;
                case 'network':
                    console.error('Network error occurred.');
                    this.showError('Network error. Please check your internet connection.');
                    break;
                case 'aborted':
                    console.log('Speech recognition was aborted.');
                    // Don't treat abort as critical error - often happens during normal operation
                    break;
                default:
                    console.error('Speech recognition error:', event.error);
                    this.showError(`Speech recognition error: ${event.error}`);
            }
            
            // Only update state if not currently processing or speaking
            if (!this.isProcessing && !this.isSpeaking) {
                this.isListening = false;
                if (this.updateUIState) {
                    this.updateUIState();
                }
                
                // Auto-restart after brief delay for non-critical errors
                setTimeout(() => {
                    if (!this.isListening && !this.isProcessing && !this.isSpeaking) {
                        console.log('🔄 Auto-restarting speech recognition after error');
                        this.startListening();
                    }
                }, 1000);
            }
        };
        
        // Set up event handlers
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        if (!this.recognition) return;
        
        this.recognition.onstart = () => {
            this.isListening = true;
            console.log('Speech recognition started');
            if (this.onStatusChange) {
                this.onStatusChange('Listening for wake word...');
            }
            if (this.onListeningChange) {
                this.onListeningChange(true);
            }
        };
        
        this.recognition.onresult = (event) => {
            this.handleSpeechResult(event);
        };
        
        this.recognition.onend = () => {
            console.log('Speech recognition ended, isListening:', this.isListening, 'isProcessing:', this.isProcessing);
            
            // Always reset isListening when recognition actually ends
            const wasListening = this.isListening;
            this.isListening = false;
            
            if (wasListening && !this.isProcessing && !this.processingLock && !this.wakeWordDetected) {
                // Only restart if not processing a command
                console.log('Scheduling speech recognition restart...');
                setTimeout(() => {
                    // Double-check we still want to be listening
                    if (!this.isProcessing && !this.processingLock && !this.isListening && !this.wakeWordDetected) {
                        console.log('Restarting speech recognition...');
                        this.startListening();
                    } else {
                        console.log('Skipping restart - system busy, processing, or wake word detected');
                    }
                }, 2000); // Longer delay to prevent audio overlap
            } else {
                console.log('Not restarting recognition - not listening, processing, or wake word detected');
                if (this.onListeningChange) {
                    this.onListeningChange(false);
                }
            }
        };
    }
    
    handleSpeechResult(event) {
        // Completely ignore speech recognition while speaking to prevent self-interruption
        if (this.isSpeaking) {
            // Reduced logging to minimize console noise
            return;
        }
        
        let transcript = '';
        let isFinal = false;
        
        // Get only the newest result to prevent accumulation
        if (event.results.length > 0) {
            const latestResult = event.results[event.results.length - 1];
            transcript = latestResult[0].transcript;
            isFinal = latestResult.isFinal;
        }
        
        transcript = transcript.trim();
        
        if (this.onTranscriptReceived) {
            this.onTranscriptReceived(transcript, isFinal);
        }
        
        // Auto-detect language if enabled (disabled to keep English)
        // if (this.config.autoLanguageDetection && transcript.length > 10) {
        //     const languageChanged = this.languageManager.autoSwitchLanguage(transcript);
        //     if (languageChanged) {
        //         this.updateSpeechRecognitionLanguage();
        //     }
        // }
        
        // Use enhanced wake word detection with relaxed timing for better responsiveness
        const now = Date.now();
        const timeSinceLastWakeWord = now - this.lastWakeWordTime;
        
        // Allow wake word detection on both interim and final results for faster response
        if (!this.wakeWordDetected && !this.isProcessing && !this.processingLock && !this.isSpeaking &&
            timeSinceLastWakeWord > this.globalCooldown) {
            let wakeWordDetected = false;
            
            console.log(`🔍 Checking wake word in result: "${transcript}"`);
            
                    // Check for wake word with minimal text length for faster detection
        if (transcript.length > 2) {
            // INSTANT wake word check for common variations
            const quickCheck = transcript.toLowerCase().trim();
            if (quickCheck === 'jarvis' || quickCheck.endsWith('jarvis') || quickCheck.includes('jarvis')) {
                console.log('🚀 INSTANT wake word detected!');
                wakeWordDetected = true;
            }
                if (!wakeWordDetected && this.enhancedWakeWordDetector) {
                    console.log('Using enhanced wake word detector...');
                    const wakeWordResult = this.enhancedWakeWordDetector.detect(transcript, isFinal);
                    wakeWordDetected = wakeWordResult.detected;
                    console.log('Enhanced wake word result:', wakeWordResult);
                    if (wakeWordDetected) {
                        console.log('✅ Enhanced wake word detected!', wakeWordResult);
                    }
                } else {
                    console.log('Using simple wake word detection...');
                    // Fallback to simple wake word detection
                    wakeWordDetected = this.containsWakeWord(transcript.toLowerCase());
                    if (wakeWordDetected) {
                        console.log('✅ Simple wake word detected!');
                    }
                }
            }
            
            if (wakeWordDetected) {
                console.log('🎯 Wake word confirmed! Setting wakeWordDetected = true');
                this.wakeWordDetected = true;
                this.lastTranscript = '';
                this.lastWakeWordTime = now; // Record wake word detection time
                
                // Clear any existing timeouts
                if (this.commandTimeout) {
                    clearTimeout(this.commandTimeout);
                    this.commandTimeout = null;
                }
                
                const wakeWord = this.languageManager ? 
                    this.languageManager.getWakeWords()[0] : 'Jarvis';
                const statusMessage = this.languageManager ? 
                    this.languageManager.translate('wake_word_detected', { wake_word: wakeWord }) :
                    'Wake word detected! Please say your command.';
                
                if (this.onStatusChange) {
                    this.onStatusChange(statusMessage);
                }
                
                // Add visual feedback
                this.showStatus('🎤 Wake word detected! Listening for your command...', 'success');
                
                // Auto-reset wake word after 15 seconds if no command is given and no recent activity
                setTimeout(() => {
                    if (this.wakeWordDetected && !this.isProcessing && !this.processingLock && 
                        (!this.lastTranscript || this.lastTranscript.length < 5)) {
                        console.log('🔄 Auto-resetting wake word detection after timeout (no meaningful input)');
                        this.wakeWordDetected = false;
                        this.lastTranscript = '';
                        if (this.commandTimeout) {
                            clearTimeout(this.commandTimeout);
                            this.commandTimeout = null;
                        }
                        if (this.onStatusChange) {
                            this.onStatusChange('Ready - Say "Jarvis" to begin');
                        }
                    }
                }, 15000); // Increased to 15 seconds
                
                return;
            }
        } else if (isFinal && timeSinceLastWakeWord <= this.globalCooldown) {
            console.log(`🚫 Wake word detection in cooldown (${(this.globalCooldown - timeSinceLastWakeWord)/1000}s remaining)`);
        } else if (this.wakeWordDetected && !this.isSpeaking) {
            // Wake word already detected, capture the command - but NOT while speaking
            
            // Deduplicate transcripts to prevent accumulation
            if (this.lastTranscript === transcript && transcript.length > 10) {
                console.log(`🔄 Duplicate transcript ignored: "${transcript}"`);
                return;
            }
            
            // Detect repeated content in transcript (sign of multiple detections)
            const words = transcript.toLowerCase().split(' ');
            if (words.length > 8) {
                const uniqueWords = new Set(words);
                const repetitionRatio = words.length / uniqueWords.size;
                if (repetitionRatio > 2) {
                    console.log(`🚫 Repeated content detected (ratio: ${repetitionRatio.toFixed(1)}), ignoring transcript`);
                    return;
                }
            }
            
            this.lastTranscript = transcript;
            
            console.log(`🎤 Command capture - Transcript: "${transcript}", isFinal: ${isFinal}, Length: ${transcript.length}`);
            
            // Clear any existing command timeout
            if (this.commandTimeout) {
                clearTimeout(this.commandTimeout);
                this.commandTimeout = null;
            }
            
            // Process command immediately if final and has content
            if (isFinal && transcript.length > 0) {
                console.log('🎤 Processing voice command (final):', transcript);
                
                // Send debug info to server
                fetch('/api/debug-query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        originalTranscript: transcript,
                        query: transcript 
                    })
                }).catch(e => console.warn('Debug logging failed:', e));
                
                this.processCommand(transcript);
            } 
            // For interim results, set a timeout to process if speech stops (less aggressive)
            else if (!isFinal && transcript.length > 10) {
                console.log('🎤 Setting command timeout for interim result:', transcript);
                this.commandTimeout = setTimeout(() => {
                    if (this.wakeWordDetected && !this.isProcessing && !this.processingLock && this.lastTranscript.length > 10) {
                        console.log('🎤 Processing voice command (timeout):', this.lastTranscript);
                        
                        // Send debug info to server
                        fetch('/api/debug-query', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                originalTranscript: this.lastTranscript,
                                query: this.lastTranscript 
                            })
                        }).catch(e => console.warn('Debug logging failed:', e));
                        
                        this.processCommand(this.lastTranscript);
                    } else {
                        console.log('🚫 Timeout processing skipped - already processed or invalid state');
                    }
                }, 2000); // Process after 2 seconds of silence
            }
        }
    }
    
    containsWakeWord(transcript) {
        const wakeWords = ['jarvis', 'hey jarvis'];
        const detected = wakeWords.some(word => transcript.includes(word));
        console.log(`Simple wake word check: "${transcript}" -> ${detected}`);
        return detected;
    }
    
    /**
     * Lightweight voice input normalization
     * NOTE: Heavy lifting now done by Smart Selective LLM correction
     * This function only handles basic, safe normalizations
     */
    normalizeVoiceInput(transcript) {
        console.log('🔧 LIGHTWEIGHT NORMALIZATION (LLM handles complex corrections) 🔧');
        console.log('Original transcript:', transcript);
        
        let normalized = transcript.toLowerCase().trim();
        
        // Enhanced flight number normalization for better recognition
        normalized = normalized.replace(/\bu\s*a\s+to\s+(\d+)/gi, 'UA$1');  // "UA to 406" -> "UA406"
        normalized = normalized.replace(/\bu\s*a\s+too\s+(\d+)/gi, 'UA$1');  // "UA too 406" -> "UA406"
        normalized = normalized.replace(/\byou'?re?\s+in\s+(\d+)/gi, 'UA$1');  // "you're in 2406" -> "UA2406"
        normalized = normalized.replace(/\byou\s+are\s+in\s+(\d+)/gi, 'UA$1');  // "you are in 2406" -> "UA2406"
        normalized = normalized.replace(/\byou\s+a\s+(\d+)/gi, 'UA$1');  // "you a 2406" -> "UA2406"
        normalized = normalized.replace(/\byou\s+away\s+(\d+)/gi, 'UA$1');  // "you away 2406" -> "UA2406" (NEW!)
        normalized = normalized.replace(/\bu\s+eight\s+(\d+)/gi, 'UA$1');  // "u eight 2406" -> "UA2406"
        normalized = normalized.replace(/\bu\s*a\s+(\d+)/gi, 'UA$1');  // "U A 406" -> "UA406"
        normalized = normalized.replace(/\bunited\s+airlines/gi, 'UA');
        normalized = normalized.replace(/\bamerican\s+airlines/gi, 'AA');
        normalized = normalized.replace(/\bdelta\s+airlines/gi, 'DL');
        normalized = normalized.replace(/\bsouthwest\s+airlines/gi, 'WN');
        
        // Basic space cleanup
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        console.log('Lightly normalized transcript:', normalized);
        
        /* MOVED TO LLM CORRECTION (for reference):
        // These patterns now handled by Smart Selective LLM:
        normalized = normalized.replace(/\bu\s*a\s+to\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\bu\s*a\s+too\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\byou'?re?\s+in\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\byou\s+are\s+in\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\byou\s+a\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\bu\s+eight\s+(\d+)/gi, 'UA$1');
        normalized = normalized.replace(/\bu\s*a\s+(\d+)/gi, 'UA$1');
        */
        
        return normalized;
    }

    /**
     * Enhanced command processing with better preprocessing
     */
    async processCommand(command) {
        // Reduced debouncing: prevent commands within 1 second of each other
        const now = Date.now();
        if (now - this.lastCommandTime < 1000) {
            console.log('🚫 Command ignored due to debouncing (1 second cooldown)');
            return;
        }
        
        if (this.isProcessing || this.processingLock || this.isSpeaking) {
            console.log('🚫 Command ignored - already processing or speaking');
            return;
        }
        
        this.isProcessing = true;
        this.processingLock = true;
        this.wakeWordDetected = false;
        this.lastCommandTime = now;
        
        // Stop speech recognition during processing to prevent interference
        if (this.recognition && this.isListening) {
            console.log('🛑 Stopping speech recognition during command processing');
            this.recognition.stop();
        }
        
        // Clear any pending command timeouts
        if (this.commandTimeout) {
            clearTimeout(this.commandTimeout);
            this.commandTimeout = null;
        }
        
        // Normalize the voice input first
        const originalCommand = command;
        command = this.normalizeVoiceInput(command);
        
        // Clean up the command (remove wake word if still present)
        command = this.cleanCommand(command);
        
        console.log('Processing command:', { original: originalCommand, normalized: command });
        
        if (command.length === 0) {
            this.speak("I didn't hear your question. Please try again.");
            this.isProcessing = false;
            return;
        }
        
        if (this.onStatusChange) {
            this.onStatusChange('Processing your request...');
        }
        
        try {
            // If OpenAI Whisper is enabled and confidence is low, try to improve transcription
            if (this.config.useOpenAIWhisper && this.shouldUseWhisperForCorrection(command)) {
                command = await this.improveTranscriptionWithOpenAI(command);
            }
            
            // Process with smart query processor if available
            let queryAnalysis = null;
            if (this.smartQueryProcessor) {
                queryAnalysis = await this.smartQueryProcessor.processQuery(
                    command, 
                    this.conversationMemory ? this.conversationMemory.getContextForQuery(command) : null
                );
                
                // Check if clarification is needed
                if (queryAnalysis && queryAnalysis.needsClarification) {
                    const clarificationMessage = queryAnalysis.ambiguities?.suggestions?.[0] || 
                        "Could you be more specific?";
                    this.speak(clarificationMessage);
                    this.isProcessing = false;
                    return;
                }
            }
            
            // Get conversation context if available
            const contextData = this.conversationMemory ? this.conversationMemory.getContextForQuery(command) : null;
            
            const startTime = Date.now();
            const response = await this.sendToBackend(command, '', contextData);
            const endTime = Date.now();
            const latency = (endTime - startTime) / 1000;
            
            console.log('🎯 Backend response:', response);
            
            if (response && response.response) {
                console.log('✅ Speaking response:', response.response.substring(0, 100) + '...');
                this.speak(response.response);
                
                if (this.onResponseReceived) {
                    this.onResponseReceived({
                        query: command,
                        response: response.response,
                        confidence: response.confidence || 0,
                        latency: latency,
                        timestamp: new Date().toLocaleTimeString(),
                        originalTranscript: originalCommand,
                        normalizedQuery: command
                    });
                }
                
                if (this.onStatusChange) {
                    const status = this.languageManager ? 
                        this.languageManager.translate('ready_with_time', { time: latency.toFixed(2) }) :
                        `Ready (${latency.toFixed(2)}s response time)`;
                    this.onStatusChange(status);
                }
                
                // Store interaction in conversation memory if available
                if (this.conversationMemory && this.conversationMemory.addInteraction) {
                    this.conversationMemory.addInteraction(command, response.response, {
                        confidence: response.confidence,
                        latency: latency,
                        originalTranscript: originalCommand
                    });
                }
            } else {
                console.error('❌ No valid response from server:', response);
                this.speak("I'm sorry, I didn't receive a valid response from the server.");
            }
            
        } catch (error) {
            console.error('Error processing command:', error);
            const errorMessage = this.languageManager ? 
                this.languageManager.translate('processing_error') :
                "I'm having trouble processing your request. Please try again.";
            this.speak(errorMessage);
            
            if (this.onError) {
                this.onError(`Error processing command: ${error.message}`);
            }
        } finally {
            this.isProcessing = false;
            this.processingLock = false;
            this.isSpeaking = false; // Always reset speaking flag
            this.lastTranscript = ''; // Clear transcript after processing
            console.log('✅ Command processing completed - all state reset');
            
            // Restart speech recognition after processing is complete
            setTimeout(() => {
                if (!this.isListening && !this.isProcessing && !this.processingLock) {
                    console.log('🔄 Restarting speech recognition after command processing');
                    this.startListening();
                }
            }, 1000);
        }
    }
    
    cleanCommand(command) {
        // Remove wake words from the command
        let cleaned = command;
        const wakeWords = ['jarvis', 'hey jarvis'];
        
        wakeWords.forEach(word => {
            cleaned = cleaned.replace(new RegExp(word + '\\s*', 'gi'), '');
        });
        
        return cleaned.trim();
    }
    
    async sendToBackend(query, contextPrompt = '', contextData = null) {
        const currentLanguage = this.languageManager ? this.languageManager.getCurrentLanguage() : 'en';
        
        const requestBody = {
            query: query,
            language: currentLanguage,
            sessionId: this.conversationMemory ? this.conversationMemory.sessionId : null,
            contextData: contextData
        };
        
        // Add user context if biometrics is enabled and user is authenticated
        if (this.config.enableBiometrics && this.currentUser) {
            requestBody.userId = this.currentUser;
        }
        
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    }
    
    speak(text) {
        // Don't speak if no text or empty text
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.warn('🚫 No text to speak, skipping synthesis');
            this.isSpeaking = false;
            return;
        }
        
        // Set synthesis lock to prevent interference
        this.synthesisLock = true;
        
        // Stop speech recognition completely during synthesis to prevent feedback
        if (this.recognition && this.isListening) {
            console.log('🔇 Stopping speech recognition during synthesis to prevent feedback');
            this.recognition.stop();
            this.isListening = false;
        }
        
        // Only cancel if there's actual speech happening to avoid conflicts
        if (this.synthesis.speaking) {
            this.synthesis.cancel();
            // Small delay to allow cancellation to complete
            setTimeout(() => this.performSpeech(text), 150);
            return;
        }
        
        this.performSpeech(text);
    }
    
    performSpeech(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Use language-specific voice if available
        if (this.languageManager) {
            const voice = this.languageManager.getVoiceForLanguage();
            if (voice) {
                utterance.voice = voice;
                utterance.lang = voice.lang;
            }
        }
        
        // Fallback to professional voice selection
        if (!utterance.voice) {
            const voices = this.synthesis.getVoices();
            const preferredVoice = voices.find(voice => 
                voice.name.includes('Google') || 
                voice.name.includes('Microsoft') ||
                voice.name.includes('Alex') ||
                voice.default
            );
            
            if (preferredVoice) {
                utterance.voice = preferredVoice;
            }
        }
        
        utterance.onstart = () => {
            // Set a flag to ignore speech recognition during synthesis
            this.isSpeaking = true;
            if (this.onStatusChange) {
                const speakingMessage = this.languageManager ? 
                    this.languageManager.translate('speaking') : 'Speaking...';
                this.onStatusChange(speakingMessage);
            }
        };
        
        utterance.onend = () => {
            // Clear the speaking flag and synthesis lock
            this.isSpeaking = false;
            this.synthesisLock = false;
            if (this.onStatusChange) {
                const wakeWord = this.languageManager ? 
                    this.languageManager.getWakeWords()[0] : 'Jarvis';
                const readyMessage = this.languageManager ? 
                    this.languageManager.translate('ready', { wake_word: wakeWord }) : 
                    'Ready - Say "Jarvis" to begin';
                this.onStatusChange(readyMessage);
            }
            
            // Restart speech recognition after synthesis is complete
            setTimeout(() => {
                if (!this.isListening && !this.isProcessing && !this.processingLock && !this.synthesisLock) {
                    console.log('🔄 Restarting speech recognition after synthesis completed');
                    this.startListening();
                }
            }, 500);
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            
            // Handle different error types
            if (event.error === 'interrupted' || event.error === 'canceled') {
                console.log('🔄 TTS was interrupted, attempting retry...');
                // Clear the speaking flag but keep synthesis lock during retry
            this.isSpeaking = false;
                setTimeout(() => {
                    if (!this.synthesis.speaking) {
                        console.log('🔄 Retrying TTS after interruption...');
                        this.performSpeech(text);
                        return; // Don't restart speech recognition yet
                    }
                }, 200);
                return;
            }
            
            // Always clear speaking flag and synthesis lock on actual error
            this.isSpeaking = false;
            this.synthesisLock = false;
            if (this.onError) {
                this.onError(`Speech synthesis error: ${event.error}`);
            }
            
            // Restart speech recognition after error (only for real errors, not interruptions)
            setTimeout(() => {
                if (!this.isListening && !this.isProcessing && !this.processingLock && !this.synthesisLock) {
                    console.log('🔄 Restarting speech recognition after synthesis error');
                    this.startListening();
                }
            }, 500);
        };
        
        this.synthesis.speak(utterance);
    }
    
    async startListening() {
        if (!this.recognition) {
            this.showError('Speech recognition not available');
            return false;
        }
        
        // Test microphone access on first start
        if (!this.microphoneTested) {
            console.log('🔬 Testing microphone for first time...');
            const microphoneOk = await this.testMicrophone();
            this.microphoneTested = true;
            
            if (!microphoneOk) {
                console.error('❌ Cannot start speech recognition - microphone test failed');
                return false;
            }
        }
        
        // Check if recognition is already active
        if (this.isListening) {
            console.log('Speech recognition already active, skipping start');
            return true;
        }
        
        try {
            console.log('🎤 Starting speech recognition...');
            // Clear all state when starting fresh
            this.isListening = true;
            this.wakeWordDetected = false;
            this.lastTranscript = '';
            this.lastCommandTime = 0;
            if (this.commandTimeout) {
                clearTimeout(this.commandTimeout);
                this.commandTimeout = null;
            }
            
            this.recognition.start();
            return true;
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            this.isListening = false; // Reset state on error
            this.showError(`Error starting speech recognition: ${error.message}`);
            return false;
        }
    }
    
    stopListening() {
        if (this.recognition) {
            console.log('Stopping speech recognition...');
            this.isListening = false;
            this.wakeWordDetected = false;
            
            try {
                this.recognition.stop();
            } catch (error) {
                console.log('Speech recognition already stopped:', error.message);
            }
            
            if (this.onStatusChange) {
                this.onStatusChange('Stopped');
            }
            if (this.onListeningChange) {
                this.onListeningChange(false);
            }
        }
    }
    
    isSupported() {
        return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    }
    
    // Enhanced feature handlers
    handleWakeWordDetection(result) {
        console.log('Wake word detected:', result);
        this.wakeWordDetected = true;
        
        // Perform voice authentication if enabled
        if (this.config.enableBiometrics && this.voiceBiometrics && !this.currentUser) {
            this.performVoiceAuthentication();
        }
    }
    
    handleStressDetection(stressInfo) {
        if (this.config.enableStressDetection && this.onStressDetected) {
            console.log('Stress detected in voice:', stressInfo);
            this.onStressDetected(stressInfo);
            
            // You could implement emergency protocols here
            if (stressInfo.level > 0.7) {
                console.warn('High stress level detected - consider emergency protocols');
            }
        }
    }
    
    handleUserAuthentication(userId, confidence) {
        this.currentUser = userId;
        console.log(`User authenticated: ${userId} (confidence: ${confidence})`);
        
        if (this.onUserAuthenticated) {
            this.onUserAuthenticated(userId, confidence);
        }
        
        // Personalize responses based on user
        if (this.onStatusChange) {
            this.onStatusChange(`Welcome back, ${userId}`);
        }
    }
    
    handleAuthenticationFailure(confidence) {
        console.log(`Authentication failed (confidence: ${confidence})`);
        
        if (this.onStatusChange) {
            this.onStatusChange('Voice authentication failed');
        }
        
        // Continue without personalization
        this.currentUser = null;
    }
    
    async performVoiceAuthentication() {
        if (!this.voiceBiometrics) return;
        
        try {
            // Capture voice sample for authentication
            const audioData = await this.captureVoiceSample();
            const authResult = await this.voiceBiometrics.authenticateVoice(audioData);
            
            if (authResult.authenticated) {
                this.handleUserAuthentication(authResult.userId, authResult.confidence);
            } else {
                this.handleAuthenticationFailure(authResult.confidence);
            }
        } catch (error) {
            console.error('Voice authentication error:', error);
        }
    }
    
    async captureVoiceSample() {
        // This would capture a short audio sample for authentication
        // Implementation would depend on the specific requirements
        return new Float32Array(1024); // Placeholder
    }
    
    updateLanguage(language) {
        this.config.language = this.getLanguageCode(language);
        if (this.recognition) {
            this.recognition.lang = this.config.language;
        }
    }
    
    updateSpeechRecognitionLanguage() {
        if (this.languageManager && this.recognition) {
            const currentLang = this.languageManager.getCurrentLanguage();
            this.config.language = this.getLanguageCode(currentLang);
            this.recognition.lang = this.config.language;
        }
    }
    
    getLanguageCode(language) {
        const languageCodes = {
            'en': 'en-US',
            'es': 'es-ES',
            'fr': 'fr-FR'
        };
        return languageCodes[language] || 'en-US';
    }
    
    // Configuration methods
    enableBiometrics(enable = true) {
        this.config.enableBiometrics = enable;
        if (enable && !this.voiceBiometrics) {
            this.voiceBiometrics = new VoiceBiometrics();
            this.voiceBiometrics.onAuthenticationSuccess = (userId, confidence) => {
                this.handleUserAuthentication(userId, confidence);
            };
            this.voiceBiometrics.onAuthenticationFailure = (confidence) => {
                this.handleAuthenticationFailure(confidence);
            };
        }
    }
    
    enableStressDetection(enable = true) {
        this.config.enableStressDetection = enable;
        this.stressDetectionEnabled = enable;
    }
    
    enableAutoLanguageDetection(enable = true) {
        this.config.autoLanguageDetection = enable;
    }

    /**
     * Enhanced Smart Selective LLM Correction
     * Balances accuracy with latency by targeting specific error patterns
     */
    shouldUseWhisperForCorrection(command) {
        // Skip very short commands (likely wake words or noise)
        if (command.length < 5) {
            return false;
        }
        
        // Skip simple responses that don't need correction
        const simpleResponses = ['yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'bye', 'hello', 'hi'];
        const cleanCommand = command.toLowerCase().trim();
        if (simpleResponses.includes(cleanCommand)) {
            return false;
        }
        
        // Check for aviation context first (safety check)
        const hasAviationContext = /\b(flight|status|gate|equipment|ramp|baggage|departure|arrival|delay|aircraft|terminal|crew|maintenance|pushback|tractor)\b/i.test(command);
        
        // Definite error patterns that indicate STT mishearing (high confidence)
        const definiteAviationErrors = [
            /\byou'?re?\s+in\s+\d{3,4}\b/i,        // "you're in 2406" → "UA2406"
            /\byou\s+are\s+in\s+\d{3,4}\b/i,       // "you are in 2406" → "UA2406"  
            /\byou\s+a\s+\d{3,4}\b/i,              // "you a 2406" → "UA2406"
            /\bu\s+eight\s+\d{3,4}\b/i,            // "u eight 2406" → "UA2406"
            /\b[a-z]\s+[a-z]\s+\d{3,4}\b/i,        // "u a 2406" → "UA2406"
            /\b\w+\s+\d\s+\d\s+\d\s+\d\b/,         // "UA 2 4 0 6" → "UA2406"
            /\b[a-z]{1,3}\s+to\s+\d{3,4}\b/i,      // "UA to 2406" → "UA2406"
            /\b[a-z]{1,3}\s+too\s+\d{3,4}\b/i      // "UA too 2406" → "UA2406"
        ];
        
        const hasDefiniteError = definiteAviationErrors.some(pattern => pattern.test(command));
        
        // FIXED: Allow error patterns with flight-like numbers even without aviation context
        // These are likely mishearings of flight numbers and should be corrected
        const hasFlightLikeNumber = /\b\d{3,4}\b/.test(command); // Contains 3-4 digit numbers
        
        if (hasDefiniteError && hasFlightLikeNumber) {
            console.log(`🎯 Error pattern with flight-like number detected, using LLM: "${command}"`);
            return true;
        }
        
        // Standard logic: Both aviation context AND error pattern
        if (hasAviationContext && hasDefiniteError) {
            console.log(`🎯 Aviation query with error pattern detected, using LLM: "${command}"`);
            return true;
        }

        // Log when we skip LLM correction
        if (hasDefiniteError && !hasAviationContext && !hasFlightLikeNumber) {
            console.log(`⚠️ Error pattern detected but no aviation context or flight number, skipping LLM: "${command}"`);
        }
        
        // IMPROVED: Log why we're skipping LLM correction for debugging
        if (hasAviationContext && !hasDefiniteError) {
            console.log(`✅ Aviation query looks clean, no LLM correction needed: "${command}"`);
        } else if (!hasAviationContext) {
            console.log(`✅ Non-aviation query, no LLM correction needed: "${command}"`);
        }
        
        return false;
        
        /* ORIGINAL APPROACH (for reference):
        const hasFragmentedNumbers = /\b\w+\s+\d\s+\d\s+\d\s+\d\b/.test(command);
        const hasUnusualSpacing = /\b[A-Z]\s+[A-Z]\s+\d+\b/.test(command.toUpperCase());
        const hasMisheardTerms = Object.keys(this.aviationTerminology.termCorrections)
            .some(term => command.toLowerCase().includes(term));
        return hasFragmentedNumbers || hasUnusualSpacing || hasMisheardTerms;
        */
    }

    /**
     * Use OpenAI to improve transcription accuracy
     */
    async improveTranscriptionWithOpenAI(command) {
        try {
            console.log('Attempting to improve transcription with OpenAI...');
            
            const response = await fetch('/api/improve-transcription', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    transcript: command,
                    context: 'airport operations voice assistant'
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('OpenAI improved transcription:', result.improved_transcript);
                return result.improved_transcript || command;
            }
        } catch (error) {
            console.warn('Failed to improve transcription with OpenAI:', error);
        }
        
        return command;
    }
    
    /**
     * Check if command contains unknown aviation entities that might need correction
     * FIXED: Improved flight recognition to prevent over-triggering
     */
    hasUnknownAviationEntities(command) {
        try {
            // Look for potential flight number patterns
            const flightPattern = /\b[a-z]{1,3}\s*\d{3,4}\b/gi;
            const potentialFlights = command.match(flightPattern);
            
            if (!potentialFlights) return false;
            
            console.log(`🔍 Checking potential flights:`, potentialFlights);
            
            // Check against our known flight cache (if available)
            for (const flight of potentialFlights) {
                const cleanFlight = flight.replace(/\s+/g, '').toUpperCase();
                console.log(`🔍 Checking flight: "${flight}" → "${cleanFlight}"`);
                
                // If it looks like a flight number but we don't recognize it, flag for LLM
                const isKnown = this.isKnownFlightNumber(cleanFlight);
                console.log(`🔍 Is "${cleanFlight}" known? ${isKnown}`);
                
                if (!isKnown) {
                    console.log(`🚨 Unknown flight pattern detected: "${flight}" → "${cleanFlight}"`);
                    return true;
                }
            }
            
            console.log(`✅ All flights recognized, no LLM needed`);
            return false;
        } catch (error) {
            console.warn('Error checking unknown entities:', error);
            return false; // Fail safe - don't use LLM if check fails
        }
    }
    
    /**
     * Check if a flight number is in our known flights cache
     * IMPROVED: Now recognizes common airline patterns instead of just hardcoded list
     */
    isKnownFlightNumber(flightNumber) {
        // Expanded cache of common flight numbers + pattern matching
        this._knownFlights = this._knownFlights || new Set([
            'UA2406', 'UA1234', 'UA567', 'AA123', 'DL456', 'WN789',
            // Add more common UA flights since UA2406 is our test case
            'UA2405', 'UA2407', 'UA2408', 'UA2409', 'UA2410'
        ]);
        
        // Direct lookup first
        if (this._knownFlights.has(flightNumber)) {
            console.log(`✅ Flight "${flightNumber}" found in cache`);
            return true;
        }
        
        // Pattern-based recognition for common airlines (prevents over-triggering)
        const commonPatterns = [
            /^UA\d{3,4}$/,  // United Airlines (like UA2406)
            /^AA\d{3,4}$/,  // American Airlines  
            /^DL\d{3,4}$/,  // Delta
            /^WN\d{3,4}$/,  // Southwest
            /^B6\d{3,4}$/,  // JetBlue
            /^NK\d{3,4}$/,  // Spirit
            /^F9\d{3,4}$/   // Frontier
        ];
        
        const isCommonPattern = commonPatterns.some(pattern => pattern.test(flightNumber));
        console.log(`🔍 Flight "${flightNumber}" matches common airline pattern: ${isCommonPattern}`);
        
        return isCommonPattern;
    }
    
    /**
     * Log correction attempts for metrics and debugging
     */
    logCorrectionAttempt(command, method) {
        try {
            // Initialize metrics storage
            if (!window.correctionMetrics) {
                window.correctionMetrics = [];
            }
            
            const metrics = {
                timestamp: Date.now(),
                original: command,
                method: method,
                sessionId: this.conversationMemory?.sessionId || 'unknown'
            };
            
            window.correctionMetrics.push(metrics);
            
            // Keep only last 100 entries to prevent memory bloat
            if (window.correctionMetrics.length > 100) {
                window.correctionMetrics = window.correctionMetrics.slice(-100);
            }
            
            // Log summary every 20 attempts
            if (window.correctionMetrics.length % 20 === 0) {
                this.logCorrectionSummary();
            }
        } catch (error) {
            console.warn('Failed to log correction metrics:', error);
        }
    }
    
    /**
     * Log correction effectiveness summary
     */
    logCorrectionSummary() {
        try {
            const metrics = window.correctionMetrics || [];
            const recent = metrics.slice(-20);
            
            const methodCounts = recent.reduce((acc, m) => {
                acc[m.method] = (acc[m.method] || 0) + 1;
                return acc;
            }, {});
            
            console.log('📊 Correction Summary (last 20):', methodCounts);
        } catch (error) {
            console.warn('Failed to generate correction summary:', error);
        }
    }

    /* 
     * ========================================
     * FUZZY MATCHING IMPLEMENTATION (FUTURE USE)
     * ========================================
     * Fast, local correction for known entities like flight numbers
     * Use this as fallback when LLM is unavailable or for real-time correction
     * 
     * TO ENABLE: Uncomment these functions and call fuzzyCorrectTranscript()
     * before sending to LLM in improveTranscriptionWithOpenAI()
     */

    /*
    async fuzzyCorrectTranscript(transcript) {
        console.log('🔍 Attempting fuzzy correction for:', transcript);
        
        try {
            // Get known flight numbers from backend (cached)
            const knownEntities = await this.getKnownEntities();
            
            // Apply fuzzy matching corrections
            let corrected = transcript;
            corrected = this.fuzzyMatchFlightNumbers(corrected, knownEntities.flights);
            corrected = this.fuzzyMatchGates(corrected, knownEntities.gates);
            corrected = this.fuzzyMatchEquipment(corrected, knownEntities.equipment);
            
            if (corrected !== transcript) {
                console.log(`🎯 Fuzzy correction: "${transcript}" → "${corrected}"`);
                this.logCorrectionAttempt(transcript, 'fuzzy-local');
            }
            
            return corrected;
        } catch (error) {
            console.warn('Fuzzy correction failed:', error);
            return transcript;
        }
    }

    async getKnownEntities() {
        // Cache known entities for 5 minutes to avoid excessive API calls
        const cacheKey = 'knownEntities';
        const cacheDuration = 5 * 60 * 1000; // 5 minutes
        
        if (this._entityCache && (Date.now() - this._entityCache.timestamp) < cacheDuration) {
            return this._entityCache.data;
        }
        
        try {
            // Fetch known entities from backend APIs
            const [flights, equipment] = await Promise.all([
                fetch('/api/flights/status').then(r => r.json()),
                fetch('/api/equipment/status').then(r => r.json())
            ]);
            
            const entities = {
                flights: flights.flights?.map(f => f.flight_number).filter(Boolean) || [],
                gates: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'], // Could fetch from API
                equipment: equipment.equipment?.map(e => e.equipment_id).filter(Boolean) || []
            };
            
            // Cache the results
            this._entityCache = {
                data: entities,
                timestamp: Date.now()
            };
            
            console.log('📋 Cached known entities:', entities);
            return entities;
        } catch (error) {
            console.warn('Failed to fetch known entities:', error);
            return { flights: [], gates: [], equipment: [] };
        }
    }

    fuzzyMatchFlightNumbers(transcript, knownFlights) {
        let corrected = transcript;
        
        // Handle common flight number mishearings with high confidence
        const flightPatterns = [
            { pattern: /\byou'?re?\s+in\s+(\d{3,4})\b/gi, replacement: 'UA$1' },
            { pattern: /\byou\s+are\s+in\s+(\d{3,4})\b/gi, replacement: 'UA$1' },
            { pattern: /\byou\s+a\s+(\d{3,4})\b/gi, replacement: 'UA$1' },
            { pattern: /\byou\s+away\s+(\d{3,4})\b/gi, replacement: 'UA$1' }
        ];
        
        for (const {pattern, replacement} of flightPatterns) {
            corrected = corrected.replace(pattern, (match, number) => {
                const candidate = replacement.replace('$1', number);
                if (knownFlights.includes(candidate)) {
                    console.log(`✅ Fuzzy flight match: "${match}" → "${candidate}"`);
                    return candidate;
                }
                return match; // Keep original if no exact match in database
            });
        }
        
        // Use Levenshtein distance for more sophisticated matching
        corrected = this.levenshteinFlightMatch(corrected, knownFlights);
        
        return corrected;
    }

    fuzzyMatchGates(transcript, knownGates) {
        let corrected = transcript;
        
        // Pattern: "gate a 1" → "gate A1"
        const gatePattern = /\bgate\s+([a-z])\s+(\d+)\b/gi;
        corrected = corrected.replace(gatePattern, (match, letter, number) => {
            const candidate = letter.toUpperCase() + number;
            if (knownGates.includes(candidate)) {
                console.log(`✅ Fuzzy gate match: "${match}" → "gate ${candidate}"`);
                return `gate ${candidate}`;
            }
            return match;
        });
        
        return corrected;
    }

    fuzzyMatchEquipment(transcript, knownEquipment) {
        // Handle equipment ID corrections
        // Can be expanded based on your equipment naming patterns
        return transcript;
    }

    levenshteinFlightMatch(transcript, knownFlights) {
        // Find potential flight number candidates in transcript
        const flightCandidates = transcript.match(/\b[A-Za-z]{1,3}\s*\d{3,4}\b/g) || [];
        
        let corrected = transcript;
        
        for (const candidate of flightCandidates) {
            const cleanCandidate = candidate.replace(/\s+/g, '').toUpperCase();
            
            // Skip if already looks correct
            if (knownFlights.includes(cleanCandidate)) continue;
            
            // Find best match using Levenshtein distance
            let bestMatch = null;
            let bestDistance = Infinity;
            
            for (const knownFlight of knownFlights) {
                const distance = this.levenshteinDistance(cleanCandidate, knownFlight);
                if (distance < bestDistance && distance <= 2) { // Allow up to 2 character differences
                    bestDistance = distance;
                    bestMatch = knownFlight;
                }
            }
            
            if (bestMatch && bestDistance <= 2) {
                corrected = corrected.replace(candidate, bestMatch);
                console.log(`🎯 Levenshtein match: "${candidate}" → "${bestMatch}" (distance: ${bestDistance})`);
            }
        }
        
        return corrected;
    }

    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill(null).map(() => 
            Array(str1.length + 1).fill(null));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1, // deletion
                    matrix[j - 1][i] + 1, // insertion
                    matrix[j - 1][i - 1] + substitutionCost // substitution
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    */
    
    // Get current configuration and status
    getStatus() {
        return {
            isListening: this.isListening,
            isProcessing: this.isProcessing,
            currentLanguage: this.languageManager ? this.languageManager.getCurrentLanguage() : 'en',
            currentUser: this.currentUser,
            wakeWordDetected: this.wakeWordDetected,
            config: this.config
        };
    }
    
    getPerformanceMetrics() {
        const metrics = {};
        
        if (this.enhancedWakeWordDetector) {
            metrics.wakeWord = this.enhancedWakeWordDetector.getPerformanceMetrics();
        }
        
        if (this.languageManager) {
            metrics.language = {
                currentLanguage: this.languageManager.getCurrentLanguage(),
                supportedLanguages: Object.keys(this.languageManager.supportedLanguages)
            };
        }
        
        return metrics;
    }
    
    // Test method for manual queries
    async testQuery(query) {
        try {
            const response = await this.sendToBackend(query);
            if (response && response.response) {
                this.speak(response.response);
                return response;
            }
        } catch (error) {
            console.error('Test query error:', error);
            throw error;
        }
    }

    /**
     * Test microphone access
     */
    async testMicrophone() {
        try {
            console.log('Testing microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('✅ Microphone access granted');
            
            // Stop the stream after testing
            stream.getTracks().forEach(track => track.stop());
            
            this.showStatus('Microphone access granted! You can now use voice commands.', 'success');
            return true;
        } catch (error) {
            console.error('❌ Microphone test failed:', error);
            
            let errorMessage = 'Microphone access failed: ';
            switch (error.name) {
                case 'NotAllowedError':
                    errorMessage += 'Permission denied. Please allow microphone access.';
                    break;
                case 'NotFoundError':
                    errorMessage += 'No microphone found.';
                    break;
                case 'NotReadableError':
                    errorMessage += 'Microphone is being used by another application.';
                    break;
                default:
                    errorMessage += error.message;
            }
            
            this.showError(errorMessage);
            return false;
        }
    }

    /**
     * Show status message to user
     */
    showStatus(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Create or update status display
        let statusDiv = document.getElementById('voice-status');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'voice-status';
            statusDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 300px;
                padding: 10px;
                border-radius: 5px;
                z-index: 1000;
                font-family: Arial, sans-serif;
                font-size: 14px;
            `;
            document.body.appendChild(statusDiv);
        }
        
        // Set color based on type
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            warning: '#fff3cd',
            info: '#d1ecf1'
        };
        
        statusDiv.style.backgroundColor = colors[type] || colors.info;
        statusDiv.textContent = message;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 5000);
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showStatus(message, 'error');
    }

    /**
     * Show when system is ready to listen again
     */
    showReadyStatus() {
        const now = Date.now();
        const timeSinceLastWakeWord = now - this.lastWakeWordTime;
        
        if (timeSinceLastWakeWord >= this.globalCooldown && !this.isProcessing && !this.wakeWordDetected) {
            this.showStatus('🟢 Ready! Say "Jarvis" to activate.', 'info');
        }
    }

    /**
     * Update UI state indicators
     */
    updateUIState() {
        // Update visual indicators based on current state
        const statusIndicator = document.querySelector('.voice-status-indicator');
        if (statusIndicator) {
            if (this.isListening && !this.wakeWordDetected) {
                statusIndicator.textContent = '🟢 Listening for "Jarvis"...';
                statusIndicator.className = 'voice-status-indicator listening';
            } else if (this.wakeWordDetected && !this.isProcessing) {
                statusIndicator.textContent = '🎤 Say your command...';
                statusIndicator.className = 'voice-status-indicator wake-detected';
            } else if (this.isProcessing) {
                statusIndicator.textContent = '⏳ Processing...';
                statusIndicator.className = 'voice-status-indicator processing';
            } else if (this.isSpeaking) {
                statusIndicator.textContent = '🔊 Speaking...';
                statusIndicator.className = 'voice-status-indicator speaking';
            } else {
                statusIndicator.textContent = '⭕ Ready';
                statusIndicator.className = 'voice-status-indicator ready';
            }
        }

        // Update button states
        const startBtn = document.getElementById('startVoiceBtn');
        const stopBtn = document.getElementById('stopVoiceBtn');
        
        if (startBtn && stopBtn) {
            if (this.isListening) {
                startBtn.style.display = 'none';
                stopBtn.style.display = 'inline-block';
            } else {
                startBtn.style.display = 'inline-block';
                stopBtn.style.display = 'none';
            }
        }
    }
} 