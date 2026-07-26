/**
 * Deterministic parametric shapes for the route quality harness.
 *
 * The browser extracts shapes from PNGs, which makes fixtures depend on image
 * decoding. These generators produce the same normalized `[x, y]` points the
 * image pipeline does — origin top-left, both axes 0-1 — so they can be fed
 * straight into `scalePointsToGeo`.
 *
 * Points are resampled to uniform spacing along the outline, matching the
 * even spacing that boundary tracing produces.
 */

export type ShapeName = "heart" | "star" | "circle" | "square";

/**
 * Generates a closed shape outline as normalized `[x, y]` points.
 *
 * @param name - Which shape to generate.
 * @param points - Number of points to return, excluding the repeated closing point.
 * @returns Closed ring of normalized points; the last point repeats the first.
 */
export function generateShape(name: ShapeName, points: number): [number, number][] {
    const outline = OUTLINES[name](Math.max(points * 4, 400));
    return closeRing(resampleUniform(outline, points));
}

/** Dense outlines in "up is +y" maths space, each value in -1..1. */
const OUTLINES: Record<ShapeName, (samples: number) => [number, number][]> = {
    heart: samples =>
        parametric(samples, t => [
            (16 * Math.sin(t) ** 3) / 17,
            (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
        ]),

    circle: samples => parametric(samples, t => [Math.cos(t), Math.sin(t)]),

    // Five-pointed star: alternating outer and inner radius.
    star: samples =>
        parametric(samples, t => {
            const spike = Math.floor((t / (2 * Math.PI)) * 10) % 10;
            const radius = spike % 2 === 0 ? 1 : 0.382;
            return [radius * Math.sin(t), radius * Math.cos(t)];
        }),

    square: samples =>
        parametric(samples, t => {
            // Project the unit circle onto the square by scaling to the axis
            // that reaches the edge first.
            const x = Math.cos(t);
            const y = Math.sin(t);
            const scale = 1 / Math.max(Math.abs(x), Math.abs(y));
            return [x * scale, y * scale];
        }),
};

/** Samples a parametric curve over a full turn. */
function parametric(
    samples: number,
    at: (t: number) => [number, number]
): [number, number][] {
    const outline: [number, number][] = [];
    for (let i = 0; i < samples; i++) {
        outline.push(at((2 * Math.PI * i) / samples));
    }
    return outline;
}

/**
 * Resamples a closed outline to evenly spaced points and converts it from
 * maths space (-1..1, y up) to normalized image space (0..1, y down).
 *
 * @param outline - Dense outline in maths space.
 * @param count - How many evenly spaced points to produce.
 * @returns Evenly spaced points in normalized image space.
 */
function resampleUniform(outline: [number, number][], count: number): [number, number][] {
    const ring = [...outline, outline[0]];

    const cumulative: number[] = [0];
    for (let i = 0; i < ring.length - 1; i++) {
        const dx = ring[i + 1][0] - ring[i][0];
        const dy = ring[i + 1][1] - ring[i][1];
        cumulative.push(cumulative[i] + Math.hypot(dx, dy));
    }

    const perimeter = cumulative[cumulative.length - 1];
    const resampled: [number, number][] = [];
    let cursor = 0;

    for (let i = 0; i < count; i++) {
        const target = (perimeter * i) / count;
        while (cursor < cumulative.length - 2 && cumulative[cursor + 1] < target) cursor++;

        const spanStart = cumulative[cursor];
        const span = cumulative[cursor + 1] - spanStart;
        const t = span === 0 ? 0 : (target - spanStart) / span;

        const x = ring[cursor][0] + (ring[cursor + 1][0] - ring[cursor][0]) * t;
        const y = ring[cursor][1] + (ring[cursor + 1][1] - ring[cursor][1]) * t;

        // Maths space is -1..1 with y up; image space is 0..1 with y down.
        resampled.push([(x + 1) / 2, (1 - y) / 2]);
    }

    return resampled;
}

/** Repeats the first point at the end so the outline forms a closed loop. */
function closeRing(points: [number, number][]): [number, number][] {
    return points.length === 0 ? points : [...points, points[0]];
}
