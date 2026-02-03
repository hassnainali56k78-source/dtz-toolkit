/**
 * Analytics Module
 * Handles anonymous user tracking and analytics
 * Version: 1.0.0
 */

import { rtdb, FirebaseUtils } from './firebase-init.js';

class AnalyticsTracker {
    constructor() {
        this.sessionId = null;
        this.userId = null;
        this.sessionStart = null;
        this.pageViews = 0;
        this.lastActivity = null;
        
        this.init();
    }
    
    init() {
        // Generate or retrieve session ID
        this.sessionId = FirebaseUtils.generateSessionId();
        this.userId = 'user_' + FirebaseUtils.getBrowserFingerprint();
        this.sessionStart = Date.now();
        this.lastActivity = Date.now();
        
        // Start session
        this.startSession();
        
        // Track page view
        this.trackPageView();
        
        // Setup activity listeners
        this.setupActivityListeners();
        
        // Setup heartbeat
        this.setupHeartbeat();
        
        // Track session end on page unload
        window.addEventListener('beforeunload', () => this.endSession());
        
        console.log(`Analytics initialized - Session: ${this.sessionId.substring(0, 8)}...`);
    }
    
    async startSession() {
        try {
            const sessionData = {
                session_id: this.sessionId,
                user_id: this.userId,
                start_time: this.sessionStart,
                user_agent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                screen_resolution: `${window.screen.width}x${window.screen.height}`,
                referrer: document.referrer || 'direct',
                entry_url: window.location.href,
                is_mobile: /Mobi|Android/i.test(navigator.userAgent),
                browser: this.detectBrowser(),
                os: this.detectOS()
            };
            
            // Store session in Realtime DB
            await rtdb.ref(`sessions/${this.sessionId}`).set({
                ...sessionData,
                last_activity: this.lastActivity,
                page_views: 1,
                status: 'active'
            });
            
            // Increment daily user count
            const dateKey = new Date().toISOString().split('T')[0];
            await rtdb.ref(`daily_users/${dateKey}/${this.userId}`).set(true);
            
            // Update active sessions counter
            await rtdb.ref(`stats/active_sessions/${this.sessionId}`).set(true);
            
        } catch (error) {
            console.error('Error starting session:', error);
        }
    }
    
    async trackPageView() {
        try {
            this.pageViews++;
            this.lastActivity = Date.now();
            
            const pageData = {
                path: window.location.pathname,
                title: document.title,
                timestamp: this.lastActivity,
                session_id: this.sessionId,
                user_id: this.userId
            };
            
            // Store page view
            await rtdb.ref(`page_views/${this.sessionId}/${this.pageViews}`).set(pageData);
            
            // Update session activity
            await rtdb.ref(`sessions/${this.sessionId}`).update({
                last_activity: this.lastActivity,
                page_views: this.pageViews,
                current_page: window.location.pathname
            });
            
            // Track unique page visits per day
            const dateKey = new Date().toISOString().split('T')[0];
            const pageKey = window.location.pathname.replace(/\//g, '_');
            await rtdb.ref(`daily_pages/${dateKey}/${pageKey}`).transaction(current => (current || 0) + 1);
            
        } catch (error) {
            console.error('Error tracking page view:', error);
        }
    }
    
    async trackToolInteraction(toolId, action, metadata = {}) {
        try {
            const interactionData = {
                tool_id: toolId,
                action: action,
                session_id: this.sessionId,
                user_id: this.userId,
                timestamp: Date.now(),
                ...metadata
            };
            
            // Store interaction
            const interactionRef = rtdb.ref('tool_interactions').push();
            await interactionRef.set(interactionData);
            
            // Update tool stats
            await rtdb.ref(`tool_stats/${toolId}/${action}`).transaction(current => (current || 0) + 1);
            
            // Update session activity
            this.lastActivity = Date.now();
            await rtdb.ref(`sessions/${this.sessionId}/last_activity`).set(this.lastActivity);
            
        } catch (error) {
            console.error('Error tracking tool interaction:', error);
        }
    }
    
    async endSession() {
        try {
            const sessionDuration = Date.now() - this.sessionStart;
            
            await rtdb.ref(`sessions/${this.sessionId}`).update({
                end_time: Date.now(),
                duration: sessionDuration,
                status: 'ended',
                page_views: this.pageViews
            });
            
            // Remove from active sessions
            await rtdb.ref(`stats/active_sessions/${this.sessionId}`).remove();
            
            // Update session duration stats
            const durationBucket = this.getDurationBucket(sessionDuration);
            await rtdb.ref(`stats/session_durations/${durationBucket}`).transaction(current => (current || 0) + 1);
            
            // Store session locally for reference
            localStorage.setItem(`session_${this.sessionId}_end`, Date.now().toString());
            
        } catch (error) {
            console.error('Error ending session:', error);
        }
    }
    
    setupActivityListeners() {
        // Track user activity
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart'];
        
        activityEvents.forEach(event => {
            document.addEventListener(event, () => {
                this.lastActivity = Date.now();
                
                // Debounce the update to avoid too many writes
                clearTimeout(this.activityTimeout);
                this.activityTimeout = setTimeout(() => {
                    this.updateLastActivity();
                }, 1000);
            });
        });
        
        // Track visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.trackEvent('page_hidden');
            } else {
                this.trackEvent('page_visible');
                this.lastActivity = Date.now();
                this.updateLastActivity();
            }
        });
    }
    
    async updateLastActivity() {
        try {
            await rtdb.ref(`sessions/${this.sessionId}/last_activity`).set(this.lastActivity);
        } catch (error) {
            console.error('Error updating last activity:', error);
        }
    }
    
    setupHeartbeat() {
        // Send heartbeat every 30 seconds to keep session alive
        this.heartbeatInterval = setInterval(async () => {
            try {
                await rtdb.ref(`sessions/${this.sessionId}/heartbeat`).set(Date.now());
            } catch (error) {
                console.error('Heartbeat error:', error);
            }
        }, 30000);
    }
    
    async trackEvent(eventName, data = {}) {
        try {
            const eventData = {
                event: eventName,
                session_id: this.sessionId,
                user_id: this.userId,
                timestamp: Date.now(),
                ...data
            };
            
            await rtdb.ref('events').push().set(eventData);
            
        } catch (error) {
            console.error('Error tracking event:', error);
        }
    }
    
    detectBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
        return 'Other';
    }
    
    detectOS() {
        const ua = navigator.userAgent;
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac')) return 'macOS';
        if (ua.includes('Linux')) return 'Linux';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        return 'Unknown';
    }
    
    getDurationBucket(duration) {
        // Convert milliseconds to seconds
        const seconds = Math.floor(duration / 1000);
        
        if (seconds < 10) return '0-10s';
        if (seconds < 30) return '10-30s';
        if (seconds < 60) return '30-60s';
        if (seconds < 300) return '1-5m';
        if (seconds < 600) return '5-10m';
        if (seconds < 1800) return '10-30m';
        if (seconds < 3600) return '30-60m';
        return '60m+';
    }
    
    // Public method to track tool clicks
    static trackToolClick(toolId, toolName) {
        if (!window.analyticsTracker) {
            console.warn('Analytics tracker not initialized');
            return;
        }
        
        window.analyticsTracker.trackToolInteraction(toolId, 'click', {
            tool_name: toolName,
            tool_type: document.querySelector(`[data-tool-id="${toolId}"]`)?.dataset.toolType || 'unknown'
        });
    }
}

// Initialize analytics tracker
const analyticsTracker = new AnalyticsTracker();
window.analyticsTracker = analyticsTracker;

// Export for use in other modules
export default analyticsTracker;