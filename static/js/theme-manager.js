/**
 * JARVIS Theme & Accessibility Manager
 * Handles theme switching, accessibility features, and user preferences
 */

class ThemeManager {
    constructor() {
        this.currentTheme = 'dark';
        this.userPreferences = this.loadPreferences();
        this.isKeyboardNavigation = false;
        this.init();
    }

    init() {
        // Theme controls disabled per user request
        // this.createThemeControls();
        this.bindEvents();
        this.applyTheme();
        this.applyPreferences();
    }

    createThemeControls() {
        const themeControls = document.createElement('div');
        themeControls.className = 'theme-controls';
        themeControls.innerHTML = `
            <button class="theme-toggle" data-theme="light" title="Light Theme" aria-label="Switch to light theme">
                <span role="img" aria-hidden="true">☀️</span>
            </button>
            <button class="theme-toggle active" data-theme="dark" title="Dark Theme" aria-label="Switch to dark theme">
                <span role="img" aria-hidden="true">🌙</span>
            </button>
            <button class="theme-toggle" data-theme="high-contrast" title="High Contrast" aria-label="Switch to high contrast theme">
                <span role="img" aria-hidden="true">🔲</span>
            </button>
            <button id="accessibility-toggle" class="theme-toggle" title="Accessibility Options" aria-label="Open accessibility options">
                <span role="img" aria-hidden="true">♿</span>
            </button>
        `;

        // Insert at the beginning of body
        document.body.insertBefore(themeControls, document.body.firstChild);

        // Add skip link
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-link';
        skipLink.textContent = 'Skip to main content';
        document.body.insertBefore(skipLink, document.body.firstChild);
    }

