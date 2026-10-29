// Event management (§7.1/§12): list with registrations, create, update, publish, archive, cancel.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { assertMediaContract } from '@/lib/media'
import { broadcastEventToSubscribers } from '@/lib/newsletter'
import { getGoogleConfig, createEventRegistrationForm, GOOGLE_SETUP_HINT } from '@/lib/google-forms'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.eventsRegistrationsRead))) return fail(403, 'Not authorized.', 'forbidden')
    const status = new URL(req.url).searchParams.get('status') ?? 'all'
    const events = await db.clubEvent.findMany({
      where: status === 'all' ? { deletedAt: null } : { status, deletedAt: null }, // soft-deleted = history only (PRD §6)
      orderBy: { startsAt: 'desc' },
      take: 100,
      select: {
        id: true, slug: true, title: true, summary: true, venue: true, startsAt: true, endsAt: true,
        capacity: true, status: true, registrationOpen: true, registrationDeadline: true, featured: true, posterUrl: true,
        googleFormUrl: true, googleFormId: true,
        isSeedData: true,
        _count: { select: { registrations: true } },
      },
    })
    return ok({ events })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.eventsCreate))) return fail(403, 'Not authorized to create events.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const title = String(body.title ?? '').trim()
    const startsAt = body.startsAt ? new Date(String(body.startsAt)) : null
    if (!title || title.length < 3) return fail(422, 'Title is required (3+ characters).', 'validation_error')
    if (!startsAt || Number.isNaN(startsAt.getTime())) return fail(422, 'A valid start time is required.', 'validation_error')

    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)}-${Date.now().toString(36).slice(-4)}`
    const posterUrl = body.posterUrl ? String(body.posterUrl) : null
    assertMediaContract({ isSeedData: false, posterUrl }) // Section 25.3 upload contract
    const event = await db.clubEvent.create({
      data: {
        slug,
        title,
        summary: body.summary ? String(body.summary).slice(0, 300) : null,
        description: String(body.description ?? title),
        venue: body.venue ? String(body.venue).slice(0, 200) : null,
        startsAt,
        endsAt: body.endsAt ? new Date(String(body.endsAt)) : null,
        capacity: body.capacity ? Number(body.capacity) : null,
        registrationOpen: body.registrationOpen !== false,
        registrationDeadline: body.registrationDeadline ? new Date(String(body.registrationDeadline)) : null,
        posterUrl,
        formUrl: body.formUrl ? String(body.formUrl).slice(0, 500) : null,
        createdById: userId,
      },
    })
    await writeAudit({ event: 'event.created', actorId: userId, targetType: 'club_event', targetId: event.id })
    return ok({ ok: true, event: { id: event.id, slug: event.slug } })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = String(body.id ?? '')
    const event = await db.clubEvent.findUnique({ where: { id }, select: { id: true, status: true, createdById: true, googleFormId: true } })
    if (!event) return fail(404, 'Event not found', 'not_found')

    // Resource-scoped permission: Event Leads may edit only events assigned to them.
    const scopeAllowed =
      event.createdById === userId ||
      (await can(userId, PERMISSIONS.eventsUpdate, { type: 'event', id: event.id })) ||
      (await can(userId, PERMISSIONS.eventsUpdate))
    if (!scopeAllowed) {
      await writeAudit({ event: 'access.authorization_denied', actorId: userId, targetType: 'club_event', targetId: event.id, metadata: { action: 'update' } })
      return fail(403, 'Not authorized to edit this event.', 'forbidden')
    }

    const action = body.action as string | undefined
    if (action === 'publish') {
      if (!(await can(userId, PERMISSIONS.eventsPublish))) return fail(403, 'Not authorized to publish events.', 'forbidden')
      await db.clubEvent.update({ where: { id }, data: { status: 'published' } })
      await writeAudit({ event: 'event.published', actorId: userId, targetType: 'club_event', targetId: id })
      // Newsletter fanout to PUBLIC subscribers — gated on status='published' &&
      // isPublic inside; internal/hidden events are never emailed (Task 24).
      const newsletter = await broadcastEventToSubscribers(id, new URL(req.url).origin)
      return ok({ ok: true, newsletter })
    }
    if (action === 'create_google_form') {
      // Task 25 — auto-create the event's Google registration form.
      if (!event.googleFormId) {
        const cfg = getGoogleConfig()
        if (!cfg) return fail(501, GOOGLE_SETUP_HINT, 'google_not_configured')
        try {
          const full = await db.clubEvent.findUnique({ where: { id }, select: { title: true } })
          const created = await createEventRegistrationForm(cfg, full?.title ?? 'Event')
          await db.clubEvent.update({
            where: { id },
            data: {
              googleFormId: created.id,
              googleFormUrl: created.responderUri,
              googleFormMapping: JSON.stringify(created.mapping),
            },
          })
          await writeAudit({ event: 'event.google_form_created', actorId: userId, targetType: 'club_event', targetId: id, metadata: { formId: created.id } })
          return ok({ ok: true, googleFormUrl: created.responderUri, googleFormId: created.id })
        } catch (gErr) {
          return handleError(gErr)
        }
      }
      const existing = await db.clubEvent.findUnique({ where: { id }, select: { googleFormUrl: true } })
      return ok({ ok: true, googleFormUrl: existing?.googleFormUrl, googleFormId: event.googleFormId, alreadyExisted: true })
    }
    if (action === 'archive') {
      if (!(await can(userId, PERMISSIONS.eventsArchive))) return fail(403, 'Not authorized to archive events.', 'forbidden')
      await db.clubEvent.update({ where: { id }, data: { status: 'archived' } })
      await writeAudit({ event: 'event.archived', actorId: userId, targetType: 'club_event', targetId: id })
      return ok({ ok: true })
    }
    if (action === 'cancel') {
      if (!(await can(userId, PERMISSIONS.eventsPublish))) return fail(403, 'Not authorized.', 'forbidden')
      await db.clubEvent.update({ where: { id }, data: { status: 'cancelled' } })
      await writeAudit({ event: 'event.updated', actorId: userId, targetType: 'club_event', targetId: id, metadata: { cancelled: true } })
      return ok({ ok: true })
    }
    if (action === 'complete') {
      if (!(await can(userId, PERMISSIONS.eventsPublish))) return fail(403, 'Not authorized.', 'forbidden')
      await db.clubEvent.update({ where: { id }, data: { status: 'completed' } })
      await writeAudit({ event: 'event.updated', actorId: userId, targetType: 'club_event', targetId: id, metadata: { completed: true } })
      return ok({ ok: true })
    }

    // General field updates.
    const data: Record<string, unknown> = {}
    for (const field of ['title', 'summary', 'description', 'venue', 'recap'] as const) {
      if (body[field] !== undefined) data[field] = String(body[field])
    }
    if (body.posterUrl !== undefined) {
      data.posterUrl = body.posterUrl ? String(body.posterUrl) : null
      assertMediaContract({ isSeedData: false, posterUrl: data.posterUrl as string | null }) // Section 25.3
    }
    if (body.formUrl !== undefined) {
      data.formUrl = body.formUrl ? String(body.formUrl).slice(0, 500) : null
    }
    if (body.startsAt !== undefined) data.startsAt = new Date(String(body.startsAt))
    if (body.endsAt !== undefined) data.endsAt = body.endsAt ? new Date(String(body.endsAt)) : null
    if (body.capacity !== undefined) data.capacity = body.capacity ? Number(body.capacity) : null
    if (body.registrationOpen !== undefined) data.registrationOpen = Boolean(body.registrationOpen)
    if (body.registrationDeadline !== undefined) data.registrationDeadline = body.registrationDeadline ? new Date(String(body.registrationDeadline)) : null
    if (Object.keys(data).length === 0) return fail(422, 'No fields to update', 'validation_error')
    await db.clubEvent.update({ where: { id }, data })
    await writeAudit({ event: 'event.updated', actorId: userId, targetType: 'club_event', targetId: id, metadata: { fields: Object.keys(data) } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
