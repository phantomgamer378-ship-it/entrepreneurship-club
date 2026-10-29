// PRD §7.4 — admin-manage-announcement: delete (soft) / force-unpublish any
// announcement, beyond normal author scope. Guard: announcements.delete.
// NOTE: already-sent emails cannot be recalled — the admin UI states this explicitly
// in its confirmation dialog; sent outbox rows are intentionally untouched.
import { ok, handleError, parseBody, auth } from '@/lib/api'
import { adminManageAnnouncementSchema } from '@/lib/validations'
import { manageAnnouncement } from '@/lib/admin/manage-announcement'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id } = await params
    const input = await parseBody(req, adminManageAnnouncementSchema)
    await manageAnnouncement(userId, id, input.action, input.reason)
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
