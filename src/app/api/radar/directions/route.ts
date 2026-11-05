import { NextRequest, NextResponse } from "next/server";
import { getRadarRoute } from "@/lib/radarService";
import { withRateLimit } from "@/lib/apiRateLimit";
import { badRequest, isCoordinateList, readJsonObject } from "@/lib/apiRequest";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
    return withRateLimit(request, () => generateRoute(request));
}

async function generateRoute(request: NextRequest) {
    // A malformed request is the client's mistake: answer 400 and keep it out of Sentry.
    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
        return parsed.response;
    }

    const { coordinates, mode } = parsed.body;
    if (!isCoordinateList(coordinates)) {
        return badRequest("coordinates must be an array of at least 2 [number, number] points");
    }

    try {
        const result = await getRadarRoute({ coordinates, mode: mode as string });

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error("[API] Error generating route:", error);

        // Capture error in Sentry with context
        Sentry.captureException(error, {
            extra: {
                endpoint: "/api/radar/directions",
                coordinatesCount: coordinates.length,
            }
        });

        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
