// Application review decision (§7.2): approve → queue decision email + create invitation;
// reject → queue decision email. Records reviewer + decision time. Private notes stay internal.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { applicationDecisionSchema } from '@/lib/validations'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { generateToken, hashToken, INVITE_TTL_MS } from '@/lib/auth/tokens'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, email: actorEmail } = await auth()
    const { id } = await params
    const input = await parseBody(req, applicationDecisionSchema)

    const approvePermission =
      input.action === 'approve' ? PERMISSIONS.applicationsApprove : PERMISSIONS.applicationsReject
    if (!(await can(userId, approvePermission))) {
      await writeAudit({ event: 'access.authorization_denied', actorId: userId, metadata: { permission: approvePermission } })
      return fail(403, 'Not authorized for this decision.', 'forbidden')
    }

    const application = await db.memberApplication.findUnique({ where: { id } })
    if (!application) return fail(404, 'Application not found', 'not_found')
    if (application.status !== 'pending') {
      return fail(409, `Application is already ${application.status}.`, 'already_reviewed')
    }

    await db.memberApplication.update({
      where: { id },
      data: {
        status: input.action === 'approve' ? 'approved' : 'rejected',
        reviewNotes: input.notes || application.reviewNotes,
        reviewedBy: actorEmail,
        reviewedAt: new Date(),
      },
    })

    const tpl = templates.applicationDecision(application.fullName, input.action === 'approve', input.notes || undefined)
    await enqueueEmail({
      idempotencyKey: `app-decision-${application.id}`,
      category: 'application_decision',
      to: application.email,
      subject: tpl.subject,
      html: tpl.html,
      text: input.action === 'approve' ? 'Your application was approved. An invitation will follow.' : 'Your application was not approved this time.',
      relatedType: 'member_application',
      relatedId: application.id,
    })

    let inviteId: string | null = null
    if (input.action === 'approve') {
      const existingInvite = await db.clubInvite.findFirst({
        where: { applicationId: application.id, status: 'pending' },
      })
      if (existingInvite) {
        inviteId = existingInvite.id
      } else {
        const raw = generateToken()
        const invite = await db.clubInvite.create({
          data: {
            applicationId: application.id,
            email: application.email,
            tokenHash: hashToken(raw),
            type: 'member',
            roleKey: 'member',
            invitedBy: userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
        })
        inviteId = invite.id
        // Queue the invitation email with the secure link.
        const origin = new URL(req.url).origin
        const link = `${origin}/#/auth/accept-invite?token=${raw}`
        const invTpl = templates.membershipInvite(link, 'member')
        await enqueueEmail({
          idempotencyKey: `invite-${invite.id}`,
          category: 'membership_invite',
          to: application.email,
          subject: invTpl.subject,
          html: invTpl.html,
          text: `Activate your club account: ${link} (valid 7 days, single use)`,
          relatedType: 'club_invite',
          relatedId: invite.id,
        })
        await db.clubInvite.update({ where: { id: invite.id }, data: { sentCount: { increment: 1 }, lastSentAt: new Date() } })
      }
    }

    await writeAudit({
      event: input.action === 'approve' ? 'membership.application_approved' : 'membership.application_rejected',
      actorId: userId,
      targetType: 'member_application',
      targetId: application.id,
      metadata: { inviteCreated: Boolean(inviteId) },
    })

    return ok({ ok: true, inviteId })
  } catch (err) {
    return handleError(err)
  }
}

/** Save/update private review notes without deciding. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, email: actorEmail } = await auth()
    const { id } = await params
    if (!(await can(userId, PERMISSIONS.applicationsReview))) return fail(403, 'Not authorized.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as { notes?: string }
    const application = await db.memberApplication.findUnique({ where: { id }, select: { id: true } })
    if (!application) return fail(404, 'Application not found', 'not_found')
    await db.memberApplication.update({
      where: { id },
      data: { reviewNotes: (body.notes ?? '').slice(0, 4000), reviewedBy: application.id ? actorEmail : undefined },
    })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
