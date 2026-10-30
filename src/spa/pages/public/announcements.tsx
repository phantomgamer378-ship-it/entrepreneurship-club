'use client'

// Announcements listing (§5.5): audience-aware, category filter, pinned first.
import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Search, Pin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader, EmptyState, Pagination, CardsSkeleton, formatDate } from '@/spa/components/shared'
import { api, qs } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type AnnouncementCard = {
  id: string; title: string; category: string; audience: string; pinned: boolean
  publishedAt: string | null; excerpt: string
}

const PAGE_SIZE = 9
const CATEGORIES = ['', 'general', 'training', 'operational', 'internship_placement', 'event', 'achievement', 'opportunity', 'urgent'] as const

export default function AnnouncementsPage() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['announcements', debouncedQ, category, page],
    queryFn: () => api.get<{ total: number; announcements: AnnouncementCard[] }>(`/api/public/announcements${qs({ q: debouncedQ, category, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <PageHeader
        title="Announcements"
        description="Official club updates. Members-only posts appear after signing in."
      />

      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search announcements…" className="pl-9" aria-label="Search announcements" />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Button key={c || 'all'} size="sm" variant={category === c ? 'default' : 'outline'} onClick={() => { setCategory(c); setPage(1) }}>
              {c || 'All'} {c ? <span className="sr-only">category</span> : null}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <CardsSkeleton count={6} />
      ) : data?.announcements.length ? (
        <>
          <div className={`grid gap-4 transition-opacity md:grid-cols-2 lg:grid-cols-3 ${isPlaceholderData ? 'opacity-60' : ''}`}>
            {data.announcements.map((a) => (
              <Card key={a.id} className="flex flex-col transition-shadow hover:shadow-md">
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{a.category}</Badge>
                    {a.pinned ? (
                      <Badge className="bg-primary"><Pin className="mr-1 h-3 w-3" aria-hidden /> Pinned</Badge>
                    ) : null}
                    {a.audience !== 'public' ? <Badge variant="outline" className="capitalize">{a.audience} only</Badge> : null}
                  </div>
                  <button onClick={() => navigate(`/announcements/${a.id}`)} className="mt-3 text-left text-sm font-semibold leading-snug hover:underline">
                    {a.title}
                  </button>
                  <p className="mt-2 line-clamp-3 flex-1 text-xs text-muted-foreground">{a.excerpt}</p>
                  <p className="mt-3 text-xs text-muted-foreground/70">{formatDate(a.publishedAt, false)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        </>
      ) : (
        <EmptyState title="No announcements found" description="Try a different filter or check back later." />
      )}
    </div>
  )
}
