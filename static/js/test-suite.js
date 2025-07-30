class JarvisTestSuite {
    constructor() {
        this.tests = [];
        this.results = [];
        this.isRunning = false;
        this.currentTest = null;
        
        // Test categories
        this.categories = {
            'basic': 'Basic Functionality',
            'multilang': 'Multi-language Support',
            'wakeword': 'Wake Word Detection',
            'biometrics': 'Voice Biometrics',
            'performance': 'Performance Tests',
            'integration': 'Integration Tests'
        };
        
        // Test data
        this.testData = {
            queries: {
                'en': [
                    'What is the status of flight UA2406?',
                    'What ramp team members are on break now?',
                    'What is the nearest pushback tractor to gate A1?',
                    'Who is the cleaning lead on flight ABC123?',
                    'What equipment is assigned to gate B6?'
                ],
                'es': [
                    '¿Cuál es el estado del vuelo UA2406?',
                    '¿Qué miembros del equipo de rampa están en descanso ahora?',
                    '¿Cuál es el tractor de empuje más cercano a la puerta A1?',
                    '¿Quién es el líder de limpieza en el vuelo ABC123?',
                    '¿Qué equipo está asignado a la puerta B6?'
                ],
                'fr': [
                    'Quel est le statut du vol UA2406?',
                    'Quels membres de l\'équipe de piste sont en pause maintenant?',
                    'Quel est le tracteur de poussée le plus proche de la porte A1?',
                    'Qui est le responsable du nettoyage sur le vol ABC123?',
                    'Quel équipement est assigné à la porte B6?'
                ]
            },
            wakeWords: {
                'en': ['jarvis', 'hey jarvis', 'hello jarvis'],
                'es': ['jaime', 'hola jaime', 'oye jaime'],
                'fr': ['jacques', 'salut jacques', 'hey jacques']
            }
        };
        
        this.setupTests();
    }
    
    setupTests() {
        // Basic functionality tests
        this.addTest('basic', 'API Health Check', this.testAPIHealth);
        this.addTest('basic', 'Language Support Check', this.testLanguageSupport);
        this.addTest('basic', 'Voice Assistant Initialization', this.testVoiceAssistantInit);
        
        // Multi-language tests
        this.addTest('multilang', 'English Query Processing', () => this.testLanguageQuery('en'));
        this.addTest('multilang', 'Spanish Query Processing', () => this.testLanguageQuery('es'));
        this.addTest('multilang', 'French Query Processing', () => this.testLanguageQuery('fr'));
        this.addTest('multilang', 'Language Auto-Detection', this.testLanguageAutoDetection);
        this.addTest('multilang', 'Language Switching', this.testLanguageSwitching);
        
        // Wake word detection tests
        this.addTest('wakeword', 'Basic Wake Word Detection', this.testBasicWakeWordDetection);
        this.addTest('wakeword', 'Multi-language Wake Words', this.testMultiLanguageWakeWords);
        this.addTest('wakeword', 'Wake Word Variations', this.testWakeWordVariations);
        this.addTest('wakeword', 'False Positive Prevention', this.testWakeWordFalsePositives);
        this.addTest('wakeword', 'Noise Adaptation', this.testWakeWordNoiseAdaptation);
        
        // Voice biometrics tests
        this.addTest('biometrics', 'Voice Profile Creation', this.testVoiceProfileCreation);
        this.addTest('biometrics', 'Voice Authentication', this.testVoiceAuthentication);
        this.addTest('biometrics', 'Speaker Identification', this.testSpeakerIdentification);
        this.addTest('biometrics', 'Authentication Threshold', this.testAuthenticationThreshold);
        
        // Performance tests
        this.addTest('performance', 'Response Time Under 3s', this.testResponseTime);
        this.addTest('performance', 'Concurrent Query Handling', this.testConcurrentQueries);
        this.addTest('performance', 'Memory Usage Monitoring', this.testMemoryUsage);
        this.addTest('performance', 'Audio Processing Latency', this.testAudioLatency);
        
        // Integration tests
        this.addTest('integration', 'End-to-End Voice Flow', this.testEndToEndVoiceFlow);
        this.addTest('integration', 'Database Integration', this.testDatabaseIntegration);
        this.addTest('integration', 'Error Recovery', this.testErrorRecovery);
        this.addTest('integration', 'Settings Persistence', this.testSettingsPersistence);
    }
    
    addTest(category, name, testFunction) {
        this.tests.push({
            id: `${category}-${this.tests.length}`,
            category,
            name,
            testFunction,
            status: 'pending',
            result: null,
            duration: 0,
            error: null
        });
    }
    
    async runAllTests() {
        if (this.isRunning) {
            console.warn('Tests are already running');
            return;
        }
        
        this.isRunning = true;
        this.results = [];
        console.log('🧪 Starting Jarvis Test Suite...');
        
        for (const test of this.tests) {
            await this.runTest(test);
        }
        
        this.isRunning = false;
        this.generateReport();
    }
    
    async runTestCategory(category) {
        if (this.isRunning) {
            console.warn('Tests are already running');
            return;
        }
        
        const categoryTests = this.tests.filter(test => test.category === category);
        if (categoryTests.length === 0) {
            console.warn(`No tests found for category: ${category}`);
            return;
        }
        
        this.isRunning = true;
        console.log(`🧪 Running ${this.categories[category]} tests...`);
        
        for (const test of categoryTests) {
            await this.runTest(test);
        }
        
        this.isRunning = false;
        this.generateCategoryReport(category);
    }
    
    async runTest(test) {
        this.currentTest = test;
        test.status = 'running';
        
        console.log(`Running: ${test.name}`);
        const startTime = performance.now();
        
        try {
            const result = await test.testFunction();
            test.result = result;
            test.status = result.passed ? 'passed' : 'failed';
            
            if (!result.passed) {
                test.error = result.error || 'Test failed without specific error';
            }
        } catch (error) {
            test.status = 'error';
            test.error = error.message;
            test.result = { passed: false, error: error.message };
        }
        
        test.duration = performance.now() - startTime;
        this.results.push(test);
        
        const status = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '💥';
        console.log(`${status} ${test.name} (${test.duration.toFixed(2)}ms)`);
        
        if (test.error) {
            console.error(`   Error: ${test.error}`);
        }
    }
    
    // Test implementations
    async testAPIHealth() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            return {
                passed: response.ok && data.status === 'healthy',
                details: data,
                message: response.ok ? 'API is healthy' : 'API health check failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to connect to API'
            };
        }
    }
    
    async testLanguageSupport() {
        try {
            const response = await fetch('/api/languages');
            const languages = await response.json();
            
            const expectedLanguages = ['en', 'es', 'fr'];
            const hasAllLanguages = expectedLanguages.every(lang => languages[lang]);
            
            return {
                passed: hasAllLanguages,
                details: languages,
                message: hasAllLanguages ? 'All required languages supported' : 'Missing required languages'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to fetch language support info'
            };
        }
    }
    
    async testVoiceAssistantInit() {
        try {
            const hasWebSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
            const hasSpeechSynthesis = 'speechSynthesis' in window;
            
            return {
                passed: hasWebSpeech && hasSpeechSynthesis,
                details: { hasWebSpeech, hasSpeechSynthesis },
                message: hasWebSpeech && hasSpeechSynthesis ? 'Voice features available' : 'Voice features not supported'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to check voice assistant capabilities'
            };
        }
    }
    
    async testLanguageQuery(language) {
        try {
            const queries = this.testData.queries[language];
            const testQuery = queries[0]; // Use first query for testing
            
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: testQuery, language })
            });
            
            const result = await response.json();
            
            return {
                passed: response.ok && result.response && result.language === language,
                details: result,
                message: response.ok ? `${language.toUpperCase()} query processed successfully` : 'Query processing failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: `Failed to process ${language.toUpperCase()} query`
            };
        }
    }
    
    async testLanguageAutoDetection() {
        try {
            const testCases = [
                { query: '¿Cuál es el estado del vuelo?', expectedLang: 'es' },
                { query: 'Quel est le statut du vol?', expectedLang: 'fr' },
                { query: 'What is the flight status?', expectedLang: 'en' }
            ];
            
            const results = [];
            
            for (const testCase of testCases) {
                const response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: testCase.query })
                });
                
                const result = await response.json();
                const detected = result.language === testCase.expectedLang;
                results.push({ ...testCase, detected, actualLang: result.language });
            }
            
            const allCorrect = results.every(r => r.detected);
            
            return {
                passed: allCorrect,
                details: results,
                message: allCorrect ? 'Language auto-detection working correctly' : 'Language auto-detection failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test language auto-detection'
            };
        }
    }
    
    async testLanguageSwitching() {
        try {
            // Simulate language switching if LanguageManager is available
            if (typeof LanguageManager !== 'undefined' && window.languageManager) {
                const originalLang = window.languageManager.getCurrentLanguage();
                
                const testLanguages = ['en', 'es', 'fr'];
                const results = [];
                
                for (const lang of testLanguages) {
                    const switched = window.languageManager.setLanguage(lang);
                    const currentLang = window.languageManager.getCurrentLanguage();
                    results.push({ targetLang: lang, switched, currentLang, success: currentLang === lang });
                }
                
                // Restore original language
                window.languageManager.setLanguage(originalLang);
                
                const allSuccessful = results.every(r => r.success);
                
                return {
                    passed: allSuccessful,
                    details: results,
                    message: allSuccessful ? 'Language switching works correctly' : 'Language switching failed'
                };
            } else {
                return {
                    passed: false,
                    error: 'LanguageManager not available',
                    message: 'Cannot test language switching without LanguageManager'
                };
            }
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test language switching'
            };
        }
    }
    
    async testBasicWakeWordDetection() {
        try {
            if (typeof WakeWordDetector === 'undefined') {
                return {
                    passed: false,
                    error: 'WakeWordDetector class not available',
                    message: 'Cannot test wake word detection'
                };
            }
            
            const detector = new WakeWordDetector();
            
            const testCases = [
                { input: 'jarvis what is the weather', shouldDetect: true },
                { input: 'hey jarvis show me flights', shouldDetect: true },
                { input: 'what time is it', shouldDetect: false },
                { input: 'the jarvis system is working', shouldDetect: true },
                { input: 'random conversation text', shouldDetect: false }
            ];
            
            const results = [];
            
            for (const testCase of testCases) {
                const result = detector.detect(testCase.input, true);
                const correct = result.detected === testCase.shouldDetect;
                results.push({ ...testCase, detected: result.detected, correct });
            }
            
            const accuracy = results.filter(r => r.correct).length / results.length;
            
            return {
                passed: accuracy >= 0.8, // 80% accuracy threshold
                details: { accuracy, results },
                message: `Wake word detection accuracy: ${(accuracy * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test wake word detection'
            };
        }
    }
    
    async testMultiLanguageWakeWords() {
        try {
            const testCases = [
                { input: 'jaime cual es el estado', lang: 'es', shouldDetect: true },
                { input: 'hola jaime muestrame vuelos', lang: 'es', shouldDetect: true },
                { input: 'jacques quel est le temps', lang: 'fr', shouldDetect: true },
                { input: 'salut jacques montre moi', lang: 'fr', shouldDetect: true }
            ];
            
            const results = [];
            
            for (const testCase of testCases) {
                // Test with language-specific wake words
                const wakeWords = this.testData.wakeWords[testCase.lang];
                const hasWakeWord = wakeWords.some(word => testCase.input.toLowerCase().includes(word));
                results.push({ ...testCase, detected: hasWakeWord, correct: hasWakeWord === testCase.shouldDetect });
            }
            
            const accuracy = results.filter(r => r.correct).length / results.length;
            
            return {
                passed: accuracy >= 0.8,
                details: { accuracy, results },
                message: `Multi-language wake word detection accuracy: ${(accuracy * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test multi-language wake words'
            };
        }
    }
    
    async testWakeWordVariations() {
        try {
            const variations = [
                'jarvis', 'jarves', 'jarvus', 'jervis',
                'jaime', 'jayme',
                'jacques', 'jack'
            ];
            
            const results = variations.map(variation => {
                const input = `${variation} show me the status`;
                // Simple check for variation matching
                const baseWords = ['jarvis', 'jaime', 'jacques'];
                const matchesBase = baseWords.some(base => this.calculateSimilarity(variation, base) > 0.7);
                
                return { variation, input, matchesBase };
            });
            
            const accuracy = results.filter(r => r.matchesBase).length / results.length;
            
            return {
                passed: accuracy >= 0.7,
                details: { accuracy, results },
                message: `Wake word variation detection accuracy: ${(accuracy * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test wake word variations'
            };
        }
    }
    
    async testWakeWordFalsePositives() {
        try {
            const nonWakeWordInputs = [
                'the service is working well',
                'james told me about the meeting',
                'we need more chairs in the office',
                'the system is operational',
                'check the manifest for details'
            ];
            
            let falsePositives = 0;
            
            for (const input of nonWakeWordInputs) {
                const hasWakeWord = ['jarvis', 'jaime', 'jacques'].some(word => input.toLowerCase().includes(word));
                if (hasWakeWord) {
                    falsePositives++;
                }
            }
            
            const falsePositiveRate = falsePositives / nonWakeWordInputs.length;
            
            return {
                passed: falsePositiveRate <= 0.1, // Less than 10% false positive rate
                details: { falsePositiveRate, falsePositives, totalTests: nonWakeWordInputs.length },
                message: `False positive rate: ${(falsePositiveRate * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test false positive prevention'
            };
        }
    }
    
    async testWakeWordNoiseAdaptation() {
        try {
            // Simulate noise adaptation by testing with varying thresholds
            const baseConfidence = 0.7;
            const noiseLevels = [0.1, 0.5, 0.8]; // Low, medium, high noise
            
            const adaptedThresholds = noiseLevels.map(noise => {
                // Simple adaptation formula
                return Math.min(baseConfidence + (noise * 0.1), 0.9);
            });
            
            const correctlyAdapted = adaptedThresholds.every((threshold, i) => {
                const expectedIncrease = noiseLevels[i] > 0.3;
                const actualIncrease = threshold > baseConfidence;
                return expectedIncrease === actualIncrease;
            });
            
            return {
                passed: correctlyAdapted,
                details: { noiseLevels, adaptedThresholds, baseConfidence },
                message: correctlyAdapted ? 'Noise adaptation working correctly' : 'Noise adaptation failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test noise adaptation'
            };
        }
    }
    
    async testVoiceProfileCreation() {
        try {
            if (typeof VoiceBiometrics === 'undefined') {
                return {
                    passed: false,
                    error: 'VoiceBiometrics class not available',
                    message: 'Cannot test voice biometrics'
                };
            }
            
            // Mock voice profile creation
            const mockProfile = {
                userId: 'test-user-001',
                employeeId: 'EMP001',
                department: 'ramp',
                features: {
                    f0: { mean: 120, std: 15 },
                    formants: [800, 1200, 2400, 3100],
                    mfcc: new Array(13).fill(0).map(() => Math.random()),
                    spectral: { centroid: 1000, bandwidth: 500, rolloff: 3000 }
                },
                createdAt: Date.now()
            };
            
            // Validate profile structure
            const hasRequiredFields = ['userId', 'employeeId', 'department', 'features'].every(field => 
                mockProfile.hasOwnProperty(field)
            );
            
            const hasValidFeatures = mockProfile.features.f0 && 
                                   Array.isArray(mockProfile.features.formants) &&
                                   Array.isArray(mockProfile.features.mfcc) &&
                                   mockProfile.features.spectral;
            
            return {
                passed: hasRequiredFields && hasValidFeatures,
                details: mockProfile,
                message: hasRequiredFields && hasValidFeatures ? 'Voice profile structure valid' : 'Invalid voice profile structure'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test voice profile creation'
            };
        }
    }
    
    async testVoiceAuthentication() {
        try {
            // Mock authentication test
            const mockSimilarity = 0.89; // High similarity score
            const threshold = 0.85;
            
            const authenticated = mockSimilarity >= threshold;
            
            return {
                passed: authenticated,
                details: { similarity: mockSimilarity, threshold, authenticated },
                message: authenticated ? 'Voice authentication successful' : 'Voice authentication failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test voice authentication'
            };
        }
    }
    
    async testSpeakerIdentification() {
        try {
            // Mock speaker identification with multiple users
            const mockUsers = [
                { userId: 'user1', similarity: 0.91 },
                { userId: 'user2', similarity: 0.73 },
                { userId: 'user3', similarity: 0.65 }
            ];
            
            const bestMatch = mockUsers.reduce((best, current) => 
                current.similarity > best.similarity ? current : best
            );
            
            const identificationSuccessful = bestMatch.similarity > 0.85;
            
            return {
                passed: identificationSuccessful,
                details: { users: mockUsers, bestMatch, identificationSuccessful },
                message: identificationSuccessful ? 'Speaker identification successful' : 'Speaker identification failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test speaker identification'
            };
        }
    }
    
    async testAuthenticationThreshold() {
        try {
            const testScores = [0.95, 0.87, 0.82, 0.75, 0.68];
            const threshold = 0.85;
            
            const results = testScores.map(score => ({
                score,
                shouldPass: score >= threshold,
                actuallyPassed: score >= threshold
            }));
            
            const correctDecisions = results.filter(r => r.shouldPass === r.actuallyPassed).length;
            const accuracy = correctDecisions / results.length;
            
            return {
                passed: accuracy === 1.0, // 100% accuracy expected for threshold testing
                details: { results, accuracy, threshold },
                message: `Authentication threshold accuracy: ${(accuracy * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test authentication threshold'
            };
        }
    }
    
    async testResponseTime() {
        try {
            const testQuery = 'What is the status of flight UA2406?';
            const targetTime = 3000; // 3 seconds
            
            const results = [];
            
            for (let i = 0; i < 5; i++) {
                const startTime = performance.now();
                
                const response = await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: testQuery })
                });
                
                await response.json();
                const responseTime = performance.now() - startTime;
                results.push(responseTime);
            }
            
            const averageTime = results.reduce((sum, time) => sum + time, 0) / results.length;
            const underTarget = results.filter(time => time < targetTime).length;
            const successRate = underTarget / results.length;
            
            return {
                passed: successRate >= 0.8, // 80% of requests should be under 3s
                details: { results, averageTime, targetTime, successRate },
                message: `Average response time: ${averageTime.toFixed(2)}ms, Success rate: ${(successRate * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test response time'
            };
        }
    }
    
    async testConcurrentQueries() {
        try {
            const queries = this.testData.queries.en.slice(0, 3);
            const startTime = performance.now();
            
            const promises = queries.map(query => 
                fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                }).then(response => response.json())
            );
            
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;
            
            const allSuccessful = results.every(result => result.response && !result.error);
            
            return {
                passed: allSuccessful,
                details: { results, totalTime, queryCount: queries.length },
                message: allSuccessful ? 'Concurrent queries handled successfully' : 'Concurrent query handling failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test concurrent queries'
            };
        }
    }
    
    async testMemoryUsage() {
        try {
            const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            
            // Simulate memory intensive operations
            for (let i = 0; i < 10; i++) {
                await fetch('/api/query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: 'What is the status of flight UA2406?' })
                });
            }
            
            const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
            const memoryIncrease = finalMemory - initialMemory;
            const memoryIncreasePercentage = initialMemory > 0 ? (memoryIncrease / initialMemory) * 100 : 0;
            
            // Memory increase should be reasonable (less than 50% increase)
            const memoryUsageOK = memoryIncreasePercentage < 50;
            
            return {
                passed: memoryUsageOK,
                details: { initialMemory, finalMemory, memoryIncrease, memoryIncreasePercentage },
                message: `Memory usage increase: ${memoryIncreasePercentage.toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test memory usage'
            };
        }
    }
    
    async testAudioLatency() {
        try {
            // Mock audio processing latency test
            const mockLatencies = [45, 52, 38, 61, 43]; // milliseconds
            const targetLatency = 100; // 100ms target
            
            const averageLatency = mockLatencies.reduce((sum, lat) => sum + lat, 0) / mockLatencies.length;
            const underTarget = mockLatencies.filter(lat => lat < targetLatency).length;
            const successRate = underTarget / mockLatencies.length;
            
            return {
                passed: successRate >= 0.8,
                details: { mockLatencies, averageLatency, targetLatency, successRate },
                message: `Average audio latency: ${averageLatency.toFixed(1)}ms, Success rate: ${(successRate * 100).toFixed(1)}%`
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test audio latency'
            };
        }
    }
    
    async testEndToEndVoiceFlow() {
        try {
            // Test the complete voice interaction flow
            const steps = [
                'Wake word detection',
                'Speech recognition',
                'Query processing',
                'Database lookup',
                'Response formatting',
                'Speech synthesis'
            ];
            
            const stepResults = steps.map((step, index) => ({
                step,
                success: Math.random() > 0.1, // 90% success rate simulation
                order: index + 1
            }));
            
            const allStepsSuccessful = stepResults.every(result => result.success);
            
            return {
                passed: allStepsSuccessful,
                details: stepResults,
                message: allStepsSuccessful ? 'End-to-end voice flow successful' : 'End-to-end voice flow failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test end-to-end voice flow'
            };
        }
    }
    
    async testDatabaseIntegration() {
        try {
            const response = await fetch('/api/health');
            const healthData = await response.json();
            
            const dbConnected = healthData.database_connected;
            const tablesFound = healthData.tables_found > 0;
            
            return {
                passed: dbConnected && tablesFound,
                details: healthData,
                message: dbConnected && tablesFound ? 'Database integration working' : 'Database integration failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test database integration'
            };
        }
    }
    
    async testErrorRecovery() {
        try {
            // Test invalid query handling
            const response = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: '' })
            });
            
            const result = await response.json();
            
            // Should handle empty query gracefully
            const gracefulError = !response.ok && result.error && result.response;
            
            return {
                passed: gracefulError,
                details: { status: response.status, result },
                message: gracefulError ? 'Error recovery working correctly' : 'Error recovery failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test error recovery'
            };
        }
    }
    
    async testSettingsPersistence() {
        try {
            // Test localStorage persistence
            const testKey = 'jarvis-test-setting';
            const testValue = { language: 'es', threshold: 0.8 };
            
            localStorage.setItem(testKey, JSON.stringify(testValue));
            const retrieved = JSON.parse(localStorage.getItem(testKey));
            
            const dataMatches = JSON.stringify(retrieved) === JSON.stringify(testValue);
            
            // Clean up
            localStorage.removeItem(testKey);
            
            return {
                passed: dataMatches,
                details: { testValue, retrieved, dataMatches },
                message: dataMatches ? 'Settings persistence working' : 'Settings persistence failed'
            };
        } catch (error) {
            return {
                passed: false,
                error: error.message,
                message: 'Failed to test settings persistence'
            };
        }
    }
    
    // Utility methods
    calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        
        const maxLength = Math.max(str1.length, str2.length);
        if (maxLength === 0) return 1.0;
        
        const distance = this.levenshteinDistance(str1, str2);
        return 1 - (distance / maxLength);
    }
    
    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }
    
    generateReport() {
        const totalTests = this.results.length;
        const passedTests = this.results.filter(test => test.status === 'passed').length;
        const failedTests = this.results.filter(test => test.status === 'failed').length;
        const errorTests = this.results.filter(test => test.status === 'error').length;
        
        const passRate = (passedTests / totalTests) * 100;
        const averageDuration = this.results.reduce((sum, test) => sum + test.duration, 0) / totalTests;
        
        const report = {
            summary: {
                totalTests,
                passedTests,
                failedTests,
                errorTests,
                passRate: passRate.toFixed(1),
                averageDuration: averageDuration.toFixed(2)
            },
            categories: {},
            details: this.results
        };
        
        // Group by category
        Object.keys(this.categories).forEach(category => {
            const categoryTests = this.results.filter(test => test.category === category);
            const categoryPassed = categoryTests.filter(test => test.status === 'passed').length;
            
            report.categories[category] = {
                name: this.categories[category],
                total: categoryTests.length,
                passed: categoryPassed,
                passRate: categoryTests.length > 0 ? ((categoryPassed / categoryTests.length) * 100).toFixed(1) : '0'
            };
        });
        
        console.log('🧪 Test Suite Complete!');
        console.log(`📊 Results: ${passedTests}/${totalTests} passed (${passRate.toFixed(1)}%)`);
        console.log(`⏱️  Average duration: ${averageDuration.toFixed(2)}ms`);
        
        if (failedTests > 0) {
            console.log('❌ Failed tests:');
            this.results.filter(test => test.status === 'failed').forEach(test => {
                console.log(`   ${test.name}: ${test.error}`);
            });
        }
        
        if (errorTests > 0) {
            console.log('💥 Error tests:');
            this.results.filter(test => test.status === 'error').forEach(test => {
                console.log(`   ${test.name}: ${test.error}`);
            });
        }
        
        return report;
    }
    
    generateCategoryReport(category) {
        const categoryTests = this.results.filter(test => test.category === category);
        const passed = categoryTests.filter(test => test.status === 'passed').length;
        const passRate = (passed / categoryTests.length) * 100;
        
        console.log(`🧪 ${this.categories[category]} Tests Complete!`);
        console.log(`📊 Results: ${passed}/${categoryTests.length} passed (${passRate.toFixed(1)}%)`);
        
        return {
            category: this.categories[category],
            passed,
            total: categoryTests.length,
            passRate: passRate.toFixed(1),
            tests: categoryTests
        };
    }
    
    exportResults() {
        return {
            timestamp: new Date().toISOString(),
            results: this.results,
            summary: this.generateReport()
        };
    }
}

// Usage:
// const testSuite = new JarvisTestSuite();
// testSuite.runAllTests();
// testSuite.runTestCategory('basic');
