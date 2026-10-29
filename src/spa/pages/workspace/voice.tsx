'use client'

// Voice Lounge (§14.2 companion) — Discord-style voice channels.
// Click a channel → join instantly via an audio-first provider room; presence
// updates live over the shared socket service. One channel at a time, like Discord.
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Volume2, Plus, LogOut, Loader2, Mic, MicOff, Trash2 } from 'lucide-react'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageHeader, ErrorNote, formatDate } from '@/spa/components/shared'
import { api, ApiClientError } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/spa/stores/auth'

type PresenceEntry = { userId: string; name: string; muted: boolean }
type VoiceChannel = { id: string; name: string; topic: string | null; createdAt: string; presence: PresenceEntry[] }
type JoinResponse = {
  ok: boolean
  channel: { id: string; name: string; topic: string | null }
  joinInfo:
    | { mode: 'embed'; url: string; roomName: string; provider: 'jitsi'; displayName: string }
    | { mode: 'token'; url: string; roomName: string; provider: 'daily'; token: string }
}
type PresenceSnapshot = { channels: { channelId: string; userId: string; name: string; muted: boolean }[] }

export default function VoiceLoungePage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { user, permissions } = useAuth()
  const canManage = permissions.includes('voice.manage')

  const [joined, setJoined] = useState<JoinResponse | null>(null)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [iframeLoading, setIframeLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [creating, setCreating] = useState(false)
  const [localMuted, setLocalMuted] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const joinedRef = useRef<JoinResponse | null>(null)
  const socketReadyRef = useRef(false)
  const pendingVoiceRef = useRef<string | null>(null)
  // Latest-ref pattern: the socket lives for the whole page session; the auth
  // store's user object is refreshed by identity, and an effect depending on it
  // would tear the socket (and server-side presence) down on every refresh.
  const userRef = useRef(user)
  userRef.current = user

  const { data, isLoading, error } = useQuery({
    queryKey: ['voice-channels'],
    queryFn: () => api.get<{ channels: VoiceChannel[] }>('/api/workspace/voice'),
    refetchInterval: 30_000, // socket push keeps it live; polling is the fallback
  })

  // Live presence over the shared socket service (same as Messages §14.1).
  // Created ONCE per mount — deps are stable (qc, toast).
  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL || '/?XTransformPort=3003'
    const socket = io(socketUrl, { transports: ['websocket', 'polling'], reconnectionAttempts: 5 })
    socketRef.current = socket
    socket.on('connect', () => {
      socketReadyRef.current = false
      const u = userRef.current
      if (u) socket.emit('authenticate', { userId: u.id, name: u.displayName })
    })
    socket.on('authenticated', () => {
      socketReadyRef.current = true
      // Flush a join that fired before authentication, and self-heal after any
      // reconnect: if the client still considers itself in a channel, re-assert
      // it (server-side presence was wiped when the old socket died).
      const target = pendingVoiceRef.current ?? joinedRef.current?.channel.id ?? null
      pendingVoiceRef.current = null
      if (target) socket.emit('voice_join', { channelId: target })
    })
    socket.on('voice_presence', (snap: PresenceSnapshot) => {
      // Rewrite the query cache from the authoritative socket snapshot.
      qc.setQueryData<{ channels: VoiceChannel[] }>(['voice-channels'], (old) => {
        if (!old) return old
        const byId = new Map<string, PresenceEntry[]>()
        for (const p of snap.channels) {
          const list = byId.get(p.channelId) ?? []
          // One entry per user (Discord semantics): the server evicts same-user
          // duplicates on join, but a snapshot raced with that eviction can
          // still carry the same userId twice — dedupe so render keys stay unique.
          if (!list.some((e) => e.userId === p.userId)) list.push({ userId: p.userId, name: p.name, muted: p.muted })
          byId.set(p.channelId, list)
        }
        return { channels: old.channels.map((c) => ({ ...c, presence: byId.get(c.id) ?? [] })) }
      })
    })
    socket.on('voice_channel_removed', (payload: { channelId: string }) => {
      if (joinedRef.current?.channel.id === payload.channelId) {
        setJoined(null)
        joinedRef.current = null
        toast({ title: 'Channel removed', description: 'The voice channel you were in was deleted.' })
      }
      void qc.invalidateQueries({ queryKey: ['voice-channels'] })
    })
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [qc, toast])

  async function join(channel: VoiceChannel) {
    if (joinedRef.current?.channel.id === channel.id) return
    setJoiningId(channel.id)
    try {
      const res = await api.post<JoinResponse>(`/api/workspace/voice/${channel.id}/join`)
      // Discord semantics: joining a new channel leaves the previous one.
      if (joinedRef.current) socketRef.current?.emit('voice_leave', {})
      joinedRef.current = res
      setJoined(res)
      setIframeLoading(true)
      setLocalMuted(false)
      if (socketRef.current && socketReadyRef.current) {
        socketRef.current.emit('voice_join', { channelId: channel.id })
      } else {
        // Socket still handshaking — the authenticated handler flushes this.
        pendingVoiceRef.current = channel.id
      }
    } catch (err) {
      toast({ title: 'Could not join channel', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setJoiningId(null)
    }
  }

  function leave() {
    pendingVoiceRef.current = null
    socketRef.current?.emit('voice_leave', {})
    joinedRef.current = null
    setJoined(null)
    setIframeLoading(true)
  }

  async function createChannel() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.post('/api/workspace/voice', { name: newName.trim(), topic: newTopic.trim() || undefined })
      toast({ title: 'Channel created' })
      setNewName('')
      setNewTopic('')
      void qc.invalidateQueries({ queryKey: ['voice-channels'] })
    } catch (err) {
      toast({ title: 'Could not create channel', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  async function removeChannel(channel: VoiceChannel) {
    try {
      await api.del(`/api/workspace/voice/${channel.id}`)
      toast({ title: 'Channel deleted' })
      if (joinedRef.current?.channel.id === channel.id) leave()
      void qc.invalidateQueries({ queryKey: ['voice-channels'] })
    } catch (err) {
      toast({ title: 'Could not delete channel', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message={error instanceof ApiClientError ? error.message : 'Could not load the voice lounge.'} />

  const channels = data?.channels ?? []

  return (
    <div>
      <PageHeader
        title="Voice Lounge"
        description="Always-on voice channels — click to join, click again to switch. Mic and camera controls live inside the room."
        actions={<Badge variant="secondary" className="gap-1"><Volume2 className="h-3 w-3" aria-hidden /> {channels.reduce((n, c) => n + c.presence.length, 0)} online</Badge>}
      />

      {joined ? (
        <Card className="mb-6 overflow-hidden border-primary/30">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b bg-primary/5 px-4 py-2.5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                Connected to <span className="text-primary">{joined.channel.name}</span>
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={localMuted ? 'destructive' : 'secondary'}
                  onClick={() => setLocalMuted((m) => !m)}
                  aria-pressed={localMuted}
                  aria-label={localMuted ? 'Unmute indicator' : 'Mute indicator'}
                >
                  {localMuted ? <MicOff className="mr-1 h-4 w-4" aria-hidden /> : <Mic className="mr-1 h-4 w-4" aria-hidden />}
                  {localMuted ? 'Muted' : 'Mic on'}
                </Button>
                <Button size="sm" variant="destructive" onClick={leave} aria-label="Leave voice channel">
                  <LogOut className="mr-1 h-4 w-4" aria-hidden /> Leave
                </Button>
              </div>
            </div>
            <div className="relative h-[420px] bg-zinc-950">
              {joined.joinInfo.mode === 'embed' ? (
                <>
                  <iframe
                    title={`Voice channel ${joined.channel.name}`}
                    src={`${joined.joinInfo.url}#userInfo.displayName=${encodeURIComponent(joined.joinInfo.displayName)}&config.prejoinPageEnabled=false&config.startWithVideoMuted=true&config.startAudioOnly=true`}
                    allow="camera; microphone; display-capture; fullscreen; clipboard-write; autoplay"
                    className="h-full w-full"
                    onLoad={() => setIframeLoading(false)}
                  />
                  {iframeLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/85 text-sm text-zinc-300">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden /> Connecting to the voice room…
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-zinc-300">
                  <p>Daily provider is configured — open the voice room with your access token.</p>
                  <Button asChild>
                    <a href={`${joined.joinInfo.url}?t=${encodeURIComponent(joined.joinInfo.token)}`} target="_blank" rel="noopener noreferrer">
                      Open voice room in new tab
                    </a>
                  </Button>
                </div>
              )}
            </div>
            <p className="px-4 py-2 text-[11px] text-muted-foreground">
              Audio flows directly between participants and the provider — never through this platform (§14.2).
              Use the in-room toolbar for mic, deafen and camera.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)
        ) : channels.length ? (
          channels.map((c) => {
            const isCurrent = joined?.channel.id === c.id
            return (
              <Card key={c.id} className={`transition-colors ${isCurrent ? 'border-primary/50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => void join(c)} className="min-w-0 flex-1 text-left" aria-label={`Join voice channel ${c.name}`}>
                      <p className="flex items-center gap-1.5 font-semibold">
                        <Volume2 className="h-4 w-4 shrink-0 text-primary" aria-hidden /> {c.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{c.topic ?? `Created ${formatDate(c.createdAt, false)}`}</p>
                    </button>
                    {canManage ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => void removeChannel(c)} aria-label={`Delete ${c.name}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-3 min-h-[1.75rem]">
                    {c.presence.length ? (
                      <ul className="flex flex-wrap gap-1.5" aria-label={`${c.presence.length} connected`}>
                        {c.presence.map((p) => (
                          <li key={p.userId}>
                            <Badge variant="secondary" className="gap-1 text-[11px]">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                              {p.name}{p.muted ? <MicOff className="h-3 w-3 text-muted-foreground" aria-label="muted" /> : null}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs italic text-muted-foreground">Empty — {joiningId === c.id ? 'joining…' : 'click to start the conversation'}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        ) : (
          <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No voice channels yet{canManage ? ' — create the first one below' : '. Ask an admin to create one.'}
          </div>
        )}
      </div>

      {canManage ? (
        <Card className="mt-6">
          <CardContent className="p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New channel (admins)</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Channel name, e.g. Game Night" maxLength={40} aria-label="Channel name" className="sm:max-w-xs" />
              <Input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Topic (optional)" maxLength={200} aria-label="Channel topic" className="flex-1" />
              <Button onClick={() => void createChannel()} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> : <Plus className="mr-1 h-4 w-4" aria-hidden />} Create
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
