# Fairfold: browser build (local only)

This is a static browser build of the Claude Design landing page and merchant console. It shows the design's fixed demo data and is not connected to the API in `apps/api`. ESLint and Prettier skip this folder.

## Open it

- Double-click `Fairfold.html` (landing page) or `Fairfold Console.html`. Both work straight from disk, offline, with no server and no unpacking step.
- Or serve the folder with any static server, for example `python -m http.server 5178`, then open `http://127.0.0.1:5178/Fairfold.html`.

## Files

| Path | What it is |
| --- | --- |
| `Fairfold.html` | Landing page |
| `Fairfold Console.html` | Merchant console (design template kept verbatim in a `<template>`) |
| `assets/fonts.css` | Geist, Geist Mono and Instrument Serif (latin), inlined so `file://` works |
| `assets/threads.js` | Background thread field: WebGL renderer with a 2D-canvas fallback |
| `assets/landing.js` | Landing page interaction and motion |
| `assets/dc-lite.js` | Small runtime for the design's template syntax (`{{ }}`, `sc-for`, `sc-if`, hover styles) |
| `assets/console.js` | The design's console component, unchanged, plus mount and dock behaviour |
| `design-export/` | The original Claude Design exports, untouched, for reference |

## Changes from the design export

**Same look.** An automated comparison of every element's position, size, font, colours and text against the export matched 202/202 elements on the landing page at 1440 and 390 px; the animated stages were excluded. The console differs only in the orders-table column widths described below.

**Performance.** The thread field is now drawn with WebGL in a few draw calls instead of three full-screen 2D-canvas passes per frame. The frame loop no longer forces layout. Per-frame animated layers (ring, shadows, face lighting, prism shades, progress bar) became compositor-only. On high-DPI screens the field redraws every second frame, and a frame-pacing governor lowers its resolution if frames are still missed. The parcel's blurred shadow is now a gradient, so it needs no per-frame blur.

Measured in Chrome on this laptop (Intel Iris Xe, 1440×900, 3-run medians):

| Scenario | Design export | This build |
| --- | --- | --- |
| Scrolling, 150 % scaling | 57 % frames dropped, 25.8 fps, worst 200 ms | 0.4 % dropped, 59.9 fps, worst 33 ms |
| Idle on the hero, 150 % scaling | 78 % dropped, 13 fps, worst 487 ms | 0 % dropped, 60 fps, worst 18 ms |
| Scrolling, 100 % scaling | not re-measured under the same conditions | 0.2 % dropped, 60 fps |

**Background polish.** The field has anti-aliased threads with per-pixel depth shading, faint cross threads (weft), and round knots that grow slightly as they come closer. It still recolours inside the dark ledger and purple console panels.

**Parcel polish.** The parcel got:

- shaded faces with a corrugated-flute texture and bevelled edges
- directional lighting
- glossy tape with a torn end, printed "FAIRFOLD · SEALED", cut along the seam when the parcel opens
- label paper with a drop shadow and a holographic PROOF seal
- "this side up" marks, a care line and the brand mark
- a contact shadow
- inside: depth-shaded walls and branded tissue paper with a seal sticker

**Console: no overlapping text.** An automated check walks every view and interaction state at 1440, 1280, 1024, 820, 600 and 390 px. It now reports no overlapping or spilling text. The fixes:

- The Status column is 110 → 128 px, because "Delivered · dispute" was 126 px wide and ran into the Signal column.
- On phones the orders table scrolls sideways instead of collapsing Buyer and Item to zero width.
- Inspection and photo tiles let `defectVisible: false` wrap instead of overflowing the card.
- The sandbox-calls dock:
  - the page reserves space for it, so it never covers the last content
  - its log scrolls inside the dock
  - it folds back to its bar 5 s after a call, unless hovered or opened by hand
- On phones the tab strip fades at its edges and keeps the active tab in view, and the "Console" label is hidden.

## Not verified

Only Chromium-based browsers (Chrome, Edge) are installed on this machine. Firefox and Safari were not tested. The pages use the same CSS features as the export, plus WebGL 1 with instancing, which has a 2D fallback.
