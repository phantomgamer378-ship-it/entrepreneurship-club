// Minimal hash router with lazy-loaded routes (§15: admin, messaging and video are code-split).
'use client'

import { useEffect, useState, Suspense, lazy, ComponentType } from 'react'

export type RouteParams = Record<string, string>
export type RouteComponent = ComponentType<{ params: RouteParams }>

type RouteDef = {
  pattern: string // e.g. 'members/:username'
  component: React.LazyExoticComponent<RouteComponent>
}

function parseHash(): string {
  const h = window.location.hash.replace(/^#/, '')
  return h.startsWith('/') ? h : `/${h}`
}

export function navigate(path: string) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`
}

export function useHashPath(): string {
  const [path, setPath] = useState(() => (typeof window === 'undefined' ? '/' : parseHash()))
  useEffect(() => {
    const onChange = () => setPath(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return path
}

export function matchRoute(pattern: string, path: string): RouteParams | null {
  const pSeg = pattern.split('/').filter(Boolean)
  const aSeg = path.split('/').filter(Boolean)
  if (pSeg.length !== aSeg.length) return null
  const params: RouteParams = {}
  for (let i = 0; i < pSeg.length; i++) {
    if (pSeg[i].startsWith(':')) {
      params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i])
    } else if (pSeg[i] !== aSeg[i]) {
      return null
    }
  }
  return params
}

export function lazyPage(loader: () => Promise<{ default: RouteComponent }>) {
  return lazy(loader)
}

export function Router({ routes, fallback }: { routes: RouteDef[]; fallback: RouteComponent }) {
  const path = useHashPath()
  const clean = path.split('?')[0]
  for (const route of routes) {
    const params = matchRoute(route.pattern, clean)
    if (params) {
      const C = route.component
      return (
        <Suspense fallback={<PageLoader />}>
          <C params={params} />
        </Suspense>
      )
    }
  }
  const F = fallback
  return (
    <Suspense fallback={<PageLoader />}>
      <F params={{}} />
    </Suspense>
  )
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
