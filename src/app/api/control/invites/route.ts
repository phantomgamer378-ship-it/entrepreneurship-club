// Invitation management (§7.2): list, create (member/teacher), resend eligible invites.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { inviteCreateSchema } from '@/lib/validations'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { generateToken, hashToken, INVITE_TTL_MS } from '@/lib/auth/tokens'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersRead))) return fail(403, 'Not authorized.', 'forbidden')
    const invites = await db.clubInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true, email: true, type: true, roleKey: true, status: true,
        sentCount: true, lastSentAt: true, expiresAt: true, acceptedAt: true, createdAt: true,
      },
    })
    return ok({ invites })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, inviteCreateSchema)
    if (input.type === 'teacher' && !(await can(userId, PERMISSIONS.teachersManage))) {
      return fail(403, 'Not authorized to invite teachers.', 'forbidden')
    }
    if (input.type === 'member' && !(await can(userId, PERMISSIONS.membersInvite))) {
      return fail(403, 'Not authorized to invite members.', 'forbidden')
    }

    const email = input.email.toLowerCase()
    const activeUser = await db.user.findUnique({ where: { email } })
    if (activeUser && activeUser.isActive) {
      return fail(409, 'This email already belongs to an active member.', 'already_member')
    }
    const role = await db.role.findUnique({ where: { key: input.roleKey } })
    if (!role) return fail(422, 'Unknown role.', 'invalid_role')
    if ((input.type === 'teacher') !== (input.roleKey === 'faculty_advisor')) {
      // Teachers get the faculty_advisor role; members get a member-level role.
      if (input.type === 'teacher' && input.roleKey !== 'faculty_advisor') {
        return fail(422, 'Teacher invites must use the faculty_advisor role.', 'invalid_role')
      }
    }

    const pending = await db.clubInvite.findFirst({ where: { email, status: 'pending' } })
    if (pending) return fail(409, 'A pending invitation already exists for this email.', 'invite_pending')

    const raw = generateToken()
    const invite = await db.clubInvite.create({
      data: {
        email,
        tokenHash: hashToken(raw),
        type: input.type,
        roleKey: input.roleKey,
        invitedBy: userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    })
    const origin = new URL(req.url).origin
    const link = `${origin}/#/auth/accept-invite?token=${raw}`
    const tpl = templates.membershipInvite(link, input.type)
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
    await writeAudit({ event: 'membership.invite_sent', actorId: userId, targetType: 'club_invite', targetId: invite.id, metadata: { type: input.type, roleKey: input.roleKey } })
    return ok({ ok: true, inviteId: invite.id })
  } catch (err) {
    return handleError(err)
  }
}

/** Resend an eligible (pending, unexpired or expired-pending) invitation. */
export async function PUT(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.membersInvite)) && !(await can(userId, PERMISSIONS.teachersManage))) {
      return fail(403, 'Not authorized.', 'forbidden')
    }
    const body = (await req.json().catch(() => ({}))) as { inviteId?: string }
    if (!body.inviteId) return fail(400, 'inviteId required', 'missing_param')
    const invite = await db.clubInvite.findUnique({ where: { id: body.inviteId } })
    if (!invite) return fail(404, 'Invitation not found', 'not_found')
    if (invite.status !== 'pending') return fail(409, `Invitation is ${invite.status}.`, 'not_pending')

    // Rotate token on resend so older links stop working.
    const raw = generateToken()
    await db.clubInvite.update({
      where: { id: invite.id },
      data: { tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS), sentCount: { increment: 1 }, lastSentAt: new Date() },
    })
    const origin = new URL(req.url).origin
    const link = `${origin}/#/auth/accept-invite?token=${raw}`
    const tpl = templates.membershipInvite(link, invite.type)
    await enqueueEmail({
      idempotencyKey: `invite-${invite.id}-${invite.sentCount + 1}`,
      category: 'membership_invite',
      to: invite.email,
      subject: tpl.subject,
      html: tpl.html,
      text: `Activate your club account: ${link} (valid 7 days, single use)`,
      relatedType: 'club_invite',
      relatedId: invite.id,
    })
    await writeAudit({ event: 'membership.invite_sent', actorId: userId, targetType: 'club_invite', targetId: invite.id, metadata: { resent: true } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
