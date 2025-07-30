/**
 * JARVIS User Personalization System
 * Handles user profiles, role-based filtering, custom shortcuts, and adaptive learning
 */

class UserPersonalizationManager {
    constructor() {
        this.currentUser = null;
        this.userProfiles = this.loadUserProfiles();
        this.shortcuts = this.loadShortcuts();
        this.behaviorData = this.loadBehaviorData();
        this.roles = {
            'ramp-worker': {
                name: 'Ramp Worker',
                permissions: ['flight-status', 'equipment-location', 'basic-operations'],
                preferredQueries: ['pushback tractor', 'flight status', 'gate information'],
                color: '#4CAF50'
            },
            'supervisor': {
                name: 'Supervisor',
                permissions: ['flight-status', 'equipment-location', 'staff-management', 'operations-overview'],
                preferredQueries: ['staff assignments', 'operational metrics', 'delay reports'],
                color: '#2196F3'
            },
            'maintenance': {
                name: 'Maintenance Crew',
                permissions: ['equipment-status', 'maintenance-schedules', 'safety-protocols'],
                preferredQueries: ['equipment maintenance', 'safety checks', 'inspection schedules'],
                color: '#FF9800'
            },
            'baggage-handler': {
                name: 'Baggage Handler',
                permissions: ['baggage-tracking', 'flight-status', 'loading-operations'],
                preferredQueries: ['baggage status', 'loading schedule', 'cargo information'],
                color: '#9C27B0'
            },
            'operations-manager': {
                name: 'Operations Manager',
                permissions: ['all'],
                preferredQueries: ['comprehensive reports', 'analytics', 'system status'],
                color: '#F44336'
            }
        };
        this.init();
    }

    init() {
        this.createUserInterface();
        this.createShortcutsPanel();
        this.setupShortcutListeners();
        this.loadLastUser();
        this.startBehaviorTracking();
    }

    createUserInterface() {
        // Create user profile section in the status panel
        const statusPanel = document.querySelector('.status-panel');
        if (statusPanel) {
            const userStatusItem = document.createElement('div');
            userStatusItem.className = 'status-item user-profile-section';
            userStatusItem.innerHTML = `
                <div class="user-profile-panel" id="user-profile-panel">
                    <div class="user-avatar" id="user-avatar">
                        <span id="user-initials">?</span>
                    </div>
                    <div class="user-info">
                        <h4 id="user-name">Guest User</h4>
                        <span class="user-role" id="user-role">No Role Selected</span>
                    </div>
                    <button id="user-settings-btn" class="btn small" aria-label="User Settings">
                        ⚙️
                    </button>
                </div>
            `;
            statusPanel.appendChild(userStatusItem);
        }

        // Create user settings modal
        this.createUserSettingsModal();
    }

