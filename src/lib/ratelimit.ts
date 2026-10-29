// In-memory sliding-window rate limiter (sandbox single-instance deployment).
// For multi-instance production, move to a shared store — documented in docs/SECURITY.md.

type Bucket = { hits: number[] }

const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 15 * 60_000)
    if (bucket.hits.length === 0) buckets.delete(key)
  }
}

/**
 * Returns true when the action is allowed.
 * Pure counting logic is exported for tests via checkAndConsumeWithNow.
 */
export function checkAndConsumeWithNow(
  key: string,
  limit: number,
  windowMs: number,
  now: number
): boolean {
  sweep(now)
  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs)
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    return false
  }
  bucket.hits.push(now)
  buckets.set(key, bucket)
  return true
}

export function checkAndConsume(key: string, limit: number, windowMs: number): boolean {
  return checkAndConsumeWithNow(key, limit, windowMs, Date.now())
}

export function resetLimiter(key?: string) {
  if (key) buckets.delete(key)
  else buckets.clear()
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}
