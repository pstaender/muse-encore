// SPDX-License-Identifier: GPL-3.0-only
// Palette elements (NotationInteraction::applyPaletteElement and the EngravingItem::drop functions): clefs, key and
// time signatures, barlines, layout breaks, dynamics, articulations, accidentals, noteheads; every change is undone
// and the rendering must then be the same as before.
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    applyPaletteElement, createPaletteElement, createScore, defaultNewScoreOptions, drawPageSvg, paletteElementName,
    type MasterScore, type PaletteElementSpec,
} from '../src/index'
import { BarLineType, ClefType, NoteHeadGroup } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { SymId } from '../src/engraving/types/symid'
import { AccidentalType } from '../src/engraving/dom/accidentaldata'
import { DynamicType } from '../src/engraving/types/types'
import type { Chord } from '../src/engraving/dom/chord'
import type { Clef } from '../src/engraving/dom/clef'
import type { Dynamic } from '../src/engraving/dom/dynamic'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { KeySig } from '../src/engraving/dom/keysig'
import type { Measure } from '../src/engraving/dom/measure'
import type { Note } from '../src/engraving/dom/note'
import type { TimeSig } from '../src/engraving/dom/timesig'
import { VTEST, hasSubmodule, initFonts, openScore } from './helpers'

function scoreHash(score: MasterScore): string {
    const h = createHash('sha256')
    for (let i = 0; i < score.npages(); ++i) {
        h.update(drawPageSvg(score, i))
    }
    return h.digest('hex')
}

function measure(score: MasterScore, idx: number): Measure {
    let m = score.firstMeasure()!
    for (let i = 0; i < idx; ++i) {
        m = m.nextMeasure()!
    }
    return m
}

function firstCR(m: Measure, track = 0): EngravingItem {
    return m.first(SegmentType.ChordRest)!.element(track)!
}

/** applies the element to the current selection, checks the result, undoes and compares with the original */
function applyAndUndo(score: MasterScore, spec: PaletteElementSpec, check: () => void, modifiers = {}): void {
    const before = scoreHash(score)
    const element = createPaletteElement(score, spec)
    expect(element).not.toBeNull()
    expect(applyPaletteElement(score, element!, modifiers)).toBe(true)
    check()
    expect(score.undoStack().canUndo()).toBe(true)
    score.undoRedo(true)
    expect(scoreHash(score)).toBe(before)
}

