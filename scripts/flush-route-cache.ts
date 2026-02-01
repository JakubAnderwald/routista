/**
 * Flush route cache entries from Upstash Redis.
 *
 * Usage:
 *   npx tsx scripts/flush-route-cache.ts
 *
 * Requires KV_REST_API_URL and KV_REST_API_TOKEN in .env.local
 * (run `vercel env pull .env.local` from the main repo root first).
 */

import { config } from "dotenv";
import { Redis } from "@upstash/redis";

config({ path: ".env.local" });

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    "Missing Redis credentials. Set KV_REST_API_URL and KV_REST_API_TOKEN in .env.local\n" +
      "Run: vercel env pull .env.local --environment=production"
  );
  process.exit(1);
}

const redis = new Redis({ url, token });

async function flush() {
  let cursor = 0;
  let deleted = 0;

  do {
    const [nextCursor, keys] = (await redis.scan(cursor, {
      match: "route:*",
      count: 100,
    })) as [number, string[]];

    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }

    cursor = nextCursor;
  } while (cursor !== 0);

  if (deleted === 0) {
    console.log("No route cache keys found.");
  } else {
    console.log(`Deleted ${deleted} route cache key(s).`);
  }
}

flush().catch((err) => {
  console.error("Failed to flush cache:", err);
  process.exit(1);
});
