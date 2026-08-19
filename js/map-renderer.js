/**
 * Map Renderer Module
 * Renders timeline data on Leaflet.js map
 */
class MapRenderer {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.routeLayer = null;
        this.marker = null;
        this.fadedRoute = null;
        this.tileLayer = null;
        
        // CARTO tiles (same as Python version)
        this.tileUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png';
        this.tileAttribution = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions">CARTO</a>';
        
        // Route styling
        this.routeStyle = {
            color: '#ff0055',
            weight: 4,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
        };
        
        this.fadedStyle = {
            color: '#ff0055',
            weight: 3,
            opacity: 0.3,
            lineCap: 'round',
            lineJoin: 'round'
        };
        
        // Marker styling
        this.markerRadius = 10;
        this.markerColor = '#ff0055';
    }

    /**
     * Initialize the map
     */
    init() {
        // Create map instance
        this.map = L.map(this.containerId, {
            center: [0, 0],
            zoom: 2,
            zoomControl: true,
            attributionControl: true
        });

        // Add tile layer
        this.tileLayer = L.tileLayer(this.tileUrl, {
            attribution: this.tileAttribution,
            maxZoom: 19,
            subdomains: 'abcd'
        }).addTo(this.map);

        // Initialize route layers
        this.routeLayer = L.layerGroup().addTo(this.map);
        this.fadedRoute = L.layerGroup().addTo(this.map);

        // Create animated marker
        this.createMarker();

        // Fit bounds to world view
        this.map.fitBounds([[-60, -180], [80, 180]]);

        // Force map to recalculate size (important for hidden containers)
        setTimeout(() => {
            this.map.invalidateSize();
            console.log('Map initialized and resized');
        }, 100);
    }

    /**
     * Create the animated marker
     */
    createMarker() {
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                width: ${this.markerRadius * 2}px;
                height: ${this.markerRadius * 2}px;
                background: ${this.markerColor};
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [this.markerRadius * 2, this.markerRadius * 2],
            iconAnchor: [this.markerRadius, this.markerRadius]
        });

        this.marker = L.marker([0, 0], { icon: markerIcon });
    }

    /**
     * Initialize route (prepare for animation, don't draw yet)
     */
    initRoute(points, options = {}) {
        const { fitBounds = true } = options;

        // Clear existing route
        this.clearRoute();

        if (points.length === 0) return;

        // Store points for progressive drawing
        this.routePoints = points;

        // Fit map to route bounds
        if (fitBounds) {
            const latLngs = points.map(p => [p.lat, p.lon]);
            const bounds = L.latLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }

        // Add marker at start (hidden initially)
        this.marker.setLatLng([points[0].lat, points[0].lon]);
        this.marker.addTo(this.map);

        console.log(`Route initialized with ${points.length} points`);
    }

    /**
     * Draw route progressively up to current progress
     * @param {number} progress - 0 to 1
     * @param {Array} points - All route points
     */
    drawRouteProgress(progress, points) {
        if (!points || points.length === 0) return;

        // Clear previous route
        this.routeLayer.clearLayers();
        this.fadedRoute.clearLayers();

        const currentIndex = Math.floor(progress * (points.length - 1));
        
        if (currentIndex <= 0) return;

        // Draw trail (faded route behind marker)
        const trailPoints = points.slice(0, currentIndex + 1).map(p => [p.lat, p.lon]);
        
        // Create gradient effect
        const segmentSize = Math.max(1, Math.floor(trailPoints.length / 10));
        
        for (let i = 0; i < trailPoints.length - 1; i += segmentSize) {
            const end = Math.min(i + segmentSize + 1, trailPoints.length);
            const segment = trailPoints.slice(i, end);
            
            if (segment.length < 2) continue;
            
            // Newer segments are more opaque
            const segmentProgress = i / trailPoints.length;
            const opacity = 0.2 + (segmentProgress * 0.6);
            
            const polyline = L.polyline(segment, {
                color: '#ff0055',
                weight: 3,
                opacity: opacity,
                lineCap: 'round',
                lineJoin: 'round'
            });
            
            this.routeLayer.addLayer(polyline);
        }

        // Draw current position marker
        if (currentIndex < points.length) {
            const currentPoint = points[currentIndex];
            this.marker.setLatLng([currentPoint.lat, currentPoint.lon]);
        }
    }

    /**
     * Update route animation progress (progressive drawing)
     * @param {number} progress - Progress from 0 to 1
     * @param {Array} points - All route points
     */
    updateProgress(progress, points) {
        if (!points || points.length === 0) return;

        // Draw route progressively
        this.drawRouteProgress(progress, points);

        // Update camera to follow marker
        const index = Math.floor(progress * (points.length - 1));
        if (index < points.length) {
            this.followMarker(points[index]);
        }
    }

    /**
     * Follow marker with camera
     */
    followMarker(point) {
        const currentCenter = this.map.getCenter();
        const targetLatLng = L.latLng(point.lat, point.lon);
        
        // Smooth camera movement
        const easeFactor = 0.1;
        const newLat = currentCenter.lat + (targetLatLng.lat - currentCenter.lat) * easeFactor;
        const newLng = currentCenter.lng + (targetLatLng.lng - currentCenter.lng) * easeFactor;
        
        this.map.setView([newLat, newLng], this.map.getZoom(), {
            animate: false
        });
    }

    /**
     * Set camera to follow mode with auto-zoom
     */
    setFollowMode(enabled, points) {
        if (!enabled) return;

        // Calculate appropriate zoom level based on route extent
        if (points && points.length > 0) {
            const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
            this.map.fitBounds(bounds, { padding: [100, 100] });
        }
    }

    /**
     * Clear all route layers
     */
    clearRoute() {
        this.routeLayer.clearLayers();
        this.fadedRoute.clearLayers();
        this.marker.remove();
    }

    /**
     * Reset map view
     */
    resetView() {
        this.clearRoute();
        this.map.setView([0, 0], 2);
    }

    /**
     * Render current map state to canvas context
     * This is used for video export - draws directly to canvas
     */
    renderToCanvas(ctx, width, height, points, progress) {
        // Draw background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
        
        // Get current map state
        const bounds = this.map.getBounds();
        const zoom = this.map.getZoom();
        
        // Calculate map projection
        const latSpan = bounds.getNorth() - bounds.getSouth();
        const lngSpan = bounds.getEast() - bounds.getWest();
        
        // Draw route if we have points
        if (points && points.length > 0 && progress > 0) {
            const currentIndex = Math.floor(progress * (points.length - 1));
            
            // Draw route path
            ctx.beginPath();
            ctx.strokeStyle = '#ff0055';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            for (let i = 0; i <= currentIndex && i < points.length; i++) {
                const x = ((points[i].lon - bounds.getWest()) / lngSpan) * width;
                const y = ((bounds.getNorth() - points[i].lat) / latSpan) * height;
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            
            // Draw current position marker
            if (currentIndex < points.length) {
                const currentPoint = points[currentIndex];
                const markerX = ((currentPoint.lon - bounds.getWest()) / lngSpan) * width;
                const markerY = ((bounds.getNorth() - currentPoint.lat) / latSpan) * height;
                
                // Draw marker circle
                ctx.beginPath();
                ctx.arc(markerX, markerY, 8, 0, Math.PI * 2);
                ctx.fillStyle = '#ff0055';
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            
            // Draw progress info
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.fillText(`${Math.round(progress * 100)}%`, 10, height - 10);
        }
        
        // Draw title
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('Timeline Visualizer', 10, 25);
    }

    /**
     * Get map bounds
     */
    getBounds() {
        return this.map.getBounds();
    }

    /**
     * Set map view to specific bounds
     */
    setBounds(bounds) {
        this.map.fitBounds(bounds);
    }

    /**
     * Resize map (call after container resize or visibility change)
     */
    resize() {
        if (this.map) {
            this.map.invalidateSize();
            // Force tile reload
            this.map.setView(this.map.getCenter(), this.map.getZoom());
        }
    }

    /**
     * Force map refresh - call after container becomes visible
     */
    refresh() {
        if (this.map) {
            this.map.invalidateSize();
            this.map.setView(this.map.getCenter(), this.map.getZoom(), { animate: false });
        }
    }

    /**
     * Destroy map instance
     */
    destroy() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
    }
}

// Export for use in other modules
window.MapRenderer = MapRenderer;
