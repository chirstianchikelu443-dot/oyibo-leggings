// Basic in-memory login rate limiter — good enough for a single small server.
// Blocks an IP after too many wrong-password attempts in a time window.

const attempts = new Map(); // ip -> { count, firstAttemptAt }

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now - entry.firstAttemptAt > WINDOW_MS) {
    attempts.set(ip, { count: 0, firstAttemptAt: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.firstAttemptAt);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip) {
  const entry = attempts.get(ip) || { count: 0, firstAttemptAt: Date.now() };
  entry.count += 1;
  attempts.set(ip, entry);
}

function resetAttempts(ip) {
  attempts.delete(ip);
}

module.exports = { checkRateLimit, recordFailedAttempt, resetAttempts };
