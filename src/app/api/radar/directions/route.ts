import { NextRequest, NextResponse } from "next/server";
import { getRadarRoute } from "@/lib/radarService";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { coordinates, mode } = body;

        const result = await getRadarRoute({ coordinates, mode });
        return NextResponse.json(result);

    } catch (error: unknown) {
        console.error("[API] Error generating route:", error);
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
