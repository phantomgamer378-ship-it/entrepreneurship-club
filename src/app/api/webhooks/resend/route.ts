// Resend delivery webhooks (§11): accepted/delivered/bounced/complained.
// Signature verified with HMAC-SHA256 of the raw body using RESEND_WEBHOOK_SECRET
// (svix-style header). If no secret configured, webhook is REJECTED in production,
// accepted in dev with a loud audit trail — clearly marked as unverified.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHmac, timingSafeEqual } from 'crypto'
import { env, isEmailConfigured } from '@/lib/env'
import { writeAudit } from '@/lib/audit'

export async function POST(req: Request) {
  const raw = await req.text()
  const signature = req.headers.get('svix-signature') ?? ''

  const hasSecret = Boolean(env.resendWebhookSecret)
  if (hasSecret) {
    const expected = createHmac('sha256', env.resendWebhookSecret!).update(raw).digest('base64')
    const provided = signature.split(' ').map((s) => s.split(',')[1] ?? '').filter(Boolean)
    const valid = provided.some((p) => {
      try {
        return timingSafeEqual(Buffer.from(p), Buffer.from(expected))
      } catch {
        return false
      }
    })
    if (!valid) {
      await writeAudit({ event: 'security.webhook_signature_invalid', metadata: { provider: 'resend' } })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  } else {
    if (isEmailConfigured()) {
      // Production posture: reject unverified webhooks once email is live.
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 401 })
    }
    await writeAudit({ event: 'security.webhook_signature_invalid', metadata: { provider: 'resend', note: 'accepted-unverified (dev mode, no API key configured)' } })
  }

  let payload: { type?: string; data?: { email_id?: string } }
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 })
  }

  const type = payload.type ?? ''
  const emailId = payload.data?.email_id ?? ''
  if (!emailId) return NextResponse.json({ ok: true, ignored: true })

  const job = await db.emailOutbox.findFirst({ where: { providerMessageId: emailId } })
  if (!job) return NextResponse.json({ ok: true, ignored: true })

  const eventMap: Record<string, string> = {
    'email.sent': 'accepted',
    'email.delivered': 'delivered',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.opened': 'opened',
  }
  const event = eventMap[type]
  if (!event) return NextResponse.json({ ok: true, ignored: true })

  await db.emailDeliveryLog.create({
    data: { outboxId: job.id, event, payload: raw.slice(0, 4000) },
  })
  if (event === 'bounced' || event === 'complained') {
    await db.emailOutbox.update({
      where: { id: job.id },
      data: { status: 'failed', lastError: `provider webhook: ${event}` },
    })
    await writeAudit({ event: 'email.delivery_failed', metadata: { outboxId: job.id, webhookEvent: event } })
  }
  return NextResponse.json({ ok: true })
}
