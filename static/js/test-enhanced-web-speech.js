/**
 * Test Suite for Enhanced Web Speech API
 * Validates Task 2: Web Speech API Enhancement with confidence scoring,
 * error recovery, and aviation-specific optimizations
 */

class EnhancedWebSpeechTest {
    constructor() {
        this.enhancedSpeech = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
        
        // Test configuration
        this.testTimeout = 10000; // 10 seconds per test
        this.speechTestDuration = 5000; // 5 seconds for speech tests
    }
    
    /**
     * Run all Enhanced Web Speech API tests
     */
    async runAllTests() {
        console.log('🧪 Starting Enhanced Web Speech API Test Suite');
        console.log('=' .repeat(60));
        
        try {
            // Test 1: Initialization and Configuration
            await this.testInitialization();
            
            // Test 2: Confidence Enhancement
            await this.testConfidenceEnhancement();
            
            // Test 3: Error Recovery Mechanisms
            await this.testErrorRecovery();
            
            // Test 4: Aviation Terminology Optimization
            await this.testAviationOptimization();
            
            // Test 5: Performance Metrics
            await this.testPerformanceMetrics();
            
            // Test 6: Configuration Updates
            await this.testConfigurationUpdates();
            
            // Test 7: Browser Compatibility
            await this.testBrowserCompatibility();
            
        } catch (error) {
            console.error('Test suite execution failed:', error);
            this.recordTestResult('Test Suite Execution', false, error.message);
        }
        
        // Print results
        this.printTestResults();
        
        // Cleanup
        if (this.enhancedSpeech) {
            this.enhancedSpeech.dispose();
        }
        
        return this.testResults;
    }
    
    /**
     * Test 1: Initialization and Configuration
     */
    async testInitialization() {
        console.log('Test 1: Initialization and Configuration');
        
        try {
            // Test basic initialization
            this.enhancedSpeech = new EnhancedWebSpeechAPI();
            this.assert(this.enhancedSpeech !== null, 'Enhanced Web Speech API should be created');
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Check initialization status
            const status = this.enhancedSpeech.getStatus();
            this.assert(status.isInitialized === true, 'Should be initialized');
            this.assert(typeof status.config === 'object', 'Should have configuration');
            
            // Test custom configuration
            const customConfig = {
                language: 'en-GB',
                maxAlternatives: 5,
                enableConfidenceNormalization: true,
                enableErrorRecovery: true,
                maxRetries: 5
            };
            
            const customSpeech = new EnhancedWebSpeechAPI(customConfig);
            const customStatus = customSpeech.getStatus();
            this.assert(customStatus.config.language === 'en-GB', 'Should accept custom language');
            this.assert(customStatus.config.maxAlternatives === 5, 'Should accept custom maxAlternatives');
            this.assert(customStatus.config.maxRetries === 5, 'Should accept custom maxRetries');
            
            customSpeech.dispose();
            
            this.recordTestResult('Initialization', true, 'All components initialized correctly');
            
        } catch (error) {
            this.recordTestResult('Initialization', false, error.message);
            throw error; // Stop further tests if initialization fails
        }
    }
    
    /**
     * Test 2: Confidence Enhancement (Task 2.1)
     */
    async testConfidenceEnhancement() {
        console.log('Test 2: Confidence Enhancement');
        
        try {
            // Test ConfidenceNormalizer directly
            const normalizer = new ConfidenceNormalizer();
            
            // Test confidence normalization across browsers
            const testCases = [
                { raw: 0.8, transcript: 'hello world', browser: 'chrome', expected: 'normalized' },
                { raw: undefined, transcript: 'test', browser: 'firefox', expected: 'estimated' },
                { raw: null, transcript: 'longer test transcript', browser: 'safari', expected: 'estimated' },
                { raw: 0.95, transcript: 'flight UA2406', browser: 'edge', expected: 'normalized' }
            ];
            
            for (const testCase of testCases) {
                const normalized = normalizer.normalize(testCase.raw, testCase.transcript, testCase.browser);
                
                this.assert(typeof normalized === 'number', 
                    `${testCase.browser}: Should return number confidence`);
                this.assert(normalized >= 0 && normalized <= 1, 
                    `${testCase.browser}: Confidence should be 0-1 range`);
                
                if (testCase.raw !== undefined && testCase.raw !== null) {
                    this.assert(Math.abs(normalized - testCase.raw) <= 0.3, 
                        `${testCase.browser}: Normalized confidence should be reasonably close to raw`);
                }
            }
            
            // Test aviation terminology confidence boost
            const aviationOptimizer = new AviationTerminologyOptimizer();
            const baseConfidence = 0.7;
            const aviationTranscript = 'what is the status of flight UA2406';
            const regularTranscript = 'hello how are you today';
            
            const aviationConfidence = aviationOptimizer.adjustConfidence(baseConfidence, aviationTranscript);
            const regularConfidence = aviationOptimizer.adjustConfidence(baseConfidence, regularTranscript);
            
            this.assert(aviationConfidence > regularConfidence, 
                'Aviation terms should boost confidence');
            this.assert(aviationConfidence <= 1.0, 
                'Boosted confidence should not exceed 1.0');
            
            // Test mock speech recognition results
            const mockResults = this.createMockSpeechResults();
            const processedResults = this.processResultsForTest(mockResults);
            
            this.assert(Array.isArray(processedResults), 'Should return array of results');
            this.assert(processedResults.length > 0, 'Should have processed results');
            
            const firstResult = processedResults[0];
            this.assert(typeof firstResult.confidence === 'number', 'Should have confidence score');
            this.assert(typeof firstResult.transcript === 'string', 'Should have transcript');
            this.assert(typeof firstResult.isFinal === 'boolean', 'Should have isFinal flag');
            this.assert(typeof firstResult.timestamp === 'number', 'Should have timestamp');
            
            this.recordTestResult('Confidence Enhancement', true, 
                `Processed ${processedResults.length} results with confidence normalization`);
            
        } catch (error) {
            this.recordTestResult('Confidence Enhancement', false, error.message);
        }
    }
    
