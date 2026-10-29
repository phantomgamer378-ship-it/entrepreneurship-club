// PRD §7.6 — admin-create-meeting (broadcast). Distinct from Phase 5's member-created
// direct-invite rooms: targets a role, an event's registrants, or all members.
// The audience resolver is the single enforcement point for Section 25: seed/demo
// profiles are excluded server-side, never merely hidden in the UI.
import { db } from '@/lib/db'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { ApiError } from '@/lib/api'
import { getVideoProvider, slugRoom } from '@/lib/video/provider'
import { writeAudit } from '@/lib/audit'
import { enqueueEmail } from '@/lib/email/outbox'
import { templates } from '@/lib/email/templates'

export type BroadcastAudienceType = 'role' | 'event' | 'all_members' | 'direct_invite'

export type BroadcastInput = {
  title: string
  startsAt?: string
  endsAt?: string
  audienceType: BroadcastAudienceType
  audienceRef?: string
  invitedUserIds?: string[]
  origin: string
}

export type ResolvedAudience = {
  /** Active, non-seed member user ids — receive room membership + notification + email. */
  memberUserIds: string[]
  /** Guest emails (event registrants without an account) — email invite only. */
  guestEmails: string[]
}

/**
 * Resolves a broadcast audience to concrete recipients. Excludes:
 *  - profiles tagged is_seed_data = true (Section 25 — real broadcasts never invite demo rows),
 *  - inactive or suspended accounts.
 */
