import type { DataCollection } from '@sentry/core';

/**
 * Header, cookie and query-param name fragments SDK 10 denies by default: client IP and
 * proxy-chain names (`x-forwarded-for`, `x-real-ip`, `x-vercel-ip-*`, `remote-addr`, `via`,
 * `x-forwarded-user`, …). Copied from @sentry/core 10's `PII_HEADER_SNIPPETS`, which is not
 * exported (and is gone in 11). Wherever the SDK applies these lists it also filters its own
 * credential names (`auth`, `token`, `key`, `cookie`, …).
 */
const PII_NAME_SNIPPETS = ['forwarded', '-ip', 'remote-', 'via', '-user'];

/**
 * Categories SDK 11 adds, both permissive by default there. Routista uses neither MCP nor
 * message queues; they are pinned off so the policy stays complete after the upgrade.
 *
 * They are spread into the policy rather than written in its literal because SDK 10's
 * `DataCollection` type does not know them and would reject them as excess properties.
 * SDK 10's resolver ignores unknown keys, so they only take effect from SDK 11.
 */
const SDK11_CATEGORIES = {
    mcp: { inputs: false, outputs: false },
    queues: false,
};

/**
 * What the Sentry SDK may collect, shared by the client, server and edge configs.
 *
 * These are the values @sentry/nextjs 10 resolves when `sendDefaultPii` is unset, written
 * out so that behaviour no longer depends on the SDK's defaults:
 *
 * - SDK 11 removes `sendDefaultPii` and makes every category permissive by default: client
 *   IPs (`user.ip_address`), IP and proxy headers, cookies, and request/response bodies.
 * - On SDK 10, setting `dataCollection` at all switches every *omitted* key to that
 *   permissive base too. This object therefore has to stay complete: removing a key widens
 *   collection instead of restoring the old default. The type makes `tsc` fail when the SDK
 *   adds a category it does not set.
 *
 * On SDK 10 part of this is not enforced: server error events still carry the incoming
 * request body (`httpIntegration`'s `maxIncomingRequestBodySize`, default `'medium'`) and
 * the request headers and cookies, unfiltered apart from the IP headers. SDK 11 applies the
 * policy there too, so after the upgrade those events get narrower.
 *
 * Not governed by this object: the explicit `extra.ip` in `src/lib/apiRateLimit.ts`, and the
 * `query` and `locations` params of outgoing Radar requests, which reach breadcrumbs and
 * spans on both SDK versions.
 */
export const SENTRY_DATA_COLLECTION: Required<Omit<DataCollection, 'queryParams'>> = {
    userInfo: false,
    cookies: { deny: PII_NAME_SNIPPETS },
    httpHeaders: {
        request: { deny: PII_NAME_SNIPPETS },
        response: { deny: PII_NAME_SNIPPETS },
    },
    httpBodies: [],
    urlQueryParams: { deny: PII_NAME_SNIPPETS },
    // GraphQL documents have literal values redacted at collection time; SDK 10 always
    // attached them. Routista has no GraphQL, so this only preserves parity.
    graphQL: { document: true, variables: true },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: true,
    frameContextLines: 7,
    ...SDK11_CATEGORIES,
};
