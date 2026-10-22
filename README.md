# MuseScore Web

**Live demo: [pstaender.github.io/musescoreweb](https://pstaender.github.io/musescoreweb/)**

[<kbd> <br> Run the MuseScore Web editor right now in your browser <br> </kbd>][Editor]
&nbsp;
[<kbd> <br> Run the MuseScore Web viewer right now in your browser <br> </kbd>][Viewer]

[Editor]: https://pstaender.github.io/musescoreweb/editor/
[Viewer]: https://pstaender.github.io/musescoreweb/viewer/

A port of [MuseScore Studio](https://github.com/musescore/MuseScore)'s source code from C++ to TypeScript, to create a
web-native version of MuseScore that runs entirely in the browser. The engraving engine is translated file by file
and keeps the structure, class and method names of the original, so that `.mscz`/`.mscx` files are laid out and
rendered like in the desktop app. The reference is MuseScore Studio 4.7.5 (included as a git submodule).

- **Viewer** (`webviewer/`): opens and displays scores, as a test of the feasibility of the port.
- **Editor** (`musescoreweb/`): the next step, a score editor based on the viewer.

This is a vibe-coded project: the code is written with an AI coding assistant. Its functionality is tested at a
high level by a human, in addition to the automated tests that compare every page with MuseScore's own output.
Future versions will be kept in sync with the original MuseScore project. The web UI is built with React.

Like MuseScore, this project is licensed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)).

## Getting started

```sh
git clone --recurse-submodules <repository>
npm install
npm run dev               # viewer
npm run dev:musescoreweb  # editor
npm test                  # library tests
```

See [CLAUDE.md](CLAUDE.md) for the project structure and commands and [test/README.md](test/README.md) for the tests.
