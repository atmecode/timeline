/**
 * Animation Engine Module
 * Handles timeline animation with interpolation and camera following
 */
class AnimationEngine {
    constructor(mapRenderer) {
        this.map = mapRenderer;
        
        // Animation state
        this.points = [];
        this.currentIndex = 0;
        this.progress = 0; // 0 to 1
        this.isPlaying = false;
        this.animationFrame = null;
        
        // Timing
        this.duration = 60000; // Default 60 seconds in ms
        this.startTime = 0;
        this.elapsedTime = 0;
        this.lastFrameTime = 0;
        
        // FPS
        this.targetFPS = 30;
        this.frameInterval = 1000 / this.targetFPS;
        
        // Interpolation
        this.interpolatedPoints = [];
        this.totalDistance = 0;
        
        // Camera settings
        this.cameraDeadZone = 0.2; // 20% of screen
        this.cameraSmooth = 0.1;
        
        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
        this.onFrame = null;
    }

    /**
     * Set animation data
     */
    setData(points, durationSeconds = 60) {
        this.points = points;
        this.duration = durationSeconds * 1000;
        this.currentIndex = 0;
        this.progress = 0;
        
        // Pre-calculate interpolated points for smooth animation
        this.preCalculateInterpolation();
        
        // Initialize route (don't draw yet, will be drawn progressively)
        this.map.initRoute(points, { fitBounds: true });
        
        console.log(`Animation set: ${points.length} points, ${durationSeconds}s duration`);
    }

    /**
     * Pre-calculate interpolated points for smooth movement
     */
    preCalculateInterpolation() {
        this.interpolatedPoints = [];
        this.totalDistance = 0;
        
        // Calculate cumulative distances
        const distances = [0];
        for (let i = 1; i < this.points.length; i++) {
            const dist = this.haversineDistance(
                this.points[i - 1].lat, this.points[i - 1].lon,
                this.points[i].lat, this.points[i].lon
            );
            this.totalDistance += dist;
            distances.push(this.totalDistance);
        }
        
        // Generate interpolated points based on time
        const targetPoints = Math.min(this.points.length * 2, 10000);
        
        for (let i = 0; i < targetPoints; i++) {
            const targetDistance = (i / (targetPoints - 1)) * this.totalDistance;
            
            // Find segment
            let segmentIndex = 0;
            while (segmentIndex < distances.length - 1 && 
                   distances[segmentIndex + 1] < targetDistance) {
                segmentIndex++;
            }
            
            if (segmentIndex >= this.points.length - 1) {
                this.interpolatedPoints.push(this.points[this.points.length - 1]);
                continue;
            }
            
            // Interpolate within segment
            const segmentStart = distances[segmentIndex];
            const segmentEnd = distances[segmentIndex + 1];
            const segmentLength = segmentEnd - segmentStart;
            
            const fraction = segmentLength > 0 ? 
                (targetDistance - segmentStart) / segmentLength : 0;
            
            const interpolated = this.interpolatePoints(
                this.points[segmentIndex],
                this.points[segmentIndex + 1],
                fraction
            );
            
            this.interpolatedPoints.push(interpolated);
        }
    }

    /**
     * Interpolate between two points (great circle)
     */
    interpolatePoints(p1, p2, fraction) {
        if (fraction <= 0) return { ...p1 };
        if (fraction >= 1) return { ...p2 };
        
        // Simple linear interpolation for lat/lon
        // For more accuracy, use great circle interpolation
        return {
            lat: p1.lat + (p2.lat - p1.lat) * fraction,
            lon: p1.lon + (p2.lon - p1.lon) * fraction,
            timestamp: p1.timestamp ? 
                p1.timestamp + (p2.timestamp - p1.timestamp) * fraction : null
        };
    }

