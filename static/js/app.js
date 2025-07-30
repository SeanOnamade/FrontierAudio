// Main Application Controller for Airport Operations Voice Assistant
class AirportAssistantApp {
    constructor() {
        this.voiceAssistant = null;
        this.wakeWordDetector = null;
        this.isInitialized = false;
        this.conversationHistory = [];
        this.proactiveAssistant = null;
        
        // DOM elements
        this.elements = {
            status: document.getElementById('status'),
            listeningStatus: document.getElementById('listening-status'),
            responseTime: document.getElementById('response-time'),
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            testBtn: document.getElementById('test-btn'),
            visualFeedback: document.getElementById('visual-feedback'),
            logContainer: document.getElementById('log-container'),
            testQueryBtns: document.querySelectorAll('.test-query-btn')
        };
        
        this.init();
    }
    
    async init() {
        console.log('Initializing Airport Voice Assistant...');
        
        // Check browser support
        if (!this.checkBrowserSupport()) {
            this.showError('Your browser does not support the required features for voice interaction.');
            return;
        }
        
        // Initialize components
        this.initializeVoiceAssistant();
        this.initializeWakeWordDetector();
        this.setupEventListeners();
        
        // Update status
        this.updateStatus('Ready - Starting voice assistant automatically...');
        this.isInitialized = true;
        
        console.log('Voice Assistant initialized successfully');
        
        // Test backend connection
        await this.testBackendConnection();
        
        // Auto-start voice assistant for continuous listening
        setTimeout(() => {
            this.startVoiceAssistant();
        }, 1000); // Wait 1 second for everything to fully initialize
    }
    
    checkBrowserSupport() {
        const hasWebSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
        const hasSpeechSynthesis = 'speechSynthesis' in window;
        
        if (!hasWebSpeech) {
            this.logMessage('error', 'Speech recognition not supported');
        }
        if (!hasSpeechSynthesis) {
            this.logMessage('error', 'Speech synthesis not supported');
        }
        
        return hasWebSpeech && hasSpeechSynthesis;
    }
    
    initializeVoiceAssistant() {
        this.voiceAssistant = new VoiceAssistant();
        
        // Set up callbacks
        this.voiceAssistant.onStatusChange = (status) => {
            this.updateStatus(status);
        };
        
        this.voiceAssistant.onListeningChange = (isListening) => {
            this.updateListeningStatus(isListening);
            this.updateVisualFeedback(isListening);
        };
        
        this.voiceAssistant.onTranscriptReceived = (transcript, isFinal) => {
            // Log interim results for debugging
            if (!isFinal) {
                console.log('Interim transcript:', transcript);
            }
        };
        
        this.voiceAssistant.onResponseReceived = (response) => {
            this.handleResponse(response);
        };
        
        this.voiceAssistant.onError = (error) => {
            this.showError(error);
        };
        
        // Set up proactive assistant reference
        this.proactiveAssistant = this.voiceAssistant.proactiveAssistant;
    }
    
    initializeWakeWordDetector() {
        this.wakeWordDetector = new WakeWordDetector();
        
        this.wakeWordDetector.onWakeWordDetected = (result) => {
            console.log('Wake word detected with confidence:', result.confidence);
            this.logMessage('system', `Wake word "${result.word}" detected (confidence: ${result.confidence.toFixed(2)})`);
        };
    }
    
