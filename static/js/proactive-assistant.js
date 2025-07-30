// Proactive Assistance System for JARVIS
// Monitors conditions and provides automatic notifications and alerts

class ProactiveAssistant {
    constructor(apiEndpoint = '/api') {
        this.apiEndpoint = apiEndpoint;
        this.isActive = false;
        this.monitoringInterval = null;
        this.alertRules = new Map();
        this.notificationQueue = [];
        this.userPreferences = {
            flightDelays: true,
            equipmentMaintenance: true,
            shiftChanges: true,
            priorityTasks: true,
            roleBased: true
        };
        
        // Alert history to prevent spam
        this.alertHistory = new Map();
        this.cooldownPeriods = {
            flight_delay: 15 * 60 * 1000, // 15 minutes
            equipment_maintenance: 30 * 60 * 1000, // 30 minutes
            shift_change: 60 * 60 * 1000, // 1 hour
            priority_task: 5 * 60 * 1000 // 5 minutes
        };
        
        // Monitoring configuration
        this.config = {
            monitoringInterval: 30000, // 30 seconds
            maxNotificationsPerHour: 20,
            priorityThresholds: {
                critical: 0.9,
                high: 0.7,
                medium: 0.5,
                low: 0.3
            }
        };
        
        // Callback handlers
        this.onNotification = null;
        this.onAlert = null;
        this.onCriticalAlert = null;
        
        this.initialize();
    }
    
    initialize() {
        this.setupAlertRules();
        this.loadUserPreferences();
        console.log('ProactiveAssistant initialized');
    }
    
    setupAlertRules() {
        // Flight delay alerts
        this.alertRules.set('flight_delays', {
            condition: 'flight_status_change',
            trigger: (data) => this.checkFlightDelays(data),
            priority: 0.8,
            category: 'operational',
            enabled: true
        });
        
        // Equipment maintenance alerts
        this.alertRules.set('equipment_maintenance', {
            condition: 'equipment_status_change',
            trigger: (data) => this.checkEquipmentMaintenance(data),
            priority: 0.7,
            category: 'maintenance',
            enabled: true
        });
        
        // Shift change alerts
        this.alertRules.set('shift_changes', {
            condition: 'personnel_schedule_change',
            trigger: (data) => this.checkShiftChanges(data),
            priority: 0.6,
            category: 'personnel',
            enabled: true
        });
        
        // Priority task alerts
        this.alertRules.set('priority_tasks', {
            condition: 'task_status_change',
            trigger: (data) => this.checkPriorityTasks(data),
            priority: 0.9,
            category: 'operations',
            enabled: true
        });
        
        // Equipment assignment alerts
        this.alertRules.set('equipment_assignments', {
            condition: 'equipment_assignment_change',
            trigger: (data) => this.checkEquipmentAssignments(data),
            priority: 0.6,
            category: 'logistics',
            enabled: true
        });
        
        // Weather alerts
        this.alertRules.set('weather_alerts', {
            condition: 'weather_change',
            trigger: (data) => this.checkWeatherConditions(data),
            priority: 0.8,
            category: 'safety',
            enabled: true
        });
    }
    
    startMonitoring() {
        if (this.isActive) {
            console.log('Proactive monitoring already active');
            return;
        }
        
        this.isActive = true;
        this.monitoringInterval = setInterval(() => {
            this.performMonitoringCycle();
        }, this.config.monitoringInterval);
        
        console.log('Proactive monitoring started');
        this.notifyUser('Proactive assistance activated', 'system', 0.3);
    }
    
    stopMonitoring() {
        if (!this.isActive) {
            return;
        }
        
        this.isActive = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        console.log('Proactive monitoring stopped');
    }
    