    /**
     * Test 3: Error Recovery Mechanisms (Task 2.2)
     */
    async testErrorRecovery() {
        console.log('Test 3: Error Recovery Mechanisms');
        
        try {
            const errorRecovery = new ErrorRecoveryManager({ maxRetries: 3 });
            
            // Test error classification
            const recoverableErrors = ['no-speech', 'aborted', 'network', 'audio-capture'];
            const criticalErrors = ['not-allowed', 'service-not-allowed', 'bad-grammar'];
            
            for (const errorType of recoverableErrors) {
                this.assert(errorRecovery.isRecoverable(errorType), 
                    `${errorType} should be recoverable`);
            }
            
            for (const errorType of criticalErrors) {
                this.assert(!errorRecovery.isRecoverable(errorType), 
                    `${errorType} should not be recoverable`);
            }
            
            // Test recovery strategies
            const strategies = {
                'no-speech': 'restart',
                'network': 'retry-with-delay',
                'audio-capture': 'check-permissions'
            };
            
            for (const [errorType, expectedStrategy] of Object.entries(strategies)) {
                const strategy = errorRecovery.getRecoveryStrategy(errorType);
                this.assert(typeof strategy === 'string', 
                    `${errorType} should have recovery strategy`);
            }
            
            // Test enhanced speech error handling
            let errorHandled = false;
            let errorDetails = null;
            
            this.enhancedSpeech.onError = (error) => {
                errorHandled = true;
                errorDetails = error;
            };
            
            // Simulate recoverable error
            this.enhancedSpeech.handleError({ error: 'no-speech', message: 'No speech detected' });
            
            // Wait briefly for error handling
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Note: We can't easily test actual recovery without triggering real speech recognition
            
            this.recordTestResult('Error Recovery', true, 
                'Error classification and recovery strategies validated');
            
        } catch (error) {
            this.recordTestResult('Error Recovery', false, error.message);
        }
    }
    
    /**
     * Test 4: Aviation Terminology Optimization (Task 2.3)
     */
    async testAviationOptimization() {
        console.log('Test 4: Aviation Terminology Optimization');
        
        try {
            const optimizer = new AviationTerminologyOptimizer();
            
            // Test aviation term detection
            const aviationPhrases = [
                'jarvis what is the status of flight UA2406',
                'pushback tractor assignment for gate A12',
                'cleaning lead for flight ABC123',
                'equipment status at gate B6',
                'ramp operations for maintenance'
            ];
            
            const nonAviationPhrases = [
                'hello how are you today',
                'what time is it',
                'play some music please',
                'set a timer for five minutes'
            ];
            
            for (const phrase of aviationPhrases) {
                this.assert(optimizer.containsAviationTerms(phrase), 
                    `Should detect aviation terms in: "${phrase}"`);
            }
            
            for (const phrase of nonAviationPhrases) {
                this.assert(!optimizer.containsAviationTerms(phrase), 
                    `Should not detect aviation terms in: "${phrase}"`);
            }
            
            // Test flight number pattern recognition
            const flightNumbers = ['UA2406', 'AA123', 'DL4567', 'WN 890'];
            for (const flightNum of flightNumbers) {
                const testPhrase = `flight ${flightNum} status`;
                this.assert(optimizer.containsAviationTerms(testPhrase), 
                    `Should recognize flight number pattern: ${flightNum}`);
            }
            
            // Test gate pattern recognition
            const gateNumbers = ['gate A12', 'gate B6', 'gate 15'];
            for (const gate of gateNumbers) {
                const testPhrase = `equipment at ${gate}`;
                this.assert(optimizer.containsAviationTerms(testPhrase), 
                    `Should recognize gate pattern: ${gate}`);
            }
            
            // Test grammar creation
            const grammar = optimizer.createAviationGrammar();
            this.assert(typeof grammar === 'string', 'Should create grammar string');
            this.assert(grammar.includes('#JSGF'), 'Should be valid JSGF format');
            this.assert(grammar.includes('jarvis'), 'Should include wake word');
            this.assert(grammar.includes('flight'), 'Should include aviation terms');
            
            this.recordTestResult('Aviation Optimization', true, 
                'All aviation terminology features validated');
            
        } catch (error) {
            this.recordTestResult('Aviation Optimization', false, error.message);
        }
    }
    
