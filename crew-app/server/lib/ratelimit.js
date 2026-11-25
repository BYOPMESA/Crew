/** Small fixed-window in-memory limiter. Fine for a single instance; Supabase Auth also rate-limits. */
export function createLimiter({ windowMs, max }) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.reset <= now) hits.delete(key);
  }, Math.max(windowMs, 60_000));
  timer.unref?.();

  return {
    hit(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.reset <= now) {
        hits.set(key, { count: 1, reset: now + windowMs });
        return { ok: true, retryAfterMs: 0 };
      }
      entry.count += 1;
      return { ok: entry.count <= max, retryAfterMs: entry.reset - now };
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
