// SPDX-License-Identifier: GPL-3.0-only
// Instrument changes and replaced instruments: MuseScore's instrumentchange_tests (add, delete, change, copy with
// their reference files (testMixer: the patch of the instrument change), compared by the staves of writeMscx), InstrumentChange::setupInstrument through the
// instrument-change-text action (the instrument comes from the select instrument provider), "Replace instrument" and the
// part's sharp/flat preference, which transpose the notes and key signatures (Transpose::transpositionChanged).
import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
    executeAction, layoutScore, loadScore, redo, replacePartInstrument, setPartSharpFlat, setSelectInstrumentProvider, undo,
    writeMscx, type MasterScore,
} from '../src/index'
import { Factory } from '../src/engraving/dom/factory'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { ChangeInstrument } from '../src/engraving/editing/editinstrumentchange'
import { ChangePatch } from '../src/engraving/editing/editpart'
import { Instrument } from '../src/engraving/dom/instrument'
import { ElementType, PreferSharpFlat } from '../src/engraving/types/types'
import type { InstrumentChange } from '../src/engraving/dom/instrchange'
import type { Chord } from '../src/engraving/dom/chord'
import type { KeySig } from '../src/engraving/dom/keysig'
import { ROOT, initFonts, scoreHash } from './helpers'

const TESTS = `${ROOT}MuseScore/src/engraving/tests/`
const DATA = `${TESTS}instrumentchange_data/`
const hasData = existsSync(DATA)

function open(path: string): MasterScore {
    const score = loadScore(readFileSync(path))
    layoutScore(score)
    return score
}

/** the staff contents (<Staff id="n"> sections after the parts) without eids and links */
function staves(mscx: string): string {
    const score = mscx.substring(mscx.indexOf('<Score>'))
    return [...score.matchAll(/\n {4}<Staff id="\d+">[\s\S]*?\n {4}<\/Staff>/g)].map(m => m[0]).join('\n')
        .split('\n').filter(l => !/<eid>|<linkedMain|<linked>/.test(l)).join('\n')
}

function expectRef(score: MasterScore, name: string): void {
    expect(staves(writeMscx(score))).toBe(staves(readFileSync(`${DATA}${name}-ref.mscx`, 'utf8')))
}

function secondMeasureSegment(score: MasterScore) {
    return score.firstMeasure()!.nextMeasure()!.first(SegmentType.ChordRest)!
}

