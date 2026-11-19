import { describe, it, expect } from "vitest";
import { replayFetch, replayKey, RadarFixture } from "../utils/radarFixtures";

const BASE = "https://api.radar.io/v1/route/directions";

function url(locations: string, mode = "foot"): string {
    return `${BASE}?locations=${encodeURIComponent(locations)}&mode=${mode}`;
}

describe("radarFixtures replay", () => {
    it("matches URLs that differ only in floating-point noise", () => {
        expect(replayKey(url("51.50953002831789,-0.07773589056522645|51.5,-0.07")))
            .toBe(replayKey(url("51.50953002831789,-0.07773589056522646|51.5,-0.07")));
    });

    it("keeps genuinely different waypoints apart", () => {
        expect(replayKey(url("51.50953,-0.07773|51.5,-0.07")))
            .not.toBe(replayKey(url("51.50954,-0.07773|51.5,-0.07")));
    });

    it("keeps other parameters exact", () => {
        expect(replayKey(url("51.5,-0.07|51.6,-0.08", "foot")))
            .not.toBe(replayKey(url("51.5,-0.07|51.6,-0.08", "car")));
    });

    it("leaves URLs without locations unchanged", () => {
        expect(replayKey(`${BASE}?mode=foot`)).toBe(`${BASE}?mode=foot`);
    });

    it("replays a recorded response for a noisy URL and throws for an unknown one", async () => {
        const fixture: RadarFixture = {
            scenario: "test",
            capturedAt: "2026-01-01T00:00:00Z",
            requests: { [url("51.1,-0.12345678901234565|51.2,-0.1")]: { status: 200, body: { ok: 1 } } },
        };
        const fetchReplay = replayFetch(fixture);

        const response = await fetchReplay(url("51.1,-0.12345678901234566|51.2,-0.1"));
        expect(response.ok).toBe(true);
        expect(await response.json()).toEqual({ ok: 1 });

        await expect(fetchReplay(url("51.1,-0.2|51.2,-0.1"))).rejects.toThrow("No recorded response");
    });
});
