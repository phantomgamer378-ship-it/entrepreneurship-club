// PRD §7.7 — admin-end-meeting. Force-end a live meeting for every participant
// (video.end_for_all — Super-Admin-exclusive). Updates the record, broadcasts a
// control event so connected clients disconnect immediately, and asks the video
// provider to end the room where the provider supports it.
import { db } from '@/lib/db'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { ApiError } from '@/lib/api'
import { getVideoProvider } from '@/lib/video/provider'
import { writeAudit } from '@/lib/audit'
import { emitRealtime, roomControlChannel } from '@/lib/realtime/emit'

export async function endMeetingForAll(actorId: string, roomId: string): Promise<void> {
  if (!(await can(actorId, PERMISSIONS.videoEndForAll))) {
    throw new ApiError(403, 'Not authorized to end meetings for all participants.', 'forbidden')
  }

  const room = await db.videoRoom.findUnique({ where: { id: roomId } })
  if (!room) throw new ApiError(404, 'Meeting not found.', 'not_found')
  if (room.status === 'ended') throw new ApiError(409, 'Meeting is already ended.', 'already_ended')

  // Resolve the ending admin's profile for the ended_by reference (PRD §6).
  const adminProfile = await db.profile.findUnique({ where: { userId: actorId }, select: { id: true } })

  await db.videoRoom.update({
    where: { id: roomId },
    data: { status: 'ended', endedById: adminProfile?.id ?? null },
  })

  // Best-effort provider teardown (Jitsi public rooms have no server lifecycle).
  try {
    await getVideoProvider().endRoom(room.slug)
  } catch {
    /* provider without server-side lifecycle — ignore */
  }

  // Realtime control event: connected clients force-disconnect immediately.
  await emitRealtime(roomControlChannel(roomId), 'force_ended', {
    roomId,
    by: actorId,
    at: new Date().toISOString(),
  })

  await writeAudit({
    event: 'video.room_ended_for_all',
    actorId,
    targetType: 'video_room',
    targetId: roomId,
    metadata: { slug: room.slug, name: room.name },
  })
}
