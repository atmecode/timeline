/**
 * Video Exporter Module
 * Exports animation to MP4 using FFmpeg.wasm
 */
class VideoExporter {
    constructor(memoryManager) {
        this.memory = memoryManager;
        this.config = memoryManager.config;
        
        // FFmpeg instance
        this.ffmpeg = null;
        this.loaded = false;
        
        // Export state
        this.isExporting = false;
        this.cancelled = false;
        
        // Callbacks
        this.onProgress = null;
        this.onStage = null;
    }

    /**
     * Initialize FFmpeg.wasm
     */
    async init() {
        if (this.loaded) return true;
        
        try {
            console.log('Loading FFmpeg.wasm...');
            
            // Check for FFmpeg availability
            if (typeof FFmpeg === 'undefined') {
                throw new Error('FFmpeg.wasm not loaded. Check your internet connection.');
            }
            
            this.ffmpeg = new FFmpeg.FFmpeg();
            
            // Set up progress handler
            this.ffmpeg.on('progress', ({ progress, time }) => {
                if (this.onProgress) {
                    this.onProgress({
                        progress: progress,
                        time: time,
                        stage: 'encoding'
                    });
                }
            });
            
            // Load FFmpeg
            await this.ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.js',
                wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/umd/ffmpeg-core.wasm'
            });
            
            this.loaded = true;
            console.log('FFmpeg.wasm loaded successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to load FFmpeg.wasm:', error);
            throw new Error(`Failed to load video encoder: ${error.message}`);
        }
    }

    /**
     * Export animation to MP4
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
            duration = 60, // seconds
            title = 'timeline-video'
        } = options;
        
        try {
            // Initialize FFmpeg if needed
            await this.init();
            
            // Calculate total frames
            const totalFrames = fps * duration;
            
            // Get optimal export settings based on device
            const exportConfig = this.getExportConfig();
            
            // Notify stage
            this.notifyStage('preparing', 'Preparing frames...');
            
            // Create frames directory
            await this.ffmpeg.createDir('/frames');
            
            // Generate and save frames
            await this.generateFrames(frameGenerator, totalFrames, exportConfig);
            
            if (this.cancelled) {
                await this.cleanup();
                return null;
            }
            
            // Notify stage
            this.notifyStage('encoding', 'Encoding video...');
            
            // Encode to MP4
            const videoBlob = await this.encodeVideo(totalFrames, fps, exportConfig);
            
            // Cleanup
            await this.cleanup();
            
            this.isExporting = false;
            return videoBlob;
            
        } catch (error) {
            this.isExporting = false;
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Get export configuration based on device tier
     */
    getExportConfig() {
        const configs = {
            high: {
                codec: 'libx264',
                crf: 18,
                preset: 'medium',
                pixelFormat: 'yuv420p'
            },
            medium: {
                codec: 'libx264',
                crf: 23,
                preset: 'fast',
                pixelFormat: 'yuv420p'
            },
            low: {
                codec: 'libx264',
                crf: 28,
                preset: 'ultrafast',
                pixelFormat: 'yuv420p'
            }
        };
        
        return configs[this.memory.tier] || configs.medium;
    }

    /**
     * Generate frames and save to FFmpeg filesystem
     */
    async generateFrames(frameGenerator, totalFrames, config) {
        const chunkSize = this.config.chunkSize;
        const totalChunks = Math.ceil(totalFrames / chunkSize);
        
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
            if (this.cancelled) break;
            
            const startFrame = chunkIdx * chunkSize;
            const endFrame = Math.min(startFrame + chunkSize, totalFrames);
            
            // Check memory before each chunk
            const memStatus = await this.memory.checkMemory();
            
            if (memStatus.isCritical) {
                console.warn('Memory critical during frame generation');
                // Could reduce quality or skip frames
            }
            
            // Generate frames for this chunk
            for (let frame = startFrame; frame < endFrame; frame++) {
                if (this.cancelled) break;
                
                const progress = frame / totalFrames;
                const frameNum = String(frame).padStart(6, '0');
                
                try {
                    // Generate frame
                    const frameData = await frameGenerator(progress);
                    
                    // Convert to PNG and save
                    const pngBlob = await this.imageToPng(frameData);
                    const pngBuffer = await pngBlob.arrayBuffer();
                    
                    await this.ffmpeg.writeFile(
                        `/frames/frame_${frameNum}.png`,
                        new Uint8Array(pngBuffer)
                    );
                    
                } catch (error) {
                    console.warn(`Failed to generate frame ${frame}:`, error);
                    // Create placeholder frame
                    await this.createPlaceholderFrame(frameNum);
                }
            }
            
            // Report progress
            if (this.onProgress) {
                this.onProgress({
                    progress: (chunkIdx + 1) / totalChunks,
                    stage: 'generating',
                    currentFrame: endFrame,
                    totalFrames: totalFrames
                });
            }
            
            // Yield to browser
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    /**
     * Create a placeholder frame (gray)
     */
    async createPlaceholderFrame(frameNum) {
        // Create a simple gray frame using FFmpeg
        await this.ffmpeg.exec([
            '-f', 'lavfi',
            '-i', 'color=c=gray:s=1280x720:d=0.033',
            '-frames:v', '1',
            `/frames/frame_${frameNum}.png`
        ]);
    }

    /**
     * Convert image data to PNG blob
     */
    async imageToPng(imageData) {
        return new Promise((resolve, reject) => {
            // Create canvas from image data
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                canvas.toBlob(resolve, 'image/png');
            };
            img.onerror = reject;
            img.src = imageData;
        });
    }

    /**
     * Encode frames to MP4
     */
    async encodeVideo(totalFrames, fps, config) {
        const outputFile = '/output.mp4';
        
        // Build FFmpeg command
        const args = [
            '-framerate', String(fps),
            '-i', '/frames/frame_%06d.png',
            '-c:v', config.codec,
            '-crf', String(config.crf),
            '-preset', config.preset,
            '-pix_fmt', config.pixelFormat,
            '-movflags', '+faststart',
            outputFile
        ];
        
        // Execute FFmpeg
        await this.ffmpeg.exec(args);
        
        // Read output file
        const data = await this.ffmpeg.readFile(outputFile);
        
        // Create Blob
        return new Blob([data.buffer], { type: 'video/mp4' });
    }

    /**
     * Cleanup FFmpeg filesystem
     */
    async cleanup() {
        try {
            // Delete frames directory
            const files = await this.ffmpeg.listDir('/frames');
            for (const file of files) {
                if (file.name !== '.' && file.name !== '..') {
                    await this.ffmpeg.deleteFile(`/frames/${file.name}`);
                }
            }
            await this.ffmpeg.deleteDir('/frames');
            
            // Delete output if exists
            try {
                await this.ffmpeg.deleteFile('/output.mp4');
            } catch (e) {
                // Ignore if doesn't exist
            }
        } catch (error) {
            console.warn('Cleanup error:', error);
        }
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
        return typeof WebAssembly !== 'undefined' && typeof FFmpeg !== 'undefined';
    }
}

// Export for use in other modules
window.VideoExporter = VideoExporter;
