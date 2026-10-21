/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/noteentry.cpp (note input: Score::addPitch, putNote, ...) and Score::padToggle of
 * score.cpp. The functions are added to Score by this module (module augmentation), so it must be imported before
 * they are used.
 */

import { Score, type Pad, type Position } from './score'
import type { PointF } from '../../framework/draw/types/geometry'
import type { InputState, NoteVal } from './input'
import type { AccidentalType } from './accidentaldata'
import type { Chord } from './chord'
import type { Note } from './note'

declare module './score' {
    interface Score {
        addPitch(nval: NoteVal, addFlag: boolean, externalInputState?: InputState | null): Note | null
        addPitchToChord(nval: NoteVal, chord: Chord, externalInputState?: InputState | null, forceAccidental?: boolean): Note | null
        /** C++ putNote(const PointF&, bool replace, bool insert) and putNote(const Position&, bool replace) */
        putNote(pos: PointF | Position, replace: boolean, insert?: boolean): boolean
        /** null: C++ error = true */
        noteValForPosition(pos: Position, at: AccidentalType): NoteVal | null
        /** C++ Score::padToggle (score.cpp) */
        padToggle(p: Pad, toggleForSelectionOnly?: boolean): void
    }
}

void Score
