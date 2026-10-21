// SPDX-License-Identifier: GPL-3.0-only
// Dragging with the mouse (NotationViewInputController mouse events, NotationInteraction::startDrag/drag/endDrag,
// EngravingItem::drag, Note::drag), the lasso selection (Shift+drag on empty space) and nudging with the arrow keys;
// undo and redo restore the SVG of all pages.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    executeAction, isDragging, redo, undo, viewMouseMove, viewMousePress, viewMouseRelease, type MasterScore,
    type ViewPointerEvent,
} from '../src/index'
import { DPI } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import { DEMOS, hasSubmodule, openScore, scoreHash as hashWithSelection } from './helpers'

function scoreHash(score: MasterScore): string {
    score.select(null)
    return hashWithSelection(score)
}

const DPI_VIEW = 100

/** a pointer event at a canvas point (MuseScore units) of page 0 */
function pointer(score: MasterScore, x: number, y: number, mods: Partial<ViewPointerEvent> = {}): ViewPointerEvent {
    const page = score.pages()[0]
    const px = (x - page.pos().x()) / DPI
    const py = (y - page.pos().y()) / DPI
    return {
        page: 0, x: px, y: py, clientX: px * DPI_VIEW, clientY: py * DPI_VIEW, button: 0, buttons: 1,
        shift: false, ctrl: false, alt: false, dpi: DPI_VIEW, ...mods,
    }
}

/** press on the center of the element, move by (dx, dy) canvas units in steps, release */
function dragItem(score: MasterScore, item: EngravingItem, dx: number, dy: number, mods: Partial<ViewPointerEvent> = {}): void {
    const r = item.canvasBoundingRect()
    const c = r.center()
    viewMousePress(score, pointer(score, c.x(), c.y(), mods))
    for (let i = 1; i <= 4; ++i) {
        viewMouseMove(score, pointer(score, c.x() + dx * i / 4, c.y() + dy * i / 4, mods))
    }
    viewMouseRelease(score, pointer(score, c.x() + dx, c.y() + dy, { ...mods, buttons: 0 }))
}

function firstChord(score: MasterScore): Chord {
    for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        const e = s.element(0)
        if (e && e.isChord()) {
            return e as unknown as Chord
        }
    }
    throw new Error('no chord')
}

describe.skipIf(!hasSubmodule)('drag', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${DEMOS}/Reunion.mscz`)
    })

    it('drags a tempo text and a note (the note changes its pitch)', () => {
        // a text element with content: the tempo text of the score
        let tempo: EngravingItem | null = null
        score.scanElements(e => {
            if (!tempo && e.isTempoText()) {
                tempo = e
            }
        })
        expect(tempo).not.toBeNull()
        const t = tempo! as EngravingItem
        const before = scoreHash(score)
        const offset0 = t.offset().clone()
        // first click selects, the drag moves it
        dragItem(score, t, 3 * score.style().spatium(), 2 * score.style().spatium())
        expect(isDragging(score)).toBe(false)
        expect(t.offset().x()).toBeGreaterThan(offset0.x() + score.style().spatium())
        const after = scoreHash(score)
        expect(after).not.toBe(before)
        undo(score)
        expect(scoreHash(score)).toBe(before)
        redo(score)
        expect(scoreHash(score)).toBe(after)
        undo(score)

        // a note dragged up two staff spaces
        const note = firstChord(score).upNote()
        const pitch = note.pitch()
        score.select(note)
        dragItem(score, note, 0, -2 * score.style().spatium())
        expect(note.pitch()).toBeGreaterThan(pitch)
        const afterNote = scoreHash(score)
        undo(score)
        expect(note.pitch()).toBe(pitch)
        expect(scoreHash(score)).toBe(before)
        redo(score)
        expect(scoreHash(score)).toBe(afterNote)
        undo(score)
    })

    it('lasso: Shift+drag on empty space selects the elements in the rectangle', () => {
        const chord = firstChord(score)
        const system = chord.measure()!.system()!
        const sr = system.canvasBoundingRect()
        const m = chord.measure()!.canvasBoundingRect()
        score.select(null)
        // from above the system to below the first measure
        const x0 = m.left() + 1
        const y0 = sr.top() - 4 * score.style().spatium()
        viewMousePress(score, pointer(score, x0, y0, { shift: true }))
        for (let i = 1; i <= 3; ++i) {
            viewMouseMove(score, pointer(score, x0 + m.width() * i / 3, y0 + (sr.height() + 6 * score.style().spatium()) * i / 3, { shift: true }))
        }
        expect(isDragging(score)).toBe(true)
        viewMouseRelease(score, pointer(score, m.right(), sr.bottom() + 2 * score.style().spatium(), { shift: true, buttons: 0 }))
        expect(isDragging(score)).toBe(false)
        const sel = score.selection()
        expect(sel.elements().length).toBeGreaterThan(0)
        expect(sel.elements()).toContain(chord.upNote())
    })

    it('nudges a selected text with the arrow keys (Ctrl: quickly)', () => {
        let tempo: EngravingItem | null = null
        score.scanElements(e => {
            if (!tempo && e.isTempoText()) {
                tempo = e
            }
        })
        const t = tempo! as EngravingItem
        const before = scoreHash(score)
        const x0 = t.offset().x()
        score.select(t, SelectType.SINGLE)
        expect(executeAction(score, 'notation-move-right')).toBe(true)
        expect(t.offset().x()).toBeCloseTo(x0 + 0.1 * t.spatium())
        score.select(t, SelectType.SINGLE)
        expect(executeAction(score, 'notation-move-right-quickly')).toBe(true)
        expect(t.offset().x()).toBeCloseTo(x0 + 1.1 * t.spatium())
        undo(score)
        undo(score)
        expect(scoreHash(score)).toBe(before)
    })
})
