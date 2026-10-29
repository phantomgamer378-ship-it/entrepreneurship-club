'use client'

// PRD §8 — /control/automations: read-only view of automation job schedules and
// automation_runs history. Gated on automations.read. Jobs execute via the cron
// endpoint (x-cron-secret) — this page never triggers writes itself.
import { useQuery } from '@tanstack/react-query'
import { Bot } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader, StatusBadge, formatDate, ErrorNote } from '@/spa/components/shared'
import { api } from '@/spa/api/client'

type JobInfo = { name: string; schedule: string; lastRunAt?: string | null }
type RunRow = {
  id: number; jobName: string; startedAt: string; completedAt: string | null
  status: string; affectedCount: number | null; notes: string | null
}

export default function ControlAutomations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-automations'],
    queryFn: () => api.get<{ jobs: JobInfo[]; runs: RunRow[] }>('/api/control/automations'),
    retry: false,
    refetchInterval: 30_000,
  })

  if (error) return <ErrorNote message="You are not authorized to view automations." />

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Scheduled self-maintenance jobs. Every run is logged here with its affected row count."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.jobs ?? []).map((j) => (
          <Card key={j.name}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" aria-hidden />
                <p className="text-sm font-semibold">{j.name}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Schedule <code>{j.schedule}</code>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {j.lastRunAt ? `Last run ${formatDate(j.lastRunAt, true)}` : 'Never run yet'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : data?.runs.length ? (
        <div className="overflow-hidden rounded-xl border" role="table" aria-label="Automation run history">
          <div className="divide-y">
            {data.runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" role="row">
                <div className="min-w-0">
                  <p className="font-medium">{r.jobName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.startedAt, true)}
                    {r.completedAt ? ` · finished ${formatDate(r.completedAt, true)}` : ' · still running'}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.affectedCount != null ? <Badge variant="secondary">{r.affectedCount} affected</Badge> : null}
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No runs recorded yet — jobs fire on their cron schedules, or immediately when triggered via the cron endpoint.
        </p>
      )}
    </div>
  )
}
