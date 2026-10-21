// SPDX-License-Identifier: GPL-3.0-only
// Note input (NotationNoteInput, Score.cmdAddPitch/putNote/setNoteRest/padToggle) and the cmd.cpp editing commands
// (upDown, changeAccidental, changeCRlen): results in the DOM, undo restores the rendering, redo repeats it.
import { beforeAll, describe, expect, it } from 'vitest'
import { createScore, defaultNewScoreOptions, type MasterScore } from '../src/index'
import { NotationInteraction } from '../src/notation/internal/notationinteraction'
import { NoteAddingMode } from '../src/notation/notationtypes'
import { Pad } from '../src/engraving/dom/score'
import { SegmentType } from '../src/engraving/dom/segment'
import { SelectType } from '../src/engraving/dom/select'
import { UpDownMode } from '../src/engraving/dom/mscore'
import { AccidentalType } from '../src/engraving/dom/accidentaldata'
import { TDuration } from '../src/engraving/dom/durationtype'
import { DurationType } from '../src/engraving/types/types'
import type { Chord } from '../src/engraving/dom/chord'
import type { ChordRest } from '../src/engraving/dom/chordrest'
import type { Measure } from '../src/engraving/dom/measure'
import { initFonts, scoreHash } from './helpers'

/** the chords/rests of track 0 of a measure: "C4/4", "r/4", ... (pitch names of all notes, duration) */
function contents(m: Measure, track = 0): string[] {
    const res: string[] = []
    for (let s = m.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
        const e = s.element(track) as unknown as ChordRest | null
        if (!e) {
            continue
        }
        const f = e.ticks().reduced()
        const d = `${f.numerator()}/${f.denominator()}`
        if (e.isChord()) {
            res.push(`${(e as Chord).notes().map(n => n.pitch()).join('+')}:${d}`)
        } else {
            res.push(`r:${d}`)
        }
    }
    return res
}

/** C=0 ... B=6 */
function noteStep(interaction: NotationInteraction, step: number, add = false): void {
    const params = interaction.score().resolveNoteInputParams(step, add)!
    interaction.noteInput().addNote(params, add ? NoteAddingMode.CurrentChord : NoteAddingMode.NextChord)
}

