'use client'

// Member dashboard (§6): welcome, status, announcements, events, unread, meetings, activity.
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Megaphone, MessageSquare, Bell, Video, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { useAuth } from '@/spa/stores/auth'

type Dashboard = {
  profile: { username: string; displayName: string; clubRoleLabel: string | null; avatarUrl: string | null } | null
  unreadMessages: number
  unreadNotifications: number
  upcomingEvents: { slug: string; title: string; startsAt: string; venue: string | null }[]
  latestAnnouncements: { id: string; title: string; category: string; publishedAt: string | null }[]
  meetings: { id: string; slug: string; name: string; startsAt: string | null; host: { fullName: string } }[]
}

export default function WorkspaceDashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({ queryKey: ['ws-dashboard'], queryFn: () => api.get<Dashboard>('/api/workspace/dashboard') })

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div className="rounded-2xl border bg-gradient-to-r from-muted/70 to-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {user?.displayName?.split(' ')[0] ?? data.profile?.displayName} 👋</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.profile?.clubRoleLabel ? `You are a ${data.profile.clubRoleLabel} of the club.` : 'Member status: active.'}
              {' '}@{data.profile?.username}
            </p>
          </div>
          <Button onClick={() => navigate('/workspace/profile')}>Edit profile</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Unread messages" value={data.unreadMessages} hint="across your conversations" />
        <StatCard label="Notifications" value={data.unreadNotifications} hint="unread updates" />
        <StatCard label="Upcoming events" value={data.upcomingEvents.length} hint="published events" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Announcements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Megaphone className="h-4 w-4 text-primary" aria-hidden /> Latest announcements</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/announcements')}>All <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.latestAnnouncements.length ? data.latestAnnouncements.map((a) => (
              <button key={a.id} onClick={() => navigate(`/announcements/${a.id}`)} className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="mt-1 text-xs text-muted-foreground"><Badge variant="secondary" className="mr-2 capitalize">{a.category}</Badge>{formatDate(a.publishedAt, false)}</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No announcements yet.</p>}
          </CardContent>
        </Card>

        {/* Events */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Upcoming events</span>
              <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>All <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.upcomingEvents.length ? data.upcomingEvents.map((e) => (
              <button key={e.slug} onClick={() => navigate(`/events/${e.slug}`)} className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent">
                <p className="text-sm font-medium">{e.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(e.startsAt)}{e.venue ? ` · ${e.venue}` : ''}</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No upcoming events.</p>}
          </CardContent>
        </Card>

        {/* Messages shortcut */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4 text-primary" aria-hidden /> Messages</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {data.unreadMessages > 0 ? `You have ${data.unreadMessages} unread message${data.unreadMessages === 1 ? '' : 's'}.` : 'You are all caught up.'}
            </p>
            <Button size="sm" className="mt-3" onClick={() => navigate('/workspace/messages')}>Open messages</Button>
          </CardContent>
        </Card>

        {/* Meetings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4 text-primary" aria-hidden /> Meetings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.meetings.length ? data.meetings.slice(0, 3).map((m) => (
              <button key={m.id} onClick={() => navigate(`/workspace/meet/${m.id}`)} className="block w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent">
                <p className="text-sm font-medium">{m.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Hosted by {m.host.fullName}{m.startsAt ? ` · ${formatDate(m.startsAt)}` : ''}</p>
              </button>
            )) : <p className="text-sm text-muted-foreground">No active meetings right now.</p>}
            <Button size="sm" variant="outline" onClick={() => navigate('/workspace/meetings')}><Bell className="mr-1 h-3.5 w-3.5" aria-hidden /> Meetings hub</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
