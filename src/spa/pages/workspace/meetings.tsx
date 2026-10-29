'use client'

// Meetings hub (§14.2): create rooms, invite members, expiry, host controls.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Video, Plus, Users, LogOut, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { PageHeader, EmptyState, StatusBadge, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { useToast } from '@/hooks/use-toast'

type Room = {
  id: string; slug: string; name: string; provider: string; status: string; accessLevel: string
  startsAt: string | null; expiresAt: string | null; hostId: string
  host: { fullName: string; profile?: { displayName?: string } }
  members: { userId: string; role: string; user: { fullName: string; profile?: { displayName?: string } } }[]
}
type DirectoryUser = { id: string; fullName: string; displayName: string; clubRoleLabel: string | null }

export default function MeetingsPage() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data } = useQuery({ queryKey: ['meetings'], queryFn: () => api.get<{ rooms: Room[] }>('/api/workspace/meetings') })
  const { data: directory } = useQuery({ queryKey: ['directory'], queryFn: () => api.get<{ users: DirectoryUser[] }>('/api/workspace/users') })

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [accessLevel, setAccessLevel] = useState<'members' | 'leads' | 'invitees'>('members')
  const [invitees, setInvitees] = useState<string[]>([])
  const [creating, setCreating] = useState(false)

  async function create() {
    setCreating(true)
    try {
      const res = await api.post<{ room: { id: string } }>('/api/workspace/meetings', {
        name, accessLevel, inviteeIds: invitees, expiresHours: 24,
      })
      setOpen(false)
      setName('')
      setInvitees([])
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      toast({ title: 'Meeting created', description: 'Room access expires in 24 hours.' })
      navigate(`/workspace/meet/${res.room.id}`)
    } catch (err) {
      toast({ title: 'Could not create meeting', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  async function endRoom(id: string) {
    try {
      await api.del(`/api/workspace/meetings/${id}/join`)
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      toast({ title: 'Meeting ended' })
    } catch {
      toast({ title: 'Only the host can end this meeting', variant: 'destructive' })
    }
  }

  return (
    <div>
      <PageHeader
        title="Meetings"
        description="Create video rooms with multi-participant audio/video and screen sharing. Access is validated server-side."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" aria-hidden /> New meeting</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create a meeting</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mt-name">Meeting name</Label>
                  <Input id="mt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders weekly sync" minLength={2} />
                </div>
                <div className="space-y-1.5">
                  <Label>Who can join</Label>
                  <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as typeof accessLevel)}>
                    <SelectTrigger aria-label="Access level"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="members">All members</SelectItem>
                      <SelectItem value="leads">Leads & moderators only</SelectItem>
                      <SelectItem value="invitees">Invitees only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Invite members ({invitees.length} selected)</Label>
                  <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border p-2">
                    {(directory?.users ?? []).filter((u) => u.id !== undefined).map((u) => (
                      <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded p-1.5 text-sm hover:bg-accent">
                        <Checkbox
                          checked={invitees.includes(u.id)}
                          onCheckedChange={(v) => setInvitees((prev) => (v ? [...prev, u.id] : prev.filter((x) => x !== u.id)))}
                          aria-label={`Invite ${u.displayName}`}
                        />
                        {u.displayName}
                      </label>
                    ))}
                  </div>
                </div>
                <Button className="w-full" onClick={create} disabled={creating || name.trim().length < 2}>
                  {creating ? 'Creating…' : 'Create & open room'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />

      {data?.rooms.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.rooms.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Host: {r.host.profile?.displayName ?? r.host.fullName} · {r.provider}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="capitalize">{r.accessLevel.replace('_', ' ')}</Badge>
                  {r.startsAt ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /> {formatDate(r.startsAt, false)}</span> : null}
                  {r.expiresAt ? <span>· expires {formatDate(r.expiresAt, false)}</span> : null}
                </div>
                {r.members.length ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" aria-hidden /> {r.members.length} invited
                  </p>
                ) : null}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" onClick={() => navigate(`/workspace/meet/${r.id}`)}>
                    <Video className="mr-1 h-3.5 w-3.5" aria-hidden /> Join room
                  </Button>
                  {r.hostId === r.members[0]?.userId ? null : null}
                  <Button size="sm" variant="outline" onClick={() => void endRoom(r.id)}>
                    <LogOut className="mr-1 h-3.5 w-3.5" aria-hidden /> End
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No meetings yet"
          description="Create a room and share it with members. Rooms expire automatically."
          action={<Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden /> New meeting</Button>}
        />
      )}
    </div>
  )
}
