'use client'

// Motion helpers honoring prefers-reduced-motion (§15).
import { useSyncExternalStore } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export { motion, AnimatePresence }

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

/** True when the user prefers reduced motion. External-store based (no cascading renders). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
