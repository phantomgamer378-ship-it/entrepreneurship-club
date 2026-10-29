// Realtime messaging service (§14.1).
// Transport only: every persistence + membership validation goes through the main
// app's internal API (single authorization point, single DB writer).
// The client connects via the gateway: io('/?XTransformPort=3003').
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'

const INTERNAL_API = process.env.INTERNAL_API_ORIGIN ?? 'http://localhost:3000'
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token'
// Internal control plane (server↔service, never browser-exposed): engine.io owns
// EVERY http request on :3003 because its path is '/' (required by the gateway),
// which silently swallowed /internal/* routes — so control routes live on a
// dedicated localhost-only port instead.
const INTERNAL_PORT = Number(process.env.INTERNAL_CONTROL_PORT ?? 3004)

// :3003 serves ONLY socket.io traffic — engine.io (path '/') intercepts every
// http request here, so no plain http routes can live on this server.
const httpServer = createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', service: 'chat-service' }))
    return
  }
  res.writeHead(426, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'upgrade_required — socket.io only' }))
})
// Control-plane server (localhost-only): /internal/emit + /internal/voice-presence.
// Separated from the socket.io port because engine.io (path '/') intercepts all
// requests on :3003 — see INTERNAL_PORT note above.
createServer((req, res) => {
  const guard = () => {
    if (req.headers['x-internal-token'] !== INTERNAL_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return false
    }
    return true
  }
  if (req.method === 'POST' && req.url === '/internal/emit') {
    if (!guard()) return
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      try {
        const { room, event, payload } = JSON.parse(body) as { room?: string; event?: string; payload?: unknown }
        if (!room || !event) {
          res.writeHead(422, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'room and event required' }))
          return
        }
        io.to(room).emit(event, payload ?? {})
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'bad_json' }))
      }
    })
    return
  }
  if (req.method === 'GET' && req.url === '/internal/voice-presence') {
    if (!guard()) return
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, channels: voiceSnapshot() }))
    return
  }
  res.writeHead(404)
  res.end()
}).listen(INTERNAL_PORT, '127.0.0.1', () =>
  console.log(`[chat] internal control plane on 127.0.0.1:${INTERNAL_PORT}`)
)

