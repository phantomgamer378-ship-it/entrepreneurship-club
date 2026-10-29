import { db } from '@/lib/db'
import { ok, handleError } from '@/lib/api'
import { getSessionUserId } from '@/lib/auth/session'
import { getUserGrants } from '@/lib/rbac/authorize'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

/** Audience-aware announcement listing (§5.5): public for everyone; members/leads only in-session. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const category = url.searchParams.get('category') ?? ''
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(24, Math.max(3, Number(url.searchParams.get('pageSize') ?? '9') || 9))

    let audienceFilter: Prisma.AnnouncementWhereInput = { audience: 'public' }
    const userId = await getSessionUserId()
    if (userId) {
      const grants = await getUserGrants(userId)
      const isMember = grants.length > 0
      const isLead = grants.some((g) =>
        ['announcements.publish', 'members.role.assign', 'applications.review'].includes(g.key)
      )
      audienceFilter = isLead ? {} : isMember ? { audience: { in: ['public', 'members'] } } : { audience: 'public' }
    }

    const where = {
      status: 'published' as const,
      deletedAt: null, // soft-deleted announcements are admin history only (PRD §6)
      isSeedData: false, // Section 25.2
      ...audienceFilter,
      ...(q ? { OR: [{ title: { contains: q } }, { body: { contains: q } }] } : {}),
      ...(category ? { category } : {}),
    }

    const [total, announcements] = await Promise.all([
      db.announcement.count({ where }),
      db.announcement.findMany({
        where,
        orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, title: true, slug: true, category: true, audience: true, pinned: true, publishedAt: true, body: true },
      }),
    ])

    return ok({
      total,
      page,
      pageSize,
      announcements: announcements.map((a) => ({ ...a, excerpt: a.body.slice(0, 220) })),
    })
  } catch (err) {
    return handleError(err)
  }
}
