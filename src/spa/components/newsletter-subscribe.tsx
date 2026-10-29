'use client'

// Newsletter opt-in form for the public site footer (Task 24). Posts to the
// public subscribe API; shows inline success/already/error states. Includes a
// honeypot field ("company") that real users never see.
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Mail, Send } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'already' | 'error'

export function NewsletterSubscribe() {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('') // honeypot — must stay empty
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (status === 'loading') return
    setStatus('loading')
    setMessage('')
    try {
      const res = await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, company }),
      })
      const data = (await res.json().catch(() => ({}))) as { message?: string }
      if (res.ok) {
        const already = (data as { status?: string }).status === 'already'
        setStatus(already ? 'already' : 'success')
        setMessage(data.message ?? "You're on the list!")
        setEmail('')
      } else {
        setStatus('error')
        setMessage(data.message ?? 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Network error — please check your connection and try again.')
    }
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="h-4 w-4" aria-hidden />
        Stay in the loop
      </h3>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Get an email whenever we publish a new announcement or event. No spam — public updates only, unsubscribe anytime.
      </p>
      {status === 'success' || status === 'already' ? (
        <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-700 dark:text-emerald-400" role="status">
          {message}
        </p>
      ) : (
        <form className="mt-4 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row" onSubmit={submit}>
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <Input
            id="newsletter-email"
            type="email"
            required
            maxLength={254}
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 flex-1"
          />
          {/* Honeypot — hidden from humans, catnip for bots */}
          <input
            type="text"
            name="company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <Button type="submit" disabled={status === 'loading'} className="h-10 gap-2">
            {status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Subscribe
          </Button>
        </form>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {message}
        </p>
      )}
      {status !== 'success' && status !== 'already' && (
        <p className="mt-2 text-xs text-muted-foreground/70">We only send public announcements and event invites — never member or application data.</p>
      )}
    </div>
  )
}