export async function resolveBroadcastAudience(
  actorId: string,
  input: Pick<BroadcastInput, 'audienceType' | 'audienceRef' | 'invitedUserIds'>
): Promise<ResolvedAudience> {
  const memberUserIds = new Set<string>()
  const guestEmails = new Set<string>()

  if (input.audienceType === 'role') {
    if (!input.audienceRef) throw new ApiError(422, 'audienceRef (role key) is required.', 'validation_error')
    const role = await db.role.findUnique({ where: { key: input.audienceRef } })
    if (!role) throw new ApiError(422, 'Unknown role for audience.', 'validation_error')
    const assignments = await db.userRole.findMany({
      where: {
        roleId: role.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: {
        userId: true,
        user: { select: { isActive: true, suspendedAt: true, profile: { select: { isSeedData: true } } } },
      },
    })
    for (const a of assignments) {
      if (!a.user.isActive || a.user.suspendedAt) continue
      if (a.user.profile?.isSeedData) continue // Section 25 — enforced here, not in the UI
      memberUserIds.add(a.userId)
    }
  } else if (input.audienceType === 'event') {
    if (!input.audienceRef) throw new ApiError(422, 'audienceRef (event id) is required.', 'validation_error')
    const event = await db.clubEvent.findUnique({ where: { id: input.audienceRef } })
    if (!event) throw new ApiError(422, 'Unknown event for audience.', 'validation_error')
    const regs = await db.eventRegistration.findMany({
      where: { eventId: event.id, status: 'confirmed' },
      select: {
        userId: true,
        guestEmail: true,
        user: { select: { isActive: true, suspendedAt: true, profile: { select: { isSeedData: true } } } },
      },
    })
    for (const r of regs) {
      if (r.userId && r.user) {
        if (!r.user.isActive || r.user.suspendedAt) continue
        if (r.user.profile?.isSeedData) continue // Section 25
        memberUserIds.add(r.userId)
      } else if (r.guestEmail) {
        // Guests have no account: email invite only, never a room-membership row (PRD §7.6 step 1).
        guestEmails.add(r.guestEmail.toLowerCase())
      }
    }
  } else if (input.audienceType === 'all_members') {
    const actives = await db.user.findMany({
      where: { isActive: true, suspendedAt: null },
      select: { id: true, profile: { select: { isSeedData: true } } },
    })
    for (const u of actives) {
      if (u.profile?.isSeedData) continue // Section 25 — a real broadcast must never invite a seed/demo row
      memberUserIds.add(u.id)
    }
  } else {
    // direct_invite — the invited list itself passes through the same seed filter.
    for (const id of input.invitedUserIds ?? []) memberUserIds.add(id)
    const users = await db.user.findMany({
      where: { id: { in: [...memberUserIds] } },
      select: { id: true, isActive: true, suspendedAt: true, profile: { select: { isSeedData: true } } },
    })
    memberUserIds.clear()
    for (const u of users) {
      if (!u.isActive || u.suspendedAt) continue
      if (u.profile?.isSeedData) continue // Section 25
      memberUserIds.add(u.id)
    }
  }

  memberUserIds.delete(actorId) // the host doesn't invite themselves
  return { memberUserIds: [...memberUserIds], guestEmails: [...guestEmails] }
}

export async function createBroadcastMeeting(
  actorId: string,
  input: BroadcastInput
): Promise<{ roomId: string; invitedCount: number }> {
  if (!(await can(actorId, PERMISSIONS.videoCreateBroadcast))) {
    throw new ApiError(403, 'Not authorized to create broadcast meetings.', 'forbidden')
  }
  if (!input.title?.trim()) throw new ApiError(422, 'title is required.', 'validation_error')
  if ((input.audienceType === 'role' || input.audienceType === 'event') && !input.audienceRef) {
    throw new ApiError(422, 'audienceRef is required for role/event audiences.', 'validation_error')
  }
  if (input.audienceType === 'direct_invite' && !(input.invitedUserIds?.length)) {
    throw new ApiError(422, 'invitedUserIds is required for direct invites.', 'validation_error')
  }

  const audience = await resolveBroadcastAudience(actorId, input)

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const provider = getVideoProvider()
  const slug = slugRoom(input.title)
  const created = await provider.createRoom(slug, { expiresAt: input.endsAt ? new Date(input.endsAt) : undefined })
  if (!created.ok) {
    return Promise.reject(new ApiError(502, `Video provider rejected room creation: ${created.error}.`, 'provider_error'))
  }

  const room = await db.videoRoom.create({
    data: {
      slug,
      name: input.title,
      hostId: actorId,
      createdById: actorId,
      provider: provider.name,
      status: startsAt.getTime() <= Date.now() ? 'live' : 'scheduled',
      accessLevel: 'invitees',
      audienceType: input.audienceType,
      audienceRef: input.audienceRef ?? null,
      startsAt,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      members: {
        create: audience.memberUserIds.map((userId) => ({ userId, role: 'participant' })),
      },
    },
  })

  // One in-app notification + one outbox email per resolved recipient
  // (idempotency key per recipient — safe to retry the whole operation).
  if (audience.memberUserIds.length > 0) {
    await db.notification.createMany({
      data: audience.memberUserIds.map((userId) => ({
        userId,
        type: 'meeting',
        title: `Meeting invitation: ${input.title}`,
        body: input.startsAt ? `Scheduled for ${new Date(input.startsAt).toLocaleString('en-IN')}.` : 'Starting now.',
        link: `/workspace/meet/${room.id}`,
      })),
    })
    const recipients = await db.user.findMany({
      where: { id: { in: audience.memberUserIds } },
      select: { id: true, email: true },
    })
    const when = startsAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })
    const note =
      input.audienceType === 'all_members'
        ? 'This meeting is open to all club members.'
        : input.audienceType === 'role'
          ? 'You are invited as part of your club role.'
          : input.audienceType === 'event'
            ? 'You are invited as a registered participant of the related event.'
            : undefined
    for (const r of recipients) {
      const tpl = templates.meetingInvite(input.title, when, `${input.origin}/#/workspace/meet/${room.id}`, note)
      await enqueueEmail({
        idempotencyKey: `meeting:${room.id}:recipient:${r.id}`,
        category: 'meeting_invite',
        to: r.email,
        subject: tpl.subject,
        html: tpl.html,
        text: `Meeting invitation: ${input.title} — ${when}. Join via the member workspace.`,
        relatedType: 'video_room',
        relatedId: room.id,
      })
    }
  }
  // Guests (event registrants without accounts) get an email only.
  for (const email of audience.guestEmails) {
    const when = startsAt.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })
    const tpl = templates.meetingInvite(input.title, when, `${input.origin}/#/events`)
    await enqueueEmail({
      idempotencyKey: `meeting:${room.id}:guest:${email}`,
      category: 'meeting_invite',
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: `Meeting invitation: ${input.title} — ${when}.`,
      relatedType: 'video_room',
      relatedId: room.id,
    })
  }

  const invitedCount = audience.memberUserIds.length + audience.guestEmails.length
  await writeAudit({
    event: 'video.room_created',
    actorId,
    targetType: 'video_room',
    targetId: room.id,
    metadata: {
      broadcast: true,
      audienceType: input.audienceType,
      audienceRef: input.audienceRef ?? null,
      invitedCount,
      members: audience.memberUserIds.length,
      guests: audience.guestEmails.length,
    },
  })
  return { roomId: room.id, invitedCount }
}
