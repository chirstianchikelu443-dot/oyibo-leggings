// JSON-store helper, backed by Upstash Redis (via Vercel's Storage integration)
// instead of the local filesystem. Vercel's filesystem is read-only/ephemeral at
// runtime, so any data written locally is lost on the next cold start or redeploy.
// This keeps the exact same readJSON / writeJSON / ensureFile function signatures
// as before — products-routes.js and settings-routes.js barely need to change.

const { Redis } = require("@upstash/redis");

// If you provisioned storage via Vercel's dashboard (Storage tab -> Create
// Database -> KV/Redis -> Connect to Project), it injects KV_REST_API_URL and
// KV_REST_API_TOKEN automatically. If you created a DB directly on upstash.com
// instead, swap these two env var names for UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN.
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// `key` replaces the old `filePath` argument — just a plain string identifier
// now (e.g. "products-data", "settings-data"), not a filesystem path.

async function readJSON(key) {
  const data = await redis.get(key);
  return data ?? [];
}

async function writeJSON(key, data) {
  await redis.set(key, data);
}

async function ensureFile(key, defaultValue) {
  const existing = await redis.get(key);
  if (existing === null || existing === undefined) {
    await redis.set(key, defaultValue);
  }
}

module.exports = { readJSON, writeJSON, ensureFile };
