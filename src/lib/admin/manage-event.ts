// PRD §7.5 — admin-manage-event. Override actions beyond the normal event lifecycle:
//   delete            → soft delete (deleted_at); requires events.delete
//   force_cancel      → status 'cancelled' + cancellation notices; requires events.delete
//   add_registrant    → manual registrant insert; requires events.registrations.manage
//   remove_registrant → manual registrant cancel; requires events.registrations.manage
// Registrant actions still respect the Phase 4 duplicate-registration unique
// constraint (@@unique([eventId, regKey])) and capacity limits.
import { db } from '@/lib/db'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { ApiError } from '@/lib/api'
import { writeAudit } from '@/lib/audit'

export type ManageEventAction = 'delete' | 'force_cancel' | 'add_registrant' | 'remove_registrant'

export type ManageEventInput = {
  eventId: string
  action: ManageEventAction
  reason?: string
  payload?: {
    userId?: string
    email?: string
    username?: string
    guestName?: string
  }
}

async function resolveRegistrantUser(payload?: ManageEventInput['payload']): Promise<{ userId: string; email: string } | null> {
  if (!payload) return null
  if (payload.userId) {
    const u = await db.user.findUnique({ where: { id: payload.userId }, select: { id: true, email: true } })
    return u ? { userId: u.id, email: u.email } : null
  }
  if (payload.email) {
    const u = await db.user.findUnique({ where: { email: payload.email.toLowerCase() }, select: { id: true, email: true } })
    return u ? { userId: u.id, email: u.email } : null
  }
  if (payload.username) {
    const p = await db.profile.findUnique({
      where: { username: payload.username.toLowerCase() },
      select: { userId: true, user: { select: { email: true } } },
    })
    return p ? { userId: p.userId, email: p.user.email } : null
  }
  return null
}

export async function manageEvent(actorId: string, input: ManageEventInput): Promise<{ affected: number }> {
  const event = await db.clubEvent.findUnique({ where: { id: input.eventId } })
  if (!event) throw new ApiError(404, 'Event not found.', 'not_found')

  if (input.action === 'delete' || input.action === 'force_cancel') {
    if (!(await can(actorId, PERMISSIONS.eventsDelete))) {
      throw new ApiError(403, 'Not authorized to delete or cancel events.', 'forbidden')
    }
    if (input.action === 'delete') {
      if (event.deletedAt) throw new ApiError(409, 'Event is already deleted.', 'already_deleted')
      await db.clubEvent.update({ where: { id: event.id }, data: { deletedAt: new Date(), status: 'cancelled' } })
    } else {
      if (event.deletedAt) throw new ApiError(409, 'Event is deleted.', 'already_deleted')
      if (event.status === 'cancelled') throw new ApiError(409, 'Event is already cancelled.', 'already_cancelled')
      await db.clubEvent.update({ where: { id: event.id }, data: { status: 'cancelled' } })
      // Notify confirmed registrants through the existing outbox (idempotent per registrant).
      const regs = await db.eventRegistration.findMany({
        where: { eventId: event.id, status: 'confirmed' },
        select: { id: true, userId: true, guestEmail: true, user: { select: { email: true } } },
      })
      const { enqueueEmail } = await import('@/lib/email/outbox')
      const { templates } = await import('@/lib/email/templates')
      for (const r of regs) {
        const to = r.user?.email ?? r.guestEmail
        if (!to) continue
        const tpl = templates.eventCancelled(event.title, input.reason)
        await enqueueEmail({
          idempotencyKey: `event-cancelled-${event.id}-${r.id}`,
          category: 'event_reminder',
          to,
          subject: tpl.subject,
          html: tpl.html,
          text: `Cancelled: ${event.title}. ${input.reason ?? ''}`,
          relatedType: 'club_event',
          relatedId: event.id,
        })
      }
    }
    await writeAudit({
      event: 'admin.event_managed',
      actorId,
      targetType: 'club_event',
      targetId: event.id,
      metadata: { action: input.action, reason: input.reason ?? null, title: event.title },
    })
    return { affected: 1 }
  }

  // Registrant management.
  if (!(await can(actorId, PERMISSIONS.eventsRegistrationsManage))) {
    throw new ApiError(403, 'Not authorized to manage event registrants.', 'forbidden')
  }
  if (event.deletedAt) throw new ApiError(409, 'Event is deleted.', 'already_deleted')

  if (input.action === 'add_registrant') {
    const registrant = await resolveRegistrantUser(input.payload)
    if (!registrant) throw new ApiError(422, 'A valid userId, email or username is required.', 'validation_error')

    if (event.capacity != null) {
      const confirmed = await db.eventRegistration.count({ where: { eventId: event.id, status: 'confirmed' } })
      if (confirmed >= event.capacity) {
        throw new ApiError(409, 'Event is at full capacity.', 'capacity_full')
      }
    }
    try {
      await db.eventRegistration.create({
        data: { eventId: event.id, regKey: registrant.userId, userId: registrant.userId, status: 'confirmed' },
      })
    } catch {
      throw new ApiError(409, 'This member is already registered for the event.', 'duplicate_registration')
    }
    await writeAudit({
      event: 'admin.event_managed',
      actorId,
      targetType: 'club_event',
      targetId: event.id,
      metadata: { action: 'add_registrant', userId: registrant.userId },
    })
    return { affected: 1 }
  }

  // remove_registrant — soft-cancel the registration row (history survives).
  const registrant = await resolveRegistrantUser(input.payload)
  if (!registrant) throw new ApiError(422, 'A valid userId, email or username is required.', 'validation_error')
  const reg = await db.eventRegistration.findUnique({
    where: { eventId_regKey: { eventId: event.id, regKey: registrant.userId } },
  })
  if (!reg || reg.status === 'cancelled') {
    throw new ApiError(404, 'No active registration found for this member.', 'not_registered')
  }
  await db.eventRegistration.update({ where: { id: reg.id }, data: { status: 'cancelled' } })
  await writeAudit({
    event: 'admin.event_managed',
    actorId,
    targetType: 'club_event',
    targetId: event.id,
    metadata: { action: 'remove_registrant', userId: registrant.userId },
  })
  return { affected: 1 }
}
