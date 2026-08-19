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

        console.log('Map initialized');
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
     * Draw complete route
     */
    drawRoute(points, options = {}) {
        const {
            fitBounds = true,
            animate = false
        } = options;

        // Clear existing route
        this.clearRoute();

        if (points.length === 0) return;

        // Convert points to LatLng array
        const latLngs = points.map(p => [p.lat, p.lon]);

        // Draw main route
        const route = L.polyline(latLngs, this.routeStyle);
        this.routeLayer.addLayer(route);

        // Fit map to route bounds
        if (fitBounds) {
            const bounds = L.latLngBounds(latLngs);
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }

        // Add marker at start
        this.marker.setLatLng(latLngs[0]);
        this.marker.addTo(this.map);

        console.log(`Route drawn with ${points.length} points`);
    }

    /**
     * Update route animation progress
     * @param {number} progress - Progress from 0 to 1
     * @param {Array} points - All route points
     */
    updateProgress(progress, points) {
        if (!points || points.length === 0) return;

        const index = Math.floor(progress * (points.length - 1));
        const currentPoint = points[index];

        // Update marker position
        this.marker.setLatLng([currentPoint.lat, currentPoint.lon]);

        // Update faded route (trail)
        this.updateFadedRoute(points, index);

        // Update camera to follow marker
        this.followMarker(currentPoint);
    }

    /**
     * Update the faded trail behind the marker
     */
    updateFadedRoute(points, currentIndex) {
        // Clear previous faded route
        this.fadedRoute.clearLayers();

        if (currentIndex <= 0) return;

        // Draw faded trail
        const trailPoints = points.slice(0, currentIndex + 1).map(p => [p.lat, p.lon]);
        
        // Create gradient effect with multiple segments
        const segmentSize = Math.max(1, Math.floor(trailPoints.length / 10));
        
        for (let i = 0; i < trailPoints.length - 1; i += segmentSize) {
            const end = Math.min(i + segmentSize + 1, trailPoints.length);
            const segment = trailPoints.slice(i, end);
            
            if (segment.length < 2) continue;
            
            // Calculate opacity based on position (newer = more opaque)
            const segmentProgress = i / trailPoints.length;
            const opacity = 0.1 + (segmentProgress * 0.3);
            
            const polyline = L.polyline(segment, {
                ...this.fadedStyle,
                opacity: opacity
            });
            
            this.fadedRoute.addLayer(polyline);
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
     * Capture current map view as image
     * @returns {Promise<string>} Base64 image data
     */
    async captureFrame(width = 1920, height = 1080) {
        return new Promise((resolve, reject) => {
            try {
                // Create offscreen canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                // Use leaflet-image or html2canvas if available
                // Fallback: use map container screenshot
                const mapContainer = document.getElementById(this.containerId);
                
                // Simple approach: use canvas to render
                // Note: For production, use leaflet-image plugin
                html2canvas(mapContainer, {
                    canvas: canvas,
                    width: width,
                    height: height,
                    logging: false
                }).then(canvas => {
                    resolve(canvas.toDataURL('image/png'));
                }).catch(reject);
            } catch (error) {
                reject(error);
            }
        });
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
     * Resize map (call after container resize)
     */
    resize() {
        if (this.map) {
            this.map.invalidateSize();
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
