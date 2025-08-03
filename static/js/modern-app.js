// Modern JARVIS UI Controller
class ModernJarvisApp {
    constructor() {
        this.voiceAssistant = null;
        this.wakeWordDetector = null;
        this.isInitialized = false;
        this.conversationHistory = [];
        this.proactiveAssistant = null;
        
        // DOM elements
        this.elements = {
            // Voice bubble elements
            voiceBubble: document.getElementById('voice-bubble'),
            voiceStatus: document.getElementById('voice-status'),
            voiceHint: document.getElementById('voice-hint'),
            
            // Action buttons
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            
            // Collapsible sections
            conversationToggle: document.getElementById('conversation-toggle'),
            conversationContent: document.getElementById('conversation-content'),
            settingsToggle: document.getElementById('settings-toggle'),
            settingsContent: document.getElementById('settings-content'),
            
            // Conversation log
            logContainer: document.getElementById('log-container'),
            clearLogBtn: document.getElementById('clear-log-btn'),
            exportLogBtn: document.getElementById('export-log-btn'),
            
            // Settings
            sensitivitySelect: document.getElementById('sensitivity-select'),
            enhancedKeywordsToggle: document.getElementById('enhanced-keywords-toggle'),
            enhancedPhrasesToggle: document.getElementById('enhanced-phrases-toggle'),
            transparentResponsesToggle: document.getElementById('transparent-responses-toggle'),
            biometricsToggle: document.getElementById('biometrics-toggle'),
            stressDetectionToggle: document.getElementById('stress-detection-toggle'),
            autoLanguageToggle: document.getElementById('auto-language-toggle'),
            
            // Hidden compatibility elements
            status: document.getElementById('status'),
            listeningStatus: document.getElementById('listening-status'),
            responseTime: document.getElementById('response-time'),
            visualFeedback: document.getElementById('visual-feedback'),
            testBtn: document.getElementById('test-btn'),
            runTestsBtn: document.getElementById('run-tests-btn')
        };
        
        this.init();
    }
    
    async init() {
        console.log('Initializing Modern JARVIS UI...');
        
        // Check browser support
        if (!this.checkBrowserSupport()) {
            this.showError('Your browser does not support the required features for voice interaction.');
            return;
        }
        
        // Initialize UI components
        this.setupEventListeners();
        this.setupCollapsibleSections();
        this.setupVoiceBubbleInteraction();
        
        // Initialize voice systems
        this.initializeVoiceAssistant();
        this.initializeWakeWordDetector();
        
        // Set initial state
        this.updateBubbleState('idle');
        this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
        
        this.isInitialized = true;
        console.log('Modern JARVIS UI initialized successfully');
        
        // Check if microphone permissions are already granted
        this.checkMicrophonePermissions();
    }
    
    checkBrowserSupport() {
        const hasWebSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        const hasSpeechSynthesis = 'speechSynthesis' in window;
        
        if (!hasWebSpeech) {
            console.error('Browser does not support Speech Recognition');
        }
        if (!hasSpeechSynthesis) {
            console.error('Browser does not support Speech Synthesis');
        }
        
        return hasWebSpeech && hasSpeechSynthesis;
    }
    
    async checkMicrophonePermissions() {
        console.log('🎤 Checking microphone permissions...');
        
        try {
            // Check if the Permissions API is available
            if (navigator.permissions && navigator.permissions.query) {
                const permission = await navigator.permissions.query({ name: 'microphone' });
                console.log('🎤 Microphone permission status:', permission.state);
                
                if (permission.state === 'granted') {
                    console.log('✅ Microphone access already granted - starting voice assistant');
                    this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
                    
                    // Auto-start since we have permissions
                    setTimeout(() => {
                        console.log('🚀 Auto-starting voice assistant (permissions granted)...');
                        this.startVoiceAssistant();
                    }, 1500);
                    
                } else if (permission.state === 'prompt' || permission.state === 'denied') {
                    console.log('⚠️ Microphone permission required');
                    this.updateStatus('Click Start', 'Microphone permission needed');
                    this.logMessage('system', 'Click the Start button to enable voice listening');
                    
                    // Listen for permission changes
                    permission.addEventListener('change', () => {
                        console.log('🔄 Permission state changed to:', permission.state);
                        if (permission.state === 'granted') {
                            this.logMessage('system', 'Microphone access granted - Voice assistant ready');
                            this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
                        }
                    });
                }
            } else {
                console.log('⚠️ Permissions API not available - requiring manual start');
                this.updateStatus('Click Start', 'Manual activation required');
                this.logMessage('system', 'Click the Start button to begin voice listening');
            }
        } catch (error) {
            console.error('Error checking microphone permissions:', error);
            this.updateStatus('Click Start', 'Manual activation required');
            this.logMessage('system', 'Click the Start button to begin voice listening');
        }
    }
    
