class LanguageManager {
    constructor() {
        this.currentLanguage = 'en';
        this.supportedLanguages = {};
        this.translations = {};
        
        // Voice synthesis voices for each language
        this.voiceSettings = {
            'en': { lang: 'en-US', voiceNames: ['Google US English', 'Microsoft Zira', 'Alex'] },
            'es': { lang: 'es-ES', voiceNames: ['Google español', 'Microsoft Helena', 'Monica'] },
            'fr': { lang: 'fr-FR', voiceNames: ['Google français', 'Microsoft Hortense', 'Thomas'] }
        };
        
        // Callbacks
        this.onLanguageChange = null;
        this.onTranslationLoad = null;
        
        this.init();
    }
    
    async init() {
        // Load supported languages from backend
        await this.loadSupportedLanguages();
        
        // Load translations
        await this.loadTranslations();
        
        // Set initial language from localStorage or browser preference
        const savedLanguage = localStorage.getItem('jarvis-language');
        const browserLanguage = this.detectBrowserLanguage();
        
        this.currentLanguage = savedLanguage || browserLanguage || 'en';
        this.updateCurrentLanguage();
    }
    
    async loadSupportedLanguages() {
        try {
            const response = await fetch('/api/languages');
            this.supportedLanguages = await response.json();
            console.log('Loaded supported languages:', this.supportedLanguages);
        } catch (error) {
            console.error('Failed to load supported languages:', error);
            // Fallback to default
            this.supportedLanguages = {
                'en': { name: 'English', wake_words: ['jarvis', 'hey jarvis'] },
                'es': { name: 'Spanish', wake_words: ['jaime', 'hola jaime'] },
                'fr': { name: 'French', wake_words: ['jacques', 'salut jacques'] }
            };
        }
    }
    