    setupEventListeners() {
        // Control buttons
        this.elements.startBtn.addEventListener('click', () => {
            this.startVoiceAssistant();
        });
        
        this.elements.stopBtn.addEventListener('click', () => {
            this.stopVoiceAssistant();
        });
        
        this.elements.testBtn.addEventListener('click', () => {
            this.toggleTestMode();
        });
        
        // Test query buttons
        this.elements.testQueryBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const query = btn.getAttribute('data-query');
                this.runTestQuery(query);
            });
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        this.startVoiceAssistant();
                        break;
                    case 'x':
                        e.preventDefault();
                        this.stopVoiceAssistant();
                        break;
                    case 't':
                        e.preventDefault();
                        this.toggleTestMode();
                        break;
                }
            }
        });
        
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.voiceAssistant?.isListening) {
                console.log('Page hidden, maintaining voice assistant');
            }
        });
    }
    
    async testBackendConnection() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            if (data.status === 'healthy') {
                this.logMessage('system', `Backend connected - ${data.tables_found} database tables found`);
            } else {
                this.logMessage('error', 'Backend connection failed');
            }
        } catch (error) {
            this.logMessage('error', 'Could not connect to backend API');
            console.error('Backend connection error:', error);
        }
    }
    
    startVoiceAssistant() {
        if (!this.isInitialized) {
            this.showError('Assistant not yet initialized');
            return;
        }
        
        if (this.voiceAssistant.startListening()) {
            this.elements.startBtn.disabled = true;
            this.elements.stopBtn.disabled = false;
            this.logMessage('system', 'Voice assistant started - Continuously listening for "Jarvis"');
            
            // Start proactive monitoring
            if (this.proactiveAssistant) {
                this.proactiveAssistant.startMonitoring();
                this.logMessage('system', 'Proactive assistance enabled');
            }
        }
    }
    
    stopVoiceAssistant() {
        this.voiceAssistant.stopListening();
        this.elements.startBtn.disabled = false;
        this.elements.stopBtn.disabled = true;
        this.updateVisualFeedback(false);
        this.logMessage('system', 'Voice assistant stopped');
        
        // Stop proactive monitoring
        if (this.proactiveAssistant) {
            this.proactiveAssistant.stopMonitoring();
            this.logMessage('system', 'Proactive assistance disabled');
        }
    }
    
    toggleTestMode() {
        // Simple test mode - just run a health check
        this.runTestQuery('What is the status of flight UA2406?');
    }
    
    async runTestQuery(query) {
        if (!query) return;
        
        this.logMessage('user', query);
        this.updateStatus('Processing test query...');
        
        try {
            const response = await this.voiceAssistant.testQuery(query);
            this.handleResponse({
                query: query,
                response: response.response,
                confidence: response.confidence || 0,
                latency: response.latency || 0,
                timestamp: new Date().toLocaleTimeString()
            });
        } catch (error) {
            this.showError(`Test query failed: ${error.message}`);
            this.logMessage('error', `Test query failed: ${error.message}`);
        }
    }
    
    // Voice recognition testing and debugging
    testVoiceNormalization() {
        const testCases = [
            "what is the status of U A 2 4 0 6",
            "hey jarvis what is the status of U.A. 2406",
            "jarvis tell me about you a 2406",
            "what pushback tractor is assigned to U A 2 4 0 6"
        ];
        
        console.log('=== Testing Voice Normalization ===');
        testCases.forEach(testCase => {
            if (this.voiceAssistant && this.voiceAssistant.normalizeVoiceInput) {
                const normalized = this.voiceAssistant.normalizeVoiceInput(testCase);
                console.log(`"${testCase}" → "${normalized}"`);
                this.logMessage('system', `Voice normalization test: "${testCase}" → "${normalized}"`);
            }
        });
    }
    
    handleResponse(responseData) {
        const { query, response, confidence, latency, timestamp } = responseData;
        
        // Add to conversation history
        this.conversationHistory.push({
            type: 'user',
            message: query,
            timestamp: timestamp
        });
        
        this.conversationHistory.push({
            type: 'assistant',
            message: response,
            confidence: confidence,
            timestamp: timestamp
        });
        
        // Update UI
        this.logMessage('user', query);
        this.logMessage('assistant', response, { confidence, latency });
        this.updateResponseTime(latency);
        
        // Keep conversation history manageable
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }
    }
    
    updateStatus(status) {
        this.elements.status.textContent = status;
        this.elements.status.className = 'status-value';
        
        // Add color coding based on status
        if (status.includes('Error') || status.includes('error')) {
            this.elements.status.style.color = '#f44336';
        } else if (status.includes('Processing') || status.includes('Speaking')) {
            this.elements.status.style.color = '#FF9800';
        } else if (status.includes('Ready') || status.includes('Listening')) {
            this.elements.status.style.color = '#4CAF50';
        } else {
            this.elements.status.style.color = '#4CAF50';
        }
    }
    
    updateListeningStatus(isListening) {
        this.elements.listeningStatus.textContent = isListening ? 'Yes' : 'No';
        this.elements.listeningStatus.style.color = isListening ? '#4CAF50' : '#757575';
    }
    
    updateResponseTime(latency) {
        if (latency && typeof latency === 'number') {
            this.elements.responseTime.textContent = `${latency.toFixed(2)}s`;
            
            // Color code based on performance target (<3s)
            if (latency < 2) {
                this.elements.responseTime.style.color = '#4CAF50'; // Green
            } else if (latency < 3) {
                this.elements.responseTime.style.color = '#FF9800'; // Orange
            } else {
                this.elements.responseTime.style.color = '#f44336'; // Red
            }
        }
    }
    
    updateVisualFeedback(isActive) {
        const waveform = this.elements.visualFeedback.querySelector('.waveform');
        if (isActive) {
            waveform.classList.add('active');
        } else {
            waveform.classList.remove('active');
        }
    }
    
    logMessage(type, message, metadata = {}) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        
        const timestamp = document.createElement('span');
        timestamp.className = 'timestamp';
        timestamp.textContent = new Date().toLocaleTimeString();
        
        const messageElement = document.createElement('span');
        messageElement.className = 'message';
        messageElement.textContent = message;
        
        // Add metadata if available
        if (metadata.confidence !== undefined) {
            const confidenceSpan = document.createElement('small');
            confidenceSpan.style.opacity = '0.7';
            confidenceSpan.textContent = ` (confidence: ${(metadata.confidence * 100).toFixed(0)}%)`;
            messageElement.appendChild(confidenceSpan);
        }
        
        if (metadata.latency !== undefined) {
            const latencySpan = document.createElement('small');
            latencySpan.style.opacity = '0.7';
            latencySpan.textContent = ` [${metadata.latency.toFixed(2)}s]`;
            messageElement.appendChild(latencySpan);
        }
        
        logEntry.appendChild(timestamp);
        logEntry.appendChild(messageElement);
        
        this.elements.logContainer.appendChild(logEntry);
        
        // Auto-scroll to bottom
        this.elements.logContainer.scrollTop = this.elements.logContainer.scrollHeight;
        
        // Remove old entries if too many
        const entries = this.elements.logContainer.querySelectorAll('.log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
    }
    
    showError(error) {
        console.error('Application error:', error);
        this.logMessage('error', error);
        this.updateStatus(`Error: ${error}`);
    }
    
    // Utility methods
    exportConversationHistory() {
        const data = {
            timestamp: new Date().toISOString(),
            conversation: this.conversationHistory
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    clearConversationHistory() {
        this.conversationHistory = [];
        this.elements.logContainer.innerHTML = '<div class="log-entry system"><span class="timestamp">System</span><span class="message">Voice assistant ready. Continuously listening for "Jarvis" wake word.</span></div>';
    }
    
    getPerformanceMetrics() {
        const responses = this.conversationHistory.filter(item => item.type === 'assistant');
        
        if (responses.length === 0) {
            return { avgLatency: 0, avgConfidence: 0, totalQueries: 0 };
        }
        
        const latencies = responses.map(r => r.latency || 0).filter(l => l > 0);
        const confidences = responses.map(r => r.confidence || 0);
        
        return {
            avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
            avgConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
            totalQueries: responses.length,
            under3sCount: latencies.filter(l => l < 3).length,
            successRate: latencies.filter(l => l < 3).length / latencies.length
        };
    }
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.airportAssistant = new AirportAssistantApp();
    
    // Expose useful functions globally for debugging
    window.exportConversation = () => window.airportAssistant.exportConversationHistory();
    window.clearConversation = () => window.airportAssistant.clearConversationHistory();
    window.getMetrics = () => window.airportAssistant.getPerformanceMetrics();
    window.testVoiceNormalization = () => window.airportAssistant.testVoiceNormalization();
    window.testTranscriptionImprovement = (text) => {
        return fetch('/api/improve-transcription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: text, context: 'airport operations' })
        }).then(r => r.json()).then(result => {
            console.log('Transcription improvement:', result);
            return result;
        });
    };
    
    console.log('Airport Operations Voice Assistant loaded successfully');
    console.log('Available commands: exportConversation(), clearConversation(), getMetrics(), testVoiceNormalization(), testTranscriptionImprovement(text)');
}); 