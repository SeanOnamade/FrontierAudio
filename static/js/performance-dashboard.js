/**
 * JARVIS Performance Dashboard - Real-time monitoring and analytics
 * Displays system performance, user behavior, and predictive insights
 */

class PerformanceDashboard {
    constructor() {
        this.updateInterval = 30000; // 30 seconds
        this.charts = {};
        this.metrics = {};
        this.isVisible = false;
        this.init();
    }

    init() {
        this.createDashboardHTML();
        this.bindEvents();
        this.startUpdates();
    }

    createDashboardHTML() {
        const dashboardHTML = `
            <div id="performance-dashboard" class="performance-dashboard hidden">
                <div class="dashboard-header">
                    <h2>🔥 JARVIS Performance Dashboard</h2>
                    <div class="dashboard-controls">
                        <button id="refresh-dashboard" class="btn small">Refresh</button>
                        <button id="export-metrics" class="btn small">Export</button>
                        <button id="close-dashboard" class="btn small">✕</button>
                    </div>
                </div>

                <div class="dashboard-grid">
                    <!-- System Health Overview -->
                    <div class="dashboard-card system-health">
                        <h3>System Health</h3>
                        <div class="health-status" id="health-status">
                            <div class="status-indicator" id="status-indicator"></div>
                            <span id="status-text">Checking...</span>
                        </div>
                        <div class="health-metrics">
                            <div class="metric">
                                <span class="metric-label">CPU Usage</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" id="cpu-fill"></div>
                                    <span class="metric-value" id="cpu-value">-</span>
                                </div>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Memory Usage</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" id="memory-fill"></div>
                                    <span class="metric-value" id="memory-value">-</span>
                                </div>
                            </div>
                            <div class="metric">
                                <span class="metric-label">Response Time</span>
                                <div class="metric-bar">
                                    <div class="metric-fill" id="response-fill"></div>
                                    <span class="metric-value" id="response-value">-</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Performance Metrics -->
                    <div class="dashboard-card performance-metrics">
                        <h3>Performance Metrics</h3>
                        <div class="metrics-grid">
                            <div class="metric-item">
                                <div class="metric-number" id="avg-response-time">-</div>
                                <div class="metric-label">Avg Response Time</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-number" id="cache-hit-rate">-</div>
                                <div class="metric-label">Cache Hit Rate</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-number" id="queries-per-minute">-</div>
                                <div class="metric-label">Queries/Min</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-number" id="active-users">-</div>
                                <div class="metric-label">Active Users</div>
                            </div>
                        </div>
                    </div>

                    <!-- Cache Statistics -->
                    <div class="dashboard-card cache-stats">
                        <h3>Cache Performance</h3>
                        <div class="cache-metrics">
                            <div class="cache-item">
                                <span class="cache-label">Total Operations</span>
                                <span class="cache-value" id="cache-operations">-</span>
                            </div>
                            <div class="cache-item">
                                <span class="cache-label">Cache Hits</span>
                                <span class="cache-value" id="cache-hits">-</span>
                            </div>
                            <div class="cache-item">
                                <span class="cache-label">Cache Misses</span>
                                <span class="cache-value" id="cache-misses">-</span>
                            </div>
                            <div class="cache-item">
                                <span class="cache-label">Redis Available</span>
                                <span class="cache-value" id="redis-status">-</span>
                            </div>
                        </div>
                        <div class="cache-chart">
                            <canvas id="cache-chart" width="300" height="150"></canvas>
                        </div>
                    </div>

                    <!-- User Analytics -->
                    <div class="dashboard-card user-analytics">
                        <h3>User Behavior</h3>
                        <div class="user-stats">
                            <div class="stat-item">
                                <span class="stat-label">Unique Users (24h)</span>
                                <span class="stat-value" id="unique-users">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Total Events</span>
                                <span class="stat-value" id="total-events">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Most Active Role</span>
                                <span class="stat-value" id="active-role">-</span>
                            </div>
                        </div>
                        <div class="activity-timeline" id="activity-timeline">
                            <!-- Activity timeline will be populated here -->
                        </div>
                    </div>

                    <!-- Slow Queries -->
                    <div class="dashboard-card slow-queries">
                        <h3>Database Performance</h3>
                        <div class="db-stats">
                            <div class="db-stat">
                                <span class="db-label">Pool Utilization</span>
                                <span class="db-value" id="pool-utilization">-</span>
                            </div>
                            <div class="db-stat">
                                <span class="db-label">Avg Query Time</span>
                                <span class="db-value" id="avg-query-time">-</span>
                            </div>
                        </div>
                        <div class="slow-queries-list" id="slow-queries-list">
                            <!-- Slow queries will be populated here -->
                        </div>
                    </div>

                    <!-- Predictive Maintenance -->
                    <div class="dashboard-card maintenance-predictions">
                        <h3>Predictive Maintenance</h3>
                        <div class="predictions-list" id="predictions-list">
                            <!-- Predictions will be populated here -->
                        </div>
                    </div>

                    <!-- Real-time Chart -->
                    <div class="dashboard-card realtime-chart">
                        <h3>Real-time Response Times</h3>
                        <canvas id="realtime-chart" width="600" height="200"></canvas>
                    </div>

                    <!-- Alerts Panel -->
                    <div class="dashboard-card alerts-panel">
                        <h3>Active Alerts</h3>
                        <div class="alerts-list" id="alerts-list">
                            <div class="no-alerts">No active alerts</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', dashboardHTML);
        this.initializeCharts();
    }

    bindEvents() {
        // Dashboard toggle
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'p') {
                e.preventDefault();
                this.toggleDashboard();
            }
        });

        // Dashboard controls
        document.getElementById('refresh-dashboard').addEventListener('click', () => {
            this.updateMetrics();
        });

        document.getElementById('export-metrics').addEventListener('click', () => {
            this.exportMetrics();
        });

        document.getElementById('close-dashboard').addEventListener('click', () => {
            this.hideDashboard();
        });

        // Create dashboard toggle button
        const toggleButton = document.createElement('button');
        toggleButton.id = 'dashboard-toggle';
        toggleButton.className = 'btn small dashboard-toggle';
        toggleButton.innerHTML = '📊';
        toggleButton.title = 'Performance Dashboard (Ctrl+P)';
        toggleButton.addEventListener('click', () => this.toggleDashboard());

        // Add to theme controls
        const themeControls = document.querySelector('.theme-controls');
        if (themeControls) {
            themeControls.appendChild(toggleButton);
        }
    }

    initializeCharts() {
        // Initialize cache chart
        const cacheCanvas = document.getElementById('cache-chart');
        if (cacheCanvas) {
            this.charts.cache = this.createDonutChart(cacheCanvas, 'Cache Hit Rate');
        }

        // Initialize real-time chart
        const realtimeCanvas = document.getElementById('realtime-chart');
        if (realtimeCanvas) {
            this.charts.realtime = this.createLineChart(realtimeCanvas, 'Response Time (ms)');
        }
    }

    createDonutChart(canvas, title) {
        const ctx = canvas.getContext('2d');
        return {
            canvas: ctx,
            data: { hits: 0, misses: 0 },
            update: function(hits, misses) {
                this.data = { hits, misses };
                this.draw();
            },
            draw: function() {
                const ctx = this.canvas;
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const radius = Math.min(centerX, centerY) - 20;
                
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                const total = this.data.hits + this.data.misses;
                if (total === 0) return;
                
                const hitAngle = (this.data.hits / total) * 2 * Math.PI;
                
                // Draw hit portion (green)
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + hitAngle);
                ctx.lineWidth = 20;
                ctx.strokeStyle = '#4CAF50';
                ctx.stroke();
                
                // Draw miss portion (red)
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, -Math.PI / 2 + hitAngle, -Math.PI / 2 + 2 * Math.PI);
                ctx.lineWidth = 20;
                ctx.strokeStyle = '#f44336';
                ctx.stroke();
                
                // Draw percentage in center
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px Arial';
                ctx.textAlign = 'center';
                const percentage = Math.round((this.data.hits / total) * 100);
                ctx.fillText(`${percentage}%`, centerX, centerY);
            }
        };
    }

    createLineChart(canvas, title) {
        const ctx = canvas.getContext('2d');
        return {
            canvas: ctx,
            data: [],
            maxPoints: 50,
            update: function(value) {
                this.data.push(value);
                if (this.data.length > this.maxPoints) {
                    this.data.shift();
                }
                this.draw();
            },
            draw: function() {
                const ctx = this.canvas;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                if (this.data.length < 2) return;
                
                const maxValue = Math.max(...this.data, 1);
                const stepX = canvas.width / (this.maxPoints - 1);
                const stepY = (canvas.height - 40) / maxValue;
                
                // Draw grid lines
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.lineWidth = 1;
                for (let i = 0; i <= 5; i++) {
                    const y = 20 + (i * (canvas.height - 40) / 5);
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(canvas.width, y);
                    ctx.stroke();
                }
                
                // Draw line
                ctx.beginPath();
                ctx.strokeStyle = '#4CAF50';
                ctx.lineWidth = 2;
                
                for (let i = 0; i < this.data.length; i++) {
                    const x = i * stepX;
                    const y = canvas.height - 20 - (this.data[i] * stepY);
                    
                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
                
                // Draw points
                ctx.fillStyle = '#4CAF50';
                for (let i = 0; i < this.data.length; i++) {
                    const x = i * stepX;
                    const y = canvas.height - 20 - (this.data[i] * stepY);
                    ctx.beginPath();
                    ctx.arc(x, y, 3, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        };
    }

    async updateMetrics() {
        try {
            // Fetch performance analytics
            const [performanceData, userAnalytics, cacheStats] = await Promise.all([
                fetch('/api/analytics/performance').then(r => r.json()),
                fetch('/api/analytics/users').then(r => r.json()),
                fetch('/api/cache/stats').then(r => r.json())
            ]);

            this.updateSystemHealth(performanceData.performance);
            this.updatePerformanceMetrics(performanceData);
            this.updateCacheStats(cacheStats);
            this.updateUserAnalytics(userAnalytics);
            this.updateDatabaseStats(performanceData.database);
            this.updateMaintenancePredictions(performanceData.maintenance_predictions);

        } catch (error) {
            console.error('Failed to update dashboard metrics:', error);
            this.showAlert('Failed to fetch metrics', 'error');
        }
    }

    updateSystemHealth(healthData) {
        if (!healthData) return;

        const statusIndicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('status-text');
        const currentHealth = healthData.current_health;

        if (currentHealth) {
            const status = currentHealth.status;
            statusIndicator.className = `status-indicator ${status}`;
            statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);

            // Update metric bars
            this.updateMetricBar('cpu', currentHealth.cpu_usage, 100);
            this.updateMetricBar('memory', currentHealth.memory_usage, 100);
            this.updateMetricBar('response', currentHealth.response_time * 1000, 5000); // Convert to ms
        }
    }

    updateMetricBar(metricName, value, maxValue) {
        const fill = document.getElementById(`${metricName}-fill`);
        const valueSpan = document.getElementById(`${metricName}-value`);

        if (fill && valueSpan) {
            const percentage = Math.min((value / maxValue) * 100, 100);
            fill.style.width = `${percentage}%`;

            // Color coding
            if (percentage > 90) {
                fill.style.backgroundColor = '#f44336';
            } else if (percentage > 70) {
                fill.style.backgroundColor = '#FF9800';
            } else {
                fill.style.backgroundColor = '#4CAF50';
            }

            // Format value
            if (metricName === 'response') {
                valueSpan.textContent = `${Math.round(value)}ms`;
            } else {
                valueSpan.textContent = `${Math.round(value)}%`;
            }
        }
    }

    updatePerformanceMetrics(data) {
        const metrics = data.performance?.metrics || {};

        this.updateMetricElement('avg-response-time', 
            metrics['api.request_duration']?.average, 
            (val) => `${(val * 1000).toFixed(0)}ms`);

        this.updateMetricElement('cache-hit-rate', 
            data.cache?.hit_rate, 
            (val) => `${val.toFixed(1)}%`);

        this.updateMetricElement('queries-per-minute', 
            metrics['api.request_duration']?.count || 0, 
            (val) => val.toString());

        this.updateMetricElement('active-users', 
            data.performance?.user_activity?.unique_users || 0, 
            (val) => val.toString());

        // Update real-time chart
        if (metrics['api.request_duration']?.average && this.charts.realtime) {
            this.charts.realtime.update(metrics['api.request_duration'].average * 1000);
        }
    }

    updateMetricElement(id, value, formatter) {
        const element = document.getElementById(id);
        if (element && value !== undefined && value !== null) {
            element.textContent = formatter ? formatter(value) : value;
        }
    }

    updateCacheStats(cacheData) {
        if (!cacheData) return;

        this.updateMetricElement('cache-operations', cacheData.total_operations);
        this.updateMetricElement('cache-hits', cacheData.hits);
        this.updateMetricElement('cache-misses', cacheData.misses);
        this.updateMetricElement('redis-status', cacheData.redis_available ? 'Online' : 'Offline');

        // Update cache chart
        if (this.charts.cache) {
            this.charts.cache.update(cacheData.hits || 0, cacheData.misses || 0);
        }
    }

    updateUserAnalytics(userData) {
        if (!userData) return;

        this.updateMetricElement('unique-users', userData.total_events);
        this.updateMetricElement('total-events', userData.total_events);

        // Find most active role
        const roleActivity = userData.role_activity || {};
        const mostActiveRole = Object.keys(roleActivity).reduce((a, b) => 
            roleActivity[a] > roleActivity[b] ? a : b, 'none');
        this.updateMetricElement('active-role', mostActiveRole);

        // Update activity timeline
        this.updateActivityTimeline(userData.hourly_activity);
    }

    updateActivityTimeline(hourlyData) {
        const timeline = document.getElementById('activity-timeline');
        if (!timeline || !hourlyData) return;

        const maxActivity = Math.max(...Object.values(hourlyData), 1);
        timeline.innerHTML = '';

        for (let hour = 0; hour < 24; hour++) {
            const activity = hourlyData[hour] || 0;
            const barHeight = (activity / maxActivity) * 40;

            const bar = document.createElement('div');
            bar.className = 'timeline-bar';
            bar.style.height = `${barHeight}px`;
            bar.title = `${hour}:00 - ${activity} events`;
            timeline.appendChild(bar);
        }
    }

    updateDatabaseStats(dbData) {
        if (!dbData) return;

        this.updateMetricElement('pool-utilization', 
            dbData.pool_utilization, 
            (val) => `${val.toFixed(1)}%`);

        this.updateMetricElement('avg-query-time', 
            dbData.average_db_query_time, 
            (val) => `${(val * 1000).toFixed(0)}ms`);

        // Update slow queries list
        this.updateSlowQueriesList(dbData.slow_queries || []);
    }

    updateSlowQueriesList(slowQueries) {
        const list = document.getElementById('slow-queries-list');
        if (!list) return;

        if (slowQueries.length === 0) {
            list.innerHTML = '<div class="no-slow-queries">No slow queries detected</div>';
            return;
        }

        list.innerHTML = slowQueries.slice(0, 5).map(query => `
            <div class="slow-query-item">
                <div class="query-time">${(query.average_time * 1000).toFixed(0)}ms</div>
                <div class="query-text">${query.query}</div>
                <div class="query-stats">${query.total_executions} executions</div>
            </div>
        `).join('');
    }

    updateMaintenancePredictions(predictions) {
        const list = document.getElementById('predictions-list');
        if (!list) return;

        if (!predictions || predictions.length === 0) {
            list.innerHTML = '<div class="no-predictions">No maintenance predictions</div>';
            return;
        }

        list.innerHTML = predictions.map(prediction => `
            <div class="prediction-item ${prediction.severity}">
                <div class="prediction-type">${prediction.type.replace(/_/g, ' ').toUpperCase()}</div>
                <div class="prediction-message">${prediction.message}</div>
                <div class="prediction-action">${prediction.recommended_action}</div>
                <div class="prediction-confidence">Confidence: ${prediction.confidence}%</div>
            </div>
        `).join('');
    }

    showAlert(message, type = 'info') {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        const alert = document.createElement('div');
        alert.className = `alert-item ${type}`;
        alert.innerHTML = `
            <div class="alert-message">${message}</div>
            <div class="alert-time">${new Date().toLocaleTimeString()}</div>
        `;

        alertsList.insertBefore(alert, alertsList.firstChild);

        // Remove old alerts (keep last 5)
        while (alertsList.children.length > 5) {
            alertsList.removeChild(alertsList.lastChild);
        }

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 10000);
    }

    toggleDashboard() {
        if (this.isVisible) {
            this.hideDashboard();
        } else {
            this.showDashboard();
        }
    }

    showDashboard() {
        const dashboard = document.getElementById('performance-dashboard');
        if (dashboard) {
            dashboard.classList.remove('hidden');
            this.isVisible = true;
            this.updateMetrics();
        }
    }

    hideDashboard() {
        const dashboard = document.getElementById('performance-dashboard');
        if (dashboard) {
            dashboard.classList.add('hidden');
            this.isVisible = false;
        }
    }

    startUpdates() {
        // Update metrics every 30 seconds when dashboard is visible
        setInterval(() => {
            if (this.isVisible) {
                this.updateMetrics();
            }
        }, this.updateInterval);
    }

    exportMetrics() {
        // Export current metrics to JSON
        const data = {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            exported_by: 'JARVIS Performance Dashboard'
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `jarvis-metrics-${new Date().toISOString().slice(0, 19)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.showAlert('Metrics exported successfully', 'success');
    }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.performanceDashboard = new PerformanceDashboard();
    });
} else {
    window.performanceDashboard = new PerformanceDashboard();
}
