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
        
        // Auto-start voice assistant for continuous listening
        setTimeout(() => {
            this.startVoiceAssistant();
        }, 1000); // Wait 1 second for everything to fully initialize
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
    
    initializeVoiceAssistant() {
        this.voiceAssistant = new VoiceAssistant();
        
        // Set up callbacks for the new UI
        this.voiceAssistant.onStatusChange = (status) => {
            this.updateStatus(status);
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
            const success = await this.voiceAssistant.startListening();
            
            if (success) {
                // Update button states
                if (this.elements.startBtn) this.elements.startBtn.disabled = true;
                if (this.elements.stopBtn) this.elements.stopBtn.disabled = false;
                
                this.updateStatus('Starting...', 'Initializing voice recognition');
                
                // Start proactive monitoring if available
                if (this.proactiveAssistant) {
                    this.proactiveAssistant.startMonitoring();
                    this.logMessage('system', 'Proactive assistance enabled');
                }
                
                this.logMessage('system', 'Voice assistant started - Continuously listening for "Jarvis"');
            } else {
                this.showError('Failed to start voice recognition');
            }
            
        } catch (error) {
            console.error('Failed to start voice assistant:', error);
            this.showError('Failed to start voice assistant: ' + error.message);
        }
    }
    
    stopVoiceAssistant() {
        if (!this.voiceAssistant) return;
        
        this.voiceAssistant.stopListening();
        
        // Stop proactive monitoring if available
        if (this.proactiveAssistant) {
            this.proactiveAssistant.stopMonitoring();
        }
        
        // Update button states
        if (this.elements.startBtn) this.elements.startBtn.disabled = false;
        if (this.elements.stopBtn) this.elements.stopBtn.disabled = true;
        
        this.updateBubbleState('idle');
        this.updateStatus('Stopped', 'Voice assistant is inactive');
        
        this.logMessage('system', 'Voice assistant stopped');
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
        
        // Log the conversation
        this.logMessage('assistant', response.answer || response.message || 'Response received');
        
        // Update response time if available
        if (response.latency && this.elements.responseTime) {
            this.elements.responseTime.textContent = `${response.latency}ms`;
        }
    }
    
    logMessage(type, message, metadata = {}) {
        if (!this.elements.logContainer) return;
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        // Create header with timestamp
        const header = document.createElement('div');
        header.className = 'log-entry-header';
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        
        header.appendChild(timestamp);
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = 'message';
        messageElement.textContent = message;
        
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