// Public membership application endpoint (§5.6).
// Server-side validation, duplicate handling, anti-spam (honeypot + time-gate), rate limiting.
// Submitting does NOT grant any membership privilege — a pending record only.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf, hashIp } from '@/lib/api'
import { applicationSchema } from '@/lib/validations'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'
import { randomBytes } from 'crypto'

export async function POST(req: Request) {
  try {
    const ip = ipOf(req)
    if (!checkAndConsume(`join:${ip}`, 3, 30 * 60_000)) {
      await writeAudit({ event: 'security.invite_abuse_suspected', metadata: { form: 'membership_application' }, ip })
      return fail(429, 'Too many applications from this network. Try again later.', 'rate_limited')
    }
    const input = await parseBody(req, applicationSchema)

    const email = input.email.toLowerCase()

    // Duplicate application handling: block while one is pending/approved.
    const existing = await db.memberApplication.findFirst({
      where: { email, status: { in: ['pending', 'approved'] } },
    })
    if (existing) {
      return fail(409, `An application for this email already exists (reference ${existing.reference}).`, 'duplicate_application')
    }
    // Requested username must not clash with an existing profile.
    const usernameTaken = await db.profile.findUnique({ where: { username: input.requestedUsername } })
    if (usernameTaken) {
      return fail(409, 'That username is taken. Please choose another.', 'username_taken')
    }
    // If an active member already uses this email, point them to sign in instead.
    const existingUser = await db.user.findUnique({ where: { email } })
    if (existingUser && existingUser.isActive) {
      return fail(409, 'This email already belongs to a member. Try signing in instead.', 'already_member')
    }

    const reference = `EC-${randomBytes(3).toString('hex').toUpperCase()}`
    const application = await db.memberApplication.create({
      data: {
        reference,
        requestedUsername: input.requestedUsername,
        email,
        fullName: input.fullName,
        courseYear: input.courseYear || null,
        interestArea: input.interestArea || null,
        motivation: input.motivation,
        portfolioUrl: input.portfolioUrl || null,
        linkedinUrl: input.linkedinUrl || null,
        githubUrl: input.githubUrl || null,
        ipHash: hashIp(ip),
      },
    })

    await writeAudit({
      event: 'membership.application_submitted',
      targetType: 'member_application',
      targetId: application.id,
      ip,
    })

    // 1) Receipt to applicant. 2) Notification to reviewers (faculty advisors / president / admins).
    const receipt = templates.applicationReceipt(input.fullName, reference)
    await enqueueEmail({
      idempotencyKey: `app-receipt-${application.id}`,
      category: 'application_receipt',
      to: email,
      subject: receipt.subject,
      html: receipt.html,
      text: `Application received. Reference: ${reference}`,
      relatedType: 'member_application',
      relatedId: application.id,
    })

    const reviewerEmails = await reviewerRecipients()
    const pendingCount = await db.memberApplication.count({ where: { status: 'pending' } })
    for (const to of reviewerEmails) {
      const notify = templates.reviewerNotification(input.fullName, pendingCount)
      await enqueueEmail({
        idempotencyKey: `app-review-notify-${application.id}-${to}`,
        category: 'reviewer_notification',
        to,
        subject: notify.subject,
        html: notify.html,
        text: `New application from ${input.fullName} (${pendingCount} pending).`,
        relatedType: 'member_application',
        relatedId: application.id,
      })
    }

    return ok({ ok: true, reference, message: 'Application submitted. Keep your reference for status updates.' })
  } catch (err) {
    return handleError(err)
  }
}

async function reviewerRecipients(): Promise<string[]> {
  const roles = await db.role.findMany({
    where: { key: { in: ['faculty_advisor', 'club_president', 'admin', 'super_admin'] } },
    select: { id: true },
  })
  const users = await db.userRole.findMany({
    where: { roleId: { in: roles.map((r) => r.id) }, user: { isActive: true, suspendedAt: null } },
    select: { user: { select: { email: true } } },
  })
  return [...new Set(users.map((u) => u.user.email))]
}
