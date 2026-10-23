# MuseEncore

### A browser-native port of MuseScore

* [Run the Editor right now in your browser 🚀](https://pstaender.github.io/musescoreweb/editor/)
* [Run the Viewer right now in your browser 🚀](https://pstaender.github.io/musescoreweb/viewer/)

Overview of demos: [pstaender.github.io/muse-encore](https://pstaender.github.io/muse-encore/)

A port of [MuseScore Studio](https://github.com/musescore/MuseScore)'s source code from C++ to TypeScript, to create a
web-native version of MuseScore that runs entirely in the browser. The engraving engine is translated file by file
and keeps the structure, class and method names of the original, so that `.mscz`/`.mscx` files are laid out and
rendered like in the desktop app. MusicXML, MIDI, Capella, Guitar Pro and Power Tab files are imported like in
MuseScore, and scores can be exported as PDF, PNG, SVG, MIDI, MusicXML and MuseScore files. The reference is MuseScore
Studio 4.7.5 (included as a git submodule).

> **MuseEncore is neither an official MuseScore project nor a fork of MuseScore.** It is an independent
> port of MuseScore Studio's open source code and is not affiliated with or endorsed by MuseScore Limited or the
> MuseScore project. "MuseScore" is used here only to name the original software this project is based on.

- **MuseEncore Viewer** (`viewer/`): opens, displays and plays scores. It is also available as the npm package
  [museencore-viewer](packages/viewer/README.md), to show scores in any web page like an inline PDF viewer.
- **MuseEncore Editor** (`editor/`): a score editor based on the viewer.

This is a vibe-coded project: the code is written with an AI coding assistant. Its functionality is tested at a
high level by a human, in addition to the automated tests that compare every page with MuseScore's own output.
Future versions are planned to stay in sync with the original MuseScore project. The web UI is built with React.

Like MuseScore, this project is licensed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)).

## Differences from MuseScore

* Continuous view (see the screenshots below):
  * a different look (in my opinion, a better one)
  * an additional "fit to window" mode, which lays out the score as wide as the window
* Space: in the editor, holding Space and dragging moves the score, and Shift+Space starts and stops the playback
  (both can be changed in the settings). In the viewer, Space starts and stops the playback, and holding Space while
  dragging moves the score.

<img width="1616" height="648" alt="Screenshot 2026-10-23 at 11 03 02" src="https://github.com/user-attachments/assets/7901780a-4f20-412c-8dac-33f057f1deb5" />
<img width="1573" height="799" alt="Screenshot 2026-10-23 at 11 04 20" src="https://github.com/user-attachments/assets/e3f33b44-9f1b-49f9-a225-95449a9bb388" />


## Missing parts

A list of the parts that are not ported yet will follow.

## Browser compatibility

Tested on desktop with:

* Firefox
* Chrome
* Safari (partly: the playback works only in part)

## Getting started

```sh
git clone --recurse-submodules <repository>
npm install
npm run dev:viewer        # viewer
npm run dev:editor        # editor
npm test                  # library tests
```

See [CLAUDE.md](CLAUDE.md) for the project structure and commands and [test/README.md](test/README.md) for the tests.
