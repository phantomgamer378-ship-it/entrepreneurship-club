// Realtime emit (PRD §7.7). Server-side broadcast of control events through the
// socket.io mini-service. Fire-and-fail-safe: a socket outage must never fail the
// business operation — the meeting is already ended in the database, and clients
// reconcile via polling/refetch as a fallback.
// Targets the service's INTERNAL CONTROL PLANE (:3004, localhost-only), not :3003 —
// engine.io owns every http request on :3003 (path '/' is required by the gateway),
// so plain http control routes can only live on the dedicated port.
const CHAT_SERVICE_ORIGIN = process.env.CHAT_SERVICE_ORIGIN ?? 'http://127.0.0.1:3004'
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token'

export async function emitRealtime(room: string, event: string, payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${CHAT_SERVICE_ORIGIN}/internal/emit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      body: JSON.stringify({ room, event, payload }),
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Channel contract: every connected client in a meeting room listens here. */
export function roomControlChannel(roomId: string): string {
  return `room:${roomId}:control`
}

/** Ephemeral voice-lounge presence, owned by the socket service. Fail-safe: an
 * unreachable socket service yields an empty snapshot (channels still render). */
export type VoicePresenceEntry = { channelId: string; userId: string; name: string; muted: boolean; socketId: string }

export async function fetchVoicePresence(): Promise<VoicePresenceEntry[]> {
  try {
    const res = await fetch(`${CHAT_SERVICE_ORIGIN}/internal/voice-presence`, {
      headers: { 'x-internal-token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { ok: boolean; channels?: VoicePresenceEntry[] }
    return Array.isArray(data.channels) ? data.channels : []
  } catch {
    return []
  }
}
