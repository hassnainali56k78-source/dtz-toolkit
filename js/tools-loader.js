/**
 * Tools Loader Module
 * Loads and displays tools from Firestore
 * Version: 1.0.0
 */

import { db, FirebaseUtils } from './firebase-init.js';

class ToolsLoader {
    constructor() {
        this.tools = [];
        this.filteredTools = [];
        this.categories = new Set();
        this.isLoading = false;
        this.lastUpdate = null;
        
        // Initialize
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }
    
    setup() {
        // Get DOM elements
        this.toolsGrid = document.getElementById('tools-grid');
        this.toolSearch = document.getElementById('tool-search');
        this.toolCount = document.getElementById('tool-count');
        
        if (!this.toolsGrid) {
            console.error('Tools grid element not found');
            return;
        }
        
        // Load tools from Firestore
        this.loadTools();
        
        // Load settings (welcome message, broadcast, etc.)
        this.loadSettings();
        
        // Setup search functionality
        if (this.toolSearch) {
            this.toolSearch.addEventListener('input', () => this.filterTools());
        }
        
        // Setup periodic refresh (every 5 minutes)
        setInterval(() => {
            if (this.shouldRefresh()) {
                this.loadTools(true);
            }
        }, 5 * 60 * 1000);
    }
    
    async loadTools(forceRefresh = false) {
        // Check cache
        const cacheKey = 'dtz_tools_cache';
        const cacheTime = 'dtz_tools_cache_time';
        
        if (!forceRefresh) {
            const cached = localStorage.getItem(cacheKey);
            const cachedTime = localStorage.getItem(cacheTime);
            
            if (cached && cachedTime) {
                const age = Date.now() - parseInt(cachedTime);
                if (age < 10 * 60 * 1000) { // 10 minutes cache
                    try {
                        const parsed = JSON.parse(cached);
                        this.tools = parsed;
                        this.processTools();
                        return;
                    } catch (e) {
                        console.warn('Cache parse error, fetching fresh data');
                    }
                }
            }
        }
        
        this.showLoading(true);
        
        try {
            // Fetch tools from Firestore
            const snapshot = await db.collection('tools')
                .where('enabled', '==', true)
                .orderBy('order', 'asc')
                .get();
            
            if (snapshot.empty) {
                this.showNoTools();
                return;
            }
            
            // Process tools
            this.tools = [];
            snapshot.forEach(doc => {
                const tool = doc.data();
                tool.id = doc.id;
                this.tools.push(tool);
                
                // Add category
                if (tool.category) {
                    this.categories.add(tool.category);
                }
            });
            
            // Cache the tools
            localStorage.setItem(cacheKey, JSON.stringify(this.tools));
            localStorage.setItem(cacheTime, Date.now().toString());
            this.lastUpdate = new Date();
            
            // Process and display
            this.processTools();
            
        } catch (error) {
            console.error('Error loading tools:', error);
            this.showError();
            
            // Try to use cache even if stale
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    this.tools = JSON.parse(cached);
                    this.processTools();
                } catch (e) {
                    this.showNoTools();
                }
            }
        } finally {
            this.showLoading(false);
        }
    }
    
    async loadSettings() {
        try {
            // Load settings from Firestore
            const settingsSnapshot = await db.collection('settings').doc('global').get();
            
            if (settingsSnapshot.exists) {
                const settings = settingsSnapshot.data();
                
                // Update welcome message
                const welcomeMsg = document.getElementById('welcome-message');
                if (welcomeMsg && settings.welcomeMessage) {
                    welcomeMsg.textContent = settings.welcomeMessage;
                }
                
                // Update broadcast message
                const broadcastMsg = document.getElementById('broadcast-message');
                const broadcastContainer = document.getElementById('broadcast-container');
                if (broadcastMsg && settings.broadcastMessage) {
                    broadcastMsg.innerHTML = settings.broadcastMessage;
                    if (settings.broadcastMessage.trim()) {
                        broadcastContainer.style.display = 'flex';
                    } else {
                        broadcastContainer.style.display = 'none';
                    }
                }
                
                // Update WhatsApp channel link
                const whatsappLink = document.getElementById('whatsapp-channel-link');
                if (whatsappLink && settings.whatsappChannel) {
                    whatsappLink.href = settings.whatsappChannel;
                }
                
                // Update footer text
                const footerContent = document.getElementById('footer-content');
                if (footerContent && settings.footerText) {
                    footerContent.innerHTML = settings.footerText;
                }
                
                // Check maintenance mode
                if (settings.maintenanceMode) {
                    this.showMaintenanceMode(settings.maintenanceMessage);
                }
            }
            
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }
    
    processTools() {
        this.filteredTools = [...this.tools];
        
        // Update tool count
        if (this.toolCount) {
            this.toolCount.textContent = this.filteredTools.length;
        }
        
        // Render tools
        this.renderTools();
        
        // Update category filter if it exists
        this.updateCategoryFilter();
    }
    
    filterTools() {
        if (!this.toolSearch) return;
        
        const searchTerm = this.toolSearch.value.toLowerCase().trim();
        
        if (!searchTerm) {
            this.filteredTools = [...this.tools];
        } else {
            this.filteredTools = this.tools.filter(tool => {
                const nameMatch = tool.name.toLowerCase().includes(searchTerm);
                const descMatch = tool.description.toLowerCase().includes(searchTerm);
                const categoryMatch = tool.category?.toLowerCase().includes(searchTerm);
                const tagsMatch = tool.tags?.some(tag => tag.toLowerCase().includes(searchTerm));
                
                return nameMatch || descMatch || categoryMatch || tagsMatch;
            });
        }
        
        // Update tool count
        if (this.toolCount) {
            this.toolCount.textContent = this.filteredTools.length;
        }
        
        // Re-render tools
        this.renderTools();
    }
    
    renderTools() {
        if (!this.toolsGrid) return;
        
        if (this.filteredTools.length === 0) {
            this.toolsGrid.innerHTML = `
                <div class="no-tools-found">
                    <div class="no-tools-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No Tools Found</h3>
                    <p>Try adjusting your search terms or check back later.</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        
        this.filteredTools.forEach(tool => {
            const icon = tool.icon || 'fas fa-cube';
            const typeBadge = tool.type === 'hosted' ? 'Hosted' : 'External';
            const typeClass = tool.type === 'hosted' ? 'type-hosted' : 'type-external';
            
            html += `
                <div class="tool-card" data-tool-id="${tool.id}" data-tool-type="${tool.type}">
                    <div class="tool-card-header">
                        <div class="tool-icon">
                            <i class="${icon}"></i>
                        </div>
                        <div class="tool-type-badge ${typeClass}">
                            ${typeBadge}
                        </div>
                    </div>
                    
                    <div class="tool-card-body">
                        <h3 class="tool-title">${this.escapeHtml(tool.name)}</h3>
                        <p class="tool-description">${this.escapeHtml(tool.description || 'No description available')}</p>
                        
                        ${tool.category ? `
                            <div class="tool-category">
                                <i class="fas fa-tag"></i> ${this.escapeHtml(tool.category)}
                            </div>
                        ` : ''}
                        
                        ${tool.version ? `
                            <div class="tool-version">
                                <small>v${tool.version}</small>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="tool-card-footer">
                        <button class="tool-open-btn" onclick="ToolsLoader.openTool('${tool.id}', '${tool.type}', '${tool.externalUrl || ''}')">
                            <i class="fas fa-external-link-alt"></i>
                            ${tool.type === 'hosted' ? 'Open Tool' : 'Visit Link'}
                        </button>
                        
                        <button class="tool-info-btn" onclick="ToolsLoader.showToolInfo('${tool.id}')">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    </div>
                </div>
            `;
        });
        
        this.toolsGrid.innerHTML = html;
        
        // Add click tracking
        this.addClickTracking();
    }
    
    addClickTracking() {
        const toolCards = document.querySelectorAll('.tool-card');
        toolCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't track if clicking on buttons (they have their own handlers)
                if (e.target.closest('.tool-open-btn') || e.target.closest('.tool-info-btn')) {
                    return;
                }
                
                const toolId = card.dataset.toolId;
                const toolType = card.dataset.toolType;
                
                // Open tool on card click
                ToolsLoader.openTool(toolId, toolType);
            });
        });
    }
    
    static openTool(toolId, toolType, externalUrl = '') {
        // Store last viewed tool for reports
        localStorage.setItem('last_viewed_tool', toolId);
        
        if (toolType === 'hosted') {
            // Open hosted tool in viewer
            window.location.href = `/v.html?id=${toolId}`;
        } else if (externalUrl) {
            // Open external link in new tab
            window.open(externalUrl, '_blank');
            
            // Track external link click
            ToolsLoader.trackToolClick(toolId, 'external');
        } else {
            console.error('No URL provided for external tool');
        }
    }
    
    static async trackToolClick(toolId, toolType) {
        try {
            const sessionId = FirebaseUtils.generateSessionId();
            const timestamp = Date.now();
            const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Increment click counter in Realtime DB
            const rtdb = firebase.database();
            const updates = {};
            
            // Global click counter
            updates[`tool_clicks/${toolId}/total`] = firebase.database.ServerValue.increment(1);
            updates[`tool_clicks/${toolId}/last_click`] = timestamp;
            
            // Daily click counter
            updates[`daily_clicks/${dateKey}/${toolId}`] = firebase.database.ServerValue.increment(1);
            
            // User session tracking (anonymous)
            updates[`user_sessions/${sessionId}/last_activity`] = timestamp;
            updates[`user_sessions/${sessionId}/tools/${toolId}`] = firebase.database.ServerValue.increment(1);
            
            await rtdb.ref().update(updates);
            
            console.log(`Tool click tracked: ${toolId}`);
            
        } catch (error) {
            console.error('Error tracking tool click:', error);
        }
    }
    
    static showToolInfo(toolId) {
        // This would show a modal with detailed tool information
        // For now, just log to console
        console.log('Tool info requested:', toolId);
        
        // Example modal implementation
        alert(`Tool ID: ${toolId}\nDetailed information would appear here.`);
    }
    
    updateCategoryFilter() {
        // This would update a category filter dropdown if it exists
        // Implementation depends on UI requirements
    }
    
    showLoading(show) {
        if (!this.toolsGrid) return;
        
        if (show) {
            this.toolsGrid.innerHTML = `
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Loading tools from Dark Tech Zone...</p>
                </div>
            `;
        }
    }
    
    showNoTools() {
        if (this.toolsGrid) {
            this.toolsGrid.innerHTML = `
                <div class="no-tools-found">
                    <div class="no-tools-icon">
                        <i class="fas fa-tools"></i>
                    </div>
                    <h3>No Tools Available</h3>
                    <p>Check back soon for new tools or contact the administrator.</p>
                    <button onclick="location.reload()" class="refresh-btn">
                        <i class="fas fa-redo"></i> Refresh
                    </button>
                </div>
            `;
        }
    }
    
    showError() {
        if (this.toolsGrid) {
            this.toolsGrid.innerHTML = `
                <div class="error-message">
                    <div class="error-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3>Failed to Load Tools</h3>
                    <p>Unable to connect to the toolkit database.</p>
                    <div class="error-actions">
                        <button onclick="location.reload()" class="retry-btn">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                        <button onclick="window.location.href='/offline.html'" class="offline-btn">
                            <i class="fas fa-wifi-slash"></i> Offline Mode
                        </button>
                    </div>
                </div>
            `;
        }
    }
    
    showMaintenanceMode(message) {
        const maintenanceHtml = `
            <div class="maintenance-mode">
                <div class="maintenance-icon">
                    <i class="fas fa-tools"></i>
                </div>
                <h2>System Maintenance</h2>
                <p>${message || 'The toolkit is currently undergoing maintenance. Please check back later.'}</p>
                <div class="maintenance-timer">
                    <i class="fas fa-clock"></i> Started: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `;
        
        // Insert at the beginning of the container
        const container = document.querySelector('.container');
        if (container) {
            container.insertAdjacentHTML('afterbegin', maintenanceHtml);
        }
    }
    
    shouldRefresh() {
        if (!this.lastUpdate) return true;
        const now = new Date();
        const diff = now - this.lastUpdate;
        return diff > 5 * 60 * 1000; // 5 minutes
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the tools loader
const toolsLoader = new ToolsLoader();

// Export for use in other modules if needed
export default toolsLoader;