// SQL Query Display functionality
(function() {
    let sqlDisplay = null;
    let sqlQueryText = null;
    let sqlProcessingTime = null;
    let sqlResultsCount = null;
    let sqlCloseBtn = null;
    let autoHideTimer = null;

    function initializeSqlDisplay() {
        sqlDisplay = document.getElementById('sql-query-display');
        sqlQueryText = document.getElementById('sql-query-text');
        sqlProcessingTime = document.getElementById('sql-processing-time');
        sqlResultsCount = document.getElementById('sql-results-count');
        sqlCloseBtn = document.getElementById('sql-close-btn');

        if (!sqlDisplay || !sqlQueryText || !sqlCloseBtn) {
            console.warn('SQL display elements not found');
            return false;
        }

        // Close button functionality
        sqlCloseBtn.addEventListener('click', hideSqlDisplay);

        // Hide on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && !sqlDisplay.classList.contains('hidden')) {
                hideSqlDisplay();
            }
        });

        return true;
    }

    function showSqlDisplay(queryData) {
        if (!sqlDisplay) return;

        // Clear any existing auto-hide timer
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
        }

        // Handle both response formats (enhanced_app.py vs app.py)
        const sqlQuery = queryData.sql_query || queryData.data?.sql_query;
        const processingTimeMs = queryData.data?.execution_time_ms;
        const processingTimeSec = queryData.processing_time || queryData.latency;
        const resultsCount = queryData.results_count || queryData.result_count || queryData.data?.result_count;
        
        // Update content
        if (sqlQuery) {
            sqlQueryText.textContent = sqlQuery;
        } else {
            sqlQueryText.textContent = 'N/A (no SQL query available)';
        }

        // Update stats with better handling for both formats
        if (sqlProcessingTime) {
            let processingTime = 0;
            if (processingTimeSec !== undefined) {
                processingTime = Number(processingTimeSec).toFixed(3); // Format to 3 decimal places
            } else if (processingTimeMs !== undefined) {
                processingTime = (processingTimeMs / 1000).toFixed(3); // Convert ms to seconds
            }
            sqlProcessingTime.textContent = `⚡ ${processingTime}s`;
        }
        
        if (sqlResultsCount) {
            const count = resultsCount !== undefined ? resultsCount : 0;
            sqlResultsCount.textContent = `📊 ${count} result${count !== 1 ? 's' : ''}`;
        }

        // Show the display
        sqlDisplay.classList.remove('hidden');

        // Auto-hide after 10 seconds
        autoHideTimer = setTimeout(() => {
            hideSqlDisplay();
        }, 10000);
    }

    function hideSqlDisplay() {
        if (!sqlDisplay) return;

        sqlDisplay.classList.add('hidden');
        
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
    }

    // Initialize when DOM is ready
    function initialize() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeSqlDisplay);
        } else {
            initializeSqlDisplay();
        }
    }

    // Expose functions globally for use by other scripts
    window.SqlDisplay = {
        show: showSqlDisplay,
        hide: hideSqlDisplay,
        init: initialize
    };

    // Auto-initialize
    initialize();
})();