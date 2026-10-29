// PRD §9 — platform automations. Every job logs a full lifecycle record to
// automation_runs (running → success|failed with affected_count), extending the
// Phase 4 cron pattern. Jobs are idempotent; schedules are enforced by the caller
// (cron runner) and documented in docs/AUTOMATIONS.md:
//   auto-archive-past-events          0 2 * * *
//   auto-expire-scoped-permissions    *\/15 * * * *
//   meeting-lifecycle-sweep           *\/5 * * * *
//   stale-application-digest          0 9 * * *
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'

export type JobName =
  | 'auto-archive-past-events'
  | 'auto-expire-scoped-permissions'
  | 'meeting-lifecycle-sweep'
  | 'stale-application-digest'

export const JOB_NAMES: JobName[] = [
  'auto-archive-past-events',
  'auto-expire-scoped-permissions',
  'meeting-lifecycle-sweep',
  'stale-application-digest',
]

export const JOB_SCHEDULES: Record<JobName, string> = {
  'auto-archive-past-events': '0 2 * * *',
  'auto-expire-scoped-permissions': '*/15 * * * *',
  'meeting-lifecycle-sweep': '*/5 * * * *',
  'stale-application-digest': '0 9 * * *',
}

// ───────────────────────────── Job implementations ─────────────────────────────

/** Events that ended ≥ 7 days ago and are still 'published' → 'archived'. */
export async function autoArchivePastEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 3600_000)
  const result = await db.clubEvent.updateMany({
    where: { endsAt: { lt: cutoff }, status: 'published', deletedAt: null },
    data: { status: 'archived' },
  })
  return result.count
}

/** Expired scoped per-user permissions are deleted and audited (system-initiated). */
export async function autoExpireScopedPermissions(): Promise<number> {
  const expired = await db.userPermission.findMany({
    where: { expiresAt: { lte: new Date() } },
    select: { id: true, userId: true, scope: true, permission: { select: { key: true } } },
  })
  for (const grant of expired) {
    await db.userPermission.delete({ where: { id: grant.id } })
    await writeAudit({
      event: 'admin.permission_revoked',
      actorId: null, // system-initiated expiry
      targetType: 'user_permission',
      targetId: grant.id,
      metadata: { userId: grant.userId, permission: grant.permission.key, scope: grant.scope, reason: 'expired' },
    })
  }
  return expired.length
}

/** Room lifecycle: scheduled→live once started; scheduled/live→ended once past endsAt. */
export async function meetingLifecycleSweep(): Promise<number> {
  const now = new Date()
  const toLive = await db.videoRoom.updateMany({
    where: { status: 'scheduled', startsAt: { lte: now } },
    data: { status: 'live' },
  })
  const toEnded = await db.videoRoom.updateMany({
    where: { status: { in: ['scheduled', 'live'] }, endsAt: { lt: now } },
    data: { status: 'ended' },
  })
  return toLive.count + toEnded.count
}

/**
 * ONE digest email per day listing all applications pending > 48h — not one email
 * per application. Idempotency key is the digest date, so cron retries never
 * duplicate the send.
 */
export async function staleApplicationDigest(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 48 * 3600_000)
  const stale = await db.memberApplication.findMany({
    where: { status: 'pending', createdAt: { lt: cutoff } },
    orderBy: { createdAt: 'asc' },
    select: { reference: true, fullName: true, email: true, createdAt: true },
  })
  if (stale.length === 0) return 0

  const reviewers = await db.user.findMany({
    where: {
      isActive: true,
      suspendedAt: null,
      userRoles: {
        some: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          role: {
            rolePermissions: {
              some: { permission: { key: 'applications.review' } },
            },
          },
        },
      },
    },
    select: { email: true },
  })

  const digestDate = now.toISOString().slice(0, 10)
  const items = stale.map((a) => ({
    reference: a.reference,
    fullName: a.fullName,
    email: a.email,
    waitingDays: Math.floor((now.getTime() - a.createdAt.getTime()) / 86_400_000),
  }))
  const tpl = templates.staleApplicationsDigest(items)
  let queued = 0
  for (const reviewer of reviewers) {
    const existing = await db.emailOutbox.findUnique({
      where: { idempotencyKey: `digest:stale-applications:${digestDate}:${reviewer.email}` },
    })
    if (existing) continue
    await enqueueEmail({
      idempotencyKey: `digest:stale-applications:${digestDate}:${reviewer.email}`,
      category: 'ops_alert',
      to: reviewer.email,
      subject: tpl.subject,
      html: tpl.html,
      text: `${items.length} membership applications pending > 48h. Review in the admin panel.`,
      relatedType: 'member_application',
    })
    queued++
  }
  return queued
}

// ───────────────────────────── Runner with automation_runs logging ─────────────────────────────

const JOBS: Record<JobName, () => Promise<number>> = {
  'auto-archive-past-events': autoArchivePastEvents,
  'auto-expire-scoped-permissions': autoExpireScopedPermissions,
  'meeting-lifecycle-sweep': meetingLifecycleSweep,
  'stale-application-digest': staleApplicationDigest,
}

export type JobRunResult = {
  job: JobName
  runId: number
  status: 'success' | 'failed'
  affectedCount?: number
  notes?: string
}

/** Executes one job inside an automation_runs lifecycle record (PRD §9). */
export async function runJob(job: JobName): Promise<JobRunResult> {
  const run = await db.automationRun.create({
    data: { jobName: job, status: 'running' },
  })
  try {
    const affectedCount = await JOBS[job]()
    await db.automationRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: 'success', affectedCount },
    })
    return { job, runId: run.id, status: 'success', affectedCount }
  } catch (err) {
    const notes = err instanceof Error ? err.message : String(err)
    await db.automationRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: 'failed', notes: notes.slice(0, 500) },
    })
    return { job, runId: run.id, status: 'failed', notes }
  }
}