    enableContinuousListening() {
        console.log('🔄 Enabling continuous listening mode...');
        
        // Mark that continuous listening is active
        this.continuousListeningActive = true;
        
        // Set up monitoring to restart voice assistant if it stops unexpectedly
        this.setupListeningMonitor();
        
        // Store the original onListeningChange callback
        if (this.voiceAssistant && !this.originalOnListeningChange) {
            this.originalOnListeningChange = this.voiceAssistant.onListeningChange;
            
            // Override to monitor listening state
            this.voiceAssistant.onListeningChange = (isListening) => {
                console.log(`🔍 Listening state changed: ${isListening}`);
                
                // Call original callback
                if (this.originalOnListeningChange) {
                    this.originalOnListeningChange(isListening);
                }
                
                // If listening stopped and continuous mode is active, restart
                if (!isListening && this.continuousListeningActive && !this.voiceAssistant.isProcessing) {
                    console.log('🔄 Listening stopped - scheduling restart for continuous mode...');
                    setTimeout(() => {
                        if (this.continuousListeningActive && !this.voiceAssistant.isListening && !this.voiceAssistant.isProcessing) {
                            console.log('🚀 Restarting voice assistant for continuous listening...');
                            this.startVoiceAssistant();
                        }
                    }, 3000); // Wait 3 seconds before restarting
                }
            };
        }
    }
    
    setupListeningMonitor() {
        // Clear any existing monitor
        if (this.listeningMonitorInterval) {
            clearInterval(this.listeningMonitorInterval);
        }
        
        // Check every 10 seconds if we should be listening but aren't
        this.listeningMonitorInterval = setInterval(() => {
            if (this.continuousListeningActive && 
                this.voiceAssistant && 
                !this.voiceAssistant.isListening && 
                !this.voiceAssistant.isProcessing &&
                !this.voiceAssistant.isSpeaking) {
                
                console.log('📊 Monitor: Voice assistant should be listening but isn\'t - restarting...');
                this.startVoiceAssistant();
            }
        }, 10000); // Check every 10 seconds
    }
    
