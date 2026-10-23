import { describe, it, expect, afterEach } from 'vitest';
import L from 'leaflet';
import { patchLeafletZoomTransition } from '@/lib/leafletPatches';

type ZoomInternals = L.Map & {
    _animatingZoom: boolean;
    _animateToCenter: L.LatLng;
    _animateToZoom: number;
    _onZoomTransitionEnd: () => void;
};

function createMap(): ZoomInternals {
    const container = document.createElement('div');
    document.body.appendChild(container);
    return L.map(container, { center: [51.505, -0.09], zoom: 13 }) as ZoomInternals;
}

/** Puts the map in the state Leaflet leaves it in mid zoom animation. */
function startZoomAnimation(map: ZoomInternals) {
    map._animatingZoom = true;
    map._animateToCenter = L.latLng(51.5, -0.1);
    map._animateToZoom = 14;
}

describe('leafletPatches', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('does not throw when the zoom-transition fallback timer fires after map.remove()', () => {
        const map = createMap();
        startZoomAnimation(map);
        map.remove();

        expect(() => map._onZoomTransitionEnd()).not.toThrow();
    });

    it('still completes the zoom transition on a live map', () => {
        const map = createMap();
        startZoomAnimation(map);

        map._onZoomTransitionEnd();

        expect(map._animatingZoom).toBe(false);
        expect(map.getZoom()).toBe(14);
        map.remove();
    });

    it('is idempotent', () => {
        const before = (L.Map.prototype as unknown as ZoomInternals)._onZoomTransitionEnd;
        patchLeafletZoomTransition();
        patchLeafletZoomTransition();
        expect((L.Map.prototype as unknown as ZoomInternals)._onZoomTransitionEnd).toBe(before);
    });
});
