import { NextRequest, NextResponse } from "next/server";
import { getRadarRoute } from "@/lib/radarService";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { coordinates, mode } = body;

        const result = await getRadarRoute({ coordinates, mode });

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error("[API] Error generating route:", error);
        
        // Capture error in Sentry with context
        Sentry.captureException(error, {
            extra: {
                endpoint: "/api/radar/directions",
                coordinatesCount: Array.isArray(request.body) ? 0 : "unknown",
            }
        });

        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
