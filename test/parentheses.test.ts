// SPDX-License-Identifier: GPL-3.0-only
// Note parentheses (Score::cmdAddParenthesesToNotes / cmdRemoveParenthesesFromNotes, EditChord): through the
// Properties panel and the "add-parentheses" action, with undo and redo.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    applyInspectorChanges, executeAction, inspectorPropertyChanges, inspectorPropertyResets, inspectorSections, redo,
    undo, type MasterScore,
} from '../src/index'
import { Pid } from '../src/engraving/dom/property'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { ParenthesesMode } from '../src/engraving/types/types'
import type { Chord } from '../src/engraving/dom/chord'
import type { Note } from '../src/engraving/dom/note'
import { DEMOS, hasSubmodule, openScore, scoreHash as hashWithSelection } from './helpers'

/** selected items are painted last: the hash without a selection */
function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

const HEAD_PARENS = { section: 'SECTION_NOTATION', path: ['TYPE_NOTE', 'TYPE_NOTEHEAD'], property: 'hasHeadParentheses' }

/** the first chord with at least `n` notes */
function chordWithNotes(score: MasterScore, n: number): Chord {
    for (let m = score.firstMeasure(); m; m = m.nextMeasure()) {
        for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
            for (let track = 0; track < score.ntracks(); ++track) {
                const e = s.element(track)
                if (e && e.isChord() && (e as unknown as Chord).notes().length >= n) {
                    return e as unknown as Chord
                }
            }
        }
    }
    throw new Error(`no chord with ${n} notes`)
}

function selectNotes(score: MasterScore, notes: Note[]): void {
    score.select(null)
    for (const n of notes) {
        score.select(n, SelectType.ADD, n.staffIdx())
    }
}

function setHeadParentheses(score: MasterScore, on: boolean): void {
    inspectorSections(score)
    const changes = inspectorPropertyChanges(score, HEAD_PARENS, on)
    expect(changes.length).toBeGreaterThan(0)
    expect(applyInspectorChanges(score, changes)).toBe(true)
}

describe.skipIf(!hasSubmodule)('note parentheses', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Reunion.mscz`)
    })

    it('adds and removes the parentheses of a note from the Properties panel (undoable)', () => {
        const note = chordWithNotes(score, 1).notes()[0]
        const before = scoreHash(score)
        selectNotes(score, [note])

        setHeadParentheses(score, true)
        expect(note.getProperty(Pid.HAS_PARENTHESES)).toBe(ParenthesesMode.BOTH)
        expect(note.parenthesisInfo()?.notes()).toEqual([note])
        expect(note.parenthesisInfo()!.leftParen().generated()).toBe(false)
        const withParens = scoreHash(score)
        expect(withParens).not.toBe(before)

        expect(undo(score)).toBe(true)
        expect(note.parenthesisInfo()).toBeNull()
        expect(note.getProperty(Pid.HAS_PARENTHESES)).toBe(ParenthesesMode.NONE)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(scoreHash(score)).toBe(withParens)

        selectNotes(score, [note])
        setHeadParentheses(score, false)
        expect(note.parenthesisInfo()).toBeNull()
        expect(scoreHash(score)).toBe(before)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(withParens)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })

    it('puts the notes between the selected ones of a chord in one group and splits it when one is removed', () => {
        const chord = chordWithNotes(score, 3)
        const notes = [...chord.notes()]
        const before = scoreHash(score)

        // the lowest and the highest note: all notes in between get the parentheses too (getNotesByChord)
        selectNotes(score, [notes[0], notes[notes.length - 1]])
        setHeadParentheses(score, true)
        expect(chord.noteParentheses()).toHaveLength(1)
        expect([...chord.noteParentheses()[0].notes()].sort((a, b) => a.pitch() - b.pitch()))
            .toEqual([...notes].sort((a, b) => a.pitch() - b.pitch()))
        const grouped = scoreHash(score)

        // removing a middle note splits the group
        const sorted = chord.noteParentheses()[0].notes()
        const middle = sorted[1]
        selectNotes(score, [middle])
        setHeadParentheses(score, false)
        expect(middle.parenthesisInfo()).toBeNull()
        expect(chord.noteParentheses()).toHaveLength(2)
        for (const n of notes.filter(n => n !== middle)) {
            expect(n.parenthesisInfo()).not.toBeNull()
        }

        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(grouped)
        expect(chord.noteParentheses()).toHaveLength(1)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
        expect(chord.noteParentheses()).toHaveLength(0)
    })

    it('resets the parentheses (NoteheadSettingsModel reset)', () => {
        const note = chordWithNotes(score, 1).notes()[0]
        const before = scoreHash(score)
        selectNotes(score, [note])
        setHeadParentheses(score, true)
        inspectorSections(score)
        const resets = inspectorPropertyResets(score, HEAD_PARENS)
        expect(applyInspectorChanges(score, resets)).toBe(true)
        expect(note.parenthesisInfo()).toBeNull()
        expect(scoreHash(score)).toBe(before)
        expect(undo(score)).toBe(true)
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })

    it('toggles the parentheses with the add-parentheses action', () => {
        const note = chordWithNotes(score, 1).notes()[0]
        const before = scoreHash(score)
        selectNotes(score, [note])
        expect(executeAction(score, 'add-parentheses')).toBe(true)
        expect(note.parenthesisInfo()).not.toBeNull()
        expect(executeAction(score, 'add-parentheses')).toBe(true)
        expect(note.parenthesisInfo()).toBeNull()
        expect(scoreHash(score)).toBe(before)
        expect(undo(score)).toBe(true)
        expect(note.parenthesisInfo()).not.toBeNull()
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })
})
