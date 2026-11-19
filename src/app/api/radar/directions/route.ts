import { NextRequest, NextResponse } from "next/server";
import { getRadarRoute } from "@/lib/radarService";
import { withRateLimit } from "@/lib/apiRateLimit";
import { badRequest, isCoordinateList, readJsonObject } from "@/lib/apiRequest";
import * as Sentry from "@sentry/nextjs";
import { encodeRouteStreamMessage, ROUTE_STREAM_CONTENT_TYPE } from "@/lib/routeProgress";

// No `maxDuration` here on purpose: the platform default (300 s on Fluid compute) covers the
// worst case of a 35 s river check plus up to five chunked Radar passes. A lower limit would
// cut the NDJSON stream off before its result or error line.

/** Generates a Radar route for the posted `{ coordinates, mode }`, rate-limited per IP. */
export async function POST(request: NextRequest) {
    return withRateLimit(request, () => generateRoute(request));
}

/**
 * Validates the body, then asks Radar for the route.
 *
 * Malformed requests get a 400 and are not reported to Sentry. A Radar failure or other
 * unexpected error gets a 500 and is reported with the endpoint and point count.
 */
async function generateRoute(request: NextRequest) {
    // A malformed request is the client's mistake: answer 400 and keep it out of Sentry.
    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
        return parsed.response;
    }

    const { coordinates, mode } = parsed.body;
    if (!isCoordinateList(coordinates)) {
        return badRequest("coordinates must be an array of at least 2 [lat, lng] points");
    }
    // Unknown mode strings fall back to driving inside getRadarRoute; anything that is not a
    // string at all would throw there instead.
    if (mode !== undefined && typeof mode !== "string") {
        return badRequest("mode must be a string");
    }

    if (request.headers.get("accept")?.includes(ROUTE_STREAM_CONTENT_TYPE)) {
        return streamRoute(coordinates, mode);
    }

    try {
        const result = await getRadarRoute({ coordinates, mode: mode as string });

        return NextResponse.json(result);

    } catch (error: unknown) {
        return NextResponse.json({ error: reportFailure(error, coordinates.length) }, { status: 500 });
    }
}

/**
 * Generates the route as NDJSON: progress lines while it works, then one result or error line.
 *
 * The status is already 200 once the stream starts, so a failure arrives as an error line.
 */
function streamRoute(coordinates: [number, number][], mode: string | undefined): NextResponse {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (line: string) => controller.enqueue(encoder.encode(line));
            try {
                const data = await getRadarRoute({ coordinates, mode: mode as string }, stage =>
                    send(encodeRouteStreamMessage({ type: "progress", stage }))
                );
                send(encodeRouteStreamMessage({ type: "result", data }));
            } catch (error: unknown) {
                send(encodeRouteStreamMessage({ type: "error", error: reportFailure(error, coordinates.length) }));
            }
            controller.close();
        },
    });

    return new NextResponse(stream, {
        headers: {
            "Content-Type": `${ROUTE_STREAM_CONTENT_TYPE}; charset=utf-8`,
            "Cache-Control": "no-store",
        },
    });
}

/** Logs and reports a route failure to Sentry, returning the message for the client. */
function reportFailure(error: unknown, coordinatesCount: number): string {
    console.error("[API] Error generating route:", error);

    Sentry.captureException(error, {
        extra: {
            endpoint: "/api/radar/directions",
            coordinatesCount,
        }
    });

    return error instanceof Error ? error.message : "Internal Server Error";
}
