# MuseEncore

<div align = center>

[<kbd> <br> Run the MuseEncore Editor right now in your browser 🚀 <br> </kbd>][Editor]

– or – <br>

[<kbd> <br> Run the MuseEncore Viewer right now in your browser 🚀 <br> </kbd>][Viewer]

</div>

Overview of demos: [pstaender.github.io/musescoreweb](https://pstaender.github.io/musescoreweb/)

A port of [MuseScore Studio](https://github.com/musescore/MuseScore)'s source code from C++ to TypeScript, to create a
web-native version of MuseScore that runs entirely in the browser. The engraving engine is translated file by file
and keeps the structure, class and method names of the original, so that `.mscz`/`.mscx` files are laid out and
rendered like in the desktop app. The reference is MuseScore Studio 4.7.5 (included as a git submodule).

> **MuseEncore is neither an official MuseScore project nor a fork of MuseScore.** It is an independent
> port of MuseScore Studio's open source code and is not affiliated with or endorsed by MuseScore Limited or the
> MuseScore project. "MuseScore" is used here only to name the original software this project is based on.

- **MuseEncore Viewer** (`viewer/`): opens, displays and plays scores. It is also available as the npm package
  [museencore-viewer](packages/viewer/README.md), to show scores in any web page like an inline PDF viewer.
- **MuseEncore Editor** (`editor/`): a score editor based on the viewer.

This is a vibe-coded project: the code is written with an AI coding assistant. Its functionality is tested at a
high level by a human, in addition to the automated tests that compare every page with MuseScore's own output.
It is planned, that future versions will be kept in sync with the original MuseScore project. The web UI is built with React.

Like MuseScore, this project is licensed under the GNU General Public License v3.0 (see [LICENSE](LICENSE)).

## Differing features from MuseScore

* continous view (see screenshots below):
  * looks different (IMHO better)
  * has a fit-window option

## Getting started

```sh
git clone --recurse-submodules <repository>
npm install
npm run dev:viewer        # viewer
npm run dev:editor        # editor
npm test                  # library tests
```

See [CLAUDE.md](CLAUDE.md) for the project structure and commands and [test/README.md](test/README.md) for the tests.

[Editor]: https://pstaender.github.io/musescoreweb/editor/
[Viewer]: https://pstaender.github.io/musescoreweb/viewer/
