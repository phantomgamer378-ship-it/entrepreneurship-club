// Video conferencing provider adapter (§14.2). Swapping Jitsi ↔ Daily must not
// require touching member/meeting business logic.
// - JitsiEmbedProvider: default in this deployment. No credentials needed for the
//   public meet.jit.si service; participants join via iframe embed. Documented limits
//   apply (public rooms on free infra — acceptable for club use, reviewed in DECISIONS).
// - DailyProvider: production-grade path. INACTIVE until DAILY_API_KEY is configured.
import { db } from '@/lib/db'
import { env, isDailyConfigured } from '@/lib/env'

export type JoinInfo =
  | { mode: 'embed'; url: string; roomName: string; provider: 'jitsi'; displayName: string }
  | { mode: 'token'; url: string; roomName: string; provider: 'daily'; token: string }

export interface VideoProvider {
  readonly name: 'jitsi' | 'daily'
  createRoom(roomName: string, opts: { expiresAt?: Date }): Promise<{ ok: true } | { ok: false; error: string }>
  buildJoinInfo(roomName: string, displayName: string, isHost: boolean): Promise<JoinInfo>
  endRoom(roomName: string): Promise<void>
}

function slugRoom(name: string): string {
  return (
    'ec-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) +
    '-' +
    Math.random().toString(36).slice(2, 8)
  )
}

export class JitsiEmbedProvider implements VideoProvider {
  readonly name = 'jitsi' as const
  async createRoom(): Promise<{ ok: true }> {
    // Public Jitsi rooms are created implicitly on first join.
    return { ok: true }
  }
  async buildJoinInfo(roomName: string, displayName: string): Promise<JoinInfo> {
    return { mode: 'embed', url: `https://meet.jit.si/${roomName}`, roomName, provider: 'jitsi', displayName }
  }
  async endRoom(): Promise<void> {
    /* no server-side room lifecycle on public jitsi */
  }
}

export class DailyProvider implements VideoProvider {
  readonly name = 'daily' as const
  constructor(private apiKey: string, private domain: string) {}
  async createRoom(roomName: string, opts: { expiresAt?: Date }): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const res = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName, privacy: 'private', expires_at: opts.expiresAt?.toISOString() }),
      })
      if (!res.ok) return { ok: false, error: `daily_${res.status}` }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }
  async buildJoinInfo(roomName: string, displayName: string, isHost: boolean): Promise<JoinInfo> {
    // Meeting tokens require the domain + key; scoped to owner for hosts.
    let token = ''
    try {
      const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: roomName,
          is_owner: isHost,
          user_name: displayName,
          eject_after_elapsed: 60 * 12,
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { token?: string }
        token = data.token ?? ''
      }
    } catch {
      token = ''
    }
    return { mode: 'token', url: `${this.domain}/${roomName}`, roomName, provider: 'daily', token }
  }
  async endRoom(roomName: string): Promise<void> {
    try {
      await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
    } catch {
      /* logged by caller */
    }
  }
}

let cached: VideoProvider | null = null

export function getVideoProvider(): VideoProvider {
  if (cached) return cached
  if (isDailyConfigured()) {
    cached = new DailyProvider(env.dailyApiKey!, env.dailyDomain)
  } else {
    cached = new JitsiEmbedProvider()
  }
  return cached
}

export { slugRoom }

/**
 * Server-side room access validation. RLS-equivalent: the client can never obtain
 * join info for a room it is not authorized to enter.
 */
export async function canAccessRoom(
  userId: string,
  room: { id: string; hostId: string; accessLevel: string; expiresAt: Date | null; status: string },
  grants: { key: string; scope: string }[]
): Promise<boolean> {
  if (room.status !== 'live' && room.status !== 'scheduled') return false
  if (room.expiresAt && room.expiresAt < new Date()) return false
  if (room.hostId === userId) return true
  const can = (key: string) => grants.some((g) => g.key === key)
  if (room.accessLevel === 'leads') return can('video.moderate') || can('members.role.assign')
  if (room.accessLevel === 'invitees') {
    const member = await db.videoRoomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId } },
    })
    return Boolean(member)
  }
  return can('video.create') // members
}