    initializeVoiceAssistant() {
        this.voiceAssistant = new VoiceAssistant();
        
        // Set up callbacks for the new UI
        this.voiceAssistant.onStatusChange = (status) => {
            // Update bubble state based on status for ALL processing (not just complex queries)
            if (status.includes('Analyzing complex scenario')) {
                this.updateBubbleState('processing');
                this.updateStatus(status, 'Please wait...');
            } else if (status.includes('Processing your request')) {
                // Show processing bubble for regular queries too
                this.updateBubbleState('processing');
                this.updateStatus(status, 'Please wait...');
            } else {
                this.updateStatus(status);
            }
            
            // Update hidden element for compatibility
            if (this.elements.status) {
                this.elements.status.textContent = status;
            }
        };
        
        this.voiceAssistant.onListeningChange = (isListening) => {
            if (isListening) {
                this.updateBubbleState('listening');
                this.updateStatus('Listening for wake word...', 'Say "Jarvis" to activate');
            } else {
                this.updateBubbleState('idle');
                this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
            }
            
            // Update hidden element for compatibility
            if (this.elements.listeningStatus) {
                this.elements.listeningStatus.textContent = isListening ? 'Yes' : 'No';
            }
            
            // Update visual feedback for compatibility
            this.updateVisualFeedback(isListening);
        };
        
        this.voiceAssistant.onTranscriptReceived = (transcript, isFinal) => {
            // Update bubble state when wake word is detected
            if (this.voiceAssistant.wakeWordDetected) {
                this.updateBubbleState('active');
                this.updateStatus('Listening for command...', 'Speak your question now');
            }
        };
        
        this.voiceAssistant.onResponseReceived = (response) => {
            this.handleResponse(response);
        };
        
        // Log user queries when they're processed
        this.voiceAssistant.onQueryReceived = (query) => {
            this.logMessage('user', query.query, {
                originalTranscript: query.originalTranscript,
                timestamp: query.timestamp
            });
        };
        
        this.voiceAssistant.onError = (error) => {
            this.showError(error);
        };
        
        // Handle processing state
        const originalProcessCommand = this.voiceAssistant.processCommand.bind(this.voiceAssistant);
        this.voiceAssistant.processCommand = async (command) => {
            this.updateBubbleState('processing');
            this.updateStatus('Processing...', 'Analyzing your request');
            
            try {
                const result = await originalProcessCommand(command);
                return result;
            } finally {
                // State will be updated by other callbacks
            }
        };
        
        // Handle speaking state
        const originalSpeak = this.voiceAssistant.speak.bind(this.voiceAssistant);
        this.voiceAssistant.speak = (text, options = {}) => {
            this.updateBubbleState('speaking');
            this.updateStatus('Speaking...', 'Listening to response');
            
            return originalSpeak(text, options);
        };
        
        // Set up proactive assistant reference
        this.proactiveAssistant = this.voiceAssistant.proactiveAssistant;
        
        // Start heartbeat monitoring to ensure system stays responsive
        if (this.voiceAssistant.startHeartbeat) {
            this.voiceAssistant.startHeartbeat();
        }
    }
    
    initializeWakeWordDetector() {
        this.wakeWordDetector = new WakeWordDetector();
        // Wake word detector integration handled by voice assistant
    }
    
    setupEventListeners() {
        // Action buttons
        if (this.elements.startBtn) {
            this.elements.startBtn.addEventListener('click', () => {
                this.startVoiceAssistant();
            });
        }
        
        if (this.elements.stopBtn) {
            this.elements.stopBtn.addEventListener('click', () => {
                this.stopVoiceAssistant();
            });
        }
        
        // Conversation controls
        if (this.elements.clearLogBtn) {
            this.elements.clearLogBtn.addEventListener('click', () => {
                this.clearConversationHistory();
            });
        }
        
        if (this.elements.exportLogBtn) {
            this.elements.exportLogBtn.addEventListener('click', () => {
                this.exportConversationHistory();
            });
        }
        
        // Settings
        if (this.elements.sensitivitySelect) {
            this.elements.sensitivitySelect.addEventListener('change', (e) => {
                this.updateSensitivity(e.target.value);
            });
        }
        
        // Checkbox settings
        [
            'enhancedKeywordsToggle',
            'enhancedPhrasesToggle',
            'transparentResponsesToggle',
            'biometricsToggle',
            'stressDetectionToggle', 
            'autoLanguageToggle'
        ].forEach(toggleId => {
            const element = this.elements[toggleId];
            if (element) {
                element.addEventListener('change', (e) => {
                    this.updateSetting(toggleId, e.target.checked);
                });
            }
        });
    }
    
    setupCollapsibleSections() {
        // Conversation section
        if (this.elements.conversationToggle && this.elements.conversationContent) {
            this.elements.conversationToggle.addEventListener('click', () => {
                this.toggleSection('conversation');
            });
        }
        
        // Settings section
        if (this.elements.settingsToggle && this.elements.settingsContent) {
            this.elements.settingsToggle.addEventListener('click', () => {
                this.toggleSection('settings');
            });
        }
    }
    
