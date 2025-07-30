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
        this.createThemeControls();
        this.createAccessibilityPanel();
        this.applyStoredTheme();
        this.setupKeyboardNavigation();
        this.setupFontSizeControls();
        this.setupMotionControls();
        this.bindEvents();
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

    createAccessibilityPanel() {
        const accessibilityPanel = document.createElement('div');
        accessibilityPanel.id = 'accessibility-panel';
        accessibilityPanel.className = 'accessibility-panel';
        accessibilityPanel.setAttribute('role', 'dialog');
        accessibilityPanel.setAttribute('aria-labelledby', 'accessibility-title');
        accessibilityPanel.innerHTML = `
            <h3 id="accessibility-title">Accessibility Options</h3>
            <div class="accessibility-control">
                <label for="font-size-slider">Font Size:</label>
                <input type="range" id="font-size-slider" min="12" max="24" value="16" step="1" aria-describedby="font-size-value">
                <span id="font-size-value">16px</span>
            </div>
            <div class="accessibility-control">
                <label for="line-height-slider">Line Height:</label>
                <input type="range" id="line-height-slider" min="1.2" max="2.0" value="1.6" step="0.1" aria-describedby="line-height-value">
                <span id="line-height-value">1.6</span>
            </div>
            <div class="accessibility-control">
                <label for="motion-toggle">
                    <input type="checkbox" id="motion-toggle" ${this.userPreferences.reduceMotion ? 'checked' : ''}>
                    Reduce Motion
                </label>
            </div>
            <div class="accessibility-control">
                <label for="keyboard-nav-toggle">
                    <input type="checkbox" id="keyboard-nav-toggle" ${this.userPreferences.keyboardNavigation ? 'checked' : ''}>
                    Enhanced Keyboard Navigation
                </label>
            </div>
            <div class="accessibility-control">
                <label for="sound-toggle">
                    <input type="checkbox" id="sound-toggle" ${this.userPreferences.soundFeedback ? 'checked' : ''}>
                    Sound Feedback
                </label>
            </div>
            <div class="accessibility-control">
                <button id="reset-preferences" class="btn small">Reset to Defaults</button>
            </div>
        `;

        document.querySelector('.theme-controls').after(accessibilityPanel);
    }

    bindEvents() {
        // Theme toggle buttons
        document.querySelectorAll('.theme-toggle[data-theme]').forEach(button => {
            button.addEventListener('click', (e) => {
                this.setTheme(e.target.closest('button').dataset.theme);
            });
        });

        // Accessibility panel toggle
        document.getElementById('accessibility-toggle').addEventListener('click', () => {
            this.toggleAccessibilityPanel();
        });

        // Font size control
        const fontSizeSlider = document.getElementById('font-size-slider');
        const fontSizeValue = document.getElementById('font-size-value');
        fontSizeSlider.addEventListener('input', (e) => {
            const size = e.target.value;
            this.setFontSize(size);
            fontSizeValue.textContent = `${size}px`;
        });

        // Line height control
        const lineHeightSlider = document.getElementById('line-height-slider');
        const lineHeightValue = document.getElementById('line-height-value');
        lineHeightSlider.addEventListener('input', (e) => {
            const height = e.target.value;
            this.setLineHeight(height);
            lineHeightValue.textContent = height;
        });

        // Motion toggle
        document.getElementById('motion-toggle').addEventListener('change', (e) => {
            this.setReduceMotion(e.target.checked);
        });

        // Keyboard navigation toggle
        document.getElementById('keyboard-nav-toggle').addEventListener('change', (e) => {
            this.setKeyboardNavigation(e.target.checked);
        });

        // Sound feedback toggle
        document.getElementById('sound-toggle').addEventListener('change', (e) => {
            this.setSoundFeedback(e.target.checked);
        });

        // Reset preferences
        document.getElementById('reset-preferences').addEventListener('click', () => {
            this.resetPreferences();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'k':
                        e.preventDefault();
                        this.toggleAccessibilityPanel();
                        break;
                    case '1':
                        e.preventDefault();
                        this.setTheme('light');
                        break;
                    case '2':
                        e.preventDefault();
                        this.setTheme('dark');
                        break;
                    case '3':
                        e.preventDefault();
                        this.setTheme('high-contrast');
                        break;
                    case '+':
                    case '=':
                        e.preventDefault();
                        this.increaseFontSize();
                        break;
                    case '-':
                        e.preventDefault();
                        this.decreaseFontSize();
                        break;
                }
            }
        });

        // Detect tab navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !this.isKeyboardNavigation) {
                this.enableKeyboardNavigation();
            }
        });

        // Detect mouse usage
        document.addEventListener('mousedown', () => {
            if (this.isKeyboardNavigation) {
                this.disableKeyboardNavigation();
            }
        });

        // Close accessibility panel when clicking outside
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('accessibility-panel');
            const toggle = document.getElementById('accessibility-toggle');
            if (panel.classList.contains('active') && 
                !panel.contains(e.target) && 
                !toggle.contains(e.target)) {
                this.toggleAccessibilityPanel();
            }
        });

        // Escape key to close panels
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const panel = document.getElementById('accessibility-panel');
                if (panel.classList.contains('active')) {
                    this.toggleAccessibilityPanel();
                    document.getElementById('accessibility-toggle').focus();
                }
            }
        });
    }

    setTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update active button
        document.querySelectorAll('.theme-toggle[data-theme]').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-theme="${theme}"]`).classList.add('active');

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
        const isActive = panel.classList.contains('active');
        
        panel.classList.toggle('active');
        
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
