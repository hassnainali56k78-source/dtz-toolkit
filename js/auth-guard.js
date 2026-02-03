/**
 * Admin Authentication Guard
 * Protects admin pages - requires login and admin role
 * Version: 1.0.0
 */

import { auth, db } from '../../js/firebase-init.js';

class AuthGuard {
    constructor() {
        this.currentUser = null;
        this.isAdmin = false;
        this.requiredRoles = ['admin', 'superadmin'];
        
        this.init();
    }
    
    async init() {
        // Check if we're on an admin page
        if (!this.isAdminPage()) {
            return;
        }
        
        // Setup auth state listener
        this.setupAuthListener();
        
        // Check existing session
        await this.checkExistingSession();
        
        // Add logout handler
        this.setupLogoutHandler();
    }
    
    isAdminPage() {
        return window.location.pathname.includes('/admin/') && 
               !window.location.pathname.includes('/admin/admin.html');
    }
    
    setupAuthListener() {
        auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            
            if (user) {
                // Check if user is admin
                this.isAdmin = await this.checkAdminRole(user.uid);
                
                if (this.isAdmin) {
                    // User is admin, allow access
                    this.grantAccess(user);
                } else {
                    // User is not admin, redirect to login
                    this.redirectToLogin('Access denied: Admin privileges required');
                }
            } else {
                // No user logged in, redirect to login
                this.redirectToLogin('Please login to access admin panel');
            }
        });
    }
    
    async checkExistingSession() {
        // Check for stored session
        const session = localStorage.getItem('admin_session');
        
        if (session) {
            try {
                const sessionData = JSON.parse(session);
                
                // Check if session is expired
                if (sessionData.expires > Date.now()) {
                    // Try to restore session
                    const userCred = await auth.signInWithCustomToken(sessionData.token);
                    this.currentUser = userCred.user;
                    return true;
                } else {
                    // Session expired
                    localStorage.removeItem('admin_session');
                    this.redirectToLogin('Session expired');
                }
            } catch (error) {
                console.error('Session restore error:', error);
                localStorage.removeItem('admin_session');
                this.redirectToLogin('Invalid session');
            }
        }
        
        return false;
    }
    
    async checkAdminRole(uid) {
        try {
            // Check if user exists in admins collection
            const adminDoc = await db.collection('admins').doc(uid).get();
            
            if (!adminDoc.exists) {
                console.log('User not found in admins collection');
                return false;
            }
            
            const adminData = adminDoc.data();
            
            // Check if user has required role
            if (!this.requiredRoles.includes(adminData.role)) {
                console.log('User role not authorized:', adminData.role);
                return false;
            }
            
            // Check if admin is active
            if (adminData.status !== 'active') {
                console.log('Admin account not active:', adminData.status);
                return false;
            }
            
            // Update last login time
            await this.updateLastLogin(uid);
            
            // Create admin session
            await this.createAdminSession(uid, adminData);
            
            return true;
            
        } catch (error) {
            console.error('Error checking admin role:', error);
            return false;
        }
    }
    
    async updateLastLogin(uid) {
        try {
            await db.collection('admins').doc(uid).update({
                lastLogin: new Date(),
                lastLoginIp: await this.getClientIP(),
                userAgent: navigator.userAgent
            });
        } catch (error) {
            console.error('Error updating last login:', error);
        }
    }
    
    async createAdminSession(uid, adminData) {
        try {
            // Generate session token
            const sessionToken = await this.generateSessionToken();
            
            // Store session data
            const sessionData = {
                uid: uid,
                email: this.currentUser.email,
                role: adminData.role,
                token: sessionToken,
                created: Date.now(),
                expires: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
                ip: await this.getClientIP(),
                userAgent: navigator.userAgent
            };
            
            // Store in localStorage
            localStorage.setItem('admin_session', JSON.stringify(sessionData));
            
            // Log session creation
            await this.logAdminAction('session_create', 'Admin session created');
            
        } catch (error) {
            console.error('Error creating admin session:', error);
        }
    }
    
    async generateSessionToken() {
        // Generate a simple token for session tracking
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2);
        return btoa(`${timestamp}:${random}:${this.currentUser.uid}`).replace(/=/g, '');
    }
    
    async getClientIP() {
        try {
            // This is a client-side approximation
            // Real IP would be handled server-side
            return 'client_approximation';
        } catch (error) {
            return 'unknown';
        }
    }
    
    grantAccess(user) {
        // Update UI with user info
        this.updateUserUI(user);
        
        // Log successful access
        this.logAdminAction('access_granted', 'Admin access granted');
        
        // Remove any access denied messages
        this.removeAccessDeniedMessages();
        
        // Show admin interface
        this.showAdminInterface();
    }
    
    updateUserUI(user) {
        // Update user info in sidebar if elements exist
        const adminNameEl = document.getElementById('admin-name');
        const adminEmailEl = document.getElementById('admin-email');
        
        if (adminNameEl) {
            adminNameEl.textContent = user.displayName || 'Admin User';
        }
        
        if (adminEmailEl) {
            adminEmailEl.textContent = user.email;
        }
        
        // Update avatar if element exists
        const userAvatarEl = document.querySelector('.user-avatar');
        if (userAvatarEl && user.photoURL) {
            userAvatarEl.innerHTML = `<img src="${user.photoURL}" alt="Admin Avatar">`;
        }
    }
    
    redirectToLogin(message = 'Authentication required') {
        // Store redirect URL
        const currentPath = window.location.pathname;
        if (currentPath !== '/admin/admin.html') {
            sessionStorage.setItem('admin_redirect', currentPath);
        }
        
        // Show message if provided
        if (message) {
            sessionStorage.setItem('login_message', message);
        }
        
        // Redirect to login page
        window.location.href = '/admin/admin.html';
    }
    
    setupLogoutHandler() {
        // Handle logout button if it exists
        const logoutBtn = document.getElementById('admin-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
        
        // Also handle any elements with class 'logout-btn'
        document.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        });
    }
    
    async logout() {
        try {
            // Log logout action
            await this.logAdminAction('logout', 'Admin logged out');
            
            // Sign out from Firebase
            await auth.signOut();
            
            // Clear session data
            localStorage.removeItem('admin_session');
            sessionStorage.removeItem('admin_redirect');
            
            // Redirect to login page
            window.location.href = '/admin/admin.html';
            
        } catch (error) {
            console.error('Logout error:', error);
            alert('Logout failed. Please try again.');
        }
    }
    
    async logAdminAction(action, description, metadata = {}) {
        try {
            await db.collection('admin_logs').add({
                uid: this.currentUser?.uid,
                email: this.currentUser?.email,
                action: action,
                description: description,
                timestamp: new Date(),
                ip: await this.getClientIP(),
                userAgent: navigator.userAgent,
                path: window.location.pathname,
                ...metadata
            });
        } catch (error) {
            console.error('Error logging admin action:', error);
        }
    }
    
    removeAccessDeniedMessages() {
        // Remove any access denied banners
        const deniedBanners = document.querySelectorAll('.access-denied, .auth-error');
        deniedBanners.forEach(banner => banner.remove());
    }
    
    showAdminInterface() {
        // Remove any loading overlays
        const loadingOverlays = document.querySelectorAll('.auth-loading, .access-checking');
        loadingOverlays.forEach(overlay => overlay.remove());
        
        // Show admin content
        const adminContent = document.querySelector('.admin-content, .admin-main');
        if (adminContent) {
            adminContent.style.display = 'block';
        }
    }
    
    // Public method to check access from other modules
    static async checkAccess() {
        const guard = new AuthGuard();
        return guard.isAdmin;
    }
    
    // Public method to get current admin
    static getCurrentAdmin() {
        return auth.currentUser;
    }
}

// Initialize auth guard
const authGuard = new AuthGuard();

// Export for use in other admin modules
export default authGuard;

// Auto-initialize on admin pages
if (window.location.pathname.includes('/admin/') && 
    !window.location.pathname.includes('/admin/admin.html')) {
    
    // Show loading state while checking auth
    document.addEventListener('DOMContentLoaded', () => {
        const loadingHtml = `
            <div class="auth-loading" style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 20, 0, 0.95);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                color: #00ff00;
                font-family: 'Courier New', monospace;
            ">
                <div class="loading-spinner" style="
                    width: 60px;
                    height: 60px;
                    border: 4px solid #003300;
                    border-top: 4px solid #00ff00;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 20px;
                "></div>
                <h2>Checking Admin Access</h2>
                <p>Verifying credentials with Dark Tech Zone...</p>
                <p style="font-size: 12px; color: #00aa00; margin-top: 20px;">
                    <i class="fas fa-shield-alt"></i> Secure authentication required
                </p>
                
                <style>
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', loadingHtml);
    });
}