    setupVoiceBubbleInteraction() {
        if (this.elements.voiceBubble) {
            // Add click interaction to bubble
            this.elements.voiceBubble.addEventListener('click', () => {
                if (!this.voiceAssistant || !this.voiceAssistant.isListening) {
                    this.startVoiceAssistant();
                } else {
                    // Could add manual wake word trigger here
                    this.voiceAssistant.wakeWordDetected = true;
                    this.updateBubbleState('active');
                    this.updateStatus('Listening for command...', 'Speak your question now');
                }
            });
            
                    // Add hover effects
        this.elements.voiceBubble.addEventListener('mouseenter', () => {
            this.elements.voiceBubble.style.transform = 'scale(1.02)';
        });
        
        this.elements.voiceBubble.addEventListener('mouseleave', () => {
            this.elements.voiceBubble.style.transform = 'scale(1)';
        });
        
        // Add double-click demo mode (for showcasing)
        this.elements.voiceBubble.addEventListener('dblclick', () => {
            this.runBubbleDemo();
        });
        }
    }
    
    updateBubbleState(state) {
        if (!this.elements.voiceBubble) return;
        
        // Remove all state classes
        this.elements.voiceBubble.classList.remove('idle', 'listening', 'active', 'processing', 'speaking');
        
        // Add new state class
        this.elements.voiceBubble.classList.add(state);
        
        console.log(`🔄 Bubble state updated to: ${state}`);
    }
    
    updateStatus(primaryText, secondaryText = '') {
        if (this.elements.voiceStatus) {
            this.elements.voiceStatus.textContent = primaryText;
        }
        
        if (this.elements.voiceHint) {
            this.elements.voiceHint.textContent = secondaryText;
        }
    }
    
    updateVisualFeedback(isActive) {
        // Compatibility with old visual feedback system
        if (this.elements.visualFeedback) {
            const waveform = this.elements.visualFeedback.querySelector('.waveform');
            if (waveform) {
                if (isActive) {
                    waveform.classList.add('active');
                } else {
                    waveform.classList.remove('active');
                }
            }
        }
    }
    
    toggleSection(sectionName) {
        const toggle = this.elements[`${sectionName}Toggle`];
        const content = this.elements[`${sectionName}Content`];
        
        if (!toggle || !content) return;
        
        const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
        const newState = !isExpanded;
        
        // Update aria-expanded
        toggle.setAttribute('aria-expanded', newState.toString());
        
        // Toggle content visibility
        if (newState) {
            content.classList.remove('collapsed');
            content.classList.add('expanded');
        } else {
            content.classList.remove('expanded');
            content.classList.add('collapsed');
        }
        
        console.log(`📖 ${sectionName} section ${newState ? 'expanded' : 'collapsed'}`);
    }
    
    async startVoiceAssistant() {
        if (!this.voiceAssistant) {
            this.showError('Voice assistant not initialized');
            return;
        }
        
        try {
            // Check Whisper status for debugging
            console.log('🔍 Checking Whisper status...');
            const whisperStatus = this.voiceAssistant.checkWhisperStatus();
            console.log('🔍 Whisper Status:', whisperStatus);
            
            // First attempt to start with hybrid routing (Whisper primary, Web Speech fallback)
            let success = await this.voiceAssistant.startListeningWithHybridRouting();
            
            // If first attempt fails, try once more after a brief delay
            if (!success) {
                this.logMessage('system', 'Initializing speech recognition...');
                
                // Wait a bit and try again
                await new Promise(resolve => setTimeout(resolve, 500));
                success = await this.voiceAssistant.startListeningWithHybridRouting();
            }
            
            if (success) {
                // Update button states
                if (this.elements.startBtn) this.elements.startBtn.disabled = true;
                if (this.elements.stopBtn) this.elements.stopBtn.disabled = false;
                
                this.updateStatus('Listening continuously', 'Say "Jarvis" to start');
                
                // DISABLED: Start proactive monitoring if available
                // Proactive monitoring can interfere with microphone permissions and voice recognition
                /*
                if (this.proactiveAssistant) {
                    this.proactiveAssistant.startMonitoring();
                    this.logMessage('system', 'Proactive assistance enabled');
                }
                */
                
                this.logMessage('system', '🎤 Voice assistant active - Continuously listening for "Jarvis"');
                this.logMessage('system', '💡 The system will automatically restart listening if interrupted');
                
                // Enable continuous listening mode
                this.enableContinuousListening();
                
            } else {
                // More helpful error message instead of scary failure
                this.logMessage('system', '⚠️ Voice activation failed - This is usually due to microphone permissions');
                this.logMessage('system', '👆 Click the Start button to grant microphone access and try again');
                this.updateStatus('Click Start', 'Microphone permission needed');
            }
            
        } catch (error) {
            console.error('Failed to start voice assistant:', error);
            
            // Check if it's a permissions issue
            if (error.message && error.message.includes('Permission')) {
                this.logMessage('system', 'Microphone permission needed - Please allow microphone access and try again');
                this.updateStatus('Permission Required', 'Allow microphone access');
            } else {
                this.logMessage('system', `Voice assistant startup issue: ${error.message}`);
                this.updateStatus('Click Start', 'Manual activation required');
            }
        }
    }
    
