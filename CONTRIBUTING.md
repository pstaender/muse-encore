# Contributing to MuseEncore

Thank you for your interest in contributing to MuseEncore! Please read the following rules before opening an
issue or a pull request.

## Language

Use **English only**: in issues, pull requests, commit messages, code comments and documentation.
It is perfectly fine to use a translator if English is not your first language.

## AI assistance

AI assistance (code assistants, chat bots, translators, ...) is welcome, but it must be **visible and
transparent**:

- Say in the pull request (or issue) that AI was used and for what.
- Mark AI generated commits, e.g. with a `Co-Authored-By:` trailer naming the tool or model.
- Give your AI assistant [CLAUDE.md](CLAUDE.md) as its instructions (Claude Code reads it automatically; for other
  tools, add it to their context or rules). It describes the structure, the conventions and the commands of the
  project.
- You are responsible for every change you submit: review, understand and test it before opening a pull request.

## The ideas of MuseEncore

Every contribution must keep these principles:

1. **MuseEncore is a browser native port of MuseScore Studio.** The engraving engine follows MuseScore's C++
   sources (reference: v4.7.5) file by file, class by class and method by method, so changes in MuseScore can be
   followed. Scores should look exactly like in the desktop app. See [CLAUDE.md](CLAUDE.md) for the structure and
   the coding conventions.
2. **It works on any static web server.** No backend, database server or other extra service is needed. Everything
   runs in the browser; data is stored in the browser.
3. **It works as a viewer in any modern browser**, to display and play MuseScore files.

MuseEncore is a general-purpose application: pull requests should serve its users in general, not one person's
particular purpose. If you need specific adaptations for your own needs, you are always welcome to fork the project
(within the terms of the GPL).

Features that MuseScore Studio does not have (or behavior that differs from it) must be listed in
[README.md](README.md) under "Differences from the original application (MuseScore Studio)".

## Plugins

Plugins are **not accepted** at the moment, since MuseEncore has no plugin management or handling built in, yet.

## Tests

Functional code must be contributed **with tests**: new features and bug fixes come with one or more tests
(vitest, in `test/`) that cover the change. Changes to documentation, comments or formatting need no tests.

## Before opening a pull request

- `npm run typecheck` and `npm test` pass.
- For layout changes: `npm run compare:all` shows no regressions (see `test/README.md`).
- Every new file starts with the GPL SPDX header (`GPL-3.0-only`, the license of MuseScore and of this project).
  By contributing you agree that your contribution is licensed under the same license.
