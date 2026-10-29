'use client'

// Messaging (§14.1): direct/group conversations, realtime via socket.io mini-service,
// persistent history with pagination, unread indicators, search, report/block, typing.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io, type Socket } from 'socket.io-client'
import { Send, Search, Plus, Flag, ArrowLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageHeader, EmptyState, formatDate } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { useAuth } from '@/spa/stores/auth'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Conversation = {
  id: string; type: 'direct' | 'group'; name: string; unread: number
  lastMessage: { body: string; createdAt: string; senderId: string } | null
  lastMessageAt: string | null
}
type Msg = {
  id: string; body: string; createdAt: string; senderId: string
  senderName?: string; senderAvatar?: string | null
  sender?: { fullName: string; profile?: { displayName?: string; avatarUrl?: string | null } }
}
type Detail = {
  conversation: { id: string; type: string; name: string; members: { userId: string; memberRole: string; user: { fullName: string; profile?: { displayName?: string; username?: string; avatarUrl?: string | null } } }[] }
  messages: Msg[]; nextCursor: string | null
}
type DirectoryUser = { id: string; fullName: string; displayName: string; clubRoleLabel: string | null; username: string | null }

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    const socketUrl = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL || '/?XTransformPort=3003'
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
      reconnectionDelay: 1200,
      timeout: 10000,
    })
  }
  return socket
}

