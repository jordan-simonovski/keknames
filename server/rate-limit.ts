/** Fixed-window limiter with bounded bookkeeping, including for untrusted address keys. */
export function windowLimiter(limit: number, windowMs: number, maxKeys = 10_000) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (buckets.size >= maxKeys) {
        for (const [id, entry] of buckets) if (entry.resetAt <= now) buckets.delete(id);
        if (!buckets.has(key) && buckets.size >= maxKeys) return false;
      }
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;
    return bucket.count <= limit;
  };
}
