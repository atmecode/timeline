/**
 * Animation Engine Module
 * Ported from mahlernim/google-timeline-visualizer Python original
 * 
 * Features:
 * - Distance-based animation timing with compression
 * - Great-circle interpolation for long hops
 * - Camera dead zone for smooth following
 * - Transfer detection for flights
 * - Multiple camera movement modes
 */
class AnimationEngine {
    constructor(mapRenderer) {
        this.map = mapRenderer;

        // Route data
        this.points = [];
        this.lats = [];
        this.lons = [];
        this.xs = [];  // Web Mercator x
        this.ys = [];  // Web Mercator y
        this.cumDist = [];
        this.totalKm = 0;

        // Transfer detection
        this.legs = [];
        this.thresholdKm = 0;

        // Timing
        this.distanceAt = null; // compression function
        this.duration = 60000;
        this.fps = 30;

        // Animation state
        this.progress = 0;
        this.isPlaying = false;
        this.animationFrame = null;
        this.startTime = 0;
        this.elapsedTime = 0;
        this.lastFrameTime = 0;
        this.frameInterval = 1000 / this.fps;

        // Camera settings
        this.cameraMode = 'steady';
        this.compression = 'balanced';

        // Frame data (pre-calculated)
        this.framePoints = [];
        this.frameIndices = [];
        this.cameraTrack = [];
        this.camCenters = [];
        this.camSpans = [];

        // Callbacks
        this.onProgress = null;
        this.onComplete = null;
    }

    /**
     * Set animation data and prepare everything
     */
    setData(points, durationSeconds = 60, cameraMode = 'steady', compression = 'balanced') {
        this.points = points;
        this.duration = durationSeconds * 1000;
        this.cameraMode = cameraMode;
        this.compression = compression;
        this.progress = 0;
        this.elapsedTime = 0;

        // Convert points to arrays
        this.lats = points.map(p => p.lat);
        this.lons = points.map(p => p.lon);

        // Convert to Web Mercator meters
        this.xs = [];
        this.ys = [];
        for (const p of points) {
            const m = Projection.latlonToMeters(p.lat, p.lon);
            this.xs.push(m.x);
            this.ys.push(m.y);
        }

        // Calculate cumulative distances
        this.cumDist = [0.0];
        let total = 0.0;
        for (let i = 1; i < this.lats.length; i++) {
            const d = Projection.haversineDistance(
                this.lats[i - 1], this.lons[i - 1],
                this.lats[i], this.lons[i]
            );
            total += d;
            this.cumDist.push(total);
        }
        this.totalKm = total;

        // Detect transfers
        this.thresholdKm = TransferUtils.transferThresholdKm(this.cumDist);
        this.legs = TransferUtils.buildLegs(this.cumDist, this.thresholdKm);

        // Build timing function (with compression)
        this.distanceAt = TimingUtils.buildJourneyTiming(this.cumDist, compression);

        // Pre-calculate frame data
        this.preCalculateFrames();

        // Build camera track
        this.buildCameraTrack();

        // Initialize map
        this.map.initRoute(points, { fitBounds: true });

        console.log(`Animation set: ${points.length} points, ${durationSeconds}s, ${this.totalKm.toFixed(1)}km`);
        console.log(`Camera: ${cameraMode}, Compression: ${compression}, Transfers: ${this.legs.filter(l => l.isTransfer).length}`);
    }

    /**
     * Pre-calculate all frame positions
     */
    preCalculateFrames() {
        const totalFrames = Math.round(this.fps * (this.duration / 1000));
        this.frameProgress = [];
        this.framePoints = [];
        this.frameIndices = [];

        for (let i = 0; i < totalFrames; i++) {
            const progress = i / (totalFrames - 1);
            this.frameProgress.push(progress);

            // Get distance at this progress
            const distKm = this.distanceAt(progress);

            // Find index in route
            const idx = this.bisectRight(this.cumDist, distKm) - 1;
            const frameIdx = Math.min(Math.max(idx, 0), this.cumDist.length - 1);
            this.frameIndices.push(frameIdx);

            // Get interpolated position
            const pos = Projection.positionAtDistance(this.cumDist, this.lats, this.lons, distKm);
            const meterPos = Projection.latlonToMeters(pos.lat, pos.lon);
            this.framePoints.push(meterPos);
        }
    }

