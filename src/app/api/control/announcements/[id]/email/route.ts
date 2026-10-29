// Announcement email fanout (§13 steps 6–9). Explicit, confirmed bulk-send step.
// Recipients respect email preferences (opt-out) and the announcement audience.
// Unique recipient rows prevent duplicate campaigns; the outbox idempotency key
// guarantees a retried job never double-sends (§21 test).
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail, processOutbox } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.announcementsEmailSend))) {
      return fail(403, 'Not authorized to send announcement emails.', 'forbidden')
    }
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { confirm?: boolean }
    if (!body.confirm) {
      return fail(400, 'Bulk send requires explicit confirmation (confirm: true).', 'confirmation_required')
    }

    const announcement = await db.announcement.findUnique({ where: { id } })
    if (!announcement) return fail(404, 'Announcement not found', 'not_found')
    if (announcement.status !== 'published') {
      return fail(409, 'Publish the announcement before emailing it.', 'not_published')
    }

    // Resolve eligible recipients by audience + active status + opt-in preferences.
    const roleFilter =
      announcement.audience === 'leads'
        ? ['club_lead', 'club_president', 'faculty_advisor', 'admin', 'super_admin']
        : ['pending_member', 'member', 'club_lead', 'club_president', 'faculty_advisor', 'admin', 'super_admin']

    const roles = await db.role.findMany({ where: { key: { in: roleFilter } }, select: { id: true } })
    const userRoles = await db.userRole.findMany({
      where: { roleId: { in: roles.map((r) => r.id) } },
      select: { userId: true },
    })
    const userIds = [...new Set(userRoles.map((u) => u.userId))]
    const users = await db.user.findMany({
      where: { id: { in: userIds }, isActive: true, suspendedAt: null },
      select: { id: true, email: true, emailPreference: { select: { announcementEmails: true } } },
    })
    const eligible = users.filter((u) => u.emailPreference?.announcementEmails !== false)

    let created = 0
    for (const u of eligible) {
      const existing = await db.announcementRecipient.findUnique({
        where: { announcementId_email: { announcementId: announcement.id, email: u.email } },
      })
      if (existing) continue
      const tpl = templates.announcement(announcement.title, announcement.body)
      const job = await enqueueEmail({
        idempotencyKey: `announcement-${announcement.id}-${u.email}`,
        category: 'announcement',
        to: u.email,
        subject: announcement.title,
        html: tpl.html,
        text: announcement.body.slice(0, 4000),
        relatedType: 'announcement',
        relatedId: announcement.id,
      })
      await db.announcementRecipient.create({
        data: { announcementId: announcement.id, userId: u.id, email: u.email, outboxId: job.id, status: 'queued' },
      })
      created++
    }

    await writeAudit({
      event: 'announcement.email_queued',
      actorId: userId,
      targetType: 'announcement',
      targetId: announcement.id,
      metadata: { recipients: eligible.length, created },
    })

    // Opportunistic first processing pass; cron worker handles the rest.
    const result = await processOutbox(25)
    // Sync recipient status from outbox results.
    const recipients = await db.announcementRecipient.findMany({
      where: { announcementId: announcement.id },
      select: { id: true, outboxId: true },
    })
    for (const r of recipients) {
      if (!r.outboxId) continue
      const job = await db.emailOutbox.findUnique({ where: { id: r.outboxId }, select: { status: true } })
      if (job) {
        const status = job.status === 'sent' ? 'sent' : job.status === 'dead' ? 'failed' : 'queued'
        await db.announcementRecipient.update({ where: { id: r.id }, data: { status } })
      }
    }
    if (announcement.emailSentAt === null) {
      await db.announcement.update({ where: { id: announcement.id }, data: { emailSentAt: new Date() } })
    }

    return ok({ ok: true, recipients: eligible.length, createdNow: created, worker: result })
  } catch (err) {
    return handleError(err)
  }
}
