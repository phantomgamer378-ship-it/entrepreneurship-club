// PixelDitherHero §7 behavior tests (bun:test + happy-dom, registered per-file so
// the other server-side suites are untouched). Canvas 2D is stubbed with a
// recording context — we assert on putImageData calls, rAF scheduling, listener
// and observer lifecycle, which is exactly the PRD's three named behaviors.
// @happy-dom/global-registrator is a dev-only dependency (no runtime impact).
import { describe, test, expect, beforeAll, afterAll, beforeEach, spy } from 'bun:test'
import { GlobalRegistrator } from '@happy-dom/global-registrator'
import { bayerThreshold, mixGray, morphStage, shapes } from '../src/features/landing/pixelDither'

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  GlobalRegistrator.register()
})

afterAll(() => {
  GlobalRegistrator.unregister()
})

// ── Recording canvas 2D context ─────────────────────────────────────────────
type Frame = { width: number; height: number; data: Uint8ClampedArray }
let frames: Frame[] = []

function stubCanvasContext() {
  const proto = window.HTMLCanvasElement.prototype as unknown as Record<string, unknown>
  proto.getContext = function () {
    return {
      createImageData(w: number, h: number) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }
      },
      putImageData(img: Frame) {
        frames.push({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) })
      },
    }
  } as never
}

// ── rAF / listeners / IO harness ────────────────────────────────────────────
type Raf = { id: number; cb: FrameRequestCallback }
let rafQueue: Raf[] = []
let rafSeq = 0
let ioInstances: FakeIO[] = []

class FakeIO {
  static last: FakeIO | null = null
  cb: IntersectionObserverCallback
  observed: Element[] = []
  disconnected = false
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb
    ioInstances.push(this)
    FakeIO.last = this
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true
  }
  fire(isIntersecting: boolean) {
    this.cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

type ListenerRecord = { type: string; fn: EventListener; options: unknown }
let addedListeners: ListenerRecord[] = []
let removedListeners: ListenerRecord[] = []

function installHarness() {
  stubCanvasContext()
  window.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = ++rafSeq
    rafQueue.push({ id, cb })
    return id
  }) as typeof requestAnimationFrame
  window.cancelAnimationFrame = ((id: number) => {
    rafQueue = rafQueue.filter((r) => r.id !== id)
  }) as typeof cancelAnimationFrame
  const originalAdd = window.addEventListener.bind(window)
  const originalRemove = window.removeEventListener.bind(window)
  const wrapOptions = (options?: unknown) => options as boolean | AddEventListenerOptions | undefined
  window.addEventListener = ((type: string, fn: EventListener, options?: boolean | AddEventListenerOptions) => {
    addedListeners.push({ type, fn, options })
    return originalAdd(type, fn, wrapOptions(options))
  }) as typeof window.addEventListener
  window.removeEventListener = ((type: string, fn: EventListener, options?: boolean | EventListenerOptions) => {
    removedListeners.push({ type, fn, options })
    return originalRemove(type, fn, wrapOptions(options))
  }) as typeof window.removeEventListener
}

function flushRaf() {
  const batch = [...rafQueue]
  rafQueue = []
  for (const r of batch) r.cb(performance.now())
}

/** Render the component with React, flushing effects synchronously via act. */
async function mount() {
  const { createRoot } = await import('react-dom/client')
  const { act } = await import('react')
  const React = (await import('react')).default
  const { PixelDitherHero } = await import('../src/features/landing/PixelDitherHero')
  const div = document.createElement('div')
  document.body.appendChild(div)
  const root = createRoot(div)
  await act(async () => {
    root.render(React.createElement(PixelDitherHero, null))
  })
  return {
    container: div,
    unmount: async () => {
      await act(async () => root.unmount())
      div.remove()
    },
  }
}

beforeEach(() => {
  frames = []
  rafQueue = []
  rafSeq = 0
  ioInstances = []
  addedListeners = []
  removedListeners = []
  FakeIO.last = null
  installHarness()
  window.scrollTo(0, 0)
  document.body.innerHTML = ''
})

