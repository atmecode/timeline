/**
 * Video Exporter Module
 * Exports animation to MP4 using MediaRecorder API
 * Falls back to frame capture if MediaRecorder not available
 */
class VideoExporter {
    constructor(memoryManager) {
        this.memory = memoryManager;
        this.config = memoryManager.config;
        
        // Export state
        this.isExporting = false;
        this.cancelled = false;
        
        // Callbacks
        this.onProgress = null;
        this.onStage = null;
    }

    /**
     * Export animation to MP4 using MediaRecorder
     * @param {Function} frameGenerator - Function that generates frames
     * @param {Object} options - Export options
     * @returns {Promise<Blob>} Video blob
     */
    async export(frameGenerator, options = {}) {
        if (this.isExporting) {
            throw new Error('Export already in progress');
        }
        
        this.isExporting = true;
        this.cancelled = false;
        
        const {
            width = 1280,
            height = 720,
            fps = 30,
            duration = 60,
            title = 'timeline-video'
        } = options;
        
        try {
            this.notifyStage('preparing', 'Preparing video export...');
            
            // Create offscreen canvas for recording
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            
            // Get stream from canvas
            const stream = canvas.captureStream(fps);
            
            // Find supported mime type
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) {
                throw new Error('MediaRecorder not supported in this browser');
            }
            
            console.log('Using mime type:', mimeType);
            
            // Create MediaRecorder
            const recorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: 8000000 // 8 Mbps
            });
            
            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunks.push(e.data);
                }
            };
            
            // Start recording
            recorder.start(100); // Collect data every 100ms
            this.notifyStage('recording', 'Recording animation...');
            
            // Calculate total frames
            const totalFrames = fps * duration;
            const frameInterval = 1000 / fps;
            
            // Record frames
            for (let frame = 0; frame < totalFrames; frame++) {
                if (this.cancelled) {
                    recorder.stop();
                    throw new Error('Export cancelled');
                }
                
                const progress = frame / totalFrames;
                
                // Generate frame
                const frameData = await frameGenerator(progress);
                
                // Draw frame to canvas
                await this.drawFrameToCanvas(ctx, frameData, width, height);
                
                // Report progress
                if (this.onProgress) {
                    this.onProgress({
                        progress: progress,
                        stage: 'recording',
                        currentFrame: frame,
                        totalFrames: totalFrames
                    });
                }
                
                // Wait for frame interval
                await new Promise(resolve => setTimeout(resolve, frameInterval));
            }
            
            // Stop recording
            this.notifyStage('finalizing', 'Finalizing video...');
            
            await new Promise((resolve, reject) => {
                recorder.onstop = () => resolve();
                recorder.onerror = (e) => reject(e);
                recorder.stop();
            });
            
            // Create blob from chunks
            const videoBlob = new Blob(chunks, { type: mimeType });
            
            this.isExporting = false;
            return videoBlob;
            
        } catch (error) {
            this.isExporting = false;
            throw error;
        }
    }

    /**
     * Get supported MIME type for MediaRecorder
     */
    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm;codecs=h264',
            'video/webm',
            'video/mp4'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null;
    }

    /**
     * Draw frame data to canvas
     */
    async drawFrameToCanvas(ctx, frameData, width, height) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, width, height);
                resolve();
            };
            img.onerror = reject;
            img.src = frameData;
        });
    }

    /**
     * Cancel current export
     */
    cancel() {
        this.cancelled = true;
        console.log('Export cancelled');
    }

    /**
     * Notify stage change
     */
    notifyStage(stage, message) {
        if (this.onStage) {
            this.onStage({ stage, message });
        }
    }

    /**
     * Check if export is supported
     */
    static isSupported() {
        return typeof MediaRecorder !== 'undefined';
    }

    /**
     * Get detailed support info
     */
    static getSupportInfo() {
        const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
        let supportedTypes = [];
        
        if (hasMediaRecorder) {
            const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
            supportedTypes = types.filter(t => MediaRecorder.isTypeSupported(t));
        }
        
        return {
            mediaRecorder: hasMediaRecorder,
            supportedTypes: supportedTypes
        };
    }
}

// Export for use in other modules
window.VideoExporter = VideoExporter;
