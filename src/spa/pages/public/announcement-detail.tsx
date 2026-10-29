'use client'

import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Pin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, formatDate } from '@/spa/components/shared'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type AnnouncementDetail = {
  id: string; title: string; body: string; category: string; audience: string
  pinned: boolean; publishedAt: string | null
}

export default function AnnouncementDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['announcement', params.id],
    queryFn: () => api.get<AnnouncementDetail>(`/api/public/announcements/${encodeURIComponent(params.id)}`),
    retry: false,
  })

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-14"><Skeleton className="h-64 rounded-xl" /></div>
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState
          title="Announcement not found"
          description="It may be unpublished, archived, or restricted to members."
          action={<Button variant="outline" onClick={() => navigate('/announcements')}><ArrowLeft className="mr-1 h-4 w-4" /> All announcements</Button>}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <Button variant="ghost" size="sm" onClick={() => navigate('/announcements')} className="mb-6">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Announcements
      </Button>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="capitalize">{data.category}</Badge>
            {data.pinned ? <Badge className="bg-primary"><Pin className="mr-1 h-3 w-3" aria-hidden /> Pinned</Badge> : null}
            {data.audience !== 'public' ? <Badge variant="outline" className="capitalize">{data.audience} only</Badge> : null}
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{data.title}</h1>
          <p className="mt-2 text-xs text-muted-foreground">Published {formatDate(data.publishedAt, false)}</p>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{data.body}</div>
        </CardContent>
      </Card>
    </div>
  )
}
