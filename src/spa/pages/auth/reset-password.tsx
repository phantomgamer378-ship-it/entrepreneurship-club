'use client'

// Password reset: consumes a single-use token (§6 secure recovery).
import { useState } from 'react'
import { useSearchParams } from '@/spa/lib/shims'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck } from 'lucide-react'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

export default function ResetPasswordPage() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/api/auth/reset-password', { token, password })
      setDone(true)
      toast({ title: 'Password updated', description: 'You can now sign in with your new password.' })
      setTimeout(() => navigate('/auth/login'), 1500)
    } catch {
      toast({ title: 'Reset failed', description: 'The link may have expired, or the password is too weak.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold">Choose a new password</h1>
          </div>

          {done ? (
            <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              Password updated. Redirecting to sign in…
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="rp-password">New password</Label>
                <Input id="rp-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="new-password" />
                <p className="text-xs text-muted-foreground">At least 10 characters, with at least one letter and one number.</p>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !token}>
                {submitting ? 'Updating…' : 'Update password'}
              </Button>
              {!token ? <p className="text-center text-xs text-destructive">Missing reset token — use the link from your email.</p> : null}
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