    async loadTranslations() {
        this.translations = {
            'en': {
                // UI Elements
                'status': 'Status',
                'listening': 'Listening',
                'response_time': 'Response Time',
                'start_voice_assistant': 'Start Voice Assistant',
                'stop_voice_assistant': 'Stop Voice Assistant',
                'test_mode': 'Test Mode',
                'conversation_log': 'Conversation Log',
                'language_settings': 'Language Settings',
                'voice_settings': 'Voice Settings',
                'wake_word_settings': 'Wake Word Settings',
                
                // Status Messages
                'ready': 'Ready - Say "{wake_word}" to begin',
                'listening_for_wake_word': 'Listening for wake word...',
                'wake_word_detected': 'Wake word detected! Listening for command...',
                'processing': 'Processing your request...',
                'speaking': 'Speaking...',
                'stopped': 'Stopped',
                
                // Test Queries
                'test_query_1': 'What is the status of flight UA2406?',
                'test_query_2': 'What ramp team members are on break now?',
                'test_query_3': 'What is the nearest pushback tractor to gate A1?',
                
                // Settings
                'current_language': 'Current Language',
                'change_language': 'Change Language',
                'voice_speed': 'Voice Speed',
                'voice_pitch': 'Voice Pitch',
                'wake_word_sensitivity': 'Wake Word Sensitivity',
                'custom_wake_words': 'Custom Wake Words',
                
                // Errors
                'browser_not_supported': 'Your browser does not support voice recognition',
                'microphone_access_denied': 'Microphone access denied',
                'network_error': 'Network connection error',
                'processing_error': 'Error processing your request'
            },
            'es': {
                // UI Elements
                'status': 'Estado',
                'listening': 'Escuchando',
                'response_time': 'Tiempo de Respuesta',
                'start_voice_assistant': 'Iniciar Asistente de Voz',
                'stop_voice_assistant': 'Detener Asistente de Voz',
                'test_mode': 'Modo de Prueba',
                'conversation_log': 'Registro de Conversación',
                'language_settings': 'Configuración de Idioma',
                'voice_settings': 'Configuración de Voz',
                'wake_word_settings': 'Configuración de Palabra de Activación',
                
                // Status Messages
                'ready': 'Listo - Di "{wake_word}" para comenzar',
                'listening_for_wake_word': 'Escuchando palabra de activación...',
                'wake_word_detected': '¡Palabra de activación detectada! Escuchando comando...',
                'processing': 'Procesando tu solicitud...',
                'speaking': 'Hablando...',
                'stopped': 'Detenido',
                
                // Test Queries
                'test_query_1': '¿Cuál es el estado del vuelo UA2406?',
                'test_query_2': '¿Qué miembros del equipo de rampa están en descanso?',
                'test_query_3': '¿Cuál es el tractor de empuje más cercano a la puerta A1?',
                
                // Settings
                'current_language': 'Idioma Actual',
                'change_language': 'Cambiar Idioma',
                'voice_speed': 'Velocidad de Voz',
                'voice_pitch': 'Tono de Voz',
                'wake_word_sensitivity': 'Sensibilidad de Palabra de Activación',
                'custom_wake_words': 'Palabras de Activación Personalizadas',
                
                // Errors
                'browser_not_supported': 'Tu navegador no soporta reconocimiento de voz',
                'microphone_access_denied': 'Acceso al micrófono denegado',
                'network_error': 'Error de conexión de red',
                'processing_error': 'Error procesando tu solicitud'
            },
            'fr': {
                // UI Elements
                'status': 'Statut',
                'listening': 'Écoute',
                'response_time': 'Temps de Réponse',
                'start_voice_assistant': 'Démarrer Assistant Vocal',
                'stop_voice_assistant': 'Arrêter Assistant Vocal',
                'test_mode': 'Mode Test',
                'conversation_log': 'Journal de Conversation',
                'language_settings': 'Paramètres de Langue',
                'voice_settings': 'Paramètres Vocaux',
                'wake_word_settings': 'Paramètres du Mot de Réveil',
                
                // Status Messages
                'ready': 'Prêt - Dites "{wake_word}" pour commencer',
                'listening_for_wake_word': 'Écoute du mot de réveil...',
                'wake_word_detected': 'Mot de réveil détecté! Écoute de la commande...',
                'processing': 'Traitement de votre demande...',
                'speaking': 'Parle...',
                'stopped': 'Arrêté',
                
                // Test Queries
                'test_query_1': 'Quel est le statut du vol UA2406?',
                'test_query_2': 'Quels membres de l\'équipe de piste sont en pause?',
                'test_query_3': 'Quel est le tracteur de poussée le plus proche de la porte A1?',
                
                // Settings
                'current_language': 'Langue Actuelle',
                'change_language': 'Changer de Langue',
                'voice_speed': 'Vitesse de la Voix',
                'voice_pitch': 'Tonalité de la Voix',
                'wake_word_sensitivity': 'Sensibilité du Mot de Réveil',
                'custom_wake_words': 'Mots de Réveil Personnalisés',
                
                // Errors
                'browser_not_supported': 'Votre navigateur ne supporte pas la reconnaissance vocale',
                'microphone_access_denied': 'Accès au microphone refusé',
                'network_error': 'Erreur de connexion réseau',
                'processing_error': 'Erreur lors du traitement de votre demande'
            }
        };
    }
    
    detectBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage;
        const langCode = browserLang.substring(0, 2);
        
        // Check if detected language is supported
        if (this.supportedLanguages && this.supportedLanguages[langCode]) {
            return langCode;
        }
        
