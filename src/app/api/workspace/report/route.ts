import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { reportMessageSchema } from '@/lib/validations'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** Report a message for moderation (members can report; moderation queue in control panel). */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    const input = await parseBody(req, reportMessageSchema)
    const message = await db.message.findUnique({
      where: { id: input.messageId },
      select: { id: true, conversationId: true },
    })
    if (!message) return fail(404, 'Message not found', 'not_found')
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: message.conversationId, userId } },
    })
    if (!membership) return fail(404, 'Message not found', 'not_found')

    const already = await db.messageReport.findFirst({
      where: { messageId: message.id, reporterId: userId, status: 'open' },
    })
    if (already) return fail(409, 'You already reported this message.', 'already_reported')

    await db.$transaction([
      db.messageReport.create({ data: { messageId: message.id, reporterId: userId, reason: input.reason } }),
      db.message.update({ where: { id: message.id }, data: { reportCount: { increment: 1 } } }),
    ])
    await writeAudit({ event: 'moderation.report_filed', actorId: userId, targetType: 'message', targetId: message.id })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