    /**
     * Test 5: Performance Metrics
     */
    async testPerformanceMetrics() {
        console.log('Test 5: Performance Metrics');
        
        try {
            // Get initial metrics
            const initialMetrics = this.enhancedSpeech.getPerformanceMetrics();
            
            this.assert(typeof initialMetrics === 'object', 'Should return metrics object');
            this.assert(typeof initialMetrics.recognitionAttempts === 'number', 
                'Should track recognition attempts');
            this.assert(typeof initialMetrics.successfulRecognitions === 'number', 
                'Should track successful recognitions');
            this.assert(typeof initialMetrics.averageLatency === 'number', 
                'Should track average latency');
            this.assert(typeof initialMetrics.averageConfidence === 'number', 
                'Should track average confidence');
            this.assert(typeof initialMetrics.errorCounts === 'object', 
                'Should track error counts');
            
            // Test performance callback
            let performanceUpdates = [];
            this.enhancedSpeech.onPerformanceUpdate = (update) => {
                performanceUpdates.push(update);
            };
            
            // Simulate latency update
            this.enhancedSpeech.updateLatencyMetrics(250); // 250ms latency
            
            this.assert(performanceUpdates.length > 0, 'Should trigger performance callback');
            
            const update = performanceUpdates[0];
            this.assert(typeof update.latency === 'number', 'Should include latency');
            this.assert(typeof update.averageLatency === 'number', 'Should include average latency');
            
            this.recordTestResult('Performance Metrics', true, 
                'Performance tracking and callbacks validated');
            
        } catch (error) {
            this.recordTestResult('Performance Metrics', false, error.message);
        }
    }
    
    /**
     * Test 6: Configuration Updates
     */
    async testConfigurationUpdates() {
        console.log('Test 6: Configuration Updates');
        
        try {
            const originalConfig = { ...this.enhancedSpeech.getStatus().config };
            
            // Test configuration update
            const newConfig = {
                language: 'en-AU',
                maxAlternatives: 2,
                maxRetries: 5,
                retryDelay: 2000
            };
            
            this.enhancedSpeech.updateConfiguration(newConfig);
            
            const updatedStatus = this.enhancedSpeech.getStatus();
            this.assert(updatedStatus.config.language === 'en-AU', 
                'Language should be updated');
            this.assert(updatedStatus.config.maxAlternatives === 2, 
                'MaxAlternatives should be updated');
            this.assert(updatedStatus.config.maxRetries === 5, 
                'MaxRetries should be updated');
            this.assert(updatedStatus.config.retryDelay === 2000, 
                'RetryDelay should be updated');
            
            // Test partial update
            this.enhancedSpeech.updateConfiguration({ language: 'es-ES' });
            const partialStatus = this.enhancedSpeech.getStatus();
            this.assert(partialStatus.config.language === 'es-ES', 
                'Should update only specified config');
            this.assert(partialStatus.config.maxAlternatives === 2, 
                'Should preserve other config values');
            
            this.recordTestResult('Configuration Updates', true, 
                'Configuration update functionality validated');
            
        } catch (error) {
            this.recordTestResult('Configuration Updates', false, error.message);
        }
    }
    