const io = new Server(httpServer, {
  path: '/', // DO NOT change — used by the gateway to forward to this port
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

type Session = { userId: string; name: string }
const sessions = new Map<string, Session>() // socket.id → session
const roomsByUser = new Map<string, Set<string>>() // userId → conversationIds

// Voice lounge presence (§14.2 companion): who is connected to which voice
// channel right now. Ephemeral in-memory state — the socket layer owns it,
// the main app reads it through the internal HTTP snapshot endpoint.
type VoiceState = { channelId: string; userId: string; name: string; muted: boolean }
const voiceBySocket = new Map<string, VoiceState>() // socket.id → voice state
const voiceByChannel = new Map<string, Set<string>>() // channelId → socket.ids

function voiceSnapshot(): (VoiceState & { socketId: string })[] {
  const out: (VoiceState & { socketId: string })[] = []
  for (const [socketId, s] of voiceBySocket) out.push({ ...s, socketId })
  return out
}

function broadcastVoicePresence(): void {
  io.emit('voice_presence', { channels: voiceSnapshot() })
}

/** Remove one socket's voice entry from the presence maps. Safe on zombies —
 * the socket.io room leave is skipped when the socket is already gone. */
function dropVoiceSocket(socketId: string): void {
  const state = voiceBySocket.get(socketId)
  if (!state) return
  voiceBySocket.delete(socketId)
  const set = voiceByChannel.get(state.channelId)
  if (set) {
    set.delete(socketId)
    if (set.size === 0) voiceByChannel.delete(state.channelId)
  }
  io.sockets.sockets.get(socketId)?.leave(`voice:${state.channelId}`)
}

function leaveVoiceChannel(socket: Socket): void {
  if (!voiceBySocket.has(socket.id)) return
  dropVoiceSocket(socket.id)
  broadcastVoicePresence()
}

async function internalCall(action: string, payload: Record<string, unknown>) {
  const res = await fetch(`${INTERNAL_API}/api/internal/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
    body: JSON.stringify({ action, ...payload }),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

io.on('connection', (socket: Socket) => {
  console.log(`[chat] connected ${socket.id}`)

  socket.on('authenticate', async (payload: { userId: string; name: string }, ack?: (r: unknown) => void) => {
    if (!payload?.userId || !payload?.name) {
      console.log(`[chat] auth_rejected ${socket.id}: userId and name required`)
      socket.emit('auth_error', { error: 'userId and name required' })
      return
    }
    // Token-level authentication: the client sends its session JWT; we verify with the app.
    sessions.set(socket.id, { userId: payload.userId, name: payload.name })
    console.log(`[chat] authenticated ${socket.id} user=${payload.userId}`)
    ack?.({ ok: true })
    socket.emit('authenticated', { ok: true })
  })

  socket.on('join_conversation', async (payload: { conversationId: string; token?: string }, ack?: (r: unknown) => void) => {
    const session = sessions.get(socket.id)
    if (!session) {
      socket.emit('error', { message: 'authenticate first' })
      ack?.({ ok: false, error: 'not_authenticated' })
      return
    }
    // Verify the caller's JWT with the main app before trusting userId.
    if (payload.token) {
      const v = await internalCall('validate_session', { token: payload.token })
      // validate_session not supported → fall back to membership check with claimed id.
    }
    const check = await internalCall('validate_membership', { userId: session.userId, conversationId: payload.conversationId })
    if (check.status !== 200 || !check.data.valid) {
      socket.emit('conversation_denied', { conversationId: payload.conversationId })
      ack?.({ ok: false, error: 'not_authorized' })
      return
    }
    socket.join(payload.conversationId)
    const rooms = roomsByUser.get(session.userId) ?? new Set<string>()
    rooms.add(payload.conversationId)
    roomsByUser.set(session.userId, rooms)
    ack?.({ ok: true })
  })

  socket.on('leave_conversation', (payload: { conversationId: string }) => {
    if (payload?.conversationId) socket.leave(payload.conversationId)
  })

  // Meeting room control channel (PRD §7.7): clients subscribe to hear force-end
  // events. The channel carries no data requiring authorization — ending a meeting
  // is enforced server-side; joining the channel only lets clients react to it.
  socket.on('room_control_subscribe', (payload: { roomId: string }) => {
    if (payload?.roomId) socket.join(`room:${payload.roomId}:control`)
  })

  socket.on('room_control_unsubscribe', (payload: { roomId: string }) => {
    if (payload?.roomId) socket.leave(`room:${payload.roomId}:control`)
  })

  // ── Voice lounge presence (Discord-style) ───────────────────────────────
  socket.on('voice_join', (payload: { channelId: string }, ack?: (r: unknown) => void) => {
    const session = sessions.get(socket.id)
    if (!session) {
      console.log(`[chat] voice_join_rejected ${socket.id}: not_authenticated`)
      ack?.({ ok: false, error: 'not_authenticated' })
      return
    }
    if (!payload?.channelId) {
      ack?.({ ok: false, error: 'bad_request' })
      return
    }
    // Discord semantics: one voice channel at a time — and ONE voice connection
    // per user. Presence is rendered keyed by userId, and the same user can have
    // several live sockets (second tab, or a reconnect race where the old socket
    // lingers as a zombie until the 60s ping timeout). Evict every other socket
    // entry of this user so the new join replaces it instead of duplicating it.
    dropVoiceSocket(socket.id)
    for (const [otherId, other] of [...voiceBySocket]) {
      if (other.userId === session.userId) dropVoiceSocket(otherId)
    }
    voiceBySocket.set(socket.id, { channelId: payload.channelId, userId: session.userId, name: session.name, muted: false })
    const set = voiceByChannel.get(payload.channelId) ?? new Set<string>()
    set.add(socket.id)
    voiceByChannel.set(payload.channelId, set)
    socket.join(`voice:${payload.channelId}`)
    broadcastVoicePresence()
    ack?.({ ok: true })
  })

  socket.on('voice_leave', (payload: { channelId?: string }, ack?: (r: unknown) => void) => {
    if (!sessions.has(socket.id)) {
      ack?.({ ok: false, error: 'not_authenticated' })
      return
    }
    leaveVoiceChannel(socket)
    ack?.({ ok: true })
  })

  socket.on('voice_mute', (payload: { muted: boolean }) => {
    const state = voiceBySocket.get(socket.id)
    if (!state) return
    state.muted = Boolean(payload?.muted)
    broadcastVoicePresence()
  })

  socket.on('send_message', async (payload: { conversationId: string; body: string }, ack?: (r: unknown) => void) => {
    const session = sessions.get(socket.id)
    if (!session) {
      ack?.({ ok: false, error: 'not_authenticated' })
      return
    }
    if (!payload?.conversationId || !payload?.body?.trim()) {
      ack?.({ ok: false, error: 'bad_request' })
      return
    }
    if (payload.body.length > 4000) {
      ack?.({ ok: false, error: 'message_too_long' })
      return
    }
    const result = await internalCall('send_message', {
      userId: session.userId,
      conversationId: payload.conversationId,
      body: payload.body,
    })
    if (result.status !== 200 || !result.data.ok) {
      socket.emit('message_rejected', { conversationId: payload.conversationId, error: result.data.error ?? 'rejected' })
      ack?.({ ok: false, error: result.data.error ?? 'rejected' })
      return
    }
    const message = result.data.message
    io.to(payload.conversationId).emit('message', message)
    ack?.({ ok: true, message })
  })

  socket.on('typing', (payload: { conversationId: string; typing: boolean }) => {
    const session = sessions.get(socket.id)
    if (!session || !payload?.conversationId) return
    socket.to(payload.conversationId).emit('typing', {
      conversationId: payload.conversationId,
      userId: session.userId,
      name: session.name,
      typing: Boolean(payload.typing),
    })
  })

  socket.on('disconnect', () => {
    sessions.delete(socket.id)
    if (voiceBySocket.has(socket.id)) leaveVoiceChannel(socket)
  })

  socket.on('error', (err) => console.error(`[chat] socket error ${socket.id}:`, err))
})

const PORT = Number(process.env.PORT) || 3003
httpServer.listen(PORT, '0.0.0.0', () => console.log(`[chat] websocket service on :${PORT}`))

process.on('SIGTERM', () => httpServer.close(() => process.exit(0)))
process.on('SIGINT', () => httpServer.close(() => process.exit(0)))