    stopVoiceAssistant() {
        if (!this.voiceAssistant) return;
        
        // Disable continuous listening first
        this.disableContinuousListening();
        
        this.voiceAssistant.stopListening();
        
        // DISABLED: Stop proactive monitoring if available
        /*
        if (this.proactiveAssistant) {
            this.proactiveAssistant.stopMonitoring();
        }
        */
        
        // Update button states
        if (this.elements.startBtn) this.elements.startBtn.disabled = false;
        if (this.elements.stopBtn) this.elements.stopBtn.disabled = true;
        
        this.updateBubbleState('idle');
        this.updateStatus('Stopped', 'Voice assistant is inactive');
        
        this.logMessage('system', '🛑 Voice assistant stopped - Continuous listening disabled');
    }
    
    disableContinuousListening() {
        console.log('🛑 Disabling continuous listening mode...');
        
        // Mark that continuous listening is inactive
        this.continuousListeningActive = false;
        
        // Clear the monitoring interval
        if (this.listeningMonitorInterval) {
            clearInterval(this.listeningMonitorInterval);
            this.listeningMonitorInterval = null;
        }
        
        // Restore original callback if we overrode it
        if (this.voiceAssistant && this.originalOnListeningChange) {
            this.voiceAssistant.onListeningChange = this.originalOnListeningChange;
            this.originalOnListeningChange = null;
        }
    }
    
    handleResponse(response) {
        // Update bubble state back to listening
        setTimeout(() => {
            if (this.voiceAssistant && this.voiceAssistant.isListening) {
                this.updateBubbleState('listening');
                this.updateStatus('Listening for wake word...', 'Say "Jarvis" to activate');
            } else {
                this.updateBubbleState('idle');
                this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
            }
        }, 1000);
        
        // Create enhanced log message for the assistant response
        const responseText = response.response || response.answer || response.message || 'Response received';
        let logMessage = responseText;
        
        // Add confidence and latency info if available
        const details = [];
        if (response.confidence !== undefined) {
            details.push(`Confidence: ${(response.confidence * 100).toFixed(1)}%`);
        }
        if (response.latency !== undefined) {
            details.push(`Response time: ${response.latency.toFixed(2)}s`);
        }
        
        if (details.length > 0) {
            logMessage += ` (${details.join(', ')})`;
        }
        
        // Log the conversation with metadata
        this.logMessage('assistant', logMessage, {
            originalResponse: responseText,
            confidence: response.confidence,
            latency: response.latency,
            timestamp: response.timestamp,
            query: response.query,
            originalTranscript: response.originalTranscript
        });
        
        // Update response time if available
        if (response.latency && this.elements.responseTime) {
            this.elements.responseTime.textContent = `${response.latency}ms`;
        }
    }
    
