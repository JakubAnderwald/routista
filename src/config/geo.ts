/**
 * Geographic constants and configuration
 * 
 * Contains constants for geographic calculations.
 */

export const GEO = {
    /** Earth radius in meters (WGS84 semi-major axis) */
    earthRadiusMeters: 6378137,
    
    /** Earth radius in meters for Haversine (mean radius) */
    earthRadiusMeanMeters: 6371e3,
    
    /** Approximate meters per degree of latitude */
    metersPerLatDegree: 111320,
    
    /** Threshold in meters for detecting closed loop shapes */
    closedLoopThresholdMeters: 100,
    
    /** Simplification tolerance divisors for Douglas-Peucker */
    simplification: {
        /** Divisor for closed loops (stricter, preserves more points) */
        closedLoopDivisor: 20,
        /** Divisor for open shapes */
        openShapeDivisor: 10,
    },
    
    /** Accuracy calculation settings */
    accuracy: {
        /** Sample distance in meters for backward error calculation */
        sampleDistanceMeters: 10,
        /** Maximum tolerated error as fraction of radius (50% = shape lost) */
        maxToleratedErrorFraction: 0.5,
    },
} as const;

