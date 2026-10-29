'use client'

// PRD §8 — /control/meetings: broadcast meeting scheduler + live meetings list with
// "End for everyone" (video.end_for_all). Joining routes through the existing
// /workspace/meet/:roomId video UI — this page never embeds providers itself.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Video, Radio, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/spa/stores/auth'

type Room = {
  id: string; slug: string; name: string; provider: string; status: string
  audienceType: string; audienceRef: string | null
  startsAt: string | null; endsAt: string | null; createdAt: string
  host: { fullName: string; profile?: { displayName?: string } | null }
  _count: { members: number }
}
type EventLite = { id: string; title: string }
type RoleLite = { id: string; key: string; name: string }

export default function ControlMeetings() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { permissions } = useAuth()
  const canBroadcast = permissions.includes('video.create.broadcast')
  const canEndAll = permissions.includes('video.end_for_all')

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', startsAt: '', audienceType: 'all_members', audienceRef: '' })
  const [busy, setBusy] = useState(false)
  const [endTarget, setEndTarget] = useState<Room | null>(null)
  const [ending, setEnding] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-meetings'],
    queryFn: () => api.get<{ rooms: Room[] }>('/api/control/meetings'),
    retry: false,
    refetchInterval: 15_000, // keep live status fresh
  })
  const { data: rolesData } = useQuery({
    queryKey: ['ctl-roles-lite'],
    queryFn: () => api.get<{ roles: RoleLite[] }>('/api/control/roles'),
    enabled: canBroadcast && form.audienceType === 'role',
  })
  const { data: eventsData } = useQuery({
    queryKey: ['ctl-events-lite'],
    queryFn: () => api.get<{ events: EventLite[] }>('/api/control/events?status=published'),
    enabled: canBroadcast && form.audienceType === 'event',
  })

  async function schedule(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api.post<{ roomId: string; invitedCount: number }>('/api/control/meetings', {
        title: form.title,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : undefined,
        audienceType: form.audienceType,
        audienceRef: form.audienceType === 'role' || form.audienceType === 'event' ? form.audienceRef : undefined,
      })
      toast({
        title: 'Broadcast meeting created',
        description: `${res.invitedCount} recipient${res.invitedCount === 1 ? '' : 's'} invited (seed/demo profiles excluded automatically).`,
      })
      setCreateOpen(false)
      setForm({ title: '', startsAt: '', audienceType: 'all_members', audienceRef: '' })
      void qc.invalidateQueries({ queryKey: ['ctl-meetings'] })
    } catch (err) {
      toast({ title: 'Could not schedule meeting', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function endForAll() {
    if (!endTarget) return
    setEnding(true)
    try {
      await api.post(`/api/control/meetings/${endTarget.id}/end`)
      toast({ title: 'Meeting ended for everyone', description: 'Connected participants are being disconnected now.' })
      setEndTarget(null)
      void qc.invalidateQueries({ queryKey: ['ctl-meetings'] })
    } catch (err) {
      toast({ title: 'Could not end meeting', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setEnding(false)
    }
  }

  if (error) return <ErrorNote message="You are not authorized to view broadcast meetings." />

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Broadcast meetings targeted at a role, an event's registrants, or all members. Seed/demo profiles are never invited."
        actions={canBroadcast ? (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button size="sm"><Video className="mr-1 h-4 w-4" aria-hidden /> Schedule broadcast</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Schedule broadcast meeting</DialogTitle></DialogHeader>
              <form onSubmit={schedule} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bm-title">Title</Label>
                  <Input id="bm-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bm-start">Starts at (leave empty to start now)</Label>
                  <Input id="bm-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Audience</Label>
                  <Select value={form.audienceType} onValueChange={(v) => setForm({ ...form, audienceType: v, audienceRef: '' })}>
                    <SelectTrigger aria-label="Audience type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_members">All active members</SelectItem>
                      <SelectItem value="role">A specific role</SelectItem>
                      <SelectItem value="event">Registrants of an event</SelectItem>
                      <SelectItem value="direct_invite">Direct invite (via members list)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.audienceType === 'role' ? (
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={form.audienceRef} onValueChange={(v) => setForm({ ...form, audienceRef: v })}>
                      <SelectTrigger aria-label="Role"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                      <SelectContent>
                        {(rolesData?.roles ?? []).map((r) => <SelectItem key={r.id} value={r.key}>{r.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {form.audienceType === 'event' ? (
                  <div className="space-y-1.5">
                    <Label>Event</Label>
                    <Select value={form.audienceRef} onValueChange={(v) => setForm({ ...form, audienceRef: v })}>
                      <SelectTrigger aria-label="Event"><SelectValue placeholder="Choose an event" /></SelectTrigger>
                      <SelectContent>
                        {(eventsData?.events ?? []).map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Guests without accounts receive an email invite only.</p>
                  </div>
                ) : null}
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden /> Creating…</> : 'Create broadcast meeting'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.rooms.length ? (
        <div className="space-y-3">
          {data.rooms.map((room) => (
            <Card key={room.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {room.audienceType !== 'direct_invite' ? <Radio className="h-4 w-4 text-primary" aria-hidden /> : null}
                    <p className="text-sm font-semibold">{room.name}</p>
                    <StatusBadge status={room.status} />
                    <Badge variant="outline" className="capitalize">{room.audienceType.replace('_', ' ')}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Host {room.host.profile?.displayName ?? room.host.fullName} · {room._count.members} invited
                    {room.startsAt ? ` · ${formatDate(room.startsAt)}` : ''}
                    {room.endedById ? ' · force-ended' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEndAll && room.status !== 'ended' ? (
                    <Button size="sm" variant="destructive" onClick={() => setEndTarget(room)}>
                      <Square className="mr-1 h-3.5 w-3.5" aria-hidden /> End for everyone
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No meetings" description="Schedule a broadcast meeting to reach members at scale." />
      )}

      <AlertDialog open={Boolean(endTarget)} onOpenChange={(v) => !v && setEndTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End “{endTarget?.name}” for everyone?</AlertDialogTitle>
            <AlertDialogDescription>
              Every connected participant is disconnected immediately via a realtime control event, and the room is
              marked ended in the audit log. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={endForAll} disabled={ending}>{ending ? 'Ending…' : 'End for everyone'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
