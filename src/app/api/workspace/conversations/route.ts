import { db } from '@/lib/db'
import { ok, fail, handleError, parseBody, auth } from '@/lib/api'
import { createConversationSchema, sendMessageSchema } from '@/lib/validations'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'
import { revalidateUserGrants } from '@/lib/rbac/authorize'

export const dynamic = 'force-dynamic'

/** List my conversations with unread counts + peer info. */
export async function GET() {
  try {
    const { userId } = await auth()
    const memberships = await db.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          select: {
            id: true,
            type: true,
            name: true,
            lastMessageAt: true,
            members: { select: { userId: true, user: { select: { fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } } },
            messages: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, senderId: true } },
          },
        },
      },
    })

    const conversations = []
    for (const m of memberships) {
      const unread = await db.message.count({
        where: {
          conversationId: m.conversationId,
          isDeleted: false,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      })
      const peer =
        m.conversation.type === 'direct'
          ? m.conversation.members.find((x) => x.userId !== userId)?.user ?? null
          : null
      conversations.push({
        id: m.conversation.id,
        type: m.conversation.type,
        name: m.conversation.name ?? peer?.profile?.displayName ?? peer?.fullName ?? 'Conversation',
        peerUsername: peer?.profile ? undefined : undefined,
        lastMessage: m.conversation.messages[0] ?? null,
        lastMessageAt: m.conversation.lastMessageAt ?? m.conversation.messages[0]?.createdAt ?? m.conversation.members ? m.conversation.lastMessageAt : null,
        unread,
      })
    }

    conversations.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })

    return ok({ conversations })
  } catch (err) {
    return handleError(err)
  }
}

/** Start a direct or group conversation. Direct conversations are deduplicated. */
export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.messagesUse))) {
      return fail(403, 'Messaging is not enabled for your account.', 'forbidden')
    }
    const input = await parseBody(req, createConversationSchema)

    const memberIds = [...new Set([userId, ...input.memberIds])].slice(0, 50)
    if (input.type === 'direct') {
      if (memberIds.length !== 2) return fail(400, 'A direct conversation needs exactly one other member.', 'invalid_members')
      // Deduplicate: find a direct conversation containing exactly these two.
      const candidates = await db.conversation.findMany({
        where: { type: 'direct', members: { every: { userId: { in: memberIds } } } },
        include: { members: true },
      })
      const existing = candidates.find(
        (c) => c.members.length === 2 && c.members.every((m) => memberIds.includes(m.userId))
      )
      if (existing) return ok({ ok: true, conversationId: existing.id, existing: true })
    }

    const conversation = await db.conversation.create({
      data: {
        type: input.type,
        name: input.type === 'group' ? input.name || 'Group conversation' : null,
        createdById: userId,
        members: {
          create: memberIds.map((id) => ({ userId: id, memberRole: id === userId ? 'moderator' : 'member' })),
        },
      },
    })
    return ok({ ok: true, conversationId: conversation.id, existing: false })
  } catch (err) {
    return handleError(err)
  }
}

/** Send a message (HTTP persistence path — socket.io also fans out via internal API). */
export async function PUT(req: Request) {
  try {
    const { userId } = await auth()
    const conversationId = new URL(req.url).searchParams.get('conversationId') ?? ''
    const input = await parseBody(req, sendMessageSchema)
    if (!conversationId) return fail(400, 'conversationId is required', 'missing_param')

    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    })
    if (!membership) {
      // Deny without revealing whether the conversation exists.
      return fail(404, 'Conversation not found', 'not_found')
    }

    const message = await db.message.create({
      data: { conversationId, senderId: userId, body: input.body },
    })
    await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    })
    return ok({ ok: true, message })
  } catch (err) {
    return handleError(err)
  }
}
