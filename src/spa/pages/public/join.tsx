'use client'

// Membership application (§5.6): client-side validation mirrors server-side zod schema;
// anti-spam via honeypot + time-gate; rate limited server-side; duplicate-safe.
import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2 } from 'lucide-react'
import { api, ApiClientError } from '@/spa/api/client'
import { navigate } from '@/spa/router'

const INTERESTS = [
  'Product & UX', 'Engineering', 'Marketing & Growth', 'Finance & Ops',
  'Design', 'Content & Media', 'Not sure yet',
]

export default function JoinPage() {
  const { toast } = useToast()
  const startedAt = useRef(Date.now())
  const [form, setForm] = useState({
    requestedUsername: '', email: '', fullName: '', courseYear: '',
    interestArea: '', motivation: '', portfolioUrl: '', linkedinUrl: '', githubUrl: '', website: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [reference, setReference] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Join — Entrepreneurship Club'
  }, [])

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!/^[a-z0-9][a-z0-9_.-]*[a-z0-9]$/.test(form.requestedUsername.toLowerCase()) || form.requestedUsername.length < 3) {
      e.requestedUsername = '3–30 chars: lowercase letters, numbers, dot, dash, underscore'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email'
    if (form.fullName.trim().length < 2) e.fullName = 'Full name required'
    if (form.motivation.trim().length < 30) e.motivation = 'Tell us a bit more (at least 30 characters)'
    for (const k of ['portfolioUrl', 'linkedinUrl', 'githubUrl'] as const) {
      if (form[k] && !/^https?:\/\//.test(form[k])) e[k] = 'Must start with http:// or https://'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const res = await api.post<{ ok: boolean; reference: string }>('/api/public/join', {
        ...form,
        requestedUsername: form.requestedUsername.toLowerCase(),
        elapsedMs: Date.now() - startedAt.current,
      })
      setReference(res.reference)
      toast({ title: 'Application submitted', description: `Reference ${res.reference}` })
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Submission failed. Please try again.'
      toast({ title: 'Could not submit', description: message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (reference) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
            <h1 className="mt-4 text-xl font-bold">Application received</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Our review team evaluates applications weekly. Keep your reference for follow-up:
            </p>
            <p className="mt-3 rounded-lg bg-muted px-4 py-2 font-mono text-lg font-bold tracking-wider">{reference}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              A confirmation email has been queued. Submitting an application does not grant member access — you will
              receive a secure invitation link if approved.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => navigate('/')}>Back to home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-14">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">Join the Entrepreneurship Club</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Applications for the 2026 intake are open. We review weekly — approved applicants receive a secure
          invitation to activate their member account.
        </p>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <form onSubmit={submit} className="space-y-5" noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Requested username" htmlFor="j-username" error={errors.requestedUsername}>
                <Input
                  id="j-username" value={form.requestedUsername}
                  onChange={(e) => setForm({ ...form, requestedUsername: e.target.value.toLowerCase() })}
                  placeholder="e.g. priya.nair" required minLength={3} maxLength={30} autoComplete="off"
                />
              </Field>
              <Field label="Email" htmlFor="j-email" error={errors.email}>
                <Input id="j-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@student.adypu.edu.in" required />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="j-name" error={errors.fullName}>
                <Input id="j-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
              </Field>
              <Field label="Course & year (optional)" htmlFor="j-course">
                <Input id="j-course" value={form.courseYear} onChange={(e) => setForm({ ...form, courseYear: e.target.value })} placeholder="e.g. B.Tech CSE, 2nd Year" />
              </Field>
            </div>

            <Field label="Area of interest" htmlFor="j-interest">
              <Select value={form.interestArea} onValueChange={(v) => setForm({ ...form, interestArea: v })}>
                <SelectTrigger id="j-interest" aria-label="Area of interest">
                  <SelectValue placeholder="Pick the closest match" />
                </SelectTrigger>
                <SelectContent>
                  {INTERESTS.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Why do you want to join?" htmlFor="j-motivation" error={errors.motivation} hint={`${form.motivation.length}/4000 — at least 30 characters`}>
              <Textarea id="j-motivation" value={form.motivation} onChange={(e) => setForm({ ...form, motivation: e.target.value })} rows={5} required placeholder="What do you want to learn or build with the club?" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Portfolio (optional)" htmlFor="j-portfolio" error={errors.portfolioUrl}>
                <Input id="j-portfolio" value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} placeholder="https://…" />
              </Field>
              <Field label="LinkedIn (optional)" htmlFor="j-linkedin" error={errors.linkedinUrl}>
                <Input id="j-linkedin" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
              </Field>
              <Field label="GitHub (optional)" htmlFor="j-github" error={errors.githubUrl}>
                <Input id="j-github" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} placeholder="https://github.com/…" />
              </Field>
            </div>

            {/* Honeypot — hidden from users, catches bots. */}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="j-website">Website</label>
              <input id="j-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By applying you agree to the club&apos;s code of conduct. Duplicate applications are merged automatically.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label, htmlFor, error, hint, children,
}: {
  label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
