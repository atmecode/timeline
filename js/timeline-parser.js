/**
 * Timeline Parser Module
 * Parses Google Timeline JSON files into normalized points
 */
class TimelineParser {
    constructor() {
        this.supportedFormats = [
            'direct-array',           // Current Android/iOS exports
            'semanticSegments',       // Older exports
            'activitySegments',       // Some exports
            'visitSegments'           // Some exports
        ];
    }

    /**
     * Parse Timeline JSON file
     * @param {Object} data - Raw JSON data
     * @param {Object} options - Parsing options
     * @returns {Object} Parsed timeline data
     */
    parse(data, options = {}) {
        const {
            startDate = null,
            endDate = null,
            filterGPS = true
        } = options;

        console.log('Parsing timeline data...');
        const startTime = performance.now();

        let points = [];

        // Detect format and parse accordingly
        if (Array.isArray(data)) {
            points = this.parseDirectArray(data);
        } else if (data && typeof data === 'object') {
            if (data.semanticSegments) {
                points = this.parseSemanticSegments(data.semanticSegments);
            } else if (data.timelineObjects) {
                points = this.parseTimelineObjects(data.timelineObjects);
            } else {
                throw new Error('Unsupported Timeline JSON format');
            }
        } else {
            throw new Error('Invalid Timeline JSON data');
        }

        console.log(`Parsed ${points.length} raw points`);

        // Filter by date range
        if (startDate || endDate) {
            points = this.filterByDate(points, startDate, endDate);
            console.log(`After date filter: ${points.length} points`);
        }

        // Filter GPS outliers
        if (filterGPS) {
            const beforeCount = points.length;
            points = this.filterGPSOutliers(points);
            console.log(`GPS filter removed ${beforeCount - points.length} outlier points`);
        }

        // Sort by timestamp
        points.sort((a, b) => a.timestamp - b.timestamp);

        // Calculate statistics
        const stats = this.calculateStats(points);

        const elapsed = performance.now() - startTime;
        console.log(`Parsing completed in ${elapsed.toFixed(0)}ms`);

        return {
            points: points,
            stats: stats,
            parseTime: elapsed
        };
    }

    /**
     * Parse direct array format (current Android/iOS exports)
     */
    parseDirectArray(data) {
        const points = [];
        
        for (const item of data) {
            const point = this.extractPoint(item);
            if (point) {
                points.push(point);
            }
        }
        
        return points;
    }

    /**
     * Parse semantic segments format
     */
    parseSemanticSegments(segments) {
        const points = [];
        
        for (const segment of segments) {
            // Activity segments
            if (segment.activitySegment) {
                const activityPoints = this.parseActivitySegment(segment.activitySegment);
                points.push(...activityPoints);
            }
            
            // Visit segments
            if (segment.visitSegment) {
                const visitPoints = this.parseVisitSegment(segment.visitSegment);
                points.push(...visitPoints);
            }
            
            // Path segments
            if (segment.path) {
                const pathPoints = this.parsePathSegment(segment.path);
                points.push(...pathPoints);
            }
        }
        
        return points;
    }

    /**
     * Parse activity segment
     */
    parseActivitySegment(segment) {
        const points = [];
        
        // Timeline path
        if (segment.timelinePath) {
            for (const pathPoint of segment.timelinePath) {
                const point = this.extractPoint(pathPoint);
                if (point) {
                    point.activity = segment.activityType || 'unknown';
                    points.push(point);
                }
            }
        }
        
        // Simple coordinates
        if (segment.startLocation) {
            const point = this.extractPoint(segment.startLocation);
            if (point) {
                point.activity = segment.activityType || 'unknown';
                points.push(point);
            }
        }
        
        if (segment.endLocation) {
            const point = this.extractPoint(segment.endLocation);
            if (point) {
                point.activity = segment.activityType || 'unknown';
                points.push(point);
            }
        }
        
        return points;
    }

