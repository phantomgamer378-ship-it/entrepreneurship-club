import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const event = await db.clubEvent.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        summary: true,
        description: true,
        posterUrl: true,
        formUrl: true,
        googleFormUrl: true,
        gallery: true,
        venue: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        status: true,
        isSeedData: true,
        deletedAt: true,
        recap: true,
        registrationOpen: true,
        registrationDeadline: true,
        _count: { select: { registrations: { where: { status: { in: ['confirmed', 'attended'] } } } } },
      },
    })
    // Section 25.2 + PRD §6 — seed rows, soft-deleted, draft and cancelled events
    // never render publicly. Published events are always viewable; completed and
    // archived events stay viewable as past archive with recaps (PRD §5.4) —
    // consistent with the list route's past filter.
    const now = new Date()
    const publiclyViewable =
      !!event &&
      !event.isSeedData &&
      !event.deletedAt &&
      (event.status === 'published' ||
        ((event.status === 'completed' || event.status === 'archived') && event.startsAt < now))
    if (!publiclyViewable) {
      return fail(404, 'Event not found', 'not_found')
    }
    return ok({
      ...event,
      gallery: safeArray(event.gallery),
      isPast: event.startsAt < now,
      registrationCount: event._count.registrations,
      seatsLeft: event.capacity ? Math.max(0, event.capacity - event._count.registrations) : null,
      canRegister:
        event.status === 'published' &&
        event.registrationOpen &&
        event.startsAt >= now &&
        (!event.registrationDeadline || event.registrationDeadline >= now) &&
        (!event.capacity || event._count.registrations < event.capacity),
    })
  } catch (err) {
    return handleError(err)
  }
}

function safeArray(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String).slice(0, 12) : []
  } catch {
    return []
  }
}