    createUserSettingsModal() {
        const modal = document.createElement('div');
        modal.id = 'user-settings-modal';
        modal.className = 'user-settings-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-labelledby', 'user-settings-title');
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-overlay" id="modal-overlay"></div>
            <div class="modal-content glass-panel">
                <div class="modal-header">
                    <h2 id="user-settings-title">User Profile & Settings</h2>
                    <button id="close-modal" class="btn small" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="user-form">
                        <div class="form-group">
                            <label for="user-name-input">Name:</label>
                            <input type="text" id="user-name-input" placeholder="Enter your name" maxlength="50">
                        </div>
                        <div class="form-group">
                            <label for="user-role-select">Role:</label>
                            <select id="user-role-select">
                                <option value="">Select Role</option>
                                ${Object.entries(this.roles).map(([key, role]) => 
                                    `<option value="${key}">${role.name}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="user-badge-input">Employee Badge/ID:</label>
                            <input type="text" id="user-badge-input" placeholder="Badge number" maxlength="20">
                        </div>
                        <div class="form-group">
                            <label for="user-department-input">Department:</label>
                            <input type="text" id="user-department-input" placeholder="Department" maxlength="30">
                        </div>
                        <div class="form-group">
                            <label for="user-shift-select">Shift:</label>
                            <select id="user-shift-select">
                                <option value="">Select Shift</option>
                                <option value="day">Day Shift (6 AM - 2 PM)</option>
                                <option value="evening">Evening Shift (2 PM - 10 PM)</option>
                                <option value="night">Night Shift (10 PM - 6 AM)</option>
                                <option value="rotating">Rotating Shifts</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="personalization-settings">
                        <h3>Personalization</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="adaptive-learning-toggle">
                                Enable Adaptive Learning
                            </label>
                            <small>JARVIS will learn your preferences and suggest relevant queries</small>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="proactive-alerts-toggle">
                                Proactive Alerts
                            </label>
                            <small>Receive notifications about relevant operational changes</small>
                        </div>
                        <div class="form-group">
                            <label for="preferred-language-select">Preferred Language:</label>
                            <select id="preferred-language-select">
                                <option value="en">English</option>
                                <option value="es">Spanish</option>
                                <option value="fr">French</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="response-style-select">Response Style:</label>
                            <select id="response-style-select">
                                <option value="concise">Concise</option>
                                <option value="detailed">Detailed</option>
                                <option value="technical">Technical</option>
                                <option value="friendly">Friendly</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="save-profile" class="btn primary">Save Profile</button>
                    <button id="switch-user" class="btn secondary">Switch User</button>
                    <button id="guest-mode" class="btn secondary">Guest Mode</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.bindModalEvents();
    }

    createShortcutsPanel() {
        // Find or create settings panel
        let settingsPanel = document.getElementById('settings-panel');
        if (!settingsPanel) {
            settingsPanel = document.createElement('div');
            settingsPanel.id = 'settings-panel';
            settingsPanel.className = 'settings-panel glass-panel';
            document.querySelector('main').appendChild(settingsPanel);
        }

        const shortcutsSection = document.createElement('div');
        shortcutsSection.className = 'shortcuts-panel';
        shortcutsSection.innerHTML = `
            <h3>Custom Shortcuts</h3>
            <div class="shortcut-form">
                <input type="text" id="shortcut-trigger" placeholder="Type trigger (e.g., 'fs')" maxlength="10">
                <input type="text" id="shortcut-query" placeholder="Full query (e.g., 'flight status UA2406')" maxlength="200">
                <button id="add-shortcut" class="btn small">Add Shortcut</button>
            </div>
            <div id="shortcuts-list" class="shortcuts-list"></div>
            
            <h4>Quick Actions</h4>
            <div class="quick-actions">
                <button class="quick-action-btn" data-action="status-overview">Status Overview</button>
                <button class="quick-action-btn" data-action="my-tasks">My Tasks</button>
                <button class="quick-action-btn" data-action="emergency-info">Emergency Info</button>
                <button class="quick-action-btn" data-action="shift-report">Shift Report</button>
            </div>
        `;

        settingsPanel.appendChild(shortcutsSection);
        this.renderShortcuts();
    }

    bindModalEvents() {
        const modal = document.getElementById('user-settings-modal');
        const overlay = document.getElementById('modal-overlay');
        const closeBtn = document.getElementById('close-modal');
        const userSettingsBtn = document.getElementById('user-settings-btn');

        // Open modal
        userSettingsBtn.addEventListener('click', () => {
            this.openUserSettings();
        });

        // Close modal
        const closeModal = () => {
            modal.setAttribute('aria-hidden', 'true');
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        };

        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', closeModal);

        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') {
                closeModal();
            }
        });

        // Save profile
        document.getElementById('save-profile').addEventListener('click', () => {
            this.saveUserProfile();
            closeModal();
        });

        // Switch user
        document.getElementById('switch-user').addEventListener('click', () => {
            this.switchUser();
        });

        // Guest mode
        document.getElementById('guest-mode').addEventListener('click', () => {
            this.setGuestMode();
            closeModal();
        });
    }

    setupShortcutListeners() {
        // Add shortcut button
        document.getElementById('add-shortcut').addEventListener('click', () => {
            this.addShortcut();
        });

        // Remove shortcut buttons (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-shortcut')) {
                const trigger = e.target.dataset.trigger;
                this.removeShortcut(trigger);
            }
        });

        // Quick action buttons
        document.querySelectorAll('.quick-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.executeQuickAction(action);
            });
        });

        // Global shortcut detection
        let shortcutBuffer = '';
        let shortcutTimeout;

        document.addEventListener('keydown', (e) => {
            // Only process shortcuts when not in input fields
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Clear buffer on special keys
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
                shortcutBuffer = '';
                clearTimeout(shortcutTimeout);
                return;
            }

            // Add to buffer if alphanumeric
            if (e.key.match(/^[a-zA-Z0-9]$/)) {
                shortcutBuffer += e.key.toLowerCase();
                
                // Check for matching shortcuts
                const matchingShortcut = this.shortcuts.find(s => s.trigger === shortcutBuffer);
                if (matchingShortcut) {
                    e.preventDefault();
                    this.executeShortcut(matchingShortcut);
                    shortcutBuffer = '';
                    clearTimeout(shortcutTimeout);
                    return;
                }

                // Clear buffer after delay
                clearTimeout(shortcutTimeout);
                shortcutTimeout = setTimeout(() => {
                    shortcutBuffer = '';
                }, 2000);

                // Prevent default for letters to avoid conflicts
                if (shortcutBuffer.length === 1) {
                    e.preventDefault();
                }
            }
        });
    }

    openUserSettings() {
        const modal = document.getElementById('user-settings-modal');
        modal.setAttribute('aria-hidden', 'false');
        modal.style.display = 'block';
        document.body.classList.add('modal-open');

        // Populate form with current user data
        if (this.currentUser) {
            document.getElementById('user-name-input').value = this.currentUser.name || '';
            document.getElementById('user-role-select').value = this.currentUser.role || '';
            document.getElementById('user-badge-input').value = this.currentUser.badge || '';
            document.getElementById('user-department-input').value = this.currentUser.department || '';
            document.getElementById('user-shift-select').value = this.currentUser.shift || '';
            document.getElementById('adaptive-learning-toggle').checked = this.currentUser.adaptiveLearning || false;
            document.getElementById('proactive-alerts-toggle').checked = this.currentUser.proactiveAlerts || false;
            document.getElementById('preferred-language-select').value = this.currentUser.preferredLanguage || 'en';
            document.getElementById('response-style-select').value = this.currentUser.responseStyle || 'concise';
        }

        // Focus first input
        document.getElementById('user-name-input').focus();
    }

    saveUserProfile() {
        const userData = {
            name: document.getElementById('user-name-input').value.trim(),
            role: document.getElementById('user-role-select').value,
            badge: document.getElementById('user-badge-input').value.trim(),
            department: document.getElementById('user-department-input').value.trim(),
            shift: document.getElementById('user-shift-select').value,
            adaptiveLearning: document.getElementById('adaptive-learning-toggle').checked,
            proactiveAlerts: document.getElementById('proactive-alerts-toggle').checked,
            preferredLanguage: document.getElementById('preferred-language-select').value,
            responseStyle: document.getElementById('response-style-select').value,
            lastLogin: new Date().toISOString(),
            createdAt: this.currentUser?.createdAt || new Date().toISOString()
        };

        if (!userData.name) {
            alert('Please enter your name');
            return;
        }

        if (!userData.role) {
            alert('Please select your role');
            return;
        }

        // Generate user ID if new user
        const userId = this.currentUser?.id || this.generateUserId(userData.name, userData.badge);
        userData.id = userId;

        // Save to profiles
        this.userProfiles[userId] = userData;
        this.currentUser = userData;

        // Update UI
        this.updateUserDisplay();
        this.saveUserProfiles();
        this.saveLastUser(userId);

        // Apply role-based filtering
        this.applyRoleBasedFiltering();

        // Announce change
        if (window.JarvisThemeManager) {
            window.JarvisThemeManager.announceToScreenReader(`Profile saved for ${userData.name}, ${this.roles[userData.role].name}`);
        }
    }

    switchUser() {
        // Show user selection interface
        const existingUsers = Object.values(this.userProfiles);
        if (existingUsers.length === 0) {
            alert('No existing users found. Please create a new profile.');
            return;
        }

        const userList = existingUsers.map(user => 
            `${user.name} (${this.roles[user.role]?.name || user.role})`
        );

        const selection = prompt(`Select a user:\n${userList.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n\nEnter number:`);
        
        if (selection && !isNaN(selection)) {
            const index = parseInt(selection) - 1;
            if (index >= 0 && index < existingUsers.length) {
                this.setCurrentUser(existingUsers[index].id);
            }
        }
    }

    setCurrentUser(userId) {
        this.currentUser = this.userProfiles[userId];
        if (this.currentUser) {
            this.updateUserDisplay();
            this.applyRoleBasedFiltering();
            this.saveLastUser(userId);
        }
    }

    setGuestMode() {
        this.currentUser = {
            id: 'guest',
            name: 'Guest User',
            role: '',
            adaptiveLearning: false,
            proactiveAlerts: false,
            preferredLanguage: 'en',
            responseStyle: 'concise'
        };
        this.updateUserDisplay();
    }

    updateUserDisplay() {
        if (!this.currentUser) return;

        const userInitials = document.getElementById('user-initials');
        const userName = document.getElementById('user-name');
        const userRole = document.getElementById('user-role');
        const userAvatar = document.getElementById('user-avatar');

        if (userInitials) {
            const initials = this.currentUser.name
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            userInitials.textContent = initials;
        }

        if (userName) {
            userName.textContent = this.currentUser.name;
        }

        if (userRole) {
            const roleName = this.currentUser.role ? this.roles[this.currentUser.role]?.name : 'No Role';
            userRole.textContent = roleName || 'Unknown Role';
        }

        if (userAvatar && this.currentUser.role) {
            const roleColor = this.roles[this.currentUser.role]?.color || '#4CAF50';
            userAvatar.style.background = roleColor;
        }
    }

    applyRoleBasedFiltering() {
        if (!this.currentUser?.role || this.currentUser.role === '') return;

        const roleConfig = this.roles[this.currentUser.role];
        if (!roleConfig) return;

        // Apply permission-based filtering
        this.currentPermissions = roleConfig.permissions;

        // Update suggested queries based on role
        this.updateSuggestedQueries(roleConfig.preferredQueries);

        // Notify other components about role change
        document.dispatchEvent(new CustomEvent('user-role-changed', {
            detail: {
                role: this.currentUser.role,
                permissions: this.currentPermissions,
                preferredQueries: roleConfig.preferredQueries
            }
        }));
    }

    updateSuggestedQueries(preferredQueries) {
        // Update test queries section if it exists
        const testButtons = document.getElementById('test-buttons-container');
        if (testButtons && preferredQueries) {
            // Add role-specific queries
            preferredQueries.forEach(query => {
                const button = document.createElement('button');
                button.className = 'test-query-btn role-specific';
                button.textContent = query;
                button.onclick = () => {
                    if (window.voiceAssistant) {
                        window.voiceAssistant.processTestQuery(query);
                    }
                };
                testButtons.appendChild(button);
            });
        }
    }

    addShortcut() {
        const trigger = document.getElementById('shortcut-trigger').value.trim().toLowerCase();
        const query = document.getElementById('shortcut-query').value.trim();

        if (!trigger || !query) {
            alert('Please enter both trigger and query');
            return;
        }

        if (trigger.length < 2) {
            alert('Trigger must be at least 2 characters');
            return;
        }

        // Check for existing trigger
        if (this.shortcuts.find(s => s.trigger === trigger)) {
            alert('This trigger already exists');
            return;
        }

        this.shortcuts.push({
            trigger,
            query,
            userId: this.currentUser?.id,
            createdAt: new Date().toISOString()
        });

        this.saveShortcuts();
        this.renderShortcuts();

        // Clear form
        document.getElementById('shortcut-trigger').value = '';
        document.getElementById('shortcut-query').value = '';

        // Announce addition
        if (window.JarvisThemeManager) {
            window.JarvisThemeManager.announceToScreenReader(`Shortcut added: ${trigger} for ${query}`);
        }
    }

    removeShortcut(trigger) {
        this.shortcuts = this.shortcuts.filter(s => s.trigger !== trigger);
        this.saveShortcuts();
        this.renderShortcuts();
    }

    renderShortcuts() {
        const shortcutsList = document.getElementById('shortcuts-list');
        if (!shortcutsList) return;

        const userShortcuts = this.shortcuts.filter(s => 
            !s.userId || s.userId === this.currentUser?.id
        );

        if (userShortcuts.length === 0) {
            shortcutsList.innerHTML = '<p class="text-muted">No shortcuts created yet</p>';
            return;
        }

        shortcutsList.innerHTML = userShortcuts.map(shortcut => `
            <div class="shortcut-item">
                <div class="shortcut-info">
                    <span class="shortcut-trigger">${shortcut.trigger}</span>
                    <span class="shortcut-query">${shortcut.query}</span>
                </div>
                <button class="btn small remove-shortcut" data-trigger="${shortcut.trigger}" aria-label="Remove shortcut">
                    ✕
                </button>
            </div>
        `).join('');
    }

    executeShortcut(shortcut) {
        if (window.voiceAssistant) {
            window.voiceAssistant.processTestQuery(shortcut.query);
            this.trackBehavior('shortcut-used', { trigger: shortcut.trigger, query: shortcut.query });
        }
    }

    executeQuickAction(action) {
        const actionQueries = {
            'status-overview': 'show me current status overview',
            'my-tasks': 'what are my current tasks',
            'emergency-info': 'show emergency procedures',
            'shift-report': 'generate shift report'
        };

        const query = actionQueries[action];
        if (query && window.voiceAssistant) {
            window.voiceAssistant.processTestQuery(query);
            this.trackBehavior('quick-action', { action, query });
        }
    }

    trackBehavior(action, data = {}) {
        if (!this.currentUser?.adaptiveLearning) return;

        const behaviorEntry = {
            userId: this.currentUser.id,
            action,
            data,
            timestamp: new Date().toISOString(),
            role: this.currentUser.role
        };

        this.behaviorData.push(behaviorEntry);

        // Keep only last 1000 entries per user
        this.behaviorData = this.behaviorData
            .filter(entry => entry.userId === this.currentUser.id)
            .slice(-1000)
            .concat(this.behaviorData.filter(entry => entry.userId !== this.currentUser.id));

        this.saveBehaviorData();
    }

    generateUserId(name, badge) {
        const nameSlug = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const badgeSlug = badge ? badge.replace(/[^a-z0-9]/i, '') : '';
        const timestamp = Date.now().toString(36);
        return `${nameSlug}-${badgeSlug}-${timestamp}`.slice(0, 32);
    }

    loadLastUser() {
        try {
            const lastUserId = localStorage.getItem('jarvis-last-user');
            if (lastUserId && this.userProfiles[lastUserId]) {
                this.setCurrentUser(lastUserId);
            } else {
                this.setGuestMode();
            }
        } catch (error) {
            console.warn('Failed to load last user:', error);
            this.setGuestMode();
        }
    }

    saveLastUser(userId) {
        try {
            localStorage.setItem('jarvis-last-user', userId);
        } catch (error) {
            console.warn('Failed to save last user:', error);
        }
    }

    loadUserProfiles() {
        try {
            const stored = localStorage.getItem('jarvis-user-profiles');
            return stored ? JSON.parse(stored) : {};
        } catch (error) {
            console.warn('Failed to load user profiles:', error);
            return {};
        }
    }

    saveUserProfiles() {
        try {
            localStorage.setItem('jarvis-user-profiles', JSON.stringify(this.userProfiles));
        } catch (error) {
            console.warn('Failed to save user profiles:', error);
        }
    }

    loadShortcuts() {
        try {
            const stored = localStorage.getItem('jarvis-shortcuts');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('Failed to load shortcuts:', error);
            return [];
        }
    }

    saveShortcuts() {
        try {
            localStorage.setItem('jarvis-shortcuts', JSON.stringify(this.shortcuts));
        } catch (error) {
            console.warn('Failed to save shortcuts:', error);
        }
    }

    loadBehaviorData() {
        try {
            const stored = localStorage.getItem('jarvis-behavior-data');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.warn('Failed to load behavior data:', error);
            return [];
        }
    }

    saveBehaviorData() {
        try {
            localStorage.setItem('jarvis-behavior-data', JSON.stringify(this.behaviorData));
        } catch (error) {
            console.warn('Failed to save behavior data:', error);
        }
    }

    startBehaviorTracking() {
        if (!this.currentUser?.adaptiveLearning) return;

        // Track voice queries
        document.addEventListener('voice-query-completed', (e) => {
            this.trackBehavior('voice-query', {
                query: e.detail.query,
                responseTime: e.detail.responseTime,
                successful: e.detail.successful
            });
        });

        // Track button clicks
        document.addEventListener('click', (e) => {
            if (e.target.matches('button[data-action], .test-query-btn')) {
                this.trackBehavior('button-click', {
                    element: e.target.textContent || e.target.dataset.action,
                    location: e.target.closest('[class*="panel"]')?.className || 'unknown'
                });
            }
        });
    }

    // Public API
    getCurrentUser() {
        return this.currentUser;
    }

    getUserPermissions() {
        return this.currentPermissions || [];
    }

    hasPermission(permission) {
        if (!this.currentPermissions) return true; // Guest access
        return this.currentPermissions.includes(permission) || this.currentPermissions.includes('all');
    }

    getAdaptiveSuggestions() {
        if (!this.currentUser?.adaptiveLearning || !this.behaviorData.length) {
            return [];
        }

        // Analyze behavior data for suggestions
        const userBehavior = this.behaviorData.filter(entry => entry.userId === this.currentUser.id);
        const recentQueries = userBehavior
            .filter(entry => entry.action === 'voice-query')
            .slice(-20)
            .map(entry => entry.data.query);

        // Return most common recent queries
        const queryFrequency = {};
        recentQueries.forEach(query => {
            queryFrequency[query] = (queryFrequency[query] || 0) + 1;
        });

        return Object.entries(queryFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([query]) => query);
    }
}

// Initialize personalization manager
let personalizationManager;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        personalizationManager = new UserPersonalizationManager();
    });
} else {
    personalizationManager = new UserPersonalizationManager();
}

// Export for use by other modules
window.JarvisPersonalization = personalizationManager;
