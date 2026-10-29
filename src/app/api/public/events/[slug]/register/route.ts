// Event registration pipeline (§12). All validation happens server-side:
// published status, registration window, deadline, capacity, duplicates.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, ipOf, auth } from '@/lib/api'
import { eventRegistrationSchema } from '@/lib/validations'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'
import { checkAndConsume } from '@/lib/ratelimit'
import { writeAudit } from '@/lib/audit'
import { hashIp } from '@/lib/api'
import { getGoogleConfig, submitFormResponse, type RegistrationAnswers } from '@/lib/google-forms'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const ip = ipOf(req)
    if (!checkAndConsume(`event-reg:${ip}`, 10, 10 * 60_000)) {
      return fail(429, 'Too many registration attempts. Try again later.', 'rate_limited')
    }
    const { slug } = await params
    const input = await parseBody(req, eventRegistrationSchema)

    // Authenticated member OR guest with name+email.
    let userId: string | null = null
    let memberName = ''
    let memberEmail = ''
    const session = await requireAuthOrNull()
    if (session) {
      const user = await db.user.findUnique({
        where: { id: session },
        select: { id: true, fullName: true, email: true, isActive: true, suspendedAt: true },
      })
      if (!user || !user.isActive || user.suspendedAt) {
        return fail(401, 'Sign in with an active account to register.', 'unauthorized')
      }
      userId = user.id
      memberName = user.fullName
      memberEmail = user.email
    } else {
      if (!input.guestName || !input.guestEmail) {
        return fail(400, 'Guest registration requires your name and email.', 'guest_fields_required')
      }
      memberName = input.guestName
      memberEmail = input.guestEmail.toLowerCase()
    }

    const event = await db.clubEvent.findUnique({
      where: { slug },
      select: { id: true, title: true, startsAt: true, venue: true, status: true, registrationOpen: true, registrationDeadline: true, capacity: true, isSeedData: true, deletedAt: true, googleFormId: true, googleFormMapping: true },
    })
    // Section 25.2 + PRD §6 — no registration against seed or soft-deleted events.
    if (!event || event.status !== 'published' || event.isSeedData || event.deletedAt) {
      return fail(404, 'Event not found or not open for registration.', 'event_not_available')
    }
    if (!event.registrationOpen) return fail(409, 'Registration is closed for this event.', 'registration_closed')
    if (event.startsAt < new Date()) return fail(409, 'This event has already taken place.', 'event_past')
    if (event.registrationDeadline && event.registrationDeadline < new Date()) {
      return fail(409, 'The registration deadline has passed.', 'deadline_passed')
    }

    const regKey = userId ?? memberEmail
    const duplicate = await db.eventRegistration.findUnique({
      where: { eventId_regKey: { eventId: event.id, regKey } },
    })
    if (duplicate && duplicate.status !== 'cancelled') {
      return fail(409, 'You are already registered for this event.', 'duplicate_registration')
    }

    if (event.capacity) {
      const count = await db.eventRegistration.count({
        where: { eventId: event.id, status: { in: ['confirmed', 'attended'] } },
      })
      if (count >= event.capacity) return fail(409, 'This event is fully booked.', 'event_full')
    }

    const registration = duplicate
      ? await db.eventRegistration.update({
          where: { id: duplicate.id },
          data: {
            status: 'confirmed',
            guestName: userId ? null : memberName,
            guestEmail: userId ? null : memberEmail,
            year: input.year ?? null,
            branch: input.branch ?? null,
            phone: input.phone ?? null,
          },
        })
      : await db.eventRegistration.create({
          data: {
            eventId: event.id,
            regKey,
            userId,
            guestName: userId ? null : memberName,
            guestEmail: userId ? null : memberEmail,
            year: input.year ?? null,
            branch: input.branch ?? null,
            phone: input.phone ?? null,
            ipHash: hashIp(ip),
          },
        })

    // Google Forms sync (Task 25) — best-effort, never blocks the registration.
    // Fires when the event has an auto-created Google Form (admin action) and the
    // service account is configured; failures are recorded on the row.
    let googleSync: 'synced' | 'skipped' | 'failed' = 'skipped'
    if (event.googleFormId && event.googleFormMapping) {
      const cfg = getGoogleConfig()
      if (cfg) {
        try {
          const answers: RegistrationAnswers = {
            name: memberName,
            email: memberEmail,
            year: input.year ?? null,
            branch: input.branch ?? null,
            phone: input.phone ?? null,
          }
          await submitFormResponse(cfg, event.googleFormId, JSON.parse(event.googleFormMapping) as Record<string, string>, answers)
          await db.eventRegistration.update({ where: { id: registration.id }, data: { googleSyncedAt: new Date(), googleSyncError: null } })
          googleSync = 'synced'
        } catch (gErr) {
          await db.eventRegistration
            .update({ where: { id: registration.id }, data: { googleSyncError: gErr instanceof Error ? gErr.message.slice(0, 500) : 'unknown error' } })
            .catch(() => undefined)
          googleSync = 'failed'
        }
      }
    }

    await writeAudit({
      event: 'event.registration_created',
      targetType: 'event',
      targetId: event.id,
      metadata: { registrationId: registration.id, guest: !userId, googleSync },
    })

    // Queue confirmation email (outbox pattern — idempotent per registration).
    const tpl = templates.eventRegistration(event.title, event.startsAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' }), event.venue ?? 'To be announced', memberName)
    await enqueueEmail({
      idempotencyKey: `event-reg-${registration.id}`,
      category: 'event_registration',
      to: memberEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: `Your registration for ${event.title} is confirmed. ${event.startsAt.toISOString()} at ${event.venue ?? 'TBA'}`,
      relatedType: 'event_registration',
      relatedId: registration.id,
    })

    const registrationCount = await db.eventRegistration.count({
      where: { eventId: event.id, status: { in: ['confirmed', 'attended'] } },
    })

    return ok({
      ok: true,
      reference: registration.id,
      registrationCount,
      seatsLeft: event.capacity ? Math.max(0, event.capacity - registrationCount) : null,
      googleSync,
    })
  } catch (err) {
    return handleError(err)
  }
}

async function requireAuthOrNull(): Promise<string | null> {
  try {
    const ctx = await auth()
    return ctx.userId
  } catch {
    return null
  }
}
