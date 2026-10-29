// Conversation detail: only participants can read messages (§10). Access is
// re-validated on every call — the socket layer re-checks the same rule.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth()
    const { id: conversationId } = await params
    const url = new URL(req.url)
    const cursor = url.searchParams.get('cursor') ?? undefined
    const limit = Math.min(50, Math.max(10, Number(url.searchParams.get('limit') ?? '30') || 30))

    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!membership) return fail(404, 'Conversation not found', 'not_found')

    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        type: true,
        name: true,
        createdAt: true,
        members: {
          select: { userId: true, memberRole: true, user: { select: { fullName: true, profile: { select: { displayName: true, username: true, avatarUrl: true } } } } },
        },
      },
    })
    if (!conversation) return fail(404, 'Conversation not found', 'not_found')

    const messages = await db.message.findMany({
      where: { conversationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        body: true,
        createdAt: true,
        senderId: true,
        sender: { select: { fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    })

    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    })

    return ok({
      conversation: {
        ...conversation,
        name:
          conversation.name ??
          conversation.members.find((m) => m.userId !== userId)?.user.profile?.displayName ??
          conversation.members.find((m) => m.userId !== userId)?.user.fullName ??
          'Conversation',
      },
      messages: messages.reverse(),
      nextCursor: messages.length === limit ? messages[0].id : null,
    })
  } catch (err) {
    return handleError(err)
  }
}
