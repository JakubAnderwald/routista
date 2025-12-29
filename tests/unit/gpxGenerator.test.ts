import { describe, it, expect } from 'vitest';
import { generateGPX } from '../../src/lib/gpxGenerator';
import { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

/**
 * Helper to create a LineString feature with given coordinates
 * Reduces duplication of Feature boilerplate in tests
 */
function createLineStringFeature(
    coordinates: number[][]
): Feature<Geometry, GeoJsonProperties> {
    return {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
    };
}

/**
 * Helper to create a FeatureCollection from an array of features
 */
function createFeatureCollection(
    features: Feature<Geometry, GeoJsonProperties>[]
): FeatureCollection {
    return { type: 'FeatureCollection', features };
}

describe('gpxGenerator', () => {
    describe('generateGPX', () => {
        it('should return empty string for null input', () => {
            // @ts-expect-error - testing null input
            expect(generateGPX(null)).toBe('');
        });

        it('should return empty string for undefined input', () => {
            // @ts-expect-error - testing undefined input
            expect(generateGPX(undefined)).toBe('');
        });

        it('should return empty string for object without features', () => {
            // @ts-expect-error - testing invalid input
            expect(generateGPX({})).toBe('');
        });

        it('should generate valid GPX for empty features array', () => {
            const gpx = generateGPX(createFeatureCollection([]));

            expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
            expect(gpx).toContain('<gpx version="1.1" creator="Routista"');
            expect(gpx).toContain('<trk>');
            expect(gpx).toContain('<name>Routista Route</name>');
            expect(gpx).toContain('<trkseg>');
            expect(gpx).toContain('</trkseg>');
            expect(gpx).toContain('</trk>');
            expect(gpx).toContain('</gpx>');
        });

        it('should generate GPX with track points from LineString', () => {
            // GeoJSON is [lng, lat]
            const geoJson = createFeatureCollection([
                createLineStringFeature([
                    [-0.09, 51.505],
                    [-0.08, 51.506],
                    [-0.07, 51.507],
                ]),
            ]);

            const gpx = generateGPX(geoJson);

            // GPX expects lat, lon attributes
            expect(gpx).toContain('<trkpt lat="51.505" lon="-0.09"></trkpt>');
            expect(gpx).toContain('<trkpt lat="51.506" lon="-0.08"></trkpt>');
            expect(gpx).toContain('<trkpt lat="51.507" lon="-0.07"></trkpt>');
        });

        it('should handle multiple LineString features', () => {
            const geoJson = createFeatureCollection([
                createLineStringFeature([
                    [1.0, 10.0],
                    [2.0, 20.0],
                ]),
                createLineStringFeature([
                    [3.0, 30.0],
                    [4.0, 40.0],
                ]),
            ]);

            const gpx = generateGPX(geoJson);

            expect(gpx).toContain('<trkpt lat="10" lon="1"></trkpt>');
            expect(gpx).toContain('<trkpt lat="20" lon="2"></trkpt>');
            expect(gpx).toContain('<trkpt lat="30" lon="3"></trkpt>');
            expect(gpx).toContain('<trkpt lat="40" lon="4"></trkpt>');
        });

        it('should ignore non-LineString geometry types', () => {
            const geoJson = createFeatureCollection([
                {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'Point', coordinates: [1.0, 2.0] },
                },
                createLineStringFeature([[5.0, 50.0]]),
            ]);

            const gpx = generateGPX(geoJson);

            // Point should be ignored
            expect(gpx).not.toContain('lat="2"');
            // LineString should be included
            expect(gpx).toContain('<trkpt lat="50" lon="5"></trkpt>');
        });

        it('should handle coordinates with high precision', () => {
            const geoJson = createFeatureCollection([
                createLineStringFeature([[-0.123456789, 51.505123456]]),
            ]);

            const gpx = generateGPX(geoJson);

            expect(gpx).toContain('lat="51.505123456"');
            expect(gpx).toContain('lon="-0.123456789"');
        });
    });
});