export default function MessagesPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [liveMessages, setLiveMessages] = useState<Msg[]>([])
  const [typingPeers, setTypingPeers] = useState<Record<string, string>>({})
  const [connected, setConnected] = useState(false)
  const [newConvOpen, setNewConvOpen] = useState(false)
  const [newConvMembers, setNewConvMembers] = useState<string[]>([])
  const [newConvName, setNewConvName] = useState('')
  const [newConvType, setNewConvType] = useState<'direct' | 'group'>('direct')
  const [reportTarget, setReportTarget] = useState<Msg | null>(null)
  const [reportReason, setReportReason] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)

  const { data: convData, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<{ conversations: Conversation[] }>('/api/workspace/conversations'),
    refetchInterval: 30_000,
  })
  const { data: directory } = useQuery({
    queryKey: ['directory'],
    queryFn: () => api.get<{ users: DirectoryUser[] }>('/api/workspace/users'),
  })

  const activeDetail = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => api.get<Detail>(`/api/workspace/conversations/${activeId}`),
    enabled: Boolean(activeId),
  })

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  // Merge server history with realtime messages, de-duplicated by id.
  const messages = useMemo(() => {
    const history = activeDetail.data?.messages ?? []
    const seen = new Set(history.map((m) => m.id))
    const extras = liveMessages.filter((m) => m.conversationId === activeId && !seen.has(m.id))
    return [...history, ...extras]
  }, [activeDetail.data, liveMessages, activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const refreshConversations = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['conversations'] })
  }, [qc])

  // Socket lifecycle (§14.1 realtime).
  useEffect(() => {
    if (!user) return
    const s = getSocket()
    function onConnect() {
      setConnected(true)
      s.emit('authenticate', { userId: user!.id, name: user!.displayName })
    }
    function onDisconnect() { setConnected(false) }
    function onMessage(msg: Msg & { conversationId: string }) {
      if (msg.conversationId === activeIdRef.current) {
        setLiveMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        void api.post(`/api/workspace/conversations/${msg.conversationId}/read`).catch(() => {})
      } else {
        refreshConversations()
      }
    }
    function onTyping(p: { userId: string; name: string; typing: boolean; conversationId: string }) {
      if (p.userId === user!.id) return
      setTypingPeers((prev) => {
        const next = { ...prev }
        if (p.typing) next[p.userId] = p.name
        else delete next[p.userId]
        return next
      })
      setTimeout(() => setTypingPeers((prev) => {
        const next = { ...prev }
        delete next[p.userId]
        return next
      }), 3500)
    }
    s.on('connect', onConnect)
    s.on('disconnect', onDisconnect)
    s.on('message', onMessage)
    s.on('typing', onTyping)
    if (s.connected) onConnect()
    return () => {
      s.off('connect', onConnect)
      s.off('disconnect', onDisconnect)
      s.off('message', onMessage)
      s.off('typing', onTyping)
    }
  }, [user, refreshConversations])

  // Join the active conversation room.
  useEffect(() => {
    if (!activeId || !user || !connected) return
    const s = getSocket()
    s.emit('join_conversation', { conversationId: activeId }, () => {})
    return () => { s.emit('leave_conversation', { conversationId: activeId }) }
  }, [activeId, user, connected])

  async function openConversation(id: string) {
    setActiveId(id)
    setLiveMessages([])
    await api.post(`/api/workspace/conversations/${id}/read`).catch(() => {})
    refreshConversations()
  }

  function sendTyping() {
    if (!activeId || !user) return
    getSocket().emit('typing', { conversationId: activeId, typing: true })
  }

  async function send() {
    const body = draft.trim()
    if (!body || !activeId || !user) return
    setDraft('')
    // Persistence + fanout through socket (validated server-side). HTTP fallback if offline.
    const s = getSocket()
    if (s.connected) {
      s.emit('send_message', { conversationId: activeId, body }, (ack: { ok: boolean; message?: Msg }) => {
        if (ack.ok && ack.message) {
          setLiveMessages((prev) => (prev.some((m) => m.id === ack.message!.id) ? prev : [...prev, ack.message!]))
        } else {
          toast({ title: 'Message not sent', description: 'Please try again.', variant: 'destructive' })
          setDraft(body)
        }
      })
    } else {
      try {
        await api.put(`/api/workspace/conversations?conversationId=${activeId}`, { body })
        const detail = await api.get<Detail>(`/api/workspace/conversations/${activeId}`)
        setLiveMessages(detail.messages)
      } catch {
        toast({ title: 'Message not sent', description: 'You appear to be offline.', variant: 'destructive' })
        setDraft(body)
      }
    }
  }

  async function createConversation() {
    try {
      const res = await api.post<{ conversationId: string; existing: boolean }>('/api/workspace/conversations', {
        type: newConvType,
        memberIds: newConvMembers,
        name: newConvType === 'group' ? newConvName || undefined : undefined,
      })
      setNewConvOpen(false)
      setNewConvMembers([])
      setNewConvName('')
      refreshConversations()
      void openConversation(res.conversationId)
    } catch (err) {
      toast({ title: 'Could not start conversation', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    }
  }

  async function reportMessage() {
    if (!reportTarget) return
    try {
      await api.post('/api/workspace/report', { messageId: reportTarget.id, reason: reportReason })
      toast({ title: 'Report filed', description: 'Our moderators will review it.' })
      setReportTarget(null)
      setReportReason('')
    } catch {
      toast({ title: 'Could not file report', variant: 'destructive' })
    }
  }

  const filtered = (convData?.conversations ?? []).filter((c) =>
    search ? c.name.toLowerCase().includes(search.toLowerCase()) : true
  )
  const activeConv = convData?.conversations.find((c) => c.id === activeId)

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Direct and group conversations with other members."
        actions={
          <Dialog open={newConvOpen} onOpenChange={setNewConvOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" aria-hidden /> New conversation</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Start a conversation</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button size="sm" variant={newConvType === 'direct' ? 'default' : 'outline'} onClick={() => setNewConvType('direct')}>Direct</Button>
                  <Button size="sm" variant={newConvType === 'group' ? 'default' : 'outline'} onClick={() => setNewConvType('group')}>Group</Button>
                </div>
                {newConvType === 'group' ? (
                  <Input value={newConvName} onChange={(e) => setNewConvName(e.target.value)} placeholder="Group name" aria-label="Group name" />
                ) : null}
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {(directory?.users ?? []).filter((u) => u.id !== user?.id).map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-accent">
                      <Checkbox
                        checked={newConvMembers.includes(u.id)}
                        onCheckedChange={(v) => setNewConvMembers((prev) => (v ? [...prev, u.id] : prev.filter((x) => x !== u.id)))}
                        aria-label={`Select ${u.displayName}`}
                      />
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {u.displayName.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{u.displayName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{u.clubRoleLabel ?? u.username ?? u.fullName}</span>
                      </span>
                    </label>
                  ))}
                  {!directory?.users.length ? <p className="py-4 text-center text-sm text-muted-foreground">No members found.</p> : null}
                </div>
                <Button
                  className="w-full"
                  disabled={newConvMembers.length === 0 || (newConvType === 'direct' && newConvMembers.length !== 1)}
                  onClick={createConversation}
                >
                  {newConvType === 'direct' ? 'Start chat' : `Create group (${newConvMembers.length})`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid h-[calc(100vh-16rem)] min-h-[32rem] grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div className={cn('flex flex-col border-r', activeId && 'hidden md:flex')}>
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations…" className="pl-9" aria-label="Search conversations" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : filtered.length ? (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => void openConversation(c.id)}
                  className={cn(
                    'flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-accent',
                    activeId === c.id && 'bg-accent'
                  )}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                      {c.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      {c.unread > 0 ? <Badge className="shrink-0 px-1.5">{c.unread}</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.lastMessage ? c.lastMessage.body.slice(0, 60) : 'No messages yet'}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" aria-hidden />
                No conversations yet.
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Thread */}
        <div className={cn('flex min-w-0 flex-col', !activeId && 'hidden md:flex')}>
          {activeId && activeConv ? (
            <>
              <div className="flex items-center gap-3 border-b p-3">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setActiveId(null)} aria-label="Back to conversations">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{activeConv.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {activeDetail.data?.conversation.members.length ?? 0} member{activeDetail.data?.conversation.members.length === 1 ? '' : 's'}
                    {connected ? '' : ' · realtime offline (HTTP mode)'}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map((m) => {
                    const mine = m.senderId === user?.id
                    const name = m.sender?.profile?.displayName ?? m.sender?.fullName ?? (m as Msg & { senderName?: string }).senderName ?? 'Member'
                    return (
                      <div key={m.id} className={cn('flex gap-2', mine && 'flex-row-reverse')}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">
                            {name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className={cn('group max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm', mine ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                          <p className={cn('mb-0.5 text-[11px] font-semibold', mine ? 'text-primary-foreground/70' : 'text-primary')}>
                            {mine ? 'You' : name}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <span className={cn('text-[10px]', mine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
                              {formatDate(m.createdAt)}
                            </span>
                            {!mine ? (
                              <button
                                className="invisible text-muted-foreground hover:text-destructive group-hover:visible"
                                onClick={() => setReportTarget(m)}
                                aria-label="Report message"
                              >
                                <Flag className="h-3 w-3" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {Object.values(typingPeers).length ? (
                    <p className="text-xs italic text-muted-foreground">{Object.values(typingPeers).join(', ')} typing…</p>
                  ) : null}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(e) => { e.preventDefault(); void send() }}
              >
                <Input
                  value={draft}
                  onChange={(e) => { setDraft(e.target.value); sendTyping() }}
                  placeholder="Type a message…"
                  aria-label="Message"
                  maxLength={4000}
                />
                <Button type="submit" disabled={!draft.trim()} aria-label="Send message">
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8">
              <EmptyState title="Select a conversation" description="Pick a conversation on the left, or start a new one." />
            </div>
          )}
        </div>
      </div>

      {/* Report dialog */}
      <Dialog open={Boolean(reportTarget)} onOpenChange={(v) => !v && setReportTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Report message</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              &ldquo;{reportTarget?.body.slice(0, 200)}&rdquo;
            </p>
            <Input value={reportReason} onChange={(e) => setReportReason(e.target.value)} placeholder="Why are you reporting this?" aria-label="Report reason" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReportTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={reportMessage} disabled={reportReason.trim().length < 3}>Submit report</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