    /**
     * Calculate distance between two points
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    toRad(deg) {
        return deg * Math.PI / 180;
    }

    /**
     * Start playback
     */
    play() {
        if (this.isPlaying) return;
        
        this.isPlaying = true;
        this.startTime = performance.now() - this.elapsedTime;
        this.lastFrameTime = performance.now();
        
        this.animate();
    }

    /**
     * Pause playback
     */
    pause() {
        this.isPlaying = false;
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Stop and reset
     */
    stop() {
        this.pause();
        this.elapsedTime = 0;
        this.progress = 0;
        this.currentIndex = 0;
        
        // Reset map
        if (this.interpolatedPoints.length > 0) {
            this.map.updateProgress(0, this.interpolatedPoints);
        }
        
        this.notifyProgress();
    }

    /**
     * Main animation loop
     */
    animate() {
        if (!this.isPlaying) return;
        
        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;
        
        // Check if enough time has passed for next frame
        if (deltaTime >= this.frameInterval) {
            this.lastFrameTime = now - (deltaTime % this.frameInterval);
            
            // Update elapsed time
            this.elapsedTime = now - this.startTime;
            
            // Calculate progress
            this.progress = Math.min(1, this.elapsedTime / this.duration);
            
            // Get current interpolated point index
            this.currentIndex = Math.floor(this.progress * (this.interpolatedPoints.length - 1));
            
            // Update map
            this.map.updateProgress(this.progress, this.interpolatedPoints);
            
            // Notify progress
            this.notifyProgress();
            
            // Call frame callback
            if (this.onFrame) {
                this.onFrame(this.progress, this.currentIndex);
            }
            
            // Check if animation complete
            if (this.progress >= 1) {
                this.onAnimationComplete();
                return;
            }
        }
        
        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    /**
     * Handle animation completion
     */
    onAnimationComplete() {
        this.isPlaying = false;
        this.progress = 1;
        
        console.log('Animation complete');
        
        if (this.onComplete) {
            this.onComplete();
        }
    }

    /**
     * Seek to specific progress
     */
    seek(progress) {
        this.progress = Math.max(0, Math.min(1, progress));
        this.elapsedTime = this.progress * this.duration;
        this.currentIndex = Math.floor(this.progress * (this.interpolatedPoints.length - 1));
        
        // Update map
        this.map.updateProgress(this.progress, this.interpolatedPoints);
        
        this.notifyProgress();
    }

    /**
     * Seek to specific time
     */
    seekToTime(timeMs) {
        const progress = timeMs / this.duration;
        this.seek(progress);
    }

    /**
     * Get current progress
     */
    getProgress() {
        return this.progress;
    }

    /**
     * Get current time in ms
     */
    getCurrentTime() {
        return this.elapsedTime;
    }

    /**
     * Get formatted time string
     */
    getTimeString(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Get duration string
     */
    getDurationString() {
        return this.getTimeString(this.duration);
    }

    /**
     * Notify progress callback
     */
    notifyProgress() {
        if (this.onProgress) {
            this.onProgress({
                progress: this.progress,
                currentTime: this.elapsedTime,
                duration: this.duration,
                currentTimeStr: this.getTimeString(this.elapsedTime),
                durationStr: this.getDurationString(),
                currentIndex: this.currentIndex,
                totalPoints: this.interpolatedPoints.length
            });
        }
    }

    /**
     * Set target FPS
     */
    setFPS(fps) {
        this.targetFPS = fps;
        this.frameInterval = 1000 / fps;
    }

    /**
     * Set duration in seconds
     */
    setDuration(seconds) {
        this.duration = seconds * 1000;
    }

    /**
     * Get current frame as image data
     * Used for video export
     */
    async getCurrentFrame(width, height) {
        // Capture map view
        return await this.map.captureFrame(width, height);
    }

    /**
     * Get all interpolated points for export
     */
    getInterpolatedPoints() {
        return this.interpolatedPoints;
    }
}

// Export for use in other modules
window.AnimationEngine = AnimationEngine;
