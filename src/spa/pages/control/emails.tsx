'use client'

// Email center (§7.1/§11): outbox queue status, delivery logs, authorized manual retry.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCcw, AlertTriangle, MailCheck, UserMinus, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageHeader, EmptyState, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { useToast } from '@/hooks/use-toast'
import { useQuery as useRQ } from '@tanstack/react-query'

type Job = {
  id: string; category: string; toEmail: string; subject: string; status: string
  attempts: number; maxAttempts: number; nextAttemptAt: string; lastError: string | null
  providerMessageId: string | null; createdAt: string; sentAt: string | null
}
type Log = { id: string; outboxId: string; event: string; payload: string | null; occurredAt: string }
type Sub = { id: string; email: string; isActive: boolean; source: string; subscribedAt: string; unsubscribedAt: string | null }

export default function ControlEmails() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [tab, setTab] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-emails', tab],
    queryFn: () => api.get<{ jobs: Job[]; counts: { status: string; count: number }[]; recentLogs: Log[] }>(`/api/control/emails?status=${tab}`),
    retry: false,
    refetchInterval: 15_000,
  })
  const health = useRQ({ queryKey: ['health'], queryFn: () => api.get<{ integrations: { email: string } }>('/api/health') })
  const subs = useQuery({
    queryKey: ['ctl-subscribers'],
    queryFn: () => api.get<{ subscribers: Sub[]; active: number; total: number }>('/api/control/newsletter/subscribers'),
    retry: false,
    refetchInterval: 30_000,
  })

  async function setSub(id: string, action: 'deactivate' | 'reactivate') {
    try {
      await api.patch('/api/control/newsletter/subscribers', { id, action })
      toast({ title: action === 'deactivate' ? 'Subscriber removed' : 'Subscriber reactivated' })
      void qc.invalidateQueries({ queryKey: ['ctl-subscribers'] })
    } catch (err) {
      toast({ title: 'Action failed', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  async function retry(id: string) {
    try {
      await api.post('/api/control/emails', { outboxId: id })
      toast({ title: 'Job re-queued' })
      void qc.invalidateQueries({ queryKey: ['ctl-emails'] })
    } catch (err) {
      toast({ title: 'Cannot retry', description: err instanceof Error ? err.message : '', variant: 'destructive' })
    }
  }

  if (error) return <ErrorNote message="You are not authorized to view the email center." />

  const provider = health.data?.integrations.email ?? '…'
  const isDevProvider = provider === 'console-dev-mode'

  return (
    <div>
      <PageHeader
        title="Email Center"
        description="Outbox queue, retries and delivery tracking. Provider acceptance is not delivery — webhooks update final states."
        actions={
          <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Provider:</span>
            <Badge variant={isDevProvider ? 'secondary' : 'default'}>{provider}</Badge>
          </div>
        }
      />

      {isDevProvider ? (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong>Development mode.</strong> No RESEND_API_KEY configured — emails are recorded in the outbox and
            logged to the server console, not actually delivered. Add the key in the environment to enable real delivery.
          </span>
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-3">
        {data?.counts.map((c) => (
          <div key={c.status} className="rounded-xl border bg-card px-4 py-3 text-center">
            <p className="text-lg font-bold tabular-nums">{c.count}</p>
            <p className="text-xs capitalize text-muted-foreground">{c.status}</p>
          </div>
        ))}
        {!data ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 w-24 animate-pulse rounded-xl bg-muted" />) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="queued">Queued</TabsTrigger>
          <TabsTrigger value="failed">Failed</TabsTrigger>
          <TabsTrigger value="dead">Dead</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle className="text-base">Outbox</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
            ) : data?.jobs.length ? (
              <ScrollArea className="max-h-[60vh]">
                <div className="divide-y rounded-lg border">
                  {data.jobs.map((j) => (
                    <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{j.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {j.toEmail} · {j.category} · attempts {j.attempts}/{j.maxAttempts}
                        </p>
                        {j.lastError ? <p className="mt-0.5 truncate text-xs text-destructive">{j.lastError}</p> : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {j.sentAt ? formatDate(j.sentAt) : `next ${formatDate(j.nextAttemptAt)}`}
                        </span>
                        <StatusBadge status={j.status} />
                        {['failed', 'dead'].includes(j.status) ? (
                          <Button size="sm" variant="outline" onClick={() => void retry(j.id)}>
                            <RefreshCcw className="mr-1 h-3 w-3" aria-hidden /> Retry
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <EmptyState title="No email jobs" description="Transactional email appears here as the platform uses it." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Delivery log</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2">
                {data?.recentLogs.length ? data.recentLogs.map((l) => (
                  <div key={l.id} className="rounded-lg border p-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">{l.event}</Badge>
                      <span className="text-muted-foreground">{formatDate(l.occurredAt)}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-muted-foreground">{l.outboxId}</p>
                  </div>
                )) : <p className="py-6 text-center text-sm text-muted-foreground">No delivery events yet.</p>}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MailCheck className="h-4 w-4" aria-hidden /> Newsletter subscribers
            {subs.data ? (
              <Badge variant="secondary" className="ml-1">{subs.data.active} active · {subs.data.total} total</Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {subs.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : subs.data?.subscribers.length ? (
            <ScrollArea className="max-h-72">
              <div className="divide-y rounded-lg border">
                {subs.data.subscribers.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{s.email}</p>
                      <p className="text-xs text-muted-foreground">
                        subscribed {formatDate(s.subscribedAt)} · via {s.source}
                        {s.unsubscribedAt && !s.isActive ? ` · removed ${formatDate(s.unsubscribedAt)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={s.isActive ? 'default' : 'secondary'}>{s.isActive ? 'active' : 'unsubscribed'}</Badge>
                      {s.isActive ? (
                        <Button size="sm" variant="outline" onClick={() => void setSub(s.id, 'deactivate')}>
                          <UserMinus className="mr-1 h-3 w-3" aria-hidden /> Remove
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => void setSub(s.id, 'reactivate')}>
                          <UserCheck className="mr-1 h-3 w-3" aria-hidden /> Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <EmptyState title="No subscribers yet" description="Public visitors can subscribe from the site footer — they will appear here." />
          )}
          {subs.error ? <p className="mt-2 text-xs text-muted-foreground">Subscriber list unavailable for your role.</p> : null}
        </CardContent>
      </Card>
    </div>
  )
}
