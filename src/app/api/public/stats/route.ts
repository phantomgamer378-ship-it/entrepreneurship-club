import { db } from '@/lib/db'
import { ok, handleError } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const [memberCount, eventCount, announcementCount, applicationCount] = await Promise.all([
      db.profile.count({ where: { isPublic: true, isSeedData: false } }), // Section 25.2
      db.clubEvent.count({ where: { status: 'published', deletedAt: null, isSeedData: false } }),
      db.announcement.count({ where: { status: 'published', audience: 'public', deletedAt: null, isSeedData: false } }),
      db.memberApplication.count(),
    ])
    return ok({
      members: memberCount,
      events: eventCount,
      announcements: announcementCount,
      applications: applicationCount,
      foundedYear: 2026,
    })
  } catch (err) {
    return handleError(err)
  }
}
