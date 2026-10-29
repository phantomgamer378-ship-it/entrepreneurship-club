// The platform ships as a single-route SPA (sandbox exposes only `/` to visitors).
// In-app hash routing (#/…) provides deep links for every public, workspace and
// control-panel view. See docs/DECISIONS.md §routing.
'use client'

import dynamic from 'next/dynamic'
import { SpaApp } from '@/spa/app'

function BootLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// Hash routes are unreadable during SSR, so server and client would render
// different trees (hydration mismatch). Load the SPA client-side only.
const ClientSpaApp = dynamic(() => Promise.resolve(SpaApp), {
  ssr: false,
  loading: () => <BootLoader />,
})

export default function Home() {
  return <ClientSpaApp />
}
