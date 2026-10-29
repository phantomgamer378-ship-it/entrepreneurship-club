// Email provider abstraction. Providers are ONLY constructed server-side.
// - ConsoleEmailProvider: development/test mode. Logs the message and records an
//   artificial provider reference. Clearly marked as dev-mode in delivery logs.
// - ResendEmailProvider: production path. Requires RESEND_API_KEY; inactive until configured.
// A provider ACCEPTING a send request is NOT a delivery confirmation — statuses from
// webhooks drive final delivery state (see outbox.ts).
import { env, isEmailConfigured } from '@/lib/env'

export type SendResult = {
  accepted: boolean
  providerMessageId?: string
  provider: 'console' | 'resend'
  error?: string
}

export interface EmailProvider {
  readonly name: 'console' | 'resend'
  send(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult>
}

export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const
  async send(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult> {
    console.log(
      `[email:console] (DEV MODE — not actually delivered)\n  to=${input.to}\n  subject=${input.subject}\n  idempotencyKey=${input.idempotencyKey}`
    )
    return { accepted: true, provider: 'console', providerMessageId: `console-${input.idempotencyKey}` }
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const
  constructor(private apiKey: string, private from: string) {}
  async send(input: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify({
          from: this.from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
        }),
      })
      if (res.status === 429) {
        return { accepted: false, provider: 'resend', error: 'rate_limited' }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        return { accepted: false, provider: 'resend', error: `resend_${res.status}:${body.slice(0, 200)}` }
      }
      const data = (await res.json()) as { id?: string }
      return { accepted: true, provider: 'resend', providerMessageId: data.id }
    } catch (err) {
      return { accepted: false, provider: 'resend', error: `network_error:${String(err).slice(0, 200)}` }
    }
  }
}

let cachedProvider: EmailProvider | null = null

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) return cachedProvider
  if (isEmailConfigured()) {
    cachedProvider = new ResendEmailProvider(env.resendApiKey!, env.emailFromAddress)
  } else {
    cachedProvider = new ConsoleEmailProvider()
  }
  return cachedProvider
}