describe('palette elements in a new score', () => {
    let score: MasterScore

    beforeAll(async () => {
        await initFonts()
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'piano' }], measures: 8 })
    })

    it('creates palette elements with names', () => {
        const clef = createPaletteElement(score, { type: 'Clef', clefType: 'F' })
        expect((clef as unknown as Clef).clefType()).toBe(ClefType.F)
        expect(paletteElementName(clef!)).toBeTruthy()
        expect(createPaletteElement(score, { type: 'Articulation', symbol: 'noSuchSymbol' })).toBeNull()
    })

    it('does nothing without a selection', () => {
        score.deselectAll()
        expect(applyPaletteElement(score, createPaletteElement(score, { type: 'Clef', clefType: 'F' })!)).toBe(false)
    })

    it('drops a clef on a measure (range selection) and on a rest', () => {
        const m = measure(score, 2)
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'Clef', clefType: 'F' }, () => {
            // a clef change at the start of a measure is placed at the end of the previous measure
            const staff = score.staff(0)!
            expect(staff.clef(m.tick())).toBe(ClefType.F)
            // restored after the measure (range selection of one measure: not restored)
        })
        const rest = firstCR(measure(score, 1))
        score.select(rest)
        applyAndUndo(score, { type: 'Clef', clefType: 'C3' }, () => {
            expect(score.staff(0)!.clef(rest.tick())).toBe(ClefType.C3)
        })
    })

    it('drops a key signature on a measure: all staves, ctrl: only one staff', () => {
        const m = measure(score, 3)
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'KeySig', key: 2 }, () => {
            expect(score.staff(0)!.key(m.tick())).toBe(2)
            expect(score.staff(1)!.key(m.tick())).toBe(2)
            const ks = m.findSegment(SegmentType.KeySig, m.tick())!.element(0) as KeySig
            expect(ks.isKeySig()).toBe(true)
        })
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'KeySig', key: -3 }, () => {
            expect(score.staff(0)!.key(m.tick())).toBe(-3)
            expect(score.staff(1)!.key(m.tick())).toBe(0)
        }, { ctrl: true })
    })

    it('replaces a time signature by one of the same duration (common time)', () => {
        const m = measure(score, 0)
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'TimeSig', numerator: 4, denominator: 4, timeSigType: 'common' }, () => {
            const ts = m.findSegment(SegmentType.TimeSig, m.tick())!.element(0) as TimeSig
            expect(ts.timeSigType()).toBe(1 /* TimeSigType::FOUR_FOUR */)
        })
    })

    it('drops barlines on a measure', () => {
        const m = measure(score, 1)
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'BarLine', barLineType: 'double' }, () => {
            expect(m.endBarLineType()).toBe(BarLineType.DOUBLE)
        })
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'BarLine', barLineType: 'end-repeat' }, () => {
            expect(m.repeatEnd()).toBe(true)
        })
        score.select(measure(score, 2), SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'BarLine', barLineType: 'start-repeat' }, () => {
            expect(measure(score, 2).repeatStart()).toBe(true)
        })
    })

    it('toggles layout breaks', () => {
        const m = measure(score, 1)
        score.select(firstCR(m))
        applyAndUndo(score, { type: 'LayoutBreak', breakType: 'line' }, () => {
            expect(m.lineBreak()).toBe(true)
            expect(m.el().some(e => e.isLayoutBreak())).toBe(true)
            // the second system starts with measure 3
            expect(measure(score, 2).system()).not.toBe(m.system())
        })
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'LayoutBreak', breakType: 'page' }, () => {
            expect(m.pageBreak()).toBe(true)
            expect(score.npages()).toBe(2)
        })
    })

    it('adds a dynamic to a rest and changes an existing dynamic', () => {
        const rest = firstCR(measure(score, 4))
        score.select(rest)
        const before = scoreHash(score)
        applyPaletteElement(score, createPaletteElement(score, { type: 'Dynamic', dynamic: 'mf' })!)
        const seg = measure(score, 4).first(SegmentType.ChordRest)!
        const dyn = seg.annotations().find(e => e.isDynamic()) as Dynamic
        expect(dyn.dynamicType()).toBe(DynamicType.MF)
        // the new dynamic is selected: drop another one on it
        expect(score.selection().element()).toBe(dyn)
        applyPaletteElement(score, createPaletteElement(score, { type: 'Dynamic', dynamic: 'pp' })!)
        expect(dyn.dynamicType()).toBe(DynamicType.PP)
        score.undoRedo(true)
        expect(dyn.dynamicType()).toBe(DynamicType.MF)
        score.undoRedo(true)
        expect(seg.annotations().some(e => e.isDynamic())).toBe(false)
        expect(scoreHash(score)).toBe(before)
    })

    it('adds dynamics, staff text and fermatas to every chord/rest of a range', () => {
        const m = measure(score, 5)
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'StaffText', text: 'dolce' }, () => {
            // texts only at the start of the range
            const texts = m.first(SegmentType.ChordRest)!.annotations().filter(e => e.isStaffText())
            expect(texts.length).toBe(1)
        })
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'Fermata', symbol: 'fermataAbove' }, () => {
            expect(m.first(SegmentType.ChordRest)!.annotations().some(e => e.isFermata())).toBe(true)
        })
        score.select(m, SelectType.SINGLE, 0)
        applyAndUndo(score, { type: 'Hairpin', hairpinType: 'crescendo' }, () => {
            expect(score.spanner().some(s => s.isHairpin())).toBe(true)
        })
    })
})

describe.runIf(hasSubmodule)('palette elements on notes', () => {
    let score: MasterScore
    let chord: Chord

    beforeAll(async () => {
        score = await openScore(`${VTEST}/beams-1.mscz`)
        for (let s = score.firstMeasure()!.first(SegmentType.ChordRest); s && !chord; s = s.next1(SegmentType.ChordRest)) {
            const e = s.element(0)
            if (e?.isChord()) {
                chord = e as unknown as Chord
            }
        }
    })

    it('adds and toggles an articulation', () => {
        score.select(chord.upNote())
        applyAndUndo(score, { type: 'Articulation', symbol: 'articStaccatoAbove' }, () => {
            // the layout flips the symbol to the side of the stem
            expect(chord.articulations().some(a => a.symId() === SymId.articStaccatoAbove || a.symId() === SymId.articStaccatoBelow)).toBe(true)
        })
    })

    it('changes the accidental of a note', () => {
        const note: Note = chord.upNote()
        const pitch = note.pitch()
        score.select(note)
        applyAndUndo(score, { type: 'Accidental', accidental: 'accidentalSharp' }, () => {
            expect(note.accidentalType()).toBe(AccidentalType.SHARP)
            expect(note.pitch()).not.toBe(pitch)
        })
        expect(note.pitch()).toBe(pitch)
    })

    it('changes the notehead of a note', () => {
        const note: Note = chord.upNote()
        score.select(note)
        applyAndUndo(score, { type: 'NoteHead', group: 'cross' }, () => {
            expect(note.headGroup()).toBe(NoteHeadGroup.HEAD_CROSS)
        })
        expect(note.headGroup()).toBe(NoteHeadGroup.HEAD_NORMAL)
    })

    it('adds a dynamic below a note', () => {
        score.select(chord.upNote())
        applyAndUndo(score, { type: 'Dynamic', dynamic: 'f' }, () => {
            expect(chord.segment().annotations().some(e => e.isDynamic())).toBe(true)
        })
    })
})
