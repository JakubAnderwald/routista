import { NextRequest, NextResponse } from "next/server";
import { getRadarAutocomplete } from "@/lib/radarService";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { query } = body;

        if (!query || typeof query !== 'string') {
            return NextResponse.json({ error: "Invalid query parameter" }, { status: 400 });
        }

        const result = await getRadarAutocomplete(query);

        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error("[API] Error fetching autocomplete:", error);
        
        // Capture error in Sentry with context
        Sentry.captureException(error, {
            extra: {
                endpoint: "/api/radar/autocomplete",
            }
        });

        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
