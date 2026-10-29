'use client'

// Invitation acceptance (§6): validate token → set password + display name → activate.
import { useEffect, useState } from 'react'
import { useSearchParams } from '@/spa/lib/shims'
import { useAuth } from '@/spa/stores/auth'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Rocket, MailCheck, ShieldAlert } from 'lucide-react'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

type InviteInfo = { valid: boolean; email?: string; type?: string; reason?: string }

export default function AcceptInvitePage() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const { refresh } = useAuth()
  const { toast } = useToast()
  const [info, setInfo] = useState<InviteInfo | null>(null)
  const [checking, setChecking] = useState(true)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setInfo({ valid: false, reason: 'missing' })
      setChecking(false)
      return
    }
    api.get<InviteInfo>(`/api/auth/accept-invite?token=${encodeURIComponent(token)}`)
      .then(setInfo)
      .catch(() => setInfo({ valid: false, reason: 'error' }))
      .finally(() => setChecking(false))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/api/auth/accept-invite', { token, password, displayName })
      await refresh()
      toast({ title: 'Welcome aboard!', description: 'Your member account is now active.' })
      navigate('/workspace')
    } catch {
      toast({ title: 'Activation failed', description: 'Check the password requirements and try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return <div className="flex min-h-screen items-center justify-center bg-muted/40"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
  }

  if (!info?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
            <h1 className="mt-4 text-xl font-bold">Invitation unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invitation link is invalid, already used, or expired. Please request a fresh invitation from a club
              administrator.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => navigate('/')}>Back to home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <MailCheck className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold">Activate your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invited as <strong>{info.type}</strong> · <span className="font-mono">{info.email}</span>
          </p>
        </div>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">Display name</Label>
                <Input id="inv-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={120} placeholder="How your name should appear" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-password">Choose a password</Label>
                <Input id="inv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" placeholder="10+ characters with a letter and number" />
                <p className="text-xs text-muted-foreground">At least 10 characters, with at least one letter and one number.</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Activating…' : 'Activate account'}
              </Button>
            </form>
            <p className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Rocket className="h-3 w-3" aria-hidden /> This link works once and expires 7 days after it was sent.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
