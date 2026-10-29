// Internal API for the socket.io chat mini-service. Requires the shared service token.
// The socket service NEVER talks to the DB directly — all persistence and membership
// validation flows through here so there is a single writer and a single authorization point.
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

function authorized(req: Request): boolean {
  return req.headers.get('x-internal-token') === env.internalServiceToken
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as {
    action?: string
    userId?: string
    conversationId?: string
    body?: string
  } | null
  if (!body?.action || !body.userId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  if (body.action === 'validate_membership') {
    if (!body.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: body.conversationId, userId: body.userId } },
      select: { id: true, user: { select: { isActive: true, suspendedAt: true } } },
    })
    const valid = Boolean(membership) && membership!.user.isActive && !membership!.user.suspendedAt
    return NextResponse.json({ valid })
  }

  if (body.action === 'send_message') {
    if (!body.conversationId || !body.body?.trim()) {
      return NextResponse.json({ error: 'conversationId and body required' }, { status: 400 })
    }
    const membership = await db.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: body.conversationId, userId: body.userId } },
      select: { id: true, user: { select: { isActive: true, suspendedAt: true, fullName: true, profile: { select: { displayName: true, avatarUrl: true } } } } },
    })
    if (!membership || !membership.user.isActive || membership.user.suspendedAt) {
      return NextResponse.json({ error: 'Not a member of this conversation' }, { status: 403 })
    }
    const message = await db.message.create({
      data: { conversationId: body.conversationId, senderId: body.userId, body: body.body.trim().slice(0, 4000) },
    })
    await db.conversation.update({ where: { id: body.conversationId }, data: { lastMessageAt: new Date() } })
    await db.conversationMember.update({
      where: { conversationId_userId: { conversationId: body.conversationId, userId: body.userId } },
      data: { lastReadAt: new Date() },
    })
    return NextResponse.json({
      ok: true,
      message: {
        id: message.id,
        conversationId: message.conversationId,
        body: message.body,
        createdAt: message.createdAt,
        senderId: message.senderId,
        senderName: membership.user.profile?.displayName ?? membership.user.fullName,
        senderAvatar: membership.user.profile?.avatarUrl ?? null,
      },
    })
  }

  if (body.action === 'members') {
    if (!body.conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    const members = await db.conversationMember.findMany({
      where: { conversationId: body.conversationId },
      select: { userId: true },
    })
    return NextResponse.json({ userIds: members.map((m) => m.userId) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
