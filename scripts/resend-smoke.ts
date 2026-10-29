// Resend integration smoke test (Task 13).
// 1. Enqueues a test email through the platform outbox (same code path as production flows).
// 2. Dispatches it via processOutbox (the exact function /api/cron/email-worker calls).
// 3. Prints the resulting outbox status + provider message id + delivery logs.
// Run: bun scripts/resend-smoke.ts
import { db } from '@/lib/db'
import { enqueueEmail, processOutbox } from '@/lib/email/outbox'
import { getEmailProvider } from '@/lib/email/provider'

const to = process.env.TEST_TO ?? 'delivered@resend.dev' // Resend's magic test address (always accepts)
const key = `smoke-resend-${Date.now()}`

async function main() {
  console.log('provider in use:', getEmailProvider().name)

  const job = await enqueueEmail({
    idempotencyKey: key,
    category: 'welcome',
    to,
    subject: 'Resend integration smoke test',
    html: '<div style="font-family:sans-serif;padding:24px"><h2>It works!</h2><p>This email was sent from the Entrepreneurship Club platform through the Resend API.</p></div>',
    text: 'Resend integration smoke test — it works!',
    relatedType: 'test',
  })
  console.log('enqueued:', job.idempotencyKey, 'status:', job.status)

  const summary = await processOutbox(5)
  console.log('worker summary:', JSON.stringify(summary))

  const after = await db.emailOutbox.findUnique({ where: { idempotencyKey: key } })
  if (!after) throw new Error('outbox row vanished?')
  console.log('final status:', after.status)
  console.log('providerMessageId:', after.providerMessageId)
  console.log('lastError:', after.lastError)

  const logs = await db.emailDeliveryLog.findMany({ where: { outboxId: after.id }, orderBy: { occurredAt: 'asc' } })
  for (const l of logs) console.log('log:', l.event, l.payload)

  await db.$disconnect()
  if (after.status !== 'sent') process.exit(1)
}

main().catch((err) => {
  console.error('SMOKE TEST FAILED:', err)
  process.exit(1)
})
