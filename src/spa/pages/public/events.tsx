'use client'

// Events archive (§5.4): upcoming/past categories, search, year filter, pagination.
// When nothing is upcoming, the page lands on the past archive so completed
// events (and their recaps) are immediately visible — never a blank default.
import { useEffect, useRef, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, CalendarDays, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, EmptyState, Pagination, CardsSkeleton, formatDate } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type EventsResponse = { total: number; pastTotal: number; upcomingTotal: number; events: EventCard[] }

type EventCard = {
  slug: string; title: string; summary: string | null; venue: string | null; startsAt: string
  status: string; featured: boolean; isPast: boolean; registrationCount: number
  seatsLeft: number | null; registrationOpen: boolean
}

const PAGE_SIZE = 9

export default function EventsPage() {
  const [category, setCategory] = useState<'upcoming' | 'past'>('upcoming')
  // False until the visitor actively picks a tab — lets the first response
  // auto-switch to the past archive when nothing is upcoming.
  const touchedCategory = useRef(false)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [year, setYear] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const currentYear = new Date().getFullYear()
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2]

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['events', category, debouncedQ, year, page],
    queryFn: () => api.get<EventsResponse>(`/api/public/events${qs({ category, q: debouncedQ, year, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })

  // Nothing upcoming (and no explicit tab choice yet)? Show the past archive instead of an empty page.
  useEffect(() => {
    if (!data || touchedCategory.current) return
    if (category === 'upcoming' && data.total === 0 && data.pastTotal > 0) setCategory('past')
  }, [data, category])

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <PageHeader
        title="Events"
        description="Workshops, founder talks and pitch days — past and upcoming. Past events stay archived with recaps."
      />

      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['upcoming', 'past'] as const).map((c) => (
            <Button key={c} size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => { touchedCategory.current = true; setCategory(c); setPage(1) }}>
              {c === 'upcoming' ? 'Upcoming' : 'Past events'}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search events…" className="pl-9" aria-label="Search events" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={year === '' ? 'default' : 'outline'} onClick={() => { setYear(''); setPage(1) }}>All years</Button>
            {years.map((y) => (
              <Button key={y} size="sm" variant={year === String(y) ? 'default' : 'outline'} onClick={() => { setYear(String(y)); setPage(1) }}>{y}</Button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : data?.events.length ? (
        <>
          <div className={`grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${isPlaceholderData ? 'opacity-60' : ''}`}>
            {data.events.map((e) => (
              <Card key={e.slug} className="flex flex-col transition-shadow hover:shadow-md">
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {e.featured ? <Badge className="bg-primary">Featured</Badge> : null}
                    <Badge variant={e.isPast ? 'secondary' : 'default'}>{e.isPast ? 'Past' : 'Upcoming'}</Badge>
                  </div>
                  <button onClick={() => navigate(`/events/${e.slug}`)} className="mt-3 text-left text-base font-semibold leading-snug hover:underline">
                    {e.title}
                  </button>
                  {e.summary ? <p className="mt-2 line-clamp-2 flex-1 text-xs text-muted-foreground">{e.summary}</p> : <div className="flex-1" />}
                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(e.startsAt)}</p>
                    {e.venue ? <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" aria-hidden /> {e.venue}</p> : null}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {e.registrationCount} registered{e.seatsLeft !== null ? ` · ${e.seatsLeft} left` : ''}
                    </span>
                    <Button size="sm" variant={e.isPast ? 'outline' : 'default'} onClick={() => navigate(`/events/${e.slug}`)}>
                      {e.isPast ? 'View recap' : 'Register'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        </>
      ) : isPlaceholderData ? (
        // Tab/filter switch in flight — keep the skeleton instead of flashing an empty state.
        <CardsSkeleton count={6} />
      ) : category === 'upcoming' ? (
        <EmptyState
          title="No upcoming events"
          description="Nothing is scheduled right now — past events stay archived with recaps."
          action={
            <Button size="sm" onClick={() => { touchedCategory.current = true; setCategory('past'); setPage(1) }}>
              View past events{data && data.pastTotal > 0 ? ` (${data.pastTotal})` : ''}
            </Button>
          }
        />
      ) : (
        <EmptyState
          title="No past events found"
          description="Try different filters, or check back soon."
          action={
            debouncedQ || year ? (
              <Button size="sm" variant="outline" onClick={() => { setQ(''); setDebouncedQ(''); setYear(''); setPage(1) }}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
