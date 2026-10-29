// Pixel dither animation core (Landing Hero §2/§4) — pure logic, zero DOM.
// Ordered (Bayer) dithering: a grid of black-and-white cells whose *density*
// reads as grey — the same trick old halftone printing and 1-bit displays used.
// White stays dominant; black only accumulates where the underlying shape is dark.

// Standard 8x8 Bayer ordered-dithering threshold matrix, normalized 0..1.
const BAYER_8X8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
].map((row) => row.map((v) => v / 64));

/** Tiling Bayer threshold for cell (x, y) — wraps every 8 cells, 0..1. */
export function bayerThreshold(x: number, y: number): number {
  return BAYER_8X8[y & 7][x & 7];
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * A shape sampler returns grayscale "darkness" (0 = black, 1 = white) for a
 * grid cell at aspect-corrected coordinates nx, ny in roughly [-1, 1].
 * t is a time value, for shapes with subtle internal motion (e.g. the cloud).
 * Swap shapes freely — this interface is the only contract (PRD §2).
 */
export type ShapeSampler = (nx: number, ny: number, t: number) => number;

export const shapes: Record<string, ShapeSampler> = {
  // Abstract noise cloud — the "idea" stage, gently breathing. Gentle falloff so
  // the dot field rings the frosted content panel instead of hiding behind it.
  cloud: (nx, ny, t) => {
    const d = Math.sqrt(nx * nx + ny * ny);
    const n = Math.sin(nx * 6 + t) * Math.cos(ny * 6 + t * 0.7);
    return clamp01(d * 0.36 + n * 0.22 + 0.35);
  },
  // Brand mark placeholder (diamond) — the "identity" stage. Replace with a
  // real logo silhouette later by sampling luminance from an offscreen-rendered
  // SVG — same sampler contract, no change needed elsewhere. Radius sized so
  // the shape's edges stay visible around the frosted content panel.
  mark: (nx, ny) => {
    const d = Math.abs(nx) + Math.abs(ny);
    return d < 1.15 ? 0.05 : 1;
  },
  // Ascending arrow — the "growth" stage.
  arrow: (nx, ny) => {
    const line = ny + 0.6 - nx * 0.9;
    return Math.abs(line) < 0.12 ? 0.05 : 1;
  },
};

/** Morph sequence: idea → identity → growth (PRD §2). */
export const SHAPE_SEQUENCE = ['cloud', 'mark', 'arrow'] as const;
export type ShapeName = (keyof typeof shapes) & string;

/**
 * Blend two samplers across a stage transition. localT 0 → shape a, 1 → shape b.
 * Extracted from the draw loop so the morph is unit-testable.
 */
export function mixGray(
  a: ShapeSampler,
  b: ShapeSampler,
  localT: number,
  nx: number,
  ny: number,
  t: number
): number {
  return a(nx, ny, t) * (1 - localT) + b(nx, ny, t) * localT;
}

/**
 * Map scroll progress (0..1) onto the morph timeline: stage index + local
 * transition fraction. Clamped so the first and last shapes hold at the ends.
 */
export function morphStage(progress: number, sequenceLength: number): { index: number; localT: number } {
  const stageCount = Math.max(1, sequenceLength - 1);
  const stageF = clamp01(progress) * stageCount;
  const index = Math.min(stageCount - 1, Math.floor(stageF));
  return { index, localT: stageF - index };
}
