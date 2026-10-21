# MuseScore Web

TypeScript port of the MuseScore Studio engraving engine (reference: **v4.7.5, commit 3654226**).
Goal: read `.mscz`/`.mscx` files and render them in the browser so that they look exactly like
the desktop app. License: GPL-3.0-only (same as MuseScore).

## Reference sources

- `./MuseScore` is a git submodule pinned to the reference version v4.7.5
  (`git submodule update --init`; shallow). Read the sources there directly, e.g.
  `MuseScore/src/engraving/rendering/score/chordlayout.cpp`. When updating the reference, move the submodule
  to the new tag and follow the changes file by file.
- MuseScore 4.7.5 is installed at `/Applications/MuseScore 4.app`; use it to create reference renders:
  `"/Applications/MuseScore 4.app/Contents/MacOS/mscore" -o out.svg file.mscz` (SVG has a CSS class per element type)
  or `-r 100 -o out.png` for PNGs.
- Test scores: the v4.7.5 vtest files in `MuseScore/vtest/scores` (newer MuseScore versions contain
  5.0 files that the 4.7.5 reader rejects), plus real-world scores in `mscz-test-files/`.

## Structure (mirrors the C++ tree)

```
src/
  framework/global      realfn (fuzzy float compare like muse::RealIsEqual)
  framework/draw        geometry, PainterPath, Transform, Pen/Brush/Font, Painter,
                        FontProvider (opentype.js, replaces Qt font metrics), canvas and SVG paint providers
  engraving/types       enums (types.ts), Fraction, Spatium, SymId (generated)
  engraving/style       Sid + default style (generated), MStyle
  engraving/infrastructure  Shape, Skyline, Smufl, MscReader (zip)
  engraving/dom         the score object model (Score, Measure, Segment, Chord, Note, ...)
  engraving/rw          XmlReader, readers (read460 for 4.x incl. read400/read410 compat, read302 for 3.x, read206 for 2.x),
                        rw/compat (chord list hook, CompatUtils incl. doCompatibilityConversions = compatconversions.ts)
  engraving/compat      EngravingCompat (pre/post layout conversions of old files), page format, dummy element
  engraving/rendering/score  layout (ScoreLayout, SystemLayout, ChordLayout, ...) and painting (TDraw)
  engraving/editing     score changes (edit.cpp, cmd.cpp, ... as Score module augmentations) through the undo stack
                        (undo.ts: UndoStack/UndoMacro/UndoCommand; startCmd/endCmd/undoRedo in cmd.ts, CmdState in
                        cmdstate.ts); dom/noteentry.ts and dom/input.ts (InputState) for note input
  notation, project     MasterNotation / NotationParts / NotationProject: creating new scores (createScore);
                        NotationInteraction / NotationNoteInput / NotationUndoStack: selection, editing, note input
  notationscene         NotationViewInputController (clicks, keys), NotationActionController (action codes -> commands)
  index.ts              public library API
fonts/                  runtime data: fonts (Leland, Bravura, Emmentaler/MScore, Gonville/Gootville, Petaluma,
                        Finale Maestro/Broadway, MuseJazz, Edwin, FreeSerif/FreeSans) with their licenses,
                        chord description files (chords/), legacy default styles for old scores (styles/)
tools/gen/              generators for tables derived from the C++ sources (re-run on MuseScore updates)
tools/                  node scripts: render to PNG, compare with MuseScore output
webviewer/              Vite web viewer app (MuseScore icon font in webviewer/assets)
musescoreweb/           Vite score editor app "MuseScore Web": React UI (App.tsx, home/, newscore/, dialogs/ mirror MuseScore's
                        QML pages), menu bar (menus/appmenu.ts = AppMenuModel), toolbars (toolbars/: docks, note input bar),
                        actions (actions/: MuseScore's UiActions + shortcuts, generated uiactiondata.ts; appactions.ts =
                        the handlers), i18n.ts (MuseScore's translations via vite-plugin-locales.ts), score view
                        (scoreview.ts, DOM code from the viewer), session.ts (open/create scores), db.ts (IndexedDB via
                        Dexie), settings.ts (localStorage)
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
- The web UI is built with React (the viewer still uses plain DOM code; new UI, e.g. the editor, uses React).
  The engraving library itself stays framework independent.
- UI texts are MuseScore's English source strings with MuseScore's translation context (`qtrc("project", "New score")`,
  see share/locale/*.ts), so MuseScore's translations apply; commands are MuseScore's actions (codes, titles, icons,
  shortcuts from the generated table) registered with `registerAction`. Strings MuseScore does not have stay English.
- TypeScript 7 (native compiler); `npm run typecheck` / `npm run build` use it.
- C++ destructors with side effects must be emulated explicitly (e.g. ~LayoutContext -> end of ScoreLayout.layoutRange).
- DOM -> rendering calls (C++ `renderer()->...`) go through hooks set in `rendering/score/scorerenderer.ts`.
- Score changes go through the undo stack like in C++ (`score.undo(new ChangeProperty(...))`, `undoChangeProperty`,
  `undoAddElement`, ...) between `startCmd()` and `endCmd()` (NotationInteraction: `startEdit()`/`apply()`); outside
  of a command (loading, createScore) they are applied directly. `endCmd`/`undoRedo` lay out the range the commands
  marked with `triggerLayout()` (partial layout like C++); a command without a range lays out the whole score.
  Undo/redo tests compare a hash of the SVG of all pages before and after (test/helpers.ts `scoreHash`).
- The DOM modules have import cycles: tests should import from `src/index` (or `./helpers`) first.
- There is no read400/read410: the 2.x/3.x readers call the shared read460 `TRead` functions where C++ calls
  `read400::TRead`. Version checks of read400 (`mscVersion() < 400` etc.) must therefore be in the read460
  functions (guarded by the file version), e.g. ignoring pre-4.0 slur offsets and stem lengths.

## Commands

- `npm run typecheck` - tsc
- `npm test` - vitest (library); `npm run test:e2e` - web viewer in headless Chrome; see `test/README.md`
- `npm run dev` - web viewer (Vite; `?url=<score>` opens a score, fonts are served from ./fonts);
  `npm run build:webviewer` builds it into dist-webviewer/
- `npm run dev:musescoreweb` - the editor (same options); `npm run build:musescoreweb` builds it into dist-musescoreweb/
  (it bundles MuseScore's templates from `MuseScore/share/templates`, so the submodule is needed)
- `npm run render -- <file.mscz> <out-prefix> [dpi | svg]` - render pages to PNG (or SVG) in node
- `npm run compare -- <file.mscz> [out-dir] [dpi]` - render with MuseScore and with this port and diff the PNGs
  (red = only MuseScore, blue = only port). For exact numbers compare with MuseScore's SVG export, which uses
  the same 1200 DPI coordinates as the layout.
- `npm run compare:all` - compare all vtest scores and `mscz-test-files/` with MuseScore against
  `test/compare-baseline.csv` (regressions fail); `-- --update-baseline` after intended changes
- `npx tsx tools/gen/<gen-*.ts> MuseScore` - regenerate tables from the reference sources (symids, styledef,
  property, typesconv, noteheads, accidentals, textstyle, drumset, instrumenttemplates, scoreorders, uiactions [-> musescoreweb/actions])

## Progress tracking

Keep `claude_history.md` up to date (what was done, what is missing, known differences).
