# MuseEncore

### A browser-native port of MuseScore

* [Run the Editor right now in your browser](https://pstaender.github.io/muse-encore/editor/)
* [Run the Viewer right now in your browser](https://pstaender.github.io/muse-encore/viewer/)
* [Scores embedded in a web page with the viewer package](https://pstaender.github.io/muse-encore/viewer-package/example/)

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
>
> **About the name:** "MuseEncore" combines two music terms, "muse" and "encore", which, to the author's understanding,
> are not protected as general terms. Should you nevertheless have (legal) concerns about the name, please first reach
> out to the author at [philipp.staender@gmail.com](mailto:philipp.staender@gmail.com), so that the project can be
> renamed.

- **MuseEncore Viewer** (`viewer/`): opens, displays and plays scores. It is also available as the npm package
  [muse-encore-viewer](packages/viewer/README.md), to show scores in any web page like an inline PDF viewer
  ([example](https://pstaender.github.io/muse-encore/viewer-package/example/)).
- **MuseEncore** (`editor/`): a score editor based on the viewer.

This is a vibe-coded project: the code is written with an AI coding assistant. Its functionality is tested at a
high level by a human, in addition to the automated tests that compare every page with MuseScore's own output.
Future versions are planned to stay in sync with the original MuseScore project. The web UI is built with React.

Like MuseScore, this project is licensed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)).

## Differences from the original application (MuseScore Studio)

Features that MuseEncore adds to MuseScore Studio, or that work differently:

* Note detection from the microphone (not in MuseScore yet): the editor detects the notes you play, enters them into
  the score in note input mode and offers a playalong mode that follows the score while you play. Everything is
  processed in the browser.
* MIDI input works with the browser's MIDI API: the browser asks for permission when you turn on "Enable MIDI input"
  (in the Playback settings or the Preferences), and Safari has no MIDI support. There is no MIDI output.
* Continuous view (see the screenshots below):
  * a different look (in my opinion, a better one)
  * an additional "fit to window" mode, which lays out the score as wide as the window <img width="909" height="296" alt="Screenshot 2026-11-06 at 09 12 50" src="https://github.com/user-attachments/assets/0efc5067-9990-4685-b9f5-a2e7a53ce1df" />

* Space: in the editor, holding Space and dragging moves the score, and Shift+Space starts and stops the playback
  (both can be changed in the settings). In the viewer, Space starts and stops the playback, and holding Space while
  dragging moves the score.
* Comments: notes on a score, attached to a note, rest, text or measure and movable relative to it, with basic
  formatting (`**bold**`, `*italic*`, `~~strikethrough~~`). The editor adds and edits them in the Comments panel
  (View > Comments, undoable); the viewer shows them (option `comments`). They are saved in the `.mscz`/`.mscx` file
  in a way MuseScore Studio keeps: it opens such files without errors, keeps the comments when it saves, but does not
  show them. <img width="597" height="372" alt="Screenshot 2026-11-06 at 08 39 30" src="https://github.com/user-attachments/assets/951b22d9-cf16-4f54-ace8-797d48713e8b" />
* Menu search (editor): a search field at the top of the Help menu, like in macOS applications, finds the items of all
  menus and shows the current result highlighted in its menu. Cmd+Shift+/ (Ctrl+Shift+/) opens it.


## Missing parts

A list of the parts that are not ported yet will follow.

## Browser compatibility

Tested on desktop with latest versions of:

* Firefox
* Chrome
* Safari

## Getting started

```sh
git clone --recurse-submodules <repository>
npm install
npm run dev:viewer        # viewer
npm run dev:editor        # editor
npm test                  # library tests
```

See [CLAUDE.md](CLAUDE.md) for the project structure and commands and [test/README.md](test/README.md) for the tests.
