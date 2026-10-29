// PRD §7.6 — control meetings: list broadcast/live meetings and create broadcast
// meetings targeted at a role, an event's registrants, or all members.
// Guard: video.create.broadcast. The audience resolver excludes seed/demo profiles
// server-side (Section 25) and skips inactive/suspended accounts.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { createBroadcastMeeting } from '@/lib/admin/broadcast-meeting'
import { broadcastMeetingSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.videoCreateBroadcast))) {
      return fail(403, 'Not authorized to view broadcast meetings.', 'forbidden')
    }
    const rooms = await db.videoRoom.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        slug: true,
        name: true,
        provider: true,
        status: true,
        accessLevel: true,
        audienceType: true,
        audienceRef: true,
        startsAt: true,
        endsAt: true,
        expiresAt: true,
        endedById: true,
        createdAt: true,
        host: { select: { fullName: true, profile: { select: { displayName: true } } } },
        _count: { select: { members: true } },
      },
    })
    return ok({ rooms })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, broadcastMeetingSchema)
    const origin = new URL(req.url).origin
    const result = await createBroadcastMeeting(userId, { ...input, origin })
    return ok({ ok: true, ...result }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
