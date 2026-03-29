import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";

type RateLimitEntry = {
  count: number;
  firstAttempt: number;
};

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const globalKey = "__rate_limit_attempts__";
const rateLimitStorePath =
  process.env.NODE_ENV === "production"
    ? null
    : process.env.RATE_LIMIT_STORE_PATH ?? "/tmp/artilligence-rate-limit.json";

const g = globalThis as Record<string, unknown>;

if (!g[globalKey]) {
  g[globalKey] = new Map<string, RateLimitEntry>();
}

function getMemoryStore() {
  return g[globalKey] as Map<string, RateLimitEntry>;
}

function pruneStaleEntries(entries: Record<string, RateLimitEntry>, now: number) {
  for (const [key, entry] of Object.entries(entries)) {
    if (now - entry.firstAttempt > WINDOW_MS) {
      delete entries[key];
    }
  }
}

function readRateLimitStore(): Record<string, RateLimitEntry> {
  if (!rateLimitStorePath) {
    return Object.fromEntries(getMemoryStore());
  }

  try {
    const raw = readFileSync(rateLimitStorePath, "utf-8").trim();
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, RateLimitEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRateLimitStore(entries: Record<string, RateLimitEntry>) {
  if (!rateLimitStorePath) {
    const store = getMemoryStore();
    store.clear();
    for (const [key, entry] of Object.entries(entries)) {
      store.set(key, entry);
    }
    return;
  }

  mkdirSync(dirname(rateLimitStorePath), { recursive: true });
  writeFileSync(rateLimitStorePath, JSON.stringify(entries), "utf-8");
}

export function checkRateLimit(
  key: string
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entries = readRateLimitStore();
  pruneStaleEntries(entries, now);

  const entry = entries[key];

  if (!entry) {
    entries[key] = { count: 1, firstAttempt: now };
    writeRateLimitStore(entries);
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    writeRateLimitStore(entries);
    return {
      allowed: false,
      retryAfterMs: WINDOW_MS - (now - entry.firstAttempt),
    };
  }

  entries[key] = { ...entry, count: entry.count + 1 };
  writeRateLimitStore(entries);
  return { allowed: true };
}

export function resetRateLimit(key: string) {
  const entries = readRateLimitStore();
  delete entries[key];
  writeRateLimitStore(entries);
}

export function resetAll() {
  writeRateLimitStore({});
}

if (!rateLimitStorePath) {
  setInterval(() => {
    const now = Date.now();
    const entries = Object.fromEntries(getMemoryStore());
    pruneStaleEntries(entries, now);
    writeRateLimitStore(entries);
  }, 5 * 60 * 1000).unref();
}
