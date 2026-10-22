// SPDX-License-Identifier: GPL-3.0-only
// Dragging with the mouse (NotationViewInputController mouse events, NotationInteraction::startDrag/drag/endDrag,
// EngravingItem::drag, Note::drag), the lasso selection (Shift+drag on empty space) and nudging with the arrow keys;
// undo and redo restore the SVG of all pages.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    executeAction, isDragging, redo, undo, viewMouseMove, viewMousePress, viewMouseRelease, type MasterScore,
    type ViewPointerEvent,
} from '../src/index'
import { DPI, ElementType } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { SlurSegment } from '../src/engraving/dom/slur'
import { Grip } from '../src/engraving/editing/editdata'
import { drawPageSvg } from '../src/index'
import { readFileSync } from 'node:fs'
import { layoutScore, loadScore, viewDragEnter, viewDragMove, viewDrop } from '../src/index'
import type { Fraction } from '../src/engraving/types/fraction'
import { DEMOS, ROOT, hasSubmodule, initFonts, openScore, scoreHash as hashWithSelection } from './helpers'

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

    it('shows the anchor line of the dragged element while dragging (MuseScore\'s drag anchor lines)', () => {
        let tempo: EngravingItem | null = null
        score.scanElements(e => {
            if (!tempo && e.isTempoText()) {
                tempo = e
            }
        })
        const t = tempo! as EngravingItem
        // the formatting color (#C31989) of the dotted line and its end points in the overlay of the page
        const pink = (): number => (drawPageSvg(score, 0, { printing: false }).match(/#c31989/gi) ?? []).length
        score.select(t)
        const before = pink()
        const c = t.canvasBoundingRect().center()
        const sp = score.style().spatium()
        viewMousePress(score, pointer(score, c.x(), c.y()))
        for (let i = 1; i <= 4; ++i) {
            viewMouseMove(score, pointer(score, c.x() + i * sp, c.y() + i * sp))
        }
        expect(isDragging(score)).toBe(true)
        expect(pink()).toBeGreaterThan(before)
        viewMouseRelease(score, pointer(score, c.x() + 4 * sp, c.y() + 4 * sp, { buttons: 0 }))
        expect(pink()).toBe(before)
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

    it('drags the end grip of a slur (grip edit), undo/redo', () => {
        let seg: SlurSegment | null = null
        score.scanElements(e => {
            if (!seg && e.isSlurSegment() && e.findAncestor(ElementType.PAGE) === score.pages()[0]) {
                seg = e as unknown as SlurSegment
            }
        })
        expect(seg).not.toBeNull()
        const s = seg! as SlurSegment
        const before = scoreHash(score)
        // the selected slur: edit-element (F2, or a click on it) starts its grip edit; the grips are placed when the
        // page is painted
        const pagePos = score.pages()[0].pos()
        score.select(s)
        expect(executeAction(score, 'edit-element')).toBe(true)
        drawPageSvg(score, 0, { printing: false, dpi: DPI_VIEW })
        const end = s.gripsPositions()[Grip.END].plus(pagePos)
        const off0 = s.ups(Grip.END).off.clone()
        viewMousePress(score, pointer(score, end.x(), end.y()))
        for (let i = 1; i <= 4; ++i) {
            viewMouseMove(score, pointer(score, end.x() + i * 10, end.y() - i * 10))
        }
        viewMouseRelease(score, pointer(score, end.x() + 40, end.y() - 40, { buttons: 0 }))
        expect(s.ups(Grip.END).off.x()).toBeGreaterThan(off0.x() + 30)
        const after = scoreHash(score)
        expect(after).not.toBe(before)
        undo(score)
        expect(scoreHash(score)).toBe(before)
        redo(score)
        expect(scoreHash(score)).toBe(after)
        undo(score)
        executeAction(score, 'action://notation/cancel')
    })
})

const CHORDSYMBOL_DATA = `${ROOT}MuseScore/src/engraving/tests/chordsymbol_data/`

/** the first chord symbol of the score */
function firstHarmony(score: MasterScore): EngravingItem {
    for (let s = score.firstSegment(SegmentType.ChordRest); s; s = s.next1(SegmentType.ChordRest)) {
        const h = s.annotations().find(a => a.isHarmony())
        if (h) {
            return h
        }
    }
    throw new Error('no chord symbol')
}

describe.skipIf(!hasSubmodule)('drag: moving elements to other beats (MoveElementAnchors, LineSegment::rebaseAnchors)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    function open(): MasterScore {
        const score = loadScore(readFileSync(`${CHORDSYMBOL_DATA}realize.mscx`))
        layoutScore(score)
        return score
    }

    it('a dragged chord symbol snaps to the beat under it; Ctrl (Cmd) keeps the anchor; undoable', () => {
        const score = open()
        const h = firstHarmony(score)
        const tick0 = h.tick()
        const measure = h.findMeasure()!
        const before = scoreHash(score)

        // a measure to the right: the chord symbol is now anchored to a later beat (or the next measure)
        dragItem(score, h, measure.width(), 0)
        expect(h.tick().gt(tick0)).toBe(true)
        expect(h.explicitParent()!.isSegment()).toBe(true)
        undo(score)
        expect(h.tick().eq(tick0)).toBe(true)
        expect(scoreHash(score)).toBe(before)

        // with Ctrl the chord symbol keeps its anchor and only gets an offset
        score.select(null)
        dragItem(score, h, measure.width(), 0, { ctrl: true })
        expect(h.tick().eq(tick0)).toBe(true)
        expect(h.offset().x()).toBeGreaterThan(measure.width() / 2)
        undo(score)
        expect(scoreHash(score)).toBe(before)
    })

    it('Ctrl+Shift drag copies a chord symbol to the chord or rest it is dropped on (outgoing drag + view drop)', () => {
        const score = open()
        const h = firstHarmony(score)
        const count = (): number => {
            let n = 0
            score.scanElements(e => {
                if (e.isHarmony()) {
                    n++
                }
            })
            return n
        }
        const n0 = count()
        const c = h.canvasBoundingRect().center()
        const sp = score.style().spatium()
        viewMousePress(score, pointer(score, c.x(), c.y(), { ctrl: true, shift: true }))
        const r = viewMouseMove(score, pointer(score, c.x() + 2 * sp, c.y(), { ctrl: true, shift: true }))
        expect(r.outgoingDrag).not.toBeNull()
        expect(r.outgoingDrag!.type).toBe('Harmony')

        // dropped onto the first chord or rest of the third measure
        const m3 = score.firstMeasure()!.nextMeasure()!.nextMeasure()!
        const cr = m3.first(SegmentType.ChordRest)!.element(0)!
        const target = cr.isChord() ? (cr as unknown as Chord).upNote() : cr
        const tc = target.canvasBoundingRect().center()
        const ev = pointer(score, tc.x(), tc.y())
        expect(viewDragEnter(score, r.outgoingDrag!.mimeData)).toBe(true)
        expect(viewDragMove(score, ev)).toBe(true)
        expect(viewDrop(score, ev)).toBe(true)
        viewMouseRelease(score, pointer(score, tc.x(), tc.y(), { buttons: 0 }))
        expect(count()).toBe(n0 + 1)
        expect(m3.first(SegmentType.ChordRest)!.annotations().some(a => a.isHarmony())).toBe(true)
        undo(score)
        expect(count()).toBe(n0)
    })

    it('a dragged hairpin moves its start and end to the segments under it', () => {
        const score = open()
        const m1 = score.firstMeasure()!
        score.select(m1, SelectType.RANGE, 0)
        expect(executeAction(score, 'add-hairpin')).toBe(true)
        let seg: EngravingItem | null = null
        score.scanElements(e => {
            if (!seg && e.isHairpinSegment()) {
                seg = e
            }
        })
        const hs = seg! as EngravingItem
        const line = (hs as unknown as { spanner(): { tick(): Fraction; tick2(): Fraction } }).spanner()
        const t1 = line.tick()
        const t2 = line.tick2()
        score.select(hs)
        const before = scoreHash(score)
        dragItem(score, hs, m1.width(), 0)
        expect(line.tick().gt(t1)).toBe(true)
        expect(line.tick2().gt(t2)).toBe(true)
        undo(score)
        expect(line.tick().eq(t1)).toBe(true)
        expect(line.tick2().eq(t2)).toBe(true)
        expect(scoreHash(score)).toBe(before)
    })
})
