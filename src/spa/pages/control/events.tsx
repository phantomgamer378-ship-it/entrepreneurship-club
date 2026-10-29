'use client'

// Event management (§7): create, publish/complete/archive/cancel, view registrations,
// record attendance. Resource-scoped: leads only edit events assigned to them.
import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarPlus, Users, Trash2, Ban, UserPlus, UserMinus, ImagePlus, FileDown, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api, getToken } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type EventRow = {
  id: string; slug: string; title: string; summary: string | null; venue: string | null
  startsAt: string; capacity: number | null; status: string; registrationOpen: boolean
  posterUrl: string | null; googleFormUrl: string | null; googleFormId: string | null
  _count: { registrations: number }
}
type Registration = {
  id: string; name: string; email: string; isGuest: boolean; status: string; createdAt: string
  year: string | null; branch: string | null; phone: string | null
  googleSyncedAt: string | null; googleSyncError: string | null
}

export default function ControlEvents() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', summary: '', description: '', venue: '', startsAt: '', capacity: '' })
  const [regsFor, setRegsFor] = useState<EventRow | null>(null)
  // PRD §8 — super-power overrides (events.delete / events.registrations.manage).
  const [override, setOverride] = useState<{ row: EventRow; action: 'delete' | 'force_cancel' } | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideBusy, setOverrideBusy] = useState(false)
  const [registrantAdd, setRegistrantAdd] = useState('')
  const [registrantBusy, setRegistrantBusy] = useState(false)
  // Task 25 — banner upload state (create dialog + per-row update).
  const [banner, setBanner] = useState<{ url: string } | null>(null)
  const [bannerBusy, setBannerBusy] = useState(false)
  const rowBannerInput = useRef<HTMLInputElement>(null)
  const [rowBannerFor, setRowBannerFor] = useState<EventRow | null>(null)
  const [googleBusyFor, setGoogleBusyFor] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-events', tab],
    queryFn: () => api.get<{ events: EventRow[] }>(`/api/control/events?status=${tab}`),
    retry: false,
  })
  const { data: regsData } = useQuery({
    queryKey: ['ctl-registrations', regsFor?.id],
    queryFn: () => api.get<{ registrations: Registration[] }>(`/api/control/events/${regsFor!.id}/attendance`),
    enabled: Boolean(regsFor),
  })

  // Prefill a sensible default start time when the create dialog opens.
  function openCreate(open: boolean) {
    setCreateOpen(open)
    if (open) {
      const dt = new Date(Date.now() + 7 * 864e5)
      setForm((f) => ({ ...f, startsAt: f.startsAt || new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }))
    }
  }

  // Task 25 — multipart upload via the first-party /api/control/uploads route.
  async function uploadBanner(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    const token = getToken()
    const res = await fetch('/api/control/uploads', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
      credentials: 'same-origin',
    })
    const json = (await res.json().catch(() => null)) as { url?: string; error?: string } | null
    if (!res.ok || !json?.url) throw new Error(json?.error ?? `Upload failed (${res.status})`)
    return json.url
  }

  async function onCreateBannerPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setBannerBusy(true)
    try {
      const url = await uploadBanner(file)
      if (url) {
        setBanner({ url })
        toast({ title: 'Banner uploaded', description: 'It will be attached when you create the event.' })
      }
    } catch (err) {
      toast({ title: 'Banner upload failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setBannerBusy(false)
    }
  }

  async function onRowBannerPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const row = rowBannerFor
    setRowBannerFor(null)
    if (!file || !row) return
    setBannerBusy(true)
    try {
      const url = await uploadBanner(file)
      if (url) {
        await api.patch('/api/control/events', { id: row.id, posterUrl: url })
        toast({ title: 'Banner updated', description: row.title })
        void qc.invalidateQueries({ queryKey: ['ctl-events'] })
      }
    } catch (err) {
      toast({ title: 'Banner upload failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setBannerBusy(false)
    }
  }

  async function createGoogleForm(ev: EventRow) {
    setGoogleBusyFor(ev.id)
    try {
      const res = await api.patch<{ googleFormUrl?: string; alreadyExisted?: boolean }>('/api/control/events', { id: ev.id, action: 'create_google_form' })
      toast({
        title: res.alreadyExisted ? 'Google Form already linked' : 'Google Form created',
        description: res.googleFormUrl ?? '',
      })
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
    } catch (err) {
      toast({ title: 'Google Form unavailable', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setGoogleBusyFor(null)
    }
  }

  async function exportCsv(ev: EventRow) {
    try {
      const token = getToken()
      const res = await fetch(`/api/control/events/${ev.id}/attendance?format=csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error(`Export failed (${res.status})`)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `registrations-${ev.slug}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast({ title: 'CSV exported', description: 'Open it in Google Sheets: File → Import.' })
    } catch (err) {
      toast({ title: 'Export failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/control/events', {
        title: form.title,
        summary: form.summary,
        description: form.description || form.title,
        venue: form.venue,
        startsAt: new Date(form.startsAt).toISOString(),
        capacity: form.capacity ? Number(form.capacity) : undefined,
        registrationOpen: true,
        posterUrl: banner?.url,
      })
      toast({ title: 'Event created', description: 'Publish it when ready — registration opens automatically.' })
      setCreateOpen(false)
      setForm({ title: '', summary: '', description: '', venue: '', startsAt: '', capacity: '' })
      setBanner(null)
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
    } catch (err) {
      toast({ title: 'Could not create event', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function act(ev: EventRow, action: string) {
    try {
      await api.patch('/api/control/events', { id: ev.id, action })
      toast({ title: `Event ${action}d` })
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
      void qc.invalidateQueries({ queryKey: ['ctl-overview'] })
    } catch (err) {
      toast({ title: `Could not ${action} event`, description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function setAttendance(reg: Registration, status: string) {
    if (!regsFor) return
    try {
      await api.post(`/api/control/events/${regsFor.id}/attendance`, { registrationId: reg.id, status })
      void qc.invalidateQueries({ queryKey: ['ctl-registrations'] })
    } catch {
      toast({ title: 'Could not update attendance', variant: 'destructive' })
    }
  }

  async function runOverride() {
    if (!override) return
    setOverrideBusy(true)
    try {
      await api.post(`/api/control/events/${override.row.id}/manage`, {
        action: override.action,
        reason: overrideReason || undefined,
      })
      toast({ title: override.action === 'delete' ? 'Event deleted (soft)' : 'Event cancelled + registrants notified' })
      setOverride(null)
      setOverrideReason('')
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
      void qc.invalidateQueries({ queryKey: ['ctl-overview'] })
    } catch (err) {
      toast({ title: 'Override failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setOverrideBusy(false)
    }
  }

  async function addRegistrant() {
    if (!regsFor || !registrantAdd.trim()) return
    setRegistrantBusy(true)
    try {
      await api.post(`/api/control/events/${regsFor.id}/manage`, { action: 'add_registrant', payload: { email: registrantAdd.trim() } })
      toast({ title: 'Registrant added' })
      setRegistrantAdd('')
      void qc.invalidateQueries({ queryKey: ['ctl-registrations'] })
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
    } catch (err) {
      toast({ title: 'Could not add registrant', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setRegistrantBusy(false)
    }
  }

  async function removeRegistrant(reg: Registration) {
    if (!regsFor) return
    try {
      await api.post(`/api/control/events/${regsFor.id}/manage`, { action: 'remove_registrant', payload: { email: reg.email } })
      toast({ title: 'Registrant removed' })
      void qc.invalidateQueries({ queryKey: ['ctl-registrations'] })
      void qc.invalidateQueries({ queryKey: ['ctl-events'] })
    } catch (err) {
      toast({ title: 'Could not remove registrant', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message="You are not authorized to manage events." />

  return (
    <div>
      <PageHeader
        title="Events"
        description="Create, publish and archive events. Completed events stay visible publicly with recaps."
        actions={
          <Dialog open={createOpen} onOpenChange={openCreate}>
            <DialogTrigger asChild><Button size="sm"><CalendarPlus className="mr-1 h-4 w-4" aria-hidden /> New event</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Create event</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-title">Title</Label>
                  <Input id="ev-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-summary">Summary</Label>
                  <Input id="ev-summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="One-line teaser" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-desc">Description</Label>
                  <Textarea id="ev-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Full description shown on the event page" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-venue">Venue</Label>
                    <Input id="ev-venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ev-capacity">Capacity</Label>
                    <Input id="ev-capacity" type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="No limit" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-start">Starts at</Label>
                  <Input id="ev-start" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required />
                </div>
                {/* Task 25 — event banner upload */}
                <div className="space-y-1.5">
                  <Label htmlFor="ev-banner">Banner image (optional)</Label>
                  <div className="flex items-center gap-3">
                    {banner ? (
                      <img src={banner.url} alt="Banner preview" className="h-16 w-28 rounded-lg border object-cover" />
                    ) : (
                      <div className="flex h-16 w-28 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                        <ImagePlus className="h-5 w-5" aria-hidden />
                      </div>
                    )}
                    <div className="flex-1">
                      <Input id="ev-banner" type="file" accept="image/png,image/jpeg,image/webp" onChange={onCreateBannerPicked} disabled={bannerBusy} className="text-xs" />
                      <p className="mt-1 text-[11px] text-muted-foreground">PNG / JPEG / WebP · up to 4 MB. Shown on the event page.</p>
                    </div>
                  </div>
                </div>
                <Button type="submit" className="w-full">Create draft event</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.events.length ? (
        <div className="space-y-3">
          {data.events.map((ev) => (
            <Card key={ev.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                {ev.posterUrl ? (
                  <img src={ev.posterUrl} alt="" className="h-16 w-28 shrink-0 rounded-lg border object-cover" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{ev.title}</p>
                    <StatusBadge status={ev.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(ev.startsAt)}{ev.venue ? ` · ${ev.venue}` : ''} · {ev._count.registrations} registered{ev.capacity ? ` / ${ev.capacity}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRegsFor(ev)}>
                    <Users className="mr-1 h-3.5 w-3.5" aria-hidden /> Registrations
                  </Button>
                  {/* Task 25 — banner + Google Form + CSV actions */}
                  <Button size="sm" variant="outline" disabled={bannerBusy} aria-label={`Upload banner for ${ev.title}`} onClick={() => { setRowBannerFor(ev); rowBannerInput.current?.click() }}>
                    <ImagePlus className="mr-1 h-3.5 w-3.5" aria-hidden /> {ev.posterUrl ? 'Change banner' : 'Banner'}
                  </Button>
                  {ev.googleFormUrl ? (
                    <a href={ev.googleFormUrl} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="outline"><FileSpreadsheet className="mr-1 h-3.5 w-3.5" aria-hidden /> Google Form ↗</Button>
                    </a>
                  ) : (
                    <Button size="sm" variant="outline" disabled={googleBusyFor === ev.id} onClick={() => void createGoogleForm(ev)}>
                      <FileSpreadsheet className="mr-1 h-3.5 w-3.5" aria-hidden /> {googleBusyFor === ev.id ? 'Creating…' : 'Create Google Form'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => void exportCsv(ev)}>
                    <FileDown className="mr-1 h-3.5 w-3.5" aria-hidden /> CSV
                  </Button>
                  {ev.status === 'draft' ? <Button size="sm" onClick={() => void act(ev, 'publish')}>Publish</Button> : null}
                  {ev.status === 'published' ? <Button size="sm" variant="outline" onClick={() => void act(ev, 'complete')}>Mark completed</Button> : null}
                  {['completed', 'published'].includes(ev.status) ? <Button size="sm" variant="outline" onClick={() => void act(ev, 'archive')}>Archive</Button> : null}
                  {ev.status === 'published' ? <Button size="sm" variant="outline" className="text-destructive" onClick={() => void act(ev, 'cancel')}>Cancel</Button> : null}
                  {ev.status === 'published' ? (
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOverride({ row: ev, action: 'force_cancel' })}>
                      <Ban className="mr-1 h-3.5 w-3.5" aria-hidden /> Force-cancel
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOverride({ row: ev, action: 'delete' })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No events" description="Create the first event." />
      )}

      {/* Registrations dialog */}
      <Dialog open={Boolean(regsFor)} onOpenChange={(v) => !v && setRegsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>Registrations — {regsFor?.title}</DialogTitle></DialogHeader>
          {/* PRD §8 — manual registrant editor (events.registrations.manage) */}
          <div className="flex gap-2">
            <Input
              value={registrantAdd} onChange={(e) => setRegistrantAdd(e.target.value)}
              placeholder="Add by member email or username" aria-label="Add registrant"
            />
            <Button size="sm" onClick={addRegistrant} disabled={registrantBusy || !registrantAdd.trim()}>
              <UserPlus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add
            </Button>
          </div>
          {regsData?.registrations.length ? (
            <div className="divide-y rounded-lg border">
              {regsData.registrations.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name} {r.isGuest ? <Badge variant="outline" className="ml-1">guest</Badge> : null}</p>
                    <p className="text-xs text-muted-foreground">{r.email} · registered {formatDate(r.createdAt, false)}</p>
                    {/* Task 25 — standard registration answers */}
                    {(r.year || r.branch || r.phone) ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[r.year, r.branch, r.phone].filter(Boolean).join(' · ')}
                      </p>
                    ) : null}
                    {r.googleSyncError ? (
                      <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">Google sync failed — will retry on next registration</p>
                    ) : r.googleSyncedAt ? (
                      <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">Synced to Google Form</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="capitalize">{r.status.replace('_', ' ')}</Badge>
                    {r.status !== 'attended' ? <Button size="sm" variant="outline" onClick={() => void setAttendance(r, 'attended')}>Attended</Button> : null}
                    {r.status !== 'no_show' ? <Button size="sm" variant="ghost" onClick={() => void setAttendance(r, 'no_show')}>No-show</Button> : null}
                    {r.status !== 'cancelled' ? (
                      <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Remove ${r.name}`} onClick={() => void removeRegistrant(r)}>
                        <UserMinus className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No registrations yet.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* PRD §7.5/§8 — delete / force-cancel confirmation */}
      <AlertDialog open={Boolean(override)} onOpenChange={(v) => !v && setOverride(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {override?.action === 'delete' ? 'Delete' : 'Force-cancel'} “{override?.row.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {override?.action === 'delete' ? (
                  <p>Soft delete: hidden from every public and admin list; the record stays queryable for history and audit.</p>
                ) : (
                  <p>Cancels the event and queues cancellation notices to all confirmed registrants via the email outbox.</p>
                )}
                <Input
                  value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Reason (optional, stored in the audit log)" aria-label="Reason"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runOverride} disabled={overrideBusy}>
              {overrideBusy ? 'Working…' : 'Confirm override'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task 25 — hidden input driving the per-row banner upload */}
      <input ref={rowBannerInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onRowBannerPicked} />
    </div>
  )
}

export { Switch }
