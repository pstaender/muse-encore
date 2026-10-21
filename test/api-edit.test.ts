// SPDX-License-Identifier: GPL-3.0-only
// The editing API of src/index.ts: executeAction (MuseScore's action codes), enabled/checked states, undo/redo,
// modified state, note input state and cursor, the inspector functions selectionProperties/changeSelectionProperty.
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    canRedo, canUndo, changeSelectionProperty, clearSelection, createScore, defaultNewScoreOptions, drawPageSvg, executeAction,
    isActionAvailable, isActionChecked, isActionEnabled, isModified, markSaved, noteInputCursorBounds, noteInputState, redo,
    resetSelectionProperty, selectionInfo, selectionProperties, undo, undoStackInfo, type MasterScore,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { Chord } from '../src/engraving/dom/chord'
import { initFonts } from './helpers'

/** a hash of the SVG of all pages; the elements are sorted: removing and adding an element can change the painting order */
function hash(score: MasterScore, printing = false): string {
    const h = createHash('sha256')
    for (let i = 0; i < score.npages(); ++i) {
        h.update(drawPageSvg(score, i, { printing }).split('><').sort().join('\n'))
    }
    return h.digest('hex')
}

function firstRest(score: MasterScore): EngravingItem {
    return score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0)!
}

function chords(score: MasterScore): Chord[] {
    const res: Chord[] = []
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        const e = s.element(0)
        if (e?.isChord()) {
            res.push(e as unknown as Chord)
        }
    }
    return res
}

