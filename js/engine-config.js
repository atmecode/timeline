/**
 * Engine Configuration
 * All constants ported from mahlernim/google-timeline-visualizer Python original
 */
const ENGINE_CONFIG = {
    // --- Defaults ---
    DEFAULT_FPS: 30,
    DEFAULT_DURATION: 90,
    DEFAULT_TAIL_KM: 500,
    THEME_COLOR: '#ff0055',
    TILE_URL: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',

    // --- Camera Movement Modes ---
    CAMERA_MOVEMENTS: {
        fixed: {
            context_fraction: 0.10,
            minimum_context_km: 25.0,
            maximum_context_km: 350.0,
            padding: 2.6,
            minimum_span: 0.00060,
            zoom_out_alpha: 0.0,
            zoom_in_alpha: 0.0,
            leg_aware: false,
            fixed_zoom: true
        },
        steady: {
            context_fraction: 1.00,
            minimum_context_km: 650.0,
            maximum_context_km: 650.0,
            padding: 2.8,
            minimum_span: 0.00060,
            zoom_out_alpha: 0.14,
            zoom_in_alpha: 0.035,
            leg_aware: false,
            fixed_zoom: false
        },
        dynamic: {
            context_fraction: 0.10,
            minimum_context_km: 100.0,
            maximum_context_km: 350.0,
            padding: 2.2,
            minimum_span: 0.00045,
            zoom_out_alpha: 0.24,
            zoom_in_alpha: 0.06,
            leg_aware: true,
            fixed_zoom: false
        }
    },

    // --- Compression Exponents ---
    COMPRESSION_EXPONENTS: {
        off: 1.00,
        gentle: 0.92,
        balanced: 0.85,
        strong: 0.75
    },

    // --- Transfer Detection ---
    TRANSFER_PADDING: 2.8,
    CAMERA_TRACK_SAMPLES: 480,
    CAMERA_DEAD_ZONE_HALF: 0.20,
    FIXED_ZOOM_PERCENTILE: 0.80,
    MIN_TRANSFER_THRESHOLD_KM: 60.0,
    MAX_TRANSFER_THRESHOLD_KM: 120.0,
    TRANSFER_TO_TYPICAL_RATIO: 3.0,
    DEVIATION_MULTIPLIER: 6.0,

    // --- Web Mercator Constants ---
    R_EARTH: 6378137.0,
    MAX_EXTENT: 20037508.342789244
};

// --- Projection Utilities (Web Mercator) ---
const Projection = {
    /**
     * Convert lat/lon to Web Mercator meters
     */
    latlonToMeters(lat, lon) {
        const R = ENGINE_CONFIG.R_EARTH;
        const x = R * (lon * Math.PI / 180);
        const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
        return { x, y };
    },

    /**
     * Convert Web Mercator meters to lat/lon
     */
    metersToLatlon(x, y) {
        const R = ENGINE_CONFIG.R_EARTH;
        const lon = (x / R) * (180 / Math.PI);
        const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI);
        return { lat, lon };
    },

    /**
     * Haversine distance in km
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371.0;
        const toRad = (deg) => deg * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    /**
     * Great-circle interpolation (slerp) for long distances
     * Returns {lat, lon} at given fraction between two points
     */
    interpolateGreatCircle(lat1, lon1, lat2, lon2, fraction) {
        if (fraction <= 0) return { lat: lat1, lon: lon1 };
        if (fraction >= 1) return { lat: lat2, lon: lon2 };

        const toRad = (deg) => deg * Math.PI / 180;
        const toDeg = (rad) => rad * 180 / Math.PI;

        const p1 = toRad(lat1), l1 = toRad(lon1);
        const p2 = toRad(lat2), l2 = toRad(lon2);

        // Convert to 3D Cartesian
        const ax = Math.cos(p1) * Math.cos(l1);
        const ay = Math.cos(p1) * Math.sin(l1);
        const az = Math.sin(p1);
        const bx = Math.cos(p2) * Math.cos(l2);
        const by = Math.cos(p2) * Math.sin(l2);
        const bz = Math.sin(p2);

        // Angle between points
        const dot = Math.max(-1.0, Math.min(1.0, ax * bx + ay * by + az * bz));
        const omega = Math.acos(dot);

        let left, right;
        if (Math.sin(omega) < 1e-8) {
            left = 1 - fraction;
            right = fraction;
        } else {
            left = Math.sin((1 - fraction) * omega) / Math.sin(omega);
            right = Math.sin(fraction * omega) / Math.sin(omega);
        }

        const x = left * ax + right * bx;
        const y = left * ay + right * by;
        const z = left * az + right * bz;

        return {
            lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))),
            lon: toDeg(Math.atan2(y, x))
        };
    },

    /**
     * Find position at a specific distance along a route
     */
    positionAtDistance(cumDist, lats, lons, distanceKm) {
        if (!cumDist || cumDist.length === 0) {
            throw new Error('A route needs at least one point');
        }
        if (cumDist.length === 1 || cumDist[cumDist.length - 1] <= 0) {
            return { lat: lats[0], lon: lons[0] };
        }

        const distance = Math.max(0.0, Math.min(cumDist[cumDist.length - 1], distanceKm));

        // Binary search for segment
        let lo = 0, hi = cumDist.length - 1;
        while (lo < hi - 1) {
            const mid = (lo + hi) >> 1;
            if (cumDist[mid] <= distance) lo = mid;
            else hi = mid;
        }
        const toIndex = Math.min(Math.max(hi, 1), cumDist.length - 1);

        const segment = cumDist[toIndex] - cumDist[toIndex - 1];
        const fraction = segment <= 0 ? 0.0 : (distance - cumDist[toIndex - 1]) / segment;

        return this.interpolateGreatCircle(
            lats[toIndex - 1], lons[toIndex - 1],
            lats[toIndex], lons[toIndex],
            fraction
        );
    }
};