describe('pixel dither core (pure)', () => {
  test('bayerThreshold tiles in 0..1 with 8x8 period', () => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = bayerThreshold(x, y)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
        expect(v).toBe(bayerThreshold(x + 8, y + 8))
      }
    }
  })

  test('samplers stay in 0..1 and cloud morph endpoints hold', () => {
    for (const s of Object.values(shapes)) {
      for (let i = 0; i <= 20; i++) {
        const g = s(-1 + (i / 10), -1 + ((i * 7) / 10) % 2, i / 3)
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThanOrEqual(1)
      }
    }
    // Morph: localT=0 → pure shape a, localT=1 → pure shape b.
    const nx = 0.3, ny = -0.4, t = 2
    expect(mixGray(shapes.cloud, shapes.mark, 0, nx, ny, t)).toBe(shapes.cloud(nx, ny, t))
    expect(mixGray(shapes.cloud, shapes.mark, 1, nx, ny, t)).toBe(shapes.mark(nx, ny, t))
  })

  test('morphStage clamps progress and maps to sequence bounds', () => {
    expect(morphStage(-0.5, 3).index).toBe(0)
    expect(morphStage(-0.5, 3).localT).toBe(0)
    expect(morphStage(2, 3).index).toBe(1)
    expect(morphStage(2, 3).localT).toBe(1)
    expect(morphStage(0.5, 3)).toEqual({ index: 1, localT: 0 })
  })
})

describe('pixel_dither_hero_renders_static_frame_under_reduced_motion', () => {
  test('one frame on mount, user scroll adds one throttled frame, no sustained loop', async () => {
    window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const { unmount } = await mount()
    expect(frames.length).toBe(1) // exactly one static frame on mount
    expect(frames[0].width).toBe(140)
    expect(frames[0].height).toBe(78)
    const rafAfterMount = rafQueue.length
    expect(rafAfterMount).toBe(0) // no animation loop scheduled at all

    // Deliberate scroll → exactly one throttled redraw (simulate mid-pin layout:
    // happy-dom has no layout engine, so hand the container a real geometry).
    const pinnedEl = document.querySelector('[data-pixel-dither]') as HTMLElement
    const vh = window.innerHeight
    pinnedEl.getBoundingClientRect = () =>
      ({ top: -vh * 0.5, height: vh * 1.8, bottom: 0, right: 0, left: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    window.dispatchEvent(new Event('scroll'))
    expect(rafQueue.length).toBe(1)
    flushRaf()
    expect(frames.length).toBe(2)
    // …and the one-shot callback did NOT reschedule itself (loop stays dead).
    expect(rafQueue.length).toBe(0)
    await unmount()
  })
})

describe('pixel_dither_hero_stops_rafloop_when_scrolled_out_of_view', () => {
  test('draw is skipped (zero work) while IntersectionObserver reports hidden', async () => {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const { unmount } = await mount()
    const io = FakeIO.last
    expect(io).not.toBeNull()
    expect(io!.observed.length).toBe(1) // observing the pinned container

    // Visible → loop draws every frame.
    io!.fire(true)
    flushRaf()
    const drawn = frames.length
    expect(drawn).toBeGreaterThanOrEqual(1)

    // Out of view → rAF fully paused, zero new frames even as "time passes".
    io!.fire(false)
    expect(rafQueue.length).toBe(0) // nothing scheduled — fully stopped
    const before = frames.length
    flushRaf() // nothing in queue → no-op
    expect(frames.length).toBe(before)

    // Back in view → loop resumes on its own.
    io!.fire(true)
    expect(rafQueue.length).toBe(1)
    flushRaf()
    expect(frames.length).toBeGreaterThan(before)
    await unmount()
  })
})

describe('pixel_dither_hero_cleans_up_listeners_on_unmount', () => {
  test('removes scroll listener, disconnects IO, cancels pending rAF', async () => {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const { unmount } = await mount()
    expect(addedListeners.some((l) => l.type === 'scroll')).toBe(true)
    const io = FakeIO.last!
    expect(io.disconnected).toBe(false)

    const scrollHandler = addedListeners.find((l) => l.type === 'scroll')!.fn
    await unmount()

    expect(removedListeners.some((l) => l.type === 'scroll' && l.fn === scrollHandler)).toBe(true)
    expect(io.disconnected).toBe(true)
    // Any pending frame was cancelled (queue empty after unmount).
    expect(rafQueue.length).toBe(0)
  })
})
