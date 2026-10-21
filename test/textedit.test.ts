// SPDX-License-Identifier: GPL-3.0-only
// Text editing (TextBase::startEdit/edit/endEdit, textedit.cpp undo commands) and adding texts (Score::addText,
// NotationInteraction::addText, lyrics navigation): typed through the view API like the editor, undo and redo restore
// the SVG of all pages.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    executeAction, redo, textEditingInfo, undo, viewInputText, viewKeyPress, viewShortcutOverride, type MasterScore,
    type ViewKeyEvent,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Chord } from '../src/engraving/dom/chord'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import type { TextBase } from '../src/engraving/dom/textbase'
import type { Lyrics } from '../src/engraving/dom/lyrics'
import { LyricsSyllabic } from '../src/engraving/types/types'
import { DEMOS, hasSubmodule, openScore, scoreHash as hashWithSelection } from './helpers'

function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

function key(k: string, mods: Partial<ViewKeyEvent> = {}): ViewKeyEvent {
    return { key: k, shift: false, ctrl: false, alt: false, ...mods }
}

/** a key like the editor: the view takes it if it is an edit key, else it is the action of its shortcut */
function press(score: MasterScore, k: ViewKeyEvent, shortcutAction?: string): void {
    if (viewShortcutOverride(score, k)) {
        expect(viewKeyPress(score, k)).toBe(true)
    } else {
        expect(shortcutAction, `${k.key} is a shortcut`).toBeTruthy()
        expect(executeAction(score, shortcutAction!)).toBe(true)
    }
}

/** the first chords of the top staff */
function chords(score: MasterScore, n: number): Chord[] {
    const res: Chord[] = []
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s && res.length < n; s = s.next1(SegmentType.ChordRest)) {
        const e = s.element(0)
        if (e && e.isChord()) {
            res.push(e as unknown as Chord)
        }
    }
    return res
}

describe.skipIf(!hasSubmodule)('text editing', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Reunion.mscz`)
    })

    it('adds a staff text (Ctrl+T), types, edits and ends editing; undo/redo', () => {
        const before = scoreHash(score)
        const chord = chords(score, 3)[2]
        score.select(chord.upNote())
        expect(executeAction(score, 'staff-text')).toBe(true)
        expect(textEditingInfo(score)).toMatchObject({ active: true, type: 'StaffText', text: '' })

        viewInputText(score, 'Hallo')
        press(score, key(' '))
        viewInputText(score, 'Welt')
        press(score, key('Backspace'))
        press(score, key('ArrowLeft'))
        press(score, key('ArrowLeft', { shift: true }))
        press(score, key('X', { shift: true })) // replaces the selected "e"
        expect(textEditingInfo(score).text).toBe('Hallo WXl')
        expect(textEditingInfo(score).cursor).not.toBeNull()

        expect(executeAction(score, 'action://notation/cancel')).toBe(true) // Escape: end editing
        expect(textEditingInfo(score).active).toBe(false)
        const text = chord.segment().annotations().find(a => a.isStaffText()) as unknown as TextBase
        expect(text.plainText()).toBe('Hallo WXl')

        const after = scoreHash(score)
        expect(after).not.toBe(before)
        // the whole edit is one undo step together with adding the text
        expect(undo(score)).toBe(true)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(scoreHash(score)).toBe(after)
        undo(score)
    })

    it('an empty new text is removed when editing ends', () => {
        const before = scoreHash(score)
        score.select(chords(score, 1)[0].upNote())
        executeAction(score, 'staff-text')
        executeAction(score, 'action://notation/cancel')
        expect(scoreHash(score)).toBe(before)
    })

    it('edits an existing text (Enter on the selected text) and Ctrl+B', () => {
        const chord = chords(score, 2)[1]
        score.select(chord.upNote())
        executeAction(score, 'system-text')
        viewInputText(score, 'Tempo')
        executeAction(score, 'action://notation/cancel')
        const text = chord.segment().annotations().find(a => a.isSystemText()) as unknown as TextBase
        const h1 = scoreHash(score)

        score.select(text)
        press(score, key('Enter')) // edit-text
        expect(textEditingInfo(score).active).toBe(true)
        press(score, key('End'))
        viewInputText(score, ' I')
        press(score, key('a', { ctrl: true })) // select all
        expect(executeAction(score, 'text-b')).toBe(true)
        executeAction(score, 'action://notation/cancel')
        expect(text.plainText()).toBe('Tempo I')
        expect(text.xmlText()).toBe('<b>Tempo I</b>')
        const h2 = scoreHash(score)
        expect(h2).not.toBe(h1)
        undo(score)
        expect(scoreHash(score)).toBe(h1)
        redo(score)
        expect(scoreHash(score)).toBe(h2)
        undo(score)
        undo(score)
    })

    it('adds lyrics to two notes (Ctrl+L, hyphen) and a melisma', () => {
        const before = scoreHash(score)
        const [c1, c2, c3] = chords(score, 3)
        score.select(c1.upNote())
        expect(executeAction(score, 'lyrics')).toBe(true)
        expect(textEditingInfo(score).type).toBe('Lyrics')
        viewInputText(score, 'Hal')
        press(score, key('-'), 'next-syllable')
        viewInputText(score, 'lo')
        press(score, key(' '), 'next-word')
        viewInputText(score, 'Welt')
        press(score, key('_', { shift: true }), 'add-melisma')
        executeAction(score, 'action://notation/cancel')

        const l1 = (c1 as unknown as ChordRest).lyrics()[0] as Lyrics
        const l2 = (c2 as unknown as ChordRest).lyrics()[0] as Lyrics
        const l3 = (c3 as unknown as ChordRest).lyrics()[0] as Lyrics
        expect(l1.plainText()).toBe('Hal')
        expect(l1.syllabic()).toBe(LyricsSyllabic.BEGIN)
        expect(l2.plainText()).toBe('lo')
        expect(l2.syllabic()).toBe(LyricsSyllabic.END)
        expect(l3.plainText()).toBe('Welt')

        const after = scoreHash(score)
        expect(after).not.toBe(before)
        let n = 0
        while (scoreHash(score) !== before && n < 10) {
            undo(score)
            ++n
        }
        expect(scoreHash(score)).toBe(before)
        for (let i = 0; i < n; ++i) {
            redo(score)
        }
        expect(scoreHash(score)).toBe(after)
        for (let i = 0; i < n; ++i) {
            undo(score)
        }
    })

    it('adds a chord symbol (Ctrl+K), a rehearsal mark and a tempo text', () => {
        const before = scoreHash(score)
        const [, c2] = chords(score, 2)
        for (const [action, text] of [['chord-text', 'Am7'], ['rehearsalmark-text', ''], ['tempo', '']] as const) {
            score.select(c2.upNote())
            expect(executeAction(score, action)).toBe(true)
            expect(textEditingInfo(score).active).toBe(true)
            if (text) {
                viewInputText(score, text)
            }
            executeAction(score, 'action://notation/cancel')
        }
        const annotations = c2.segment().annotations()
        expect(annotations.some(a => a.isHarmony() && (a as unknown as TextBase).plainText() === 'Am7')).toBe(true)
        expect(annotations.some(a => a.isRehearsalMark() && (a as unknown as TextBase).plainText() === 'A')).toBe(true)
        expect(annotations.some(a => a.isTempoText())).toBe(true)
        undo(score)
        undo(score)
        undo(score)
        expect(scoreHash(score)).toBe(before)
    })
})
