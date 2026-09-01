/**
 * Rastreamento de usuários online — baixa prioridade, pausa quando aba oculta.
 */
(function() {
    'use strict';
    
    var BASE_URL = window.BASE_URL || '';
    var heartbeatInterval = 60000;
    var heartbeatTimer = null;
    
    function sendHeartbeat() {
        if (document.hidden) {
            return;
        }
        var currentPage = window.location.pathname;
        
        if (typeof fetch !== 'undefined') {
            fetch(BASE_URL + 'admin/pageview/track_online.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: 'page=' + encodeURIComponent(currentPage),
                cache: 'no-cache',
                keepalive: true
            }).catch(function() {});
        } else if (typeof XMLHttpRequest !== 'undefined') {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', BASE_URL + 'admin/pageview/track_online.php', true);
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
            xhr.send('page=' + encodeURIComponent(currentPage));
        }
    }
    
    function startHeartbeat() {
        if (heartbeatTimer) {
            return;
        }
        heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
    }

    function stopHeartbeat() {
        if (!heartbeatTimer) {
            return;
        }
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    function scheduleFirst() {
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(function() { sendHeartbeat(); startHeartbeat(); }, { timeout: 5000 });
        } else {
            setTimeout(function() { sendHeartbeat(); startHeartbeat(); }, 3000);
        }
    }
    
    if (typeof document.addEventListener !== 'undefined') {
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                stopHeartbeat();
            } else {
                sendHeartbeat();
                startHeartbeat();
            }
        });
        
        window.addEventListener('beforeunload', stopHeartbeat);
    }

    scheduleFirst();
})();
