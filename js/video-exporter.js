/**
 * Video Exporter Module
 * Records via MediaRecorder (WebM) then converts to MP4 via FFmpeg.wasm
 */
class VideoExporter {
    constructor(memoryManager) {
        this.memory = memoryManager;
        this.config = memoryManager.config;

        this.isExporting = false;
        this.cancelled = false;

        this.onProgress = null;
        this.onStage = null;

        // FFmpeg instance (lazy loaded)
        this.ffmpeg = null;
        this.ffmpegLoaded = false;
    }

    /**
     * Lazy-load FFmpeg.wasm
     */
    async loadFFmpeg() {
        if (this.ffmpegLoaded) return true;

        try {
            // Dynamically load FFmpeg script
            if (!document.getElementById('ffmpeg-script')) {
                const script = document.createElement('script');
                script.id = 'ffmpeg-script';
                script.src = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/umd/ffmpeg.js';
                document.head.appendChild(script);

                // Wait for script to load
                await new Promise((resolve, reject) => {
                    script.onload = resolve;
                    script.onerror = reject;
                });
            }

            const FFmpegModule = typeof FFmpeg !== 'undefined' ? FFmpeg :
                                 typeof FFmpegWASM !== 'undefined' ? FFmpegWASM : null;

            if (!FFmpegModule) {
                console.warn('FFmpeg not available');
                return false;
            }

            const FFmpegClass = FFmpegModule.FFmpeg || FFmpegModule;
            this.ffmpeg = new FFmpegClass();

            this.ffmpeg.on('progress', ({ progress }) => {
                if (this.onProgress) {
                    this.onProgress({
                        progress: 0.5 + (progress * 0.5), // 50-100% during conversion
                        stage: 'converting'
                    });
                }
            });

            await this.ffmpeg.load({
                coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
                wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm'
            });

            this.ffmpegLoaded = true;
            console.log('FFmpeg loaded for MP4 conversion');
            return true;

        } catch (error) {
            console.warn('Failed to load FFmpeg:', error);
            return false;
        }
    }

    /**
     * Convert WebM blob to MP4 using FFmpeg
     */
    async convertToMP4(webmBlob) {
        if (!this.ffmpegLoaded || !this.ffmpeg) {
            return webmBlob; // Return original if FFmpeg not available
        }

        try {
            this.notifyStage('converting', 'Converting to MP4...');

            // Write WebM file
            const webmData = new Uint8Array(await webmBlob.arrayBuffer());
            await this.ffmpeg.writeFile('/input.webm', webmData);

            // Convert to MP4
            await this.ffmpeg.exec([
                '-i', '/input.webm',
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                '/output.mp4'
            ]);

            // Read output
            const mp4Data = await this.ffmpeg.readFile('/output.mp4');

            // Cleanup
            await this.ffmpeg.deleteFile('/input.webm');
            await this.ffmpeg.deleteFile('/output.mp4');

            return new Blob([mp4Data.buffer], { type: 'video/mp4' });

        } catch (error) {
            console.error('MP4 conversion failed:', error);
            return webmBlob; // Return original WebM on failure
        }
    }

    /**
     * Main export flow
     */
    async export(frameRenderer, options = {}) {
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

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, width, height);

            // Start MediaRecorder
            const stream = canvas.captureStream(fps);
            const mimeType = this.getSupportedMimeType();
            if (!mimeType) throw new Error('MediaRecorder not supported');

            const recorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: 8000000
            });

            const chunks = [];
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            recorder.start(100);
            this.notifyStage('recording', 'Recording animation...');

            // Record frames
            const totalFrames = fps * duration;
            const frameInterval = 1000 / fps;

            for (let frame = 0; frame < totalFrames; frame++) {
                if (this.cancelled) {
                    recorder.stop();
                    throw new Error('Export cancelled');
                }

                const progress = frame / totalFrames;
                await frameRenderer(ctx, progress, width, height);

                if (this.onProgress) {
                    this.onProgress({
                        progress: progress * 0.5, // 0-50% during recording
                        stage: 'recording'
                    });
                }

                await new Promise(resolve => setTimeout(resolve, frameInterval));
            }

            this.notifyStage('finalizing', 'Finalizing recording...');

            await new Promise((resolve, reject) => {
                recorder.onstop = () => resolve();
                recorder.onerror = (e) => reject(e);
                recorder.stop();
            });

            const webmBlob = new Blob(chunks, { type: mimeType });
            console.log('WebM recorded, size:', webmBlob.size);

            // Try to load FFmpeg and convert to MP4
            this.notifyStage('converting', 'Loading MP4 encoder...');
            const ffmpegReady = await this.loadFFmpeg();

            let finalBlob;
            if (ffmpegReady) {
                finalBlob = await this.convertToMP4(webmBlob);
                console.log('Final output:', finalBlob.type, finalBlob.size);
            } else {
                finalBlob = webmBlob;
                console.log('FFmpeg not available, using WebM');
            }

            this.isExporting = false;
            return finalBlob;

        } catch (error) {
            this.isExporting = false;
            throw error;
        }
    }

    getSupportedMimeType() {
        const types = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return null;
    }

    cancel() {
        this.cancelled = true;
    }

    notifyStage(stage, message) {
        if (this.onStage) this.onStage({ stage, message });
    }

    static isSupported() {
        return typeof MediaRecorder !== 'undefined';
    }

    static getSupportInfo() {
        return {
            mediaRecorder: typeof MediaRecorder !== 'undefined',
            supportedTypes: typeof MediaRecorder !== 'undefined'
                ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
                    .filter(t => MediaRecorder.isTypeSupported(t))
                : []
        };
    }
}

window.VideoExporter = VideoExporter;
