import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id: conversationId } = await params
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!membership) return fail(404, 'Conversation not found', 'not_found')
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
