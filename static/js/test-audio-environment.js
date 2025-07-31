/**
 * Test Suite for AudioEnvironmentDetector
 * Validates Task 1: Audio Environment Detection & Quality Assessment
 */

class AudioEnvironmentDetectorTest {
    constructor() {
        this.detector = null;
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
        
        // Test configuration
        this.testTimeout = 5000; // 5 seconds per test
        this.noiseTestDuration = 3000; // 3 seconds for noise tests
    }
    
    /**
     * Run all tests
     */
    async runAllTests() {
        console.log('🧪 Starting AudioEnvironmentDetector Test Suite');
        console.log('=' .repeat(50));
        
        try {
            // Test 1: Initialization
            await this.testInitialization();
            
            // Test 2: Noise Level Detection
            await this.testNoiseLevelDetection();
            
            // Test 3: Speech Quality Assessment
            await this.testSpeechQualityAssessment();
            
            // Test 4: Dynamic Routing Logic
            await this.testDynamicRouting();
            
            // Test 5: Configuration Updates
            await this.testConfigurationUpdates();
            
            // Test 6: Performance Metrics
            await this.testPerformanceMetrics();
            
            // Test 7: External Audio Buffer Analysis
            await this.testExternalAudioAnalysis();
            
        } catch (error) {
            console.error('Test suite failed:', error);
            this.recordTestResult('Test Suite Execution', false, error.message);
        }
        
        // Print results
        this.printTestResults();
        
        // Cleanup
        if (this.detector) {
            this.detector.dispose();
        }
        
        return this.testResults;
    }
    
    /**
     * Test 1: Initialization and Setup
     */
    async testInitialization() {
        console.log('Test 1: Initialization and Setup');
        
        try {
            // Test detector creation
            this.detector = new AudioEnvironmentDetector();
            this.assert(this.detector !== null, 'Detector should be created');
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check core properties
            this.assert(this.detector.audioContext !== null, 'AudioContext should be initialized');
            this.assert(this.detector.analyser !== null, 'AnalyserNode should be created');
            this.assert(this.detector.microphone !== null, 'Microphone source should be connected');
            this.assert(this.detector.isMonitoring === true, 'Monitoring should be active');
            
            // Check default configuration
            this.assert(typeof this.detector.getNoiseLevel() === 'number', 'getNoiseLevel should return number');
            
            this.recordTestResult('Initialization', true, 'All components initialized correctly');
            
        } catch (error) {
            this.recordTestResult('Initialization', false, error.message);
            throw error; // Stop further tests if initialization fails
        }
    }
    
    /**
     * Test 2: Noise Level Detection (Task 1.1)
     */
    async testNoiseLevelDetection() {
        console.log('Test 2: Noise Level Detection');
        
        try {
            // Monitor noise levels over time
            const noiseReadings = [];
            const startTime = Date.now();
            
            const collectNoise = () => {
                const noiseLevel = this.detector.getNoiseLevel();
                noiseReadings.push({
                    timestamp: Date.now(),
                    level: noiseLevel
                });
                
                if (Date.now() - startTime < this.noiseTestDuration) {
                    setTimeout(collectNoise, 100); // Collect every 100ms
                }
            };
            
            collectNoise();
            
            // Wait for collection to complete
            await new Promise(resolve => setTimeout(resolve, this.noiseTestDuration + 500));
            
            // Validate noise readings
            this.assert(noiseReadings.length > 10, 'Should collect multiple noise readings');
            
            // Check readings are valid dB values
            const validReadings = noiseReadings.filter(r => 
                typeof r.level === 'number' && 
                r.level !== -Infinity && 
                r.level >= -90 && 
                r.level <= 0
            );
            
            this.assert(validReadings.length > 0, 'Should have valid noise level readings');
            
            // Test noise characterization
            const sampleLevel = validReadings[0].level;
            const characterization = this.detector.getNoiseCharacterization(sampleLevel);
            this.assert(typeof characterization === 'string', 'Noise characterization should return string');
            
            // Test noise floor calculation
            const noiseFloor = this.detector.calculateNoiseFloor();
            this.assert(typeof noiseFloor === 'number', 'Noise floor should be a number');
            this.assert(noiseFloor <= sampleLevel, 'Noise floor should be <= current level');
            
            this.recordTestResult('Noise Level Detection', true, 
                `Collected ${noiseReadings.length} readings, ${validReadings.length} valid`);
            
        } catch (error) {
            this.recordTestResult('Noise Level Detection', false, error.message);
        }
    }
    
