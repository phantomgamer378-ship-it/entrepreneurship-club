'use client'

// PixelDitherHero (PRD: Landing Page Hero — Scroll-Driven Pixel Dither Animation).
// A pinned hero background: an outer 180vh scroll driver with a sticky h-screen
// wrapper holding one tiny canvas (140x78 cells, GPU-upscaled via CSS
// `image-rendering: pixelated`). Scroll progress lives in a ref read by a
// requestAnimationFrame loop — never React state, so scrolling causes ZERO
// re-renders. The loop itself is gated by an IntersectionObserver: scrolled out
// of view, it is fully paused (no rAF scheduled at all — zero cost elsewhere).
// Performance contract (PRD §3/§6): fixed tiny compute grid, `alpha: false`
// context, passive scroll listener with layout reads only in the handler,
// prefers-reduced-motion renders static frames only (user-initiated updates),
// everything cleaned up on unmount, no new dependency.
import { useEffect, useRef, type ReactNode } from 'react'
import { bayerThreshold, mixGray, morphStage, SHAPE_SEQUENCE, shapes, type ShapeSampler } from './pixelDither'

const GRID_W = 140 // compute resolution — deliberately tiny, never scaled by DPR (§3.1)
const GRID_H = 78

export function PixelDitherHero({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0) // 0..1 scroll progress through the pinned section — a ref, never state
  const visibleRef = useRef(false)
  const rafRef = useRef<number | undefined>(undefined)
  const staticRafRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    canvas.width = GRID_W
    canvas.height = GRID_H

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastDrawnProgress = -1

    // Arrow consts (not hoisted function declarations) so the null narrowing
    // from the guards above propagates into these closures for TypeScript.
    const draw = () => {
      const t = performance.now() / 1000
      const progress = progressRef.current
      const { index, localT } = morphStage(progress, SHAPE_SEQUENCE.length)
      const a: ShapeSampler = shapes[SHAPE_SEQUENCE[index]]
      const b: ShapeSampler = shapes[SHAPE_SEQUENCE[index + 1]]

      const img = ctx.createImageData(GRID_W, GRID_H)
      for (let y = 0; y < GRID_H; y++) {
        const ny = (y / GRID_H) * 2 - 1
        for (let x = 0; x < GRID_W; x++) {
          const nx = ((x / GRID_W) * 2 - 1) * (GRID_W / GRID_H)
          const gray = mixGray(a, b, localT, nx, ny, t)
          const on = gray < bayerThreshold(x, y)
          const idx = (y * GRID_W + x) * 4
          const v = on ? 10 : 255
          img.data[idx] = v
          img.data[idx + 1] = v
          img.data[idx + 2] = v
          img.data[idx + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
      lastDrawnProgress = progress
    }

    const loop = () => {
      if (visibleRef.current) draw()
      if (visibleRef.current) {
        rafRef.current = requestAnimationFrame(loop)
      } else {
        rafRef.current = undefined // fully paused — zero work while off-screen
      }
    }

    const onScroll = () => {
      // Layout read lives HERE only — never inside the draw loop (§3.3).
      const rect = container.getBoundingClientRect()
      // Pinned-scrub progress: 0 while the section top is still below the
      // viewport top, 0→1 across the pinned distance, 1 after it scrolls past.
      const pinned = rect.height - window.innerHeight
      progressRef.current = pinned > 0 ? Math.min(1, Math.max(0, -rect.top / pinned)) : 0
      if (reduceMotion) {
        // Reduced motion: the pattern still updates on deliberate scrolling
        // (user-initiated), throttled to one frame and only when the scroll
        // actually moved the morph — never a self-sustaining loop.
        if (staticRafRef.current === undefined && progressRef.current !== lastDrawnProgress) {
          staticRafRef.current = requestAnimationFrame(() => {
            staticRafRef.current = undefined
            draw()
          })
        }
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visibleRef.current = entry.isIntersecting
        if (entry.isIntersecting) {
          // Resume the moment the hero returns.
          if (!reduceMotion && rafRef.current === undefined) {
            rafRef.current = requestAnimationFrame(loop)
          }
        } else if (rafRef.current !== undefined) {
          // Fully pause: cancel even the in-flight frame — zero work off-screen.
          cancelAnimationFrame(rafRef.current)
          rafRef.current = undefined
        }
      },
      { threshold: 0 }
    )
    io.observe(container)

    // First frame BEFORE wiring scroll, so the initial onScroll() snapshot sees
    // an already-drawn pattern and doesn't schedule a redundant static redraw.
    if (reduceMotion) {
      draw() // one static frame — no ambient or automatic motion
    } else {
      rafRef.current = requestAnimationFrame(loop)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener('scroll', onScroll)
      io.disconnect()
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current)
      if (staticRafRef.current !== undefined) cancelAnimationFrame(staticRafRef.current)
      rafRef.current = undefined
      staticRafRef.current = undefined
    }
  }, [])

  return (
    <div ref={containerRef} className="relative h-[180vh] border-b" data-pixel-dither>
      <div className="sticky top-0 h-screen overflow-hidden bg-white dark:bg-zinc-950">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full dark:invert"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* Legibility: a frosted glass panel localized on the CONTENT layer — the
            dither pattern stays full-contrast everywhere else (§8 DoD). */}
        <div className="relative z-10 flex h-full items-center justify-center px-4">
          <div className="w-full max-w-2xl rounded-[2.5rem] bg-white/70 px-7 py-9 shadow-sm backdrop-blur-[2px] sm:px-10 dark:bg-zinc-950/70">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
