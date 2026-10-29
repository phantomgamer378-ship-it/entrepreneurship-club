import { db } from '@/lib/db'
import { ok, fail, handleError } from '@/lib/api'
import { getSessionUserId } from '@/lib/auth/session'
import { getUserGrants } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const announcement = await db.announcement.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: { _count: false },
    })
    // Section 25.2 + PRD §6 — seed rows and soft-deleted announcements never render publicly.
    if (
      !announcement ||
      announcement.status !== 'published' ||
      announcement.isSeedData ||
      announcement.deletedAt
    ) {
      return fail(404, 'Announcement not found', 'not_found')
    }

    // Audience enforcement mirrors the listing route.
    if (announcement.audience !== 'public') {
      const userId = await getSessionUserId()
      if (!userId) return fail(404, 'Announcement not found', 'not_found') // don't reveal existence
      const grants = await getUserGrants(userId)
      const isMember = grants.length > 0
      const isLead = grants.some((g) =>
        ['announcements.publish', 'members.role.assign', 'applications.review'].includes(g.key)
      )
      if (announcement.audience === 'members' && !isMember) return fail(404, 'Announcement not found', 'not_found')
      if (announcement.audience === 'leads' && !isLead) return fail(404, 'Announcement not found', 'not_found')
    }

    return ok({
      id: announcement.id,
      title: announcement.title,
      slug: announcement.slug,
      body: announcement.body,
      category: announcement.category,
      audience: announcement.audience,
      pinned: announcement.pinned,
      publishedAt: announcement.publishedAt,
    })
  } catch (err) {
    return handleError(err)
  }
}
