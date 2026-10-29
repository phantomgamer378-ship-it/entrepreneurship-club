// Task 25 — event banner upload. Multipart FormData → local upload store
// (upload/banners/) → returns a storage-relative URL served by /api/media.
// Storage lives OUTSIDE public/ so files survive rebuilds and are served
// dynamically (the standalone build bakes public/ at build time).
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { getUploadRoot } from '@/lib/media'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BANNER_DIR = 'banners'
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB — banner-sized, well under body limits
const ALLOWED_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.eventsCreate)) && !(await can(userId, PERMISSIONS.eventsUpdate))) {
      return fail(403, 'Not authorized to upload media.', 'forbidden')
    }

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return fail(422, 'A "file" field (image) is required.', 'validation_error')
    const ext = ALLOWED_TYPES[file.type]
    if (!ext) return fail(422, 'Only PNG, JPEG or WebP images are supported.', 'unsupported_media_type')
    if (file.size > MAX_BYTES) return fail(413, 'Image is larger than 4 MB.', 'payload_too_large')
    if (file.size < 64) return fail(422, 'File looks empty.', 'validation_error')

    const bytes = Buffer.from(await file.arrayBuffer())
    // PNG/JPEG/WebP magic-byte sniff — never trust the client MIME alone.
    const magicOk =
      (ext === 'png' && bytes[0] === 0x89 && bytes[1] === 0x50) ||
      (ext === 'jpg' && bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (ext === 'webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    if (!magicOk) return fail(422, 'File content does not match its image type.', 'invalid_image')

    const name = `${randomUUID()}.${ext}`
    const dir = path.join(getUploadRoot(), BANNER_DIR)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), bytes)

    const url = `/api/media/${BANNER_DIR}/${name}`
    await writeAudit({ event: 'media.uploaded', actorId: userId, targetType: 'banner', targetId: name, metadata: { bytes: file.size, type: file.type } })
    return ok({ ok: true, url, bytes: file.size, type: file.type })
  } catch (err) {
    return handleError(err)
  }
}
