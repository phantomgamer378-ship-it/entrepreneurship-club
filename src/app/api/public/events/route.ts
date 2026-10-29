import { db } from '@/lib/db'
import { ok, handleError } from '@/lib/api'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Public events archive — upcoming & completed published events. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const year = url.searchParams.get('year') ?? ''
    const category = url.searchParams.get('category') ?? 'all' // all | upcoming | past
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(24, Math.max(3, Number(url.searchParams.get('pageSize') ?? '9') || 9))

    const now = new Date()
    // Filters shared by every count/list below (search + year apply across categories).
    const baseWhere: Prisma.ClubEventWhereInput = {
      deletedAt: null, // soft-deleted events are admin history only (PRD §6)
      isSeedData: false, // Section 25.2
      ...(q ? { OR: [{ title: { contains: q } }, { summary: { contains: q } }, { description: { contains: q } }] } : {}),
      ...(year && /^\d{4}$/.test(year)
        ? { startsAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${Number(year) + 1}-01-01T00:00:00.000Z`) } }
        : {}),
    }
    const pastWhere: Prisma.ClubEventWhereInput = {
      ...baseWhere,
      status: { in: ['completed', 'published', 'archived'] },
      startsAt: { lt: now },
    }
    const upcomingWhere: Prisma.ClubEventWhereInput = {
      ...baseWhere,
      status: { in: ['published'] },
      startsAt: { gte: now },
    }
    // Fallback ("all"): union of the two visible sets — never drafts or cancelled.
    const where: Prisma.ClubEventWhereInput =
      category === 'past'
        ? pastWhere
        : category === 'upcoming'
          ? upcomingWhere
          : {
              AND: [
                baseWhere,
                {
                  OR: [
                    { status: { in: ['published'] } },
                    { status: { in: ['completed', 'archived'] }, startsAt: { lt: now } },
                  ],
                },
              ],
            }

    const [total, pastTotal, upcomingTotal, events] = await Promise.all([
      db.clubEvent.count({ where }),
      db.clubEvent.count({ where: pastWhere }),
      db.clubEvent.count({ where: upcomingWhere }),
      db.clubEvent.findMany({
        where,
        orderBy: { startsAt: category === 'past' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          slug: true,
          title: true,
          summary: true,
          posterUrl: true,
          venue: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          status: true,
          featured: true,
          registrationOpen: true,
          registrationDeadline: true,
          _count: { select: { registrations: { where: { status: { in: ['confirmed', 'attended'] } } } } },
        },
      }),
    ])

    return ok({
      total,
      pastTotal,
      upcomingTotal,
      page,
      pageSize,
      events: events.map((e) => ({
        slug: e.slug,
        title: e.title,
        summary: e.summary,
        posterUrl: e.posterUrl,
        venue: e.venue,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        capacity: e.capacity,
        status: e.status,
        featured: e.featured,
        isPast: e.startsAt < now,
        registrationOpen: e.registrationOpen && e.startsAt >= now,
        registrationDeadline: e.registrationDeadline,
        registrationCount: e._count.registrations,
        seatsLeft: e.capacity ? Math.max(0, e.capacity - e._count.registrations) : null,
      })),
    })
  } catch (err) {
    return handleError(err)
  }
}
