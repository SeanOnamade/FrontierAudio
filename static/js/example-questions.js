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
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        });

        // Hide panel
        closeButton.addEventListener('click', function() {
            panel.classList.remove('open');
            document.body.style.overflow = ''; // Restore scroll
        });

        // Hide panel when clicking outside
        panel.addEventListener('click', function(e) {
            if (e.target === panel) {
                panel.classList.remove('open');
                document.body.style.overflow = '';
            }
        });

        // Hide panel on escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && panel.classList.contains('open')) {
                panel.classList.remove('open');
                document.body.style.overflow = '';
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