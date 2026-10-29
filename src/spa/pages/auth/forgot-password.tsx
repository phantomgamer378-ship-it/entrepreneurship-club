'use client'

// Forgot password (§6): always returns a neutral result (no account enumeration).
import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound } from 'lucide-react'
import { api } from '@/spa/api/client'
import { navigate } from '@/spa/router'

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch {
      toast({ title: 'Something went wrong', description: 'Please try again shortly.', variant: 'destructive' })
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
              <KeyRound className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-xl font-bold">Reset your password</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter your account email and we&apos;ll send a secure reset link.</p>
          </div>

          {sent ? (
            <div className="mt-6 rounded-lg border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
              If that account exists, a reset link has been sent. The link expires in 1 hour.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fp-email">Email</Label>
                <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>{submitting ? 'Sending…' : 'Send reset link'}</Button>
            </form>
          )}

          <button className="mt-4 w-full text-center text-sm text-primary hover:underline" onClick={() => navigate('/auth/login')}>
            Back to sign in
          </button>
        </CardContent>
      </Card>
    </div>
  )
}
