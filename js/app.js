/**
 * Main Application Controller
 * Google Timeline Visualizer
 */
class App {
    // Version info
    static VERSION = '2.2.1';
    static BUILD_DATE = '2025-08-20';
    
    constructor() {
        // Core modules
        this.deviceDetector = new DeviceDetector();
        this.memoryManager = new MemoryManager(this.deviceDetector);
        this.parser = new TimelineParser();
        this.mapRenderer = null;
        this.animation = null;
        this.exporter = new VideoExporter(this.memoryManager);
        
        // State
        this.timelineData = null;
        this.parsedPoints = [];
        this.fileName = '';
        
        // DOM elements
        this.elements = {};
        
        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        console.log('Initializing Google Timeline Visualizer...');
        console.log('Device tier:', this.deviceDetector.tier);
        
        // Cache DOM elements
        this.cacheElements();
        
        // Render device info
        this.renderDeviceInfo();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Check minimum requirements
        this.checkRequirements();
        
        console.log('App initialized');
    }

    /**
     * Cache DOM elements for quick access
     */
    cacheElements() {
        this.elements = {
            // Global loading
            globalLoading: document.getElementById('global-loading'),
            loadingText: document.getElementById('loading-text'),
            
            // File upload
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('file-input'),
            browseBtn: document.getElementById('browse-btn'),
            fileInfo: document.getElementById('file-info'),
            changeFileBtn: document.getElementById('change-file-btn'),
            
            // Device info
            deviceInfo: document.getElementById('device-info'),
            
            // Settings
            settingsSection: document.getElementById('settings-section'),
            startDate: document.getElementById('start-date'),
            endDate: document.getElementById('end-date'),
            duration: document.getElementById('duration'),
            durationValue: document.getElementById('duration-value'),
            resolution: document.getElementById('resolution'),
            title: document.getElementById('title'),
            gpsFilter: document.getElementById('gps-filter'),
            cameraMode: document.getElementById('camera-mode'),
            compression: document.getElementById('compression'),
            aspectRatio: document.getElementById('aspect-ratio'),
            
            // Buttons
            previewBtn: document.getElementById('preview-btn'),
            exportBtn: document.getElementById('export-btn'),
            
            // Map
            mapSection: document.getElementById('map-section'),
            mapContainer: document.getElementById('map'),
            
            // Progress
            progressOverlay: document.getElementById('progress-overlay'),
            progressText: document.getElementById('progress-text'),
            progressBar: document.getElementById('progress-bar'),
            progressPercent: document.getElementById('progress-percent'),
            cancelBtn: document.getElementById('cancel-btn'),
            
            // Playback section & controls
            playbackSection: document.getElementById('playback-section'),
            playbackControls: document.getElementById('playback-controls'),
            playBtn: document.getElementById('play-btn'),
            pauseBtn: document.getElementById('pause-btn'),
            restartBtn: document.getElementById('restart-btn'),
            playbackSlider: document.getElementById('playback-slider'),
            timeDisplay: document.getElementById('time-display'),
            
            // Export result
            exportResult: document.getElementById('export-result'),
            videoPreview: document.getElementById('video-preview'),
            downloadBtn: document.getElementById('download-btn'),
            newVideoBtn: document.getElementById('new-video-btn')
        };
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // File upload
        this.elements.browseBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files[0]);
        });
        
        this.elements.changeFileBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        
        // Drag and drop
        this.elements.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.add('dragover');
        });
        
        this.elements.dropZone.addEventListener('dragleave', () => {
            this.elements.dropZone.classList.remove('dragover');
        });
        
        this.elements.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.dropZone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFileSelect(file);
        });
        
        this.elements.dropZone.addEventListener('click', (e) => {
            if (e.target === this.elements.dropZone || 
                e.target.closest('.upload-content')) {
                this.elements.fileInput.click();
            }
        });
        
        // Duration input
        this.elements.duration.addEventListener('input', (e) => {
            this.updateDurationPreset(parseInt(e.target.value));
        });
        
        // Duration preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const duration = parseInt(btn.dataset.duration);
                this.elements.duration.value = duration;
                this.updateDurationPreset(duration);
            });
        });
        
        // Action buttons
        this.elements.previewBtn.addEventListener('click', () => {
            this.startPreview();
        });
        
        this.elements.exportBtn.addEventListener('click', () => {
            this.startExport();
        });
        
        // Playback controls
        this.elements.playBtn.addEventListener('click', () => {
            this.play();
        });
        
        this.elements.pauseBtn.addEventListener('click', () => {
            this.pause();
        });
        
        this.elements.restartBtn.addEventListener('click', () => {
            this.restart();
        });
        
        this.elements.playbackSlider.addEventListener('input', (e) => {
            this.seek(e.target.value / 100);
        });
        
        // Cancel button
        this.elements.cancelBtn.addEventListener('click', () => {
            this.cancelExport();
        });
        
        // Export result buttons
        this.elements.newVideoBtn.addEventListener('click', () => {
            this.resetUI();
        });
        
        // Window resize
        window.addEventListener('resize', () => {
            if (this.mapRenderer) {
                this.mapRenderer.resize();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Load saved settings
        this.loadSettings();
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        // Don't handle if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (this.animation) {
                    this.animation.isPlaying ? this.pause() : this.play();
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if (this.animation) {
                    this.seek(Math.max(0, this.animation.progress - 0.05));
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if (this.animation) {
                    this.seek(Math.min(1, this.animation.progress + 0.05));
                }
                break;
            case 'KeyR':
                if (this.animation) this.restart();
                break;
            case 'KeyP':
                this.startPreview();
                break;
            case 'KeyE':
                this.startExport();
                break;
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings() {
        const settings = {
            duration: this.elements.duration.value,
            resolution: this.elements.resolution.value,
            aspectRatio: this.elements.aspectRatio.value,
            cameraMode: this.elements.cameraMode.value,
            compression: this.elements.compression.value,
            title: this.elements.title.value,
            gpsFilter: this.elements.gpsFilter.checked
        };
        localStorage.setItem('timeline-visualizer-settings', JSON.stringify(settings));
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const saved = localStorage.getItem('timeline-visualizer-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.duration) this.elements.duration.value = settings.duration;
                if (settings.resolution) this.elements.resolution.value = settings.resolution;
                if (settings.aspectRatio) this.elements.aspectRatio.value = settings.aspectRatio;
                if (settings.cameraMode) this.elements.cameraMode.value = settings.cameraMode;
                if (settings.compression) this.elements.compression.value = settings.compression;
                if (settings.title) this.elements.title.value = settings.title;
                if (settings.gpsFilter !== undefined) this.elements.gpsFilter.checked = settings.gpsFilter;
                console.log('Settings loaded from localStorage');
            }
        } catch (e) {
            console.warn('Failed to load settings:', e);
        }
    }

    /**
     * Calculate ETA for export
     */
    calculateETA(progress, startTime) {
        if (progress <= 0) return 'Calculating...';
        const elapsed = (Date.now() - startTime) / 1000;
        const remaining = (elapsed / progress) * (1 - progress);
        if (remaining < 60) return `~${Math.round(remaining)}s remaining`;
        return `~${Math.round(remaining / 60)}m ${Math.round(remaining % 60)}s remaining`;
    }

    /**
     * Share video using Web Share API
     */
    async shareVideo(blob, title) {
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([blob], `${title}.mp4`, { type: blob.type });
                if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: title,
                        text: 'My travel timeline',
                        files: [file]
                    });
                    return true;
                }
            } catch (e) {
                console.log('Share cancelled or failed:', e);
            }
        }
        return false;
    }

    /**
     * Check minimum requirements
     */
    checkRequirements() {
        const requirements = this.deviceDetector.checkMinimumRequirements();
        
        if (!requirements.passed) {
            this.showToast(
                'Warning: ' + requirements.issues.join(', '),
                'warning'
            );
        }
        
        // Check export support
        const supportInfo = VideoExporter.getSupportInfo();
        console.log('Export support info:', supportInfo);
        
        if (!VideoExporter.isSupported()) {
            this.showToast(
                'Video export not supported in this browser.',
                'warning'
            );
        } else {
            console.log('Supported video types:', supportInfo.supportedTypes);
        }
    }

    /**
     * Render device info
     */
    renderDeviceInfo() {
        this.elements.deviceInfo.innerHTML = this.deviceDetector.renderInfo();
        
        // Show version info
        const versionEl = document.getElementById('app-version');
        if (versionEl) {
            versionEl.textContent = `v${App.VERSION} (${App.BUILD_DATE})`;
        }
    }

    /**
     * Handle file selection
     */
    async handleFileSelect(file) {
        if (!file) return;
        
        // Validate file type
        if (!file.name.endsWith('.json')) {
            this.showToast('Please select a Timeline.json file', 'error');
            return;
        }
        
        this.fileName = file.name;
        
        // Show global loading
        this.showGlobalLoading('Reading file...');
        
        try {
            // Read file (use setTimeout to allow UI to update)
            await new Promise(resolve => setTimeout(resolve, 100));
            const text = await file.text();
            
            // Update loading text
            this.updateGlobalLoading('Parsing JSON...');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const data = JSON.parse(text);
            
            // Update loading text
            this.updateGlobalLoading('Extracting timeline points...');
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Parse timeline
            const result = this.parser.parse(data, {
                filterGPS: this.elements.gpsFilter.checked
            });
            
            this.timelineData = data;
            this.parsedPoints = result.points;
            
            // Update loading text
            this.updateGlobalLoading('Processing complete!');
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Update UI
            this.updateFileInfo(file.name, result.stats);
            this.updateDateRange(result.stats.dateRange);
            this.showSettings();
            
            // Apply adaptive memory management
            this.applyMemoryAdaptation();
            
            this.hideGlobalLoading();
            
            if (result.stats.totalPoints > 0) {
                this.showToast(`Loaded ${result.stats.totalPoints.toLocaleString()} points`, 'success');
            } else {
                this.showToast('No points found. Check your Timeline.json format.', 'warning');
            }
            
        } catch (error) {
            this.hideGlobalLoading();
            console.error('Error loading file:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        }
    }

    /**
     * Apply memory adaptation to loaded data
     */
    applyMemoryAdaptation() {
        const adapted = this.memoryManager.adaptPointCount(this.parsedPoints);
        
        if (adapted.subsampled) {
            this.parsedPoints = adapted.points;
            this.showToast(
                `Timeline optimized: ${adapted.originalCount.toLocaleString()} → ${adapted.finalCount.toLocaleString()} points (-${adapted.reduction})`,
                'warning'
            );
        }
    }

    /**
     * Update file info display
     */
    updateFileInfo(name, stats) {
        this.elements.fileInfo.style.display = 'flex';
        this.elements.fileInfo.querySelector('.file-name').textContent = name;
        this.elements.fileInfo.querySelector('.file-points').textContent = 
            `${stats.totalPoints.toLocaleString()} points • ${stats.totalDistance.toLocaleString()} km`;
        
        this.elements.dropZone.style.display = 'none';
    }

    /**
     * Update date range inputs
     */
    updateDateRange(dateRange) {
        if (!dateRange) return;
        
        const formatDate = (date) => {
            return date.toISOString().split('T')[0];
        };
        
        this.elements.startDate.value = formatDate(dateRange.start);
        this.elements.endDate.value = formatDate(dateRange.end);
        this.elements.startDate.min = formatDate(dateRange.start);
        this.elements.startDate.max = formatDate(dateRange.end);
        this.elements.endDate.min = formatDate(dateRange.start);
        this.elements.endDate.max = formatDate(dateRange.end);
    }

    /**
     * Show settings section
     */
    showSettings() {
        this.elements.settingsSection.style.display = 'block';
        this.elements.settingsSection.classList.add('fade-in');
        
        // Auto-select resolution based on device tier
        const optimalResolution = this.memoryManager.config.resolution;
        this.elements.resolution.value = optimalResolution;
        console.log('Auto-selected resolution:', optimalResolution);
        
        // Set initial duration preset
        this.updateDurationPreset(parseInt(this.elements.duration.value));
    }

    /**
     * Update duration preset button active state
     */
    updateDurationPreset(value) {
        let matched = false;
        document.querySelectorAll('.preset-btn').forEach(btn => {
            const btnValue = parseInt(btn.dataset.duration);
            const isActive = btnValue === value;
            btn.classList.toggle('active', isActive);
            if (isActive) matched = true;
        });
        
        // Add custom indicator to input if no preset matches
        this.elements.duration.classList.toggle('custom-value', !matched);
    }

    /**
     * Initialize map
     */
    initMap() {
        // Show map section first
        this.elements.mapSection.style.display = 'block';
        
        if (!this.mapRenderer) {
            this.mapRenderer = new MapRenderer('map');
            this.mapRenderer.init();
            this.animation = new AnimationEngine(this.mapRenderer);
            
            // Set up animation callbacks
            this.animation.onProgress = (data) => {
                this.updatePlaybackUI(data);
            };
            
            this.animation.onComplete = () => {
                this.onAnimationComplete();
            };
        }
        
        // Force map refresh after becoming visible
        setTimeout(() => {
            if (this.mapRenderer) {
                this.mapRenderer.refresh();
            }
        }, 200);
    }

    /**
     * Scroll to element smoothly
     */
    scrollToElement(element) {
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * Start preview
     */
    async startPreview() {
        if (this.parsedPoints.length === 0) {
            this.showToast('No timeline data loaded', 'error');
            return;
        }

        // Save settings
        this.saveSettings();
        
        // Initialize map if needed
        this.initMap();
        
        // Auto scroll to map
        this.scrollToElement(this.elements.mapSection);
        
        // Get settings
        const duration = parseInt(this.elements.duration.value);
        const cameraMode = this.elements.cameraMode.value;
        const compression = this.elements.compression.value;
        
        // Set animation data with camera mode and compression
        this.animation.setData(this.parsedPoints, duration, cameraMode, compression);
        
        // Show playback section
        this.elements.playbackSection.style.display = 'block';
        
        // Ensure map is properly rendered before starting
        await new Promise(resolve => setTimeout(resolve, 300));
        this.mapRenderer.refresh();
        
        // Start playback
        this.play();
        
        this.showToast('Preview started', 'success');
    }

    /**
     * Play animation
     */
    play() {
        if (!this.animation) return;
        
        this.animation.play();
        this.elements.playBtn.style.display = 'none';
        this.elements.pauseBtn.style.display = 'block';
    }

    /**
     * Pause animation
     */
    pause() {
        if (!this.animation) return;
        
        this.animation.pause();
        this.elements.playBtn.style.display = 'block';
        this.elements.pauseBtn.style.display = 'none';
    }

    /**
     * Restart animation
     */
    restart() {
        if (!this.animation) return;
        
        this.animation.stop();
        this.elements.playBtn.style.display = 'block';
        this.elements.pauseBtn.style.display = 'none';
        this.elements.playbackSlider.value = 0;
    }

    /**
     * Seek to position
     */
    seek(progress) {
        if (!this.animation) return;
        
        this.animation.seek(progress);
    }

    /**
     * Update playback UI
     */
    updatePlaybackUI(data) {
        this.elements.playbackSlider.value = data.progress * 100;
        this.elements.timeDisplay.textContent = 
            `${data.currentTimeStr} / ${data.durationStr}`;
    }

    /**
     * Handle animation complete
     */
    onAnimationComplete() {
        this.elements.playBtn.style.display = 'block';
        this.elements.pauseBtn.style.display = 'none';
        this.showToast('Preview complete', 'success');
    }

    /**
     * Start video export
     */
    async startExport() {
        if (this.parsedPoints.length === 0) {
            this.showToast('No timeline data loaded', 'error');
            return;
        }

        // Save settings
        this.saveSettings();
        
        // Check export support
        const supportInfo = VideoExporter.getSupportInfo();
        console.log('Export support info:', supportInfo);
        
        if (!VideoExporter.isSupported()) {
            this.showToast('Video export not supported in this browser.', 'error');
            return;
        }
        
        // Initialize map if needed
        this.initMap();
        
        // Auto scroll to map
        this.scrollToElement(this.elements.mapSection);
        
        // Get settings
        const duration = parseInt(this.elements.duration.value);
        const resolution = this.elements.resolution.value;
        const title = this.elements.title.value || 'timeline-video';
        const cameraMode = this.elements.cameraMode.value;
        const compression = this.elements.compression.value;
        
        // Set animation data with camera mode and compression
        this.animation.setData(this.parsedPoints, duration, cameraMode, compression);
        
        // Show progress
        this.showProgress('Preparing video export...');
        
        try {
            // Track export start time for ETA
            const exportStartTime = Date.now();

            // Create frame renderer - draws directly to canvas
            const frameRenderer = async (ctx, progress, width, height) => {
                // Update animation to frame position
                this.animation.seek(progress);
                
                // Render frame directly to canvas using pre-calculated data
                this.mapRenderer.renderToCanvas(
                    ctx, width, height,
                    this.parsedPoints,
                    this.animation.framePoints,
                    this.animation.camCenters,
                    this.animation.camSpans,
                    progress
                );
            };
            
            // Set up progress callback with ETA
            this.exporter.onProgress = (data) => {
                const percent = Math.round(data.progress * 100);
                const stageText = {
                    'recording': '🎬 Recording',
                    'converting': '🔄 Converting to MP4',
                    'finalizing': '✅ Finalizing'
                }[data.stage] || data.stage;

                const eta = this.calculateETA(data.progress, exportStartTime);
                this.updateProgress(
                    `${stageText}: ${percent}%  •  ${eta}`,
                    percent
                );
            };
            
            // Export video
            const quality = this.elements.resolution.value;
            const aspectRatio = this.elements.aspectRatio.value;
            const dimensions = this.memoryManager.getResolutionDimensions(quality, aspectRatio);
            const videoBlob = await this.exporter.export(frameRenderer, {
                width: dimensions.width,
                height: dimensions.height,
                fps: this.memoryManager.config.fps,
                duration: duration,
                title: title
            });
            
            if (videoBlob) {
                // Show result
                this.showExportResult(videoBlob, title);
                this.showToast('Video exported successfully!', 'success');
            }
            
        } catch (error) {
            console.error('Export error:', error);
            this.showToast(`Export failed: ${error.message}`, 'error');
        }
        
        this.hideProgress();
    }

    /**
     * Cancel export
     */
    cancelExport() {
        this.exporter.cancel();
        this.hideProgress();
        this.showToast('Export cancelled', 'warning');
    }

    /**
     * Show export result
     */
    showExportResult(videoBlob, title) {
        // Create video URL
        const videoUrl = URL.createObjectURL(videoBlob);
        
        // Determine file extension based on mime type
        const mimeType = videoBlob.type || 'video/webm';
        const isMP4 = mimeType.includes('mp4');
        const extension = isMP4 ? 'mp4' : 'webm';
        
        // Update UI
        this.elements.videoPreview.src = videoUrl;
        this.elements.downloadBtn.href = videoUrl;
        this.elements.downloadBtn.download = `${title}.${extension}`;
        
        // Update download button text
        this.elements.downloadBtn.innerHTML = isMP4
            ? '💾 Download MP4'
            : '💾 Download WebM';
        
        // Add share button if supported
        const shareBtn = document.getElementById('share-btn');
        if (shareBtn) {
            shareBtn.style.display = (navigator.share && navigator.canShare) ? 'inline-flex' : 'none';
            shareBtn.onclick = () => this.shareVideo(videoBlob, title);
        }
        
        // Show result section
        this.elements.exportResult.style.display = 'block';
        this.elements.exportResult.classList.add('fade-in');
        
        // Hide playback section
        this.elements.playbackSection.style.display = 'none';
        
        // Auto scroll to result
        this.scrollToElement(this.elements.exportResult);
    }

    /**
     * Reset UI to initial state
     */
    resetUI() {
        // Reset animation
        if (this.animation) {
            this.animation.stop();
        }
        
        // Hide sections
        this.elements.settingsSection.style.display = 'none';
        this.elements.mapSection.style.display = 'none';
        this.elements.playbackSection.style.display = 'none';
        this.elements.exportResult.style.display = 'none';
        
        // Show upload
        this.elements.dropZone.style.display = 'block';
        this.elements.fileInfo.style.display = 'none';
        
        // Reset data
        this.timelineData = null;
        this.parsedPoints = [];
        this.fileName = '';
        
        // Reset file input
        this.elements.fileInput.value = '';
    }

    /**
     * Show global loading overlay
     */
    showGlobalLoading(text) {
        this.elements.globalLoading.style.display = 'flex';
        this.elements.loadingText.textContent = text;
    }

    /**
     * Update global loading text
     */
    updateGlobalLoading(text) {
        this.elements.loadingText.textContent = text;
    }

    /**
     * Hide global loading overlay
     */
    hideGlobalLoading() {
        this.elements.globalLoading.style.display = 'none';
    }

    /**
     * Show progress overlay (for map/export)
     */
    showProgress(text) {
        this.elements.progressOverlay.style.display = 'flex';
        this.elements.progressText.textContent = text;
        this.elements.progressBar.style.width = '0%';
        this.elements.progressPercent.textContent = '0%';
    }

    /**
     * Update progress
     */
    updateProgress(text, percent) {
        this.elements.progressText.textContent = text;
        this.elements.progressBar.style.width = `${percent}%`;
        this.elements.progressPercent.textContent = `${Math.round(percent)}%`;
    }

    /**
     * Hide progress overlay
     */
    hideProgress() {
        this.elements.progressOverlay.style.display = 'none';
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        // Create toast
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
