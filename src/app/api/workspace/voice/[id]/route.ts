// Delete a voice channel (voice.manage). Connected members are notified via the
// socket layer and the ephemeral presence state drops out naturally.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { emitRealtime } from '@/lib/realtime/emit'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.voiceManage))) return fail(403, 'Not authorized to manage voice channels.', 'forbidden')
    const { id } = await params
    const channel = await db.voiceChannel.findUnique({ where: { id } })
    if (!channel) return fail(404, 'Voice channel not found', 'not_found')

    await db.voiceChannel.delete({ where: { id } })
    // Best-effort: kick any connected listeners out of the channel view.
    await emitRealtime(`voice:${channel.id}`, 'voice_channel_removed', { channelId: channel.id })
    await writeAudit({ event: 'voice.channel_deleted', actorId: userId, targetType: 'voice_channel', targetId: channel.id, metadata: { name: channel.name } })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