describe('editing API', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
    })

    it('knows MuseScore action codes and their enabled states', () => {
        clearSelection(score)
        expect(isActionAvailable(score, 'action://notation/undo')).toBe(true)
        expect(isActionAvailable(score, 'note-c')).toBe(true)
        expect(isActionAvailable(score, 'no-such-action')).toBe(false)
        expect(isActionEnabled(score, 'action://notation/undo')).toBe(false)
        expect(isActionEnabled(score, 'action://notation/delete')).toBe(false)
        expect(isActionEnabled(score, 'flip')).toBe(false)
        expect(executeAction(score, 'action://notation/delete')).toBe(false)
        score.select(firstRest(score))
        expect(isActionEnabled(score, 'action://notation/delete')).toBe(true)
        clearSelection(score)
    })

    it('changes a property of the selection, undo and redo restore it', () => {
        const rest = firstRest(score)
        score.select(rest)
        const before = hash(score)
        const props = selectionProperties(score)
        expect(props.visible.value).toBe(true)
        expect(props.visible.mixed).toBe(false)
        expect(props.offset.value).toEqual({ x: 0, y: 0 })
        expect(isModified(score)).toBe(false)

        expect(changeSelectionProperty(score, 'visible', false)).toBe(true)
        expect(rest.visible()).toBe(false)
        expect(selectionProperties(score, ['visible']).visible.value).toBe(false)
        expect(isModified(score)).toBe(true)
        expect(canUndo(score)).toBe(true)
        expect(isActionEnabled(score, 'action://notation/undo')).toBe(true)
        expect(undoStackInfo(score)).toMatchObject({ canUndo: true, canRedo: false, undoActionName: 'Edit visible', index: 1, size: 1 })

        expect(undo(score)).toBe(true)
        expect(rest.visible()).toBe(true)
        expect(canRedo(score)).toBe(true)
        expect(isModified(score)).toBe(false)
        expect(hash(score)).toBe(before)

        expect(redo(score)).toBe(true)
        expect(rest.visible()).toBe(false)
        markSaved(score)
        expect(isModified(score)).toBe(false)
        undo(score)
        expect(isModified(score)).toBe(true)
        redo(score)
        undo(score)
        expect(hash(score)).toBe(before)
    })

    it('converts points, colors and styled values', () => {
        const rest = firstRest(score)
        score.select(rest)
        expect(changeSelectionProperty(score, 'offset', { x: 1, y: -2 })).toBe(true)
        expect(rest.offset().x()).toBeCloseTo(rest.spatium())
        expect(selectionProperties(score, ['offset']).offset.value).toEqual({ x: 1, y: -2 })
        expect(changeSelectionProperty(score, 'color', '#ff000080')).toBe(true)
        expect(selectionProperties(score, ['color']).color.value).toBe('#ff000080')
        expect(changeSelectionProperty(score, 'color', 'red')).toBe(false)
        expect(changeSelectionProperty(score, 'no-such-property', 1)).toBe(false)
        expect(resetSelectionProperty(score, 'offset')).toBe(true)
        expect(selectionProperties(score, ['offset']).offset.value).toEqual({ x: 0, y: 0 })
        undo(score)
        undo(score)
        undo(score)
        expect(rest.offset().x()).toBe(0)
    })

    it('toggles note input mode and draws the cursor', () => {
        score.select(firstRest(score))
        expect(executeAction(score, 'note-input')).toBe(true)
        expect(noteInputState(score)).toMatchObject({ active: true, method: 'by-note-name', duration: 'quarter', voice: 0, staff: 0 })
        expect(isActionChecked(score, 'note-input')).toBe(true)
        expect(isActionChecked(score, 'note-input-by-note-name')).toBe(true)
        expect(isActionChecked(score, 'pad-note-4')).toBe(true)
        expect(isActionChecked(score, 'pad-note-8')).toBe(false)
        expect(isActionChecked(score, 'voice-1')).toBe(true)
        const cursor = noteInputCursorBounds(score)
        expect(cursor).not.toBeNull()
        expect(cursor!.page).toBe(0)
        expect(cursor!.width).toBeGreaterThan(0)
        expect(drawPageSvg(score, 0, { printing: false })).not.toBe(drawPageSvg(score, 0))
        expect(executeAction(score, 'action://notation/cancel')).toBe(true)
        expect(noteInputState(score).active).toBe(false)
        expect(noteInputCursorBounds(score)).toBeNull()
        clearSelection(score)
    })

    it('enters notes, undoes them, deletes a note', () => {
        const fresh = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
        const before = hash(fresh, true)
        fresh.select(firstRest(fresh))
        executeAction(fresh, 'note-input')
        executeAction(fresh, 'pad-note-8')
        expect(isActionChecked(fresh, 'pad-note-8')).toBe(true)
        for (const n of ['note-c', 'note-d', 'note-e']) {
            expect(executeAction(fresh, n)).toBe(true)
        }
        expect(chords(fresh).length).toBe(3)
        expect(new Set(chords(fresh).map(c => c.durationType().type())).size).toBe(1)
        expect(undoStackInfo(fresh).undoActionName).toBe('Enter note')
        executeAction(fresh, 'action://notation/cancel')
        expect(selectionInfo(fresh)).toMatch(/E/)

        executeAction(fresh, 'action://notation/delete')
        expect(chords(fresh).length).toBe(2)
        undo(fresh)
        expect(chords(fresh).length).toBe(3)

        const pitch = chords(fresh)[2].upNote().pitch()
        executeAction(fresh, 'pitch-up')
        expect(chords(fresh)[2].upNote().pitch()).toBe(pitch + 1)
        executeAction(fresh, 'pitch-down-octave')
        expect(chords(fresh)[2].upNote().pitch()).toBe(pitch - 11)
        undo(fresh)
        undo(fresh)
        expect(chords(fresh)[2].upNote().pitch()).toBe(pitch)

        // a selected note: accidental, flip, visibility, voice and duration commands are undoable
        const h = hash(fresh)
        for (const code of ['sharp', 'flip', 'toggle-visible', 'pad-note-2', 'pad-dot', 'voice-2', 'tie']) {
            expect(isActionEnabled(fresh, code)).toBe(true)
            executeAction(fresh, code)
            undo(fresh)
            expect(hash(fresh), code).toBe(h)
        }

        while (canUndo(fresh)) {
            undo(fresh)
        }
        expect(chords(fresh).length).toBe(0)
        expect(hash(fresh, true)).toBe(before)
    })
})
