// Newsletter subscriber management (Task 25): list and admin-removal.
// Same visibility level as the email center (membersRead). Removal is a soft
// unsubscribe — the address stays deduplicated by its unique email and the
// tokenized unsubscribe link keeps working if the subscriber clicks it again.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const [subscribers, active, total] = await Promise.all([
      db.newsletterSubscriber.findMany({
        orderBy: { subscribedAt: 'desc' },
        take: 200,
        select: {
          id: true, email: true, isActive: true, source: true,
          subscribedAt: true, unsubscribedAt: true,
        },
      }),
      db.newsletterSubscriber.count({ where: { isActive: true } }),
      db.newsletterSubscriber.count(),
    ])
    return ok({ subscribers, active, total })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id ?? '')
    const action = String(body.action ?? '')
    if (!id || !['deactivate', 'reactivate'].includes(action)) return fail(422, 'A subscriber id and a valid action are required.', 'validation_error')

    const subscriber = await db.newsletterSubscriber.findUnique({ where: { id } })
    if (!subscriber) return fail(404, 'Subscriber not found', 'not_found')

    const updated = await db.newsletterSubscriber.update({
      where: { id },
      data:
        action === 'deactivate'
          ? { isActive: false, unsubscribedAt: new Date() }
          : { isActive: true, unsubscribedAt: null },
      select: { id: true, email: true, isActive: true },
    })
    await writeAudit({
      event: action === 'deactivate' ? 'newsletter.admin_removed' : 'newsletter.admin_reactivated',
      actorId: userId,
      targetType: 'newsletter_subscriber',
      targetId: id,
      metadata: { email: subscriber.email },
    })
    return ok({ ok: true, subscriber: updated })
  } catch (err) {
    return handleError(err)
  }
}