    async performMonitoringCycle() {
        try {
            // Get current system status
            const systemStatus = await this.getSystemStatus();
            
            // Check each alert rule
            for (const [ruleId, rule] of this.alertRules) {
                if (!rule.enabled) continue;
                
                try {
                    const alertResult = await rule.trigger(systemStatus);
                    
                    if (alertResult && alertResult.shouldAlert) {
                        this.processAlert(ruleId, alertResult, rule);
                    }
                } catch (error) {
                    console.error(`Error processing alert rule ${ruleId}:`, error);
                }
            }
            
            // Process notification queue
            this.processNotificationQueue();
            
        } catch (error) {
            console.error('Error in monitoring cycle:', error);
        }
    }
    
    async getSystemStatus() {
        try {
            // This would make multiple API calls to get current status
            const [flights, equipment, personnel] = await Promise.all([
                this.fetchFlightStatus(),
                this.fetchEquipmentStatus(),
                this.fetchPersonnelStatus()
            ]);
            
            return {
                flights,
                equipment,
                personnel,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error fetching system status:', error);
            return null;
        }
    }
    
    async fetchFlightStatus() {
        try {
            const response = await fetch(`${this.apiEndpoint}/flights/status`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching flight status:', error);
        }
        return [];
    }
    
    async fetchEquipmentStatus() {
        try {
            const response = await fetch(`${this.apiEndpoint}/equipment/status`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching equipment status:', error);
        }
        return [];
    }
    
    async fetchPersonnelStatus() {
        try {
            const response = await fetch(`${this.apiEndpoint}/personnel/status`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Error fetching personnel status:', error);
        }
        return [];
    }
    
    // Alert condition checkers
    async checkFlightDelays(systemStatus) {
        if (!systemStatus || !systemStatus.flights) return null;
        
        const delayedFlights = systemStatus.flights.filter(flight => {
            return flight.status === 'delayed' || 
                   (flight.scheduled_departure && 
                    new Date(flight.scheduled_departure) < new Date(Date.now() + 15 * 60 * 1000));
        });
        
        if (delayedFlights.length > 0) {
            return {
                shouldAlert: true,
                message: `${delayedFlights.length} flight(s) delayed: ${delayedFlights.map(f => f.flight_number).join(', ')}`,
                data: delayedFlights,
                priority: delayedFlights.length > 3 ? 0.9 : 0.7,
                actions: ['Show details', 'Update crew', 'Notify passengers']
            };
        }
        
        return null;
    }
    
    async checkEquipmentMaintenance(systemStatus) {
        if (!systemStatus || !systemStatus.equipment) return null;
        
        const maintenanceNeeded = systemStatus.equipment.filter(equipment => {
            return equipment.status === 'maintenance_required' || 
                   equipment.last_service && 
                   (Date.now() - new Date(equipment.last_service).getTime()) > 7 * 24 * 60 * 60 * 1000;
        });
        
        if (maintenanceNeeded.length > 0) {
            return {
                shouldAlert: true,
                message: `${maintenanceNeeded.length} equipment item(s) need maintenance: ${maintenanceNeeded.map(e => e.name).join(', ')}`,
                data: maintenanceNeeded,
                priority: maintenanceNeeded.some(e => e.status === 'critical') ? 0.9 : 0.6,
                actions: ['Schedule maintenance', 'Find replacement', 'Mark unavailable']
            };
        }
        
        return null;
    }
    
    async checkShiftChanges(systemStatus) {
        if (!systemStatus || !systemStatus.personnel) return null;
        
        const now = new Date();
        const soon = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes from now
        
        const upcomingShiftChanges = systemStatus.personnel.filter(person => {
            if (!person.shift_end) return false;
            const shiftEnd = new Date(person.shift_end);
            return shiftEnd > now && shiftEnd <= soon;
        });
        
        if (upcomingShiftChanges.length > 0) {
            return {
                shouldAlert: true,
                message: `${upcomingShiftChanges.length} shift change(s) in next 30 minutes`,
                data: upcomingShiftChanges,
                priority: 0.5,
                actions: ['View schedule', 'Contact replacement', 'Extend shift']
            };
        }
        
        return null;
    }
    
    async checkPriorityTasks(systemStatus) {
        // For demo purposes, simulate priority task detection
        const now = Date.now();
        const randomCheck = Math.random();
        
        if (randomCheck < 0.1) { // 10% chance of priority task
            return {
                shouldAlert: true,
                message: 'Priority task detected: Emergency cleaning required for Gate A12',
                data: { gate: 'A12', task: 'emergency_cleaning', urgency: 'high' },
                priority: 0.9,
                actions: ['Assign team', 'Get supplies', 'Notify supervisor']
            };
        }
        
        return null;
    }
    
    async checkEquipmentAssignments(systemStatus) {
        if (!systemStatus || !systemStatus.equipment) return null;
        
        const unassignedEquipment = systemStatus.equipment.filter(equipment => {
            return equipment.status === 'available' && !equipment.assigned_flight;
        });
        
        if (unassignedEquipment.length > 5) {
            return {
                shouldAlert: true,
                message: `${unassignedEquipment.length} equipment items available for assignment`,
                data: unassignedEquipment,
                priority: 0.4,
                actions: ['View available', 'Auto-assign', 'Schedule maintenance']
            };
        }
        
        return null;
    }
    
    async checkWeatherConditions(systemStatus) {
        // Simulate weather condition check
        const randomWeather = Math.random();
        
        if (randomWeather < 0.05) { // 5% chance of weather alert
            return {
                shouldAlert: true,
                message: 'Weather alert: High winds expected in next 2 hours - secure loose equipment',
                data: { condition: 'high_winds', severity: 'moderate', eta: '2 hours' },
                priority: 0.8,
                actions: ['Secure equipment', 'Notify crews', 'Monitor conditions']
            };
        }
        
        return null;
    }
    
    processAlert(ruleId, alertResult, rule) {
        const alertId = this.generateAlertId(ruleId);
        
        // Check cooldown period
        if (this.isInCooldown(ruleId)) {
            console.log(`Alert ${ruleId} in cooldown period, skipping`);
            return;
        }
        
        // Create alert object
        const alert = {
            id: alertId,
            ruleId: ruleId,
            category: rule.category,
            priority: alertResult.priority,
            message: alertResult.message,
            data: alertResult.data,
            actions: alertResult.actions || [],
            timestamp: Date.now(),
            status: 'active'
        };
        
        // Add to notification queue
        this.addToNotificationQueue(alert);
        
        // Update alert history
        this.updateAlertHistory(ruleId);
        
        console.log('Alert generated:', alert);
    }
    
    isInCooldown(ruleId) {
        const lastAlert = this.alertHistory.get(ruleId);
        if (!lastAlert) return false;
        
        const cooldown = this.cooldownPeriods[ruleId] || 5 * 60 * 1000; // Default 5 minutes
        return (Date.now() - lastAlert) < cooldown;
    }
    
    updateAlertHistory(ruleId) {
        this.alertHistory.set(ruleId, Date.now());
    }
    
    generateAlertId(ruleId) {
        return `${ruleId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }
    
    addToNotificationQueue(alert) {
        // Insert in priority order
        let inserted = false;
        for (let i = 0; i < this.notificationQueue.length; i++) {
            if (alert.priority > this.notificationQueue[i].priority) {
                this.notificationQueue.splice(i, 0, alert);
                inserted = true;
                break;
            }
        }
        
        if (!inserted) {
            this.notificationQueue.push(alert);
        }
        
        // Limit queue size
        if (this.notificationQueue.length > 10) {
            this.notificationQueue = this.notificationQueue.slice(0, 10);
        }
    }
    
    processNotificationQueue() {
        if (this.notificationQueue.length === 0) return;
        
        // Process high-priority alerts immediately
        const criticalAlerts = this.notificationQueue.filter(alert => alert.priority >= 0.9);
        criticalAlerts.forEach(alert => {
            this.deliverNotification(alert);
            this.removeFromQueue(alert.id);
        });
        
        // Process other alerts in batches
        const regularAlerts = this.notificationQueue.filter(alert => alert.priority < 0.9);
        if (regularAlerts.length > 0) {
            const nextAlert = regularAlerts[0];
            this.deliverNotification(nextAlert);
            this.removeFromQueue(nextAlert.id);
        }
    }
    
    removeFromQueue(alertId) {
        this.notificationQueue = this.notificationQueue.filter(alert => alert.id !== alertId);
    }
    
    deliverNotification(alert) {
        // Determine delivery method based on priority
        if (alert.priority >= 0.9) {
            this.deliverCriticalNotification(alert);
        } else if (alert.priority >= 0.7) {
            this.deliverHighPriorityNotification(alert);
        } else {
            this.deliverRegularNotification(alert);
        }
        
        // Log notification
        console.log('Notification delivered:', alert);
    }
    
    deliverCriticalNotification(alert) {
        // Critical notifications: sound + visual + voice
        this.playAlertSound('critical');
        this.showVisualAlert(alert, 'critical');
        this.speakNotification(alert);
        
        if (this.onCriticalAlert) {
            this.onCriticalAlert(alert);
        }
    }
    
    deliverHighPriorityNotification(alert) {
        // High priority: sound + visual
        this.playAlertSound('high');
        this.showVisualAlert(alert, 'high');
        
        if (this.onAlert) {
            this.onAlert(alert);
        }
    }
    
    deliverRegularNotification(alert) {
        // Regular: visual only
        this.showVisualAlert(alert, 'normal');
        
        if (this.onNotification) {
            this.onNotification(alert);
        }
    }
    
    playAlertSound(priority) {
        // Create audio context for sound generation
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            // Different sounds for different priorities
            if (priority === 'critical') {
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            } else if (priority === 'high') {
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.2);
            }
        } catch (error) {
            console.warn('Could not play alert sound:', error);
        }
    }
    
    showVisualAlert(alert, priority) {
        const alertElement = document.createElement('div');
        alertElement.className = `proactive-alert priority-${priority}`;
        alertElement.innerHTML = `
            <div class="alert-header">
                <span class="alert-icon">${this.getAlertIcon(alert.category)}</span>
                <span class="alert-title">${this.getAlertTitle(alert.category)}</span>
                <span class="alert-time">${new Date().toLocaleTimeString()}</span>
            </div>
            <div class="alert-message">${alert.message}</div>
            ${alert.actions.length > 0 ? `
                <div class="alert-actions">
                    ${alert.actions.map(action => `
                        <button class="alert-action-btn" onclick="window.proactiveAssistant.handleAlertAction('${alert.id}', '${action}')">
                            ${action}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            <button class="alert-dismiss" onclick="this.parentElement.remove()">×</button>
        `;
        
        // Add styles if not already present
        this.ensureAlertStyles();
        
        // Add to page
        document.body.appendChild(alertElement);
        
        // Auto-remove after timeout (unless critical)
        if (priority !== 'critical') {
            setTimeout(() => {
                if (alertElement.parentElement) {
                    alertElement.remove();
                }
            }, priority === 'high' ? 10000 : 5000);
        }
    }
    
    ensureAlertStyles() {
        if (document.getElementById('proactive-alert-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'proactive-alert-styles';
        styles.textContent = `
            .proactive-alert {
                position: fixed;
                top: 20px;
                right: 20px;
                max-width: 400px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                padding: 16px;
                z-index: 10000;
                border-left: 4px solid #2196F3;
                margin-bottom: 10px;
            }
            
            .proactive-alert.priority-critical {
                border-left-color: #f44336;
                animation: alertPulse 1s infinite;
            }
            
            .proactive-alert.priority-high {
                border-left-color: #FF9800;
            }
            
            .alert-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                font-weight: bold;
            }
            
            .alert-icon {
                font-size: 18px;
            }
            
            .alert-time {
                margin-left: auto;
                font-size: 12px;
                opacity: 0.7;
            }
            
            .alert-message {
                margin-bottom: 12px;
                color: #333;
            }
            
            .alert-actions {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            
            .alert-action-btn {
                background: #2196F3;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            }
            
            .alert-action-btn:hover {
                background: #1976D2;
            }
            
            .alert-dismiss {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                opacity: 0.5;
            }
            
            .alert-dismiss:hover {
                opacity: 1;
            }
            
            @keyframes alertPulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }
        `;
        
        document.head.appendChild(styles);
    }
    
    getAlertIcon(category) {
        const icons = {
            operational: '✈️',
            maintenance: '🔧',
            personnel: '👥',
            operations: '📋',
            logistics: '📦',
            safety: '⚠️'
        };
        return icons[category] || '📢';
    }
    
    getAlertTitle(category) {
        const titles = {
            operational: 'Flight Alert',
            maintenance: 'Maintenance Alert',
            personnel: 'Personnel Alert',
            operations: 'Operations Alert',
            logistics: 'Logistics Alert',
            safety: 'Safety Alert'
        };
        return titles[category] || 'System Alert';
    }
    
    speakNotification(alert) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(
                `Alert: ${alert.message}`
            );
            utterance.volume = 0.7;
            utterance.rate = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }
    
    handleAlertAction(alertId, action) {
        console.log('Alert action triggered:', { alertId, action });
        
        // Find the alert
        const alert = this.notificationQueue.find(a => a.id === alertId);
        if (!alert) return;
        
        // Process the action
        switch (action) {
            case 'Show details':
                this.showAlertDetails(alert);
                break;
            case 'Assign team':
                this.showTeamAssignment(alert);
                break;
            case 'Schedule maintenance':
                this.showMaintenanceScheduler(alert);
                break;
            default:
                console.log(`Action "${action}" not implemented yet`);
        }
    }
    
    showAlertDetails(alert) {
        console.log('Showing alert details:', alert);
        // Implementation would show a modal with detailed information
    }
    
    showTeamAssignment(alert) {
        console.log('Showing team assignment for:', alert);
        // Implementation would show team assignment interface
    }
    
    showMaintenanceScheduler(alert) {
        console.log('Showing maintenance scheduler for:', alert);
        // Implementation would show maintenance scheduling interface
    }
    
    notifyUser(message, type = 'info', priority = 0.5) {
        const notification = {
            id: this.generateAlertId('user_notification'),
            message,
            type,
            priority,
            timestamp: Date.now()
        };
        
        this.addToNotificationQueue(notification);
    }
    
    // Configuration methods
    setUserPreferences(preferences) {
        this.userPreferences = { ...this.userPreferences, ...preferences };
        this.saveUserPreferences();
    }
    
    saveUserPreferences() {
        try {
            localStorage.setItem('jarvis_proactive_preferences', JSON.stringify(this.userPreferences));
        } catch (error) {
            console.warn('Could not save user preferences:', error);
        }
    }
    
    loadUserPreferences() {
        try {
            const saved = localStorage.getItem('jarvis_proactive_preferences');
            if (saved) {
                this.userPreferences = { ...this.userPreferences, ...JSON.parse(saved) };
            }
        } catch (error) {
            console.warn('Could not load user preferences:', error);
        }
    }
    
    enableRule(ruleId, enabled = true) {
        const rule = this.alertRules.get(ruleId);
        if (rule) {
            rule.enabled = enabled;
            console.log(`Alert rule ${ruleId} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }
    
    getActiveAlerts() {
        return this.notificationQueue.filter(alert => alert.status === 'active');
    }
    
    clearAllAlerts() {
        this.notificationQueue = [];
        // Remove visual alerts from DOM
        document.querySelectorAll('.proactive-alert').forEach(el => el.remove());
        console.log('All alerts cleared');
    }
    
    getSystemStats() {
        return {
            isActive: this.isActive,
            alertRulesCount: this.alertRules.size,
            enabledRulesCount: Array.from(this.alertRules.values()).filter(r => r.enabled).length,
            queueLength: this.notificationQueue.length,
            alertHistory: this.alertHistory.size,
            userPreferences: this.userPreferences
        };
    }
}

// Expose globally for debugging
window.ProactiveAssistant = ProactiveAssistant;
