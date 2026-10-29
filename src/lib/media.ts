// Section 25.3 — upload contract enforcement (adapted to decision D6, URL-reference
// media): `avatarUrl` / `posterUrl` / gallery fields on NON-seed rows must only ever
// reference allow-listed media hosts (today: the club's storage; after the documented
// Supabase Storage migration, the storage bucket host). A raw external URL from an
// unknown host on a non-seed row is REJECTED at the application write path — the same
// class of defect as the stock-photo seed incident, prevented structurally.
// Seed/demo rows are exempt (placeholders allowed) but can never render publicly.

export const MEDIA_HOST_ALLOWLIST = (process.env.MEDIA_HOST_ALLOWLIST ?? 'res.cloudinary.com')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

// Storage-relative media paths served by the first-party /api/media route
// (Task 25 banner uploads). These never leave the app's own storage root.
export const STORAGE_RELATIVE_PREFIXES = ['/api/media/']

import path from 'node:path'

// The standalone production server runs with cwd = .next/standalone, so a bare
// `process.cwd()` would scatter uploads inside the build dir (wiped on rebuild).
// Anchor on the real project root instead.
export function getUploadRoot(): string {
  const cwd = process.cwd()
  if (cwd.includes(`${path.sep}.next${path.sep}standalone`)) {
    return path.resolve(cwd, '..', '..', 'upload')
  }
  return path.join(cwd, 'upload')
}

export function isAllowedMediaUrl(url: string): boolean {
  // Storage-relative URLs (e.g. /api/media/banners/x.png) are always fine —
  // they reference this deployment's own upload store.
  if (STORAGE_RELATIVE_PREFIXES.some((p) => url.startsWith(p))) return true
  try {
    const host = new URL(url).hostname.toLowerCase()
    return MEDIA_HOST_ALLOWLIST.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
  } catch {
    return false // not a parseable URL at all
  }
}

/**
 * Validates media URL fields for a row about to be written.
 * Throws when a non-seed row carries a raw external URL outside the allow-list.
 */
export function assertMediaContract(row: {
  isSeedData?: boolean | null
  avatarUrl?: string | null
  posterUrl?: string | null
  gallery?: string | null
}): void {
  if (row.isSeedData) return // seed/demo rows are exempt from the upload contract
  const fields: [string, string | null | undefined][] = [
    ['avatarUrl', row.avatarUrl],
    ['posterUrl', row.posterUrl],
  ]
  for (const [field, value] of fields) {
    if (!value) continue
    if (!isAllowedMediaUrl(value)) {
      throw new Error(
        `Upload contract violation (Section 25.3): ${field} on a non-seed row must be a storage-relative or allow-listed media URL — got external URL "${value.slice(0, 80)}". ` +
          `Seed rows are exempt; production rows must upload through storage.`
      )
    }
  }
  if (row.gallery) {
    try {
      const items = JSON.parse(row.gallery) as unknown
      if (Array.isArray(items)) {
        for (const item of items) {
          if (typeof item === 'string' && !isAllowedMediaUrl(item)) {
            throw new Error(`Upload contract violation (Section 25.3): gallery contains an external URL outside the allow-list.`)
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Upload contract')) throw err
      // malformed JSON is handled by the schema layer, not here
    }
  }
}
