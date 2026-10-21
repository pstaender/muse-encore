// SPDX-License-Identifier: GPL-3.0-only
// Bagpipe embellishments (dom/bagpembell.ts): the palette (one cell per EmbellishmentType, like
// PaletteCreator::newBagpipeEmbellishmentPalette), the single layout of the cells, read/write of the element (palette
// and mime data) and the drop on a note, which adds the embellishment's grace notes (Note::drop) with undo.
import { beforeAll, describe, expect, it } from 'vitest'
import { applyPaletteElement, defaultPalettes, masterPalettes, paletteCellElement, type MasterScore } from '../src/index'
import { BagpipeEmbellishment } from '../src/engraving/dom/bagpembell'
import { readMimeData } from '../src/engraving/dom/paste'
import { SegmentType } from '../src/engraving/dom/segment'
import { NoteType } from '../src/engraving/dom/chordrest'
import { PointF } from '../src/framework/draw/types/geometry'
import { Fraction } from '../src/engraving/types/fraction'
import { TConv } from '../src/engraving/types/typesconv'
import { SymId } from '../src/engraving/types/symid'
import type { Chord } from '../src/engraving/dom/chord'
import { drawPageSvg } from '../src/index'
import { VTEST, hasSubmodule, initFonts, openScore } from './helpers'

/** the SVG elements of all pages, sorted (undo may restore the drawing order of equal items differently) */
function scoreHash(score: MasterScore): string {
    const parts: string[] = []
    for (let i = 0; i < score.npages(); ++i) {
        parts.push(...drawPageSvg(score, i).split(/(?=<)/))
    }
    return parts.sort().join('')
}

beforeAll(async () => {
    await initFonts()
})

describe('bagpipe embellishments', () => {
    it('fills the palette like MuseScore', () => {
        const p = defaultPalettes().find(x => x.type === 'BagpipeEmbellishment')!
        expect(p.name).toBe('Bagpipe embellishments')
        expect(p.visible).toBe(false)
        expect([p.gridWidth, p.gridHeight, p.mag, p.drawGrid]).toEqual([55, 72, 0.8, true])
        expect(p.cells.length).toBe(TConv.embellishmentsCount())
        expect(p.cells.length).toBe(214)
        expect(p.cells[0].name).toBe('Single grace low G')
        expect(p.cells.at(-1)!.name).toBe('Thumb triple strike on high G')
        expect(p.cells.every(c => c.drawStaff && c.elementType === 'BagpipeEmbellishment')).toBe(true)
        expect(masterPalettes().find(x => x.type === 'BagpipeEmbellishment')!.cells.length).toBe(214)
    })

    it('lays out the grace notes of a cell', () => {
        const cells = defaultPalettes().find(x => x.type === 'BagpipeEmbellishment')!.cells
        // single grace: a flag, no beam
        const single = paletteCellElement(cells[0].id) as BagpipeEmbellishment
        expect(single.resolveNoteList()).toEqual([0])
        expect(single.ldata().isDrawFlag).toBe(true)
        expect(single.ldata().isDrawBeam).toBe(false)
        expect(single.ldata().headsym).toBe(SymId.noteheadBlack)
        expect(single.mag()).toBe(0.7)
        // "Doubling on high A" (HA HG): beamed, a ledger line for high A
        const idx = cells.findIndex(c => c.name === 'Doubling on high A')
        const dbl = paletteCellElement(cells[idx].id) as BagpipeEmbellishment
        expect(dbl.resolveNoteList()).toEqual([8, 7])
        expect(dbl.ldata().isDrawBeam).toBe(true)
        expect(dbl.ldata().notesData.size).toBe(2)
        expect(dbl.ldata().notesData.get(0)!.ledgerLine.isNull()).toBe(false)
        expect(dbl.ldata().notesData.get(1)!.ledgerLine.isNull()).toBe(true)
        expect(dbl.ldata().bbox().width()).toBeGreaterThan(single.ldata().bbox().width())
    })

    it('writes and reads the element (mime data)', () => {
        const cells = defaultPalettes().find(x => x.type === 'BagpipeEmbellishment')!.cells
        const b = paletteCellElement(cells[42].id) as BagpipeEmbellishment
        const data = b.mimeData()
        expect(data).toContain('<BagpipeEmbellishment>')
        expect(data).toContain('<subtype>42</subtype>')
        const read = readMimeData(b.score(), data, { v: new PointF() }, { v: new Fraction(1, 4) })
        expect(read).toBeInstanceOf(BagpipeEmbellishment)
        expect((read as BagpipeEmbellishment).embelType()).toBe(42)
    })
})

describe.skipIf(!hasSubmodule)('bagpipe embellishments on a score', () => {
    let score: MasterScore

    beforeAll(async () => {
        score = await openScore(`${VTEST}/beams-1.mscz`)
    })

    it('adds the grace notes of an embellishment to a note, undo removes them', () => {
        const cells = defaultPalettes().find(x => x.type === 'BagpipeEmbellishment')!.cells
        const cell = cells.find(c => c.name === 'Doubling on low G')! // HG LG D
        let chord: Chord | null = null
        for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s && !chord; s = s.next1(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e?.isChord() && (e as unknown as Chord).graceNotes().length === 0) {
                chord = e as unknown as Chord
            }
        }
        expect(chord).not.toBeNull()
        chord = chord!
        const graceBefore = chord.graceNotes().length
        const before = scoreHash(score)
        score.select(chord.upNote())
        expect(applyPaletteElement(score, paletteCellElement(cell.id)!)).toBe(true)
        const grace = chord.graceNotes()
        expect(grace.length).toBe(graceBefore + 3)
        expect(grace.slice(0, 3).map(g => g.upNote().pitch())).toEqual([77, 65, 72])
        expect(grace.slice(0, 3).every(g => g.noteType() === NoteType.GRACE32)).toBe(true)
        expect(scoreHash(score)).not.toBe(before)
        score.undoRedo(true)
        expect(chord.graceNotes().length).toBe(graceBefore)
        expect(scoreHash(score)).toBe(before)
        score.undoRedo(false)
        expect(chord.graceNotes().length).toBe(graceBefore + 3)
        score.undoRedo(true)
        expect(scoreHash(score)).toBe(before)
    })
})
