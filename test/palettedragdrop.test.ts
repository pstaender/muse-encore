// SPDX-License-Identifier: GPL-3.0-only
// Drag and drop of palette cells onto the score (NotationInteraction startDropSingle / updateDropSingle / dropSingle /
// endDrop through the view API viewDragEnter / viewDragMove / viewDrop / viewDragLeave): the drop target, the drop
// rectangle of measure-anchored elements, the drop itself as one undoable command; and the outgoing drag of a score
// element (Shift+Ctrl+drag) whose mime data makes a custom palette cell.
import { beforeAll, describe, expect, it } from 'vitest'
import {
    drawPageSvg, insertPaletteCell, loadUserPalettes, paletteCellMimeData, userPalettes, viewDragEnter, viewDragLeave,
    viewDragMove, viewDrop, viewDropTarget, viewMouseMove, viewMousePress, viewMouseRelease, type MasterScore,
    type PaletteCellInfo,
} from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Chord } from '../src/engraving/dom/chord'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { Measure } from '../src/engraving/dom/measure'
import { ClefType, DPI, ElementType } from '../src/engraving/types/types'
import { VTEST, hasSubmodule, initFonts, openScore } from './helpers'

/** the SVG elements of all pages, sorted (undo may restore the drawing order of equal items differently) */
function scoreHash(score: MasterScore): string {
    const parts: string[] = []
    for (let i = 0; i < score.npages(); ++i) {
        parts.push(...drawPageSvg(score, i).split(/(?=<)/))
    }
    return parts.sort().join('')
}

function cell(type: string, name: string): PaletteCellInfo {
    const p = userPalettes().find(x => x.type === type)!
    const c = p.cells.find(x => x.name === name)
    if (!c) {
        throw new Error(`no cell ${name} in ${type}: ${p.cells.map(x => x.name).join(', ')}`)
    }
    return c
}

