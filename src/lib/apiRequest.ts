import { NextResponse } from 'next/server';

/** A parsed JSON object body, or the 400 response to return instead. */
export type JsonObjectResult =
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; response: NextResponse };

/**
 * A 400 response in the `{ error }` shape the API routes already use.
 *
 * @param message - Shown to the client as `error`.
 */
export function badRequest(message: string): NextResponse {
    return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Reads a request's JSON body and checks that it is an object.
 *
 * A malformed or non-object body is the client's mistake, so the caller should answer 400
 * and not report it to Sentry. Bots and scanners send such bodies all the time, and
 * reporting them as server errors would bury real failures.
 *
 * @param request - The incoming API request.
 * @returns The parsed body, or a ready 400 response.
 */
export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return { ok: false, response: badRequest('Request body must be valid JSON') };
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { ok: false, response: badRequest('Request body must be a JSON object') };
    }

    return { ok: true, body: body as Record<string, unknown> };
}

/**
 * Whether `value` is a usable route: at least two points, each with finite numbers in its
 * first two positions.
 *
 * @param value - The untrusted `coordinates` field of a request body.
 */
export function isCoordinateList(value: unknown): value is [number, number][] {
    return (
        Array.isArray(value) &&
        value.length >= 2 &&
        value.every(
            (point) =>
                Array.isArray(point) &&
                point.length >= 2 &&
                Number.isFinite(point[0]) &&
                Number.isFinite(point[1])
        )
    );
}
