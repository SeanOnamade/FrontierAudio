class VoiceBiometrics {
    constructor() {
        this.isInitialized = false;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.userProfiles = new Map();
        this.currentUser = null;
        this.authenticationThreshold = 0.85;
        
        // Voice feature extraction parameters
        this.sampleRate = 44100;
        this.frameSize = 2048;
        this.hopSize = 512;
        
        // MFCC (Mel-frequency cepstral coefficients) parameters
        this.numMelFilters = 26;
        this.numMFCCs = 13;
        
        // Callbacks
        this.onAuthenticationSuccess = null;
        this.onAuthenticationFailure = null;
        this.onProfileCreated = null;
        this.onError = null;
        
        this.init();
    }
    
    async init() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.frameSize;
            
            await this.loadUserProfiles();
            this.isInitialized = true;
            console.log('Voice biometrics system initialized');
        } catch (error) {
            console.error('Failed to initialize voice biometrics:', error);
            if (this.onError) {
                this.onError('Failed to initialize voice biometrics system');
            }
        }
    }
    
    async setupMicrophone() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: this.sampleRate
                }
            });
            
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            return true;
        } catch (error) {
            console.error('Microphone setup failed:', error);
            if (this.onError) {
                this.onError('Microphone access required for voice authentication');
            }
            return false;
        }
    }
    
    async loadUserProfiles() {
        try {
            const stored = localStorage.getItem('jarvis-voice-profiles');
            if (stored) {
                const profiles = JSON.parse(stored);
                Object.entries(profiles).forEach(([userId, profile]) => {
                    this.userProfiles.set(userId, profile);
                });
            }
        } catch (error) {
            console.error('Failed to load user profiles:', error);
        }
    }
    
    saveUserProfiles() {
        try {
            const profiles = {};
            this.userProfiles.forEach((profile, userId) => {
                profiles[userId] = profile;
            });
            localStorage.setItem('jarvis-voice-profiles', JSON.stringify(profiles));
        } catch (error) {
            console.error('Failed to save user profiles:', error);
        }
    }
    
    async createUserProfile(userId, employeeId, department) {
        if (!this.isInitialized) {
            throw new Error('Voice biometrics not initialized');
        }
        
        if (!await this.setupMicrophone()) {
            throw new Error('Microphone access required');
        }
        
        console.log(`Creating voice profile for user ${userId}`);
        
        // Collect multiple voice samples
        const samples = [];
        const requiredSamples = 5;
        
        for (let i = 0; i < requiredSamples; i++) {
            const sample = await this.collectVoiceSample(
                `Please say: "I am ${userId} from ${department}. This is sample ${i + 1} of ${requiredSamples}."`
            );
            
            if (sample) {
                samples.push(sample);
            } else {
                throw new Error(`Failed to collect voice sample ${i + 1}`);
            }
        }
        
        // Extract and average features from all samples
        const profile = this.createVoiceTemplate(samples);
        profile.userId = userId;
        profile.employeeId = employeeId;
        profile.department = department;
        profile.createdAt = Date.now();
        profile.lastAuthenticated = null;
        
        this.userProfiles.set(userId, profile);
        this.saveUserProfiles();
        
        if (this.onProfileCreated) {
            this.onProfileCreated(userId, profile);
        }
        
        console.log(`Voice profile created for ${userId}`);
        return profile;
    }
    
    async collectVoiceSample(prompt) {
        return new Promise((resolve, reject) => {
            const recordingDuration = 3000; // 3 seconds
            const audioData = [];
            let startTime = null;
            
            // Display prompt to user
            console.log('Voice Sample Prompt:', prompt);
            
            const dataArray = new Float32Array(this.analyser.fftSize);
            
            const collectAudio = () => {
                if (!startTime) startTime = Date.now();
                
                this.analyser.getFloatTimeDomainData(dataArray);
                audioData.push(new Float32Array(dataArray));
                
                if (Date.now() - startTime < recordingDuration) {
                    requestAnimationFrame(collectAudio);
                } else {
                    // Process collected audio
                    const processedSample = this.processAudioSample(audioData);
                    resolve(processedSample);
                }
            };
            
            setTimeout(() => {
                collectAudio();
            }, 1000); // Give user 1 second to start speaking
        });
    }
    
    processAudioSample(audioFrames) {
        // Concatenate all audio frames
        const totalLength = audioFrames.reduce((sum, frame) => sum + frame.length, 0);
        const concatenated = new Float32Array(totalLength);
        
        let offset = 0;
        audioFrames.forEach(frame => {
            concatenated.set(frame, offset);
            offset += frame.length;
        });
        
        // Extract voice features
        const features = this.extractVoiceFeatures(concatenated);
        
        return {
            rawAudio: concatenated,
            features: features,
            timestamp: Date.now(),
            duration: concatenated.length / this.sampleRate
        };
    }
    
    extractVoiceFeatures(audioData) {
        const features = {};
        
        // 1. Fundamental frequency (F0) estimation
        features.f0 = this.estimateF0(audioData);
        
        // 2. Formant frequencies
        features.formants = this.extractFormants(audioData);
        
        // 3. Spectral features
        features.spectral = this.extractSpectralFeatures(audioData);
        
        // 4. MFCC coefficients
        features.mfcc = this.extractMFCC(audioData);
        
        // 5. Voice quality measures
        features.quality = this.extractVoiceQuality(audioData);
        
        return features;
    }
    
    estimateF0(audioData) {
        // Simple autocorrelation-based F0 estimation
        const minPeriod = Math.floor(this.sampleRate / 500); // 500 Hz max
        const maxPeriod = Math.floor(this.sampleRate / 50);  // 50 Hz min
        
        let maxCorrelation = 0;
        let bestPeriod = 0;
        
        for (let period = minPeriod; period <= maxPeriod; period++) {
            let correlation = 0;
            let count = 0;
            
            for (let i = 0; i < audioData.length - period; i++) {
                correlation += audioData[i] * audioData[i + period];
                count++;
            }
            
            correlation /= count;
            
            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestPeriod = period;
            }
        }
        
        return bestPeriod > 0 ? this.sampleRate / bestPeriod : 0;
    }
    
    extractFormants(audioData) {
        // Simplified formant extraction using peak detection in frequency domain
        const fft = this.computeFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        
        // Find peaks in the magnitude spectrum
        const peaks = this.findSpectralPeaks(magnitude, 5);
        
        // Convert peak indices to frequencies
        const formants = peaks.map(peakIndex => (peakIndex * this.sampleRate) / (2 * magnitude.length));
        
        return formants.slice(0, 4); // Return first 4 formants
    }
    
    extractSpectralFeatures(audioData) {
        const fft = this.computeFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        
        // Spectral centroid
        let weightedSum = 0;
        let magnitudeSum = 0;
        
        for (let i = 0; i < magnitude.length; i++) {
            weightedSum += i * magnitude[i];
            magnitudeSum += magnitude[i];
        }
        
        const spectralCentroid = weightedSum / magnitudeSum;
        
        // Spectral bandwidth
        let variance = 0;
        for (let i = 0; i < magnitude.length; i++) {
            variance += Math.pow(i - spectralCentroid, 2) * magnitude[i];
        }
        const spectralBandwidth = Math.sqrt(variance / magnitudeSum);
        
        // Spectral rolloff (95% of energy)
        const totalEnergy = magnitude.reduce((sum, mag) => sum + mag * mag, 0);
        let cumulativeEnergy = 0;
        let rolloffPoint = 0;
        
        for (let i = 0; i < magnitude.length; i++) {
            cumulativeEnergy += magnitude[i] * magnitude[i];
            if (cumulativeEnergy >= 0.95 * totalEnergy) {
                rolloffPoint = i;
                break;
            }
        }
        
        return {
            centroid: spectralCentroid,
            bandwidth: spectralBandwidth,
            rolloff: rolloffPoint
        };
    }
    
    extractMFCC(audioData) {
        // Simplified MFCC extraction
        const fft = this.computeFFT(audioData);
        const magnitude = fft.map(complex => Math.sqrt(complex.real * complex.real + complex.imag * complex.imag));
        
        // Apply mel filter bank
        const melFiltered = this.applyMelFilterBank(magnitude);
        
        // Take logarithm and apply DCT
        const logMel = melFiltered.map(val => Math.log(val + 1e-10));
        const mfcc = this.dct(logMel).slice(0, this.numMFCCs);
        
        return mfcc;
    }
    
    extractVoiceQuality(audioData) {
        // Voice quality measures like jitter, shimmer
        const periods = this.extractVoicePeriods(audioData);
        
        if (periods.length < 2) {
            return { jitter: 0, shimmer: 0, hnr: 0 };
        }
        
        // Jitter (period-to-period variation)
        let jitterSum = 0;
        for (let i = 1; i < periods.length; i++) {
            jitterSum += Math.abs(periods[i] - periods[i - 1]);
        }
        const jitter = jitterSum / (periods.length - 1) / periods.reduce((a, b) => a + b, 0) * periods.length;
        
        // Shimmer (amplitude variation) - simplified
        let amplitudeSum = 0;
        const frameSize = 1024;
        const amplitudes = [];
        
        for (let i = 0; i < audioData.length - frameSize; i += frameSize) {
            let rms = 0;
            for (let j = 0; j < frameSize; j++) {
                rms += audioData[i + j] * audioData[i + j];
            }
            amplitudes.push(Math.sqrt(rms / frameSize));
        }
        
        let shimmerSum = 0;
        for (let i = 1; i < amplitudes.length; i++) {
            shimmerSum += Math.abs(amplitudes[i] - amplitudes[i - 1]);
        }
        const shimmer = amplitudes.length > 1 ? shimmerSum / (amplitudes.length - 1) : 0;
        
        return {
            jitter: jitter,
            shimmer: shimmer,
            hnr: this.calculateHNR(audioData) // Harmonic-to-noise ratio
        };
    }
    
    createVoiceTemplate(samples) {
        // Average features across all samples
        const template = {
            f0: { mean: 0, std: 0 },
            formants: [],
            spectral: { centroid: 0, bandwidth: 0, rolloff: 0 },
            mfcc: new Array(this.numMFCCs).fill(0),
            quality: { jitter: 0, shimmer: 0, hnr: 0 }
        };
        
        // Calculate means
        const f0Values = samples.map(s => s.features.f0).filter(f0 => f0 > 0);
        template.f0.mean = f0Values.reduce((a, b) => a + b, 0) / f0Values.length;
        
        // Average formants
        template.formants = samples[0].features.formants.map((_, i) => {
            const values = samples.map(s => s.features.formants[i]).filter(v => v > 0);
            return values.reduce((a, b) => a + b, 0) / values.length;
        });
        
        // Average spectral features
        template.spectral.centroid = samples.reduce((sum, s) => sum + s.features.spectral.centroid, 0) / samples.length;
        template.spectral.bandwidth = samples.reduce((sum, s) => sum + s.features.spectral.bandwidth, 0) / samples.length;
        template.spectral.rolloff = samples.reduce((sum, s) => sum + s.features.spectral.rolloff, 0) / samples.length;
        
        // Average MFCC
        for (let i = 0; i < this.numMFCCs; i++) {
            template.mfcc[i] = samples.reduce((sum, s) => sum + s.features.mfcc[i], 0) / samples.length;
        }
        
        // Average quality measures
        template.quality.jitter = samples.reduce((sum, s) => sum + s.features.quality.jitter, 0) / samples.length;
        template.quality.shimmer = samples.reduce((sum, s) => sum + s.features.quality.shimmer, 0) / samples.length;
        template.quality.hnr = samples.reduce((sum, s) => sum + s.features.quality.hnr, 0) / samples.length;
        
        // Calculate standard deviations
        template.f0.std = Math.sqrt(f0Values.reduce((sum, f0) => sum + Math.pow(f0 - template.f0.mean, 2), 0) / f0Values.length);
        
        return template;
    }
    
    async authenticateVoice(audioSample, candidateUsers = null) {
        if (!this.isInitialized || this.userProfiles.size === 0) {
            return { authenticated: false, userId: null, confidence: 0, error: 'No voice profiles available' };
        }
        
        const sampleFeatures = this.extractVoiceFeatures(audioSample);
        let bestMatch = { userId: null, similarity: 0 };
        
        const usersToCheck = candidateUsers || Array.from(this.userProfiles.keys());
        
        for (const userId of usersToCheck) {
            const profile = this.userProfiles.get(userId);
            const similarity = this.calculateVoiceSimilarity(sampleFeatures, profile);
            
            if (similarity > bestMatch.similarity) {
                bestMatch = { userId, similarity };
            }
        }
        
        const authenticated = bestMatch.similarity >= this.authenticationThreshold;
        
        if (authenticated) {
            this.currentUser = bestMatch.userId;
            const profile = this.userProfiles.get(bestMatch.userId);
            profile.lastAuthenticated = Date.now();
            this.saveUserProfiles();
            
            if (this.onAuthenticationSuccess) {
                this.onAuthenticationSuccess(bestMatch.userId, bestMatch.similarity);
            }
        } else {
            if (this.onAuthenticationFailure) {
                this.onAuthenticationFailure(bestMatch.similarity);
            }
        }
        
        return {
            authenticated,
            userId: authenticated ? bestMatch.userId : null,
            confidence: bestMatch.similarity,
            allScores: usersToCheck.map(userId => ({
                userId,
                similarity: this.calculateVoiceSimilarity(sampleFeatures, this.userProfiles.get(userId))
            }))
        };
    }
    
    calculateVoiceSimilarity(features1, template) {
        let totalSimilarity = 0;
        let weightSum = 0;
        
        // F0 similarity (weight: 0.2)
        const f0Weight = 0.2;
        if (features1.f0 > 0 && template.f0.mean > 0) {
            const f0Similarity = 1 - Math.min(Math.abs(features1.f0 - template.f0.mean) / template.f0.mean, 1);
            totalSimilarity += f0Similarity * f0Weight;
            weightSum += f0Weight;
        }
        
        // Formant similarity (weight: 0.3)
        const formantWeight = 0.3;
        if (features1.formants.length > 0 && template.formants.length > 0) {
            let formantSimilarity = 0;
            const minLength = Math.min(features1.formants.length, template.formants.length);
            
            for (let i = 0; i < minLength; i++) {
                if (template.formants[i] > 0) {
                    formantSimilarity += 1 - Math.min(Math.abs(features1.formants[i] - template.formants[i]) / template.formants[i], 1);
                }
            }
            formantSimilarity /= minLength;
            totalSimilarity += formantSimilarity * formantWeight;
            weightSum += formantWeight;
        }
        
        // MFCC similarity (weight: 0.4)
        const mfccWeight = 0.4;
        if (features1.mfcc.length === template.mfcc.length) {
            const mfccSimilarity = this.calculateMFCCSimilarity(features1.mfcc, template.mfcc);
            totalSimilarity += mfccSimilarity * mfccWeight;
            weightSum += mfccWeight;
        }
        
        // Spectral similarity (weight: 0.1)
        const spectralWeight = 0.1;
        const spectralSimilarity = this.calculateSpectralSimilarity(features1.spectral, template.spectral);
        totalSimilarity += spectralSimilarity * spectralWeight;
        weightSum += spectralWeight;
        
        return weightSum > 0 ? totalSimilarity / weightSum : 0;
    }
    
    calculateMFCCSimilarity(mfcc1, mfcc2) {
        if (mfcc1.length !== mfcc2.length) return 0;
        
        // Calculate cosine similarity
        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;
        
        for (let i = 0; i < mfcc1.length; i++) {
            dotProduct += mfcc1[i] * mfcc2[i];
            norm1 += mfcc1[i] * mfcc1[i];
            norm2 += mfcc2[i] * mfcc2[i];
        }
        
        const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
        return magnitude > 0 ? dotProduct / magnitude : 0;
    }
    
    calculateSpectralSimilarity(spectral1, spectral2) {
        const centroidSim = 1 - Math.min(Math.abs(spectral1.centroid - spectral2.centroid) / Math.max(spectral1.centroid, spectral2.centroid), 1);
        const bandwidthSim = 1 - Math.min(Math.abs(spectral1.bandwidth - spectral2.bandwidth) / Math.max(spectral1.bandwidth, spectral2.bandwidth), 1);
        const rolloffSim = 1 - Math.min(Math.abs(spectral1.rolloff - spectral2.rolloff) / Math.max(spectral1.rolloff, spectral2.rolloff), 1);
        
        return (centroidSim + bandwidthSim + rolloffSim) / 3;
    }
    
    // Utility methods for audio processing
    computeFFT(audioData) {
        // Simple FFT implementation (simplified for demo)
        const N = audioData.length;
        const result = [];
        
        for (let k = 0; k < N; k++) {
            let real = 0;
            let imag = 0;
            
            for (let n = 0; n < N; n++) {
                const angle = -2 * Math.PI * k * n / N;
                real += audioData[n] * Math.cos(angle);
                imag += audioData[n] * Math.sin(angle);
            }
            
            result.push({ real, imag });
        }
        
        return result;
    }
    
    findSpectralPeaks(magnitude, numPeaks) {
        const peaks = [];
        
        for (let i = 1; i < magnitude.length - 1; i++) {
            if (magnitude[i] > magnitude[i - 1] && magnitude[i] > magnitude[i + 1]) {
                peaks.push({ index: i, magnitude: magnitude[i] });
            }
        }
        
        peaks.sort((a, b) => b.magnitude - a.magnitude);
        return peaks.slice(0, numPeaks).map(peak => peak.index);
    }
    
    applyMelFilterBank(magnitude) {
        // Simplified mel filter bank
        const melFilters = [];
        const melMin = 0;
        const melMax = this.hzToMel(this.sampleRate / 2);
        
        for (let i = 0; i < this.numMelFilters; i++) {
            const melCenter = melMin + (melMax - melMin) * i / (this.numMelFilters - 1);
            const hzCenter = this.melToHz(melCenter);
            const binCenter = Math.floor(hzCenter * magnitude.length * 2 / this.sampleRate);
            
            let filterSum = 0;
            const bandwidth = 50; // Simplified bandwidth
            
            for (let j = Math.max(0, binCenter - bandwidth); j < Math.min(magnitude.length, binCenter + bandwidth); j++) {
                filterSum += magnitude[j];
            }
            
            melFilters.push(filterSum);
        }
        
        return melFilters;
    }
    
    hzToMel(hz) {
        return 2595 * Math.log10(1 + hz / 700);
    }
    
    melToHz(mel) {
        return 700 * (Math.pow(10, mel / 2595) - 1);
    }
    
    dct(input) {
        // Discrete Cosine Transform
        const output = [];
        const N = input.length;
        
        for (let k = 0; k < N; k++) {
            let sum = 0;
            for (let n = 0; n < N; n++) {
                sum += input[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
            }
            output.push(sum);
        }
        
        return output;
    }
    
    extractVoicePeriods(audioData) {
        // Simplified voice period extraction
        const periods = [];
        const threshold = 0.01;
        let lastCrossing = 0;
        
        for (let i = 1; i < audioData.length; i++) {
            if (audioData[i - 1] < threshold && audioData[i] >= threshold) {
                if (lastCrossing > 0) {
                    periods.push(i - lastCrossing);
                }
                lastCrossing = i;
            }
        }
        
        return periods;
    }
    
    calculateHNR(audioData) {
        // Simplified Harmonic-to-Noise Ratio calculation
        const f0 = this.estimateF0(audioData);
        if (f0 === 0) return 0;
        
        const period = Math.floor(this.sampleRate / f0);
        let harmonicEnergy = 0;
        let totalEnergy = 0;
        
        for (let i = 0; i < audioData.length - period; i++) {
            const harmonic = audioData[i] * audioData[i + period];
            harmonicEnergy += harmonic * harmonic;
            totalEnergy += audioData[i] * audioData[i];
        }
        
        const noiseEnergy = totalEnergy - harmonicEnergy;
        return noiseEnergy > 0 ? 10 * Math.log10(harmonicEnergy / noiseEnergy) : 0;
    }
    
    // Public interface methods
    getCurrentUser() {
        return this.currentUser;
    }
    
    getUserProfile(userId) {
        return this.userProfiles.get(userId);
    }
    
    deleteUserProfile(userId) {
        if (this.userProfiles.has(userId)) {
            this.userProfiles.delete(userId);
            this.saveUserProfiles();
            return true;
        }
        return false;
    }
    
    setAuthenticationThreshold(threshold) {
        if (threshold >= 0 && threshold <= 1) {
            this.authenticationThreshold = threshold;
            localStorage.setItem('jarvis-auth-threshold', threshold.toString());
        }
    }
    
    getAuthenticationThreshold() {
        return this.authenticationThreshold;
    }
    
    exportProfiles() {
        const profiles = {};
        this.userProfiles.forEach((profile, userId) => {
            profiles[userId] = profile;
        });
        return profiles;
    }
    
    importProfiles(profiles) {
        Object.entries(profiles).forEach(([userId, profile]) => {
            this.userProfiles.set(userId, profile);
        });
        this.saveUserProfiles();
    }
}
