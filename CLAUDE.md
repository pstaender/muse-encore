# MuseScore Web

TypeScript port of the MuseScore Studio engraving engine (reference: **v4.7.5, commit 3654226**).
Goal: read `.mscz`/`.mscx` files and render them in the browser so that they look exactly like
the desktop app. License: GPL-3.0-only (same as MuseScore).

## Reference sources

- `./MuseScore` is a git checkout of MuseScore (on `main`, **not** the reference version).
  Always read the v4.7.5 sources: `git -C MuseScore show v4.7.5:<path>` or extract them with
  `git -C MuseScore archive v4.7.5 src/engraving fonts | tar -x -C <dir>`.
- MuseScore 4.7.5 is installed at `/Applications/MuseScore 4.app`; use it to create reference renders:
  `"/Applications/MuseScore 4.app/Contents/MacOS/mscore" -o out.svg file.mscz` (SVG has a CSS class per element type)
  or `-r 100 -o out.png` for PNGs.
- Test scores: use the **v4.7.5** vtest files (`git -C MuseScore archive v4.7.5 vtest | tar -x -C <dir>`);
  `MuseScore/vtest` on `main` contains 5.0 files that the 4.7.5 reader rejects.

## Structure (mirrors the C++ tree)

```
src/
  framework/global      realfn (fuzzy float compare like muse::RealIsEqual)
  framework/draw        geometry, PainterPath, Transform, Pen/Brush/Font, Painter,
                        FontProvider (opentype.js, replaces Qt font metrics), canvas paint provider
  engraving/types       enums (types.ts), Fraction, Spatium, SymId (generated)
  engraving/style       Sid + default style (generated), MStyle
  engraving/infrastructure  Shape, Skyline, Smufl, MscReader (zip)
  engraving/dom         the score object model (Score, Measure, Segment, Chord, Note, ...)
  engraving/rw          XmlReader, readers (read460 for 4.x incl. read400/read410 compat, read302 for 3.x)
  engraving/rendering/score  layout (ScoreLayout, SystemLayout, ChordLayout, ...) and painting (TDraw)
  index.ts              public library API
fonts/                  runtime data: fonts (Leland, Bravura, Emmentaler/MScore, Gonville/Gootville, Petaluma,
                        Finale Maestro/Broadway, MuseJazz, Edwin, FreeSerif/FreeSans) with their licenses,
                        chord description files (chords/), legacy default styles for old scores (styles/)
tools/gen/              generators for tables derived from the C++ sources (re-run on MuseScore updates)
tools/                  node scripts: render to PNG, compare with MuseScore output
demo/                   Vite demo app
test/                   vitest tests
```

File and class names follow the C++ ones (`chordlayout.cpp` -> `chordlayout.ts`, `ChordLayout`),
methods keep their C++ names, so changes in MuseScore can be followed file by file.

## Conventions

- Keep the port close to the original structure and logic; comment only where the TS code is not
  self-explanatory or deviates from C++ (e.g. features not ported yet: mark with `// TODO(port):`).
- C++ value types (PointF, RectF, ...) are classes here: never store a reference to another object's
  point/rect, clone instead. `Fraction` is immutable.
- `nidx` is `-1` (C++ `muse::nidx`).
- All layout units are MuseScore "pixels" at 1200 DPI (`DPI` in `types.ts`), spatium default 24.8.
- Text metrics must follow Qt's QFontMetricsF on a 1200 DPI device (see `fontprovider.ts`).
- Every file starts with the GPL SPDX header.
- C++ destructors with side effects must be emulated explicitly (e.g. ~LayoutContext -> end of ScoreLayout.layoutRange).
- DOM -> rendering calls (C++ `renderer()->...`) go through hooks set in `rendering/score/scorerenderer.ts`.

## Commands

- `npm run typecheck` - tsc
- `npm test` - vitest
- `npm run dev` - demo app (Vite; `?url=<score>` opens a score, fonts are served from ./fonts)
- `npm run render -- <file.mscz> <out-prefix> [dpi]` - render pages to PNG in node
- `npm run compare -- <file.mscz> [out-dir] [dpi]` - render with MuseScore and with this port and diff the PNGs
  (red = only MuseScore, blue = only port). For exact numbers compare with MuseScore's SVG export, which uses
  the same 1200 DPI coordinates as the layout.
- `npx tsx tools/gen/<gen-*.ts> <extracted v4.7.5 tree>` - regenerate tables (symids, styledef, property,
  typesconv, noteheads, accidentals, textstyle, drumset, instrumentfamilies; the latter needs `share/instruments`
  in the extracted tree)

## Progress tracking

Keep `claude_history.md` up to date (what was done, what is missing, known differences).
