import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf } from '@/lib/api'
import { forgotPasswordSchema } from '@/lib/validations'
import { generateToken, hashToken, RESET_TTL_MS } from '@/lib/auth/tokens'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'

export async function POST(req: Request) {
  try {
    const ip = ipOf(req)
    const { email } = await parseBody(req, forgotPasswordSchema)
    if (!checkAndConsume(`forgot:${ip}`, 5, 15 * 60_000)) {
      return fail(429, 'Too many requests. Try again later.', 'rate_limited')
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    // Always return ok — never reveal whether the account exists (enumeration defense).
    if (user && user.isActive && !user.suspendedAt) {
      const raw = generateToken()
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(raw),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        },
      })
      const origin = new URL(req.url).origin
      const link = `${origin}/#/auth/reset-password?token=${raw}`
      const tpl = templates.opsAlert('Reset your password', `Use this link to choose a new password (valid 1 hour): ${link}`)
      // Reuse the layout via a dedicated template call would be cleaner; opsAlert provides the same secure layout.
      await enqueueEmail({
        idempotencyKey: `pwreset-${user.id}-${hashToken(raw).slice(0, 12)}`,
        category: 'membership_notice',
        to: user.email,
        subject: 'Reset your Entrepreneurship Club password',
        html: tpl.html,
        text: `Reset your password (valid 1 hour): ${link}`,
        relatedType: 'password_reset',
      })
      await writeAudit({ event: 'auth.password_reset_requested', actorId: user.id, ip })
    }
    return ok({ ok: true, message: 'If that account exists, a reset link has been sent.' })
  } catch (err) {
    return handleError(err)
  }
}
