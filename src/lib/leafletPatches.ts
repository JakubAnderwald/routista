import L from "leaflet";

/**
 * Leaflet internals touched by the zoom-animation patch below.
 */
interface ZoomAnimationInternals {
    _mapPane?: HTMLElement;
    _onZoomTransitionEnd: () => void;
}

const PATCHED = Symbol.for("routista.leafletZoomTransitionPatch");

/**
 * Guards `L.Map#_onZoomTransitionEnd` against running on a removed map.
 *
 * Leaflet 1.9 schedules a 250ms fallback `setTimeout` for every animated zoom
 * but `map.remove()` never clears it. If the map unmounts mid-animation (e.g.
 * user navigates to the next step right after a zoom), the timer fires with
 * `_mapPane` deleted and throws
 * "Cannot read properties of undefined (reading '_leaflet_pos')" (Sentry ROUTISTA-4).
 *
 * Idempotent — safe to call from every map component.
 */
export function patchLeafletZoomTransition(): void {
    const proto = L.Map.prototype as unknown as ZoomAnimationInternals & { [PATCHED]?: true };
    if (proto[PATCHED]) return;

    const original = proto._onZoomTransitionEnd;
    proto._onZoomTransitionEnd = function (this: ZoomAnimationInternals) {
        if (!this._mapPane) return;
        original.call(this);
    };
    proto[PATCHED] = true;
}

patchLeafletZoomTransition();
