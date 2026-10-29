'use client'

// Router shims for hash navigation: useSearchParams reads the query part of the hash
// path (e.g. #/auth/reset-password?token=…).
import { useEffect, useState } from 'react'
import { useHashPath } from '@/spa/router'

export function useSearchParams(): URLSearchParams {
  const path = useHashPath()
  const qIndex = path.indexOf('?')
  return new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : '')
}

/** Waits for hash change and exposes the latest params (login reads `next`). */
export function useRouter() {
  const [, force] = useState(0)
  useEffect(() => {
    const onChange = () => force((n) => n + 1)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return { replace: (to: string) => { window.location.hash = to } }
}
