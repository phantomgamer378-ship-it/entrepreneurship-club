'use client'

// Event detail + registration form (§12 steps 1–8). Guest or member registration;
// server validates published status, window, deadline and capacity.
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, MapPin, Users, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, formatDate } from '@/spa/components/shared'
import { api, ApiClientError } from '@/spa/api/client'
import { navigate } from '@/spa/router'
import { useAuth } from '@/spa/stores/auth'

type EventDetail = {
  slug: string; title: string; summary: string | null; description: string; venue: string | null
  startsAt: string; endsAt: string | null; capacity: number | null; status: string; recap: string | null
  posterUrl: string | null
  isPast: boolean; registrationCount: number; seatsLeft: number | null; canRegister: boolean
  registrationDeadline: string | null
}

// Task 25 — must mirror the Google Form dropdowns (lib/google-forms.ts) so
// synced answers always satisfy the choice-question validation.
const YEAR_OPTIONS = ['First year', 'Second year', 'Third year', 'Fourth year', 'Postgraduate', 'Other']
const BRANCH_OPTIONS = ['CSE', 'IT', 'ECE', 'Electrical', 'Mechanical', 'Civil', 'MBA', 'BBA', 'Design', 'Law', 'Other']

export default function EventDetailPage({ params }: { params: { slug: string } }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['event', params.slug],
    queryFn: () => api.get<EventDetail>(`/api/public/events/${encodeURIComponent(params.slug)}`),
    retry: false,
  })
  const qc = useQueryClient()
  const { authenticated, user } = useAuth()
  const { toast } = useToast()
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  // Task 25 — standard registration questions (everyone answers these).
  const [year, setYear] = useState('')
  const [branch, setBranch] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function register() {
    setSubmitting(true)
    try {
      const res = await api.post<{ ok: boolean; reference: string; seatsLeft: number | null; googleSync?: string }>(
        `/api/public/events/${encodeURIComponent(params.slug)}/register`,
        {
          year,
          branch,
          phone,
          ...(authenticated ? {} : { guestName, guestEmail }),
        }
      )
      setDone(res.reference)
      toast({ title: 'Registration confirmed', description: `Reference ${res.reference}. A confirmation email is on its way.` })
      void qc.invalidateQueries({ queryKey: ['event', params.slug] })
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Registration failed. Please try again.'
      toast({ title: 'Could not register', description: message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="mx-auto max-w-3xl px-4 py-14"><Skeleton className="h-72 rounded-xl" /></div>
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState title="Event not found" description="It may be unpublished or archived." action={<Button variant="outline" onClick={() => navigate('/events')}><ArrowLeft className="mr-1 h-4 w-4" /> All events</Button>} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <Button variant="ghost" size="sm" onClick={() => navigate('/events')} className="mb-6">
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Events
      </Button>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {data.isPast ? <Badge variant="secondary">Past event</Badge> : <Badge className="bg-primary">Upcoming</Badge>}
        {data.seatsLeft !== null && !data.isPast ? <Badge variant="outline">{data.seatsLeft} seats left</Badge> : null}
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight">{data.title}</h1>
      {data.summary ? <p className="mt-2 text-muted-foreground">{data.summary}</p> : null}

      {/* Task 25 — event banner */}
      {data.posterUrl ? (
        <img
          src={data.posterUrl}
          alt={`${data.title} banner`}
          className="mt-6 aspect-[21/9] w-full rounded-2xl border object-cover"
        />
      ) : null}

      <div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
        <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden /> {formatDate(data.startsAt)}{data.endsAt ? ` → ${formatDate(data.endsAt)}` : ''}</p>
        <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" aria-hidden /> {data.venue ?? 'Venue to be announced'}</p>
        <p className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" aria-hidden /> {data.registrationCount} registered{data.capacity ? ` of ${data.capacity}` : ''}</p>
        {data.registrationDeadline && !data.isPast ? (
          <p className="text-xs">Registration closes: {formatDate(data.registrationDeadline)}</p>
        ) : null}
      </div>

      <div className="prose-sm mt-8 whitespace-pre-wrap rounded-xl border bg-card p-6 text-sm leading-relaxed text-foreground/90">
        {data.description}
      </div>

      {data.isPast && data.recap ? (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-base">Outcomes & recap</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{data.recap}</CardContent>
        </Card>
      ) : null}

      {/* Registration (§12) */}
      {!data.isPast ? (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">Register for this event</CardTitle>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-300">You are registered!</p>
                  <p className="mt-1 text-emerald-700 dark:text-emerald-400">Reference: <strong>{done}</strong>. A confirmation email has been queued.</p>
                </div>
              </div>
            ) : data.canRegister ? (
              <form
                className="space-y-4"
                onSubmit={(e) => { e.preventDefault(); void register() }}
              >
                <p className="text-sm text-muted-foreground">
                  Open to everyone — sign in to register with your member account, or continue as a guest.
                </p>
                {/* Task 25 — standard registration questions */}
                {!authenticated ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-name">Full name</Label>
                      <Input id="reg-name" value={guestName} onChange={(e) => setGuestName(e.target.value)} required minLength={2} placeholder="Your name" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="reg-email">Email</Label>
                      <Input id="reg-email" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required placeholder="you@example.com" />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Registering as <strong>{user?.fullName}</strong> ({user?.email}).</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-year">Educational year</Label>
                    <Select value={year} onValueChange={setYear} required>
                      <SelectTrigger id="reg-year" aria-label="Educational year"><SelectValue placeholder="Select year" /></SelectTrigger>
                      <SelectContent>
                        {YEAR_OPTIONS.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-branch">Branch</Label>
                    <Select value={branch} onValueChange={setBranch} required>
                      <SelectTrigger id="reg-branch" aria-label="Branch"><SelectValue placeholder="Select branch" /></SelectTrigger>
                      <SelectContent>
                        {BRANCH_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">Phone number</Label>
                  <Input id="reg-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={6} maxLength={20} placeholder="+91 98765 43210" pattern="[+()\-\s0-9]+" />
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Registering…' : authenticated ? 'Confirm registration' : 'Register'}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.status === 'published' && data.seatsLeft === 0
                  ? 'This event is fully booked.'
                  : 'Registration is closed for this event.'}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
