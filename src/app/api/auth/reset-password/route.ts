import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf } from '@/lib/api'
import { resetPasswordSchema } from '@/lib/validations'
import { hashPassword } from '@/lib/auth/password'
import { hashToken } from '@/lib/auth/tokens'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'
import { revalidateUserGrants } from '@/lib/rbac/authorize'

export async function POST(req: Request) {
  try {
    const ip = ipOf(req)
    if (!checkAndConsume(`reset:${ip}`, 10, 15 * 60_000)) {
      return fail(429, 'Too many requests. Try again later.', 'rate_limited')
    }
    const { token, password } = await parseBody(req, resetPasswordSchema)
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return fail(400, 'This reset link is invalid or has expired. Request a new one.', 'invalid_token')
    }
    if (record.user.suspendedAt) {
      return fail(403, 'This account is suspended.', 'suspended')
    }
    await db.$transaction([
      db.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(password), failedLoginCount: 0 },
      }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Invalidate all other outstanding reset tokens for this user.
      db.passwordResetToken.updateMany({
        where: { userId: record.userId, id: { not: record.id }, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ])
    revalidateUserGrants(record.userId)
    await writeAudit({ event: 'auth.password_reset_completed', actorId: record.userId, ip })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