    /**
     * Test 3: Speech Quality Assessment (Task 1.2)
     */
    async testSpeechQualityAssessment() {
        console.log('Test 3: Speech Quality Assessment');
        
        try {
            // Test external audio buffer analysis
            const mockAudioBuffer = this.createMockAudioBuffer();
            const quality = this.detector.predictRecognitionQuality(mockAudioBuffer);
            
            // Validate quality response structure
            this.assert(typeof quality === 'object', 'Quality response should be object');
            this.assert(typeof quality.score === 'number', 'Quality score should be number');
            this.assert(quality.score >= 0 && quality.score <= 1, 'Quality score should be 0-1');
            this.assert(typeof quality.recommendation === 'string', 'Should provide recommendation');
            this.assert(['webspeech', 'whisper'].includes(quality.recommendation), 
                'Recommendation should be valid provider');
            
            // Test with null buffer
            const nullQuality = this.detector.predictRecognitionQuality(null);
            this.assert(nullQuality.score === 0.5, 'Null buffer should return default score');
            this.assert(nullQuality.recommendation === 'webspeech', 'Null buffer should default to webspeech');
            
            // Test live quality assessment (if available)
            const recentQuality = this.detector.getRecentQualityScore();
            if (recentQuality !== null) {
                this.assert(typeof recentQuality === 'number', 'Recent quality should be number or null');
                this.assert(recentQuality >= 0 && recentQuality <= 1, 'Recent quality should be 0-1');
            }
            
            this.recordTestResult('Speech Quality Assessment', true, 
                `Quality score: ${quality.score}, recommendation: ${quality.recommendation}`);
            
        } catch (error) {
            this.recordTestResult('Speech Quality Assessment', false, error.message);
        }
    }
    
    /**
     * Test 4: Dynamic Routing Logic (Task 1.3)
     */
    async testDynamicRouting() {
        console.log('Test 4: Dynamic Routing Logic');
        
        try {
            // Test default routing
            const defaultRouting = this.detector.getRoutingRecommendation();
            this.validateRoutingDecision(defaultRouting, 'Default routing');
            
            // Test with high noise scenario
            this.detector.routingConfig.highNoiseThreshold = -60; // Lower threshold for testing
            const highNoiseRouting = this.detector.getRoutingRecommendation();
            this.validateRoutingDecision(highNoiseRouting, 'High noise routing');
            
            // Reset threshold
            this.detector.routingConfig.highNoiseThreshold = -40;
            
            // Test with rate limit approaching
            const rateLimitRouting = this.detector.getRoutingRecommendation({ 
                rateLimitApproaching: true 
            });
            this.assert(rateLimitRouting.provider === 'webspeech', 
                'Should fallback to webspeech when rate limit approaching');
            this.assert(rateLimitRouting.reason === 'rate_limit', 
                'Should indicate rate limit reason');
            
            // Test with forced provider
            const forcedRouting = this.detector.getRoutingRecommendation({ 
                forceProvider: 'whisper' 
            });
            this.assert(forcedRouting.provider === 'whisper', 'Should respect forced provider');
            this.assert(forcedRouting.reason === 'forced', 'Should indicate forced reason');
            
            // Test with user preference
            const userPrefRouting = this.detector.getRoutingRecommendation({ 
                userPreference: 'whisper' 
            });
            this.assert(userPrefRouting.provider === 'whisper', 'Should respect user preference');
            this.assert(userPrefRouting.reason === 'user_preference', 'Should indicate user preference reason');
            
            this.recordTestResult('Dynamic Routing Logic', true, 'All routing scenarios tested');
            
        } catch (error) {
            this.recordTestResult('Dynamic Routing Logic', false, error.message);
        }
    }
    
    /**
     * Test 5: Configuration Updates
     */
    async testConfigurationUpdates() {
        console.log('Test 5: Configuration Updates');
        
        try {
            const originalConfig = { ...this.detector.routingConfig };
            
            // Test configuration update
            const newConfig = {
                highNoiseThreshold: -35,
                lowQualityThreshold: 0.7,
                defaultProvider: 'whisper'
            };
            
            this.detector.updateConfiguration(newConfig);
            
            // Verify updates
            this.assert(this.detector.routingConfig.highNoiseThreshold === -35, 
                'High noise threshold should be updated');
            this.assert(this.detector.routingConfig.lowQualityThreshold === 0.7, 
                'Low quality threshold should be updated');
            this.assert(this.detector.routingConfig.defaultProvider === 'whisper', 
                'Default provider should be updated');
            
            // Test routing with new config
            const routing = this.detector.getRoutingRecommendation();
            this.validateRoutingDecision(routing, 'Routing with new config');
            
            // Restore original configuration
            this.detector.updateConfiguration(originalConfig);
            
            this.recordTestResult('Configuration Updates', true, 'Configuration updated successfully');
            
        } catch (error) {
            this.recordTestResult('Configuration Updates', false, error.message);
        }
    }
    
