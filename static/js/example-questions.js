// Example Questions Panel functionality
(function() {
    let isInitialized = false;

    function initializeExampleQuestions() {
        if (isInitialized) return;
        
        const tab = document.getElementById('example-questions-tab');
        const panel = document.getElementById('example-questions-panel');
        const closeButton = document.getElementById('close-panel');
        
        if (!tab || !panel || !closeButton) {
            console.warn('Example questions elements not found');
            return;
        }

        // Show panel
        tab.addEventListener('click', function() {
            panel.classList.add('open');
            // Allow background scrolling - removed overflow hidden
        });

        // Simple, reliable close functionality
        function closePanel() {
            console.log('Closing panel');
            panel.classList.remove('open');
        }
        
        // Single click event - simple and reliable
        closeButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
        });
        
        // Keyboard support
        closeButton.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                closePanel();
            }
        });

        // Hide panel when clicking outside
        panel.addEventListener('click', function(e) {
            if (e.target === panel) {
                closePanel();
            }
        });

        // Hide panel on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panel.classList.contains('open')) {
                closePanel();
            }
        });

        isInitialized = true;
        console.log('✅ Example Questions panel initialized');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeExampleQuestions);
    } else {
        initializeExampleQuestions();
    }
})();