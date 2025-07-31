/**
 * Test Suite for Whisper API Client
 * Validates Task 3: Whisper AI Integration with cost control,
 * rate limiting, and audio segmentation
 */

class WhisperAPITest {
    constructor() {
        this.whisperClient = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
        
        // Test configuration
        this.testTimeout = 15000; // 15 seconds per test
        this.mockAPIKey = 'test_api_key_12345'; // Mock API key for testing
    }
    
    /**
     * Run all Whisper API Client tests
     */
    async runAllTests() {
        console.log('🧪 Starting Whisper API Client Test Suite');
        console.log('=' .repeat(60));
        
        try {
            // Test 1: Initialization and Configuration
            await this.testInitialization();
            
            // Test 2: Audio Format Conversion
            await this.testAudioFormatConversion();
            
            // Test 3: Cost Control System
            await this.testCostControl();
            
            // Test 4: Rate Limiting
            await this.testRateLimiting();
            
            // Test 5: Audio Segmentation
            await this.testAudioSegmentation();
            
            // Test 6: Error Handling
            await this.testErrorHandling();
            
            // Test 7: Performance Metrics
            await this.testPerformanceMetrics();
            
        } catch (error) {
            console.error('Test suite execution failed:', error);
            this.recordTestResult('Test Suite Execution', false, error.message);
        }
        
        // Print results
        this.printTestResults();
        
        // Cleanup
        if (this.whisperClient) {
            this.whisperClient.dispose();
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
            this.whisperClient = new WhisperAPIClient({
                apiKey: this.mockAPIKey,
                timeout: 5000,
                maxRetries: 2
            });
            
            this.assert(this.whisperClient !== null, 'Whisper client should be created');
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check initialization status
            const status = this.whisperClient.getStatus();
            this.assert(status.isInitialized === true, 'Should be initialized');
            this.assert(status.hasAPIKey === true, 'Should have API key');
            this.assert(typeof status.metrics === 'object', 'Should have metrics');
            
            // Test configuration update
            this.whisperClient.updateConfiguration({
                model: 'whisper-1',
                language: 'es',
                temperature: 0.2
            });
            
            const updatedStatus = this.whisperClient.getStatus();
            this.assert(updatedStatus.isInitialized === true, 'Should remain initialized after config update');
            
            // Test custom configuration
            const customClient = new WhisperAPIClient({
                targetSampleRate: 24000,
                maxFileSize: 50 * 1024 * 1024,
                responseFormat: 'json'
            });
            
            this.assert(customClient.config.targetSampleRate === 24000, 'Should accept custom sample rate');
            this.assert(customClient.config.maxFileSize === 50 * 1024 * 1024, 'Should accept custom file size');
            this.assert(customClient.config.responseFormat === 'json', 'Should accept custom response format');
            
            customClient.dispose();
            
            this.recordTestResult('Initialization', true, 'Client initialized with custom configuration');
            
        } catch (error) {
            this.recordTestResult('Initialization', false, error.message);
            throw error; // Stop further tests if initialization fails
        }
    }
    
    /**
     * Test 2: Audio Format Conversion (Task 3.1)
     */
    async testAudioFormatConversion() {
        console.log('Test 2: Audio Format Conversion');
        
        try {
            // Test AudioBuffer conversion
            const mockAudioBuffer = this.createMockAudioBuffer();
            const convertedWav = await this.whisperClient.convertAudioBufferToWav(mockAudioBuffer);
            
            this.assert(convertedWav instanceof Blob, 'Should return Blob');
            this.assert(convertedWav.type === 'audio/wav', 'Should be WAV format');
            this.assert(convertedWav.size > 44, 'Should have WAV header and data');
            
            // Test resampling
            const highSampleRateBuffer = this.createMockAudioBuffer(44100);
            const resampledBuffer = await this.whisperClient.resampleAudioBuffer(
                highSampleRateBuffer, 
                16000
            );
            
            this.assert(resampledBuffer.sampleRate === 16000, 'Should resample to target rate');
            
            // Test mono conversion
            const stereoBuffer = this.createMockStereoAudioBuffer();
            const monoBuffer = this.whisperClient.convertToMono(stereoBuffer);
            
            this.assert(monoBuffer.numberOfChannels === 1, 'Should convert to mono');
            
            // Test file size validation
            const largeBuffer = this.createMockAudioBuffer(16000, 60); // 60 seconds
            try {
                await this.whisperClient.convertAudioBufferToWav(largeBuffer);
                this.assert(false, 'Should reject large files');
            } catch (error) {
                this.assert(error.message.includes('too large'), 'Should detect large files');
            }
            
            this.recordTestResult('Audio Format Conversion', true, 
                'All audio conversion functions working correctly');
            
        } catch (error) {
            this.recordTestResult('Audio Format Conversion', false, error.message);
        }
    }
    
