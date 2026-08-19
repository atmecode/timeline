/**
 * Map Renderer Module
 * Ported from mahlernim/google-timeline-visualizer Python original
 * 
 * Features:
 * - Camera modes: fixed, steady, dynamic
 * - Camera dead zone for smooth following
 * - Distance-based tail effect (500km)
 * - Gradient trail opacity
 */
class MapRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.tileLayer = null;
        this.routeLayer = null;
        this.marker = null;

        // CARTO tiles (same as Python version)
        this.tileUrl = ENGINE_CONFIG.TILE_URL;
        this.tileAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';

        // Route data
        this.routePoints = [];
        this.framePoints = [];
        this.camCenters = [];
        this.camSpans = [];

        // Tail config (same as Python)
        this.tailKm = ENGINE_CONFIG.DEFAULT_TAIL_KM;
    }

    /**
     * Initialize the Leaflet map
     */
    init() {
        this.map = L.map(this.containerId, {
            center: [0, 0],
            zoom: 2,
            zoomControl: true,
            attributionControl: true
        });

        this.tileLayer = L.tileLayer(this.tileUrl, {
            attribution: this.tileAttribution,
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        this.routeLayer = L.layerGroup().addTo(this.map);
        this.marker = this.createMarker();

        this.map.fitBounds([[-60, -180], [80, 180]]);

        setTimeout(() => {
            this.map.invalidateSize();
            console.log('Map initialized');
        }, 100);
    }

    /**
     * Create the animated marker
     */
    createMarker() {
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: 16px;
                height: 16px;
                background: ${ENGINE_CONFIG.THEME_COLOR};
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 10px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        return L.marker([0, 0], { icon });
    }

    /**
     * Initialize route (prepare for animation)
     */
    initRoute(points, options = {}) {
        const { fitBounds = true } = options;
        this.routeLayer.clearLayers();
        this.routePoints = points;

        if (fitBounds && points.length > 0) {
            const latLngs = points.map(p => [p.lat, p.lon]);
            this.map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
        }

        // Add marker at start
        if (points.length > 0) {
            this.marker.setLatLng([points[0].lat, points[0].lon]);
            this.marker.addTo(this.map);
        }

        console.log(`Route initialized: ${points.length} points`);
    }

    /**
     * Update map from pre-calculated animation data
     * Called by AnimationEngine with camera positions
     */
    updateProgress(progress, routePoints, framePoints, camCenters, camSpans) {
        if (!framePoints || framePoints.length === 0) return;

        // Store for video export
        this.routePoints = routePoints;
        this.framePoints = framePoints;
        this.camCenters = camCenters;
        this.camSpans = camSpans;

        // Get current frame index
        const frameIndex = Math.floor(progress * (framePoints.length - 1));

        // Apply camera from track (dead zone already applied)
        if (camCenters && camCenters[frameIndex]) {
            const cam = camCenters[frameIndex];
            const span = camSpans[frameIndex];

            // Convert Web Mercator meters back to lat/lon for Leaflet
            const centerLL = Projection.metersToLatlon(cam.x, cam.y);
            const halfSpanDeg = (span / ENGINE_CONFIG.R_EARTH) * (180 / Math.PI);

            this.map.setView(
                [centerLL.lat, centerLL.lon],
                this.map.getZoom(),
                { animate: false }
            );

            // Set bounds to match span
            const bounds = L.latLngBounds(
                [centerLL.lat - halfSpanDeg, centerLL.lon - halfSpanDeg],
                [centerLL.lat + halfSpanDeg, centerLL.lon + halfSpanDeg]
            );
            this.map.fitBounds(bounds, { animate: false, padding: [0, 0] });
        }

        // Draw progressive route
        this.drawProgressiveRoute(progress, routePoints, framePoints, frameIndex);

        // Update marker
        if (framePoints[frameIndex]) {
            const markerLL = Projection.metersToLatlon(framePoints[frameIndex].x, framePoints[frameIndex].y);
            this.marker.setLatLng([markerLL.lat, markerLL.lon]);
            this.marker.addTo(this.map);
        }
    }

    /**
     * Draw route progressively (like Python original)
     * Shows full route in faded + tail in bright
     */
    drawProgressiveRoute(progress, routePoints, framePoints, frameIndex) {
        this.routeLayer.clearLayers();

        if (!routePoints || routePoints.length === 0 || frameIndex <= 0) return;

        const currentMeter = framePoints[frameIndex];

        // 1. Draw FULL route (very faded, like Python path_line alpha=0.5)
        const allLatLngs = routePoints.map(p => [p.lat, p.lon]);
        if (allLatLngs.length > 1) {
            const fullPath = L.polyline(allLatLngs, {
                color: ENGINE_CONFIG.THEME_COLOR,
                weight: 2,
                opacity: 0.3,
                lineCap: 'round',
                lineJoin: 'round'
            });
            this.routeLayer.addLayer(fullPath);
        }

        // 2. Draw TAIL (bright, distance-based ~500km like Python DEFAULT_TAIL_KM)
        // Calculate total distance traveled
        let currentDistKm = 0;
        for (let i = 1; i <= frameIndex && i < routePoints.length; i++) {
            currentDistKm += Projection.haversineDistance(
                routePoints[i - 1].lat, routePoints[i - 1].lon,
                routePoints[i].lat, routePoints[i].lon
            );
        }

        // Find tail start (500km behind)
        const tailStartKm = Math.max(0, currentDistKm - this.tailKm);
        let accumulated = 0;
        let tailStartIndex = 0;
        for (let i = 1; i < routePoints.length && i <= frameIndex; i++) {
            accumulated += Projection.haversineDistance(
                routePoints[i - 1].lat, routePoints[i - 1].lon,
                routePoints[i].lat, routePoints[i].lon
            );
            if (accumulated >= tailStartKm) {
                tailStartIndex = i - 1;
                break;
            }
        }

        // Draw tail segments with gradient opacity
        const tailLatLngs = [];
        for (let i = tailStartIndex; i <= frameIndex && i < routePoints.length; i++) {
            tailLatLngs.push([routePoints[i].lat, routePoints[i].lon]);
        }

        // Add current interpolated position
        if (currentMeter) {
            const currentLL = Projection.metersToLatlon(currentMeter.x, currentMeter.y);
            tailLatLngs.push([currentLL.lat, currentLL.lon]);
        }

        if (tailLatLngs.length > 1) {
            // Draw as gradient segments (newer = more opaque)
            const segSize = Math.max(1, Math.floor(tailLatLngs.length / 8));
            for (let i = 0; i < tailLatLngs.length - 1; i += segSize) {
                const end = Math.min(i + segSize + 1, tailLatLngs.length);
                const segment = tailLatLngs.slice(i, end);
                if (segment.length < 2) continue;

                const segProgress = i / tailLatLngs.length;
                const opacity = 0.4 + (segProgress * 0.6);

                const tailSeg = L.polyline(segment, {
                    color: ENGINE_CONFIG.THEME_COLOR,
                    weight: 4,
                    opacity: opacity,
                    lineCap: 'round',
                    lineJoin: 'round'
                });
                this.routeLayer.addLayer(tailSeg);
            }
        }
    }

    /**
     * Render to canvas for video export
     */
    renderToCanvas(ctx, width, height, routePoints, framePoints, camCenters, camSpans, progress) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);

        if (!framePoints || framePoints.length === 0 || !camCenters || camCenters.length === 0) return;

        const frameIndex = Math.floor(progress * (framePoints.length - 1));
        const cam = camCenters[frameIndex];
        if (!cam) return;

        const span = camSpans[frameIndex];
        const halfSpanM = span / 2;

        // Convert route to canvas coordinates
        const routeToCanvas = (meterX, meterY) => {
            const x = ((meterX - (cam.x - halfSpanM)) / span) * width;
            const y = (((cam.y + halfSpanM) - meterY) / span) * height;
            return { x, y };
        };

        // Draw full route (faded)
        if (routePoints && routePoints.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 0, 85, 0.3)';
            ctx.lineWidth = 2;

            for (let i = 0; i < routePoints.length; i++) {
                const m = Projection.latlonToMeters(routePoints[i].lat, routePoints[i].lon);
                const p = routeToCanvas(m.x, m.y);
                if (i === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }

        // Draw tail (bright)
        let currentDistKm = 0;
        for (let i = 1; i <= frameIndex && i < routePoints.length; i++) {
            currentDistKm += Projection.haversineDistance(
                routePoints[i - 1].lat, routePoints[i - 1].lon,
                routePoints[i].lat, routePoints[i].lon
            );
        }

        const tailStartKm = Math.max(0, currentDistKm - this.tailKm);
        let accumulated = 0;
        let tailStartIdx = 0;
        for (let i = 1; i < routePoints.length && i <= frameIndex; i++) {
            accumulated += Projection.haversineDistance(
                routePoints[i - 1].lat, routePoints[i - 1].lon,
                routePoints[i].lat, routePoints[i].lon
            );
            if (accumulated >= tailStartKm) {
                tailStartIdx = i - 1;
                break;
            }
        }

        // Draw tail gradient
        const tailCount = frameIndex - tailStartIdx + 1;
        for (let i = tailStartIdx; i <= frameIndex && i < routePoints.length - 1; i++) {
            const m1 = Projection.latlonToMeters(routePoints[i].lat, routePoints[i].lon);
            const m2 = Projection.latlonToMeters(routePoints[i + 1].lat, routePoints[i + 1].lon);
            const p1 = routeToCanvas(m1.x, m1.y);
            const p2 = routeToCanvas(m2.x, m2.y);

            const segProgress = (i - tailStartIdx) / tailCount;
            const alpha = 0.4 + (segProgress * 0.6);

            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 0, 85, ${alpha})`;
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
        }

        // Draw marker
        if (framePoints[frameIndex]) {
            const mp = routeToCanvas(framePoints[frameIndex].x, framePoints[frameIndex].y);

            ctx.beginPath();
            ctx.arc(mp.x, mp.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = ENGINE_CONFIG.THEME_COLOR;
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // Draw info
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Timeline Visualizer', 10, 25);
        ctx.font = '12px Arial';
        ctx.fillText(`${Math.round(progress * 100)}%`, 10, height - 10);
    }

    // --- Utilities ---

    refresh() {
        if (this.map) {
            this.map.invalidateSize();
            this.map.setView(this.map.getCenter(), this.map.getZoom(), { animate: false });
        }
    }

    resize() {
        if (this.map) {
            this.map.invalidateSize();
        }
    }

    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }
}

window.MapRenderer = MapRenderer;