    /**
     * Build camera track (from Python: build_camera_track)
     */
    buildCameraTrack() {
        const movement = ENGINE_CONFIG.CAMERA_MOVEMENTS[this.cameraMode];
        const totalFrames = this.frameProgress.length;

        // Sample camera positions
        const rawSamples = [];
        for (let i = 0; i <= ENGINE_CONFIG.CAMERA_TRACK_SAMPLES; i++) {
            const sample = i / ENGINE_CONFIG.CAMERA_TRACK_SAMPLES;
            const distKm = this.distanceAt(sample);
            const sampleResult = this.rawCameraSample(distKm, movement);
            rawSamples.push(sampleResult);
        }

        // Handle fixed zoom
        let fixedSpan = null;
        if (movement.fixed_zoom) {
            const spans = rawSamples.map(s => s.span).sort((a, b) => a - b);
            fixedSpan = spans[Math.floor(spans.length * ENGINE_CONFIG.FIXED_ZOOM_PERCENTILE)];
        }

        // Smooth camera track with dead zone
        this.cameraTrack = [];
        for (let i = 0; i < rawSamples.length; i++) {
            const raw = rawSamples[i];
            const targetSpan = fixedSpan !== null ? fixedSpan : raw.span;

            if (i === 0) {
                this.cameraTrack.push({ x: raw.x, y: raw.y, span: targetSpan });
                continue;
            }

            const prev = this.cameraTrack[this.cameraTrack.length - 1];

            // Smooth zoom
            const alpha = targetSpan > prev.span ? movement.zoom_out_alpha : movement.zoom_in_alpha;
            const span = movement.fixed_zoom ? targetSpan :
                Math.exp(Math.log(prev.span) + (Math.log(targetSpan) - Math.log(prev.span)) * alpha);

            // Apply dead zone
            const deadHalf = span * ENGINE_CONFIG.CAMERA_DEAD_ZONE_HALF;
            let cx = prev.x;
            let cy = prev.y;

            if (raw.x < cx - deadHalf) cx = raw.x + deadHalf;
            else if (raw.x > cx + deadHalf) cx = raw.x - deadHalf;

            if (raw.y < cy - deadHalf) cy = raw.y + deadHalf;
            else if (raw.y > cy + deadHalf) cy = raw.y - deadHalf;

            this.cameraTrack.push({ x: cx, y: cy, span: span });
        }

        // Map camera track to frame progress
        this.camCenters = [];
        this.camSpans = [];

        for (let i = 0; i < totalFrames; i++) {
            const progress = this.frameProgress[i];
            const cam = this.cameraAt(progress);
            this.camCenters.push(cam);
            this.camSpans.push(cam.span);
        }
    }

    /**
     * Raw camera sample (from Python: raw_camera_sample)
     */
    rawCameraSample(distanceKm, movement) {
        const totalKm = this.totalKm;

        // Position at distance
        const pos = Projection.positionAtDistance(this.cumDist, this.lats, this.lons, distanceKm);
        const meterPos = Projection.latlonToMeters(pos.lat, pos.lon);

        // Context size
        const context = Math.max(
            movement.minimum_context_km,
            Math.min(movement.maximum_context_km, totalKm * movement.context_fraction)
        );

        // Check if in a transfer leg
        const leg = movement.leg_aware ?
            TransferUtils.legAt(this.legs, distanceKm, totalKm) : null;

        let padding, rangeStart, lookaheadLimit;

        if (leg && leg.isTransfer) {
            // Transfer: zoom to fit the whole transfer
            const legContext = leg.end - leg.start;
            const tailDist = Math.max(0, distanceKm - legContext);
            const lookaheadDist = Math.min(totalKm, distanceKm + legContext);

            const startIdx = this.bisectLeft(this.cumDist, tailDist);
            const endIdx = this.bisectRight(this.cumDist, lookaheadDist);

            const focusXs = this.xs.slice(startIdx, endIdx);
            const focusYs = this.ys.slice(startIdx, endIdx);

            // Add edge points
            for (const edgeDist of [tailDist, distanceKm, lookaheadDist]) {
                const edgePos = Projection.positionAtDistance(this.cumDist, this.lats, this.lons, edgeDist);
                const edgeMeter = Projection.latlonToMeters(edgePos.lat, edgePos.lon);
                focusXs.push(edgeMeter.x);
                focusYs.push(edgeMeter.y);
            }

            const minSpan = movement.minimum_span * (2 * ENGINE_CONFIG.MAX_EXTENT);
            const span = Math.max(
                (Math.max(...focusXs) - Math.min(...focusXs)) * ENGINE_CONFIG.TRANSFER_PADDING,
                (Math.max(...focusYs) - Math.min(...focusYs)) * ENGINE_CONFIG.TRANSFER_PADDING,
                minSpan
            );

            return {
                x: meterPos.x,
                y: meterPos.y,
                span: Math.min(span, 0.72 * 2 * ENGINE_CONFIG.MAX_EXTENT)
            };
        } else {
            // Normal movement
            padding = movement.padding;
            rangeStart = leg ? leg.start : 0.0;
            lookaheadLimit = totalKm;
        }

        const tailDist = Math.max(rangeStart, distanceKm - context);
        const lookaheadDist = Math.min(lookaheadLimit, distanceKm + context);

        const startIdx = this.bisectLeft(this.cumDist, tailDist);
        const endIdx = this.bisectRight(this.cumDist, lookaheadDist);

        const focusXs = this.xs.slice(startIdx, endIdx);
        const focusYs = this.ys.slice(startIdx, endIdx);

        // Add edge points
        for (const edgeDist of [tailDist, distanceKm, lookaheadDist]) {
            const edgePos = Projection.positionAtDistance(this.cumDist, this.lats, this.lons, edgeDist);
            const edgeMeter = Projection.latlonToMeters(edgePos.lat, edgePos.lon);
            focusXs.push(edgeMeter.x);
            focusYs.push(edgeMeter.y);
        }

        const minSpan = movement.minimum_span * (2 * ENGINE_CONFIG.MAX_EXTENT);
        const span = Math.max(
            (Math.max(...focusXs) - Math.min(...focusXs)) * padding,
            (Math.max(...focusYs) - Math.min(...focusYs)) * padding,
            minSpan
        );

        return {
            x: meterPos.x,
            y: meterPos.y,
            span: Math.min(span, 0.72 * 2 * ENGINE_CONFIG.MAX_EXTENT)
        };
    }