    /**
     * Test 3: Cost Control System (Task 3.2)
     */
    async testCostControl() {
        console.log('Test 3: Cost Control System');
        
        try {
            const costController = new WhisperCostController({
                dailyCostLimit: 5.0,
                monthlyCostLimit: 50.0,
                requestCostLimit: 1.0
            });
            
            // Test cost estimation
            const mockAudioBuffer = this.createMockAudioBuffer(16000, 30); // 30 seconds
            const estimatedCost = costController.estimateRequestCost(mockAudioBuffer);
            
            this.assert(typeof estimatedCost === 'number', 'Should return numeric cost');
            this.assert(estimatedCost > 0, 'Cost should be positive');
            this.assert(estimatedCost < 1.0, '30 seconds should cost less than $1');
            
            // Test cost limit checking
            costController.checkCostLimit(estimatedCost); // Should pass
            
            try {
                costController.checkCostLimit(2.0); // Should fail
                this.assert(false, 'Should reject requests exceeding limit');
            } catch (error) {
                this.assert(error.message.includes('Request cost'), 'Should detect cost limit exceeded');
            }
            
            // Test cost recording
            costController.recordCost(0.5);
            const status = costController.getStatus();
            
            this.assert(status.costs.daily === 0.5, 'Should record daily cost');
            this.assert(status.costs.total === 0.5, 'Should record total cost');
            this.assert(status.remaining.daily === 4.5, 'Should calculate remaining budget');
            
            // Test percentage calculations
            this.assert(status.percentageUsed.daily === 10, 'Should calculate percentage used');
            
            // Test cost reset logic (simulate next day)
            const nextDayController = new WhisperCostController();
            nextDayController.resetDate.daily = '2024-01-01'; // Simulate old date
            nextDayController.costs.daily = 10.0;
            
            nextDayController.resetCostsIfNeeded();
            this.assert(nextDayController.costs.daily === 0, 'Should reset daily costs on new day');
            
            this.recordTestResult('Cost Control', true, 
                'Cost estimation, limiting, and tracking working correctly');
            
        } catch (error) {
            this.recordTestResult('Cost Control', false, error.message);
        }
    }
    
