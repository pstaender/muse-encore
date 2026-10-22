// SPDX-License-Identifier: GPL-3.0-only
// The Staff/Part properties dialog (MuseScore's EditStaff): the values of a staff, apply() as one undo step (staff
// config, instrument, sharp/flat preference), a new transposition transposes the notes, "Replace instrument…" and the
// string data.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createEditStaff, layoutScore, loadScore, redo, undo, type MasterScore } from '../src/index'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { Fraction } from '../src/engraving/types/fraction'
import { AutoOnOff, NoteHeadScheme, PreferSharpFlat, StaffGroup } from '../src/engraving/types/types'
import { StaffType, StaffTypes, TablatureMinimStyle } from '../src/engraving/dom/stafftype'
import { EditStaffType } from '../src/notationscene/editstafftype'
import type { Chord } from '../src/engraving/dom/chord'
import { ROOT, initFonts, scoreHash } from './helpers'

const DATA = `${ROOT}MuseScore/src/engraving/tests/instrumentchange_data/`
const hasData = existsSync(DATA)

function open(): MasterScore {
    const score = loadScore(readFileSync(`${DATA}add.mscx`))
    layoutScore(score)
    return score
}

function firstChord(score: MasterScore): Chord {
    return score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0) as unknown as Chord
}

describe.skipIf(!hasData)('Staff/Part properties', () => {
    beforeAll(async () => {
        await initFonts()
    })

    it('shows the values of the selected staff', () => {
        const score = open()
        expect(createEditStaff(score)).toBeNull() // nothing selected
        score.select(firstChord(score).notes()[0], SelectType.SINGLE, 0)
        const es = createEditStaff(score)!
        expect(es.staff()).toBe(score.staff(0))
        const v = es.values()
        expect(v.lines).toBe(5)
        expect(v.lineDistance).toBe(1)
        expect(v.mag).toBe(100)
        expect(v.longName).toBe('Flute')
        expect(v.intervalIndex).toBe(0)
        expect(v.up).toBe(true)
        expect(es.showPreferSharpFlat()).toBe(false)
        expect(es.instrumentName()).toBe('Flute')
        expect(es.staffGroupName()).toBe('Standard')
        expect(es.hasPreviousStaff()).toBe(false)
        expect(es.hasNextStaff()).toBe(true)
    })

    it('applies the staff properties as one undo step', () => {
        const score = open()
        const before = scoreHash(score)
        score.select(firstChord(score).notes()[0], SelectType.SINGLE, 0)
        const es = createEditStaff(score)!
        es.setValues({ lines: 1, extraDistance: 2, hideSystemBarLine: true, mergeMatchingRests: AutoOnOff.ON, longName: 'Flauto' })
        expect(es.apply()).toBe(true)
        const staff = score.staff(0)!
        expect(staff.staffType(new Fraction(0, 1)).lines()).toBe(1)
        expect(staff.userDist().val()).toBe(2)
        expect(staff.hideSystemBarLine()).toBe(true)
        expect(staff.mergeMatchingRests()).toBe(AutoOnOff.ON)
        expect(staff.part().instrument().nameAsPlainText()).toBe('Flauto')

        expect(undo(score)).toBe(true)
        expect(staff.staffType(new Fraction(0, 1)).lines()).toBe(5)
        expect(staff.part().instrument().nameAsPlainText()).toBe('Flute')
        score.select(null)
        expect(scoreHash(score)).toBe(before)
        expect(redo(score)).toBe(true)
        expect(staff.staffType(new Fraction(0, 1)).lines()).toBe(1)
    })

    it('transposes the notes for a new transposition and sets the sharp/flat preference', () => {
        const score = open()
        const note = firstChord(score).notes()[0]
        score.select(note, SelectType.SINGLE, 0)
        const es = createEditStaff(score)!
        // major second down (written to sounding): a B♭ instrument
        es.setValues({ intervalIndex: 4, up: false, preferSharpFlat: PreferSharpFlat.FLATS })
        expect(es.showPreferSharpFlat()).toBe(true)
        expect(es.apply()).toBe(true)
        const part = score.staff(0)!.part()
        expect(part.instrument().transpose().chromatic).toBe(-2)
        expect(part.preferSharpFlat()).toBe(PreferSharpFlat.FLATS)
        expect(note.tpc2()).not.toBe(note.tpc1())
        expect(undo(score)).toBe(true)
        expect(part.instrument().transpose().chromatic).toBe(0)
        expect(note.tpc2()).toBe(note.tpc1())
    })

    it('replaces the instrument and edits the string data', () => {
        const score = open()
        score.select(firstChord(score).notes()[0], SelectType.SINGLE, 0)
        const es = createEditStaff(score)!
        expect(es.replaceInstrument('guitar-steel')).toBe(true)
        expect(es.values().longName).toBe('Acoustic Guitar')
        expect(es.strings().length).toBe(6)
        // a seventh string, a fourth below the lowest
        const strings = [{ pitch: es.strings()[0].pitch - 5, open: false }, ...es.strings()]
        es.setStringData(es.frets(), strings)
        expect(es.strings().length).toBe(7)
        expect(es.values().minPitchA).toBe(strings[0].pitch)
        expect(es.apply()).toBe(true)
        const instrument = score.staff(0)!.part().instrument()
        expect(instrument.id()).toBe('guitar-steel')
        expect(instrument.stringData().strings()).toBe(7)
    })

    it('edits the staff type ("Advanced style properties") and applies it with the staff', () => {
        const score = open()
        score.select(firstChord(score).notes()[0], SelectType.SINGLE, 0)
        const es = createEditStaff(score)!
        const est = es.createEditStaffType()
        expect(est.values().group).toBe(StaffGroup.STANDARD)
        expect(est.templates().map(t => t.name)).toContain('Standard')
        est.set({ noteHeadScheme: NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN, showLedgerLinesPitched: false })
        es.setStaffType(est.getStaffType())
        expect(es.apply()).toBe(true)
        const st = score.staff(0)!.staffType(new Fraction(0, 1))
        expect(st.noteHeadScheme()).toBe(NoteHeadScheme.HEAD_SHAPE_NOTE_7_AIKIN)
        expect(st.showLedgerLines()).toBe(false)
        expect(undo(score)).toBe(true)
        expect(score.staff(0)!.staffType(new Fraction(0, 1)).noteHeadScheme()).toBe(NoteHeadScheme.HEAD_NORMAL)
    })

    it('keeps the tablature options compatible and resets to a template', () => {
        const est = new EditStaffType(StaffType.preset(StaffTypes.TAB_6COMMON), null)
        expect(est.values().group).toBe(StaffGroup.TAB)
        est.set({ noteValues: 'stems', minimStyle: TablatureMinimStyle.SHORTER })
        expect(est.enabled().stemThrough).toBe(false)
        // "stems through" moves "minim short" to "minim slashed"
        est.set({ stemThrough: true })
        expect(est.values().minimStyle).toBe(TablatureMinimStyle.SLASHED)
        expect(est.enabled().stemAboveBelow).toBe(false)
        const st = est.getStaffType()
        expect(st.stemless()).toBe(false)
        expect(st.genDurations()).toBe(false)
        expect(st.stemThrough()).toBe(true)
        // a font sets its default size
        est.set({ fretFontIdx: 1 })
        expect(est.values().fretFontSize).toBe(StaffType.tabFontData(false, 1)!.size)
        est.resetToTemplate(StaffTypes.TAB_6SIMPLE)
        expect(est.values().noteValues).toBe('none')
    })
})
