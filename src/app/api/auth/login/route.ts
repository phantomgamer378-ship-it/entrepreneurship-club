import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf } from '@/lib/api'
import { loginSchema } from '@/lib/validations'
import { verifyPassword } from '@/lib/auth/password'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'
import { revalidateUserGrants } from '@/lib/rbac/authorize'

export async function POST(req: Request) {
  try {
    const ip = ipOf(req)
    if (!checkAndConsume(`login:${ip}`, 20, 10 * 60_000)) {
      return fail(429, 'Too many attempts. Try again later.', 'rate_limited')
    }
    const { email, password } = await parseBody(req, loginSchema)
    if (!checkAndConsume(`login:email:${email.toLowerCase()}`, 8, 10 * 60_000)) {
      await writeAudit({ event: 'auth.login_failed', actorEmail: email, metadata: { reason: 'rate_limited' }, ip })
      return fail(429, 'Too many attempts for this account. Try again later.', 'rate_limited')
    }

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    const valid = await verifyPassword(password, user?.passwordHash)
    if (!user || !valid) {
      await writeAudit({ event: 'auth.login_failed', actorEmail: email, ip })
      return fail(401, 'Invalid email or password', 'invalid_credentials')
    }
    if (user.suspendedAt) {
      await writeAudit({ event: 'auth.login_failed', actorId: user.id, metadata: { reason: 'suspended' }, ip })
      return fail(403, 'This account is suspended. Contact a club administrator.', 'suspended')
    }
    if (!user.isActive) {
      return fail(403, 'Account not activated. Use the invitation link from your approval email.', 'not_activated')
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0 },
    })
    const token = await createSessionToken({ sub: user.id, email: user.email })
    await setSessionCookie(token)
    revalidateUserGrants(user.id)
    await writeAudit({ event: 'auth.login_succeeded', actorId: user.id, ip })

    // `token` is consumed by the SPA for bearer-auth in cross-site iframe
    // previews where the browser drops SameSite=lax cookies.
    return ok({ ok: true, user: { id: user.id, email: user.email, fullName: user.fullName }, token })
  } catch (err) {
    return handleError(err)
  }
}
