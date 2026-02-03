/**
 * Firebase Initialization Module
 * Single point of Firebase initialization for the entire toolkit
 * Version: 1.0.0
 */

// Firebase configuration for Dark Tech Zone Toolkit
const firebaseConfig = {
    apiKey: "AIzaSyD369ImYdPQcgnystU9KQqs5Rhji07MLOw",
    authDomain: "dtz-toolkit.firebaseapp.com",
    databaseURL: "https://dtz-toolkit-default-rtdb.firebaseio.com",
    projectId: "dtz-toolkit",
    storageBucket: "dtz-toolkit.firebasestorage.app",
    messagingSenderId: "260322206338",
    appId: "1:260322206338:web:79049e8cc7a9fe54824a9b"
};

// Initialize Firebase
let app;
let auth;
let db;
let rtdb;

try {
    // Check if Firebase is already initialized
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
    } else {
        app = firebase.app();
        console.log('Using existing Firebase app');
    }
    
    // Initialize services
    auth = firebase.auth();
    db = firebase.firestore();
    rtdb = firebase.database();
    
    // Enable Firestore offline persistence
    db.enablePersistence()
        .then(() => {
            console.log('Firestore persistence enabled');
        })
        .catch((err) => {
            if (err.code === 'failed-precondition') {
                console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
            } else if (err.code === 'unimplemented') {
                console.warn('The current browser doesn\'t support persistence.');
            }
        });
    
    // Set Firestore settings for better performance
    db.settings({
        cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    
} catch (error) {
    console.error('Firebase initialization error:', error);
    // Redirect to offline page if Firebase fails
    if (window.location.pathname !== '/offline.html') {
        window.location.href = '/offline.html';
    }
}

// Export Firebase instances for use in other modules
export { app, auth, db, rtdb };

// Global error handler for Firebase operations
window.addEventListener('firebase-error', (event) => {
    console.error('Firebase error caught:', event.detail);
    
    // Show user-friendly error message for critical errors
    if (event.detail.code === 'permission-denied') {
        if (window.location.pathname.includes('/admin/')) {
            // Admin permission error - redirect to login
            window.location.href = '/admin/admin.html';
        }
    } else if (event.detail.code === 'unavailable') {
        // Firebase service unavailable
        if (window.location.pathname !== '/offline.html') {
            window.location.href = '/offline.html';
        }
    }
});

// Monitor connection state
if (rtdb) {
    const connectedRef = rtdb.ref('.info/connected');
    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            console.log('Realtime Database connected');
            // Remove offline indicator if present
            document.querySelectorAll('.offline-indicator').forEach(el => el.remove());
        } else {
            console.log('Realtime Database disconnected');
            // Add offline indicator
            if (!document.querySelector('.offline-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'offline-indicator';
                indicator.innerHTML = `
                    <div style="position: fixed; bottom: 10px; right: 10px; 
                                background: #ff3333; color: white; padding: 8px 12px; 
                                border-radius: 4px; font-size: 12px; z-index: 9999;">
                        <i class="fas fa-wifi-slash"></i> Connection lost
                    </div>
                `;
                document.body.appendChild(indicator);
            }
        }
    });
}

// Global Firebase utilities
const FirebaseUtils = {
    // Generate a unique session ID for anonymous tracking
    generateSessionId: () => {
        let sessionId = localStorage.getItem('dtz_session_id');
        if (!sessionId) {
            sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('dtz_session_id', sessionId);
            localStorage.setItem('dtz_session_start', Date.now().toString());
        }
        return sessionId;
    },
    
    // Get browser fingerprint (anonymous)
    getBrowserFingerprint: () => {
        const fingerprint = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}`,
            colorDepth: window.screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            cookiesEnabled: navigator.cookieEnabled,
            doNotTrack: navigator.doNotTrack
        };
        
        // Create a hash of the fingerprint
        const fingerprintString = JSON.stringify(fingerprint);
        let hash = 0;
        for (let i = 0; i < fingerprintString.length; i++) {
            const char = fingerprintString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
    },
    
    // Safe Firestore operation with error handling
    safeFirestoreOperation: async (operation, collection, data) => {
        try {
            if (!db) throw new Error('Firestore not initialized');
            
            let result;
            switch (operation) {
                case 'add':
                    result = await db.collection(collection).add(data);
                    break;
                case 'set':
                    result = await db.collection(collection).doc(data.id).set(data);
                    break;
                case 'get':
                    result = await db.collection(collection).get();
                    break;
                default:
                    throw new Error('Unsupported operation');
            }
            
            return { success: true, data: result };
        } catch (error) {
            console.error(`Firestore ${operation} error:`, error);
            
            // Dispatch error event for global handling
            window.dispatchEvent(new CustomEvent('firebase-error', {
                detail: { 
                    operation, 
                    collection, 
                    error: error.message,
                    code: error.code 
                }
            }));
            
            return { success: false, error: error.message };
        }
    },
    
    // Check if user is admin
    checkAdminAccess: async (userId) => {
        try {
            if (!db) return false;
            
            const adminDoc = await db.collection('admins').doc(userId).get();
            return adminDoc.exists && adminDoc.data().role === 'admin';
        } catch (error) {
            console.error('Admin check error:', error);
            return false;
        }
    }
};

// Export utilities
export { FirebaseUtils };