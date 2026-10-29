'use client'

// Audit log viewer (§7): filterable security/operational events.
import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, formatDate, ErrorNote } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'

type LogRow = {
  id: string; event: string; actorEmail: string | null; targetType: string | null; targetId: string | null
  metadata: string | null; ip: string | null; createdAt: string; actor: { fullName: string } | null
}
type Response = { total: number; logs: LogRow[]; eventSummary: { event: string; count: number }[] }

export default function ControlAudit() {
  const [event, setEvent] = useState('all')
  const [page, setPage] = useState(1)

  function onEventChange(next: string) {
    setEvent(next)
    setPage(1) // reset pagination when the filter changes
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['ctl-audit', event, page],
    queryFn: () => api.get<Response>(`/api/control/audit${qs({ event: event === 'all' ? '' : event, page })}`),
    placeholderData: keepPreviousData,
    retry: false,
  })

  if (error) return <ErrorNote message="You are not authorized to view the audit log." />

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Security and administrative events. Secrets, tokens and message contents are never logged.
          </p>
        </div>
        <Select value={event} onValueChange={onEventChange}>
          <SelectTrigger className="w-full sm:w-72" aria-label="Filter by event"><SelectValue placeholder="All events" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            {data?.eventSummary.map((e) => (
              <SelectItem key={e.event} value={e.event}>{e.event} ({e.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : data?.logs.length ? (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y">
                {data.logs.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{l.event}</Badge>
                      <span className="text-muted-foreground">{l.actor?.fullName ?? l.actorEmail ?? 'system'}</span>
                      {l.targetType ? <span className="text-xs text-muted-foreground">→ {l.targetType}</span> : null}
                      {l.metadata ? (
                        <span className="max-w-xs truncate text-xs text-muted-foreground/70">{l.metadata}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {l.ip ? <span className="font-mono">{l.ip}</span> : null}
                      <span>{formatDate(l.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Pagination page={page} pageSize={50} total={data.total} onPage={setPage} />
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">No audit events match this filter.</p>
      )}
    </div>
  )
}
