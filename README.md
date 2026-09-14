# Gil's Art Books

*Art by Gil Shannon*

A page-flip viewer for four volumes of Gil Shannon's art, built with
[StPageFlip](https://github.com/Nodlik/StPageFlip) (same engine as the
[oneshot-flipbook](https://github.com/gmshannon99/oneshot-flipbook)
project). Click or drag a page corner, or use the arrow keys, to turn
pages. Every page displays one at a time, scaled to fit without
cropping or distortion.

## Structure

- `index.html` &mdash; main menu, a grid of the four covers.
- `book.html?vol=1` (through `vol=4`) &mdash; the flipbook viewer for a
  given volume.
- `volumes.js` &mdash; per-volume configuration (title, page order,
  image dimensions). Volume 3 has two extra pages (`pg011b.jpg`,
  `pg015b.jpg`) inserted into its sequence; see the comments in that
  file for the exact ordering.
- `books/vol1` .. `books/vol4` &mdash; the web-display JPGs for each
  volume: resized to a max of 1600px on the long side, re-encoded at
  JPEG quality 78, and given a low-opacity tiled "&copy; Gil" watermark
  covering the full frame (a light deterrent against uncredited reuse
  that can't be cropped out). These are what's served on the live site.
- `originals/vol1` .. `originals/vol4` &mdash; the full-resolution
  source JPGs, gitignored and kept local-only (not part of the
  deployed site).
- `scripts/generate_display_images.py` &mdash; regenerates `books/` from
  `originals/` (resize, watermark, re-encode). Run from the repo root
  with `python scripts/generate_display_images.py` after adding or
  replacing anything in `originals/`.
- Page numbers (starting at 1 on the first content page after the
  cover) are overlaid at render time in `script.js` &mdash; the source
  JPGs are never modified.
- After the last page of a volume, a generated page reads "Turn the
  page to return to the Main Menu"; turning past it (or clicking it)
  returns to `index.html`. Flipping backward from the cover (the
  Previous button, left arrow, or Page Up) returns to `index.html` too
  &mdash; both directions are dead ends otherwise, so both exit the
  same way.

## Local preview

Serve the folder over HTTP (needed for the flipbook's image loading)
and open `index.html`, e.g.:

```
npx serve .
```

**[Read it live](https://gmshannon99.github.io/GilsArtBooks-Web/)**