// --- Transfer Detection Utilities ---
const TransferUtils = {
    /**
     * Calculate transfer threshold based on route characteristics
     */
    transferThresholdKm(cumDist) {
        const maxT = ENGINE_CONFIG.MAX_TRANSFER_THRESHOLD_KM;
        const hops = [];
        for (let i = 1; i < cumDist.length; i++) {
            const hop = cumDist[i] - cumDist[i - 1];
            if (hop > 0 && hop < maxT) {
                hops.push(hop);
            }
        }
        if (hops.length === 0) return maxT;

        hops.sort((a, b) => a - b);
        const median = hops[Math.floor(hops.length / 2)];

        const deviations = hops.map(h => Math.abs(h - median)).sort((a, b) => a - b);
        const medianDeviation = deviations[Math.floor(deviations.length / 2)];

        const threshold = Math.max(
            ENGINE_CONFIG.MIN_TRANSFER_THRESHOLD_KM,
            median * ENGINE_CONFIG.TRANSFER_TO_TYPICAL_RATIO,
            median + medianDeviation * ENGINE_CONFIG.DEVIATION_MULTIPLIER
        );

        return Math.min(maxT, threshold);
    },

    /**
     * Build legs: local segments and transfer segments
     * Returns array of { start, end, isTransfer }
     */
    buildLegs(cumDist, thresholdKm) {
        if (cumDist.length < 2 || cumDist[cumDist.length - 1] <= 0) return [];

        const threshold = thresholdKm !== undefined ? thresholdKm : this.transferThresholdKm(cumDist);
        const legs = [];
        let localStart = 0.0;

        for (let i = 1; i < cumDist.length; i++) {
            const hop = cumDist[i] - cumDist[i - 1];
            if (hop < Math.max(1.0, threshold)) continue;

            if (cumDist[i - 1] > localStart) {
                legs.push({ start: localStart, end: cumDist[i - 1], isTransfer: false });
            }
            legs.push({ start: cumDist[i - 1], end: cumDist[i], isTransfer: true });
            localStart = cumDist[i];
        }

        if (cumDist[cumDist.length - 1] > localStart) {
            legs.push({ start: localStart, end: cumDist[cumDist.length - 1], isTransfer: false });
        }

        return legs;
    },

    /**
     * Find which leg contains a given distance
     */
    legAt(legs, distanceKm, totalKm) {
        if (!legs || legs.length === 0) {
            return { start: 0, end: totalKm, isTransfer: false };
        }

        let idx = 0;
        for (let i = 0; i < legs.length; i++) {
            if (legs[i].start <= distanceKm) idx = i;
        }
        return legs[Math.min(idx, legs.length - 1)];
    }
};

