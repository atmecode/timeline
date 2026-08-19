/**
 * Memory Manager Module
 * Adaptive memory management based on device capabilities
 */
class MemoryManager {
    constructor(deviceDetector) {
        this.device = deviceDetector;
        this.tier = deviceDetector.tier;
        this.config = deviceDetector.getPerformanceProfile();
        this.currentUsage = 0;
        this.peakUsage = 0;
        this.warnings = [];
        
        // Memory monitoring
        this.monitoring = false;
        this.monitorInterval = null;
    }

    /**
     * Get current memory status
     */
    async checkMemory() {
        if (performance.memory) {
            this.currentUsage = performance.memory.usedJSHeapSize;
            const limit = performance.memory.jsHeapSizeLimit;
            const total = performance.memory.totalJSHeapSize;
            const usagePercent = this.currentUsage / limit;
            
            const status = {
                used: this.currentUsage,
                total: total,
                limit: limit,
                percent: usagePercent,
                isWarning: usagePercent > this.config.maxHeapUsage,
                isCritical: usagePercent > 0.85,
                available: limit - this.currentUsage
            };
            
            this.peakUsage = Math.max(this.peakUsage, this.currentUsage);
            
            return status;
        }
        
        // Fallback for browsers without memory API
        return {
            used: 0,
            total: 0,
            limit: 0,
            percent: 0,
            isWarning: false,
            isCritical: false,
            available: Infinity,
            unknown: true
        };
    }

