'use client'

// Announcement management (§7/§13): draft → publish/schedule → archive, audience,
// explicit confirmed email fanout with per-recipient status.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Send, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type AnnouncementRow = {
  id: string; title: string; body: string; category: string; audience: string; status: string
  pinned: boolean; publishedAt: string | null; scheduledFor: string | null; emailSentAt: string | null; createdAt: string
  recipientCounts: { queued: number; sent: number; failed: number; total: number }
}

export default function ControlAnnouncements() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', category: 'general', audience: 'public', scheduledFor: '' })
  const [emailConfirm, setEmailConfirm] = useState<AnnouncementRow | null>(null)
  const [emailBusy, setEmailBusy] = useState(false)
  // PRD §8 — super-power overrides (announcements.delete): delete (soft) / force-unpublish.
  const [overrideConfirm, setOverrideConfirm] = useState<{ row: AnnouncementRow; action: 'delete' | 'force_unpublish' } | null>(null)
  const [overrideReason, setOverrideReason] = useState('')
  const [overrideBusy, setOverrideBusy] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-announcements', tab],
    queryFn: () => api.get<{ announcements: AnnouncementRow[] }>(`/api/control/announcements?status=${tab}`),
    retry: false,
  })

  async function create(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.post('/api/control/announcements', {
        title: form.title, body: form.body,
        category: form.category, audience: form.audience,
        scheduledFor: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : undefined,
      })
      toast({ title: form.scheduledFor ? 'Announcement scheduled' : 'Draft created' })
      setCreateOpen(false)
      setForm({ title: '', body: '', category: 'general', audience: 'public', scheduledFor: '' })
      void qc.invalidateQueries({ queryKey: ['ctl-announcements'] })
    } catch (err) {
      toast({ title: 'Could not create', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function act(a: AnnouncementRow, action: string, extra?: Record<string, unknown>) {
    try {
      await api.patch('/api/control/announcements', { id: a.id, action, ...extra })
      toast({ title: `Announcement ${action}d` })
      void qc.invalidateQueries({ queryKey: ['ctl-announcements'] })
    } catch (err) {
      toast({ title: `Could not ${action}`, description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function togglePin(a: AnnouncementRow, pinned: boolean) {
    await act(a, 'update', { pinned })
  }

  async function runOverride() {
    if (!overrideConfirm) return
    setOverrideBusy(true)
    try {
      await api.post(`/api/control/announcements/${overrideConfirm.row.id}/manage`, {
        action: overrideConfirm.action,
        reason: overrideReason || undefined,
      })
      toast({ title: overrideConfirm.action === 'delete' ? 'Announcement deleted (soft)' : 'Announcement unpublished' })
      setOverrideConfirm(null)
      setOverrideReason('')
      void qc.invalidateQueries({ queryKey: ['ctl-announcements'] })
    } catch (err) {
      toast({ title: 'Override failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setOverrideBusy(false)
    }
  }

  async function sendEmails() {
    if (!emailConfirm) return
    setEmailBusy(true)
    try {
      const res = await api.post<{ recipients: number; createdNow: number; worker: { sent: number; failed: number } }>(
        `/api/control/announcements/${emailConfirm.id}/email`, { confirm: true }
      )
      toast({
        title: 'Email campaign queued',
        description: `${res.recipients} eligible recipients (${res.createdNow} new). Worker: ${res.worker.sent} sent, ${res.worker.failed} retrying.`,
      })
      setEmailConfirm(null)
      void qc.invalidateQueries({ queryKey: ['ctl-announcements'] })
      void qc.invalidateQueries({ queryKey: ['ctl-emails'] })
    } catch (err) {
      toast({ title: 'Bulk send failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    } finally {
      setEmailBusy(false)
    }
  }

  if (error) return <ErrorNote message="You are not authorized to manage announcements." />

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Website publication and email delivery are separate steps — provider failures never lose published content."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button size="sm"><Megaphone className="mr-1 h-4 w-4" aria-hidden /> New announcement</Button></DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader><DialogTitle>Create announcement</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="an-title">Title</Label>
                  <Input id="an-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="an-body">Body</Label>
                  <Textarea id="an-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={6} required minLength={10} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                      <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['general', 'training', 'operational', 'internship_placement', 'event', 'achievement', 'opportunity', 'urgent'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Audience</Label>
                    <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v })}>
                      <SelectTrigger aria-label="Audience"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public (everyone)</SelectItem>
                        <SelectItem value="members">Members only</SelectItem>
                        <SelectItem value="leads">Leads & admins</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="an-sched">Schedule for later (optional)</Label>
                  <Input id="an-sched" type="datetime-local" value={form.scheduledFor} onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">{form.scheduledFor ? 'Schedule announcement' : 'Save draft'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="draft">Draft</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="published">Published</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.announcements.length ? (
        <div className="space-y-3">
          {data.announcements.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{a.title}</p>
                      <StatusBadge status={a.status} />
                      <Badge variant="secondary" className="capitalize">{a.audience}</Badge>
                      {a.pinned ? <Badge className="bg-primary">Pinned</Badge> : null}
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{a.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {a.publishedAt ? `Published ${formatDate(a.publishedAt, false)}` : a.scheduledFor ? `Scheduled for ${formatDate(a.scheduledFor)}` : `Created ${formatDate(a.createdAt, false)}`}
                      {a.emailSentAt ? ` · email fanout done` : ''}
                    </p>
                    {a.recipientCounts.total > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Email recipients: {a.recipientCounts.sent} sent · {a.recipientCounts.queued} queued · {a.recipientCounts.failed} failed (of {a.recipientCounts.total})
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {a.status === 'draft' ? <Button size="sm" onClick={() => void act(a, 'publish')}>Publish</Button> : null}
                    {['draft', 'published', 'archived'].includes(a.status) && a.status !== 'published' ? null : null}
                    {a.status === 'published' ? (
                      <Button size="sm" variant="outline" onClick={() => setEmailConfirm(a)}>
                        <Send className="mr-1 h-3.5 w-3.5" aria-hidden /> {a.emailSentAt ? 'Send emails again' : 'Email members'}
                      </Button>
                    ) : null}
                    {a.status !== 'archived' ? <Button size="sm" variant="outline" onClick={() => void act(a, 'archive')}>Archive</Button> : null}
                    {a.status === 'published' ? (
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOverrideConfirm({ row: a, action: 'force_unpublish' })}>
                        <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Force-unpublish
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => setOverrideConfirm({ row: a, action: 'delete' })}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Delete
                    </Button>
                    <div className="flex items-center gap-1.5 rounded-md border px-2 py-1">
                      <span className="text-xs text-muted-foreground">Pin</span>
                      <Switch checked={a.pinned} onCheckedChange={(v) => void togglePin(a, v)} aria-label="Pin announcement" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No announcements" />
      )}

      {/* PRD §7.4/§8 — override confirmation: explicitly states the email-recall limitation */}
      <AlertDialog open={Boolean(overrideConfirm)} onOpenChange={(v) => !v && setOverrideConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {overrideConfirm?.action === 'delete' ? 'Delete' : 'Force-unpublish'} “{overrideConfirm?.row.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {overrideConfirm?.action === 'delete' ? (
                  <p>The announcement is soft-deleted: it disappears from every public and admin list, but the record stays queryable for history and audit. This cannot be undone from the UI.</p>
                ) : (
                  <p>The announcement returns to draft status everywhere (site + member views).</p>
                )}
                <p className="font-medium text-destructive">
                  Important: emails already sent for this announcement cannot be recalled — recipients keep them.
                </p>
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

      {/* Bulk email confirmation */}
      <AlertDialog open={Boolean(emailConfirm)} onOpenChange={(v) => !v && setEmailConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send &ldquo;{emailConfirm?.title}&rdquo; by email?</AlertDialogTitle>
            <AlertDialogDescription>
              This queues one email per eligible recipient (respecting opt-outs). Duplicate campaigns are prevented —
              each recipient is only queued once per announcement. The worker retries transient failures automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendEmails} disabled={emailBusy}>{emailBusy ? 'Queuing…' : 'Confirm bulk send'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