    logMessage(type, message, metadata = {}) {
        if (!this.elements.logContainer) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        // Create header with timestamp and type indicator
        const header = document.createElement('div');
        header.className = 'log-entry-header';
        
        // Add type indicator (emoji/icon)
        const typeIndicator = document.createElement('span');
        typeIndicator.className = 'type-indicator';
        if (type === 'user') {
            typeIndicator.textContent = '👤 You: ';
            typeIndicator.style.color = '#4CAF50';
        } else if (type === 'assistant') {
            typeIndicator.textContent = '🤖 JARVIS: ';
            typeIndicator.style.color = '#2196F3';
        } else if (type === 'system') {
            typeIndicator.textContent = '⚙️ System: ';
            typeIndicator.style.color = '#FF9800';
        }
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        
        header.appendChild(typeIndicator);
        header.appendChild(timestamp);
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.textContent = message;
        
        // Add original transcript for user messages if available
        if (type === 'user' && metadata.originalTranscript && metadata.originalTranscript !== message) {
            const originalElement = document.createElement('div');
            originalElement.className = 'original-transcript';
            originalElement.style.fontSize = '0.9em';
            originalElement.style.color = '#666';
            originalElement.style.fontStyle = 'italic';
            originalElement.textContent = `(Original: "${metadata.originalTranscript}")`;
            messageElement.appendChild(originalElement);
        }
        
        logEntry.appendChild(header);
        logEntry.appendChild(messageElement);
        
        this.elements.logContainer.appendChild(logEntry);
        
        // Add entrance animation
        setTimeout(() => {
            logEntry.style.opacity = '1';
            logEntry.style.transform = 'translateX(0)';
        }, 10);
        
        // Auto-scroll to bottom
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;
        
        // Store in conversation history
        this.conversationHistory.push({
            type,
            message,
            timestamp: new Date().toISOString(),
            metadata
        });
        
        // Limit history to 100 entries
        if (this.conversationHistory.length > 100) {
            this.conversationHistory.shift();
        }
    }
    
    clearConversationHistory() {
        if (this.elements.logContainer) {
            // Keep only system messages
            const systemEntries = this.elements.logContainer.querySelectorAll('.log-entry.system');
            this.elements.logContainer.innerHTML = '';
            systemEntries.forEach(entry => {
                this.elements.logContainer.appendChild(entry.cloneNode(true));
            });
        }
        
        this.conversationHistory = this.conversationHistory.filter(entry => entry.type === 'system');
        console.log('💫 Conversation history cleared');
    }
    
