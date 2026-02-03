/**
 * Tool Viewer Module
 * Loads and displays hosted tools in sandboxed iframe
 * Version: 1.0.0
 */

import { db } from './firebase-init.js';

class ToolViewer {
    constructor() {
        this.toolId = null;
        this.toolData = null;
        this.iframe = null;
        this.isLoading = false;
        
        this.init();
    }
    
    init() {
        // Get tool ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        this.toolId = urlParams.get('id');
        
        if (!this.toolId) {
            this.showError('No tool ID specified');
            return;
        }
        
        // Setup viewer
        this.setupViewer();
        
        // Load tool
        this.loadTool();
    }
    
    setupViewer() {
        // Create sandboxed iframe
        this.iframe = document.createElement('iframe');
        this.iframe.className = 'viewer-frame';
        this.iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups';
        this.iframe.allow = 'accelerometer; ambient-light-sensor; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; vr';
        
        // Strict security policies
        this.iframe.setAttribute('referrerpolicy', 'no-referrer');
        this.iframe.setAttribute('csp', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';");
        
        // Get viewer content container
        const viewerContent = document.getElementById('viewer-content');
        if (viewerContent) {
            viewerContent.innerHTML = '';
            viewerContent.appendChild(this.iframe);
        }
    }
    
    async loadTool() {
        this.showLoading(true);
        
        try {
            // Fetch tool data from Firestore
            const toolDoc = await db.collection('tools').doc(this.toolId).get();
            
            if (!toolDoc.exists) {
                throw new Error('Tool not found');
            }
            
            this.toolData = toolDoc.data();
            
            // Check if tool is enabled
            if (!this.toolData.enabled) {
                throw new Error('This tool is currently disabled');
            }
            
            // Check tool type
            if (this.toolData.type !== 'hosted') {
                throw new Error('This tool cannot be viewed in the viewer');
            }
            
            // Check if hosted HTML exists
            if (!this.toolData.hostedHtml) {
                throw new Error('No HTML content available for this tool');
            }
            
            // Update page title
            document.title = `${this.toolData.name} - Dark Tech Zone`;
            const toolTitle = document.getElementById('tool-title');
            if (toolTitle) {
                toolTitle.textContent = this.toolData.name;
            }
            
            // Load tool into iframe
            this.loadToolIntoIframe();
            
            // Track tool view
            this.trackToolView();
            
        } catch (error) {
            console.error('Error loading tool:', error);
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    loadToolIntoIframe() {
        if (!this.iframe || !this.toolData.hostedHtml) return;
        
        // Create a complete HTML document for the iframe
        const toolHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${this.escapeHtml(this.toolData.name)}</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
                        background: #f5f5f5;
                        color: #333;
                    }
                    
                    .tool-container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    .tool-header {
                        margin-bottom: 30px;
                        padding-bottom: 20px;
                        border-bottom: 2px solid #e0e0e0;
                    }
                    
                    .tool-title {
                        color: #2c3e50;
                        margin: 0 0 10px 0;
                    }
                    
                    .tool-description {
                        color: #7f8c8d;
                        margin: 0;
                    }
                    
                    .tool-watermark {
                        position: fixed;
                        bottom: 10px;
                        right: 10px;
                        color: rgba(0, 0, 0, 0.1);
                        font-size: 12px;
                        pointer-events: none;
                        user-select: none;
                    }
                    
                    /* Dark mode support for tools */
                    @media (prefers-color-scheme: dark) {
                        body {
                            background: #1a1a1a;
                            color: #e0e0e0;
                        }
                        
                        .tool-header {
                            border-bottom-color: #333;
                        }
                        
                        .tool-title {
                            color: #fff;
                        }
                        
                        .tool-description {
                            color: #aaa;
                        }
                    }
                </style>
                
                <!-- Tool-specific styles from database -->
                ${this.toolData.hostedCss || ''}
            </head>
            <body>
                <div class="tool-container">
                    ${this.toolData.showHeader !== false ? `
                        <div class="tool-header">
                            <h1 class="tool-title">${this.escapeHtml(this.toolData.name)}</h1>
                            ${this.toolData.description ? `
                                <p class="tool-description">${this.escapeHtml(this.toolData.description)}</p>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <!-- Tool content -->
                    ${this.toolData.hostedHtml}
                </div>
                
                <div class="tool-watermark">
                    Powered by Dark Tech Zone
                </div>
                
                <!-- Tool-specific scripts from database -->
                ${this.toolData.hostedJs ? `<script>${this.toolData.hostedJs}</script>` : ''}
                
                <script>
                    // Tool isolation - prevent access to parent window
                    if (window.parent !== window) {
                        // Block access to parent
                        Object.defineProperty(window, 'parent', { get: () => null });
                        Object.defineProperty(window, 'top', { get: () => null });
                        Object.defineProperty(window, 'opener', { get: () => null });
                        
                        // Block dangerous functions
                        window.open = () => null;
                        window.alert = () => console.log('[Tool] Alert blocked by sandbox');
                        window.confirm = () => { console.log('[Tool] Confirm blocked by sandbox'); return false; };
                        window.prompt = () => { console.log('[Tool] Prompt blocked by sandbox'); return null; };
                        
                        // Prevent navigation
                        window.addEventListener('beforeunload', (e) => {
                            e.preventDefault();
                            e.returnValue = '';
                        });
                    }
                    
                    // Tool initialization
                    document.addEventListener('DOMContentLoaded', () => {
                        console.log('Tool loaded in sandboxed environment');
                        
                        // Dispatch loaded event (for parent to detect)
                        try {
                            window.dispatchEvent(new Event('tool-loaded'));
                        } catch (e) {}
                    });
                </script>
            </body>
            </html>
        `;
        
        // Write to iframe
        const iframeDoc = this.iframe.contentDocument || this.iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(toolHtml);
        iframeDoc.close();
        
        // Add iframe event listeners
        this.setupIframeEvents();
    }
    
    setupIframeEvents() {
        if (!this.iframe) return;
        
        const iframeWindow = this.iframe.contentWindow;
        
        // Listen for tool loaded event
        iframeWindow.addEventListener('tool-loaded', () => {
            console.log('Tool reported loaded successfully');
            this.showLoading(false);
        });
        
        // Listen for errors in iframe
        iframeWindow.addEventListener('error', (e) => {
            console.error('Tool error:', e);
            // Don't show to user to avoid breaking tool experience
        });
        
        // Monitor iframe load
        this.iframe.onload = () => {
            console.log('Iframe loaded');
            this.showLoading(false);
        };
        
        this.iframe.onerror = () => {
            console.error('Iframe load error');
            this.showError('Failed to load tool content');
        };
    }
    
    async trackToolView() {
        try {
            // Track in Realtime DB
            const rtdb = firebase.database();
            const timestamp = Date.now();
            const dateKey = new Date().toISOString().split('T')[0];
            
            const updates = {};
            updates[`tool_views/${this.toolId}/total`] = firebase.database.ServerValue.increment(1);
            updates[`tool_views/${this.toolId}/last_view`] = timestamp;
            updates[`daily_views/${dateKey}/${this.toolId}`] = firebase.database.ServerValue.increment(1);
            
            await rtdb.ref().update(updates);
            
            // Store locally for analytics
            localStorage.setItem(`last_tool_view_${this.toolId}`, timestamp.toString());
            
        } catch (error) {
            console.error('Error tracking tool view:', error);
        }
    }
    
    showLoading(show) {
        const viewerContent = document.getElementById('viewer-content');
        if (!viewerContent) return;
        
        if (show) {
            this.iframe.style.display = 'none';
            viewerContent.innerHTML = `
                <div class="tool-loading">
                    <div class="load-spinner"></div>
                    <p>Loading "${this.toolData?.name || 'tool'}" from Dark Tech Zone...</p>
                    <p class="loading-subtext">Running in secure sandbox environment</p>
                </div>
            `;
        } else {
            viewerContent.innerHTML = '';
            viewerContent.appendChild(this.iframe);
            this.iframe.style.display = 'block';
        }
    }
    
    showError(message) {
        const viewerContent = document.getElementById('viewer-content');
        if (viewerContent) {
            viewerContent.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Unable to Load Tool</h3>
                    <p>${this.escapeHtml(message)}</p>
                    <div class="error-actions">
                        <button onclick="window.history.back()" class="back-btn">
                            <i class="fas fa-arrow-left"></i> Go Back
                        </button>
                        <button onclick="window.location.href='/'" class="home-btn">
                            <i class="fas fa-home"></i> Return to Toolkit
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize tool viewer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const toolViewer = new ToolViewer();
    window.toolViewer = toolViewer;
});

// Export for testing
export default ToolViewer;