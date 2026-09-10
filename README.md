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
- `books/vol1` .. `books/vol4` &mdash; the source JPGs for each volume,
  copied in unmodified.
- Page numbers (starting at 1 on the first content page after the
  cover) are overlaid at render time in `script.js` &mdash; the source
  JPGs are never modified.
- After the last page of a volume, a generated page reads "Turn the
  page to return to the Main Menu"; turning past it (or clicking it)
  returns to `index.html`.

## Local preview

Serve the folder over HTTP (needed for the flipbook's image loading)
and open `index.html`, e.g.:

```
npx serve .
```

**[Read it live](https://gmshannon99.github.io/GilsArtBooks-Web/)**
