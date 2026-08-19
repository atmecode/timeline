/**
 * Timeline Parser Module
 * Parses Google Timeline JSON files into normalized points
 * 
 * Supported formats (based on mahlernim/google-timeline-visualizer):
 * 1. { "semanticSegments": [...] } - Current Android/iOS exports
 * 2. Direct array of segments
 * 
 * Segment structure:
 * {
 *   "startTime": "ISO timestamp",
 *   "endTime": "ISO timestamp",
 *   "timelinePath": [
 *     { "point": "geo:lat,lon", "time": "ISO", "durationMinutesOffsetFromStartTime": 0 }
 *   ],
 *   "activity": { "start": "geo:lat,lon", "end": "geo:lat,lon" },
 *   "visit": { "topCandidate": { "placeLocation": "geo:lat,lon" } }
 * }
 */
class TimelineParser {
    constructor() {
        this.supportedFormats = [
            'semanticSegments',
            'direct-array'
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
        console.log('Data type:', typeof data, Array.isArray(data) ? '(array)' : '');
        const startTime = performance.now();

        let segments = [];

        // Detect format and extract segments
        if (Array.isArray(data)) {
            // Direct array of segments
            segments = data;
            console.log('Detected: Direct array format');
        } else if (data && typeof data === 'object') {
            if (data.semanticSegments) {
                // Object with semanticSegments
                segments = data.semanticSegments;
                console.log('Detected: semanticSegments format');
            } else {
                // Try to find segments in other properties
                console.log('Available keys:', Object.keys(data).join(', '));
                throw new Error('Unsupported Timeline JSON format. Expected "semanticSegments" key.');
            }
        } else {
            throw new Error('Invalid Timeline JSON data');
        }

        console.log(`Found ${segments.length} segments`);

        // Parse all points from segments
        let points = this.parseSegments(segments);

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
            const removed = beforeCount - points.length;
            if (removed > 0) {
                console.log(`GPS filter removed ${removed} outlier points`);
            }
        }

        // Sort by timestamp
        points.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

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
     * Parse all segments into normalized points
     */
    parseSegments(segments) {
        const points = [];

        for (const seg of segments) {
            if (!seg || typeof seg !== 'object') continue;

            const startTime = seg.startTime;
            const endTime = seg.endTime;

            // 1. Parse timelinePath (route points)
            if (seg.timelinePath && Array.isArray(seg.timelinePath)) {
                for (const pathPoint of seg.timelinePath) {
                    const point = this.parsePathPoint(pathPoint, startTime, endTime);
                    if (point) points.push(point);
                }
            }

            // 2. Parse activity (start and end points)
            if (seg.activity && typeof seg.activity === 'object') {
                const startCoords = this.parseCoordinate(seg.activity.start);
                if (startCoords) {
                    const ts = this.parseTimestamp(startTime);
                    if (ts) {
                        points.push({
                            lat: startCoords.lat,
                            lon: startCoords.lon,
                            timestamp: ts
                        });
                    }
                }
                const endCoords = this.parseCoordinate(seg.activity.end);
                if (endCoords) {
                    const ts = this.parseTimestamp(endTime);
                    if (ts) {
                        points.push({
                            lat: endCoords.lat,
                            lon: endCoords.lon,
                            timestamp: ts
                        });
                    }
                }
            }

            // 3. Parse visit (topCandidate placeLocation)
            if (seg.visit && typeof seg.visit === 'object') {
                const candidate = seg.visit.topCandidate;
                if (candidate && typeof candidate === 'object') {
                    const coords = this.parseCoordinate(candidate.placeLocation);
                    if (coords) {
                        const ts = this.parseTimestamp(startTime);
                        if (ts) {
                            points.push({
                                lat: coords.lat,
                                lon: coords.lon,
                                timestamp: ts
                            });
                        }
                    }
                }
            }
        }

        // Deduplicate points
        return this.deduplicatePoints(points);
    }

    /**
     * Parse a single path point
     * Handles: { "point": "geo:lat,lon", "time": "ISO", "durationMinutesOffsetFromStartTime": N }
     */
    parsePathPoint(pathPoint, segStartTime, segEndTime) {
        if (!pathPoint || typeof pathPoint !== 'object') return null;

        // Parse coordinates
        const coords = this.parseCoordinate(pathPoint.point);
        if (!coords) return null;

        // Parse timestamp
        let timestamp = null;

        // Try direct time first
        if (pathPoint.time) {
            timestamp = this.parseTimestamp(pathPoint.time);
        }

        // Fallback: use durationMinutesOffsetFromStartTime
        if (timestamp === null && pathPoint.durationMinutesOffsetFromStartTime !== undefined) {
            const offset = parseInt(pathPoint.durationMinutesOffsetFromStartTime);
            if (!isNaN(offset) && offset >= 0) {
                const startTs = this.parseTimestamp(segStartTime);
                if (startTs) {
                    timestamp = startTs + (offset * 60 * 1000);
                    
                    // Validate against end time
                    if (segEndTime) {
                        const endTs = this.parseTimestamp(segEndTime);
                        if (endTs && timestamp > endTs + 60000) {
                            return null; // Invalid offset
                        }
                    }
                }
            }
        }

        // Fallback: use segment start time
        if (timestamp === null) {
            timestamp = this.parseTimestamp(segStartTime);
        }

        return {
            lat: coords.lat,
            lon: coords.lon,
            timestamp: timestamp
        };
    }

    /**
     * Parse coordinate from various formats
     * Supports: "geo:lat,lon", "lat,lon", { latLng: "lat,lon" }, etc.
     */
    parseCoordinate(value) {
        if (!value) return null;

        // Handle string format: "geo:lat,lon" or "lat,lon"
        if (typeof value === 'string') {
            return this.parseCoordinateString(value);
        }

        // Handle object format
        if (typeof value === 'object') {
            // { latLng: "lat,lon" }
            if (value.latLng) {
                return this.parseCoordinateString(value.latLng);
            }
            // { point: "lat,lon" }
            if (value.point) {
                return this.parseCoordinateString(value.point);
            }
            // { latitude: N, longitude: N }
            if (value.latitude !== undefined && value.longitude !== undefined) {
                return this.parseLatLon(value.latitude, value.longitude);
            }
            // { lat: N, lng: N }
            if (value.lat !== undefined && value.lng !== undefined) {
                return this.parseLatLon(value.lat, value.lng);
            }
        }

        return null;
    }

    /**
     * Parse coordinate string in various formats
     */
    parseCoordinateString(str) {
        if (!str || typeof str !== 'string') return null;

        // Clean the string
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

            return this.parseLatLon(lat, lon);
        } catch (e) {
            return null;
        }
    }

