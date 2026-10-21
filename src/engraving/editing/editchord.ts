/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editchord.h/.cpp (only what is needed when loading; no undo, no linked chords)
 */

import { DirectionH, ElementType } from '../types/types'
import { Factory } from '../dom/factory'
import { NoteParenthesisInfo, type Chord } from '../dom/chord'
import { noteParenthesesHooks, type Note } from '../dom/note'
import type { Parenthesis } from '../dom/parenthesis'

export class EditChord {
    static addChordParentheses(chord: Chord, notes: Note[], _addToLinked = true, generated = false): void {
        if (notes.length === 0) {
            return
        }
        EditChord.undoAddParenthesesToNotes(chord, notes, generated)
    }

    private static undoAddParenthesesToNotes(chord: Chord, notes: Note[], generated: boolean): void {
        const track = chord.track()
        const leftParen = Factory.createItem(ElementType.PARENTHESIS, chord) as Parenthesis
        leftParen.setParent(chord)
        leftParen.setTrack(track)
        leftParen.setDirection(DirectionH.LEFT)
        leftParen.setGenerated(generated)
        const rightParen = Factory.createItem(ElementType.PARENTHESIS, chord) as Parenthesis
        rightParen.setParent(chord)
        rightParen.setTrack(track)
        rightParen.setDirection(DirectionH.RIGHT)
        rightParen.setGenerated(generated)

        // TODO(port): linked chords
        chord.addNoteParenthesisInfo(new NoteParenthesisInfo(leftParen, rightParen, notes))
    }
}

noteParenthesesHooks.addChordParentheses = (chord, notes, addToLinked, generated) =>
    EditChord.addChordParentheses(chord, notes, addToLinked, generated)
