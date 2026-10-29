// PRD §7.5 — admin-manage-event: delete (soft) / force-cancel / manual registrant
// add+remove. Guards: events.delete for lifecycle overrides, events.registrations.manage
// for registrant edits. Duplicate-registration and capacity constraints still apply.
import { ok, handleError, parseBody, auth } from '@/lib/api'
import { adminManageEventSchema } from '@/lib/validations'
import { manageEvent } from '@/lib/admin/manage-event'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id } = await params
    const input = await parseBody(req, adminManageEventSchema)
    const result = await manageEvent(userId, { eventId: id, ...input })
    return ok({ ok: true, ...result })
  } catch (err) {
    return handleError(err)
  }
}
