"""
Regenerates the web-display copies in books/vol1-4 from the full-resolution
originals in originals/vol1-4 (gitignored, kept locally as the archive).

Resizes to a max dimension of 1600px, re-encodes as JPEG quality 78, and
applies a low-opacity tiled "(c) Gil" watermark. Run from the repo root:

    python scripts/generate_display_images.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

MAX_DIM = 1600
JPEG_QUALITY = 78
WATERMARK_TEXT = "\u00a9 Gil"
WATERMARK_OPACITY = 11  # 0-255; approved at half the initial draft's opacity
VOLS = ["vol1", "vol2", "vol3", "vol4"]


def find_font(size):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\segoeui.ttf",
    ]
    for c in candidates:
        if os.path.exists(c):
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def resize_max(img, max_dim):
    w, h = img.size
    scale = max_dim / float(max(w, h))
    if scale >= 1.0:
        return img
    return img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)


def apply_watermark(img, opacity=WATERMARK_OPACITY, font_scale=0.022, spacing_scale=0.16, angle=30):
    """Tiled diagonal low-opacity watermark, covers the whole image so it
    can't be cropped out. opacity is 0-255 alpha."""
    base = img.convert("RGBA")
    w, h = base.size

    font_size = max(14, round(min(w, h) * font_scale))
    font = find_font(font_size)

    diag = int((w ** 2 + h ** 2) ** 0.5)
    layer = Image.new("RGBA", (diag, diag), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    bbox = draw.textbbox((0, 0), WATERMARK_TEXT, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    spacing_x = int(text_w + min(w, h) * spacing_scale)
    spacing_y = int(text_h + min(w, h) * spacing_scale)

    for y in range(0, diag, spacing_y):
        offset = (spacing_x // 2) if (y // spacing_y) % 2 else 0
        for x in range(-spacing_x, diag, spacing_x):
            draw.text((x + offset, y), WATERMARK_TEXT, font=font, fill=(255, 255, 255, opacity))

    layer = layer.rotate(angle, resample=Image.BICUBIC)
    lw, lh = layer.size
    left = (lw - w) // 2
    top = (lh - h) // 2
    layer = layer.crop((left, top, left + w, top + h))

    out = Image.alpha_composite(base, layer)
    return out.convert("RGB")


def process(src, dst, watermark=True):
    img = Image.open(src).convert("RGB")
    img = resize_max(img, MAX_DIM)
    if watermark:
        img = apply_watermark(img)
    img.save(dst, "JPEG", quality=JPEG_QUALITY, optimize=True)


def main():
    total_before = total_after = 0
    for vol in VOLS:
        src_dir = os.path.join("originals", vol)
        dst_dir = os.path.join("books", vol)
        os.makedirs(dst_dir, exist_ok=True)
        for fname in sorted(os.listdir(src_dir)):
            src = os.path.join(src_dir, fname)
            dst = os.path.join(dst_dir, fname)
            before = os.path.getsize(src)
            process(src, dst)
            after = os.path.getsize(dst)
            total_before += before
            total_after += after
            print(f"{vol}/{fname}: {before/1024:.0f}KB -> {after/1024:.0f}KB")
    print(f"\nTOTAL before: {total_before/1024/1024:.2f} MB")
    print(f"TOTAL after:  {total_after/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
