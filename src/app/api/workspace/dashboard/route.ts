import { db } from '@/lib/db'
import { ok, handleError, auth } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    const now = new Date()

    const [profile, unreadNotifications, upcomingEvents, latestAnnouncements, myMemberships, meetings] =
      await Promise.all([
        db.profile.findUnique({
          where: { userId },
          select: { username: true, displayName: true, clubRoleLabel: true, avatarUrl: true },
        }),
        db.notification.count({ where: { userId, readAt: null } }),
        db.clubEvent.findMany({
          where: { status: 'published', startsAt: { gte: now } },
          orderBy: { startsAt: 'asc' },
          take: 4,
          select: { slug: true, title: true, startsAt: true, venue: true },
        }),
        db.announcement.findMany({
          where: { status: 'published', audience: { in: ['public', 'members'] } },
          orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
          take: 4,
          select: { id: true, title: true, category: true, publishedAt: true },
        }),
        db.conversationMember.findMany({
          where: { userId },
          select: { lastReadAt: true, conversationId: true },
        }),
        db.videoRoom.findMany({
          where: {
            status: 'active',
            expiresAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            slug: true,
            name: true,
            startsAt: true,
            accessLevel: true,
            host: { select: { fullName: true } },
            members: { select: { userId: true } },
          },
        }),
      ])

    // Unread messages across all my conversations (sender excluded).
    let unreadMessages = 0
    for (const m of myMemberships) {
      const c = await db.message.count({
        where: {
          conversationId: m.conversationId,
          isDeleted: false,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      })
      unreadMessages += c
    }

    // Meetings visible to me: I host, I'm invited, or open to all members.
    const visibleMeetings = meetings.filter(
      (r) =>
        r.host && r.accessLevel === 'members' ||
        r.members.some((mem) => mem.userId === userId)
    )

    return ok({
      profile,
      unreadMessages,
      unreadNotifications,
      upcomingEvents,
      latestAnnouncements,
      meetings: visibleMeetings.slice(0, 4),
    })
  } catch (err) {
    return handleError(err)
  }
}
