// SPDX-License-Identifier: GPL-3.0-only
// The Add menu: measures (insert-measure, append-measure, the dialog actions = addMeasures), frames (insert/append
// hbox, vbox, text and fretboard diagram legend frames), add-fretboard-diagram and custom tuplets (MuseScore's
// NotationInteraction::addBoxes, addFretboardDiagram; TupletDialog -> custom-tuplet).
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
    AddBoxesTarget, TupletBracketType, TupletNumberType, addCustomTuplet, addMeasures, canAddCustomTuplet, createScore,
    customTupletDefaults, defaultNewScoreOptions, executeAction, isActionEnabled, layoutScore, loadScore, redo, undo,
    type MasterScore,
} from '../src/index'
import { ElementType } from '../src/engraving/types/types'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import type { EngravingItem } from '../src/engraving/dom/engravingitem'
import type { FretDiagram } from '../src/engraving/dom/fret'
import type { Harmony } from '../src/engraving/dom/harmony'
import type { MeasureBase } from '../src/engraving/dom/measurebase'
import type { Tuplet } from '../src/engraving/dom/tuplet'
import { ROOT, hasSubmodule, initFonts, scoreHash } from './helpers'

function measureBases(score: MasterScore): MeasureBase[] {
    const res: MeasureBase[] = []
    for (let mb = score.measures().first(); mb; mb = mb.next()) {
        res.push(mb)
    }
    return res
}

function nmeasures(score: MasterScore): number {
    return measureBases(score).filter(mb => mb.isMeasure()).length
}

function types(score: MasterScore): ElementType[] {
    return measureBases(score).map(mb => mb.type())
}

function newScore(): MasterScore {
    const score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'piano' }], measures: 4 })
    layoutScore(score)
    return score
}

describe('Add > Measures and Frames', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('inserts one measure before the selection and appends one at the end; undoable', () => {
        const score = newScore()
        const n = nmeasures(score)
        expect(isActionEnabled(score, 'insert-measure')).toBe(false) // needs a selection
        expect(isActionEnabled(score, 'append-measure')).toBe(true)

        const second = score.firstMeasure()!.nextMeasure()!
        score.select(second, SelectType.RANGE, 0)
        const before = scoreHash(score)
        expect(executeAction(score, 'insert-measure')).toBe(true)
        expect(nmeasures(score)).toBe(n + 1)
        // the new measure is selected (a range of one measure) and is before the old second measure
        expect(score.selection().isRange()).toBe(true)
        expect(score.selection().startSegment()!.measure().nextMeasure()).toBe(second)
        const after = scoreHash(score)
        undo(score)
        expect(nmeasures(score)).toBe(n)
        expect(scoreHash(score)).toBe(before)
        redo(score)
        expect(scoreHash(score)).toBe(after)

        expect(executeAction(score, 'append-measure')).toBe(true)
        expect(nmeasures(score)).toBe(n + 2)
        expect(score.lastMeasure()!.selected() || score.selection().startSegment()!.measure() === score.lastMeasure()).toBe(true)
    })

    it('inserts a number of measures before/after the selection, at the start and at the end (one undo step each)', () => {
        const score = newScore()
        const n = nmeasures(score)
        expect(addMeasures(score, 2, AddBoxesTarget.BeforeSelection)).toBe(false) // needs a selection

        expect(addMeasures(score, 3, AddBoxesTarget.AtEndOfScore)).toBe(true)
        expect(nmeasures(score)).toBe(n + 3)
        // the added measures are selected
        const sel = score.selection()
        expect(sel.isRange()).toBe(true)
        expect(sel.startSegment()!.measure().no()).toBe(n)
        undo(score)
        expect(nmeasures(score)).toBe(n)

        expect(addMeasures(score, 2, AddBoxesTarget.AtStartOfScore)).toBe(true)
        expect(nmeasures(score)).toBe(n + 2)
        expect(score.selection().startSegment()!.measure()).toBe(score.firstMeasure())
        undo(score)

        const first = score.firstMeasure()!
        score.select(first, SelectType.RANGE, 0)
        expect(addMeasures(score, 2, AddBoxesTarget.AfterSelection)).toBe(true)
        expect(nmeasures(score)).toBe(n + 2)
        expect(first.nextMeasure()!.selected() || score.selection().startSegment()!.measure() === first.nextMeasure()).toBe(true)
    })

    it('inserts frames before the selection and appends them at the end', () => {
        const score = newScore()
        const t0 = types(score)
        const first = score.firstMeasure()!
        score.select(first, SelectType.RANGE, 0)
        expect(executeAction(score, 'insert-hbox')).toBe(true)
        expect(first.prev()!.type()).toBe(ElementType.HBOX)
        // the frame is selected
        expect(score.selection().element()).toBe(first.prev())
        undo(score)
        expect(types(score)).toEqual(t0)

        for (const [code, type] of [
            ['append-vbox', ElementType.VBOX], ['append-textframe', ElementType.TBOX], ['append-hbox', ElementType.HBOX],
            ['append-fretframe', ElementType.FBOX],
        ] as const) {
            expect(executeAction(score, code)).toBe(true)
            expect(score.measures().last()!.type()).toBe(type)
        }
        expect(types(score)).toEqual([...t0, ElementType.VBOX, ElementType.TBOX, ElementType.HBOX, ElementType.FBOX])
    })
})

