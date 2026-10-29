import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    const unread = notifications.filter((n) => !n.readAt).length
    return ok({ notifications, unread })
  } catch (err) {
    return handleError(err)
  }
}

/** Mark one ({ id }) or all ({ all: true }) notifications as read. */
export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    const body = (await req.json().catch(() => ({}))) as { id?: string; all?: boolean }
    if (body.all) {
      await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
    } else if (body.id) {
      const n = await db.notification.findUnique({ where: { id: body.id }, select: { userId: true } })
      if (!n || n.userId !== userId) return fail(404, 'Notification not found', 'not_found')
      await db.notification.update({ where: { id: body.id }, data: { readAt: new Date() } })
    }
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
