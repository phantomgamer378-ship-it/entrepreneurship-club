// PRD §7.7 — admin-end-meeting: force-end a live meeting for every participant.
// Guard: video.end_for_all (Super-Admin-exclusive). Broadcasts a realtime control
// event so connected clients disconnect immediately.
import { ok, handleError, auth } from '@/lib/api'
import { endMeetingForAll } from '@/lib/admin/end-meeting'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id } = await params
    await endMeetingForAll(userId, id)
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
