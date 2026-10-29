'use client'

// Notifications center.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, EmptyState, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { cn } from '@/lib/utils'

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string }

export default function NotificationsPage() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<{ notifications: Notification[]; unread: number }>('/api/workspace/notifications') })

  async function markAll() {
    await api.patch('/api/workspace/notifications', { all: true })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  async function markOne(id: string) {
    await api.patch('/api/workspace/notifications', { id })
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={data ? `${data.unread} unread` : undefined}
        actions={data && data.unread > 0 ? <Button size="sm" variant="outline" onClick={markAll}><Check className="mr-1 h-4 w-4" aria-hidden /> Mark all read</Button> : undefined}
      />
      {data?.notifications.length ? (
        <div className="space-y-2">
          {data.notifications.map((n) => (
            <Card key={n.id} className={cn(!n.readAt && 'border-primary/40')}>
              <CardContent className="flex items-start gap-3 p-4">
                <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', !n.readAt ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
                  <Bell className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.body ? <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground/70">{formatDate(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  {n.link ? <Button size="sm" variant="outline" onClick={() => navigate(n.link!)}>Open</Button> : null}
                  {!n.readAt ? <Button size="sm" variant="ghost" onClick={() => void markOne(n.id)}>Mark read</Button> : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState title="No notifications" description="Meeting invitations and club updates will appear here." />
      )}
    </div>
  )
}
