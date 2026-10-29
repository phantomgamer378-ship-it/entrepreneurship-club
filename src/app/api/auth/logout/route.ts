import { ok, handleError } from '@/lib/api'
import { clearSessionCookie, getSessionUserId } from '@/lib/auth/session'
import { writeAudit } from '@/lib/audit'

export async function POST() {
  try {
    const userId = await getSessionUserId()
    await clearSessionCookie()
    if (userId) await writeAudit({ event: 'auth.logout', actorId: userId })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