describe.skipIf(!hasData)('instrument changes', () => {
    beforeAll(async () => {
        await initFonts()
    })

    afterEach(() => {
        setSelectInstrumentProvider(null)
    })

    it('adds an instrument change (instrumentchange_tests testAdd)', () => {
        const score = open(`${DATA}add.mscx`)
        const s = secondMeasureSegment(score)
        const ic = Factory.createItem(ElementType.INSTRUMENT_CHANGE, s) as InstrumentChange
        ic.setParent(s)
        ic.setTrack(0)
        ic.setXmlText('Instrument')
        score.startCmd()
        score.undoAddElement(ic)
        score.endCmd()
        expectRef(score, 'add')
    })

    it('deletes an instrument change (testDelete)', () => {
        const score = open(`${DATA}delete.mscx`)
        const ic = secondMeasureSegment(score).annotations()[0]
        score.startCmd()
        score.deleteItem(ic)
        score.endCmd()
        expectRef(score, 'delete')
    })

    it('changes the instrument of an instrument change (testChange)', () => {
        const score = open(`${DATA}change.mscx`)
        const ic = secondMeasureSegment(score).annotations()[0] as unknown as InstrumentChange
        const ni = new Instrument()
        ni.assign(score.staff(1)!.part().instrument())
        ic.setInstrumentPtr(ni)
        score.startCmd()
        ic.setXmlText('Instrument Oboe')
        score.undo(new ChangeInstrument(ic, ic.instrument()))
        score.endCmd()
        expectRef(score, 'change')
    })

    it('changes the patch of an instrument change (testMixer)', () => {
        const score = open(`${DATA}mixer.mscx`)
        const s = secondMeasureSegment(score)
        const ic = s.annotations()[0] as unknown as InstrumentChange
        const idx = score.staff(0)!.channel(s.tick(), 0)
        const c = score.staff(0)!.part().instrument(s.tick()).channel(idx)!
        const mp = { bank: 0, drum: false, name: 'Viola', prog: 41, synti: 'Fluid', sfid: 0 }
        score.startCmd()
        ic.setXmlText('Mixer Viola')
        score.undo(new ChangePatch(score, c, mp))
        score.endCmd()
        expectRef(score, 'mixer')
    })

    it('copies an instrument change (testCopy)', () => {
        const score = open(`${DATA}copy.mscx`)
        const ic = secondMeasureSegment(score).annotations()[0] as unknown as InstrumentChange
        const s = score.firstMeasure()!.nextMeasure()!.nextMeasure()!.first(SegmentType.ChordRest)!
        const nic = ic.clone() as InstrumentChange
        nic.setParent(s)
        nic.setTrack(4)
        score.startCmd()
        score.undoAddElement(nic)
        score.endCmd()
        expectRef(score, 'copy')
    })

    it('adds an instrument change to a transposing instrument (setupInstrument), undoable', () => {
        const score = open(`${DATA}add.mscx`)
        const before = scoreHash(score)
        const part = score.parts()[0]
        expect(part.instrument().transpose().isZero()).toBe(true)
        const s = secondMeasureSegment(score)
        const chord = s.element(0) as unknown as Chord
        const note = chord.notes()[0]
        expect(note.tpc2()).toBe(note.tpc1())

        // without an instrument (MuseScore: the dialog was cancelled) nothing is added
        score.select(chord, SelectType.SINGLE, 0)
        expect(executeAction(score, 'instrument-change-text')).toBe(true)
        expect(s.annotations().some(e => e.isInstrumentChange())).toBe(false)

        setSelectInstrumentProvider(() => 'bb-clarinet')
        score.select(chord, SelectType.SINGLE, 0)
        expect(executeAction(score, 'instrument-change-text')).toBe(true)
        const ic = s.annotations().find(e => e.isInstrumentChange()) as unknown as InstrumentChange
        expect(ic.plainText()).toBe('To Clarinet')
        expect(part.instrument(s.tick()).id()).toBe('bb-clarinet')
        // written a major second higher from here on
        expect(note.tpc2()).not.toBe(note.tpc1())
        const ks = s.measure()!.findSegment(SegmentType.KeySig, s.tick())?.element(0) as unknown as KeySig | null
        expect(ks?.forInstrumentChange()).toBe(true)

        expect(undo(score)).toBe(true)
        expect(note.tpc2()).toBe(note.tpc1())
        score.select(null)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(note.tpc2()).not.toBe(note.tpc1())
    })

    it('replaces the instrument of a part and sets its sharp/flat preference', () => {
        const score = open(`${DATA}add.mscx`)
        const before = scoreHash(score)
        const part = score.parts()[0]
        const note = (secondMeasureSegment(score).element(0) as unknown as Chord).notes()[0]

        expect(replacePartInstrument(score, part.id(), 'bb-clarinet')).toBe(true)
        expect(part.instrument().id()).toBe('bb-clarinet')
        expect(part.partName()).toBe('Clarinet in B♭')
        expect(note.tpc2()).not.toBe(note.tpc1())
        const written = note.tpc2()

        expect(setPartSharpFlat(score, part.id(), PreferSharpFlat.SHARPS)).toBe(true)
        expect(part.preferSharpFlat()).toBe(PreferSharpFlat.SHARPS)
        expect(undo(score)).toBe(true)
        expect(note.tpc2()).toBe(written)

        expect(undo(score)).toBe(true)
        expect(note.tpc2()).toBe(note.tpc1())
        expect(scoreHash(score)).toBe(before)
    })
})