    bindEvents() {
        // Theme toggle buttons
        document.querySelectorAll('.theme-toggle[data-theme]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.setTheme(e.target.closest('button').dataset.theme);
            });
        });

        // Accessibility panel toggle is now handled in bindAccessibilityToggle()

        // Font size control
        const fontSizeSlider = document.getElementById('font-size-slider');
        const fontSizeValue = document.getElementById('font-size-value');
        if (fontSizeSlider && fontSizeValue) {
            fontSizeSlider.addEventListener('input', (e) => {
                const size = e.target.value;
                this.setFontSize(size);
                fontSizeValue.textContent = `${size}px`;
            });
        }

        // Line height control
        const lineHeightSlider = document.getElementById('line-height-slider');
        const lineHeightValue = document.getElementById('line-height-value');
        if (lineHeightSlider && lineHeightValue) {
            lineHeightSlider.addEventListener('input', (e) => {
                const height = e.target.value;
                this.setLineHeight(height);
                lineHeightValue.textContent = height;
            });
        }

        // Motion toggle
        const motionToggle = document.getElementById('motion-toggle');
        if (motionToggle) {
            motionToggle.addEventListener('change', (e) => {
                this.setReduceMotion(e.target.checked);
            });
        }

        // Keyboard navigation toggle
        const keyboardToggle = document.getElementById('keyboard-nav-toggle');
        if (keyboardToggle) {
            keyboardToggle.addEventListener('change', (e) => {
                this.setKeyboardNavigation(e.target.checked);
            });
        }

        // Sound feedback toggle
        const soundToggle = document.getElementById('sound-toggle');
        if (soundToggle) {
            soundToggle.addEventListener('change', (e) => {
                this.setSoundFeedback(e.target.checked);
            });
        }

        // Reset preferences button
        const resetBtn = document.getElementById('reset-preferences');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.resetPreferences();
            });
        }
    }

    applyTheme() {
        // Apply the current theme to the document
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        
        // Update active button if theme controls exist
        const themeButtons = document.querySelectorAll('.theme-toggle[data-theme]');
        themeButtons.forEach(btn => {
            btn.classList.remove('active');
        });
        const activeButton = document.querySelector(`[data-theme="${this.currentTheme}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

    setTheme(theme) {
        this.currentTheme = theme;
        this.applyTheme();

        // Save preference
        this.userPreferences.theme = theme;
        this.savePreferences();

        // Announce theme change to screen readers
        this.announceToScreenReader(`Theme changed to ${theme.replace('-', ' ')}`);

        // Play sound feedback if enabled
        if (this.userPreferences.soundFeedback) {
            this.playSound('theme-change');
        }
    }

    toggleAccessibilityPanel() {
        const panel = document.getElementById('accessibility-panel');
        const header = document.getElementById('accessibility-header');
        const toggleButton = document.querySelector('.accessibility-toggle');
        const isActive = panel.classList.contains('active');
        
        panel.classList.toggle('active');
        header.classList.toggle('active');
        toggleButton.setAttribute('aria-expanded', !isActive);
        
        if (!isActive) {
            // Focus first control when opening
            panel.querySelector('input, button').focus();
            // Announce panel opening
            this.announceToScreenReader('Accessibility options panel opened');
        } else {
            // Return focus to toggle button when closing
            document.getElementById('accessibility-toggle').focus();
            this.announceToScreenReader('Accessibility options panel closed');
        }
    }

    setFontSize(size) {
        document.documentElement.style.fontSize = `${size}px`;
        this.userPreferences.fontSize = size;
        this.savePreferences();
    }

    setLineHeight(height) {
        document.body.style.lineHeight = height;
        this.userPreferences.lineHeight = height;
        this.savePreferences();
    }

    setReduceMotion(reduce) {
        this.userPreferences.reduceMotion = reduce;
        if (reduce) {
            document.documentElement.style.setProperty('--transition-fast', '0.01ms');
            document.documentElement.style.setProperty('--transition-base', '0.01ms');
            document.documentElement.style.setProperty('--transition-slow', '0.01ms');
        } else {
            document.documentElement.style.removeProperty('--transition-fast');
            document.documentElement.style.removeProperty('--transition-base');
            document.documentElement.style.removeProperty('--transition-slow');
        }
        this.savePreferences();
    }

    setKeyboardNavigation(enable) {
        this.userPreferences.keyboardNavigation = enable;
        if (enable) {
            this.enableKeyboardNavigation();
        } else {
            this.disableKeyboardNavigation();
        }
        this.savePreferences();
    }

    setSoundFeedback(enable) {
        this.userPreferences.soundFeedback = enable;
        this.savePreferences();
    }

    enableKeyboardNavigation() {
        this.isKeyboardNavigation = true;
        document.body.classList.add('keyboard-navigation');
        document.getElementById('keyboard-nav-toggle').checked = true;
    }

    disableKeyboardNavigation() {
        this.isKeyboardNavigation = false;
        document.body.classList.remove('keyboard-navigation');
    }

    setupKeyboardNavigation() {
        // Add tabindex to interactive elements
        const interactiveElements = document.querySelectorAll('button, [role="button"], input, select, textarea, a[href]');
        interactiveElements.forEach((element, index) => {
            if (!element.hasAttribute('tabindex')) {
                element.setAttribute('tabindex', '0');
            }
        });

        // Add ARIA labels where missing
        this.enhanceARIA();
    }

    enhanceARIA() {
        // Add ARIA labels to buttons without proper labels
        document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])').forEach(button => {
            if (button.textContent.trim()) {
                button.setAttribute('aria-label', button.textContent.trim());
            }
        });

        // Mark main content area
        const mainContent = document.querySelector('main') || document.querySelector('.container');
        if (mainContent && !mainContent.id) {
            mainContent.id = 'main-content';
        }

        // Add live region for announcements
        if (!document.getElementById('sr-live-region')) {
            const liveRegion = document.createElement('div');
            liveRegion.id = 'sr-live-region';
            liveRegion.className = 'sr-only';
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            document.body.appendChild(liveRegion);
        }
    }

    setupFontSizeControls() {
        // Apply stored font size
        if (this.userPreferences.fontSize) {
            document.documentElement.style.fontSize = `${this.userPreferences.fontSize}px`;
            document.getElementById('font-size-slider').value = this.userPreferences.fontSize;
            document.getElementById('font-size-value').textContent = `${this.userPreferences.fontSize}px`;
        }

        // Apply stored line height
        if (this.userPreferences.lineHeight) {
            document.body.style.lineHeight = this.userPreferences.lineHeight;
            document.getElementById('line-height-slider').value = this.userPreferences.lineHeight;
            document.getElementById('line-height-value').textContent = this.userPreferences.lineHeight;
        }
    }

    setupMotionControls() {
        if (this.userPreferences.reduceMotion) {
            this.setReduceMotion(true);
        }
    }

    increaseFontSize() {
        const slider = document.getElementById('font-size-slider');
        const currentSize = parseInt(slider.value);
        const newSize = Math.min(24, currentSize + 1);
        slider.value = newSize;
        this.setFontSize(newSize);
        document.getElementById('font-size-value').textContent = `${newSize}px`;
    }

    decreaseFontSize() {
        const slider = document.getElementById('font-size-slider');
        const currentSize = parseInt(slider.value);
        const newSize = Math.max(12, currentSize - 1);
        slider.value = newSize;
        this.setFontSize(newSize);
        document.getElementById('font-size-value').textContent = `${newSize}px`;
    }

    applyStoredTheme() {
        const storedTheme = this.userPreferences.theme || 'dark';
        this.setTheme(storedTheme);
    }

    loadPreferences() {
        const defaultPreferences = {
            theme: 'dark',
            fontSize: 16,
            lineHeight: 1.6,
            reduceMotion: false,
            keyboardNavigation: false,
            soundFeedback: false
        };

        try {
            const stored = localStorage.getItem('jarvis-accessibility-preferences');
            return stored ? { ...defaultPreferences, ...JSON.parse(stored) } : defaultPreferences;
        } catch (error) {
            console.warn('Failed to load accessibility preferences:', error);
            return defaultPreferences;
        }
    }

    savePreferences() {
        try {
            localStorage.setItem('jarvis-accessibility-preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.warn('Failed to save accessibility preferences:', error);
        }
    }

    resetPreferences() {
        // Reset to defaults
        this.userPreferences = {
            theme: 'dark',
            fontSize: 16,
            lineHeight: 1.6,
            reduceMotion: false,
            keyboardNavigation: false,
            soundFeedback: false
        };

        // Apply defaults
        this.setTheme('dark');
        this.setFontSize(16);
        this.setLineHeight(1.6);
        this.setReduceMotion(false);
        this.setKeyboardNavigation(false);
        this.setSoundFeedback(false);

        // Update UI
        document.getElementById('font-size-slider').value = 16;
        document.getElementById('font-size-value').textContent = '16px';
        document.getElementById('line-height-slider').value = 1.6;
        document.getElementById('line-height-value').textContent = '1.6';
        document.getElementById('motion-toggle').checked = false;
        document.getElementById('keyboard-nav-toggle').checked = false;
        document.getElementById('sound-toggle').checked = false;

        this.savePreferences();
        this.announceToScreenReader('Accessibility preferences reset to defaults');
    }

    announceToScreenReader(message) {
        const liveRegion = document.getElementById('sr-live-region');
        if (liveRegion) {
            liveRegion.textContent = message;
            // Clear after announcement
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        }
    }

    playSound(soundType) {
        if (!this.userPreferences.soundFeedback) return;

        // Create audio context for sound feedback
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // Different sounds for different actions
            switch (soundType) {
                case 'theme-change':
                    oscillator.frequency.value = 800;
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    break;
                case 'button-click':
                    oscillator.frequency.value = 1000;
                    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
                    break;
                case 'error':
                    oscillator.frequency.value = 400;
                    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                    break;
                default:
                    oscillator.frequency.value = 600;
                    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
            }

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.warn('Could not play sound feedback:', error);
        }
    }

    // Public API for other modules
    getTheme() {
        return this.currentTheme;
    }

    getPreferences() {
        return { ...this.userPreferences };
    }

    updatePreference(key, value) {
        this.userPreferences[key] = value;
        this.savePreferences();
    }
}

// Initialize theme manager when DOM is ready
let themeManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        themeManager = new ThemeManager();
    });
} else {
    themeManager = new ThemeManager();
}

// Export for use by other modules
window.JarvisThemeManager = themeManager;
