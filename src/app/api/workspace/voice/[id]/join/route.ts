// Join a voice channel: server validates the session and returns provider join
// info for an AUDIO-FIRST room (video starts muted). Streams never transit our
// backend (§14.2). Joining needs no permission beyond being signed in.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { getVideoProvider } from '@/lib/video/provider'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!userId) return fail(401, 'Sign in to use the voice lounge.', 'unauthenticated')
    const { id } = await params

    const channel = await db.voiceChannel.findUnique({ where: { id } })
    if (!channel) return fail(404, 'Voice channel not found', 'not_found')

    const me = await db.user.findUnique({
      where: { id: userId },
      select: { isActive: true, suspendedAt: true, fullName: true, profile: { select: { displayName: true } } },
    })
    if (!me || !me.isActive || me.suspendedAt) return fail(403, 'Your account cannot use voice channels.', 'forbidden')

    const displayName = me.profile?.displayName || me.fullName || 'Guest'
    const provider = getVideoProvider()
    const joinInfo = await provider.buildJoinInfo(channel.slug, displayName, false)
    await writeAudit({ event: 'voice.channel_joined', actorId: userId, targetType: 'voice_channel', targetId: channel.id, metadata: { provider: joinInfo.provider } })
    return ok({ ok: true, channel: { id: channel.id, name: channel.name, topic: channel.topic }, joinInfo })
  } catch (err) {
    return handleError(err)
  }
}
