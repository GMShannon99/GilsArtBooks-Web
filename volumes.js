// Per-volume configuration for the flipbook site.
// Filenames are kept exactly as sourced; ordering/renumbering for
// out-of-sequence files (see vol3) is handled here, not by renaming files.
window.VOLUMES = [
  {
    id: "vol1",
    dir: "books/vol1",
    title: "Volume 1",
    cover: "cover.jpg",
    width: 3300,
    height: 2400,
    pages: [
      "pg001.jpg", "pg002.jpg", "pg003.jpg", "pg004.jpg", "pg005.jpg",
      "pg006.jpg", "pg007.jpg", "pg008.jpg", "pg009.jpg", "pg010.jpg",
      "pg011.jpg", "pg012.jpg", "pg013.jpg", "pg014.jpg", "pg015.jpg",
      "pg016.jpg", "pg017.jpg", "pg018.jpg", "pg019.jpg", "pg020.jpg",
      "pg021.jpg"
    ]
  },
  {
    id: "vol2",
    dir: "books/vol2",
    title: "Volume 2",
    cover: "cover.jpg",
    width: 3300,
    height: 2400,
    pages: [
      "pg001.jpg", "pg002.jpg", "pg003.jpg", "pg004.jpg", "pg005.jpg",
      "pg006.jpg", "pg007.jpg", "pg008.jpg", "pg009.jpg", "pg010.jpg",
      "pg011.jpg", "pg012.jpg", "pg013.jpg", "pg014.jpg", "pg015.jpg",
      "pg016.jpg", "pg017.jpg", "pg018.jpg", "pg019.jpg", "pg020.jpg",
      "pg021.jpg"
    ]
  },
  {
    id: "vol3",
    dir: "books/vol3",
    title: "Volume 3",
    cover: "cover.jpg",
    width: 3300,
    height: 2400,
    // pg011b and pg015b are extra art inserted right after pg011 and
    // pg015 respectively, then the whole volume is numbered 1-23 in
    // display order (confirmed with user before build).
    pages: [
      "pg001.jpg", "pg002.jpg", "pg003.jpg", "pg004.jpg", "pg005.jpg",
      "pg006.jpg", "pg007.jpg", "pg008.jpg", "pg009.jpg", "pg010.jpg",
      "pg011.jpg", "pg011b.jpg", "pg012.jpg", "pg013.jpg", "pg014.jpg",
      "pg015.jpg", "pg015b.jpg", "pg016.jpg", "pg017.jpg", "pg018.jpg",
      "pg019.jpg", "pg020.jpg", "pg021.jpg"
    ]
  },
  {
    id: "vol4",
    dir: "books/vol4",
    title: "Volume 4",
    cover: "cover.jpg",
    width: 3300,
    height: 2400,
    pages: [
      "pg001.jpg", "pg002.jpg", "pg003.jpg", "pg004.jpg", "pg005.jpg",
      "pg006.jpg", "pg007.jpg", "pg008.jpg", "pg009.jpg", "pg010.jpg",
      "pg011.jpg", "pg012.jpg", "pg013.jpg", "pg014.jpg", "pg015.jpg",
      "pg016.jpg", "pg017.jpg", "pg018.jpg", "pg019.jpg", "pg020.jpg",
      "pg021.jpg"
    ]
  }
];
