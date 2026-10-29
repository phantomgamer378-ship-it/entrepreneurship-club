// Voice lounge (§14.2 companion): Discord-style always-on audio channels.
// GET  — channel list + live presence snapshot from the socket service.
// POST — create a channel (voice.manage). Every signed-in member can JOIN; the
//        workspace itself gates authentication, so joining needs no permission.
import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { fetchVoicePresence } from '@/lib/realtime/emit'
import { slugRoom } from '@/lib/video/provider'
import { createVoiceChannelSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return fail(401, 'Sign in to use the voice lounge.', 'unauthenticated')

    const [channels, presence] = await Promise.all([
      db.voiceChannel.findMany({ orderBy: { createdAt: 'asc' } }),
      fetchVoicePresence(),
    ])
    const byChannel = new Map<string, { userId: string; name: string; muted: boolean }[]>()
    for (const p of presence) {
      const list = byChannel.get(p.channelId) ?? []
      // Presence identity is the USER, not the socket (Discord semantics). The
      // socket service evicts same-user duplicates on join, but a snapshot can
      // still be read mid-race — dedupe here so keys stay unique downstream.
      if (!list.some((e) => e.userId === p.userId)) list.push({ userId: p.userId, name: p.name, muted: p.muted })
      byChannel.set(p.channelId, list)
    }
    return ok({
      channels: channels.map((c) => ({ id: c.id, name: c.name, topic: c.topic, createdAt: c.createdAt, presence: byChannel.get(c.id) ?? [] })),
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.voiceManage))) return fail(403, 'Not authorized to manage voice channels.', 'forbidden')
    const input = await parseBody(req, createVoiceChannelSchema)

    // Unique provider slug with collision retry.
    let channel: Awaited<ReturnType<typeof db.voiceChannel.create>> | null = null
    for (let i = 0; i < 5 && !channel; i++) {
      try {
        channel = await db.voiceChannel.create({
          data: { name: input.name, topic: input.topic || null, slug: slugRoom(`voice ${input.name}`), createdById: userId },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : ''
        if (!msg.includes('Unique constraint')) throw e
      }
    }
    if (!channel) return fail(500, 'Could not allocate a channel slug.', 'slug_collision')

    await writeAudit({ event: 'voice.channel_created', actorId: userId, targetType: 'voice_channel', targetId: channel.id, metadata: { name: channel.name } })
    return ok({ ok: true, channel }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}
