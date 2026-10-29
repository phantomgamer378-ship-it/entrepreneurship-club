// Audit log viewer (§7): audit.read required. Never contains secrets/message contents
// (sanitization happens at write time — see src/lib/audit.ts).
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.auditRead))) return fail(403, 'Not authorized.', 'forbidden')
    const url = new URL(req.url)
    const event = url.searchParams.get('event') ?? ''
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = 50

    const [total, logs] = await Promise.all([
      db.auditLog.count({ where: event ? { event } : {} }),
      db.auditLog.findMany({
        where: event ? { event } : {},
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, event: true, actorEmail: true, targetType: true, targetId: true,
          metadata: true, ip: true, createdAt: true,
          actor: { select: { fullName: true } },
        },
      }),
    ])
    const events = await db.auditLog.groupBy({ by: ['event'], _count: { _all: true } })
    return ok({
      total,
      page,
      pageSize,
      logs,
      eventSummary: events.map((e) => ({ event: e.event, count: e._count._all })).sort((a, b) => b.count - a.count),
    })
  } catch (err) {
    return handleError(err)
  }
}
