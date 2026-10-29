import { db } from '@/lib/db'
import { ok, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { getUserRoleKeys } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    // Any authenticated user may hit overview; stats are filtered by permissions.
    const roles = await getUserRoleKeys(userId)
    const isAdmin = await can(userId, PERMISSIONS.membersRead)
    const canReview = await can(userId, PERMISSIONS.applicationsRead)
    const canAudit = await can(userId, PERMISSIONS.auditRead)

    const now = new Date()
    const [pendingApplications, activeMembers, upcomingEvents, publishedAnnouncements, emailFailures, openReports] =
      await Promise.all([
        canReview ? db.memberApplication.count({ where: { status: 'pending' } }) : 0,
        db.user.count({ where: { isActive: true, suspendedAt: null } }),
        db.clubEvent.count({ where: { status: 'published', startsAt: { gte: now } } }),
        db.announcement.count({ where: { status: 'published' } }),
        isAdmin ? db.emailOutbox.count({ where: { status: { in: ['failed', 'dead'] } } }) : 0,
        isAdmin ? db.messageReport.count({ where: { status: 'open' } }) : 0,
      ])

    const recentApplications = canReview
      ? await db.memberApplication.findMany({
          where: { status: 'pending' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, fullName: true, email: true, interestArea: true, createdAt: true, reference: true },
        })
      : []

    const upcoming = await db.clubEvent.findMany({
      where: { status: 'published', startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 5,
      select: {
        id: true, title: true, startsAt: true, venue: true,
        _count: { select: { registrations: { where: { status: { in: ['confirmed', 'attended'] } } } } },
      },
    })

    return ok({
      viewer: { roles, permissions: { isAdmin, canReview, canAudit } },
      stats: { pendingApplications, activeMembers, upcomingEvents, publishedAnnouncements, emailFailures, openReports },
      recentApplications,
      upcomingEvents: upcoming.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, venue: e.venue, registrationCount: e._count.registrations })),
    })
  } catch (err) {
    return handleError(err)
  }
}
