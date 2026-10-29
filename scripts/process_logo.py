#!/usr/bin/env python3
"""Extract the club shield emblem from the uploaded black-on-black JPG export.

The upload (`upload/Untitled Project-20.jpg`) is a 738x255 canvas where the
emblem strokes peak at luminance 47/255 on a pure-black background -- invisible
as-is. We level-stretch it, crop to the emblem, and emit theme variants:

  public/brand/logo-mark.png        near-black emblem, transparent bg (light chrome)
  public/brand/logo-mark-white.png  pure-white emblem, transparent bg (dark chrome)
  public/brand/favicon.png          white emblem on zinc-950 rounded square (512px)
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SRC = "/home/z/my-project/upload/Untitled Project-20.jpg"
OUT = "/home/z/my-project/public/brand"

import os
os.makedirs(OUT, exist_ok=True)

g = np.asarray(Image.open(SRC).convert("L"), dtype=np.float32)

# --- levels: noise floor 3, white point 47, gamma to solidify strokes ---
# Stroke luminance is very uneven across the emblem (outer shield ~30-47,
# inner shield ~5-15), so a gentle curve keeps all of it visible; the
# gaussian smooths JPEG mottle. Global thresholds wipe the dim strokes.
lo, hi = 3.0, 47.0
a = np.clip((g - lo) * (255.0 / (hi - lo)), 0, 255)
a = 255.0 * (a / 255.0) ** 0.55  # gamma < 1 pushes midtones opaque
a = a.astype(np.uint8)
a = np.asarray(Image.fromarray(a).filter(ImageFilter.GaussianBlur(radius=1.2)), dtype=np.uint8)

# --- crop to emblem bbox with padding ---
ys, xs = np.where(a > 8)
pad = 10
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, a.shape[1])
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, a.shape[0])
alpha = Image.fromarray(a[y0:y1, x0:x1])
print("cropped emblem:", alpha.size)

# soften JPEG stair-stepping on the mask edge
alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.8))

def tinted(rgb: tuple[int, int, int]) -> Image.Image:
    """Alpha mask -> solid-color RGBA emblem."""
    solid = Image.new("RGBA", alpha.size, rgb + (0,))
    solid.putalpha(alpha)
    return solid

# --- light-chrome variant: zinc-900 near-black ---
tinted((0x18, 0x18, 0x1B)).save(f"{OUT}/logo-mark.png")

# --- dark-chrome variant: pure white ---
tinted((0xFF, 0xFF, 0xFF)).save(f"{OUT}/logo-mark-white.png")

# --- favicon: white emblem centered on a zinc-950 rounded square ---
S = 512
white = tinted((0xFF, 0xFF, 0xFF))
target_h = int(S * 0.62)
target_w = int(white.width * target_h / white.height)
white = white.resize((target_w, target_h), Image.LANCZOS)

tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(tile)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=112, fill=(0x09, 0x09, 0x0B, 0xFF))
tile.alpha_composite(white, ((S - target_w) // 2, (S - target_h) // 2))
tile.save(f"{OUT}/favicon.png")

# --- verification sheet: variants over light + dark swatches ---
sw = 150
light_bg = Image.new("RGBA", (sw, sw), (0xFF, 0xFF, 0xFF, 0xFF))
dark_bg = Image.new("RGBA", (sw, sw), (0x09, 0x09, 0x0B, 0xFF))
mark = Image.open(f"{OUT}/logo-mark.png"); mw = int(mark.width * 120 / mark.height)
light_bg.alpha_composite(mark.resize((mw, 120), Image.LANCZOS), ((sw - mw) // 2, 15))
mark_w = Image.open(f"{OUT}/logo-mark-white.png")
dark_bg.alpha_composite(mark_w.resize((mw, 120), Image.LANCZOS), ((sw - mw) // 2, 15))
sheet = Image.new("RGBA", (sw * 3 + 40, sw + 20), (0x89, 0x89, 0x91, 0xFF))
sheet.alpha_composite(light_bg, (10, 10)); sheet.alpha_composite(dark_bg, (sw + 20, 10))
fav = Image.open(f"{OUT}/favicon.png").resize((sw - 20, sw - 20), Image.LANCZOS)
sheet.alpha_composite(fav, (2 * sw + 30, 15))
sheet.convert("RGB").save("/home/z/my-project/download/logo-variants-preview.png")
print("done ->", OUT)
