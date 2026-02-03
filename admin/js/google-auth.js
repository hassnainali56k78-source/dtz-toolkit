/**
 * Google Authentication Module
 * Handles Google Sign-In for admin access
 * Version: 1.0.0
 */

import { auth, db } from '../../js/firebase-init.js';

class GoogleAuth {
    constructor() {
        this.googleProvider = null;
        this.isInitialized = false;
        
        this.init();
    }
    
    init() {
        // Only initialize on admin login page
        if (!this.isAdminLoginPage()) {
            return;
        }
        
        // Initialize Google provider
        this.setupGoogleProvider();
        
        // Setup Google Sign-In button
        this.setupGoogleButton();
        
        // Check for redirect result
        this.checkRedirectResult();
        
        // Check for stored login message
        this.showStoredMessage();
        
        this.isInitialized = true;
    }
    
    isAdminLoginPage() {
        return window.location.pathname.includes('/admin/admin.html');
    }
    
    setupGoogleProvider() {
        // Create Google auth provider
        this.googleProvider = new firebase.auth.GoogleAuthProvider();
        
        // Add scopes if needed
        this.googleProvider.addScope('email');
        this.googleProvider.addScope('profile');
        
        // Set custom parameters
        this.googleProvider.setCustomParameters({
            prompt: 'select_account',
            login_hint: 'admin@darktech.zone'
        });
    }
    
    setupGoogleButton() {
        const googleBtn = document.getElementById('google-login');
        if (!googleBtn) {
            console.error('Google login button not found');
            return;
        }
        
        googleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.signInWithGoogle();
        });
    }
    
    async signInWithGoogle() {
        try {
            // Show loading state
            this.showLoading(true);
            this.hideError();
            
            // Sign in with popup
            const result = await auth.signInWithPopup(this.googleProvider);
            const user = result.user;
            
            console.log('Google sign-in successful:', user.email);
            
            // Check if user is admin
            const isAdmin = await this.checkAdminAccess(user.uid);
            
            if (isAdmin) {
                // Redirect to admin dashboard
                this.redirectToDashboard();
            } else {
                // User is not admin, sign them out
                await auth.signOut();
                this.showError('Access denied. Your account is not authorized as admin.');
            }
            
        } catch (error) {
            console.error('Google sign-in error:', error);
            this.handleAuthError(error);
        } finally {
            this.showLoading(false);
        }
    }
    
    async checkAdminAccess(uid) {
        try {
            // Check if user exists in admins collection
            const adminDoc = await db.collection('admins').doc(uid).get();
            
            if (!adminDoc.exists) {
                console.log('User not found in admins collection');
                return false;
            }
            
            const adminData = adminDoc.data();
            
            // Check admin role
            if (adminData.role !== 'admin' && adminData.role !== 'superadmin') {
                console.log('User role not authorized:', adminData.role);
                return false;
            }
            
            // Check if admin is active
            if (adminData.status !== 'active') {
                console.log('Admin account not active');
                return false;
            }
            
            // Update last login
            await this.updateAdminLogin(uid);
            
            // Log successful admin login
            await this.logAdminLogin(uid, adminData);
            
            return true;
            
        } catch (error) {
            console.error('Error checking admin access:', error);
            return false;
        }
    }
    
    async updateAdminLogin(uid) {
        try {
            const updateData = {
                lastLogin: new Date(),
                lastLoginIp: await this.getClientIP(),
                loginCount: firebase.firestore.FieldValue.increment(1)
            };
            
            await db.collection('admins').doc(uid).update(updateData);
            
        } catch (error) {
            console.error('Error updating admin login:', error);
        }
    }
    
    async logAdminLogin(uid, adminData) {
        try {
            const logData = {
                uid: uid,
                email: adminData.email,
                action: 'login_success',
                description: 'Admin logged in via Google',
                timestamp: new Date(),
                ip: await this.getClientIP(),
                userAgent: navigator.userAgent,
                provider: 'google'
            };
            
            await db.collection('admin_logs').add(logData);
            
        } catch (error) {
            console.error('Error logging admin login:', error);
        }
    }
    
    async checkRedirectResult() {
        try {
            // Check if there's a redirect result
            const result = await auth.getRedirectResult();
            
            if (result.user) {
                // User signed in via redirect
                const isAdmin = await this.checkAdminAccess(result.user.uid);
                
                if (isAdmin) {
                    this.redirectToDashboard();
                } else {
                    await auth.signOut();
                    this.showError('Access denied. Not an admin.');
                }
            }
        } catch (error) {
            console.error('Redirect result error:', error);
            this.handleAuthError(error);
        }
    }
    
    redirectToDashboard() {
        // Check for stored redirect URL
        const redirectUrl = sessionStorage.getItem('admin_redirect') || '/admin/admin-dashboard.html';
        sessionStorage.removeItem('admin_redirect');
        
        // Redirect to dashboard
        window.location.href = redirectUrl;
    }
    
    handleAuthError(error) {
        let errorMessage = 'Authentication failed';
        
        switch (error.code) {
            case 'auth/popup-blocked':
                errorMessage = 'Popup blocked by browser. Please allow popups for this site.';
                break;
            case 'auth/popup-closed-by-user':
                errorMessage = 'Sign-in popup was closed before completion.';
                break;
            case 'auth/network-request-failed':
                errorMessage = 'Network error. Please check your connection.';
                break;
            case 'auth/unauthorized-domain':
                errorMessage = 'This domain is not authorized for sign-in.';
                break;
            case 'auth/operation-not-allowed':
                errorMessage = 'Google sign-in is not enabled. Contact administrator.';
                break;
            case 'auth/account-exists-with-different-credential':
                errorMessage = 'Account exists with different credentials.';
                break;
            default:
                errorMessage = error.message || 'Authentication error';
        }
        
        this.showError(errorMessage);
    }
    
    showError(message) {
        const errorEl = document.getElementById('login-error');
        const errorMessageEl = document.getElementById('error-message');
        
        if (errorEl && errorMessageEl) {
            errorMessageEl.textContent = message;
            errorEl.classList.add('show');
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                errorEl.classList.remove('show');
            }, 10000);
        } else {
            alert(message);
        }
    }
    
    hideError() {
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.classList.remove('show');
        }
    }
    
    showLoading(show) {
        const loadingEl = document.getElementById('login-loading');
        if (loadingEl) {
            loadingEl.classList.toggle('show', show);
        }
        
        // Disable/enable buttons
        const buttons = document.querySelectorAll('button, input[type="submit"]');
        buttons.forEach(btn => {
            btn.disabled = show;
        });
    }
    
    showStoredMessage() {
        const message = sessionStorage.getItem('login_message');
        if (message) {
            this.showError(message);
            sessionStorage.removeItem('login_message');
        }
    }
    
    async getClientIP() {
        // Client-side IP approximation
        // Note: Real IP would be handled server-side via Cloud Functions
        return 'client_side';
    }
    
    // Public method to trigger Google sign-in
    static signIn() {
        const googleAuth = new GoogleAuth();
        if (googleAuth.googleProvider) {
            auth.signInWithRedirect(googleAuth.googleProvider);
        }
    }
    
    // Public method to check auth state
    static getAuthState() {
        return new Promise((resolve) => {
            auth.onAuthStateChanged(resolve);
        });
    }
}

// Initialize Google auth
const googleAuth = new GoogleAuth();

// Export for use in other modules
export default googleAuth;

// Add global method for button clicks
window.signInWithGoogle = () => {
    const ga = new GoogleAuth();
    ga.signInWithGoogle();
};