describe('note input', () => {
    let score: MasterScore
    let interaction: NotationInteraction

    beforeAll(async () => {
        await initFonts()
    })

    function newScore(): void {
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
        interaction = new NotationInteraction(score)
    }

    it('enters notes by note name (C D E) with the default quarter duration', () => {
        newScore()
        const m1 = score.firstMeasure()!
        interaction.select([m1.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        const before = scoreHash(score) // after selecting (selected elements are painted last)
        expect(interaction.noteInput().isNoteInputMode()).toBe(true)
        expect(score.inputState().duration().equals(new TDuration(DurationType.V_QUARTER))).toBe(true)

        noteStep(interaction, 0) // C
        noteStep(interaction, 1) // D
        noteStep(interaction, 2) // E
        expect(contents(m1)).toEqual(['72:1/4', '74:1/4', '76:1/4', 'r:1/4'])
        // the cursor is on the rest after E
        expect(score.inputState().cr()?.tick().ticks()).toBe(3 * 480)
        expect(interaction.noteInput().cursorRect().isValid()).toBe(true)
        expect(score.undoStack().size()).toBe(3)

        const edited = scoreHash(score)
        for (let i = 0; i < 3; ++i) {
            interaction.undo()
        }
        expect(contents(m1)).toEqual(['r:1/1'])
        expect(scoreHash(score)).toBe(before)
        for (let i = 0; i < 3; ++i) {
            interaction.redo()
        }
        expect(contents(m1)).toEqual(['72:1/4', '74:1/4', '76:1/4', 'r:1/4'])
        expect(scoreHash(score)).toBe(edited)
    })

    it('chooses the octave nearest to the previous note, adds notes to the chord (Shift)', () => {
        newScore()
        const m1 = score.firstMeasure()!
        interaction.select([m1.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        noteStep(interaction, 0) // C5 (treble clef: C 72)
        noteStep(interaction, 6) // B: nearest to C5 is B4
        noteStep(interaction, 2, true) // add E above B4
        expect(contents(m1)).toEqual(['72:1/4', '71+76:1/4', 'r:1/2'])
    })

    it('sets the duration with the pad (8th, dot) and enters rests', () => {
        newScore()
        const m1 = score.firstMeasure()!
        interaction.select([m1.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        interaction.noteInput().padNote(Pad.NOTE8)
        noteStep(interaction, 4) // G
        interaction.noteInput().padNote(Pad.NOTE4)
        interaction.noteInput().padNote(Pad.DOT)
        noteStep(interaction, 5) // A
        interaction.noteInput().padNote(Pad.NOTE4)
        interaction.noteInput().padNote(Pad.REST) // rest mode
        expect(score.inputState().rest()).toBe(true)
        noteStep(interaction, 0) // a note name ends the rest mode (Score::cmdAddPitch)
        expect(score.inputState().rest()).toBe(false)
        // G and A nearest to the treble clef's C5
        expect(contents(m1)).toEqual(['67:1/8', '69:3/8', '72:1/4', 'r:1/4'])
    })

    it('ties a note into the next measure when it does not fit', () => {
        newScore()
        const m1 = score.firstMeasure()!
        interaction.select([m1.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        interaction.noteInput().padNote(Pad.NOTE2)
        interaction.noteInput().padNote(Pad.DOT)
        noteStep(interaction, 0)
        interaction.noteInput().padNote(Pad.NOTE2)
        noteStep(interaction, 1) // half note at beat 4: 1/4 + tied 1/4
        expect(contents(m1)).toEqual(['72:3/4', '74:1/4'])
        const m2 = m1.nextMeasure()!
        expect(contents(m2)[0]).toBe('74:1/4')
        const n = (m1.first(SegmentType.ChordRest)!.next(SegmentType.ChordRest)!.element(0) as unknown as Chord).notes()[0]
        expect(n.tieFor()?.endNote()?.chord().measure()).toBe(m2)
    })

    it('ends note input', () => {
        newScore()
        interaction.select([score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        interaction.noteInput().endNoteInput()
        expect(interaction.noteInput().isNoteInputMode()).toBe(false)
        expect(interaction.noteInput().cursorRect().isValid()).toBe(false)
    })
})

describe('cmd.cpp editing commands', () => {
    let score: MasterScore
    let interaction: NotationInteraction

    beforeAll(async () => {
        await initFonts()
        score = createScore({ ...defaultNewScoreOptions(), instruments: [{ id: 'flute' }], measures: 4 })
        interaction = new NotationInteraction(score)
        // C D E F in measure 1
        interaction.select([score.firstMeasure()!.first(SegmentType.ChordRest)!.element(0)!], SelectType.SINGLE)
        interaction.noteInput().startNoteInput()
        for (const step of [0, 1, 2, 3]) {
            noteStep(interaction, step)
        }
        interaction.noteInput().endNoteInput()
    })

    function chordAt(i: number): Chord {
        let s = score.firstMeasure()!.first(SegmentType.ChordRest)!
        for (let k = 0; k < i; ++k) {
            s = s.next(SegmentType.ChordRest)!
        }
        return s.element(0) as unknown as Chord
    }

    /** runs a command on the selection of the first note, checks undo/redo, returns the measure contents after it */
    function check(cmd: () => void, noteIdx = 0): string[] {
        score.deselectAll()
        score.select(chordAt(noteIdx).upNote(), SelectType.SINGLE)
        const before = scoreHash(score)
        const contentsBefore = contents(score.firstMeasure()!)
        score.startCmd()
        cmd()
        score.endCmd()
        const after = contents(score.firstMeasure()!)
        const edited = scoreHash(score)
        expect(edited).not.toBe(before)
        score.undoRedo(true)
        expect(contents(score.firstMeasure()!)).toEqual(contentsBefore)
        expect(scoreHash(score)).toBe(before)
        score.undoRedo(false)
        expect(scoreHash(score)).toBe(edited)
        score.undoRedo(true)
        return after
    }

    it('moves the pitch up/down (chromatic, octave, diatonic)', () => {
        expect(check(() => score.upDown(true, UpDownMode.CHROMATIC))[0]).toBe('73:1/4')
        expect(check(() => score.upDown(false, UpDownMode.CHROMATIC))[0]).toBe('71:1/4')
        expect(check(() => score.upDown(true, UpDownMode.OCTAVE))[0]).toBe('84:1/4')
        expect(check(() => score.upDown(false, UpDownMode.DIATONIC))[0]).toBe('71:1/4')
        expect(check(() => score.cmdPitchDownOctave())[0]).toBe('60:1/4')
    })

    it('changes accidentals', () => {
        expect(check(() => score.changeAccidental(AccidentalType.SHARP))[0]).toBe('73:1/4')
        expect(check(() => score.changeAccidental(AccidentalType.FLAT))[0]).toBe('71:1/4')
        // a natural on C is a courtesy accidental: same pitch, an accidental is added
        check(() => score.changeAccidental(AccidentalType.NATURAL))
        score.select(chordAt(0).upNote(), SelectType.SINGLE)
        score.startCmd()
        score.changeAccidental(AccidentalType.NATURAL)
        score.endCmd()
        expect(chordAt(0).upNote().accidental()?.accidentalType()).toBe(AccidentalType.NATURAL)
        score.undoRedo(true)
        expect(chordAt(0).upNote().accidental()).toBeNull()
    })

    it('changes the duration of the selection (shorter: filled with rests, longer: following notes removed)', () => {
        expect(check(() => score.changeCRlen(chordAt(0), new TDuration(DurationType.V_EIGHTH)))).toEqual(
            ['72:1/8', 'r:1/8', '74:1/4', '76:1/4', '77:1/4'])
        expect(check(() => score.changeCRlen(chordAt(0), new TDuration(DurationType.V_HALF)))).toEqual(
            ['72:1/2', '76:1/4', '77:1/4'])
        expect(check(() => score.padToggle(Pad.NOTE2))).toEqual(['72:1/2', '76:1/4', '77:1/4'])
    })

    it('toggles visibility', () => {
        check(() => score.cmdToggleVisible())
    })
})