// --- Timing Utilities ---
const TimingUtils = {
    /**
     * Build journey timing function (distance-at-progress mapper)
     * Implements long-trip compression
     */
    buildJourneyTiming(cumDist, compression) {
        const totalKm = cumDist[cumDist.length - 1] || 0.0;
        const exponent = ENGINE_CONFIG.COMPRESSION_EXPONENTS[compression] || 1.0;

        if (compression === 'off' || cumDist.length < 2) {
            return (progress) => totalKm * Math.max(0.0, Math.min(1.0, progress));
        }

        // Calculate effective distances with compression
        const distances = [0.0];
        const effective = [0.0];
        let effectiveTotal = 0.0;

        for (let i = 1; i < cumDist.length; i++) {
            const segment = cumDist[i] - cumDist[i - 1];
            if (segment <= 0) continue;
            effectiveTotal += Math.pow(segment, exponent);
            distances.push(cumDist[i]);
            effective.push(effectiveTotal);
        }

        if (effectiveTotal <= 0 || distances.length < 2) {
            return (progress) => totalKm * Math.max(0.0, Math.min(1.0, progress));
        }

        // Normalize x values
        const xValues = effective.map(v => v / effectiveTotal);

        // Calculate monotone slopes for smooth interpolation
        const slopes = this.monotoneSlopes(xValues, distances);

        // Return interpolation function
        return (progress) => {
            const elapsed = Math.max(0.0, Math.min(1.0, progress));

            // Find segment
            let toIndex = 1;
            while (toIndex < xValues.length - 1 && xValues[toIndex] < elapsed) {
                toIndex++;
            }
            const fromIndex = toIndex - 1;

            const width = xValues[toIndex] - xValues[fromIndex];
            const t = width <= 0 ? 0.0 : (elapsed - xValues[fromIndex]) / width;
            const t2 = t * t;
            const t3 = t * t * t;

            // Hermite interpolation
            return (2 * t3 - 3 * t2 + 1) * distances[fromIndex] +
                   (t3 - 2 * t2 + t) * width * slopes[fromIndex] +
                   (-2 * t3 + 3 * t2) * distances[toIndex] +
                   (t3 - t2) * width * slopes[toIndex];
        };
    },

    /**
     * Endpoint slope calculation
     */
    endpointSlope(firstWidth, secondWidth, first, second) {
        const slope = ((2 * firstWidth + secondWidth) * first - firstWidth * second) / (firstWidth + secondWidth);
        if (slope <= 0) return 0.0;
        return Math.min(slope, 3 * first);
    },

    /**
     * Calculate monotone slopes for Hermite interpolation
     */
    monotoneSlopes(xValues, yValues) {
        const count = xValues.length - 1;
        const delta = [];
        for (let i = 0; i < count; i++) {
            delta.push((yValues[i + 1] - yValues[i]) / (xValues[i + 1] - xValues[i]));
        }

        if (count === 1) {
            return [delta[0], delta[0]];
        }

        const slopes = new Array(xValues.length).fill(0.0);

        slopes[0] = this.endpointSlope(
            xValues[1] - xValues[0], xValues[2] - xValues[1],
            delta[0], delta[1]
        );

        for (let i = 1; i < xValues.length - 1; i++) {
            const beforeWidth = xValues[i] - xValues[i - 1];
            const afterWidth = xValues[i + 1] - xValues[i];
            const weightBefore = 2 * afterWidth + beforeWidth;
            const weightAfter = afterWidth + 2 * beforeWidth;
            slopes[i] = (weightBefore + weightAfter) /
                        (weightBefore / delta[i - 1] + weightAfter / delta[i]);
        }

        slopes[xValues.length - 1] = this.endpointSlope(
            xValues[xValues.length - 1] - xValues[xValues.length - 2],
            xValues[xValues.length - 2] - xValues[xValues.length - 3],
            delta[count - 1], delta[count - 2]
        );

        return slopes;
    }
};

// Export
window.ENGINE_CONFIG = ENGINE_CONFIG;
window.Projection = Projection;
window.TransferUtils = TransferUtils;
window.TimingUtils = TimingUtils;
