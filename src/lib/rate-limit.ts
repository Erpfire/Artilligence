// Use globalThis to survive Next.js HMR — ensures resetAll() clears the same map
// that checkRateLimit() reads from, even after hot module replacement.
const globalKey = "__rate_limit_attempts__";
const g = globalThis as Record<string, unknown>;
if (!g[globalKey]) {
  g[globalKey] = new Map<string, { count: number; firstAttempt: number }>();
}
const attempts = g[globalKey] as Map<string, { count: number; firstAttempt: number }>;

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: now });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.firstAttempt);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

export function resetRateLimit(key: string) {
  attempts.delete(key);
}

export function resetAll() {
  attempts.clear();
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  attempts.forEach((entry, key) => {
    if (now - entry.firstAttempt > WINDOW_MS) {
      attempts.delete(key);
    }
  });
}, 5 * 60 * 1000).unref();
