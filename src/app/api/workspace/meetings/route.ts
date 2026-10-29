// Video meetings (§14.2): authorized creation, server-side room access, provider adapter.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { createMeetingSchema } from '@/lib/validations'
import { can, PERMISSIONS, getUserGrants } from '@/lib/rbac/authorize'
import { getVideoProvider, slugRoom } from '@/lib/video/provider'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    const grants = await getUserGrants(userId)
    const isMember = grants.some((g) => g.key === PERMISSIONS.videoCreate)
    const rooms = await db.videoRoom.findMany({
      where: {
        status: { in: ['scheduled', 'live'] }, // PRD §9 lifecycle: scheduled → live → ended
        ...(isMember ? {} : { members: { some: { userId } } }),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        slug: true,
        name: true,
        provider: true,
        status: true,
        accessLevel: true,
        startsAt: true,
        expiresAt: true,
        hostId: true,
        host: { select: { fullName: true, profile: { select: { displayName: true } } } },
        members: { select: { userId: true, role: true, user: { select: { fullName: true, profile: { select: { displayName: true } } } } } },
      },
    })
    const visible = rooms.filter(
      (r) =>
        r.hostId === userId ||
        r.accessLevel === 'members' ||
        (r.accessLevel === 'leads' && grants.some((g) => g.key === PERMISSIONS.videoModerate)) ||
        r.members.some((m) => m.userId === userId)
    )
    return ok({ rooms: visible })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.videoCreate))) {
      await writeAudit({ event: 'video.room_access_denied', actorId: userId, metadata: { action: 'create' } })
      return fail(403, 'You are not allowed to create meetings.', 'forbidden')
    }
    const input = await parseBody(req, createMeetingSchema)
    const me = await db.user.findUnique({ where: { id: userId }, select: { fullName: true } })

    const slug = slugRoom(input.name)
    const provider = getVideoProvider()
    const expiresAt = new Date(Date.now() + input.expiresHours * 3600_000)
    const created = await provider.createRoom(slug, { expiresAt })
    if (!created.ok) {
      return fail(502, `Video provider rejected room creation: ${created.error}. Integration may be misconfigured.`, 'provider_error')
    }

    const room = await db.videoRoom.create({
      data: {
        slug,
        name: input.name,
        hostId: userId,
        createdById: userId,
        provider: provider.name,
        status: input.startsAt && new Date(input.startsAt).getTime() > Date.now() ? 'scheduled' : 'live',
        accessLevel: input.accessLevel,
        startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
        audienceType: 'direct_invite',
        expiresAt,
        members: {
          create: (input.inviteeIds ?? [])
            .filter((id) => id !== userId)
            .map((id) => ({ userId: id, role: 'participant' })),
        },
      },
    })

    // In-app invitations.
    const invitees = (input.inviteeIds ?? []).filter((id) => id !== userId)
    if (invitees.length > 0) {
      await db.notification.createMany({
        data: invitees.map((uid) => ({
          userId: uid,
          type: 'meeting',
          title: `Meeting invitation: ${input.name}`,
          body: `${me?.fullName ?? 'A member'} invited you to a meeting.`,
          link: `/workspace/meet/${room.id}`,
        })),
      })
    }

    await writeAudit({ event: 'video.room_created', actorId: userId, targetType: 'video_room', targetId: room.id, metadata: { provider: provider.name, accessLevel: input.accessLevel } })
    return ok({ ok: true, room: { id: room.id, slug: room.slug, name: room.name } })
  } catch (err) {
    return handleError(err)
  }
}
