// PRD §7.1 — admin-create-member. Direct member creation without the application
// pipeline. Two modes:
//   invite — reuse the Phase 3 club_invites path (safer default; UI prefers this).
//   active — create the user immediately with a random temp password that is NEVER
//            emailed; the recipient receives a single-use "set your password" link.
// Authorization: members.create (Super-Admin-exclusive). Self-escalation guard:
// creating a NEW user with a super_admin role is reserved to existing Super Admins.
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { can, PERMISSIONS, revalidateUserGrants, ROLE_KEYS } from '@/lib/rbac/authorize'
import { ApiError } from '@/lib/api'
import { hashPassword } from '@/lib/auth/password'
import { generateToken, hashToken, RESET_TTL_MS } from '@/lib/auth/tokens'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { writeAudit } from '@/lib/audit'

export type CreateMemberInput = {
  email: string
  username: string
  displayName: string
  roleId?: string
  roleKey?: string
  mode: 'invite' | 'active'
  origin: string
  /** §5.2 — approve for the public team directory at creation time (default: not listed). */
  isPublic?: boolean
}

export type CreateMemberResult = {
  mode: 'invite' | 'active'
  inviteId?: string
  profileId?: string
  userId?: string
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '-')
}

export async function createMember(actorId: string, input: CreateMemberInput): Promise<CreateMemberResult> {
  if (!(await can(actorId, PERMISSIONS.membersCreate))) {
    throw new ApiError(403, 'Not authorized to create members directly.', 'forbidden')
  }

  const email = input.email.trim().toLowerCase()
  const username = normalizeUsername(input.username)
  if (!email || !username || !input.displayName.trim()) {
    throw new ApiError(422, 'email, username and displayName are required.', 'validation_error')
  }

  // Resolve the target role (id or key) once for both modes.
  const role = input.roleId
    ? await db.role.findUnique({ where: { id: input.roleId } })
    : input.roleKey
      ? await db.role.findUnique({ where: { key: input.roleKey } })
      : null
  if (!role) throw new ApiError(422, 'A valid target role is required.', 'invalid_role')

  // Self-escalation guard (§10): a new user or new invite can never carry
  // super_admin authority unless the CALLER already holds super_admin.
  if (role.key === ROLE_KEYS.superAdmin) {
    const callerIsSuperAdmin = await db.userRole.findFirst({
      where: {
        userId: actorId,
        role: { key: ROLE_KEYS.superAdmin },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    })
    if (!callerIsSuperAdmin) {
      throw new ApiError(403, 'Only a Super Admin can grant the Super Admin role to a new member.', 'escalation_blocked')
    }
  }

  const existingUser = await db.user.findUnique({ where: { email }, include: { profile: true } })
  if (existingUser?.isActive) {
    throw new ApiError(409, 'email_or_username_taken', 'email_or_username_taken')
  }
  const usernameTaken = await db.profile.findUnique({ where: { username } })
  if (usernameTaken) {
    throw new ApiError(409, 'email_or_username_taken', 'email_or_username_taken')
  }

  if (input.mode === 'invite') {
    if (existingUser) {
      throw new ApiError(409, 'email_or_username_taken', 'email_or_username_taken')
    }
    const pending = await db.clubInvite.findFirst({ where: { email, status: 'pending' } })
    if (pending) throw new ApiError(409, 'A pending invitation already exists for this email.', 'invite_pending')

    // Invite mode: the profile does not exist yet. Visibility is decided when the
    // invitee accepts (accept-invite: isPublic = type !== 'teacher', i.e. member
    // invites are listed publicly, teachers stay private) — same default as the
    // application pipeline. Admins can flip visibility afterwards via Edit.
    // Note: club_invite stores no reserved username; accept-invite derives one
    // from the email local-part (PRD §7.1 reservation needs a schema column).
    const raw = generateToken()
    const invite = await db.clubInvite.create({
      data: {
        email,
        tokenHash: hashToken(raw),
        type: 'member',
        roleKey: role.key,
        invitedBy: actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      },
    })
    const link = `${input.origin}/#/auth/accept-invite?token=${raw}`
    const tpl = templates.membershipInvite(link, 'member')
    await enqueueEmail({
      idempotencyKey: `invite-${invite.id}`,
      category: 'membership_invite',
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: `Activate your club account: ${link} (valid 7 days, single use)`,
      relatedType: 'club_invite',
      relatedId: invite.id,
    })
    await db.clubInvite.update({ where: { id: invite.id }, data: { sentCount: { increment: 1 }, lastSentAt: new Date() } })
    await writeAudit({
      event: 'admin.member_created',
      actorId,
      targetType: 'club_invite',
      targetId: invite.id,
      metadata: { mode: 'invite', roleKey: role.key },
    })
    return { mode: 'invite', inviteId: invite.id }
  }

  // mode = 'active' — create the account now. Temp password never leaves this function;
  // the recipient only ever receives a single-use password-set link.
  if (existingUser) {
    throw new ApiError(409, 'email_or_username_taken', 'email_or_username_taken')
  }

  const tempPassword = randomBytes(24).toString('base64url')
  const user = await db.user.create({
    data: {
      email,
      fullName: input.displayName.trim(),
      passwordHash: await hashPassword(tempPassword),
      isActive: true,
      mustChangePassword: true,
      profile: {
        create: {
          username,
          displayName: input.displayName.trim(),
          createdVia: 'admin_direct_active',
          // §5.2: default remains non-public; the admin may approve the
          // profile for the team directory right in the Add Member dialog.
          isPublic: input.isPublic === true,
        },
      },
      emailPreference: { create: {} },
      ...(role
        ? { userRoles: { create: { roleId: role.id, scope: '*', assignedBy: actorId } } }
        : {}),
    },
    include: { profile: true },
  })

  // Queue the "set your password" email (reuses the single-use reset-token flow).
  const rawToken = generateToken()
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  })
  const resetLink = `${input.origin}/#/auth/reset-password?token=${rawToken}`
  const tpl = templates.setPassword(resetLink)
  await enqueueEmail({
    idempotencyKey: `set-password-${user.id}`,
    category: 'membership_invite',
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: `Set your Entrepreneurship Club password: ${resetLink} (valid 1 hour, single use)`,
    relatedType: 'user',
    relatedId: user.id,
  })

  revalidateUserGrants(user.id)
  await writeAudit({
    event: 'admin.member_created',
    actorId,
    targetType: 'user',
    targetId: user.id,
    metadata: { mode: 'active', roleKey: role.key, username, isPublic: input.isPublic === true },
  })
  return { mode: 'active', profileId: user.profile?.id, userId: user.id }
}
