/**
 * Progress protocol for `/api/radar/directions`.
 *
 * A client that sends `Accept: application/x-ndjson` gets newline-delimited
 * JSON instead of a single JSON body: zero or more `progress` lines, then one
 * `result` or `error` line. This lets the UI explain a long wait, such as the
 * river-crossing repair waiting on a slow public Overpass instance.
 *
 * Clients that do not ask for it still get plain JSON, so pages loaded before
 * a deploy keep working.
 */

import type { FeatureCollection } from "geojson";

/** Media type that opts a request into the streamed protocol. */
export const ROUTE_STREAM_CONTENT_TYPE = "application/x-ndjson";

/**
 * Server-side stages worth telling the user about.
 *
 * `river-check`: the route looked like it crossed water and OSM water and
 * bridge data is being fetched, which can take tens of seconds.
 * `river-check-done`: that lookup has finished (with or without data), so a
 * notice about it that has not appeared yet should not appear.
 */
export type RouteProgressStage = "river-check" | "river-check-done";

/** Callback the route generator uses to report a stage. */
export type RouteProgressCallback = (stage: RouteProgressStage) => void;

/** One line of the streamed response. */
export type RouteStreamMessage =
    | { type: "progress"; stage: RouteProgressStage }
    | { type: "result"; data: FeatureCollection }
    | { type: "error"; error: string };

/**
 * Serialises one message as an NDJSON line.
 *
 * @param message - Message to send.
 * @returns The JSON text followed by a newline.
 */
export function encodeRouteStreamMessage(message: RouteStreamMessage): string {
    return `${JSON.stringify(message)}\n`;
}

/**
 * Reads an NDJSON stream, calling `onMessage` for each complete line.
 *
 * Lines may be split across chunks; blank lines are skipped. A trailing line
 * without a newline is still delivered when the stream ends.
 *
 * @param body - Response body stream.
 * @param onMessage - Called with each parsed line, in order.
 */
export async function readRouteStream(
    body: ReadableStream<Uint8Array>,
    onMessage: (message: RouteStreamMessage) => void
): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    const flush = (text: string) => {
        const line = text.trim();
        if (line) onMessage(JSON.parse(line) as RouteStreamMessage);
    };

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });

        let newline = buffered.indexOf("\n");
        while (newline !== -1) {
            flush(buffered.slice(0, newline));
            buffered = buffered.slice(newline + 1);
            newline = buffered.indexOf("\n");
        }
    }

    flush(buffered + decoder.decode());
}

/** Handle returned by `createDelayedNotice`. */
export interface DelayedNotice {
    /** Starts the countdown; later calls while it runs or after it fired do nothing. */
    trigger(): void;
    /** Stops a pending countdown, so `show` is never called. */
    cancel(): void;
}

/**
 * Calls `show` once `delayMs` after the first `trigger()`, unless cancelled first.
 *
 * Used to explain a slow stage only when it really is slow: a cached river
 * lookup finishes in milliseconds and should not flash a message.
 *
 * @param delayMs - How long the stage may run before the notice appears.
 * @param show - Called at most once.
 */
export function createDelayedNotice(delayMs: number, show: () => void): DelayedNotice {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let used = false;

    return {
        trigger() {
            if (used) return;
            used = true;
            timer = setTimeout(show, delayMs);
        },
        cancel() {
            clearTimeout(timer);
            timer = undefined;
        },
    };
}