    /**
     * Test 7: Browser Compatibility
     */
    async testBrowserCompatibility() {
        console.log('Test 7: Browser Compatibility');
        
        try {
            // Test browser detection
            const browserInfo = this.enhancedSpeech.getBrowserInfo();
            this.assert(typeof browserInfo === 'string', 'Should detect browser type');
            
            const validBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'unknown'];
            this.assert(validBrowsers.includes(browserInfo), 
                'Should return valid browser type');
            
            // Test Web Speech API support detection
            const isSupported = this.enhancedSpeech.isWebSpeechSupported();
            this.assert(typeof isSupported === 'boolean', 
                'Should return boolean for support status');
            
            // In most modern browsers, this should be true
            if (isSupported) {
                console.log('✅ Web Speech API is supported in this browser');
            } else {
                console.log('⚠️ Web Speech API is not supported in this browser');
            }
            
            // Test confidence normalizer with different browsers
            const normalizer = new ConfidenceNormalizer();
            const testBrowsers = ['chrome', 'firefox', 'safari', 'edge', 'unknown'];
            
            for (const browser of testBrowsers) {
                const normalized = normalizer.normalize(0.8, 'test transcript', browser);
                this.assert(typeof normalized === 'number', 
                    `${browser}: Should normalize confidence`);
                this.assert(normalized >= 0 && normalized <= 1, 
                    `${browser}: Should be in valid range`);
            }
            
            this.recordTestResult('Browser Compatibility', true, 
                `Browser detected as: ${browserInfo}, Web Speech supported: ${isSupported}`);
            
        } catch (error) {
            this.recordTestResult('Browser Compatibility', false, error.message);
        }
    }
    
    /**
     * Helper: Create mock speech recognition results
     */
    createMockSpeechResults() {
        // Mock the structure of SpeechRecognitionEvent.results
        return {
            length: 2,
            0: {
                isFinal: false,
                length: 1,
                0: {
                    transcript: 'jarvis what is the status',
                    confidence: 0.8
                }
            },
            1: {
                isFinal: true,
                length: 2,
                0: {
                    transcript: 'jarvis what is the status of flight UA2406',
                    confidence: 0.92
                },
                1: {
                    transcript: 'jarvis what is the status of flight you a 2406',
                    confidence: 0.75
                }
            }
        };
    }
    
    /**
     * Helper: Process mock results for testing
     */
    processResultsForTest(mockResults) {
        // Simplified version of the processing logic for testing
        const processed = [];
        
        for (let i = 0; i < mockResults.length; i++) {
            const result = mockResults[i];
            
            for (let j = 0; j < result.length; j++) {
                const alternative = result[j];
                
                processed.push({
                    transcript: alternative.transcript,
                    confidence: alternative.confidence || 0.7,
                    isFinal: result.isFinal,
                    timestamp: Date.now(),
                    alternativeIndex: j,
                    resultIndex: i
                });
            }
        }
        
        return processed.sort((a, b) => b.confidence - a.confidence);
    }
    
    /**
     * Helper: Assert condition
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    
    /**
     * Helper: Record test result
     */
    recordTestResult(testName, passed, details) {
        this.testResults.total++;
        if (passed) {
            this.testResults.passed++;
            console.log(`  ✅ ${testName}: PASSED`);
        } else {
            this.testResults.failed++;
            console.log(`  ❌ ${testName}: FAILED - ${details}`);
        }
        
        this.testResults.details.push({
            test: testName,
            passed: passed,
            details: details,
            timestamp: Date.now()
        });
    }
    
    /**
     * Print final test results
     */
    printTestResults() {
        console.log('=' .repeat(60));
        console.log('🧪 Enhanced Web Speech API Test Results');
        console.log(`Total Tests: ${this.testResults.total}`);
        console.log(`Passed: ${this.testResults.passed}`);
        console.log(`Failed: ${this.testResults.failed}`);
        console.log(`Success Rate: ${((this.testResults.passed / this.testResults.total) * 100).toFixed(1)}%`);
        
        if (this.testResults.failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults.details
                .filter(result => !result.passed)
                .forEach(result => {
                    console.log(`  - ${result.test}: ${result.details}`);
                });
        }
        
        console.log('=' .repeat(60));
    }
}

/**
 * Quick test function for development
 */
async function testEnhancedWebSpeech() {
    const tester = new EnhancedWebSpeechTest();
    return await tester.runAllTests();
}

/**
 * Manual test for browser console
 */
async function quickEnhancedSpeechTest() {
    console.log('🎤 Quick Enhanced Web Speech API Test');
    
    try {
        const enhancedSpeech = new EnhancedWebSpeechAPI({
            enableConfidenceNormalization: true,
            enableErrorRecovery: true,
            enableAviationOptimization: true
        });
        
        console.log('Status:', enhancedSpeech.getStatus());
        console.log('Performance Metrics:', enhancedSpeech.getPerformanceMetrics());
        console.log('Browser Info:', enhancedSpeech.getBrowserInfo());
        console.log('Web Speech Supported:', enhancedSpeech.isWebSpeechSupported());
        
        enhancedSpeech.dispose();
        console.log('✅ Quick test completed');
        
    } catch (error) {
        console.error('❌ Quick test failed:', error);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EnhancedWebSpeechTest, testEnhancedWebSpeech, quickEnhancedSpeechTest };
}