    /**
     * Parse visit segment
     */
    parseVisitSegment(segment) {
        const points = [];
        
        if (segment.place) {
            const point = this.extractPoint(segment.place);
            if (point) {
                point.visitName = segment.place.name || 'Unknown';
                point.visitDuration = segment.duration || 0;
                points.push(point);
            }
        }
        
        return points;
    }

    /**
     * Parse path segment
     */
    parsePathSegment(path) {
        const points = [];
        
        if (Array.isArray(path)) {
            for (const point of path) {
                const extracted = this.extractPoint(point);
                if (extracted) {
                    points.push(extracted);
                }
            }
        }
        
        return points;
    }

    /**
     * Parse timeline objects format (very old exports)
     */
    parseTimelineObjects(objects) {
        const points = [];
        
        for (const obj of objects) {
            if (obj.place) {
                const point = this.extractPoint(obj.place);
                if (point) {
                    points.push(point);
                }
            }
            
            if (obj.activity && obj.activity.activityType) {
                // Extract from activity
                const point = this.extractPoint(obj);
                if (point) {
                    point.activity = obj.activity.activityType;
                    points.push(point);
                }
            }
        }
        
        return points;
    }

    /**
     * Extract a normalized point from various formats
     */
    extractPoint(data) {
        if (!data) return null;

        let lat = null;
        let lon = null;
        let timestamp = null;

        // Try different coordinate formats
        const coordSources = [
            data.location,
            data.startLocation,
            data.endLocation,
            data.point,
            data,
            data.place
        ];

        for (const source of coordSources) {
            if (!source) continue;

            const coords = this.parseCoordinate(source);
            if (coords) {
                lat = coords.lat;
                lon = coords.lon;
                break;
            }
        }

        if (lat === null || lon === null) {
            return null;
        }

        // Validate coordinates
        if (!this.isValidCoordinate(lat, lon)) {
            return null;
        }

        // Parse timestamp
        timestamp = this.parseTimestamp(
            data.timestamp || 
            data.startTime || 
            data.endDate ||
            data.date
        );

        return {
            lat: lat,
            lon: lon,
            timestamp: timestamp,
            raw: data
        };
    }

    /**
     * Parse coordinate from various formats
     */
    parseCoordinate(value) {
        if (!value) return null;

        // Handle object with latLng
        if (typeof value === 'object') {
            if (value.latLng) {
                return this.parseCoordinateString(value.latLng);
            }
            if (value.point) {
                return this.parseCoordinateString(value.point);
            }
            if (value.latitude !== undefined && value.longitude !== undefined) {
                return { lat: value.latitude, lon: value.longitude };
            }
            if (value.lat !== undefined && value.lng !== undefined) {
                return { lat: value.lat, lon: value.lng };
            }
        }

        // Handle string
        if (typeof value === 'string') {
            return this.parseCoordinateString(value);
        }

        return null;
    }

    /**
     * Parse coordinate string in various formats
     */
    parseCoordinateString(str) {
        if (!str || typeof str !== 'string') return null;

        // Remove geo: prefix
        let cleaned = str.trim()
            .replace(/^geo:/, '')
            .replace(/\?.*$/, '')
            .replace(/°/g, '')
            .replace(/\s/g, '');

        // Split by comma
        const parts = cleaned.split(',');
        if (parts.length < 2) return null;

        try {
            let lat = parseFloat(parts[0]);
            let lon = parseFloat(parts[1]);

            if (isNaN(lat) || isNaN(lon)) return null;

            // Handle E7 format (degrees * 10^7)
            if (Math.abs(lat) > 1000000 || Math.abs(lon) > 1000000) {
                lat /= 10000000;
                lon /= 10000000;
            }

            return { lat, lon };
        } catch (e) {
            return null;
        }
    }

    /**
     * Validate coordinate
     */
    isValidCoordinate(lat, lon) {
        return (
            lat >= -85.05112878 && lat <= 85.05112878 &&
            lon >= -180 && lon <= 180 &&
            !isNaN(lat) && !isNaN(lon)
        );
    }

