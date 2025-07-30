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
     * Normalize and clean voice input for better processing
     */
    normalizeVoiceInput(transcript) {
        console.log('🔧 NORMALIZING VOICE INPUT 🔧');
        console.log('Original transcript:', transcript);
        
        let normalized = transcript.toLowerCase().trim();
        
        // Enhanced flight number normalization for better recognition
        normalized = normalized.replace(/\bu\s*a\s+to\s+(\d+)/gi, 'UA$1');  // "UA to 406" -> "UA406"
        normalized = normalized.replace(/\bu\s*a\s+too\s+(\d+)/gi, 'UA$1');  // "UA too 406" -> "UA406"
        normalized = normalized.replace(/\bu\s*a\s+(\d+)/gi, 'UA$1');  // "U A 406" -> "UA406"
        normalized = normalized.replace(/\bunited\s+airlines/gi, 'UA');
        
        // Clean up extra spaces
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        console.log('Normalized transcript:', normalized);
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
            setTimeout(() => this.performSpeech(text), 100);
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
            // Clear the speaking flag
            this.isSpeaking = false;
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
                if (!this.isListening && !this.isProcessing && !this.processingLock) {
                    console.log('🔄 Restarting speech recognition after synthesis completed');
                    this.startListening();
                }
            }, 500);
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            // Always clear speaking flag on error
            this.isSpeaking = false;
            if (this.onError) {
                this.onError(`Speech synthesis error: ${event.error}`);
            }
            
            // Restart speech recognition after error
            setTimeout(() => {
                if (!this.isListening && !this.isProcessing && !this.processingLock) {
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
     * Determine if we should use OpenAI Whisper for correction
     */
    shouldUseWhisperForCorrection(command) {
        // Use Whisper if:
        // 1. Command contains fragmented flight numbers
        // 2. Command has unusual spacing patterns
        // 3. Command contains common misheard aviation terms
        
        const hasFragmentedNumbers = /\b\w+\s+\d\s+\d\s+\d\s+\d\b/.test(command);
        const hasUnusualSpacing = /\b[A-Z]\s+[A-Z]\s+\d+\b/.test(command.toUpperCase());
        const hasMisheardTerms = Object.keys(this.aviationTerminology.termCorrections)
            .some(term => command.toLowerCase().includes(term));
        
        return hasFragmentedNumbers || hasUnusualSpacing || hasMisheardTerms;
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