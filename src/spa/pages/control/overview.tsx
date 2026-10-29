'use client'

// Control overview (§7.1): pending applications, members, events, email failures,
// moderation queue, quick links. Values reflect caller permissions server-side.
import { useQuery } from '@tanstack/react-query'
import { FileText, Users, CalendarDays, Megaphone, Mail, Flag, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type Overview = {
  viewer: { roles: string[]; permissions: { isAdmin: boolean; canReview: boolean; canAudit: boolean } }
  stats: { pendingApplications: number; activeMembers: number; upcomingEvents: number; publishedAnnouncements: number; emailFailures: number; openReports: number }
  recentApplications: { id: string; fullName: string; email: string; interestArea: string | null; createdAt: string; reference: string }[]
  upcomingEvents: { id: string; title: string; startsAt: string; venue: string | null; registrationCount: number }[]
}

export default function ControlOverview() {
  const { data, isLoading } = useQuery({ queryKey: ['ctl-overview'], queryFn: () => api.get<Overview>('/api/control/overview') })

  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-10 w-72" /><div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></div>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Administration overview</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as {data.viewer.roles.map((r) => r.replace(/_/g, ' ')).join(', ') || 'member'}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Pending applications" value={data.stats.pendingApplications} tone={data.stats.pendingApplications > 0 ? 'warning' : 'default'} hint="awaiting review" />
        <StatCard label="Active members" value={data.stats.activeMembers} tone="success" />
        <StatCard label="Upcoming events" value={data.stats.upcomingEvents} />
        <StatCard label="Published announcements" value={data.stats.publishedAnnouncements} />
        <StatCard label="Email failures" value={data.stats.emailFailures} tone={data.stats.emailFailures > 0 ? 'danger' : 'default'} hint="failed or dead jobs" />
        <StatCard label="Open moderation reports" value={data.stats.openReports} tone={data.stats.openReports > 0 ? 'warning' : 'default'} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary" aria-hidden /> Recent applications</span>
              {data.viewer.permissions.canReview ? <Button variant="ghost" size="sm" onClick={() => navigate('/control/applications')}>Review <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.recentApplications.length ? data.recentApplications.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{a.fullName} <span className="ml-1 font-mono text-xs text-muted-foreground">{a.reference}</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.interestArea ?? '—'} · applied {formatDate(a.createdAt, false)}</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No pending applications.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Upcoming events</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/control/events')}>Manage <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.upcomingEvents.length ? data.upcomingEvents.map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(e.startsAt)} · {e.registrationCount} registered</p>
              </div>
            )) : <p className="text-sm text-muted-foreground">No upcoming events.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Users, label: 'Members', path: '/control/members', show: data.viewer.permissions.isAdmin },
          { icon: Megaphone, label: 'Announcements', path: '/control/announcements', show: true },
          { icon: Mail, label: 'Email center', path: '/control/emails', show: data.viewer.permissions.isAdmin },
          { icon: Flag, label: 'Moderation', path: '/control/moderation', show: data.viewer.permissions.isAdmin },
        ].filter((x) => x.show).map((q) => (
          <button key={q.path} onClick={() => navigate(q.path)} className="rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent">
            <q.icon className="h-5 w-5 text-primary" aria-hidden />
            <p className="mt-2 text-sm font-semibold">{q.label}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