    /**
     * Parse timestamp from various formats
     */
    parseTimestamp(value) {
        if (!value) return null;

        // Already a Date object
        if (value instanceof Date) {
            return value.getTime();
        }

        // Unix timestamp (seconds)
        if (typeof value === 'number') {
            // If value is in seconds (not milliseconds)
            if (value < 10000000000) {
                return value * 1000;
            }
            return value;
        }

        // String timestamp
        if (typeof value === 'string') {
            // Try ISO format
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }

            // Try format: "2024-01-15T10:30:00.000Z"
            const match = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
            if (match) {
                const [, year, month, day, hours, minutes, seconds] = match;
                return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
            }
        }

        return null;
    }

    /**
     * Filter points by date range
     */
    filterByDate(points, startDate, endDate) {
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() : Infinity;

        return points.filter(point => {
            if (!point.timestamp) return true; // Keep points without timestamps
            return point.timestamp >= start && point.timestamp <= end;
        });
    }

    /**
     * Filter GPS outliers
     * Removes isolated, implausible out-and-back coordinates
     */
    filterGPSOutliers(points) {
        if (points.length < 3) return points;

        const filtered = [points[0]]; // Always keep first point

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            // Calculate distances
            const distToPrev = this.haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
            const distToNext = this.haversineDistance(curr.lat, curr.lon, next.lat, next.lon);
            const distPrevToNext = this.haversineDistance(prev.lat, prev.lon, next.lat, next.lon);

            // Check for outlier: point is far from neighbors but neighbors are close
            const isOutlier = (
                distToPrev > 5 && // > 5km from previous
                distToNext > 5 && // > 5km to next
                distPrevToNext < 2 // But previous and next are close
            );

            // Check for sudden direction change with large distance
            const isSuddenReturn = (
                distToPrev > 10 && 
                distToNext > 10 && 
                distPrevToNext < 1
            );

            if (!isOutlier && !isSuddenReturn) {
                filtered.push(curr);
            }
        }

        filtered.push(points[points.length - 1]); // Always keep last point

        return filtered;
    }

    /**
     * Calculate distance between two points using Haversine formula
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
     * Calculate statistics for parsed points
     */
    calculateStats(points) {
        if (points.length === 0) {
            return {
                totalPoints: 0,
                totalDistance: 0,
                dateRange: null,
                activities: {}
            };
        }

        let totalDistance = 0;
        const activities = {};
        let minTimestamp = Infinity;
        let maxTimestamp = -Infinity;

        for (let i = 0; i < points.length; i++) {
            const point = points[i];

            // Track timestamp range
            if (point.timestamp) {
                minTimestamp = Math.min(minTimestamp, point.timestamp);
                maxTimestamp = Math.max(maxTimestamp, point.timestamp);
            }

            // Track activities
            if (point.activity) {
                activities[point.activity] = (activities[point.activity] || 0) + 1;
            }

            // Calculate distance
            if (i > 0) {
                totalDistance += this.haversineDistance(
                    points[i - 1].lat, points[i - 1].lon,
                    point.lat, point.lon
                );
            }
        }

        return {
            totalPoints: points.length,
            totalDistance: Math.round(totalDistance),
            dateRange: minTimestamp !== Infinity ? {
                start: new Date(minTimestamp),
                end: new Date(maxTimestamp),
                days: Math.ceil((maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24))
            } : null,
            activities: activities
        };
    }

    /**
     * Get available date range from points
     */
    getDateRange(points) {
        let min = Infinity;
        let max = -Infinity;

        for (const point of points) {
            if (point.timestamp) {
                min = Math.min(min, point.timestamp);
                max = Math.max(max, point.timestamp);
            }
        }

        if (min === Infinity) {
            return null;
        }

        return {
            start: new Date(min),
            end: new Date(max)
        };
    }
}

// Export for use in other modules
window.TimelineParser = TimelineParser;