        return 'en'; // Default fallback
    }
    
    setLanguage(languageCode) {
        if (!this.supportedLanguages[languageCode]) {
            console.warn(`Language ${languageCode} not supported`);
            return false;
        }
        
        this.currentLanguage = languageCode;
        localStorage.setItem('jarvis-language', languageCode);
        this.updateCurrentLanguage();
        
        if (this.onLanguageChange) {
            this.onLanguageChange(languageCode);
        }
        
        return true;
    }
    
    getCurrentLanguage() {
        return this.currentLanguage;
    }
    
    getLanguageName(languageCode = null) {
        const code = languageCode || this.currentLanguage;
        return this.supportedLanguages[code]?.name || code.toUpperCase();
    }
    
    getWakeWords(languageCode = null) {
        const code = languageCode || this.currentLanguage;
        return this.supportedLanguages[code]?.wake_words || ['jarvis'];
    }
    
    translate(key, replacements = {}) {
        const translation = this.translations[this.currentLanguage]?.[key] || 
                          this.translations['en']?.[key] || 
                          key;
        
        // Replace placeholders
        let result = translation;
        Object.keys(replacements).forEach(placeholder => {
            result = result.replace(`{${placeholder}}`, replacements[placeholder]);
        });
        
        return result;
    }
    
    updateCurrentLanguage() {
        // Update HTML lang attribute
        document.documentElement.lang = this.currentLanguage;
        
        // Update UI elements with translations
        this.updateUITranslations();
        
        // Update speech recognition language
        this.updateSpeechRecognitionLanguage();
    }
    
    updateUITranslations() {
        // Update all elements with data-translate attribute
        const translatableElements = document.querySelectorAll('[data-translate]');
        translatableElements.forEach(element => {
            const key = element.getAttribute('data-translate');
            const translation = this.translate(key);
            
            if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                element.value = translation;
            } else if (element.tagName === 'INPUT' && element.placeholder !== undefined) {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        });
        
        // Update wake word display
        const wakeWordElements = document.querySelectorAll('[data-wake-word]');
        wakeWordElements.forEach(element => {
            const wakeWords = this.getWakeWords();
            element.textContent = wakeWords[0]; // Use primary wake word
        });
    }
    
    updateSpeechRecognitionLanguage() {
        const voiceSettings = this.voiceSettings[this.currentLanguage];
        if (voiceSettings && window.speechRecognition) {
            window.speechRecognition.lang = voiceSettings.lang;
        }
    }
    
    getVoiceForLanguage(languageCode = null) {
        const code = languageCode || this.currentLanguage;
        const voiceSettings = this.voiceSettings[code];
        
        if (!voiceSettings) return null;
        
        const voices = speechSynthesis.getVoices();
        
        // Try to find preferred voice by name
        for (const preferredName of voiceSettings.voiceNames) {
            const voice = voices.find(v => v.name.includes(preferredName));
            if (voice) return voice;
        }
        
        // Fallback to any voice for the language
        return voices.find(v => v.lang.startsWith(code)) || null;
    }
    
    createLanguageSelector() {
        const container = document.createElement('div');
        container.className = 'language-selector';
        
        const label = document.createElement('label');
        label.textContent = this.translate('current_language');
        label.className = 'language-label';
        
        const select = document.createElement('select');
        select.className = 'language-select';
        
        Object.keys(this.supportedLanguages).forEach(code => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = this.supportedLanguages[code].name;
            option.selected = code === this.currentLanguage;
            select.appendChild(option);
        });
        
        select.addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });
        
        container.appendChild(label);
        container.appendChild(select);
        
        return container;
    }
    
    // Auto-detect language from speech input
    detectLanguageFromSpeech(transcript) {
        const text = transcript.toLowerCase();
        
        // Spanish indicators
        const spanishWords = ['que', 'cual', 'donde', 'cuando', 'como', 'vuelo', 'estado', 'equipo'];
        const spanishCount = spanishWords.filter(word => text.includes(word)).length;
        
        // French indicators
        const frenchWords = ['quel', 'ou', 'quand', 'comment', 'vol', 'statut', 'equipe'];
        const frenchCount = frenchWords.filter(word => text.includes(word)).length;
        
        if (spanishCount > 0) return 'es';
        if (frenchCount > 0) return 'fr';
        return 'en';
    }
    
    // Auto-switch language based on detected speech
    autoSwitchLanguage(transcript) {
        const detectedLanguage = this.detectLanguageFromSpeech(transcript);
        if (detectedLanguage !== this.currentLanguage) {
            console.log(`Auto-switching from ${this.currentLanguage} to ${detectedLanguage}`);
            this.setLanguage(detectedLanguage);
            return true;
        }
        return false;
    }
    
    // Export/Import language settings
    exportSettings() {
        return {
            currentLanguage: this.currentLanguage,
            customWakeWords: localStorage.getItem('jarvis-custom-wake-words'),
            voiceSettings: localStorage.getItem('jarvis-voice-settings')
        };
    }
    
    importSettings(settings) {
        if (settings.currentLanguage) {
            this.setLanguage(settings.currentLanguage);
        }
        if (settings.customWakeWords) {
            localStorage.setItem('jarvis-custom-wake-words', settings.customWakeWords);
        }
        if (settings.voiceSettings) {
            localStorage.setItem('jarvis-voice-settings', settings.voiceSettings);
        }
    }
}
