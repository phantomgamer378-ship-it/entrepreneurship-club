/**
 * Regression test for the duplicate-presence bug (Task 9b).
 * Bug: voice presence was keyed per SOCKET, so the same user with two live
 * sockets (second tab / reconnect zombie) produced two entries with the same
 * userId → React duplicate-key error on <li key={p.userId}> in voice.tsx.
 * Fix: voice_join now evicts every other socket entry of the same user.
 *
 * Scenarios:
 *  1. Two sockets, SAME user, same channel   → snapshot must hold 1 entry
 *  2. Third socket, DIFFERENT user, same ch  → snapshot must hold 2 entries
 *  3. All disconnect                         → snapshot must be empty
 */
import { io, type Socket } from 'socket.io-client'

const URL = 'http://127.0.0.1:3003'
const CTRL = 'http://127.0.0.1:3004'
const TOKEN = process.env.INTERNAL_SERVICE_TOKEN ?? 'dev-internal-token'
const CH = 'test-channel-regression'

function connect(userId: string, name: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'] })
    const t = setTimeout(() => reject(new Error(`connect timeout for ${userId}`)), 5000)
    s.on('connect', () => {
      s.emit('authenticate', { userId, name })
    })
    s.on('authenticated', () => {
      clearTimeout(t)
      resolve(s)
    })
    s.on('connect_error', (e) => {
      clearTimeout(t)
      reject(e)
    })
  })
}

function join(s: Socket, channelId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('voice_join ack timeout')), 5000)
    s.emit('voice_join', { channelId }, (r: { ok: boolean; error?: string }) => {
      clearTimeout(t)
      if (r?.ok) resolve()
      else reject(new Error(`voice_join rejected: ${r?.error}`))
    })
  })
}

async function snapshot(): Promise<{ userId: string; channelId: string; socketId: string }[]> {
  const res = await fetch(`${CTRL}/internal/voice-presence`, { headers: { 'x-internal-token': TOKEN } })
  const data = (await res.json()) as { ok: boolean; channels: { userId: string; channelId: string; socketId: string }[] }
  if (!data.ok) throw new Error('snapshot endpoint not ok')
  return data.channels
}

let failures = 0
function check(label: string, cond: boolean, detail: unknown): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`, cond ? '' : JSON.stringify(detail))
  if (!cond) failures++
}

async function main() {
  // Scenario 1: the exact bug — same user joins twice from two sockets.
  const a1 = await connect('user-dup', 'Dup User')
  const a2 = await connect('user-dup', 'Dup User')
  await join(a1, CH)
  await join(a2, CH) // second socket, same user → must evict the first
  let snap = await snapshot()
  const dupEntries = snap.filter((p) => p.userId === 'user-dup')
  check('same user via 2 sockets → exactly 1 presence entry', dupEntries.length === 1, snap)
  check('surviving entry is the NEWEST socket', dupEntries[0]?.socketId === a2.id, { a1: a1.id, a2: a2.id, snap })

  // Scenario 2: a different user in the same channel is unaffected.
  const b = await connect('user-solo', 'Solo User')
  await join(b, CH)
  snap = await snapshot()
  const inCh = snap.filter((p) => p.channelId === CH)
  check('2 distinct users in channel → 2 entries', inCh.length === 2 && new Set(inCh.map((p) => p.userId)).size === 2, snap)

  // Scenario 3: disconnect cleanup still works.
  a1.disconnect()
  a2.disconnect()
  b.disconnect()
  await new Promise((r) => setTimeout(r, 400))
  snap = await snapshot()
  check('all disconnected → snapshot empty', snap.length === 0, snap)

  process.exit(failures ? 1 : 0)
}

main().catch((e) => {
  console.error('TEST ERROR:', e)
  process.exit(1)
})
