// Public newsletter subscription — no auth. Visitors opt in from the site footer.
// Protections: strict email validation, honeypot field for bots, per-IP rate
// limiting, single-confession upsert (re-subscribing reactivates a cancelled
// address). Responses never reveal whether an address was previously subscribed.
import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/

// Tiny in-memory rate limit: 5 subscriptions per IP per 15 minutes.
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const windowStart = now - 15 * 60_000
  const list = (hits.get(ip) ?? []).filter((t) => t > windowStart)
  if (list.length >= 5) {
    hits.set(ip, list)
    return true
  }
  list.push(now)
  hits.set(ip, list)
  return false
}

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    if (rateLimited(ip)) return fail(429, 'Too many attempts. Please try again later.', 'rate_limited')

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const email = String(body.email ?? '').trim().toLowerCase()

    // Honeypot: real users never fill this hidden field. Bots get a fake success.
    if (String(body.company ?? '').length > 0) {
      return ok({ status: 'subscribed', message: "You're on the list! Watch your inbox for club news." })
    }
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return fail(422, 'Please enter a valid email address.', 'validation_error')
    }

    const existing = await db.newsletterSubscriber.findUnique({ where: { email } })
    let subscriber
    let status: 'subscribed' | 'already'
    if (existing?.isActive) {
      subscriber = existing
      status = 'already'
    } else if (existing) {
      subscriber = await db.newsletterSubscriber.update({
        where: { email },
        data: { isActive: true, unsubscribedAt: null, source: 'public_footer' },
      })
      status = 'subscribed'
    } else {
      subscriber = await db.newsletterSubscriber.create({
        data: { email, unsubscribeToken: randomBytes(24).toString('hex') },
      })
      status = 'subscribed'
    }

    await writeAudit({
      event: 'newsletter.subscribed',
      actorEmail: email,
      targetType: 'newsletter_subscriber',
      targetId: subscriber.id,
      metadata: { status, source: 'public_footer' },
    })

    return ok({
      status,
      message:
        status === 'already'
          ? 'This email is already on the list — you will receive club updates.'
          : "You're on the list! Watch your inbox for new announcements and events.",
    })
  } catch (err) {
    return handleError(err)
  }
}
