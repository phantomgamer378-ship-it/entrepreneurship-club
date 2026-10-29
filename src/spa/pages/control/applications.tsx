'use client'

// Application review (§7.2): read, private notes, approve/reject with confirm,
// invitation status, resend. Review notes are never exposed to applicants.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api, ApiClientError } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type Application = {
  id: string; reference: string; requestedUsername: string; email: string; fullName: string
  courseYear: string | null; interestArea: string | null; motivation: string
  portfolioUrl: string | null; linkedinUrl: string | null; githubUrl: string | null
  status: string; reviewNotes: string | null; reviewedBy: string | null; reviewedAt: string | null
  createdAt: string
  invites: { id: string; status: string; sentCount: number; lastSentAt: string | null; expiresAt: string }[]
}

export default function ControlApplications() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState<Application | null>(null)
  const [notes, setNotes] = useState('')
  const [decide, setDecide] = useState<'approve' | 'reject' | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-applications', tab],
    queryFn: () => api.get<{ applications: Application[] }>(`/api/control/applications?status=${tab}`),
    retry: false,
  })

  async function saveNotes() {
    if (!selected) return
    try {
      await api.patch(`/api/control/applications/${selected.id}/decision`, { notes })
      toast({ title: 'Review notes saved' })
      void qc.invalidateQueries({ queryKey: ['ctl-applications'] })
    } catch (err) {
      toast({ title: 'Could not save notes', description: err instanceof ApiClientError ? err.message : '', variant: 'destructive' })
    }
  }

  async function submitDecision() {
    if (!selected || !decide) return
    setBusy(true)
    try {
      await api.post(`/api/control/applications/${selected.id}/decision`, { action: decide, notes })
      toast({ title: decide === 'approve' ? 'Application approved' : 'Application rejected', description: 'Decision email queued; an invitation will follow on approval.' })
      setDecide(null)
      setSelected(null)
      void qc.invalidateQueries({ queryKey: ['ctl-applications'] })
      void qc.invalidateQueries({ queryKey: ['ctl-overview'] })
    } catch (err) {
      toast({ title: 'Decision failed', description: err instanceof ApiClientError ? err.message : '', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function resend(inviteId: string) {
    try {
      await api.put('/api/control/invites', { inviteId })
      toast({ title: 'Invitation resent', description: 'A fresh secure link was queued.' })
      void qc.invalidateQueries({ queryKey: ['ctl-applications'] })
    } catch (err) {
      toast({ title: 'Resend failed', description: err instanceof ApiClientError ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) {
    return <ErrorNote message="You are not authorized to view applications." />
  }

  return (
    <div>
      <PageHeader title="Applications" description="Review membership applications. Notes and reviewer identity stay private." />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.applications.length ? (
        <div className="space-y-3">
          {data.applications.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{a.fullName}</p>
                    <span className="font-mono text-xs text-muted-foreground">{a.reference}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    @{a.requestedUsername} · {a.email} · {a.interestArea ?? '—'} · {formatDate(a.createdAt, false)}
                  </p>
                  {a.invites.length ? (
                    <p className="mt-1 text-xs">
                      Invitation: <StatusBadge status={a.invites[0].status} /> <span className="text-muted-foreground">sent ×{a.invites[0].sentCount}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setSelected(a); setNotes(a.reviewNotes ?? '') }}>
                    <FileText className="mr-1 h-3.5 w-3.5" aria-hidden /> Review
                  </Button>
                  {a.status === 'pending' ? (
                    <>
                      <Button size="sm" onClick={() => { setSelected(a); setNotes(a.reviewNotes ?? ''); setDecide('approve') }}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => { setSelected(a); setNotes(a.reviewNotes ?? ''); setDecide('reject') }}>Reject</Button>
                    </>
                  ) : a.invites[0]?.status === 'pending' ? (
                    <Button size="sm" variant="outline" onClick={() => void resend(a.invites[0].id)}>
                      <Send className="mr-1 h-3.5 w-3.5" aria-hidden /> Resend invite
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title={`No ${tab === 'all' ? '' : tab + ' '}applications`} description="New submissions will appear here." />
      )}

      {/* Review drawer */}
      <Dialog open={Boolean(selected) && !decide} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.fullName} <span className="ml-2 font-mono text-sm text-muted-foreground">{selected.reference}</span></DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Detail label="Requested username" value={`@${selected.requestedUsername}`} />
                  <Detail label="Email" value={selected.email} />
                  <Detail label="Course / year" value={selected.courseYear ?? '—'} />
                  <Detail label="Interest area" value={selected.interestArea ?? '—'} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivation</p>
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-muted p-3">{selected.motivation}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.portfolioUrl ? <a className="text-xs text-primary hover:underline" href={selected.portfolioUrl} target="_blank" rel="noopener noreferrer">Portfolio ↗</a> : null}
                  {selected.linkedinUrl ? <a className="text-xs text-primary hover:underline" href={selected.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a> : null}
                  {selected.githubUrl ? <a className="text-xs text-primary hover:underline" href={selected.githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a> : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Private review notes (never shown to the applicant)</p>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" placeholder="Reviewer notes…" />
                  <Button size="sm" variant="outline" className="mt-2" onClick={saveNotes}>Save notes</Button>
                </div>
                {selected.reviewedBy ? (
                  <p className="text-xs text-muted-foreground">
                    {selected.status} by {selected.reviewedBy} on {formatDate(selected.reviewedAt)}
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Decision confirm */}
      <AlertDialog open={Boolean(decide)} onOpenChange={(v) => !v && setDecide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{decide === 'approve' ? 'Approve application?' : 'Reject application?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {decide === 'approve'
                ? `${selected?.fullName} will receive an approval email followed by a single-use invitation link to activate their account.`
                : `${selected?.fullName} will receive a polite rejection email. They may reapply in a future intake.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitDecision} disabled={busy} className={decide === 'reject' ? 'bg-destructive text-white hover:bg-destructive/90' : ''}>
              {busy ? 'Working…' : 'Confirm decision'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words">{value}</p>
    </div>
  )
}

export { Badge }