const CHORDSYMBOL_DATA = `${ROOT}MuseScore/src/engraving/tests/chordsymbol_data/`

describe.skipIf(!hasSubmodule)('Add > Chords and fretboard diagrams', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('adds a fretboard diagram to the selected chord symbol, which becomes its harmony; undoable', () => {
        const score = loadScore(readFileSync(`${CHORDSYMBOL_DATA}realize.mscx`))
        layoutScore(score)
        let harmony: Harmony | null = null
        for (let s = score.firstSegment(SegmentType.ChordRest); s && !harmony; s = s.next1(SegmentType.ChordRest)) {
            const h = s.annotations().find(a => a.isHarmony())
            if (h) {
                harmony = h as unknown as Harmony
            }
        }
        expect(harmony).not.toBeNull()
        const h = harmony!
        const segment = h.explicitParent()

        // nothing to do without a chord symbol
        score.select(null)
        const before = scoreHash(score)
        expect(executeAction(score, 'add-fretboard-diagram')).toBe(true)
        expect(scoreHash(score)).toBe(before)

        score.select(h as unknown as EngravingItem, SelectType.SINGLE, 0)
        expect(executeAction(score, 'add-fretboard-diagram')).toBe(true)
        const fd = h.explicitParent() as unknown as FretDiagram
        expect((fd as unknown as EngravingItem).isFretDiagram()).toBe(true)
        expect(fd.harmony()).toBe(h)
        expect((fd as unknown as EngravingItem).explicitParent()).toBe(segment)
        expect(score.selection().element()).toBe(fd)
        // the diagram of the chord (MuseScore's harmony to diagram data): some dots or markers
        expect(fd.strings()).toBeGreaterThan(0)

        undo(score)
        expect(h.explicitParent()).toBe(segment)
        score.select(null)
        expect(scoreHash(score)).toBe(before)
    })
})

describe('Add > Tuplets > Other…', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('creates a tuplet with the ratio and the formats of the dialog', () => {
        const score = newScore()
        expect(canAddCustomTuplet(score)).toBe(false)
        const rest = score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0)!
        score.select(rest, SelectType.SINGLE, 0)
        expect(canAddCustomTuplet(score)).toBe(true)
        const defaults = customTupletDefaults(score)
        expect(defaults.numberType).toBe(TupletNumberType.SHOW_NUMBER)
        expect(defaults.bracketType).toBe(TupletBracketType.AUTO_BRACKET)

        expect(addCustomTuplet(score, 5, 4, TupletNumberType.SHOW_RELATION, TupletBracketType.SHOW_BRACKET)).toBe(true)
        let tuplet: Tuplet | null = null
        score.scanElements(e => {
            if (!tuplet && e.isTuplet()) {
                tuplet = e as unknown as Tuplet
            }
        })
        const t = tuplet! as Tuplet
        expect(t).not.toBeNull()
        expect(t.ratio().numerator()).toBe(5)
        expect(t.ratio().denominator()).toBe(4)
        expect(t.numberType()).toBe(TupletNumberType.SHOW_RELATION)
        expect(t.bracketType()).toBe(TupletBracketType.SHOW_BRACKET)
    })
})
