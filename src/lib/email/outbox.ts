// Email outbox (§11): business operations persist records FIRST, then enqueue email jobs.
// - Idempotency keys prevent duplicate sends across retries and concurrent callers.
// - Bounded retries with exponential backoff; permanent failure → status 'dead'.
// - Provider acceptance ≠ delivery: webhooks drive final delivery states.
import { db } from '@/lib/db'
import { getEmailProvider } from '@/lib/email/provider'

export type EnqueueInput = {
  idempotencyKey: string
  category: string
  to: string
  subject: string
  html: string
  text: string
  relatedType?: string
  relatedId?: string
  maxAttempts?: number
}

/** Enqueues a job. Safe to call twice with the same key — returns the existing job.
 *  A background worker pass is kicked automatically so legit mail is SENT right
 *  away instead of sitting queued until the next cron tick. */
export async function enqueueEmail(input: EnqueueInput) {
  const existing = await db.emailOutbox.findUnique({ where: { idempotencyKey: input.idempotencyKey } })
  if (existing) return existing
  const job = await db.emailOutbox.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      category: input.category,
      toEmail: input.to,
      subject: input.subject,
      bodyHtml: input.html,
      bodyText: input.text,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      maxAttempts: input.maxAttempts ?? 5,
    },
  })
  kickOutboxWorker()
  return job
}

/**
 * Fire-and-forget outbox pass. The app runs as a long-lived Node server, so the
 * floating promise completes reliably after the HTTP response is returned; the
 * /api/cron/email-worker route remains the backstop for retries/backoff.
 */
export function kickOutboxWorker(limit = 10) {
  void processOutbox(limit).catch((err) => {
    console.error('[email] background outbox pass failed:', err)
  })
}

const BACKOFF_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]

/**
 * Processes due outbox jobs. Returns a summary for the admin email dashboard.
 * Called automatically after every enqueue/retry (kickOutboxWorker) and by the
 * cron worker endpoint.
 */
export async function processOutbox(limit = 10): Promise<{ processed: number; sent: number; failed: number; dead: number }> {
  const provider = getEmailProvider()
  const now = new Date()

  // Reclaim jobs stuck in 'sending' (e.g. process died between claim and provider
  // response). 5 minutes is far beyond normal provider latency; the provider-side
  // idempotency key prevents a double send for the edge case.
  await db.emailOutbox.updateMany({
    where: { status: 'sending', updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) } },
    data: { status: 'queued', nextAttemptAt: new Date(now.getTime() - 1) },
  })

  const due = await db.emailOutbox.findMany({
    where: { status: { in: ['queued', 'failed'] }, nextAttemptAt: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  let sent = 0
  let failed = 0
  let dead = 0

  for (const job of due) {
    // Atomically claim the job to avoid double-send across concurrent workers.
    const claimed = await db.emailOutbox.updateMany({
      where: { id: job.id, status: { in: ['queued', 'failed'] } },
      data: { status: 'sending', attempts: { increment: 1 } },
    })
    if (claimed.count === 0) continue

    const attemptNo = job.attempts + 1
    try {
      const result = await provider.send({
        to: job.toEmail,
        subject: job.subject,
        html: job.bodyHtml,
        text: job.bodyText,
        idempotencyKey: job.idempotencyKey,
      })

      if (result.accepted) {
        await db.emailOutbox.update({
          where: { id: job.id },
          data: { status: 'sent', sentAt: new Date(), providerMessageId: result.providerMessageId, lastError: null },
        })
        await db.emailDeliveryLog.create({
          data: {
            outboxId: job.id,
            event: 'send_attempt',
            payload: JSON.stringify({ attempt: attemptNo, provider: result.provider, result: 'accepted' }),
          },
        })
        sent++
      } else {
        throw new Error(result.error ?? 'provider_rejected')
      }
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err).slice(0, 500)
      const attemptsUsed = attemptNo
      const isDead = attemptsUsed >= job.maxAttempts
      const backoff = BACKOFF_MS[Math.min(attemptsUsed, BACKOFF_MS.length - 1)] || 60_000
      await db.emailOutbox.update({
        where: { id: job.id },
        data: {
          status: isDead ? 'dead' : 'failed',
          lastError: message,
          nextAttemptAt: new Date(Date.now() + backoff),
        },
      })
      await db.emailDeliveryLog.create({
        data: {
          outboxId: job.id,
          event: isDead ? 'send_failed' : 'send_attempt',
          payload: JSON.stringify({ attempt: attemptsUsed, error: message, dead: isDead }),
        },
      })
      if (isDead) {
        dead++
        const { writeAudit } = await import('@/lib/audit')
        await writeAudit({
          event: 'email.delivery_failed',
          metadata: { outboxId: job.id, category: job.category, to: job.toEmail, error: message },
        })
      } else {
        failed++
      }
    }
  }

  return { processed: due.length, sent, failed, dead }
}

/** Manual retry from the admin panel — only eligible for failed/dead jobs. */
export async function retryEmail(outboxId: string): Promise<boolean> {
  const job = await db.emailOutbox.findUnique({ where: { id: outboxId } })
  if (!job || !['failed', 'dead'].includes(job.status)) return false
  await db.emailOutbox.update({
    where: { id: outboxId },
    data: { status: 'queued', nextAttemptAt: new Date(Date.now() - 1), lastError: null },
  })
  kickOutboxWorker()
  const { writeAudit } = await import('@/lib/audit')
  await writeAudit({ event: 'email.retried', metadata: { outboxId } })
  return true
}
