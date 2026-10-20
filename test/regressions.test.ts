// SPDX-License-Identifier: GPL-3.0-only
// Bugs found by comparing real-world scores with MuseScore 4.7.5.
import { describe, expect, it } from 'vitest'
import { AccidentalType } from '../src/engraving/dom/accidentaldata'
import type { Chord } from '../src/engraving/dom/chord'
import type { Note } from '../src/engraving/dom/note'
import type { Ornament } from '../src/engraving/dom/ornament'
import { Instrument, InstrChannel, StaffName } from '../src/engraving/dom/instrument'
import { Grip } from '../src/engraving/editing/editdata'
import { TConv } from '../src/engraving/types/typesconv'
import { LineType } from '../src/engraving/types/types'
import type { MasterScore } from '../src/index'
import { TEST_FILES, openScore } from './helpers'

const CHOPIN = `${TEST_FILES}/Chopin_-_Nocturne_Op_9_No_2_E_Flat_Major.mscz`

/** notes of the first voice of the top staff in measure `n` (counted from 0, the pickup measure) */
function notesOfMeasure(score: MasterScore, n: number): Note[] {
    let m = score.firstMeasure()
    for (let i = 0; i < n && m; ++i) {
        m = m.nextMeasure()
    }
    const notes: Note[] = []
    for (let s = m!.first(); s; s = s.next()) {
        const el = s.element(0)
        if (el?.isChord()) {
            notes.push(...(el as Chord).notes())
        }
    }
    return notes
}

describe('regressions', () => {
    // Note.clone() shared the accidental with the original: the turn's note below (b flat) turned the
    // natural of the main note into a flat
    it('keeps the user natural of a note with a turn (Chopin op. 9/2, m. 2)', async () => {
        const score = await openScore(CHOPIN)
        const c = notesOfMeasure(score, 2).find(n => n.pitch() === 72)!
        expect(c.accidentalType()).toBe(AccidentalType.NATURAL)

        const ornament = c.chord().articulations().find(a => a.isOrnament()) as Ornament | undefined
        expect(ornament).toBeDefined()
        for (const n of [ornament!.noteAbove(), ornament!.noteBelow()]) {
            if (n?.accidental()) {
                expect(n.accidental()).not.toBe(c.accidental())
            }
        }
    }, 60000)

    it('clones notes with their own accidental, dots and attached elements (C++ copy constructor)', async () => {
        const score = await openScore(CHOPIN)
        const note = notesOfMeasure(score, 2).find(n => n.accidental())!
        const clone = note.clone() as Note
        expect(clone.accidental()).not.toBe(note.accidental())
        expect(clone.accidental()!.accidentalType()).toBe(note.accidental()!.accidentalType())
        expect(clone.accidental()!.parent()).toBe(clone)
        expect(clone.tieBack()).toBeNull()
        for (const [a, b] of clone.el().map((e, i) => [e, note.el()[i]])) {
            expect(a).not.toBe(b)
        }
    }, 60000)

    // read400::TRead::read(SlurTieSegment*): slur user offsets of files before 4.0 are ignored
    it('ignores slur user offsets of 2.x files', async () => {
        const score = await openScore(CHOPIN)
        for (const sp of score.spanner().values()) {
            if (sp.isSlur()) {
                for (const seg of sp.spannerSegments()) {
                    expect((seg as unknown as { ups(g: Grip): { off: { isNull(): boolean } } }).ups(Grip.END).off.isNull()).toBe(true)
                }
            }
        }
    }, 60000)

    // Instrument::updateInstrumentId: old files only have the MusicXML id; the instrument id gives the family,
    // which decides e.g. whether dynamics and hairpins are centered between the staves of a grand staff
    it('recognizes the instrument of old scores', async () => {
        const score = await openScore(CHOPIN)
        const ins = score.parts()[0].instrument()
        expect(ins.id()).toBe('piano')
        expect(ins.family()).toBe('keyboards')
        expect(ins.isNormallyMultiStaveInstrument()).toBe(true)
    }, 60000)

    it('recognizes instrument ids like MuseScore', () => {
        const byXml = (xmlId: string): string => {
            const i = new Instrument()
            i.setMusicXmlId(xmlId)
            i.updateInstrumentId()
            return i.id()
        }
        expect(byXml('keyboard.piano')).toBe('piano')
        expect(byXml('drum.group')).toBe('percussion-synthesizer')
        expect(byXml('mdl.drum.snare-drum')).toBe('marching-snare')

        // no MusicXML id: by name, then by MIDI program
        const byName = new Instrument()
        byName.setTrackName('Flute')
        byName.updateInstrumentId()
        expect(byName.musicXmlId()).toBe('wind.flutes.flute')
        expect(byName.id()).toBe('flute')

        const byProgram = new Instrument()
        byProgram.setTrackName('xyz')
        const ch = new InstrChannel()
        ch.setProgram(40) // violin
        byProgram.appendChannel(ch)
        byProgram.updateInstrumentId()
        expect(byProgram.musicXmlId()).toBe('strings.violin')

        const piano = new Instrument()
        piano.appendLongName(new StaffName('Grand Piano'))
        piano.updateInstrumentId()
        expect(piano.musicXmlId()).toBe('keyboard.piano.grand')
    })

    // hairpins of a grand staff are centered between the staves (MuseScore 4.4+), also in old files
    it('centers hairpins between the staves of a piano', async () => {
        const score = await openScore(CHOPIN)
        const hairpins = score.pages().flatMap(p => p.elements()).filter(e => e.isHairpinSegment())
        expect(hairpins.length).toBeGreaterThan(10)
        // the last hairpin: MuseScore's SVG has it at y 1769..1869 (without line width)
        const last = hairpins[hairpins.length - 1]
        const r = last.ldata().bbox().translated(last.pagePos())
        expect(r.center().y()).toBeCloseTo((1769 + 1869) / 2, -1)
    }, 60000)

    // a ledger line exactly 0.1 sp above an accidental: MuseScore treats it as colliding (rounding tie)
    it('spaces accidentals after ledger lines like MuseScore (Chopin m. 33)', async () => {
        const score = await openScore(CHOPIN)
        let m = score.firstMeasure()!
        for (let i = 0; i < 33; ++i) {
            m = m.nextMeasure()!
        }
        const segs = []
        for (let s = m.first(); s; s = s.next()) {
            if (s.isChordRestType()) {
                segs.push(s)
            }
        }
        // second -> third 32nd: no accidental -> natural; MuseScore: 261.0
        expect(segs[1].width()).toBeCloseTo(261.0, 0)
    }, 60000)

    // TConv::fromXml(LineType): pre-4.0 files store Qt pen styles (2 = DashLine) in styles and line properties
    it('reads line styles of old files as Qt pen styles (ottava dashed)', async () => {
        const score = await openScore(CHOPIN)
        expect(TConv.fromXmlLineType('2', LineType.SOLID)).toBe(LineType.DASHED)
        expect(TConv.fromXmlLineType('3', LineType.SOLID)).toBe(LineType.DOTTED)
        expect(TConv.fromXmlLineType('dotted', LineType.SOLID)).toBe(LineType.DOTTED)
        const ottavas = [...score.spanner().values()].filter(s => s.isOttava())
        expect(ottavas.length).toBeGreaterThan(0)
        for (const o of ottavas) {
            expect((o as unknown as { lineStyle(): LineType }).lineStyle()).toBe(LineType.DASHED)
        }
    }, 60000)
})