    exportConversationHistory() {
        const data = {
            timestamp: new Date().toISOString(),
            conversation: this.conversationHistory
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-conversation-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('📤 Conversation history exported');
    }
    
    updateSensitivity(value) {
        console.log(`🎚️ Wake word sensitivity updated to: ${value}`);
        // Implementation would depend on wake word detector capabilities
    }
    
    updateSetting(settingId, value) {
        console.log(`⚙️ Setting ${settingId} updated to:`, value);
        
        switch (settingId) {
            case 'enhancedKeywordsToggle':
                // Send enhanced keywords setting to backend
                this.sendFeatureToggle('ENHANCED_KEYWORDS_ENABLED', value);
                break;
            case 'enhancedPhrasesToggle':
                // Send enhanced phrases setting to backend
                this.sendFeatureToggle('ENHANCED_PHRASES_ENABLED', value);
                break;
            case 'transparentResponsesToggle':
                // Transparent responses (always enabled, but could be toggled in future)
                this.sendFeatureToggle('TRANSPARENT_RESPONSES_ENABLED', value);
                break;
            case 'biometricsToggle':
                // Enable/disable voice biometrics
                break;
            case 'stressDetectionToggle':
                // Enable/disable stress detection
                break;
            case 'autoLanguageToggle':
                // Enable/disable auto language detection
                break;
        }
    }
    
    async sendFeatureToggle(featureName, enabled) {
        try {
            const response = await fetch('/api/features', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    feature: featureName,
                    enabled: enabled
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Feature ${featureName} ${enabled ? 'enabled' : 'disabled'}:`, data);
                
                // Show user feedback
                this.logMessage('system', `${featureName.replace('_', ' ').toLowerCase()} ${enabled ? 'enabled' : 'disabled'}`, { 
                    type: 'info' 
                });
            } else {
                console.warn(`⚠️ Failed to toggle ${featureName}:`, response.statusText);
                this.logMessage('system', `Failed to update ${featureName.replace('_', ' ').toLowerCase()}`, { 
                    type: 'warning' 
                });
            }
        } catch (error) {
            console.error(`❌ Error toggling ${featureName}:`, error);
            this.logMessage('system', `Error updating ${featureName.replace('_', ' ').toLowerCase()}`, { 
                type: 'error' 
            });
        }
    }
    
    showError(message) {
        console.error('❌ Error:', message);
        
        this.updateBubbleState('idle');
        this.updateStatus('Error', message);
        
        // Show error in conversation log
        this.logMessage('system', `Error: ${message}`, { type: 'error' });
        
        // Auto-clear error after 5 seconds
        setTimeout(() => {
            if (this.voiceAssistant && this.voiceAssistant.isListening) {
                this.updateStatus('Listening for wake word...', 'Say "Jarvis" to activate');
            } else {
                this.updateStatus('Ready to listen', 'Say "Jarvis" to start');
            }
        }, 5000);
    }
    
    runBubbleDemo() {
        console.log('🎭 Running bubble animation demo...');
        this.logMessage('system', 'Running bubble animation demo - showing all states');
        
        const states = [
            { state: 'idle', status: 'Idle State', hint: 'Ready to listen', duration: 2000 },
            { state: 'listening', status: 'Listening State', hint: 'Waiting for wake word', duration: 3000 },
            { state: 'active', status: 'Active Listening', hint: 'Wake word detected', duration: 3000 },
            { state: 'processing', status: 'Processing State', hint: 'Analyzing request', duration: 3000 },
            { state: 'speaking', status: 'Speaking State', hint: 'Providing response', duration: 3000 },
            { state: 'idle', status: 'Demo Complete', hint: 'Double-click bubble to repeat', duration: 2000 }
        ];
        
        let currentIndex = 0;
        
        const showNextState = () => {
            if (currentIndex < states.length) {
                const currentState = states[currentIndex];
                this.updateBubbleState(currentState.state);
                this.updateStatus(currentState.status, currentState.hint);
                
                currentIndex++;
                setTimeout(showNextState, currentState.duration);
            }
        };
        
        showNextState();
    }
    
    // Compatibility methods for existing systems
    updateResponseTime(latency) {
        if (this.elements.responseTime) {
            this.elements.responseTime.textContent = `${latency}ms`;
        }
    }
    
    getPerformanceMetrics() {
        return {
            conversationCount: this.conversationHistory.length,
            lastActivity: this.conversationHistory.length > 0 ? 
                this.conversationHistory[this.conversationHistory.length - 1].timestamp : null,
            isListening: this.voiceAssistant ? this.voiceAssistant.isListening : false,
            isInitialized: this.isInitialized
        };
    }
}

// Initialize the modern app when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the modern JARVIS UI
    window.modernJarvis = new ModernJarvisApp();
    
    // Maintain compatibility with existing code
    window.airportAssistant = window.modernJarvis;
    
    // Expose useful functions globally for debugging
    window.exportConversation = () => window.modernJarvis.exportConversationHistory();
    window.clearConversation = () => window.modernJarvis.clearConversationHistory();
    window.getMetrics = () => window.modernJarvis.getPerformanceMetrics();
    
    // Add some visual flair
    console.log(`
    🎯 JARVIS Modern UI Loaded
    ▶️ Voice Assistant Ready
    🎙️ Say "Jarvis" to activate
    🔵 Click the bubble to start
    `);
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.modernJarvis && window.modernJarvis.voiceAssistant) {
        // Optionally pause voice assistant when page is hidden
        console.log('🔇 Page hidden - voice assistant continues in background');
    } else if (!document.hidden && window.modernJarvis) {
        console.log('🔊 Page visible - voice assistant active');
    }
}); 