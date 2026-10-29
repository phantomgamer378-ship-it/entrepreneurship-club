// Task 15 verification: enqueue ONLY (no processOutbox call) — the fixed
// enqueueEmail should kick the background worker and this job must reach
// status 'sent' on its own within seconds. Recipient = Resend's test sink.
import { enqueueEmail } from '../src/lib/email/outbox'
import { templates } from '../src/lib/email/templates'

const tpl = templates.welcome('Platform')
const job = await enqueueEmail({
  idempotencyKey: `autosend-verify-${Date.now()}`,
  category: 'welcome',
  to: 'delivered@resend.dev',
  subject: 'Auto-send pipeline verification',
  html: tpl.html,
  text: '',
})
console.log('enqueued:', job.id, 'status:', job.status)

for (let i = 1; i <= 6; i++) {
  await new Promise((r) => setTimeout(r, 1500))
  const { db } = await import('../src/lib/db')
  const row = await db.emailOutbox.findUnique({ where: { id: job.id }, select: { status: true, attempts: true, providerMessageId: true } })
  console.log(`t+${(i * 1.5).toFixed(1)}s:`, row?.status, 'att', row?.attempts, row?.providerMessageId ?? '')
  if (row?.status === 'sent') {
    console.log('AUTO-SEND VERIFIED: job sent itself without any manual worker call')
    await db.$disconnect()
    process.exit(0)
  }
  if (i === 6) await db.$disconnect()
}
console.log('NOT SENT — auto-send did not fire')
process.exit(1)