    /**
     * Test 4: Rate Limiting (Task 3.2)
     */
    async testRateLimiting() {
        console.log('Test 4: Rate Limiting');
        
        try {
            const rateLimiter = new WhisperRateLimiter({
                requestsPerMinute: 3,
                requestsPerHour: 10,
                concurrentRequests: 2
            });
            
            // Test initial status
            let status = rateLimiter.getStatus();
            this.assert(status.activeRequests === 0, 'Should start with no active requests');
            this.assert(status.requestsThisMinute === 0, 'Should start with no requests this minute');
            
            // Test request allowance
            await rateLimiter.checkAndWait(); // Request 1
            await rateLimiter.checkAndWait(); // Request 2
            await rateLimiter.checkAndWait(); // Request 3
            
            status = rateLimiter.getStatus();
            this.assert(status.requestsThisMinute === 3, 'Should track requests this minute');
            this.assert(status.activeRequests === 3, 'Should track active requests');
            
            // Test rate limit enforcement
            const startTime = Date.now();
            try {
                await Promise.race([
                    rateLimiter.checkAndWait(), // Request 4 - should be rate limited
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('timeout')), 1000)
                    )
                ]);
                this.assert(false, 'Should be rate limited');
            } catch (error) {
                this.assert(error.message === 'timeout', 'Should wait for rate limit');
            }
            
            // Test request completion
            rateLimiter.recordSuccess();
            rateLimiter.recordSuccess();
            rateLimiter.recordSuccess();
            
            status = rateLimiter.getStatus();
            this.assert(status.activeRequests === 0, 'Should release request slots');
            
            // Test circuit breaker
            for (let i = 0; i < 5; i++) {
                rateLimiter.recordFailure();
            }
            
            status = rateLimiter.getStatus();
            this.assert(status.circuitBreaker.isOpen === true, 'Should open circuit breaker');
            
            try {
                await rateLimiter.checkAndWait();
                this.assert(false, 'Should reject requests when circuit breaker is open');
            } catch (error) {
                this.assert(error.message.includes('Circuit breaker'), 'Should indicate circuit breaker');
            }
            
            this.recordTestResult('Rate Limiting', true, 
                'Rate limiting, concurrent requests, and circuit breaker working correctly');
            
        } catch (error) {
            this.recordTestResult('Rate Limiting', false, error.message);
        }
    }
    
    /**
     * Test 5: Audio Segmentation (Task 3.3)
     */
    async testAudioSegmentation() {
        console.log('Test 5: Audio Segmentation');
        
        try {
            const audioSegmenter = new AudioSegmenter({
                maxSegmentDuration: 5, // 5 seconds for testing
                minSegmentDuration: 1,
                overlapDuration: 0.5,
                enableVAD: true
            });
            
            // Test short audio (should not be segmented)
            const shortAudioBlob = await this.createMockAudioBlob(3); // 3 seconds
            const shortSegments = await audioSegmenter.segmentAudio(shortAudioBlob);
            
            this.assert(shortSegments.length === 1, 'Short audio should have one segment');
            this.assert(shortSegments[0].index === 0, 'Should have correct index');
            this.assert(shortSegments[0].startTime === 0, 'Should start at 0');
            
            // Test long audio (should be segmented)
            const longAudioBlob = await this.createMockAudioBlob(12); // 12 seconds
            const longSegments = await audioSegmenter.segmentAudio(longAudioBlob);
            
            this.assert(longSegments.length > 1, 'Long audio should be segmented');
            this.assert(longSegments[0].duration <= 5, 'Segments should respect max duration');
            
            // Verify segment continuity
            for (let i = 1; i < longSegments.length; i++) {
                const prevSegment = longSegments[i - 1];
                const currentSegment = longSegments[i];
                
                this.assert(currentSegment.startTime <= prevSegment.endTime, 
                    'Segments should overlap or be continuous');
                this.assert(currentSegment.index === i, 'Segments should have correct index');
            }
            
            // Test fixed-time segmentation
            const fixedSegmenter = new AudioSegmenter({
                maxSegmentDuration: 4,
                enableVAD: false
            });
            
            const fixedSegments = await fixedSegmenter.segmentAudio(longAudioBlob);
            this.assert(fixedSegments.length > 1, 'Should create multiple fixed segments');
            
            // Test RMS calculation
            const testSamples = new Float32Array([0.5, -0.5, 0.3, -0.3, 0.1]);
            const rms = audioSegmenter.calculateRMS(testSamples);
            
            this.assert(typeof rms === 'number', 'RMS should be numeric');
            this.assert(rms > 0, 'RMS should be positive');
            this.assert(rms < 1, 'RMS should be normalized');
            
            this.recordTestResult('Audio Segmentation', true, 
                'Segmentation, VAD, and timing logic working correctly');
            
        } catch (error) {
            this.recordTestResult('Audio Segmentation', false, error.message);
        }
    }
    
    /**
     * Test 6: Error Handling
     */
    async testErrorHandling() {
        console.log('Test 6: Error Handling');
        
        try {
            // Test API key validation
            const noKeyClient = new WhisperAPIClient();
            const status = noKeyClient.getStatus();
            this.assert(status.hasAPIKey === false, 'Should detect missing API key');
            
            // Test error classification
            const networkError = new Error('Network timeout occurred');
            const authError = new Error('401 Unauthorized access');
            const rateLimitError = new Error('429 Too Many Requests');
            
            this.assert(this.whisperClient.classifyError(networkError) === 'network', 
                'Should classify network errors');
            this.assert(this.whisperClient.classifyError(authError) === 'authentication', 
                'Should classify auth errors');
            this.assert(this.whisperClient.classifyError(rateLimitError) === 'rate_limit', 
                'Should classify rate limit errors');
            
            // Test error recoverability
            this.assert(this.whisperClient.isRecoverableError(networkError) === true, 
                'Network errors should be recoverable');
            this.assert(this.whisperClient.isRecoverableError(authError) === false, 
                'Auth errors should not be recoverable');
            
            // Test confidence estimation
            const mockResults = [
                { text: 'hello world', words: [{ probability: 0.9 }, { probability: 0.85 }] },
                { text: 'um uh test', words: [] },
                { text: 'a', words: [] }
            ];
            
            for (const result of mockResults) {
                const confidence = this.whisperClient.extractConfidence(result);
                this.assert(typeof confidence === 'number', 'Should return numeric confidence');
                this.assert(confidence >= 0 && confidence <= 1, 'Confidence should be 0-1');
            }
            
            noKeyClient.dispose();
            
            this.recordTestResult('Error Handling', true, 
                'Error classification, recovery detection, and confidence estimation working');
            
        } catch (error) {
            this.recordTestResult('Error Handling', false, error.message);
        }
    }
    
    /**
     * Test 7: Performance Metrics
     */
    async testPerformanceMetrics() {
        console.log('Test 7: Performance Metrics');
        
        try {
            // Test initial metrics
            const initialMetrics = this.whisperClient.getPerformanceMetrics();
            
            this.assert(typeof initialMetrics === 'object', 'Should return metrics object');
            this.assert(typeof initialMetrics.totalRequests === 'number', 'Should track total requests');
            this.assert(typeof initialMetrics.successRate === 'number', 'Should calculate success rate');
            this.assert(typeof initialMetrics.averageLatency === 'number', 'Should track latency');
            
            // Test metrics update
            this.whisperClient.updateMetrics(true, 1500, 0.85, 0.05, 1024);
            this.whisperClient.updateMetrics(true, 2000, 0.90, 0.03, 2048);
            this.whisperClient.updateMetrics(false, 3000, 0, 0, 0);
            
            const updatedMetrics = this.whisperClient.getPerformanceMetrics();
            
            this.assert(updatedMetrics.totalRequests === 3, 'Should count total requests');
            this.assert(updatedMetrics.successfulRequests === 2, 'Should count successful requests');
            this.assert(updatedMetrics.failedRequests === 1, 'Should count failed requests');
            this.assert(updatedMetrics.successRate === 2/3, 'Should calculate success rate');
            this.assert(updatedMetrics.averageLatency === 1750, 'Should calculate average latency');
            this.assert(updatedMetrics.averageConfidence === 0.875, 'Should calculate average confidence');
            this.assert(updatedMetrics.totalCost === 0.08, 'Should track total cost');
            this.assert(updatedMetrics.bytesProcessed === 3072, 'Should track bytes processed');
            
            // Test most frequent function
            const languages = ['en', 'en', 'es', 'en', 'fr'];
            const mostFrequent = this.whisperClient.getMostFrequent(languages);
            this.assert(mostFrequent === 'en', 'Should find most frequent element');
            
            // Test request ID generation
            const requestId1 = this.whisperClient.generateRequestId();
            const requestId2 = this.whisperClient.generateRequestId();
            
            this.assert(typeof requestId1 === 'string', 'Should generate string ID');
            this.assert(requestId1 !== requestId2, 'Should generate unique IDs');
            this.assert(requestId1.startsWith('whisper_'), 'Should have correct prefix');
            
            this.recordTestResult('Performance Metrics', true, 
                'Metrics tracking, calculations, and utilities working correctly');
            
        } catch (error) {
            this.recordTestResult('Performance Metrics', false, error.message);
        }
    }
    
    /**
     * Helper: Create mock AudioBuffer for testing
     */
    createMockAudioBuffer(sampleRate = 16000, duration = 1) {
        const length = sampleRate * duration;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = audioContext.createBuffer(1, length, sampleRate);
        
        // Fill with sine wave
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
        }
        
        return buffer;
    }
    
    /**
     * Helper: Create mock stereo AudioBuffer
     */
    createMockStereoAudioBuffer() {
        const sampleRate = 16000;
        const duration = 1;
        const length = sampleRate * duration;
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = audioContext.createBuffer(2, length, sampleRate);
        
        // Fill both channels
        for (let channel = 0; channel < 2; channel++) {
            const channelData = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
            }
        }
        
        return buffer;
    }
    
    /**
     * Helper: Create mock audio blob for testing
     */
    async createMockAudioBlob(duration = 3) {
        const audioBuffer = this.createMockAudioBuffer(16000, duration);
        
        // Convert to WAV blob (simplified)
        const length = audioBuffer.length;
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0);
        
        const arrayBuffer = new ArrayBuffer(44 + length * 2);
        const view = new DataView(arrayBuffer);
        
        // Simple WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * 2, true);
        
        // Convert samples
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
        
        return new Blob([arrayBuffer], { type: 'audio/wav' });
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
        console.log('🧪 Whisper API Client Test Results');
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
async function testWhisperAPI() {
    const tester = new WhisperAPITest();
    return await tester.runAllTests();
}

/**
 * Manual test for browser console
 */
async function quickWhisperTest() {
    console.log('🎤 Quick Whisper API Client Test');
    
    try {
        const whisperClient = new WhisperAPIClient({
            apiKey: 'test_key',
            timeout: 5000
        });
        
        console.log('Status:', whisperClient.getStatus());
        console.log('Performance Metrics:', whisperClient.getPerformanceMetrics());
        
        // Test cost controller
        const costController = new WhisperCostController();
        console.log('Cost Status:', costController.getStatus());
        
        // Test rate limiter
        const rateLimiter = new WhisperRateLimiter();
        console.log('Rate Limit Status:', rateLimiter.getStatus());
        
        whisperClient.dispose();
        console.log('✅ Quick test completed');
        
    } catch (error) {
        console.error('❌ Quick test failed:', error);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WhisperAPITest, testWhisperAPI, quickWhisperTest };
}
