import { NextRequest, NextResponse } from "next/server";
import { getRadarAutocomplete } from "@/lib/radarService";
import { withRateLimit } from "@/lib/apiRateLimit";
import { badRequest, readJsonObject } from "@/lib/apiRequest";
import * as Sentry from "@sentry/nextjs";

/** Returns Radar address suggestions for the posted `{ query }`, rate-limited per IP. */
export async function POST(request: NextRequest) {
    return withRateLimit(request, () => autocomplete(request));
}

/**
 * Validates the body and `query`, then asks Radar for suggestions.
 *
 * Malformed requests get a 400 and are not reported to Sentry. A Radar failure or other
 * unexpected error gets a 500 and is reported with the endpoint.
 */
async function autocomplete(request: NextRequest) {
    // A malformed request is the client's mistake: answer 400 and keep it out of Sentry.
    const parsed = await readJsonObject(request);
    if (!parsed.ok) {
        return parsed.response;
    }

    const { query } = parsed.body;
    if (!query || typeof query !== 'string') {
        return badRequest("Invalid query parameter");
    }

    try {
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
