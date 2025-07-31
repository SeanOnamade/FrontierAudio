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
        
        // Hybrid Speech Recognition features
        this.audioEnvironmentDetector = null;
        this.speechRecognitionProvider = 'webspeech'; // Current provider: 'webspeech' | 'whisper'
        this.hybridModeEnabled = true; // Enable/disable hybrid functionality
        this.enhancedWebSpeech = null; // Enhanced Web Speech API instance
        this.whisperClient = null; // Whisper API Client instance
        
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
        
        // Initialize audio environment detector for hybrid speech recognition
        if (this.hybridModeEnabled && typeof AudioEnvironmentDetector !== 'undefined') {
            try {
                console.log('Initializing AudioEnvironmentDetector for hybrid speech...');
                this.audioEnvironmentDetector = new AudioEnvironmentDetector();
                
                // Set up callbacks for environmental monitoring
                this.audioEnvironmentDetector.onNoiseUpdate = (noiseLevel, characterization) => {
                    this.handleNoiseUpdate(noiseLevel, characterization);
                };
                
                this.audioEnvironmentDetector.onQualityUpdate = (quality) => {
                    this.handleQualityUpdate(quality);
                };
                
                this.audioEnvironmentDetector.onRoutingDecision = (decision) => {
                    this.handleRoutingDecision(decision);
                };
                
                console.log('✅ AudioEnvironmentDetector initialized for hybrid speech recognition');
            } catch (error) {
                console.warn('❌ Failed to initialize AudioEnvironmentDetector:', error);
                this.hybridModeEnabled = false; // Fallback to basic mode
            }
        } else {
            console.log('Hybrid speech recognition disabled or AudioEnvironmentDetector not available');
        }
        
        // Initialize Enhanced Web Speech API
        if (this.hybridModeEnabled && typeof EnhancedWebSpeechAPI !== 'undefined') {
            try {
                console.log('Initializing Enhanced Web Speech API...');
                this.enhancedWebSpeech = new EnhancedWebSpeechAPI({
                    continuous: this.config.continuous,
                    interimResults: this.config.interimResults,
                    language: this.config.language,
                    enableConfidenceNormalization: true,
                    enableErrorRecovery: true,
                    enableAviationOptimization: true,
                    maxRetries: 3
                });
                
                // Set up callbacks for enhanced speech recognition
                this.enhancedWebSpeech.onResult = (results) => {
                    this.handleEnhancedSpeechResult(results);
                };
                
                this.enhancedWebSpeech.onError = (error) => {
                    this.handleEnhancedSpeechError(error);
                };
                
                this.enhancedWebSpeech.onStart = () => {
                    this.handleEnhancedSpeechStart();
                };
                
                this.enhancedWebSpeech.onEnd = () => {
                    this.handleEnhancedSpeechEnd();
                };
                
                this.enhancedWebSpeech.onConfidenceUpdate = (confidence) => {
                    this.handleConfidenceUpdate(confidence);
                };
                
                this.enhancedWebSpeech.onPerformanceUpdate = (metrics) => {
                    this.handlePerformanceUpdate(metrics);
                };
                
                console.log('✅ Enhanced Web Speech API initialized');
            } catch (error) {
                console.warn('❌ Failed to initialize Enhanced Web Speech API:', error);
                this.enhancedWebSpeech = null; // Fallback to basic Web Speech API
            }
        } else {
            console.log('Enhanced Web Speech API disabled or not available');
        }
        
        // Initialize Whisper API Client
        if (this.hybridModeEnabled && typeof WhisperAPIClient !== 'undefined') {
            try {
                console.log('Initializing Whisper API Client...');
                this.whisperClient = new WhisperAPIClient({
                    // Try to use existing OpenAI API key from environment/config
                    apiKey: this.getOpenAIAPIKey(),
                    timeout: 10000, // 10 second timeout for Whisper
                    maxRetries: 2,
                    language: 'en',
                    responseFormat: 'verbose_json',
                    
                    // Cost limits (conservative defaults)
                    costLimits: {
                        dailyCostLimit: 5.0, // $5 per day
                        monthlyCostLimit: 50.0, // $50 per month
                        requestCostLimit: 0.50 // $0.50 per request
                    },
                    
                    // Rate limits
                    rateLimits: {
                        requestsPerMinute: 20,
                        requestsPerHour: 300,
                        concurrentRequests: 2
                    },
                    
                    // Segmentation configuration
                    segmentationConfig: {
                        maxSegmentDuration: 25, // 25 seconds (under Whisper's 30s limit)
                        enableVAD: true,
                        vadThreshold: 0.01
                    }
                });
                
                // Set up Whisper callbacks
                this.whisperClient.onResult = (result) => {
                    this.handleWhisperResult(result);
                };
                
                this.whisperClient.onError = (error) => {
                    this.handleWhisperError(error);
                };
                
                this.whisperClient.onCostUpdate = (costs) => {
                    this.handleWhisperCostUpdate(costs);
                };
                
                this.whisperClient.onRateLimitWarning = (warning) => {
                    this.handleWhisperRateLimitWarning(warning);
                };
                
                this.whisperClient.onProgress = (progress) => {
                    this.handleWhisperProgress(progress);
                };
                
                console.log('✅ Whisper API Client initialized (API key required for use)');
            } catch (error) {
                console.warn('❌ Failed to initialize Whisper API Client:', error);
                this.whisperClient = null; // Fallback to Web Speech only
            }
        } else {
            console.log('Whisper API Client disabled or not available');
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
                
                // Update modern UI if available
                if (window.modernJarvis) {
                    window.modernJarvis.updateBubbleState('active');
                    window.modernJarvis.updateStatus('Wake word detected!', 'Listening for your command...');
                }
                
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
            
            // Process command immediately if final and has content (but not just wake words)
            if (isFinal && transcript.length > 0) {
                // 🚫 FILTER: Don't process if it's just the wake word
                const isJustWakeWord = this.isOnlyWakeWord(transcript);
                if (isJustWakeWord) {
                    console.log('🎤 Ignoring final transcript - just wake word:', transcript);
                    return;
                }
                
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
        

        // Handle common speech recognition errors for wake words first
        normalized = normalized.replace(/\bh jarvis\b/gi, 'hey jarvis');
        normalized = normalized.replace(/\bhi jarvis\b/gi, 'hey jarvis'); 
        normalized = normalized.replace(/\bhey jervis\b/gi, 'hey jarvis');
        
        // Remove wake words from the beginning of the command
        normalized = normalized.replace(/^.*?\b(jarvis|hey jarvis)\s*/i, '');
        normalized = normalized.trim();
        
        // If the command is empty after wake word removal, skip processing
        if (!normalized || normalized.length < 2) {
            console.log('🚫 Command empty after wake word removal');
            return '';
        }
        
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
        
        // Fix "assigned" speech recognition issues
        normalized = normalized.replace(/\ba\s+sign\s+to\b/gi, 'assigned to');  // "a sign to" -> "assigned to"
        normalized = normalized.replace(/\bis\s+a\s+sign\s+to\b/gi, 'is assigned to');  // "is a sign to" -> "is assigned to"
        normalized = normalized.replace(/\bassigned\s+to\s+fly\s+to\b/gi, 'assigned to');  // "assigned to fly to" -> "assigned to"
        
        // Fix equipment terminology
        normalized = normalized.replace(/\bpushback\s+transfer\b/gi, 'pushback tractor');  // "pushback transfer" -> "pushback tractor"
        normalized = normalized.replace(/\bpush\s+back\s+track\s*door?\b/gi, 'pushback tractor');  // "push back track door" -> "pushback tractor"
        
        // Fix "what's" -> "what"
        normalized = normalized.replace(/\bwhat's\b/gi, 'what');  // "what's" -> "what"
        
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
        
        // If command is empty after normalization, reset and return
        if (!command || command.trim().length === 0) {
            console.log('🚫 Command empty after normalization - resetting state');
            this.resetProcessingState();
            return;
        }
        
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
            
            // Skip smart processing for person name queries (bypass for assignments)
            if (/\b[a-z]+ [a-z]+('s)?\b/i.test(command)) {
                console.log('🚀 Bypassing smart processor for person name query');
                queryAnalysis = { needsClarification: false };
            } else if (this.smartQueryProcessor) {
                console.log('🧠 Smart query processor analyzing:', command);
                queryAnalysis = await this.smartQueryProcessor.processQuery(
                    command, 
                    this.conversationMemory ? this.conversationMemory.getContextForQuery(command) : null
                );
                console.log('🧠 Query analysis result:', queryAnalysis);
                
                // Check if clarification is needed
                if (queryAnalysis && queryAnalysis.needsClarification) {
                    console.log('❓ Clarification needed:', queryAnalysis.ambiguities);
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
           
            // Don't restart here - wait for TTS completion to avoid conflicts

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
            
            // Update modern UI if available
            if (window.modernJarvis) {
                window.modernJarvis.updateBubbleState('speaking');
                window.modernJarvis.updateStatus('Speaking...', 'Listening to response');
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
            
            // Force a clean restart after synthesis is complete
            setTimeout(() => {
                if (!this.isProcessing && !this.processingLock && !this.synthesisLock) {
                    console.log('🔄 Force restarting speech recognition after synthesis completed');
                    
                    // Force reset Enhanced Web Speech API state first
                    if (this.enhancedWebSpeech) {
                        this.enhancedWebSpeech.reset();
                    }
                    
                    // Force stop all recognition
                    this.stopListening();
                    
                    // Reset all state variables
                    this.isListening = false;
                    this.lastTranscript = '';
                    this.wakeWordDetected = false;
                    this.resetProcessingState();
                    
                    // Clear any timeouts
                    if (this.commandTimeout) {
                        clearTimeout(this.commandTimeout);
                        this.commandTimeout = null;
                    }
                    
                    // Start fresh with longer delay
                    setTimeout(() => {
                        console.log('🚀 Starting fresh recognition');
                        try {
                            this.startListening();
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                        }
                    }, 250);
                }
            }, 750);
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
            /\b[a-z]{1,3}\s+too\s+\d{3,4}\b/i,     // "UA too 2406" → "UA2406"
            /\ba\s+sign\s+to\b/i,                   // "a sign to" → "assigned to"  
            /\bis\s+a\s+sign\s+to\b/i,              // "is a sign to" → "is assigned to"
            /\bassigned\s+to\s+fly\s+to\b/i,        // "assigned to fly to" → "assigned to"
            /\bpushback\s+transfer\b/i,             // "pushback transfer" → "pushback tractor"
            /\bpush\s+back\s+track/i,               // "push back track" → "pushback tractor"
            /\bwhat's\s+pushback/i                  // "what's pushback" → "what pushback"
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
    }
    
    /**
     * Check if transcript contains only wake words
     */
    isOnlyWakeWord(transcript) {
        const cleanTranscript = transcript.toLowerCase().trim();
        const wakeWordPatterns = [
            /^(hey\s+)?jarvis$/,
            /^(hi\s+)?jarvis$/,
            /^(hello\s+)?jarvis$/,
            /^hey$/,
            /^jarvis$/
        ];
        
        return wakeWordPatterns.some(pattern => pattern.test(cleanTranscript));
        
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
  
    /**
     * Hybrid Speech Recognition Callback Handlers
     */
    
    /**
     * Handle noise level updates from AudioEnvironmentDetector
     * @param {number} noiseLevel - Current noise level in dB FS
     * @param {string} characterization - Human-readable noise level
     */
    handleNoiseUpdate(noiseLevel, characterization) {
        // Reduce logging frequency to prevent console spam
        if (!this.lastNoiseLogTime) this.lastNoiseLogTime = 0;
        const now = Date.now();
        
        // Only log noise updates every 5 seconds or when noise level changes significantly
        if (now - this.lastNoiseLogTime > 5000 || 
            !this.lastCharacterization || 
            this.lastCharacterization !== characterization) {
            console.log(`🔊 Noise Update: ${noiseLevel.toFixed(1)} dB FS (${characterization})`);
            this.lastNoiseLogTime = now;
            this.lastCharacterization = characterization;
        }
        
        // Optionally update status indicator with noise info
        if (this.onStatusChange && characterization === 'very_loud') {
            this.onStatusChange(`High noise environment detected (${noiseLevel.toFixed(1)} dB)`);
        }
    }
    
    /**
     * Handle speech quality updates from AudioEnvironmentDetector
     * @param {Object} quality - Quality assessment object
     */
    handleQualityUpdate(quality) {
        console.log(`🎯 Speech Quality: ${quality.score.toFixed(2)} (${quality.recommendation})`);
        
        // Store quality info for routing decisions
        this.lastQualityScore = quality.score;
        this.lastQualityRecommendation = quality.recommendation;
    }
    
    /**
     * Handle routing decisions from AudioEnvironmentDetector
     * @param {Object} decision - Routing decision object
     */
    handleRoutingDecision(decision) {
        const oldProvider = this.speechRecognitionProvider;
        this.speechRecognitionProvider = decision.provider;
        
        console.log(`🔄 Speech Provider: ${decision.provider} (confidence: ${decision.confidence.toFixed(2)}, reason: ${decision.reason})`);
        
        // Log provider switches
        if (oldProvider !== decision.provider) {
            console.log(`🔀 Provider switched: ${oldProvider} → ${decision.provider}`);
            
            // Optionally notify user of provider switch in high-visibility scenarios
            if (decision.reason === 'high_noise' || decision.reason === 'low_quality') {
                if (this.onStatusChange) {
                    this.onStatusChange(`Switching to ${decision.provider === 'whisper' ? 'enhanced' : 'standard'} recognition`);
                }
            }
        }
    }
    
    /**
     * Get current environmental status for hybrid speech system
     * @returns {Object|null} Environmental status or null if not available
     */
    getEnvironmentalStatus() {
        if (!this.audioEnvironmentDetector) return null;
        
        return this.audioEnvironmentDetector.getEnvironmentalStatus();
    }
    
    /**
     * Get current speech recognition provider recommendation
     * @param {Object} options - Optional parameters for routing decision
     * @returns {Object|null} Routing recommendation or null if not available
     */
    getProviderRecommendation(options = {}) {
        if (!this.audioEnvironmentDetector) {
            return { provider: 'webspeech', confidence: 0.5, reason: 'no_detector' };
        }
        
        return this.audioEnvironmentDetector.getRoutingRecommendation(options);
    }
    
    /**
     * Force a specific speech recognition provider
     * @param {string} provider - 'webspeech' or 'whisper'
     */
    setForcedProvider(provider) {
        if (!['webspeech', 'whisper'].includes(provider)) {
            console.warn(`Invalid provider: ${provider}. Must be 'webspeech' or 'whisper'`);
            return;
        }
        
        this.speechRecognitionProvider = provider;
        console.log(`🔧 Forced speech provider: ${provider}`);
        
        if (this.onStatusChange) {
            this.onStatusChange(`Speech recognition mode: ${provider === 'whisper' ? 'Enhanced (Whisper)' : 'Standard (Web Speech)'}`);
        }
    }
    
    /**
     * Enable or disable hybrid speech recognition
     * @param {boolean} enabled - Whether to enable hybrid mode
     */
    setHybridMode(enabled) {
        this.hybridModeEnabled = enabled;
        console.log(`🔧 Hybrid speech recognition: ${enabled ? 'enabled' : 'disabled'}`);
        
        if (!enabled && this.audioEnvironmentDetector) {
            this.audioEnvironmentDetector.dispose();
            this.audioEnvironmentDetector = null;
            this.speechRecognitionProvider = 'webspeech'; // Fallback to default
        } else if (enabled && !this.audioEnvironmentDetector && typeof AudioEnvironmentDetector !== 'undefined') {
            // Re-initialize if needed
            this.init();
        }
    }
    
    /**
     * Enhanced Web Speech API Callback Handlers
     */
    
    /**
     * Handle enhanced speech recognition results
     * @param {Array} results - Enhanced results with confidence scores
     */
    handleEnhancedSpeechResult(results) {
        if (!results || results.length === 0) return;
        
        // Get the best result (sorted by confidence)
        const bestResult = results[0];
        
        console.log(`🎤 Enhanced Speech Result: "${bestResult.transcript}" (confidence: ${bestResult.confidence.toFixed(2)})`);
        
        // Use the enhanced result in the same way as regular speech results
        // Create a mock event to maintain compatibility with existing code
        const mockEvent = {
            results: [{
                isFinal: bestResult.isFinal,
                length: 1,
                0: {
                    transcript: bestResult.transcript,
                    confidence: bestResult.confidence
                }
            }]
        };
        
        // Route to existing speech result handler
        this.handleSpeechResult(mockEvent);
        
        // Store enhanced metadata for potential use
        this.lastEnhancedResult = {
            ...bestResult,
            allAlternatives: results
        };
    }
    
    /**
     * Handle enhanced speech recognition errors
     * @param {Object} error - Enhanced error object
     */
    handleEnhancedSpeechError(error) {
        console.error(`🚨 Enhanced Speech Error: ${error.type} - ${error.message}`);
        
        // If enhanced speech fails, fall back to basic recognition
        if (!error.recoverable) {
            console.warn('🔄 Falling back to basic Web Speech API due to unrecoverable error');
            this.speechRecognitionProvider = 'webspeech';
            
            // Restart with basic recognition
            if (this.recognition && !this.isListening) {
                setTimeout(() => this.startListening(), 1000);
            }
        }
        
        // Trigger existing error callback if set
        if (this.onError) {
            this.onError(error.message);
        }
    }
    
    /**
     * Handle enhanced speech recognition start
     */
    handleEnhancedSpeechStart() {
        this.isListening = true;
        console.log('🎤 Enhanced speech recognition started');
        
        if (this.onStatusChange) {
            this.onStatusChange('Enhanced speech recognition active...');
        }
        
        if (this.onListeningChange) {
            this.onListeningChange(true);
        }
    }
    
    /**
     * Handle enhanced speech recognition end
     */
    handleEnhancedSpeechEnd() {
        this.isListening = false;
        console.log('🎤 Enhanced speech recognition ended');
        
        if (this.onListeningChange) {
            this.onListeningChange(false);
        }
        
        // Auto-restart if needed (following same logic as basic recognition)
        if (!this.isProcessing && !this.processingLock && !this.wakeWordDetected) {
            setTimeout(() => {
                if (!this.isProcessing && !this.processingLock && !this.isListening && !this.wakeWordDetected) {
                    console.log('🔄 Restarting enhanced speech recognition...');
                    this.startListening();
                }
            }, 2000);
        }
    }
    
    /**
     * Handle confidence updates from enhanced speech
     * @param {number} confidence - Current confidence score
     */
    handleConfidenceUpdate(confidence) {
        console.log(`📊 Confidence Update: ${confidence.toFixed(3)}`);
        
        // Store confidence for routing decisions
        this.lastConfidenceScore = confidence;
        
        // Optionally update UI with confidence indicator
        const confidenceEl = document.querySelector('.confidence-indicator');
        if (confidenceEl) {
            confidenceEl.textContent = `${(confidence * 100).toFixed(0)}%`;
            confidenceEl.className = `confidence-indicator ${confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'}`;
        }
    }
    
    /**
     * Handle performance updates from enhanced speech
     * @param {Object} metrics - Performance metrics
     */
    handlePerformanceUpdate(metrics) {
        console.log(`📈 Performance Update: Latency ${metrics.latency}ms, Success Rate ${(metrics.successRate * 100).toFixed(1)}%`);
        
        // Store metrics for analysis
        this.lastPerformanceMetrics = metrics;
        
        // Optionally adjust routing based on performance
        if (metrics.averageLatency > 3000) { // > 3 seconds
            console.warn('⚠️ High latency detected, may need to optimize or switch providers');
        }
        
        if (metrics.successRate < 0.8) { // < 80% success rate
            console.warn('⚠️ Low success rate detected, may need to adjust configuration');
        }
    }
    
    /**
     * Override startListening to use enhanced speech when appropriate
     */
    startListening() {
        // Use enhanced speech if available and provider is 'webspeech'
        if (this.speechRecognitionProvider === 'webspeech' && this.enhancedWebSpeech) {
            console.log('🚀 Starting enhanced Web Speech API recognition');
            try {
                this.enhancedWebSpeech.start();
                return;
            } catch (error) {
                console.warn('Enhanced speech failed to start, falling back to basic:', error);
                // Fall through to basic recognition
            }
        }
        
        // Fallback to basic Web Speech API
        if (!this.isInitialized) {
            throw new Error('Voice Assistant not initialized');
        }
        
        if (this.isListening) {
            console.warn('Speech recognition already running - ignoring duplicate start request');
            return;
        }
        
        if (this.isProcessing || this.processingLock || this.synthesisLock || this.isSpeaking) {
            console.warn('Cannot start listening - system is busy (processing, synthesis, or speaking)');
            return;
        }
        
        try {
            this.recognition.start();
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            if (this.onError) {
                this.onError(`Failed to start speech recognition: ${error.message}`);
            }
        }
    }
    
    /**
     * Override stopListening to handle both enhanced and basic speech
     */
    stopListening() {
        console.log('🛑 Stopping speech recognition and clearing state');
        
        if (this.enhancedWebSpeech && this.enhancedWebSpeech.getStatus().isListening) {
            this.enhancedWebSpeech.stop();
        }
        
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        
        // Clear any command timeouts to prevent interference
        if (this.commandTimeout) {
            clearTimeout(this.commandTimeout);
            this.commandTimeout = null;
        }
        
        this.isListening = false;
        console.log('🛑 Speech recognition stopped and state cleared');
    }
    
    /**
     * Centralized state reset to prevent conflicts
     */
    resetProcessingState() {
        console.log('🔄 Resetting all processing state');
        this.isProcessing = false;
        this.processingLock = false;
        this.wakeWordDetected = false;
        this.isSpeaking = false;
        this.synthesisLock = false;
        this.lastTranscript = '';
        
        // Clear any pending timeouts
        if (this.commandTimeout) {
            clearTimeout(this.commandTimeout);
            this.commandTimeout = null;
        }
        
        // Restart listening after a brief delay to ensure clean state
        setTimeout(() => {
            if (!this.isListening && !this.isProcessing && !this.processingLock) {
                console.log('🔄 Restarting listening after state reset');
                this.startListening();
            }
        }, 250);
    }
    
    /**
     * Get enhanced performance metrics if available
     * @returns {Object} Combined performance metrics
     */
    getEnhancedPerformanceMetrics() {
        const baseMetrics = this.getPerformanceMetrics();
        
        if (this.enhancedWebSpeech) {
            const enhancedMetrics = this.enhancedWebSpeech.getPerformanceMetrics();
            return {
                ...baseMetrics,
                enhanced: enhancedMetrics,
                provider: this.speechRecognitionProvider,
                lastConfidence: this.lastConfidenceScore,
                lastPerformance: this.lastPerformanceMetrics
            };
        }
        
        return {
            ...baseMetrics,
            provider: this.speechRecognitionProvider,
            enhanced: null
        };
    }
    
    /**
     * Whisper API Client Callback Handlers
     */
    
    /**
     * Handle Whisper transcription results
     * @param {Object} result - Whisper transcription result
     */
    handleWhisperResult(result) {
        console.log(`🤖 Whisper Result: "${result.text}" (confidence: ${result.confidence.toFixed(2)})`);
        
        // Create a mock speech recognition event to maintain compatibility
        const mockEvent = {
            results: [{
                isFinal: true, // Whisper results are always final
                length: 1,
                0: {
                    transcript: result.text,
                    confidence: result.confidence
                }
            }]
        };
        
        // Route to existing speech result handler
        this.handleSpeechResult(mockEvent);
        
        // Store Whisper-specific metadata
        this.lastWhisperResult = {
            ...result,
            provider: 'whisper',
            timestamp: Date.now()
        };
    }
    
    /**
     * Handle Whisper API errors
     * @param {Object} error - Whisper error object
     */
    handleWhisperError(error) {
        console.error(`🚨 Whisper Error: ${error.error} (type: ${error.type})`);
        
        // If Whisper fails, fallback to enhanced Web Speech
        if (!error.recoverable || error.type === 'cost_limit' || error.type === 'rate_limit') {
            console.warn('🔄 Falling back to Enhanced Web Speech API due to Whisper failure');
            this.speechRecognitionProvider = 'webspeech';
            
            // Auto-restart with Web Speech if we were actively listening
            if (this.isListening) {
                setTimeout(() => {
                    if (!this.isListening && this.enhancedWebSpeech) {
                        console.log('🔄 Restarting with Enhanced Web Speech...');
                        this.startListening();
                    }
                }, 1000);
            }
        }
        
        // Trigger error callback
        if (this.onError) {
            this.onError(`Whisper: ${error.error}`);
        }
    }
    
    /**
     * Handle Whisper cost updates
     * @param {Object} costs - Current cost information
     */
    handleWhisperCostUpdate(costs) {
        console.log(`💰 Whisper Costs: Daily $${costs.daily.toFixed(3)}, Monthly $${costs.monthly.toFixed(2)}, Total $${costs.total.toFixed(2)}`);
        
        // Store cost info for UI display
        this.lastWhisperCosts = costs;
        
        // Warn if approaching limits
        if (costs.daily / 5.0 > 0.8) { // 80% of daily limit
            console.warn('⚠️ Approaching daily cost limit for Whisper API');
            
            if (this.onStatusChange) {
                this.onStatusChange(`Whisper usage: ${(costs.daily / 5.0 * 100).toFixed(0)}% of daily limit`);
            }
        }
    }
    
    /**
     * Handle Whisper rate limit warnings
     * @param {Object} warning - Rate limit warning
     */
    handleWhisperRateLimitWarning(warning) {
        console.warn(`⚠️ Whisper Rate Limit Warning: ${warning.message}`);
        
        // Switch to Web Speech API temporarily
        const originalProvider = this.speechRecognitionProvider;
        this.speechRecognitionProvider = 'webspeech';
        
        if (this.onStatusChange) {
            this.onStatusChange('Rate limit reached, using Web Speech API');
        }
        
        // Switch back after delay
        setTimeout(() => {
            this.speechRecognitionProvider = originalProvider;
            if (this.onStatusChange) {
                this.onStatusChange('Whisper API available again');
            }
        }, 60000); // Wait 1 minute
    }
    
    /**
     * Handle Whisper processing progress
     * @param {Object} progress - Progress information
     */
    handleWhisperProgress(progress) {
        const percentage = (progress.progress * 100).toFixed(0);
        console.log(`⏳ Whisper Progress: ${percentage}% (segment ${progress.segmentIndex + 1}/${progress.totalSegments})`);
        
        // Update status during long processing
        if (this.onStatusChange && progress.totalSegments > 1) {
            this.onStatusChange(`Processing audio... ${percentage}% complete`);
        }
    }
    
    /**
     * Enhanced startListening to route to appropriate provider
     */
    async startListeningWithHybridRouting() {
        if (!this.hybridModeEnabled) {
            // Fallback to standard listening
            return this.startListening();
        }
        
        // Get environmental routing recommendation
        const recommendation = this.getProviderRecommendation();
        this.speechRecognitionProvider = recommendation.provider;
        
        console.log(`🎯 Hybrid Routing: Using ${recommendation.provider} (reason: ${recommendation.reason}, confidence: ${recommendation.confidence.toFixed(2)})`);
        
        // Route to appropriate provider
        if (recommendation.provider === 'whisper' && this.whisperClient) {
            return await this.startWhisperListening();
        } else {
            return this.startListening(); // Enhanced Web Speech or fallback
        }
    }
    
    /**
     * Start Whisper-based speech recognition
     */
    async startWhisperListening() {
        if (!this.whisperClient) {
            throw new Error('Whisper client not available');
        }
        
        const status = this.whisperClient.getStatus();
        if (!status.hasAPIKey) {
            throw new Error('Whisper API key not configured');
        }
        
        try {
            console.log('🤖 Starting Whisper speech recognition...');
            
            // Start recording audio for Whisper processing
            this.isListening = true;
            
            if (this.onListeningChange) {
                this.onListeningChange(true);
            }
            
            if (this.onStatusChange) {
                this.onStatusChange('Recording for Whisper transcription...');
            }
            
            // Start audio recording
            await this.startAudioRecording();
            
        } catch (error) {
            console.error('Failed to start Whisper listening:', error);
            
            // Fallback to Web Speech API
            console.warn('🔄 Falling back to Web Speech API');
            this.speechRecognitionProvider = 'webspeech';
            return this.startListening();
        }
    }
    
    /**
     * Start audio recording for Whisper processing
     */
    async startAudioRecording() {
        try {
            // Get microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: false // Let Whisper handle noise
                }
            });
            
            // Set up MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                try {
                    await this.processRecordedAudio();
                } catch (error) {
                    console.error('Failed to process recorded audio:', error);
                    this.handleWhisperError({
                        error: error.message,
                        type: 'processing_error',
                        recoverable: true
                    });
                }
            };
            
            // Start recording
            this.mediaRecorder.start();
            
            // Auto-stop after reasonable time (to prevent excessive costs)
            this.recordingTimeout = setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    console.log('🛑 Auto-stopping Whisper recording after timeout');
                    this.stopWhisperListening();
                }
            }, 30000); // 30 seconds max
            
        } catch (error) {
            console.error('Failed to start audio recording:', error);
            throw error;
        }
    }
    
    /**
     * Stop Whisper listening and process audio
     */
    async stopWhisperListening() {
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
        
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
            
            // Stop microphone stream
            const stream = this.mediaRecorder.stream;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        }
        
        this.isListening = false;
        
        if (this.onListeningChange) {
            this.onListeningChange(false);
        }
    }
    
    /**
     * Process recorded audio with Whisper
     */
    async processRecordedAudio() {
        if (!this.audioChunks || this.audioChunks.length === 0) {
            console.warn('No audio data recorded for Whisper processing');
            return;
        }
        
        // Create audio blob
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        
        console.log(`🤖 Processing ${(audioBlob.size / 1024).toFixed(1)}KB audio with Whisper...`);
        
        if (this.onStatusChange) {
            this.onStatusChange('Processing with Whisper AI...');
        }
        
        try {
            // Send to Whisper for transcription
            await this.whisperClient.transcribe(audioBlob, {
                language: 'en',
                prompt: 'Airport operations, flight numbers, gates, equipment, staff names' // Context prompt
            });
            
        } catch (error) {
            console.error('Whisper transcription failed:', error);
            this.handleWhisperError({
                error: error.message,
                type: 'transcription_failed',
                recoverable: true
            });
        }
    }
    
    /**
     * Set Whisper API key
     * @param {string} apiKey - OpenAI API key for Whisper
     */
    setWhisperAPIKey(apiKey) {
        if (this.whisperClient) {
            this.whisperClient.setAPIKey(apiKey);
            
            // Store in localStorage for future use
            try {
                localStorage.setItem('openai_api_key', apiKey);
            } catch (error) {
                console.warn('Could not store API key in localStorage:', error);
            }
            
            console.log('🔑 Whisper API key configured and stored');
            
            if (this.onStatusChange) {
                this.onStatusChange('Whisper API key configured');
            }
        } else {
            console.warn('Whisper client not available');
        }
    }
    
    /**
     * Get Whisper status and metrics
     * @returns {Object|null} Whisper status or null if not available
     */
    getWhisperStatus() {
        if (!this.whisperClient) return null;
        
        return {
            ...this.whisperClient.getStatus(),
            performance: this.whisperClient.getPerformanceMetrics(),
            lastResult: this.lastWhisperResult,
            lastCosts: this.lastWhisperCosts
        };
    }
    
    /**
     * Override stopListening to handle both providers
     */
    stopListening() {
        // Stop Whisper recording if active
        if (this.speechRecognitionProvider === 'whisper' && this.mediaRecorder) {
            this.stopWhisperListening();
        }
        
        // Stop Enhanced Web Speech if active
        if (this.enhancedWebSpeech && this.enhancedWebSpeech.getStatus().isListening) {
            this.enhancedWebSpeech.stop();
        }
        
        // Stop basic Web Speech if active
        if (this.recognition && this.isListening) {
            this.recognition.stop();
        }
        
        this.isListening = false;
        console.log('🛑 All speech recognition stopped');
    }
    
    /**
     * Enhanced hybrid mode toggle
     */
    setHybridMode(enabled) {
        this.hybridModeEnabled = enabled;
        console.log(`🔧 Hybrid speech recognition: ${enabled ? 'enabled' : 'disabled'}`);
        
        if (!enabled) {
            // Dispose hybrid components
            if (this.audioEnvironmentDetector) {
                this.audioEnvironmentDetector.dispose();
                this.audioEnvironmentDetector = null;
            }
            
            if (this.enhancedWebSpeech) {
                this.enhancedWebSpeech.dispose();
                this.enhancedWebSpeech = null;
            }
            
            if (this.whisperClient) {
                this.whisperClient.dispose();
                this.whisperClient = null;
            }
            
            this.speechRecognitionProvider = 'webspeech'; // Fallback to basic
        } else if (enabled && !this.audioEnvironmentDetector) {
            // Re-initialize hybrid components
            this.init();
        }
    }
    
    /**
     * Get OpenAI API key from environment or config
     * @returns {string|null} API key or null if not found
     */
    getOpenAIAPIKey() {
        // Try multiple sources for the API key
        
        // 1. Environment variable (if available in browser context)
        if (typeof process !== 'undefined' && process.env && process.env.OPENAI_API_KEY) {
            return process.env.OPENAI_API_KEY;
        }
        
        // 2. Global config object (if set by backend)
        if (typeof window !== 'undefined' && window.OPENAI_API_KEY) {
            return window.OPENAI_API_KEY;
        }
        
        // 3. LocalStorage (if previously stored)
        try {
            const storedKey = localStorage.getItem('openai_api_key');
            if (storedKey) {
                return storedKey;
            }
        } catch (error) {
            // LocalStorage not available
        }
        
        // 4. Check if backend endpoint exists to get key
        // (In production, keys should never be exposed to frontend)
        console.log('🔑 No OpenAI API key found - Whisper will need manual configuration');
        return null;
    }
    
    /**
     * Get comprehensive hybrid system status
     * @returns {Object} Complete hybrid system status
     */
    getHybridSystemStatus() {
        return {
            enabled: this.hybridModeEnabled,
            currentProvider: this.speechRecognitionProvider,
            
            // Component status
            environment: this.getEnvironmentalStatus(),
            enhancedWebSpeech: this.enhancedWebSpeech ? this.enhancedWebSpeech.getStatus() : null,
            whisper: this.getWhisperStatus(),
            
            // Performance metrics
            performance: this.getEnhancedPerformanceMetrics(),
            
            // Recent results
            lastResults: {
                enhanced: this.lastEnhancedResult || null,
                whisper: this.lastWhisperResult || null,
                confidence: this.lastConfidenceScore || null,
                costs: this.lastWhisperCosts || null
            }
        };
    }
} 