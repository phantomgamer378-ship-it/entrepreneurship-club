// Moderation queue (§7): list reports, resolve/dismiss, soft-delete abusive messages.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.messagesModerate))) return fail(403, 'Not authorized.', 'forbidden')
    const status = new URL(req.url).searchParams.get('status') ?? 'open'
    const reports = await db.messageReport.findMany({
      where: status === 'all' ? {} : { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, reason: true, status: true, createdAt: true, resolvedAt: true,
        message: {
          select: {
            id: true, body: true, createdAt: true, isDeleted: true, reportCount: true,
            sender: { select: { fullName: true, profile: { select: { displayName: true, username: true } } } },
          },
        },
        reporter: { select: { fullName: true, profile: { select: { displayName: true } } } },
      },
    })
    return ok({ reports })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.messagesModerate))) return fail(403, 'Not authorized.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as { reportId?: string; action?: 'resolve' | 'dismiss' | 'delete_message' }
    if (!body.reportId || !body.action) return fail(400, 'reportId and action required', 'missing_param')
    const report = await db.messageReport.findUnique({ where: { id: body.reportId }, select: { id: true, messageId: true, status: true } })
    if (!report) return fail(404, 'Report not found', 'not_found')
    if (report.status !== 'open') return fail(409, 'Report already handled.', 'already_handled')

    if (body.action === 'delete_message') {
      await db.message.update({ where: { id: report.messageId }, data: { isDeleted: true } })
    }
    await db.messageReport.update({
      where: { id: report.id },
      data: { status: body.action === 'dismiss' ? 'dismissed' : 'resolved', resolvedBy: userId, resolvedAt: new Date() },
    })
    await writeAudit({ event: 'moderation.report_resolved', actorId: userId, targetType: 'message_report', targetId: report.id, metadata: { action: body.action } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