    /**
     * Parse latitude/longitude with validation
     */
    parseLatLon(lat, lon) {
        if (isNaN(lat) || isNaN(lon)) return null;
        if (!this.isValidCoordinate(lat, lon)) return null;
        return { lat, lon };
    }

    /**
     * Validate coordinate
     */
    isValidCoordinate(lat, lon) {
        return (
            lat >= -85.05112878 && lat <= 85.05112878 &&
            lon >= -180 && lon <= 180
        );
    }

    /**
     * Parse timestamp from various formats
     */
    parseTimestamp(value) {
        if (!value) return null;

        // Already a Date object
        if (value instanceof Date) {
            const ts = value.getTime();
            return isNaN(ts) ? null : ts;
        }

        // Unix timestamp (seconds)
        if (typeof value === 'number') {
            if (value < 10000000000) {
                return value * 1000;
            }
            return value;
        }

        // String timestamp
        if (typeof value === 'string') {
            // ISO format: "2024-01-15T10:30:00.000Z" or "2024-01-15T10:30:00Z"
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.getTime();
            }

            // Format: "2024-01-15T10:30:00"
            const match = value.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
            if (match) {
                const [, year, month, day, hours, minutes, seconds] = match;
                return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
            }
        }

        return null;
    }

    /**
     * Deduplicate points based on timestamp and coordinates
     */
    deduplicatePoints(points) {
        const seen = new Set();
        return points.filter(point => {
            const key = `${point.timestamp}-${point.lat.toFixed(6)}-${point.lon.toFixed(6)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Filter points by date range
     */
    filterByDate(points, startDate, endDate) {
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).getTime() : Infinity;

        return points.filter(point => {
            if (!point.timestamp) return true;
            return point.timestamp >= start && point.timestamp <= end;
        });
    }

    /**
     * Filter GPS outliers
     * Removes isolated, implausible out-and-back coordinates
     */
    filterGPSOutliers(points) {
        if (points.length < 3) return points;

        const filtered = [points[0]];

        for (let i = 1; i < points.length - 1; i++) {
            const prev = points[i - 1];
            const curr = points[i];
            const next = points[i + 1];

            const distToPrev = this.haversineDistance(prev.lat, prev.lon, curr.lat, curr.lon);
            const distToNext = this.haversineDistance(curr.lat, curr.lon, next.lat, next.lon);
            const distPrevToNext = this.haversineDistance(prev.lat, prev.lon, next.lat, next.lon);

            // Outlier: far from both neighbors but neighbors are close
            const isOutlier = (
                distToPrev > 5 &&
                distToNext > 5 &&
                distPrevToNext < 2
            );

            // Sudden return: large distances but back to same area
            const isSuddenReturn = (
                distToPrev > 10 &&
                distToNext > 10 &&
                distPrevToNext < 1
            );

            if (!isOutlier && !isSuddenReturn) {
                filtered.push(curr);
            }
        }

        filtered.push(points[points.length - 1]);
        return filtered;
    }

    /**
     * Calculate distance using Haversine formula
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
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
     * Calculate statistics
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
        let minTimestamp = Infinity;
        let maxTimestamp = -Infinity;

        for (let i = 0; i < points.length; i++) {
            const point = points[i];

            if (point.timestamp) {
                minTimestamp = Math.min(minTimestamp, point.timestamp);
                maxTimestamp = Math.max(maxTimestamp, point.timestamp);
            }

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
            } : null
        };
    }
}

// Export for use in other modules
window.TimelineParser = TimelineParser;
