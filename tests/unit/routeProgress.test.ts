import { describe, it, expect, vi, afterEach } from "vitest";
import {
    createDelayedNotice,
    encodeRouteStreamMessage,
    readRouteStream,
    RouteStreamMessage,
} from "@/lib/routeProgress";

/** A body stream that yields each string as its own chunk. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
            controller.close();
        },
    });
}

async function collect(chunks: string[]): Promise<RouteStreamMessage[]> {
    const messages: RouteStreamMessage[] = [];
    await readRouteStream(streamOf(chunks), message => messages.push(message));
    return messages;
}

describe("routeProgress", () => {
    describe("encodeRouteStreamMessage", () => {
        it("writes one JSON line", () => {
            expect(encodeRouteStreamMessage({ type: "progress", stage: "river-check" }))
                .toBe('{"type":"progress","stage":"river-check"}\n');
        });
    });

    describe("readRouteStream", () => {
        it("parses lines in order", async () => {
            const lines = [
                encodeRouteStreamMessage({ type: "progress", stage: "river-check" }),
                encodeRouteStreamMessage({ type: "error", error: "boom" }),
            ];
            expect(await collect(lines)).toEqual([
                { type: "progress", stage: "river-check" },
                { type: "error", error: "boom" },
            ]);
        });

        it("joins a line split across chunks and handles several lines in one chunk", async () => {
            const text =
                encodeRouteStreamMessage({ type: "progress", stage: "river-check" }) +
                encodeRouteStreamMessage({ type: "error", error: "x" });
            expect(await collect([text.slice(0, 7), text.slice(7, 50), text.slice(50)])).toHaveLength(2);
        });

        it("skips blank lines and delivers a final line without a newline", async () => {
            expect(await collect(["\n  \n", '{"type":"error","error":"last"}'])).toEqual([
                { type: "error", error: "last" },
            ]);
        });

        it("delivers nothing for an empty stream", async () => {
            expect(await collect([])).toEqual([]);
        });

        it("decodes multi-byte characters split across chunks", async () => {
            const bytes = new TextEncoder().encode('{"type":"error","error":"Brücke"}\n');
            const split = bytes.indexOf(0xc3) + 1;
            const messages: RouteStreamMessage[] = [];
            await readRouteStream(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(bytes.slice(0, split));
                        controller.enqueue(bytes.slice(split));
                        controller.close();
                    },
                }),
                message => messages.push(message)
            );
            expect(messages).toEqual([{ type: "error", error: "Brücke" }]);
        });
    });

    describe("createDelayedNotice", () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it("shows after the delay", () => {
            vi.useFakeTimers();
            const show = vi.fn();
            const notice = createDelayedNotice(3000, show);

            notice.trigger();
            vi.advanceTimersByTime(2999);
            expect(show).not.toHaveBeenCalled();
            vi.advanceTimersByTime(1);
            expect(show).toHaveBeenCalledTimes(1);
        });

        it("never shows if cancelled first", () => {
            vi.useFakeTimers();
            const show = vi.fn();
            const notice = createDelayedNotice(3000, show);

            notice.trigger();
            notice.cancel();
            vi.advanceTimersByTime(10_000);
            expect(show).not.toHaveBeenCalled();
        });

        it("ignores repeated triggers and cancel without trigger", () => {
            vi.useFakeTimers();
            const show = vi.fn();
            const notice = createDelayedNotice(1000, show);

            notice.cancel();
            notice.trigger();
            vi.advanceTimersByTime(600);
            notice.trigger();
            vi.advanceTimersByTime(400);
            notice.trigger();
            vi.advanceTimersByTime(5000);
            expect(show).toHaveBeenCalledTimes(1);
        });
    });
});
