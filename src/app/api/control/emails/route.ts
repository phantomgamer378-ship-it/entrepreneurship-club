// Email outbox dashboard (§7): queue status, failures, retry.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { retryEmail } from '@/lib/email/outbox'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const status = new URL(req.url).searchParams.get('status') ?? 'all'
    const [jobs, counts] = await Promise.all([
      db.emailOutbox.findMany({
        where: status === 'all' ? {} : { status },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true, category: true, toEmail: true, subject: true, status: true,
          attempts: true, maxAttempts: true, nextAttemptAt: true, lastError: true,
          providerMessageId: true, createdAt: true, sentAt: true,
        },
      }),
      db.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    ])
    const recentLogs = await db.emailDeliveryLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: 30,
      select: { id: true, outboxId: true, event: true, payload: true, occurredAt: true },
    })
    return ok({ jobs, counts: counts.map((c) => ({ status: c.status, count: c._count._all })), recentLogs })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as { outboxId?: string }
    if (!body.outboxId) return fail(400, 'outboxId required', 'missing_param')
    const done = await retryEmail(body.outboxId)
    if (!done) return fail(409, 'Only failed or dead jobs can be retried.', 'not_retryable')
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