/** the page position (inches) of the center of an element */
function at(score: MasterScore, e: EngravingItem, dx = 0, dy = 0): { page: number; x: number; y: number; shift: boolean; ctrl: boolean; alt: boolean } {
    const page = e.findAncestor(ElementType.PAGE) as unknown as EngravingItem
    const c = e.canvasBoundingRect().center()
    const pp = page.canvasPos()
    return { page: score.pages().indexOf(page as never), x: (c.x() - pp.x()) / DPI + dx, y: (c.y() - pp.y()) / DPI + dy, shift: false, ctrl: false, alt: false }
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

/** drags the cell to the element, checks the target, drops, checks, undoes */
function dragDrop(score: MasterScore, c: PaletteCellInfo, target: EngravingItem, expectedTarget: string | null,
    check: () => void, mod: Partial<{ dx: number; dy: number; ctrl: boolean }> = {}): void {
    const before = scoreHash(score)
    expect(viewDragEnter(score, paletteCellMimeData(c.id).symbol!)).toBe(true)
    const pos = { ...at(score, target, mod.dx ?? 0, mod.dy ?? 0), ctrl: !!mod.ctrl }
    expect(viewDragMove(score, pos)).toBe(true)
    expect(viewDropTarget(score)?.type ?? null).toBe(expectedTarget)
    // the view highlights the target (drop target color) and draws the anchor line
    expect(drawPageSvg(score, pos.page, { printing: false })).toContain('stroke-dasharray')
    expect(viewDrop(score, pos)).toBe(true)
    expect(viewDropTarget(score)).toBeNull()
    check()
    expect(score.undoStack().canUndo()).toBe(true)
    score.undoRedo(true)
    expect(scoreHash(score)).toBe(before)
}

describe.skipIf(!hasSubmodule)('drag and drop of palette cells', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        loadUserPalettes(null)
        score = await openScore(`${VTEST}/articulation-4.mscz`)
    })

    it('drops an articulation on the nearest note', () => {
        const ch = chords(score)[2]
        const n = ch.articulations().length
        dragDrop(score, cell('Articulation', 'Accent above'), ch.upNote(), 'Note', () => {
            expect(ch.articulations().length).toBe(n + 1)
        })
    })

    it('drops a bagpipe embellishment on a note', () => {
        const ch = chords(score).find(c => c.graceNotes().length === 0)!
        dragDrop(score, cell('BagpipeEmbellishment', 'Single grace low G'), ch.upNote(), 'Note', () => {
            expect(ch.graceNotes().length).toBe(1)
            expect(ch.graceNotes()[0].upNote().pitch()).toBe(65)
        })
    })

    it('shows the drop rectangle of measure anchored elements', () => {
        const m = score.firstMeasure()!.nextMeasure()!
        expect(viewDragEnter(score, paletteCellMimeData(cell('KeySig', 'D major / B minor').id).symbol!)).toBe(true)
        const pos = at(score, m.first(SegmentType.ChordRest)!.element(0)!)
        const plain = drawPageSvg(score, pos.page, { printing: false })
        expect(viewDragMove(score, pos)).toBe(true)
        // the measure is not highlighted, the rectangle is filled with the selection color (alpha 80)
        const svg = drawPageSvg(score, pos.page, { printing: false })
        expect(svg).not.toBe(plain)
        expect(svg).toContain('rgba(0,101,191,0.3137')
        viewDragLeave(score)
        expect(drawPageSvg(score, pos.page, { printing: false })).toBe(plain)
    })

    it('drops a key signature on a measure (measure anchored: drop rectangle)', () => {
        const m = score.firstMeasure()!.nextMeasure()! as Measure
        const target = m.first(SegmentType.ChordRest)!.element(0)!
        dragDrop(score, cell('KeySig', 'D major / B minor'), target, 'Measure', () => {
            expect(score.staff(0)!.key(m.tick())).toBe(2)
        })
    })

    it('drops a hairpin at a position (time anchored)', () => {
        const ch = chords(score)[4]
        const n = score.spanner().length
        const before = scoreHash(score)
        expect(viewDragEnter(score, paletteCellMimeData(cell('Dynamic', 'Crescendo hairpin').id).symbol!)).toBe(true)
        const pos = at(score, ch.upNote())
        expect(viewDragMove(score, pos)).toBe(true)
        expect(viewDrop(score, pos)).toBe(true)
        expect(score.spanner().length).toBe(n + 1)
        score.undoRedo(true)
        expect(scoreHash(score)).toBe(before)
    })

    it('drops a dynamic (text and symbols) and a clef', () => {
        const ch = chords(score)[3]
        dragDrop(score, cell('Dynamic', 'mf (Mezzo-forte)'), ch.upNote(), 'Note', () => {
            expect(ch.segment().annotations().some(a => a.isDynamic())).toBe(true)
        })
        const m = score.firstMeasure()!.nextMeasure()!.nextMeasure()!
        const first = m.first(SegmentType.ChordRest)!.element(0)!
        dragDrop(score, cell('Clef', 'Bass clef'), first, 'Measure', () => {
            expect(score.staff(0)!.clef(m.tick())).toBe(ClefType.F)
        })
    })

    it('inserts a frame before a measure', () => {
        const nmb = score.measures().size()
        const m = score.firstMeasure()!.nextMeasure()!
        const grace = userPalettes().find(p => p.type === 'Layout')!.cells.find(c => c.action === 'insert-vbox')!
        dragDrop(score, grace, m.first(SegmentType.ChordRest)!.element(0)!, 'Measure', () => {
            expect(score.measures().size()).toBe(nmb + 1)
            expect(m.prev()!.type()).toBe(ElementType.VBOX)
        })
    })

    it('ends a drag without dropping', () => {
        const before = scoreHash(score)
        expect(viewDragEnter(score, paletteCellMimeData(cell('Articulation', 'Accent above').id).symbol!)).toBe(true)
        expect(viewDragMove(score, at(score, chords(score)[1].upNote()))).toBe(true)
        viewDragLeave(score)
        expect(viewDropTarget(score)).toBeNull()
        expect(scoreHash(score)).toBe(before)
        expect(viewDragEnter(score, '<nonsense/>')).toBe(false)
    })

    it('drags a score element with Shift+Ctrl out of the view into a palette', () => {
        const ch = chords(score)[2]
        const p = at(score, ch.upNote())
        const ev = { ...p, clientX: 100, clientY: 100, button: 0, buttons: 1, shift: true, ctrl: true, alt: false }
        viewMousePress(score, ev)
        const r = viewMouseMove(score, { ...ev, clientX: 120, clientY: 130 })
        expect(r.outgoingDrag).toBeNull() // notes cannot be dragged out (isOutgoingDragElementAllowed)
        viewMouseRelease(score, { ...ev, buttons: 0 })

        const art = chords(score).flatMap(c => c.articulations())[0]
        expect(art).toBeDefined()
        const pa = at(score, art)
        const ev2 = { ...pa, clientX: 100, clientY: 100, button: 0, buttons: 1, shift: true, ctrl: true, alt: false }
        viewMousePress(score, ev2)
        const drag = viewMouseMove(score, { ...ev2, clientX: 130, clientY: 140 }).outgoingDrag
        expect(drag?.type).toBe('Articulation')
        expect(viewMouseMove(score, { ...ev2, clientX: 140, clientY: 150 }).outgoingDrag).toBeNull() // only once
        viewMouseRelease(score, { ...ev2, buttons: 0 })
        const custom = userPalettes()[0]
        expect(insertPaletteCell(custom.id, -1, { symbol: drag!.mimeData }, 'copy')).toBe(true)
        const added = userPalettes()[0].cells.at(-1)!
        expect(added).toMatchObject({ custom: true, elementType: 'Articulation' })
    })
})
