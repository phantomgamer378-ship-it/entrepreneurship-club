// Join a meeting: server validates access and returns provider join info.
// Video streams never transit through our servers or Supabase/Realtime (§14.2).
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { getUserGrants, PERMISSIONS } from '@/lib/rbac/authorize'
import { getVideoProvider, canAccessRoom } from '@/lib/video/provider'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id } = await params

    const room = await db.videoRoom.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        provider: true,
        status: true,
        accessLevel: true,
        expiresAt: true,
        hostId: true,
        host: { select: { fullName: true, profile: { select: { displayName: true } } } },
      },
    })
    if (!room) return fail(404, 'Meeting not found', 'not_found')

    const grants = await getUserGrants(userId)
    const allowed = await canAccessRoom(userId, room, grants)
    if (!allowed) {
      await writeAudit({ event: 'video.room_access_denied', actorId: userId, targetType: 'video_room', targetId: room.id })
      return fail(403, 'You do not have access to this meeting.', 'forbidden')
    }

    const me = await db.user.findUnique({
      where: { id: userId },
      select: { fullName: true, profile: { select: { displayName: true } } },
    })
    const displayName = me?.profile?.displayName || me?.fullName || 'Guest'
    const isHost = room.hostId === userId

    const provider = getVideoProvider()
    const joinInfo = await provider.buildJoinInfo(room.slug, displayName, isHost)
    return ok({ ok: true, room: { id: room.id, name: room.name, hostName: room.host.profile?.displayName ?? room.host.fullName }, joinInfo })
  } catch (err) {
    return handleError(err)
  }
}

/** Host ends the room. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id } = await params
    const room = await db.videoRoom.findUnique({ where: { id }, select: { id: true, slug: true, hostId: true } })
    if (!room) return fail(404, 'Meeting not found', 'not_found')
    if (room.hostId !== userId) {
      await writeAudit({ event: 'video.room_access_denied', actorId: userId, targetType: 'video_room', targetId: room.id, metadata: { action: 'end' } })
      return fail(403, 'Only the host can end this meeting.', 'forbidden')
    }
    const provider = getVideoProvider()
    await provider.endRoom(room.slug)
    await db.videoRoom.update({ where: { id: room.id }, data: { status: 'ended' } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
