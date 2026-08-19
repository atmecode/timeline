/**
 * Device Detection Module
 * Detects device capabilities for adaptive memory management
 */
class DeviceDetector {
    constructor() {
        this.info = this.detect();
        this.tier = this.calculateTier();
    }

    /**
     * Detect device capabilities
     */
    detect() {
        const info = {
            // RAM detection
            ram: navigator.deviceMemory || this.estimateRAM(),
            
            // CPU cores
            cores: navigator.hardwareConcurrency || 4,
            
            // Device type
            isMobile: /Mobi|Android(?!.*Tablet)|iPhone|iPod/i.test(navigator.userAgent),
            isTablet: /iPad|Android(?!.*Mobile)/i.test(navigator.userAgent),
            isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
            isAndroid: /Android/.test(navigator.userAgent),
            
            // Browser capabilities
            supportsWebAssembly: typeof WebAssembly !== 'undefined',
            supportsOffscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            supportsWebWorker: typeof Worker !== 'undefined',
            supportsMemoryAPI: 'memory' in performance,
            
            // GPU info
            gpu: this.getGPUInfo(),
            
            // Screen info
            screen: {
                width: window.screen.width,
                height: window.screen.height,
                pixelRatio: window.devicePixelRatio || 1
            },
            
            // Timestamp
            detectedAt: new Date().toISOString()
        };

        return info;
    }

    /**
     * Estimate RAM based on device type
     */
    estimateRAM() {
        if (this.info?.isMobile) {
            // Most mobile devices have 3-6GB RAM
            return this.info.isIOS ? 4 : 4;
        }
        // Desktop/laptop assumption
        return 8;
    }

    /**
     * Get GPU information
     */
    getGPUInfo() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    return {
                        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
                        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
                    };
                }
            }
        } catch (e) {
            console.warn('Could not detect GPU info:', e);
        }
        return null;
    }

    /**
     * Calculate device performance tier
     * Returns: 'high', 'medium', or 'low'
     */
    calculateTier() {
        const { ram, cores, isMobile, isTablet } = this.info;
        
        // Scoring system (0-100)
        let score = 0;
        
        // RAM score (0-40 points)
        if (ram >= 16) score += 40;
        else if (ram >= 12) score += 35;
        else if (ram >= 8) score += 30;
        else if (ram >= 6) score += 20;
        else if (ram >= 4) score += 10;
        else score += 5;
        
        // CPU score (0-30 points)
        if (cores >= 12) score += 30;
        else if (cores >= 8) score += 25;
        else if (cores >= 6) score += 20;
        else if (cores >= 4) score += 15;
        else score += 5;
        
        // Device type adjustments
        if (isMobile) score -= 20;
        else if (isTablet) score -= 10;
        
        // GPU bonus (if high-end detected)
        if (this.info.gpu?.renderer) {
            const renderer = this.info.gpu.renderer.toLowerCase();
            if (renderer.includes('nvidia') || renderer.includes('radeon') || 
                renderer.includes('apple') || renderer.includes('adreno 7')) {
                score += 10;
            }
        }
        
        // Determine tier
        if (score >= 60) return 'high';
        if (score >= 35) return 'medium';
        return 'low';
    }

    /**
     * Get performance profile based on tier
     */
    getPerformanceProfile() {
        const profiles = {
            high: {
                maxPoints: 200000,
                resolution: '1080p',
                fps: 30,
                chunkSize: 500,
                bufferFrames: 500,
                tileCacheSize: 200,
                maxHeapUsage: 0.7,
                exportMode: 'full',
                animationQuality: 'high',
                description: 'High-end Desktop/Laptop'
            },
            medium: {
                maxPoints: 100000,
                resolution: '720p',
                fps: 30,
                chunkSize: 300,
                bufferFrames: 300,
                tileCacheSize: 100,
                maxHeapUsage: 0.6,
                exportMode: 'balanced',
                animationQuality: 'medium',
                description: 'Mid-range Device'
            },
            low: {
                maxPoints: 30000,
                resolution: '480p',
                fps: 24,
                chunkSize: 100,
                bufferFrames: 100,
                tileCacheSize: 50,
                maxHeapUsage: 0.5,
                exportMode: 'lite',
                animationQuality: 'low',
                description: 'Mobile/Low-end Device'
            }
        };
        
        return profiles[this.tier];
    }

    /**
     * Render device info to HTML
     */
    renderInfo() {
        const profile = this.getPerformanceProfile();
        
        return `
            <h4>📊 Device Capabilities</h4>
            <div class="device-info-grid">
                <div class="device-info-item">
                    <span class="label">Performance Tier</span>
                    <span class="value tier-${this.tier}">${this.tier.toUpperCase()}</span>
                </div>
                <div class="device-info-item">
                    <span class="label">RAM</span>
                    <span class="value">${this.info.ram || '?'} GB</span>
                </div>
                <div class="device-info-item">
                    <span class="label">CPU Cores</span>
                    <span class="value">${this.info.cores}</span>
                </div>
                <div class="device-info-item">
                    <span class="label">Device Type</span>
                    <span class="value">${this.getDeviceType()}</span>
                </div>
                <div class="device-info-item">
                    <span class="label">Max Points</span>
                    <span class="value">${this.formatNumber(profile.maxPoints)}</span>
                </div>
                <div class="device-info-item">
                    <span class="label">Export Quality</span>
                    <span class="value">${profile.resolution}</span>
                </div>
            </div>
            ${this.info.isMobile ? '<p class="mt-1" style="color: var(--warning);">⚠️ Mobile device detected - export quality auto-adjusted</p>' : ''}
        `;
    }

    /**
     * Get device type string
     */
    getDeviceType() {
        if (this.info.isMobile) return '📱 Mobile';
        if (this.info.isTablet) return '📱 Tablet';
        return '💻 Desktop';
    }

    /**
     * Format number with commas
     */
    formatNumber(num) {
        return num.toLocaleString();
    }

    /**
     * Check if device meets minimum requirements
     */
    checkMinimumRequirements() {
        const issues = [];
        
        if (!this.info.supportsWebAssembly) {
            issues.push('WebAssembly not supported - video export unavailable');
        }
        
        if (this.info.ram && this.info.ram < 2) {
            issues.push('Very low RAM detected - performance may be limited');
        }
        
        return {
            passed: issues.length === 0,
            issues: issues
        };
    }
}

// Export for use in other modules
window.DeviceDetector = DeviceDetector;
