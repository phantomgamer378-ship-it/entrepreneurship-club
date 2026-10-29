'use client'

// Moderation queue (§7): review reported messages, resolve/dismiss, soft-delete.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'

type Report = {
  id: string; reason: string; status: string; createdAt: string; resolvedAt: string | null
  message: { id: string; body: string; createdAt: string; isDeleted: boolean; reportCount: number; sender: { fullName: string; profile?: { displayName?: string; username?: string } } }
  reporter: { fullName: string; profile?: { displayName?: string } }
}

export default function ControlModeration() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState('open')

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-moderation', tab],
    queryFn: () => api.get<{ reports: Report[] }>(`/api/control/moderation?status=${tab}`),
    retry: false,
  })

  async function handle(reportId: string, action: 'resolve' | 'dismiss' | 'delete_message') {
    try {
      await api.patch('/api/control/moderation', { reportId, action })
      toast({ title: action === 'delete_message' ? 'Message removed' : action === 'resolve' ? 'Report resolved' : 'Report dismissed' })
      void qc.invalidateQueries({ queryKey: ['ctl-moderation'] })
      void qc.invalidateQueries({ queryKey: ['ctl-overview'] })
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message="You are not authorized to moderate content." />

  return (
    <div>
      <PageHeader title="Moderation" description="Reports filed by members. Message contents are visible to moderators only." />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.reports.length ? (
        <div className="space-y-3">
          {data.reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <StatusBadge status={r.status} />
                    <span className="text-muted-foreground">
                      Reported by {r.reporter.profile?.displayName ?? r.reporter.fullName} · {formatDate(r.createdAt, false)}
                    </span>
                  </div>
                  {r.status === 'open' ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handle(r.id, 'dismiss')}>
                        <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden /> Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handle(r.id, 'resolve')}>
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Resolve
                      </Button>
                      {!r.message.isDeleted ? (
                        <Button size="sm" variant="destructive" onClick={() => void handle(r.id, 'delete_message')}>
                          <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden /> Remove message
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 rounded-lg bg-muted p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">
                    {r.message.sender.profile?.displayName ?? r.message.sender.fullName}
                    {r.message.isDeleted ? ' · [message removed]' : ''} · {formatDate(r.message.createdAt)}
                  </p>
                  <p className={`mt-1 ${r.message.isDeleted ? 'text-muted-foreground line-through' : ''}`}>{r.message.body}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground"><strong>Reason:</strong> {r.reason}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No reports" description="The moderation queue is clear." />
      )}
    </div>
  )
}