    /**
     * Get camera position at progress (from Python: camera_at)
     */
    cameraAt(progress) {
        const position = Math.max(0.0, Math.min(1.0, progress)) * (this.cameraTrack.length - 1);
        const fromIndex = Math.floor(position);
        const toIndex = Math.min(fromIndex + 1, this.cameraTrack.length - 1);
        const fraction = position - fromIndex;

        const before = this.cameraTrack[fromIndex];
        const after = this.cameraTrack[toIndex];

        return {
            x: before.x + (after.x - before.x) * fraction,
            y: before.y + (after.y - before.y) * fraction,
            span: Math.exp(Math.log(before.span) + (Math.log(after.span) - Math.log(before.span)) * fraction)
        };
    }

    // --- Playback Controls ---

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.startTime = performance.now() - this.elapsedTime;
        this.lastFrameTime = performance.now();
        this.animate();
    }

    pause() {
        this.isPlaying = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    stop() {
        this.pause();
        this.elapsedTime = 0;
        this.progress = 0;
        this.notifyProgress();
        // Reset map
        if (this.framePoints.length > 0) {
            this.map.updateProgress(0, this.points, this.framePoints, this.camCenters, this.camSpans);
        }
    }

    seek(progress) {
        this.progress = Math.max(0, Math.min(1, progress));
        this.elapsedTime = this.progress * this.duration;
        this.currentIndex = Math.floor(this.progress * (this.framePoints.length - 1));

        // Update map
        this.map.updateProgress(this.progress, this.points, this.framePoints, this.camCenters, this.camSpans);

        this.notifyProgress();
    }

    /**
     * Main animation loop
     */
    animate() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const deltaTime = now - this.lastFrameTime;

        if (deltaTime >= this.frameInterval) {
            this.lastFrameTime = now - (deltaTime % this.frameInterval);

            this.elapsedTime = now - this.startTime;
            this.progress = Math.min(1, this.elapsedTime / this.duration);
            this.currentIndex = Math.floor(this.progress * (this.framePoints.length - 1));

            // Update map
            this.map.updateProgress(this.progress, this.points, this.framePoints, this.camCenters, this.camSpans);

            this.notifyProgress();

            if (this.progress >= 1) {
                this.onAnimationComplete();
                return;
            }
        }

        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    onAnimationComplete() {
        this.isPlaying = false;
        this.progress = 1;
        console.log('Animation complete');
        if (this.onComplete) this.onComplete();
    }

    // --- Utilities ---

    bisectLeft(arr, value) {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    bisectRight(arr, value) {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] <= value) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }

    getTimeString(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    getDurationString() {
        return this.getTimeString(this.duration);
    }

    notifyProgress() {
        if (this.onProgress) {
            this.onProgress({
                progress: this.progress,
                currentTime: this.elapsedTime,
                duration: this.duration,
                currentTimeStr: this.getTimeString(this.elapsedTime),
                durationStr: this.getDurationString(),
                currentIndex: this.currentIndex || 0,
                totalPoints: this.framePoints.length
            });
        }
    }

    setFPS(fps) {
        this.fps = fps;
        this.frameInterval = 1000 / fps;
    }
}

window.AnimationEngine = AnimationEngine;
