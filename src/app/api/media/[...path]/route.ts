// Task 25 — dynamic media serving for the local upload store (upload/).
// The standalone production build bakes public/ at build time, so user
// uploads must be served by an API route. Filenames are server-generated
// UUIDs and the path is strictly sanitized (no traversal, no dotfiles).
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fail } from '@/lib/api'
import { getUploadRoot } from '@/lib/media'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await params
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 4) {
    return fail(404, 'Not found', 'not_found')
  }
  // Strict sanitization: each segment must be a simple safe name.
  for (const seg of segments) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(seg) || seg.includes('..')) {
      return fail(404, 'Not found', 'not_found')
    }
  }
  const abs = path.join(getUploadRoot(), ...segments)
  if (!abs.startsWith(getUploadRoot() + path.sep)) return fail(404, 'Not found', 'not_found')

  try {
    const st = await stat(abs)
    if (!st.isFile()) return fail(404, 'Not found', 'not_found')
    const type = TYPES[path.extname(abs).toLowerCase()]
    if (!type) return fail(404, 'Not found', 'not_found')
    const body = await readFile(abs)
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(st.size),
        'Cache-Control': 'public, max-age=31536000, immutable', // UUID names never change
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail(404, 'Not found', 'not_found')
  }
}
