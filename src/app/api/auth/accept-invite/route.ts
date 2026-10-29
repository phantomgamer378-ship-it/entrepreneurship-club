import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf } from '@/lib/api'
import { acceptInviteSchema } from '@/lib/validations'
import { hashPassword } from '@/lib/auth/password'
import { hashToken } from '@/lib/auth/tokens'
import { createSessionToken, setSessionCookie } from '@/lib/auth/session'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { revalidateUserGrants } from '@/lib/rbac/authorize'

/** GET ?token=... — validate an invitation link without consuming it. */
export async function GET(req: Request) {
  try {
    const token = new URL(req.url).searchParams.get('token') ?? ''
    if (!token) return fail(400, 'Missing invitation token', 'missing_token')
    const invite = await db.clubInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { email: true, type: true, status: true, expiresAt: true },
    })
    if (!invite || invite.status !== 'pending' || invite.expiresAt < new Date()) {
      return ok({ valid: false, reason: 'expired_or_used' })
    }
    return ok({ valid: true, email: invite.email, type: invite.type })
  } catch (err) {
    return handleError(err)
  }
}

/** POST — consume the invitation: set password, activate, create/attach profile, sign in. */
export async function POST(req: Request) {
  try {
    const ip = ipOf(req)
    if (!checkAndConsume(`accept-invite:${ip}`, 10, 15 * 60_000)) {
      return fail(429, 'Too many requests. Try again later.', 'rate_limited')
    }
    const input = await parseBody(req, acceptInviteSchema)
    const invite = await db.clubInvite.findUnique({ where: { tokenHash: hashToken(input.token) } })
    if (!invite || invite.status !== 'pending' || invite.expiresAt < new Date()) {
      return fail(400, 'This invitation is invalid, expired, or already used.', 'invalid_token')
    }

    // Existing user (e.g. member re-invite) vs brand-new account.
    let user = await db.user.findUnique({ where: { email: invite.email }, include: { profile: true } })
    if (!user) {
      // Username is derived from the email local-part with a short hash suffix
      // to avoid collisions (club_invite stores no reserved username column;
      // the stored tokenHash provides a stable discriminator).
      const username = `${invite.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '')}.${invite.tokenHash.slice(0, 4)}`
      const createdVia = invite.applicationId ? 'application' : 'admin_direct_invite'
      user = await db.user.create({
        data: {
          email: invite.email,
          fullName: input.displayName,
          passwordHash: await hashPassword(input.password),
          isActive: true,
          profile: { create: { username, displayName: input.displayName, isPublic: invite.type !== 'teacher', createdVia } },
          emailPreference: { create: {} },
        },
        include: { profile: true },
      })
    } else {
      await db.$transaction([
        db.user.update({
          where: { id: user.id },
          data: { passwordHash: await hashPassword(input.password), isActive: true, mustChangePassword: false },
        }),
        ...(user.profile
          ? []
          : [
              db.profile.create({
                data: {
                  userId: user.id,
                  username: `${invite.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '')}.${invite.tokenHash.slice(0, 4)}`,
                  displayName: input.displayName,
                  isPublic: invite.type !== 'teacher',
                  createdVia: invite.applicationId ? 'application' : 'admin_direct_invite',
                },
              }),
            ]),
      ])
    }

    // Assign the invite's role.
    const role = await db.role.findUnique({ where: { key: invite.roleKey } })
    if (role) {
      await db.userRole.upsert({
        where: { userId_roleId_scope: { userId: user.id, roleId: role.id, scope: '*' } },
        update: {},
        create: { userId: user.id, roleId: role.id, scope: '*', assignedBy: 'invite' },
      })
    }

    await db.clubInvite.update({
      where: { id: invite.id },
      data: { status: 'accepted', acceptedAt: new Date(), acceptedByUserId: user.id },
    })
    if (invite.applicationId) {
      await db.memberApplication.update({
        where: { id: invite.applicationId },
        data: { applicantUserId: user.id },
      })
    }

    revalidateUserGrants(user.id)
    await writeAudit({ event: 'auth.invite_accepted', actorId: user.id, ip })

    // Non-blocking welcome email (outbox pattern: record first, deliver later).
    const tpl = templates.welcome(user.fullName)
    await enqueueEmail({
      idempotencyKey: `welcome-${user.id}`,
      category: 'welcome',
      to: user.email,
      subject: tpl.subject,
      html: tpl.html,
      text: 'Welcome to the Entrepreneurship Club! Your account is now active.',
      relatedType: 'user',
      relatedId: user.id,
    })

    const token = await createSessionToken({ sub: user.id, email: user.email })
    await setSessionCookie(token)
    // `token` mirrors the cookie for bearer-auth inside cross-site iframe previews.
    return ok({ ok: true, user: { id: user.id, email: user.email }, token })
  } catch (err) {
    return handleError(err)
  }
}