    /**
     * Start memory monitoring
     */
    startMonitoring(callback, intervalMs = 1000) {
        if (this.monitoring) return;
        
        this.monitoring = true;
        this.monitorInterval = setInterval(async () => {
            const status = await this.checkMemory();
            if (callback) callback(status);
            
            // Log warnings
            if (status.isCritical) {
                console.error('CRITICAL: Memory usage critical!', status);
                this.warnings.push({
                    type: 'critical',
                    timestamp: new Date().toISOString(),
                    usage: status.percent
                });
            } else if (status.isWarning) {
                console.warn('WARNING: Memory usage high', status);
                this.warnings.push({
                    type: 'warning',
                    timestamp: new Date().toISOString(),
                    usage: status.percent
                });
            }
        }, intervalMs);
    }

    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        this.monitoring = false;
    }

    /**
     * Adapt point count based on available memory
     */
    adaptPointCount(points) {
        const maxPoints = this.config.maxPoints;
        
        if (points.length <= maxPoints) {
            return {
                points: points,
                subsampled: false,
                originalCount: points.length,
                finalCount: points.length
            };
        }
        
        console.warn(`Timeline has ${points.length} points, subsampling to ${maxPoints}`);
        
        const subsampled = this.smartSubsample(points, maxPoints);
        
        return {
            points: subsampled,
            subsampled: true,
            originalCount: points.length,
            finalCount: subsampled.length,
            reduction: ((1 - subsampled.length / points.length) * 100).toFixed(1) + '%'
        };
    }

    /**
     * Smart subsampling - keep important points
     */
    smartSubsample(points, targetCount) {
        if (points.length <= targetCount) {
            return points;
        }
        
        // Always keep: start, end
        const importantIndices = new Set([0, points.length - 1]);
        
        // Find significant direction changes
        let prevAngle = null;
        for (let i = 1; i < points.length - 1; i++) {
            const dx = points[i + 1].lon - points[i].lon;
            const dy = points[i + 1].lat - points[i].lat;
            const angle = Math.atan2(dy, dx);
            
            if (prevAngle !== null) {
                const angleDiff = Math.abs(angle - prevAngle);
                // Significant turn (> 30 degrees)
                if (angleDiff > 0.5) {
                    importantIndices.add(i);
                }
            }
            prevAngle = angle;
        }
        
        // Add time gaps (long pauses)
        for (let i = 1; i < points.length; i++) {
            if (points[i].timestamp && points[i - 1].timestamp) {
                const timeDiff = points[i].timestamp - points[i - 1].timestamp;
                // If gap > 1 hour
                if (timeDiff > 3600000) {
                    importantIndices.add(i);
                    importantIndices.add(i - 1);
                }
            }
        }
        
        // Fill remaining slots with evenly spaced points
        const importantArray = Array.from(importantIndices).sort((a, b) => a - b);
        const remainingSlots = targetCount - importantArray.length;
        
        if (remainingSlots > 0) {
            const step = Math.floor(points.length / remainingSlots);
            for (let i = 0; i < points.length && importantArray.length < targetCount; i += step) {
                if (!importantIndices.has(i)) {
                    importantArray.push(i);
                }
            }
        }
        
        // Sort and limit
        return importantArray
            .sort((a, b) => a - b)
            .slice(0, targetCount)
            .map(i => points[i]);
    }

    /**
     * Memory-safe chunk processing
     */
    async processInChunks(items, processFn, onProgress) {
        const chunkSize = this.config.chunkSize;
        const results = [];
        let currentChunkSize = chunkSize;
        
        for (let i = 0; i < items.length; i += currentChunkSize) {
            // Check memory before each chunk
            const memStatus = await this.checkMemory();
            
            // Reduce chunk size if memory is tight
            if (memStatus.isCritical) {
                currentChunkSize = Math.max(10, Math.floor(currentChunkSize / 2));
                console.warn('Memory critical, reducing chunk size to:', currentChunkSize);
                
                // Force garbage collection hint
                if (window.gc) window.gc();
            } else if (memStatus.isWarning && currentChunkSize > 50) {
                currentChunkSize = Math.max(50, Math.floor(currentChunkSize * 0.75));
            }
            
            const chunk = items.slice(i, i + currentChunkSize);
            
            try {
                const result = await processFn(chunk, i, items.length);
                results.push(...(Array.isArray(result) ? result : [result]));
            } catch (error) {
                console.error('Error processing chunk:', error);
                // Continue with next chunk
            }
            
            // Report progress
            if (onProgress) {
                onProgress({
                    processed: Math.min(i + currentChunkSize, items.length),
                    total: items.length,
                    percent: Math.min(100, ((i + currentChunkSize) / items.length) * 100),
                    memoryUsage: memStatus.percent
                });
            }
            
            // Yield to browser for GC
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        
        return results;
    }

    /**
     * Get resolution dimensions based on quality and aspect ratio
     * @param {string} quality - '480p', '720p', '1080p'
     * @param {string} aspectRatio - '1:1', '16:9', '9:16', '4:3', '21:9'
     */
    getResolutionDimensions(quality = '720p', aspectRatio = '16:9') {
        // Aspect ratio as width/height multiplier
        const ratios = {
            '1:1':  { w: 1, h: 1 },
            '16:9': { w: 16, h: 9 },
            '9:16': { w: 9, h: 16 },
            '4:3':  { w: 4, h: 3 },
            '21:9': { w: 21, h: 9 }
        };

        // Base resolution (longest side)
        const baseSizes = {
            '480p':  480,
            '720p':  720,
            '1080p': 1080
        };

        const base = baseSizes[quality] || 720;
        const ratio = ratios[aspectRatio] || ratios['16:9'];

        // Calculate dimensions so longest side = base
        let width, height;
        if (ratio.w >= ratio.h) {
            // Landscape or square
            width = Math.round(base * ratio.w / Math.max(ratio.w, ratio.h));
            height = Math.round(base * ratio.h / Math.max(ratio.w, ratio.h));
        } else {
            // Portrait
            width = Math.round(base * ratio.w / Math.max(ratio.w, ratio.h));
            height = Math.round(base * ratio.h / Math.max(ratio.w, ratio.h));
        }

        // Ensure even numbers (required by most codecs)
        width = Math.round(width / 2) * 2;
        height = Math.round(height / 2) * 2;

        return { width, height };
    }

    /**
     * Clear memory caches
     */
    clearCaches() {
        // Clear any stored frame data
        this.warnings = [];
        
        // Hint to browser for GC
        if (window.gc) {
            window.gc();
        }
    }

    /**
     * Get memory usage report
     */
    getReport() {
        return {
            tier: this.tier,
            config: this.config,
            peakUsage: this.peakUsage,
            warnings: this.warnings,
            currentUsage: this.currentUsage
        };
    }

    /**
     * Estimate memory needed for export
     */
    estimateExportMemory(frameCount, resolution) {
        const resolutions = {
            '480p': { width: 854, height: 480 },
            '720p': { width: 1280, height: 720 },
            '1080p': { width: 1920, height: 1080 }
        };
        
        const res = resolutions[resolution] || resolutions['720p'];
        
        // Raw frame size (RGBA)
        const frameSize = res.width * res.height * 4;
        
        // Estimated total for frames + processing overhead
        const estimatedTotal = frameSize * frameCount * 1.5; // 50% overhead
        
        return {
            frameSize: frameSize,
            totalFrames: frameCount,
            estimatedTotal: estimatedTotal,
            estimatedGB: (estimatedTotal / (1024 * 1024 * 1024)).toFixed(2),
            fitsInMemory: this.currentUsage + estimatedTotal < (performance.memory?.jsHeapSizeLimit || Infinity * 0.7)
        };
    }
}

// Export for use in other modules
window.MemoryManager = MemoryManager;
