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
        this.globalCooldown = 200; // Reduced from 500ms to 200ms for faster response
        this.microphoneTested = false; // Track if microphone has been tested
        this.heartbeatInterval = null; // Periodic check to ensure system stays responsive
        
        // Enhanced features
        this.languageManager = null;
        this.enhancedWakeWordDetector = null;
        this.voiceBiometrics = null;
        this.currentUser = null;
        this.stressDetectionEnabled = true;
        
        // Conversation & Context features
        this.conversationMemory = null;
        this.smartQueryProcessor = null;
        this.proactiveAssistant = null; // Disabled to prevent interference with voice recognition
        
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
            autoLanguageDetection: false,  // Disable auto language detection to stay in English
            // 🔥 Enhanced interruption settings
            interruptionEnabled: true,
            interruptionSensitivity: 'high', // 'low', 'medium', 'high'
            immediateInterruption: true, // Stop immediately on wake word
            continueListeningDuringSpeech: true, // Keep recognition active during speech
            maxInterruptionAttempts: 5, // How many times to try stopping speech
            interruptionCooldown: 100, // Milliseconds between interruption attempts
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
        
        // Voice synthesis settings
        this.voiceSettings = {
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            voice: null
        };
        
        // Timing and throttling
        this.lastTranscriptTime = 0;
        this.transcriptThrottle = 100; // Minimum time between transcript processing
        this.lastProcessTime = 0;
        this.processThrottle = 1000; // Minimum time between command processing
        
        // Callbacks
        this.onStatusChange = null;
        this.onListeningChange = null;
        this.onTranscriptReceived = null;
        this.onResponseReceived = null;
        this.onError = null;
        this.onLanguageDetected = null;
        this.onUserAuthenticated = null;
        this.onStressDetected = null;
        this.onQueryReceived = null;
        this.onInterruption = null; // New callback for interruption events
        
        // 🔥 ENHANCED INTERRUPTION FEATURES
        this.allowInterruption = true; // Always allow interruption by default
        this.currentUtterance = null; // Store current speech utterance for interruption
        this.interruptedDuringResponse = false; // Track if response was interrupted
        this.interruptionCheckInterval = null; // Periodic check for interruption during speech
        this.speechBlocked = false; // Global flag to block all speech synthesis
        this.speechEffectivelyStopped = false; // Track if speech is muted but still running
        this.interruptionAttempts = 0; // Count interruption attempts
        this.lastInterruptionTime = 0; // Track last interruption to prevent spam
        this.speechStartTime = 0; // Track when speech started
        this.activeInterruptionListening = false; // Special listening mode during speech
        
        this.init();
    }
    
    async init() {
        // Initialize conversation memory
        this.conversationMemory = new ConversationMemory();
        
        // Initialize smart query processor
        this.smartQueryProcessor = new SmartQueryProcessor();
        
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
                    this.onEnhancedSpeechStart();
                };
                
                this.enhancedWebSpeech.onEnd = () => {
                    this.onEnhancedSpeechEnd();
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
        
        // Mark as initialized
        this.isInitialized = true;
        console.log('✅ Voice Assistant fully initialized');
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
        
        // Debug: Show current mode
        console.log(`🔍 Transcript received: "${transcript}" | Mode: ${this.wakeWordDetected ? 'COMMAND_LISTENING' : 'WAKE_WORD_DETECTION'} | Final: ${isFinal}`);
        
        // 🔥 SIMPLE & RELIABLE: Normal wake word detection first
        if (!this.wakeWordDetected && !this.isProcessing && !this.processingLock && 
            timeSinceLastWakeWord > this.globalCooldown) {
            let wakeWordDetected = false;
            
            console.log(`🔍 Checking for wake word in: "${transcript}" (Normal mode)`);
            
            // Simple wake word detection first (for normal idle state)
            if (transcript.length > 1) {
                const simpleCheck = transcript.toLowerCase().trim();
                if (simpleCheck.includes('jarvis') || simpleCheck.endsWith('jarvis') || simpleCheck === 'jarvis') {
                    console.log('✅ WAKE WORD DETECTED! Jarvis activated');
                    wakeWordDetected = true;
                }
            }
        
            // Enhanced wake word detection if simple didn't work
            if (!wakeWordDetected && this.enhancedWakeWordDetector) {
                console.log('🔍 Using enhanced wake word detector...');
                const wakeWordResult = this.enhancedWakeWordDetector.detect(transcript, isFinal);
                wakeWordDetected = wakeWordResult.detected;
                if (wakeWordDetected) {
                    console.log('✅ Enhanced wake word detected!', wakeWordResult);
                }
            } else if (!wakeWordDetected) {
                // Fallback detection
                wakeWordDetected = this.containsWakeWord(transcript.toLowerCase());
                if (wakeWordDetected) {
                    console.log('✅ Fallback wake word detected!');
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
                this.commandTimeout = setTimeout(() => {
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
                        
                        // Update modern UI back to idle
                        if (window.modernJarvis) {
                            window.modernJarvis.updateBubbleState('idle');
                            window.modernJarvis.updateStatus('Ready', 'Say "Jarvis" to begin');
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
        
        // 🔥 ROBUST INTERRUPTION CHECK: Multiple fallback conditions
        if (transcript.length > 0) {
            const interruptCheck = transcript.toLowerCase().trim();
            const hasInterruptWord = interruptCheck.includes('jarvis') || interruptCheck.includes('javi') || interruptCheck.includes('jar');
            
            // PRIMARY CHECK: Normal speech state
            if (this.isSpeaking && this.allowInterruption && hasInterruptWord) {
                console.log(`🔍 PRIMARY INTERRUPTION: "${interruptCheck}" (isSpeaking=${this.isSpeaking})`);
                console.log('🛑 INTERRUPTION DETECTED! Stopping current speech...');
                this.emergencyStopSpeech();
                this.handleInterruption();
                return; // Exit immediately
            }
            
            // BACKUP CHECK 1: Browser synthesis is still speaking even if our flag is wrong
            if (this.synthesis.speaking && hasInterruptWord) {
                console.log(`🔍 BACKUP INTERRUPTION 1: "${interruptCheck}" (synthesis.speaking=${this.synthesis.speaking})`);
                console.log('🛑 BACKUP INTERRUPTION DETECTED! Stopping current speech...');
                this.isSpeaking = true; // Fix the state
                this.emergencyStopSpeech();
                this.handleInterruption();
                return;
            }
            
            // BACKUP CHECK 2: Recent speech start (within last 10 seconds)
            if (hasInterruptWord && this.speechStartTime && (Date.now() - this.speechStartTime) < 10000) {
                console.log(`🔍 BACKUP INTERRUPTION 2: "${interruptCheck}" (recent speech: ${Date.now() - this.speechStartTime}ms ago)`);
                console.log('🛑 RECENT SPEECH INTERRUPTION DETECTED! Stopping...');
                this.isSpeaking = true; // Fix the state
                this.emergencyStopSpeech();
                this.handleInterruption();
                return;
            }
            
            // BACKUP CHECK 3: Current utterance exists
            if (hasInterruptWord && this.currentUtterance) {
                console.log(`🔍 BACKUP INTERRUPTION 3: "${interruptCheck}" (currentUtterance exists)`);
                console.log('🛑 UTTERANCE-BASED INTERRUPTION DETECTED! Stopping...');
                this.isSpeaking = true; // Fix the state
                this.emergencyStopSpeech();
                this.handleInterruption();
                return;
            }
            
            // DEBUGGING: Log when we should interrupt but don't
            if (hasInterruptWord) {
                console.log(`❌ INTERRUPTION MISSED - Word detected but no conditions met:`);
                console.log(`   - isSpeaking: ${this.isSpeaking}`);
                console.log(`   - allowInterruption: ${this.allowInterruption}`);
                console.log(`   - synthesis.speaking: ${this.synthesis.speaking}`);
                console.log(`   - currentUtterance: ${!!this.currentUtterance}`);
                console.log(`   - speechStartTime: ${this.speechStartTime} (${Date.now() - this.speechStartTime}ms ago)`);
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
        
        // Log the user's query for conversation tracking
        if (this.onQueryReceived) {
            this.onQueryReceived({
                query: command,
                timestamp: new Date().toLocaleTimeString(),
                originalTranscript: command
            });
        }
        
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
            await this.resetProcessingState(); // Use default (true) - should restart listening
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
        
        // 🔥 ENHANCED VALIDATION: Prevent responses to garbled/incomplete input
        const commandWords = command.trim().toLowerCase().split(/\s+/);
        const meaningfulWords = commandWords.filter(word => 
            word.length > 2 && 
            !['jarvis', 'jarviss', 'jarvis.', 'jarvis?', 'jarvis!', 'jervis', 'jarvis:', 'javi', 'jar'].includes(word)
        );
        
        // Require at least 2 meaningful words or 8+ characters total
        if (meaningfulWords.length < 2 && command.length < 8) {
            console.log('🚫 Command too short or meaningless - ignoring:', { command, meaningfulWords });
            this.speak("I need a bit more information. Please ask your question again.");
            await this.resetProcessingState();
            return;
        }
        
        // Check for repetitive wake words (like "Jarvis Jarvis")
        const wakeWordCount = commandWords.filter(word => 
            ['jarvis', 'jarviss', 'jarvis.', 'jarvis?', 'jarvis!', 'jervis', 'jarvis:', 'javi', 'jar'].includes(word)
        ).length;
        
        if (wakeWordCount >= commandWords.length - 1) {
            console.log('🚫 Command is mostly wake words - ignoring:', { command, wakeWordCount, totalWords: commandWords.length });
            this.speak("I'm listening! Please ask your question.");
            await this.resetProcessingState();
            return;
        }
        
        if (this.onStatusChange) {
            console.log('🔄 Setting status to: Processing your request...');
            this.onStatusChange('Processing your request...');
        } else {
            console.log('❌ onStatusChange callback not set!');
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
            
            // Check if this is a complex query
            const isComplexQuery = this.isComplexQuery(command);
            if (isComplexQuery) {
                console.log('🧠 Complex query detected, updating UI for processing');
                if (this.onStatusChange) {
                    this.onStatusChange('🔍 Analyzing complex scenario... (10-15 seconds)');
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
                
                // Handle long responses differently (complex queries often generate long responses)
                if (response.query_type === 'complex' && response.response.length > 300) {
                    console.log('📝 Complex query response - using summary for TTS');
                    // For complex queries, extract a summary for speaking
                    const summary = this.extractSummaryForSpeech(response.response);
                    this.speak(summary);
                } else {
                    this.speak(response.response);
                }
                
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
           
            // Restart listening after processing completes
            setTimeout(async () => {
                console.log('🔄 Auto-restarting listening after command processing');
                await this.resetProcessingState(true);
            }, 500); // Small delay to allow TTS to start if needed

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
    
    isComplexQuery(query) {
        /**
         * Detect if this is a complex multi-step query that requires advanced reasoning
         * This matches the logic in the backend (app.py)
         */
        const complexIndicators = [
            // Scenario-based queries
            'broke down', 'broken', 'failed', 'out of service', 'unavailable',
            'next closest', 'nearest available', 'alternative', 'backup',
            'if', 'what if', 'suppose', 'assuming',
            // Multi-step reasoning
            'then what', 'what happens', 'where else', 'what other',
            'reassign', 'reallocate', 'move to', 'switch to',
            // Proximity/location reasoning  
            'closest', 'nearest', 'next available', 'furthest',
            'best option', 'optimal', 'recommend'
        ];
        
        const queryLower = query.toLowerCase();
        return complexIndicators.some(indicator => queryLower.includes(indicator));
    }
    
    extractSummaryForSpeech(longResponse) {
        /**
         * Extract a concise summary from a long complex query response for TTS
         */
        try {
            // Look for the main recommendation or answer
            const lines = longResponse.split('\n');
            let summary = '';
            
            // Find key recommendation lines
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('recommend') || 
                    trimmedLine.includes('suggest') ||
                    trimmedLine.includes('closest') ||
                    trimmedLine.includes('available') ||
                    trimmedLine.includes('assign')) {
                    summary = trimmedLine;
                    break;
                }
            }
            
            // If no specific recommendation found, use first substantial sentence
            if (!summary) {
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.length > 50 && !trimmedLine.startsWith('#') && !trimmedLine.includes('ANALYSIS')) {
                        summary = trimmedLine;
                        break;
                    }
                }
            }
            
            // Fall back to first 200 characters if nothing found
            if (!summary) {
                summary = longResponse.substring(0, 200).replace(/[#*]/g, '').trim();
            }
            
            // Clean up formatting
            summary = summary.replace(/[#*]/g, '').replace(/\s+/g, ' ').trim();
            
            // Ensure it ends properly
            if (!summary.endsWith('.') && !summary.endsWith('!') && !summary.endsWith('?')) {
                summary += '.';
            }
            
            return summary;
        } catch (error) {
            console.error('Error extracting summary:', error);
            return 'I\'ve analyzed your request and provided detailed information in the conversation log.';
        }
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
        // 🚨 EMERGENCY BLOCK: Don't speak if speech is blocked due to interruption
        if (this.speechBlocked) {
            console.log('🚫 Speech blocked due to interruption - skipping synthesis');
            return;
        }
        
        // 🎭 STEALTH MODE: If previous speech is just muted, we can speak new content
        if (this.speechEffectivelyStopped) {
            console.log('🎭 Previous speech is muted - starting new speech for interruption response');
            this.speechEffectivelyStopped = false; // Clear the flag
        }
        
        // Don't speak if no text or empty text
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            console.warn('🚫 No text to speak, skipping synthesis');
            this.isSpeaking = false;
            return;
        }
        
        // Set synthesis lock to prevent interference
        this.synthesisLock = true;
        
        // 🔥 ENHANCED INTERRUPTION: Ensure recognition stays active during speech
        this.allowInterruption = true;
        this.activeInterruptionListening = true;
        this.speechStartTime = Date.now();
        
        console.log('🎤 ENHANCED: Keeping voice recognition ACTIVE during speech for interruption');
        console.log(`🎤 INTERRUPTION STATE: isSpeaking=${this.isSpeaking}, allowInterruption=${this.allowInterruption}, speechStartTime=${this.speechStartTime}`);
        
        // Ensure recognition is running for interruption detection
        this.ensureRecognitionForInterruption();
        
        // 🎭 STEALTH MODE: If previous speech is muted, cancel it before starting new speech
        if (this.speechEffectivelyStopped && this.synthesis.speaking) {
            console.log('🎭 Cancelling muted background speech before starting new speech');
            try {
                this.synthesis.cancel();
            } catch (error) {
                console.log('Background speech cancellation failed:', error);
            }
            this.speechEffectivelyStopped = false;
        }
        
        // Only cancel if there's actual speech happening to avoid conflicts
        if (this.synthesis.speaking && !this.speechEffectivelyStopped) {
            this.synthesis.cancel();
            // Small delay to allow cancellation to complete
            setTimeout(() => this.performSpeech(text), 150);
            return;
        }
        
        this.performSpeech(text);
    }
    
    /**
     * 🔥 GENTLE METHOD: Ensure speech recognition stays active during speech synthesis
     */
    ensureRecognitionForInterruption() {
        if (!this.config.continueListeningDuringSpeech) {
            return;
        }
        
        // Only start recognition if it's completely inactive
        if (!this.isListening && (!this.recognition || this.recognition.state === 'inactive')) {
            console.log('🎤 Gently starting recognition for interruption detection');
            this.startListening(true); // Force start with interruption mode
        } else {
            console.log('🎤 Recognition already active - keeping it running for interruption');
        }
        
        // Set up gentle periodic check (less frequent to avoid interference)
        if (this.interruptionCheckInterval) {
            clearInterval(this.interruptionCheckInterval);
        }
        
        this.interruptionCheckInterval = setInterval(() => {
            if (this.isSpeaking && this.allowInterruption) {
                // Only restart if recognition is completely dead
                if (!this.isListening && (!this.recognition || this.recognition.state === 'inactive')) {
                    console.log('🔄 Gently restarting recognition for interruption');
                    this.startListening(true);
                } else {
                    console.log('🎤 Recognition still active during speech');
                }
            } else {
                // Clear interval if not speaking
                if (this.interruptionCheckInterval) {
                    clearInterval(this.interruptionCheckInterval);
                    this.interruptionCheckInterval = null;
                    console.log('🔇 Clearing interruption check - not speaking');
                }
            }
        }, 1000); // Check every 1000ms (less frequent)
    }
    
    performSpeech(text) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.voiceSettings.rate;
        utterance.pitch = this.voiceSettings.pitch;
        utterance.volume = this.voiceSettings.volume;
        
        // 🔥 ENHANCED INTERRUPTION: Store current utterance and set up for interruption
        this.currentUtterance = utterance;
        this.interruptedDuringResponse = false;
        this.isSpeaking = true;
        
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
                window.modernJarvis.updateStatus('Speaking...', 'Say "Jarvis" to interrupt');
            }
            
            // 🔥 INTERRUPTION BACKUP: Set up periodic check for interruption signals
            this.interruptionCheckInterval = setInterval(() => {
                if (!this.isSpeaking || !this.allowInterruption) {
                    clearInterval(this.interruptionCheckInterval);
                    return;
                }
                
                // Check if speech synthesis was stopped externally or if we got an interruption signal
                if (!this.synthesis.speaking && this.isSpeaking) {
                    console.log('🔄 Speech was stopped externally - cleaning up');
                    clearInterval(this.interruptionCheckInterval);
                    this.isSpeaking = false;
                    this.allowInterruption = false;
                }
            }, 100); // Check every 100ms for fast response
        };
        
        utterance.onend = () => {
            // 🔥 INTERRUPTION FEATURE: Handle interruption cleanup
            this.currentUtterance = null;
            this.allowInterruption = false;
            
            // Clear interruption check interval
            if (this.interruptionCheckInterval) {
                clearInterval(this.interruptionCheckInterval);
                this.interruptionCheckInterval = null;
            }
            
            // Clear the speaking flag and synthesis lock
            this.isSpeaking = false;
            this.synthesisLock = false;
            
            // If we were interrupted, don't restart - the interruption handler will take over
            if (this.interruptedDuringResponse) {
                console.log('🔄 Speech was interrupted - letting interruption handler manage restart');
                return;
            }
            
            if (this.onStatusChange) {
                const wakeWord = this.languageManager ? 
                    this.languageManager.getWakeWords()[0] : 'Jarvis';
                const readyMessage = this.languageManager ? 
                    this.languageManager.translate('ready', { wake_word: wakeWord }) : 
                    'Ready - Say "Jarvis" to begin';
                this.onStatusChange(readyMessage);
            }
            
            // Force a clean restart after synthesis is complete
            setTimeout(async () => {
                if (!this.isProcessing && !this.processingLock && !this.synthesisLock && !this.interruptedDuringResponse) {
                    console.log('🔄 Force restarting speech recognition after synthesis completed');
                    
                    // Force stop all recognition first
                    this.stopListening();
                    
                    // Reset all state variables (without auto-restart to avoid conflicts)
                    this.isListening = false;
                    this.lastTranscript = '';
                    this.wakeWordDetected = false;
                    this.lastWakeWordTime = 0; // Reset cooldown timer for immediate responsiveness
                    
                    // Clear the auto-reset timeout from wake word detection
                    if (this.commandTimeout) {
                        clearTimeout(this.commandTimeout);
                        this.commandTimeout = null;
                    }
                    
                    await this.resetProcessingState(false); // Don't auto-restart listening
                    
                    // Clear any timeouts
                    if (this.commandTimeout) {
                        clearTimeout(this.commandTimeout);
                        this.commandTimeout = null;
                    }
                    
                    // Single clean reset and restart
                    if (this.enhancedWebSpeech) {
                        try {
                            await this.enhancedWebSpeech.reset();
                            console.log('✅ Enhanced speech reset complete, starting fresh recognition');
                        } catch (error) {
                            console.warn('Error during enhanced speech reset:', error);
                        }
                    }
                    
                    // Start fresh immediately for instant responsiveness
                    setTimeout(() => {
                        console.log('🚀 Starting fresh recognition after clean reset');
                        console.log(`📊 Reset state: wakeWordDetected=${this.wakeWordDetected}, processing=${this.isProcessing}`);
                        
                        // Update UI to show we're back to listening for wake word
                        const wakeWord = this.languageManager ? 
                            this.languageManager.getWakeWords()[0] : 'Jarvis';
                        const readyMessage = this.languageManager ? 
                            this.languageManager.translate('ready', { wake_word: wakeWord }) : 
                            `Ready - Say "${wakeWord}" to begin`;
                        
                        console.log(`🎯 RETURNING TO WAKE WORD DETECTION MODE - Say "${wakeWord}" to activate`);
                        
                        if (this.onStatusChange) {
                            this.onStatusChange(readyMessage);
                        }
                        
                        // Update modern UI to idle state
                        if (window.modernJarvis) {
                            window.modernJarvis.updateBubbleState('idle');
                            window.modernJarvis.updateStatus('Ready', `Say "${wakeWord}" to begin`);
                        }
                        
                        try {
                            this.startListening();
                            console.log('✅ System ready for immediate "Jarvis" detection');
                            console.log(`⚡ Total restart time: ~300ms - Next "Jarvis" will be instantly responsive!`);
                        } catch (error) {
                            console.error('Failed to restart recognition:', error);
                            // Single retry with minimal delay
                            setTimeout(() => {
                                console.log('🔄 Retrying speech recognition start...');
                                try {
                                    this.startListening();
                                } catch (retryError) {
                                    console.error('Failed to restart recognition on retry:', retryError);
                                }
                            }, 250);
                        }
                    }, 50); // Reduced from 100ms to 50ms for even faster response
                }
            }, 250); // Reduced from 500ms to 250ms for immediate restart
        };
        
        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event.error);
            
            // Clear interruption check interval
            if (this.interruptionCheckInterval) {
                clearInterval(this.interruptionCheckInterval);
                this.interruptionCheckInterval = null;
            }
            
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
    
    /**
     * 🚀 NUCLEAR INTERRUPTION: Multiple aggressive methods to force speech to stop
     */
    emergencyStopSpeech() {
        console.log('🚀 NUCLEAR INTERRUPTION - Using ALL methods to force speech stop!');
        
        this.interruptionAttempts++;
        
        // Log interruption for analytics/debugging
        console.log(`🛑 Interruption attempt #${this.interruptionAttempts} at ${Date.now() - this.speechStartTime}ms into speech`);
        
        // 🚀 METHOD 1: Instant volume mute (appears to stop immediately)
        try {
            if (this.currentUtterance) {
                this.currentUtterance.volume = 0;
                this.currentUtterance.rate = 0.01; // Extremely slow
                console.log('🔇 Volume muted to 0 and rate slowed dramatically!');
            }
        } catch (error) {
            console.log('Volume/rate manipulation failed:', error);
        }
        
        // 🚀 METHOD 2: Text replacement (replace remaining text with silence)
        try {
            if (this.currentUtterance) {
                this.currentUtterance.text = '.'; // Replace with minimal text
                console.log('📝 Text replaced with minimal content');
            }
        } catch (error) {
            console.log('Text replacement failed:', error);
        }
        
        // 🚀 METHOD 3: Immediate cancellation (multiple attempts)
        for (let i = 0; i < 3; i++) {
            try {
                this.synthesis.cancel();
                this.synthesis.pause();
                console.log(`🛑 Cancellation attempt ${i + 1} completed`);
            } catch (error) {
                console.log(`Cancellation attempt ${i + 1} failed:`, error);
            }
        }
        
        // 🚀 METHOD 4: Clear the queue completely
        try {
            while (this.synthesis.pending || this.synthesis.speaking) {
                this.synthesis.cancel();
            }
            console.log('🧹 Speech queue cleared completely');
        } catch (error) {
            console.log('Queue clearing failed:', error);
        }
        
        // 🚀 METHOD 5: Audio context manipulation (if available)
        try {
            if (window.AudioContext || window.webkitAudioContext) {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioContext.suspend().then(() => {
                    console.log('🔇 Audio context suspended');
                    setTimeout(() => {
                        audioContext.resume().then(() => {
                            console.log('🔊 Audio context resumed');
                        });
                    }, 100);
                });
            }
        } catch (error) {
            console.log('Audio context manipulation failed:', error);
        }
        
        // 🚀 METHOD 6: Force event handlers to null
        try {
            if (this.currentUtterance) {
                this.currentUtterance.onstart = null;
                this.currentUtterance.onend = null;
                this.currentUtterance.onerror = null;
                this.currentUtterance.onpause = null;
                this.currentUtterance.onresume = null;
                this.currentUtterance.onmark = null;
                this.currentUtterance.onboundary = null;
                console.log('🔇 All utterance event handlers cleared');
            }
        } catch (error) {
            console.log('Event handler clearing failed:', error);
        }
        
        // Mark as completely stopped from user perspective
        this.isSpeaking = false;
        this.speechEffectivelyStopped = true;
        this.synthesisLock = false;
        this.allowInterruption = false;
        this.currentUtterance = null;
        
        console.log('🚀 NUCLEAR INTERRUPTION COMPLETED - Speech forcefully stopped!');
    }
    
    /**
     * 🔇 Handle speech end after interruption (cleanup after background speech finishes)
     */
    handleSpeechEndAfterInterruption() {
        console.log('🔇 Cleaning up after background speech finished');
        this.speechEffectivelyStopped = false;
        this.currentUtterance = null;
        this.activeInterruptionListening = false;
        
        // Clear interruption check interval
        if (this.interruptionCheckInterval) {
            clearInterval(this.interruptionCheckInterval);
            this.interruptionCheckInterval = null;
        }
    }
    
    /**
     * 🔥 NEW: Handle speech end gracefully
     */
    handleSpeechEnd() {
        console.log('🔇 Speech synthesis ended');
        this.isSpeaking = false;
        this.synthesisLock = false;
        this.currentUtterance = null;
        this.activeInterruptionListening = false;
        
        // Clear interruption check interval
        if (this.interruptionCheckInterval) {
            clearInterval(this.interruptionCheckInterval);
            this.interruptionCheckInterval = null;
        }
        
        // Don't restart recognition if we were interrupted
        if (!this.interruptedDuringResponse && !this.speechBlocked) {
            console.log('🎤 Speech ended normally - keeping recognition active');
        }
    }
    
    /**
     * 🔥 GRACEFUL INTERRUPTION FEATURE: Handle voice interruption during speech synthesis
     */
    handleInterruption() {
        const interruptionTime = Date.now() - this.speechStartTime;
        console.log(`🛑 GRACEFUL INTERRUPTION - Smoothly stopping speech (${interruptionTime}ms into speech)`);
        
        // Prevent spam interruptions
        if (Date.now() - this.lastInterruptionTime < this.config.interruptionCooldown) {
            console.log('🚫 Ignoring rapid interruption attempts');
            return;
        }
        this.lastInterruptionTime = Date.now();
        
        // Clear interruption check interval immediately
        if (this.interruptionCheckInterval) {
            clearInterval(this.interruptionCheckInterval);
            this.interruptionCheckInterval = null;
        }
        
        // Set interruption flag to prevent normal restart behavior
        this.interruptedDuringResponse = true;
        this.activeInterruptionListening = false;
        
        // Callback for interruption events
        if (this.onInterruption) {
            this.onInterruption({
                interruptionTime: interruptionTime,
                attempts: this.interruptionAttempts,
                speechText: this.currentUtterance ? this.currentUtterance.text : null
            });
        }
        
        // Stealth speech stop (mute volume, should already be called)
        if (this.isSpeaking || this.synthesis.speaking) {
            this.emergencyStopSpeech();
        }
        
        // Don't clear currentUtterance immediately - let it finish muted in background
        // this.currentUtterance = null; // Will be cleared when background speech finishes
        
        // Reset speech-related flags IMMEDIATELY for user perspective
        this.isSpeaking = false; // User thinks speech stopped
        this.synthesisLock = false;
        this.allowInterruption = true; // Keep enabled for next response
        
        // Set up for new command - be more conservative
        this.wakeWordDetected = true;
        this.lastTranscript = '';
        this.lastWakeWordTime = Date.now();
        
        // Clear any existing timeouts
        if (this.commandTimeout) {
            clearTimeout(this.commandTimeout);
            this.commandTimeout = null;
        }
        
        // Update UI immediately
        if (this.onStatusChange) {
            const interruptMessage = 'Interruption detected! Listening for your new command...';
            this.onStatusChange(interruptMessage);
        }
        
        // Update modern UI
        if (window.modernJarvis) {
            window.modernJarvis.updateBubbleState('listening');
            window.modernJarvis.updateStatus('Interruption detected!', 'Say your new command...');
        }
        
        // 🎭 STEALTH MODE: Don't block speech - we can start new speech while old one is muted
        // No speechBlocked = true here, allowing immediate new responses
        console.log('🎭 Stealth mode: New speech can start immediately while old speech is muted');
        
        // DON'T restart recognition automatically - keep existing recognition running
        // This prevents microphone permission issues
        console.log('🎤 Keeping existing recognition active after interruption');
        
        // Set up auto-reset timeout for new command
        this.commandTimeout = setTimeout(() => {
            if (this.wakeWordDetected && !this.isProcessing && !this.processingLock &&
                this.lastTranscript.length < 3) {
                console.log('🔄 Auto-resetting after interruption timeout');
                this.resetToIdleState();
            }
        }, 6000); // Shorter timeout (6 seconds)
        
        // Reset the interruption flag after a short delay
        setTimeout(() => {
            this.interruptedDuringResponse = false;
            console.log('✅ Graceful interruption complete - ready for new command');
        }, 300);
    }
    
    /**
     * 🔥 ENHANCED: Reset system to idle state (used by interruption and normal flows)
     */
    resetToIdleState() {
        console.log('🔄 Resetting to idle state after interruption');
        
        // Clear all interruption-related state
        this.wakeWordDetected = false;
        this.isProcessing = false;
        this.processingLock = false;
        this.synthesisLock = false;
        this.isSpeaking = false;
        this.allowInterruption = true; // Keep enabled for next response
        this.interruptedDuringResponse = false;
        this.speechBlocked = false; // Clear speech block
        this.speechEffectivelyStopped = false; // Clear stealth mute flag
        this.activeInterruptionListening = false;
        this.lastTranscript = '';
        this.currentUtterance = null;
        this.interruptionAttempts = 0; // Reset attempts counter
        
        // Clear interruption check interval
        if (this.interruptionCheckInterval) {
            clearInterval(this.interruptionCheckInterval);
            this.interruptionCheckInterval = null;
        }
        
        const wakeWord = this.languageManager ? 
            this.languageManager.getWakeWords()[0] : 'Jarvis';
        const readyMessage = this.languageManager ? 
            this.languageManager.translate('ready', { wake_word: wakeWord }) : 
            `Ready - Say "${wakeWord}" to begin`;
        
        if (this.onStatusChange) {
            this.onStatusChange(readyMessage);
        }
        
        if (window.modernJarvis) {
            window.modernJarvis.updateBubbleState('idle');
            window.modernJarvis.updateStatus('Ready', `Say "${wakeWord}" to begin`);
        }
        
        // Restart listening if not already active
        if (!this.isListening) {
            console.log('🔄 Restarting listening after reset to idle');
            this.startListening();
        }
    }
    
    async startListening(forceInterruptionMode = false) {
        // 🔥 ENHANCED: Allow starting in interruption mode even while speaking
        if (!forceInterruptionMode) {
            // Defensive check: Don't start if already processing or speaking (unless forced)
            if (this.isProcessing || this.processingLock || this.synthesisLock || this.isSpeaking) {
                console.warn('🚫 Cannot start listening - system is busy');
                return false;
            }
        } else {
            console.log('🚀 FORCE STARTING recognition for interruption mode while speaking');
        }
        
        // Use enhanced speech if available and provider is 'webspeech'
        if (this.speechRecognitionProvider === 'webspeech' && this.enhancedWebSpeech) {
            console.log('🚀 Starting enhanced Web Speech API recognition');
            
            // Double-check enhanced speech isn't already listening
            const status = this.enhancedWebSpeech.getStatus();
            if (status.isListening) {
                console.warn('🚫 Enhanced speech already listening - skipping start');
                return true; // Already running successfully
            }
            
            try {
                this.enhancedWebSpeech.start();
                this.isListening = true;
                return true;
            } catch (error) {
                console.warn('Enhanced speech failed to start, falling back to basic:', error);
                // Fall through to basic recognition
            }
        }
        
        // Fallback to basic Web Speech API
        if (!this.isInitialized) {
            console.error('Voice Assistant not initialized');
            return false;
        }
        
        if (this.isListening) {
            console.warn('🚫 Basic speech recognition already running - ignoring duplicate start request');
            return true; // Already running successfully
        }
        
        try {
            this.recognition.start();
            this.isListening = true;
            return true;
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            if (this.onError) {
                this.onError(`Failed to start speech recognition: ${error.message}`);
            }
            return false;
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
        // MODIFIED: Prioritize Whisper API for better accuracy with aviation terminology
        
        console.log('🔍 Provider Recommendation Debug:');
        console.log(`   - Whisper client exists: ${!!this.whisperClient}`);
        
        // Check if Whisper is available and configured
        if (this.whisperClient) {
            const status = this.whisperClient.getStatus();
            console.log(`   - Whisper status: hasAPIKey=${status.hasAPIKey}, canMakeRequest=${status.canMakeRequest}`);
            
            if (status.hasAPIKey && status.canMakeRequest) {
                console.log('✅ Recommending Whisper (primary, accurate)');
                return { 
                    provider: 'whisper', 
                    confidence: 0.9, 
                    reason: 'whisper_primary_accurate' 
                };
            } else {
                console.log('❌ Whisper unavailable - API key or request limit issues');
            }
        } else {
            console.log('❌ Whisper client not initialized');
        }
        
        // Use environmental detector if available for Web Speech fallback
        if (this.audioEnvironmentDetector) {
            const recommendation = this.audioEnvironmentDetector.getRoutingRecommendation(options);
            console.log(`✅ Using environmental detector recommendation: ${recommendation.provider}`);
            // Force Web Speech as fallback since Whisper isn't available
            return { 
                provider: 'webspeech', 
                confidence: recommendation.confidence * 0.7, // Lower confidence since it's fallback
                reason: 'webspeech_fallback' 
            };
        }
        
        // Final fallback to Web Speech
        console.log('✅ Final fallback to Web Speech');
        return { provider: 'webspeech', confidence: 0.5, reason: 'no_detector_fallback' };
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
     * Set OpenAI API key for Whisper functionality
     * @param {string} apiKey - OpenAI API key starting with 'sk-'
     */
    setOpenAIAPIKey(apiKey) {
        if (!apiKey || !apiKey.startsWith('sk-')) {
            console.warn('Invalid OpenAI API key. Must start with "sk-"');
            return false;
        }
        
        localStorage.setItem('openai_api_key', apiKey);
        console.log('✅ OpenAI API key saved for Whisper functionality');
        
        // Reinitialize Whisper client if it exists
        if (this.whisperClient) {
            this.whisperClient.updateAPIKey(apiKey);
        }
        
        return true;
    }

    /**
     * Check if Whisper is properly configured
     */
    checkWhisperStatus() {
        if (!this.whisperClient) {
            console.log('❌ Whisper client not initialized');
            return { available: false, reason: 'client_not_initialized' };
        }
        
        const status = this.whisperClient.getStatus();
        if (!status.hasAPIKey) {
            console.log('❌ Whisper API key not configured');
            console.log('💡 Set your OpenAI API key: voiceAssistant.setOpenAIAPIKey("sk-your-key-here")');
            return { available: false, reason: 'no_api_key' };
        }
        
        if (!status.canMakeRequest) {
            console.log('❌ Whisper cannot make requests (cost limits or other restrictions)');
            return { available: false, reason: 'cannot_make_request' };
        }
        
        console.log('✅ Whisper is properly configured and ready');
        return { available: true };
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
    onEnhancedSpeechStart() {
        console.log('🎤 Enhanced speech recognition started');
        console.log(`📊 Current state: listening=${this.isListening}, processing=${this.isProcessing}, synthesis=${this.synthesisLock}`);
        this.isListening = true;
        
        if (this.onListeningChange) {
            this.onListeningChange(true);
        }
        
        if (this.onBubbleStateChange) {
            this.onBubbleStateChange('listening');
        }
    }
    
    /**
     * Handle enhanced speech recognition end
     */
    onEnhancedSpeechEnd() {
        console.log('🎤 Enhanced speech recognition ended');
        console.log(`📊 Current state: listening=${this.isListening}, processing=${this.isProcessing}, synthesis=${this.synthesisLock}`);
        this.isListening = false;
        
        if (this.onListeningChange) {
            this.onListeningChange(false);
        }
        
        if (this.onBubbleStateChange) {
            this.onBubbleStateChange('idle');
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
     * Override startListening to use basic speech recognition (Enhanced disabled due to errors)
     */
    startListening() {
        // Defensive check: Don't start if already processing or speaking
        if (this.isProcessing || this.processingLock || this.synthesisLock || this.isSpeaking) {
            console.warn('🚫 Cannot start listening - system is busy');
            return false;
        }
        
        // TEMPORARILY DISABLED: Enhanced Web Speech API due to "aborted" error loops
        // Using basic Web Speech API for stability
        console.log('🎤 Starting basic Web Speech API recognition (Enhanced disabled)');
        
        // Use basic Web Speech API
        if (!this.isInitialized) {
            console.error('Voice Assistant not initialized');
            return false;
        }
        
        if (this.isListening) {
            console.warn('🚫 Basic speech recognition already running - ignoring duplicate start request');
            return true; // Already running successfully
        }
        
        try {
            this.recognition.start();
            this.isListening = true;
            console.log('✅ Basic Web Speech API started successfully');
            return true;
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            if (this.onError) {
                this.onError(`Failed to start speech recognition: ${error.message}`);
            }
            return false;
        }
    }
    

    
    /**
     * Centralized state reset to prevent conflicts
     */
    async resetProcessingState(shouldRestartListening = true) {
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
        
        // Only restart listening if requested (to avoid conflicts with manual restart logic)
        if (shouldRestartListening) {
            // Wait for enhanced speech reset if available
            if (this.enhancedWebSpeech) {
                try {
                    await this.enhancedWebSpeech.reset();
                } catch (error) {
                    console.warn('Error during enhanced speech reset in resetProcessingState:', error);
                }
            }
            
            // Restart listening after reset is complete and brief delay to ensure clean state
            setTimeout(() => {
                if (!this.isListening && !this.isProcessing && !this.processingLock) {
                    console.log('🔄 Restarting listening after state reset');
                    this.startListening();
                }
            }, 150);
        }
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
        console.log(`🔍 Hybrid Mode Debug: enabled=${this.hybridModeEnabled}, whisperClient=${!!this.whisperClient}`);
        
        if (!this.hybridModeEnabled) {
            console.log('🔄 Hybrid mode disabled, using standard Web Speech');
            return this.startListening();
        }
        
        // Get environmental routing recommendation
        const recommendation = this.getProviderRecommendation();
        this.speechRecognitionProvider = recommendation.provider;
        
        console.log(`🎯 Hybrid Routing: Using ${recommendation.provider} (reason: ${recommendation.reason}, confidence: ${recommendation.confidence.toFixed(2)})`);
        
        // Route to appropriate provider with better error handling
        if (recommendation.provider === 'whisper' && this.whisperClient) {
            try {
                console.log('🤖 Attempting to start Whisper...');
                return await this.startWhisperListening();
            } catch (error) {
                console.error('❌ Whisper failed to start:', error);
                console.log('🔄 Falling back to Web Speech API');
                this.speechRecognitionProvider = 'webspeech';
                return this.startListening();
            }
        } else {
            console.log('🎤 Using Web Speech API (Whisper not available or not recommended)');
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
    
    /**
     * Heartbeat check to ensure system stays responsive
     */
    startHeartbeat() {
        // Clear any existing heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            // Only check if system is idle and should be listening for wake words
            if (!this.isProcessing && !this.processingLock && !this.synthesisLock && !this.isSpeaking && !this.wakeWordDetected) {
                // Check if speech recognition is running when it should be
                const shouldBeListening = this.isInitialized && !this.isListening;
                
                if (shouldBeListening) {
                    console.log('🩺 Heartbeat: Restarting speech recognition (was stopped unexpectedly)');
                    try {
                        this.startListening();
                    } catch (error) {
                        console.warn('Heartbeat restart failed:', error);
                    }
                }
            }
        }, 2000); // Check every 2 seconds for faster recovery
    }
    
    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    
    /**
     * 🔥 NEW: Configure interruption settings
     */
    configureInterruption(settings = {}) {
        console.log('🔧 Configuring interruption settings:', settings);
        
        // Update configuration
        if (settings.enabled !== undefined) {
            this.config.interruptionEnabled = settings.enabled;
        }
        if (settings.sensitivity !== undefined) {
            this.config.interruptionSensitivity = settings.sensitivity;
        }
        if (settings.immediateInterruption !== undefined) {
            this.config.immediateInterruption = settings.immediateInterruption;
        }
        if (settings.continueListeningDuringSpeech !== undefined) {
            this.config.continueListeningDuringSpeech = settings.continueListeningDuringSpeech;
        }
        
        console.log('✅ Interruption configuration updated:', {
            enabled: this.config.interruptionEnabled,
            sensitivity: this.config.interruptionSensitivity,
            immediate: this.config.immediateInterruption,
            continueListen: this.config.continueListeningDuringSpeech
        });
    }
    
    /**
     * 🔥 NEW: Test interruption functionality
     */
    testInterruption(testMessage = "This is a test message to demonstrate the interruption functionality. Say Jarvis to interrupt me while I'm speaking.") {
        console.log('🧪 Testing interruption functionality...');
        
        // Ensure interruption is enabled
        this.configureInterruption({ enabled: true, sensitivity: 'high' });
        
        // Speak test message
        this.speak(testMessage);
        
        console.log('🎤 Interruption test started - say "Jarvis" to interrupt!');
        
        return {
            message: "Interruption test started! Say 'Jarvis' while I'm speaking to test the interruption.",
            settings: {
                enabled: this.config.interruptionEnabled,
                sensitivity: this.config.interruptionSensitivity
            }
        };
    }
    
    /**
     * 🔥 NEW: Get current interruption status
     */
    getInterruptionStatus() {
        return {
            enabled: this.config.interruptionEnabled,
            sensitivity: this.config.interruptionSensitivity,
            allowInterruption: this.allowInterruption,
            isSpeaking: this.isSpeaking,
            activeInterruptionListening: this.activeInterruptionListening,
            interruptionAttempts: this.interruptionAttempts,
            speechBlocked: this.speechBlocked,
            timeSinceSpeechStart: this.speechStartTime ? Date.now() - this.speechStartTime : 0
        };
    }
} 