    /**
     * Test 6: Performance Metrics
     */
    async testPerformanceMetrics() {
        console.log('Test 6: Performance Metrics');
        
        try {
            const metrics = this.detector.getPerformanceMetrics();
            
            // Validate metrics structure
            this.assert(typeof metrics === 'object', 'Metrics should be object');
            this.assert(typeof metrics.noiseReadings === 'number', 'Should track noise readings');
            this.assert(typeof metrics.qualityScores === 'number', 'Should track quality scores');
            this.assert(typeof metrics.routingDecisions === 'number', 'Should track routing decisions');
            this.assert(typeof metrics.currentNoiseLevel === 'number', 'Should include current noise level');
            
            // Test environmental status
            const envStatus = this.detector.getEnvironmentalStatus();
            this.assert(typeof envStatus === 'object', 'Environmental status should be object');
            this.assert(typeof envStatus.noise === 'object', 'Should include noise info');
            this.assert(typeof envStatus.routing === 'object', 'Should include routing info');
            this.assert(typeof envStatus.isOptimal === 'boolean', 'Should indicate if optimal');
            
            this.recordTestResult('Performance Metrics', true, 
                `Metrics collected: ${JSON.stringify(metrics, null, 2)}`);
            
        } catch (error) {
            this.recordTestResult('Performance Metrics', false, error.message);
        }
    }
    
    /**
     * Test 7: External Audio Buffer Analysis
     */
    async testExternalAudioAnalysis() {
        console.log('Test 7: External Audio Buffer Analysis');
        
        try {
            // Test various audio scenarios
            const testCases = [
                { name: 'Clean audio', amplitude: 0.5, noise: 0 },
                { name: 'Noisy audio', amplitude: 0.3, noise: 0.2 },
                { name: 'Clipped audio', amplitude: 1.0, noise: 0 },
                { name: 'Quiet audio', amplitude: 0.1, noise: 0.05 }
            ];
            
            for (const testCase of testCases) {
                const buffer = this.createMockAudioBuffer(testCase.amplitude, testCase.noise);
                const quality = this.detector.predictRecognitionQuality(buffer);
                
                this.assert(typeof quality.score === 'number', 
                    `${testCase.name}: Should return quality score`);
                this.assert(quality.score >= 0 && quality.score <= 1, 
                    `${testCase.name}: Score should be 0-1`);
                
                console.log(`  ${testCase.name}: Score ${quality.score.toFixed(2)}, ` +
                           `Recommendation: ${quality.recommendation}`);
            }
            
            this.recordTestResult('External Audio Analysis', true, 
                'All audio scenarios analyzed successfully');
            
        } catch (error) {
            this.recordTestResult('External Audio Analysis', false, error.message);
        }
    }
    
    /**
     * Helper: Create mock audio buffer for testing
     */
    createMockAudioBuffer(amplitude = 0.5, noiseLevel = 0) {
        // Create a mock AudioBuffer-like object
        const sampleRate = 44100;
        const duration = 0.5; // 0.5 seconds
        const length = sampleRate * duration;
        const channelData = new Float32Array(length);
        
        // Generate test audio (sine wave + noise)
        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const signal = amplitude * Math.sin(2 * Math.PI * 440 * t); // 440Hz tone
            const noise = noiseLevel * (Math.random() * 2 - 1); // Random noise
            channelData[i] = signal + noise;
        }
        
        return {
            sampleRate: sampleRate,
            length: length,
            numberOfChannels: 1,
            duration: duration,
            getChannelData: function(channel) {
                return channelData;
            }
        };
    }
    
    /**
     * Helper: Validate routing decision structure
     */
    validateRoutingDecision(decision, testName) {
        this.assert(typeof decision === 'object', `${testName}: Decision should be object`);
        this.assert(typeof decision.provider === 'string', `${testName}: Should have provider`);
        this.assert(['webspeech', 'whisper'].includes(decision.provider), 
            `${testName}: Provider should be valid`);
        this.assert(typeof decision.confidence === 'number', `${testName}: Should have confidence`);
        this.assert(decision.confidence >= 0 && decision.confidence <= 1, 
            `${testName}: Confidence should be 0-1`);
        this.assert(typeof decision.reason === 'string', `${testName}: Should have reason`);
        this.assert(typeof decision.timestamp === 'number', `${testName}: Should have timestamp`);
        this.assert(typeof decision.environmentalFactors === 'object', 
            `${testName}: Should have environmental factors`);
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
        console.log('=' .repeat(50));
        console.log('🧪 Test Results Summary');
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
        
        console.log('=' .repeat(50));
    }
}

/**
 * Quick test function for development
 */
async function testAudioEnvironmentDetector() {
    const tester = new AudioEnvironmentDetectorTest();
    return await tester.runAllTests();
}

/**
 * Manual test for browser console
 */
async function quickAudioTest() {
    console.log('🎤 Quick Audio Environment Test');
    
    try {
        const detector = new AudioEnvironmentDetector();
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        
        console.log('Current noise level:', detector.getNoiseLevel(), 'dB FS');
        console.log('Environmental status:', detector.getEnvironmentalStatus());
        console.log('Routing recommendation:', detector.getRoutingRecommendation());
        
        detector.dispose();
        console.log('✅ Quick test completed');
        
    } catch (error) {
        console.error('❌ Quick test failed:', error);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AudioEnvironmentDetectorTest, testAudioEnvironmentDetector, quickAudioTest };
}
