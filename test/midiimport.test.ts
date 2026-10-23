// SPDX-License-Identifier: GPL-3.0-only
// The MIDI import (src/importexport/midi/internal/midiimport): MuseScore/src/importexport/midi/tests/midiimport_tests.cpp.
// The files of midiimport_data/*.mid are imported with the operations of the C++ tests and the parts and staves of
// writeMscx are compared with the reference files *-ref.mscx (without eids); plus the unit tests of the chord search,
// tuplet detection, quantization and meter functions and the reading of bad SysEx events.
import { existsSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { importScore, layoutScore, writeMscx, type MasterScore } from '../src/index'
import { MasterScore as MasterScoreClass } from '../src/engraving/dom/masterscore'
import { SegmentType } from '../src/engraving/dom/segment'
import type { Chord } from '../src/engraving/dom/chord'
import { Constants } from '../src/engraving/types/constants'
import { Err } from '../src/engraving/engravingerrors'
import { importMidi } from '../src/importexport/midi/internal/midiimport/importmidi'
import {
    CurrentMidiFileSetter, CurrentTrackSetter, midiImportOperations, type FileData,
} from '../src/importexport/midi/internal/midiimport/importmidi_operations'
import { QuantValue, Swing, VoiceCount } from '../src/importexport/midi/internal/midiimport/importmidi_operation'
import { ReducedFraction } from '../src/importexport/midi/internal/midiimport/importmidi_fraction'
import { MidiChord, MidiNote, newChordMap } from '../src/importexport/midi/internal/midiimport/importmidi_chord'
import { findEndChordInRange, findFirstChordInRange } from '../src/importexport/midi/internal/midiimport/importmidi_chord'
import { TUPLET_BOUNDARY_LEVEL, TupletInfo, type DivisionInfo } from '../src/importexport/midi/internal/midiimport/importmidi_inner'
import { TupletData, splitFirstTupletChords } from '../src/importexport/midi/internal/midiimport/importmidi_tuplet'
import {
    findTupletApproximation, findTupletNumbers, isTupletAllowed,
} from '../src/importexport/midi/internal/midiimport/importmidi_tuplet_detect'
import { findLongestUncommonGroup } from '../src/importexport/midi/internal/midiimport/importmidi_tuplet_filter'
import { findOnTimeQuantError } from '../src/importexport/midi/internal/midiimport/importmidi_quant'
import {
    findMaxLevelBetween, isSimpleNoteDuration, maxLevelBetween, metricDivisionsOfBar, metricDivisionsOfTuplet,
} from '../src/importexport/midi/internal/midiimport/importmidi_meter'
import { ROOT, initFonts } from './helpers'

const DATA = `${ROOT}MuseScore/src/importexport/midi/tests/midiimport_data/`
const hasData = existsSync(DATA)

const RF = (z: number, n: number): ReducedFraction => new ReducedFraction(z, n)
const fromTicks = (t: number): ReducedFraction => ReducedFraction.fromTicks(t)

function midiFilePath(file: string): string {
    return `${DATA}${file}.mid`
}

/** the parts and staves of an .mscx file without eids and links (the style differs: the C++ tests use a test style) */
function partsAndStaves(mscx: string): string {
    const start = mscx.indexOf('\n    <Part')
    const end = mscx.indexOf('\n    </Score>')
    return mscx.substring(start, end)
        .split('\n')
        // the C++ tests run in MScore::testMode (no <synti>; the generated beams are written with their layout
        // positions l1/l2)
        .filter(l => !/<eid>|<linkedMain|<linked>|<synti>/.test(l))
        .join('\n')
        .replace(/\n *<Beam>(\n *<l[12]>-?\d+<\/l[12]>)*\n *<\/Beam>/g, '')
}

/** C++ ScoreRW::readScore with importMidi: a new score, the import, the layout */
function importMidiFile(path: string): { score: MasterScore | null, err: Err } {
    const score = new MasterScoreClass()
    score.checkChordList()
    const err = importMidi(score, readFileSync(path), path)
    if (err !== Err.NoError) {
        return { score: null, err }
    }
    layoutScore(score)
    return { score, err }
}

function importThenCompareWithRef(file: string): void {
    const { score } = importMidiFile(midiFilePath(file))
    expect(score).toBeTruthy()
    const ref = readFileSync(`${DATA}${file}-ref.mscx`, 'utf8')
    expect(partsAndStaves(writeMscx(score!))).toBe(partsAndStaves(ref))
}

/** the operations of a MIDI file set before its import (C++ addNewMidiFile + CurrentMidiFileSetter) */
function withOpers(file: string, f: (data: FileData) => void): void {
    const opers = midiImportOperations
    opers.addNewMidiFile(midiFilePath(file))
    const setter = new CurrentMidiFileSetter(opers, midiFilePath(file))
    try {
        f(opers.data())
    } finally {
        setter.restore()
    }
}

function dontSimplify(file: string): void {
    withOpers(file, (data) => {
        data.trackOpers.simplifyDurations.setDefaultValue(false, false)
        data.trackOpers.maxVoiceCount.setDefaultValue(VoiceCount.V_1, false)
        data.trackOpers.doStaffSplit.setDefaultValue(false, false)
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

function noTempoText(file: string): void {
    withOpers(file, (data) => {
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

function staffSplit(file: string): void {
    withOpers(file, (data) => {
        data.trackOpers.doStaffSplit.setDefaultValue(true, false)
        data.trackOpers.simplifyDurations.setDefaultValue(false, false)
        data.trackOpers.maxVoiceCount.setDefaultValue(VoiceCount.V_1, false)
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

function simplification(file: string): void {
    withOpers(file, (data) => {
        data.trackOpers.doStaffSplit.setDefaultValue(false, false)
        data.trackOpers.simplifyDurations.setDefaultValue(true, false)
        data.trackOpers.maxVoiceCount.setDefaultValue(VoiceCount.V_1, false)
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

function voiceSeparation(file: string, simplify = false): void {
    withOpers(file, (data) => {
        data.trackOpers.doStaffSplit.setDefaultValue(false, false)
        data.trackOpers.simplifyDurations.setDefaultValue(simplify, false)
        data.trackOpers.maxVoiceCount.setDefaultValue(VoiceCount.V_4, false)
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

function quant(file: string, value: QuantValue): void {
    withOpers(file, (data) => {
        data.trackOpers.quantValue.setDefaultValue(value, false)
    })
}

function swing(file: string, swingType: Swing, changeClef = false): void {
    withOpers(file, (data) => {
        data.trackOpers.swing.setDefaultValue(swingType, false)
        if (changeClef) {
            data.trackOpers.changeClef.setDefaultValue(true, false)
        }
        data.trackOpers.doStaffSplit.setDefaultValue(false, false)
        data.trackOpers.simplifyDurations.setDefaultValue(false, false)
        data.trackOpers.maxVoiceCount.setDefaultValue(VoiceCount.V_1, false)
        data.trackOpers.showTempoText.setDefaultValue(false)
    })
    importThenCompareWithRef(file)
}

/** Counts every note head in the score, across all staves and voices. */
function noteCount(score: MasterScore): number {
    let count = 0
    for (let seg = score.firstSegment(SegmentType.ChordRest); seg; seg = seg.next1(SegmentType.ChordRest)) {
        for (const item of seg.elist()) {
            if (item && item.isChord()) {
                count += (item as Chord).notes().length
            }
        }
    }
    return count
}

describe.skipIf(!hasData)('MIDI import (MuseScore midiimport_tests)', () => {
    beforeAll(async () => {
        await initFonts()
    })

    // the reference files of the C++ tests
    const refTests: [string, () => void][] = [
        ['m1', () => dontSimplify('m1')],
        // tie across bar line
        ['m2', () => dontSimplify('m2')],
        // voices, typeA, resolve with tie
        ['m3', () => dontSimplify('m3')],
        // voices, typeB, resolve with tie
        ['m4', () => dontSimplify('m4')],
        // same as m1 with division 240
        ['m5', () => dontSimplify('m5')],
        // quantization: 1/4 quantization should preserve 4th dotted note
        ['quantDotted4th', () => { quant('quant_dotted_4th', QuantValue.Q_4); dontSimplify('quant_dotted_4th') }],
        // human-performed (unaligned) files
        ['human4_4', () => dontSimplify('human_4-4')],
        ['humanTempo', () => importThenCompareWithRef('human_tempo')],
        // chord detection
        ['chordSmallError', () => noTempoText('chord_small_error')],
        ['chordBigError', () => noTempoText('chord_big_error')],
        ['chordLegato', () => noTempoText('chord_legato')],
        ['chordCollect', () => noTempoText('chord_collect')],
        // very short note - don't remove note but show it with min allowed duration (1/128)
        ['chordVeryShort', () => dontSimplify('chord_1_tick_long')],
        // test scores for meter (duration subdivision)
        ['meterTimeSig4_4', () => dontSimplify('meter_4-4')],
        ['metertimeSig9_8', () => dontSimplify('meter_9-8')],
        ['metertimeSig12_8', () => dontSimplify('meter_12-8')],
        ['metertimeSig15_8', () => dontSimplify('meter_15-8')],
        ['meterCentralLongNote', () => dontSimplify('meter_central_long_note')],
        ['meterCentralLongRest', () => dontSimplify('meter_central_long_rest')],
        ['meterChordExample', () => dontSimplify('meter_chord_example')],
        ['meterDotsExample1', () => dontSimplify('meter_dots_example1')],
        ['meterDotsExample2', () => dontSimplify('meter_dots_example2')],
        ['meterDotsExample3', () => dontSimplify('meter_dots_example3')],
        ['meterHalfRest3_4', () => dontSimplify('meter_half_rest_3-4')],
        ['meterFirst2_8thRestsCompound', () => dontSimplify('meter_first_2_8th_rests_compound')],
        ['meterLastQuarterRestCompound', () => dontSimplify('meter_last_quarter_rest_compound')],
        ['meterRests', () => dontSimplify('meter_rests')],
        ['meterTwoBeatsOver', () => dontSimplify('meter_two_beats_over')],
        ['meterDotTie', () => dontSimplify('meter_dot_tie')],
        // time sig
        ['timesigChanges', () => dontSimplify('timesig_changes')],
        // test scores for tuplets
        ['tuplet2Voices3_5Tuplets', () => {
            // requires 1/32 quantization
            withOpers('tuplet_2_voices_3_5_tuplets', (data) => {
                data.trackOpers.quantValue.setDefaultValue(QuantValue.Q_32, false)
                data.trackOpers.showTempoText.setDefaultValue(false)
            })
            importThenCompareWithRef('tuplet_2_voices_3_5_tuplets')
        }],
        ['tuplet2VoicesTupletNon', () => noTempoText('tuplet_2_voices_tuplet_non')],
        ['tuplet3_5_7tuplets', () => {
            withOpers('tuplet_3_5_7_tuplets', (data) => {
                data.trackOpers.changeClef.setDefaultValue(false, false)
                data.trackOpers.doStaffSplit.setDefaultValue(false, false)
                data.trackOpers.simplifyDurations.setDefaultValue(false, false)
                data.trackOpers.showTempoText.setDefaultValue(false)
            })
            importThenCompareWithRef('tuplet_3_5_7_tuplets')
        }],
        ['tuplet5_5TupletsRests', () => dontSimplify('tuplet_5_5_tuplets_rests')],
        ['tuplet3_4', () => dontSimplify('tuplet_3-4')],
        ['tupletDuplet', () => dontSimplify('tuplet_duplet')],
        ['tupletMars', () => dontSimplify('tuplet_mars')],
        // requires 1/64 quantization
        ['tupletNonuplet3_4', () => { quant('tuplet_nonuplet_3-4', QuantValue.Q_64); dontSimplify('tuplet_nonuplet_3-4') }],
        ['tupletNonuplet4_4', () => { quant('tuplet_nonuplet_4-4', QuantValue.Q_64); dontSimplify('tuplet_nonuplet_4-4') }],
        ['tupletQuadruplet', () => dontSimplify('tuplet_quadruplet')],
        ['tupletSeptuplet', () => dontSimplify('tuplet_septuplet')],
        ['tupletTripletsMixed', () => dontSimplify('tuplet_triplets_mixed')],
        ['tupletTriplet', () => dontSimplify('tuplet_triplet')],
        ['tupletTripletFirstTied', () => dontSimplify('tuplet_triplet_first_tied')],
        ['tupletTripletFirstTied2', () => dontSimplify('tuplet_triplet_first_tied2')],
        ['tupletTripletLastTied', () => dontSimplify('tuplet_triplet_last_tied')],
        // requires 1/32 quantization
        ['tupletTied3_5', () => { quant('tuplet_tied_3_5_tuplets', QuantValue.Q_32); dontSimplify('tuplet_tied_3_5_tuplets') }],
        ['tupletTied3_5_2', () => { quant('tuplet_tied_3_5_tuplets2', QuantValue.Q_32); dontSimplify('tuplet_tied_3_5_tuplets2') }],
        ['tupletOffTimeOtherBar', () => dontSimplify('tuplet_off_time_other_bar')],
        ['tupletOffTimeOtherBar2', () => dontSimplify('tuplet_off_time_other_bar2')],
        ['tuplet16th8th', () => dontSimplify('tuplet_16th_8th')],
        ['tuplet7Staccato', () => noTempoText('tuplet_7_staccato')],
        ['minDuration', () => dontSimplify('min_duration')],
        ['pickupMeasure', () => dontSimplify('pickup')],
        ['pickupMeasureLong', () => noTempoText('pickup_long')],
        ['pickupMeasureTurnOff', () => noTempoText('pickup_turn_off')],
        // LH/RH separation
        ['LHRH_Nontuplet', () => staffSplit('split_nontuplet')],
        ['LHRH_Acid', () => staffSplit('split_acid')],
        ['LHRH_Tuplet', () => staffSplit('split_tuplet')],
        ['LHRH_2melodies', () => staffSplit('split_2_melodies')],
        ['LHRH_octave', () => staffSplit('split_octave')],
        // swing
        ['swingTriplets', () => swing('swing_triplets', Swing.SWING)],
        ['swingShuffle', () => swing('swing_shuffle', Swing.SHUFFLE)],
        ['swingClef', () => swing('swing_clef', Swing.SWING, true)],
        // percussion
        ['percDrums', () => noTempoText('perc_drums')],
        ['percRemoveTies', () => noTempoText('perc_remove_ties')],
        ['percNoGrandStaff', () => noTempoText('perc_no_grand_staff')],
        ['percTriplet', () => noTempoText('perc_triplet')],
        ['percRespectBeat', () => noTempoText('perc_respect_beat')],
        ['percTupletVoice', () => noTempoText('perc_tuplet_voice')],
        ['percTupletSimplify', () => noTempoText('perc_tuplet_simplify')],
        ['percTupletSimplify2', () => noTempoText('perc_tuplet_simplify2')],
        ['percShortNotes', () => noTempoText('perc_short_notes')],
        // clef changes along the score
        ['clefTied', () => dontSimplify('clef_tied')],
        ['clefMelody', () => dontSimplify('clef_melody')],
        ['clefPrev', () => dontSimplify('clef_prev')],
        // duration simplification
        ['simplify16thStaccato', () => simplification('simplify_16th_staccato')],
        ['simplify8thDont', () => simplification('simplify_8th_dont')],
        ['simplify32ndStaccato', () => simplification('simplify_32nd_staccato')],
        ['simplify8thDottedNoStaccato', () => simplification('simplify_8th_dotted_no_staccato')],
        ['simplify4thDottedTied', () => simplification('simplify_4th_dotted_tied')],
        ['simplifyTripletStaccato', () => simplification('simplify_triplet_staccato')],
        ['simplifyDotted3_4', () => simplification('simplify_dotted_3-4')],
        ['simplifyStaccato9_8', () => simplification('simplify_staccato_9-8')],
        // voice separation
        ['voiceSeparationAcid', () => voiceSeparation('voice_acid')],
        ['voiceSeparationIntersect', () => voiceSeparation('voice_intersect')],
        ['voiceSeparationTuplet', () => voiceSeparation('voice_tuplet', true)],
        ['voiceSeparationCentral', () => voiceSeparation('voice_central')],
        // division (fps and ticks per frame case)
        ['division', () => importThenCompareWithRef('division')],
        // MIDI instruments and Grand Staff
        ['instrumentGrand', () => importThenCompareWithRef('instrument_grand')],
        ['instrumentGrand2', () => importThenCompareWithRef('instrument_grand2')],
        ['instrumentChannels', () => importThenCompareWithRef('instrument_channels')],
        ['instrument3StaffOrgan', () => importThenCompareWithRef('instrument_3staff_organ')],
        ['instrumentClef', () => noTempoText('instrument_clef')],
        // lyrics
        ['lyricsTime0', () => noTempoText('lyrics_time_0')],
        ['lyricsVoice1', () => noTempoText('lyrics_voice_1')],
    ]

    for (const [name, f] of refTests) {
        it(name, f)
    }

    // the SysEx length guard in MidiFile::readEvent(): the import succeeds, but the track parsing stops at the
    // rejected SysEx event
    it('sysexZeroLength', () => {
        const { score, err } = importMidiFile(midiFilePath('sysex_zero_len'))
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(1)
        expect(noteCount(score!)).toBe(3)
    })

    it('sysexNegativeLength', () => {
        const { score, err } = importMidiFile(midiFilePath('sysex_negative_len'))
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(1)
        expect(noteCount(score!)).toBe(3)
    })

    it('sysexGuardBaseline', () => {
        const { score, err } = importMidiFile(midiFilePath('m1'))
        expect(err).toBe(Err.NoError)
        expect(score!.nstaves()).toBe(2)
        expect(noteCount(score!)).toBe(7)
    })

    it('importScore (File > Open) of a MIDI file', async () => {
        const score = await importScore(readFileSync(midiFilePath('m1')), 'm1.mid')
        layoutScore(score)
        expect(score.nstaves()).toBe(2)
        expect(noteCount(score)).toBe(7)
        // the operations of the file are removed after the import: a second import is a new import
        expect(midiImportOperations.hasMidiFile('m1.mid')).toBe(false)
        const score2 = await importScore(readFileSync(midiFilePath('m1')), 'm1.mid')
        expect(score2.nstaves()).toBe(2)
    })

    it('importScore rejects a file that is no MIDI file', async () => {
        await expect(importScore(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 'bad.mid')).rejects.toThrow()
    })
})

describe('MIDI import functions (MuseScore midiimport_tests)', () => {
    it('findChordInBar', () => {
        const chords = newChordMap()
        chords.insert(fromTicks(10), new MidiChord())
        chords.insert(fromTicks(360), new MidiChord())
        chords.insert(fromTicks(480), new MidiChord())
        chords.insert(fromTicks(1480), new MidiChord())
        chords.insert(fromTicks(2000), new MidiChord())
        chords.insert(fromTicks(3201), new MidiChord())

        let startBarTick = new ReducedFraction()
        let endBarTick = fromTicks(4 * Constants.DIVISION) // 4/4

        let firstChordIt = findFirstChordInRange(startBarTick, endBarTick, chords.begin(), chords.end())
        expect(firstChordIt).toBe(chords.begin())
        firstChordIt = findFirstChordInRange(chords, startBarTick, endBarTick)
        expect(firstChordIt).toBe(chords.begin())

        let endChordIt = findEndChordInRange(endBarTick, firstChordIt, chords.end())
        expect(endChordIt).toBe(chords.find(fromTicks(2000)))
        endChordIt = chords.lowerBound(endBarTick)
        expect(endChordIt).toBe(chords.find(fromTicks(2000)))

        endBarTick = RF(0, 1)

        firstChordIt = findFirstChordInRange(startBarTick, endBarTick, chords.begin(), chords.end())
        expect(firstChordIt).toBe(chords.end())
        firstChordIt = findFirstChordInRange(chords, startBarTick, endBarTick)
        expect(firstChordIt).toBe(chords.end())

        endChordIt = findEndChordInRange(endBarTick, firstChordIt, chords.end())
        expect(endChordIt).toBe(chords.end())

        startBarTick = fromTicks(10)
        endBarTick = fromTicks(-100)

        firstChordIt = findFirstChordInRange(startBarTick, endBarTick, chords.begin(), chords.end())
        expect(firstChordIt).toBe(chords.end())
        firstChordIt = findFirstChordInRange(chords, startBarTick, endBarTick)
        expect(firstChordIt).toBe(chords.end())

        endChordIt = findEndChordInRange(endBarTick, firstChordIt, chords.end())
        expect(endChordIt).toBe(chords.end())
    })

    // tupletNoteNumber - number of note in tuplet (like index):
    // i.e. for triplet notes can have numbers 1, 2, 3
    function isSingleNoteInTupletAllowed(tupletNumber: number, tupletNoteNumber: number, noteLenInTupletLen: number,
                                         expectedResult: boolean): void {
        const tupletInfo = new TupletInfo()
        tupletInfo.len = fromTicks(Constants.DIVISION)

        const chords = newChordMap()
        const chord = new MidiChord()
        const note = new MidiNote()
        const onTime = fromTicks(10)
        note.offTime = onTime.plus(fromTicks(Math.round(tupletInfo.len.ticks() * noteLenInTupletLen)))
        chord.notes.push(note)
        chords.insert(onTime, chord)

        tupletInfo.chords.insert(onTime, chords.begin())
        // tuplet error is less than regular error => allowed
        tupletInfo.tupletSumError = RF(0, 1)
        tupletInfo.regularSumError = fromTicks(1)
        tupletInfo.tupletNumber = tupletNumber
        tupletInfo.firstChordIndex = tupletNoteNumber - 1
        expect(isTupletAllowed(tupletInfo), `${tupletNumber} ${tupletNoteNumber} ${noteLenInTupletLen}`).toBe(expectedResult)
    }

    function isChordCountInTupletAllowed(tupletNumber: number, chordCount: number, expectedResult: boolean): void {
        const tupletInfo = new TupletInfo()
        tupletInfo.len = fromTicks(Constants.DIVISION)

        const chords = newChordMap()
        tupletInfo.firstChordIndex = 0
        for (let i = 0; i !== chordCount; ++i) {
            const chord = new MidiChord()
            const note = new MidiNote()
            const onTime = tupletInfo.len.div(tupletNumber).times(i)
            note.offTime = onTime.plus(tupletInfo.len.div(tupletNumber)) // allowed
            chord.notes.push(note)
            const lastChordIt = chords.insert(onTime, chord)
            tupletInfo.chords.insert(onTime, lastChordIt)
        }
        // tuplet error is less than regular error => allowed
        tupletInfo.tupletSumError = RF(0, 1)
        tupletInfo.regularSumError = fromTicks(1)
        tupletInfo.tupletNumber = tupletNumber
        expect(isTupletAllowed(tupletInfo), `${tupletNumber} ${chordCount}`).toBe(expectedResult)
    }

    function isTupletErrorAllowed(tupletSumError: number, regularSumError: number, expectedResult: boolean): void {
        const tupletInfo = new TupletInfo()
        tupletInfo.tupletNumber = 3
        tupletInfo.len = fromTicks(Constants.DIVISION)

        const chords = newChordMap()
        const chord = new MidiChord()
        const note = new MidiNote()
        const onTime = fromTicks(10)
        note.offTime = onTime.plus(tupletInfo.len.div(tupletInfo.tupletNumber)) // allowed
        chord.notes.push(note)
        chords.insert(onTime, chord)

        tupletInfo.chords.insert(onTime, chords.begin())
        tupletInfo.tupletSumError = RF(tupletSumError, 1)
        tupletInfo.regularSumError = RF(regularSumError, 1)
        expect(isTupletAllowed(tupletInfo)).toBe(expectedResult)
    }

    it('isTupletAllowed', () => {
        const opers = midiImportOperations
        const fileName = 'dummy'
        opers.addNewMidiFile(fileName)
        const setCurrentMidiFile = new CurrentMidiFileSetter(opers, fileName)
        try {
            // special cases
            //

            // duplets
            isSingleNoteInTupletAllowed(2, 1, 1.0 / 2, true)
            isSingleNoteInTupletAllowed(2, 1, 2.0 / 2, false)
            isSingleNoteInTupletAllowed(2, 1, 1.0, false)

            isSingleNoteInTupletAllowed(2, 2, 1.0 / 2, true)
            isSingleNoteInTupletAllowed(2, 2, 2.0 / 2, true)
            isSingleNoteInTupletAllowed(2, 2, 1.0, true)

            // triplets
            isSingleNoteInTupletAllowed(3, 1, 1.0 / 3, true)
            isSingleNoteInTupletAllowed(3, 1, 2.0 / 3, false)
            isSingleNoteInTupletAllowed(3, 1, 1.0, false)

            isSingleNoteInTupletAllowed(3, 2, 1.0 / 3, true)
            isSingleNoteInTupletAllowed(3, 2, 2.0 / 3, true)
            isSingleNoteInTupletAllowed(3, 2, 1.0, true)

            // quintuplets
            // too small note count - all these cases are not allowed
            isSingleNoteInTupletAllowed(5, 1, 1.0 / 5, false)
            isSingleNoteInTupletAllowed(5, 1, 2.0 / 5, false)
            isSingleNoteInTupletAllowed(5, 1, 1.0, false)

            isSingleNoteInTupletAllowed(5, 2, 1.0 / 5, false)
            isSingleNoteInTupletAllowed(5, 2, 2.0 / 5, false)
            isSingleNoteInTupletAllowed(5, 2, 1.0, false)

            // all tuplet cases
            //
            isChordCountInTupletAllowed(2, 1, true)
            isChordCountInTupletAllowed(2, 2, true)
            isChordCountInTupletAllowed(2, 3, true) // special case with tuplet subdivision

            isChordCountInTupletAllowed(3, 1, true)
            isChordCountInTupletAllowed(3, 2, true)
            isChordCountInTupletAllowed(3, 3, true)
            isChordCountInTupletAllowed(3, 4, true) // special case with tuplet subdivision

            isChordCountInTupletAllowed(4, 1, false)
            isChordCountInTupletAllowed(4, 2, false)
            isChordCountInTupletAllowed(4, 3, true)
            isChordCountInTupletAllowed(4, 4, true)
            isChordCountInTupletAllowed(4, 5, true) // special case with tuplet subdivision

            isChordCountInTupletAllowed(5, 1, false)
            isChordCountInTupletAllowed(5, 2, false)
            isChordCountInTupletAllowed(5, 3, true)
            isChordCountInTupletAllowed(5, 4, true)
            isChordCountInTupletAllowed(5, 5, true)
            isChordCountInTupletAllowed(5, 6, true) // special case with tuplet subdivision

            isChordCountInTupletAllowed(7, 1, false)
            isChordCountInTupletAllowed(7, 2, false)
            isChordCountInTupletAllowed(7, 3, false)
            isChordCountInTupletAllowed(7, 4, true)
            isChordCountInTupletAllowed(7, 5, true)
            isChordCountInTupletAllowed(7, 6, true)
            isChordCountInTupletAllowed(7, 7, true)
            isChordCountInTupletAllowed(7, 8, true) // special case with tuplet subdivision

            // tuplet error should be less than regular error
            isTupletErrorAllowed(4, 5, true)
            isTupletErrorAllowed(5, 5, false)
            isTupletErrorAllowed(6, 5, false)
        } finally {
            setCurrentMidiFile.restore()
        }
    })

    it('findTupletNumbers', () => {
        const opers = midiImportOperations
        opers.addNewMidiFile('')
        const setCurrentTrack = new CurrentTrackSetter(opers, 0)
        try {
            {
                const barFraction = RF(4, 4)
                const divLen = barFraction.div(4)
                const numbers = findTupletNumbers(divLen, barFraction)
                expect(numbers).toEqual([3, 5, 7, 9])
            }
            {
                const barFraction = RF(6, 8)
                const divLen = barFraction.div(2)
                const numbers = findTupletNumbers(divLen, barFraction)
                expect(numbers).toEqual([4])
                // duplets are turned off by default
            }
        } finally {
            setCurrentTrack.restore()
        }
    })

    it('findOnTimeRegularError', () => {
        const quantValue = fromTicks(Constants.DIVISION).div(4) // 1/16
        const chord = new MidiChord()
        const note = new MidiNote()
        note.offTime = quantValue.times(4)
        chord.notes.push(note)
        const onTime = quantValue.plus(fromTicks(12))
        expect(findOnTimeQuantError({ first: onTime, second: chord }, quantValue).eq(fromTicks(12))).toBe(true)
    })

    it('findTupletApproximation', () => {
        const tupletNumber = 3
        const tupletLen = fromTicks(Constants.DIVISION)
        const quantValue = fromTicks(Constants.DIVISION).div(4) // 1/16

        const chords = newChordMap()
        const chord = new MidiChord()
        const note = new MidiNote()
        chord.notes.push(note)

        const add = (onTime: number, offTime: number): void => {
            chord.notes[chord.notes.length - 1].offTime = fromTicks(offTime)
            chords.insert(fromTicks(onTime), chord.clone())
        }
        add(0, 160)
        add(160, 320)
        add(320, 480)
        add(480, 1480)
        add(1480, 2000)
        add(2000, 3201)
        add(3201, 4000)

        {
            const startTupletTime = RF(0, 1)
            const tupletApprox = findTupletApproximation(tupletLen, tupletNumber, quantValue, startTupletTime,
                                                         chords.begin(), chords.end())
            expect(tupletApprox.onTime.eq(startTupletTime)).toBe(true)
            expect(tupletApprox.len.eq(tupletLen)).toBe(true)
            expect(tupletApprox.tupletNumber).toBe(tupletNumber)
            expect(tupletApprox.chords.size()).toBe(3)
            expect(tupletApprox.tupletSumError.eq(fromTicks(0))).toBe(true)
            expect(tupletApprox.regularSumError.eq(fromTicks(80))).toBe(true)
            expect(tupletApprox.chords.find(fromTicks(0)).second).toBe(chords.find(fromTicks(0)))
            expect(tupletApprox.chords.find(fromTicks(160)).second).toBe(chords.find(fromTicks(160)))
            expect(tupletApprox.chords.find(fromTicks(320)).second).toBe(chords.find(fromTicks(320)))
        }
        {
            const startTupletTime = fromTicks(960)
            const tupletApprox = findTupletApproximation(tupletLen, tupletNumber, quantValue, startTupletTime,
                                                         chords.begin(), chords.end())
            expect(tupletApprox.chords.size()).toBe(0)
        }
        {
            const startTupletTime = fromTicks(1440)
            const tupletApprox = findTupletApproximation(tupletLen, tupletNumber, quantValue, startTupletTime,
                                                         chords.begin(), chords.end())
            expect(tupletApprox.chords.size()).toBe(1)
            expect(tupletApprox.tupletSumError.eq(fromTicks(40))).toBe(true)
            expect(tupletApprox.regularSumError.eq(fromTicks(40))).toBe(true)
            expect(tupletApprox.chords.find(fromTicks(1480)).second).toBe(chords.find(fromTicks(1480)))
        }
    })

    // tuplet voice separation

    function noteFactory(offTime: ReducedFraction, pitch: number): MidiNote {
        const note = new MidiNote()
        note.offTime = offTime
        note.pitch = pitch
        return note
    }

    function chordFactory(offTime: ReducedFraction, pitches: number[]): MidiChord {
        const chord = new MidiChord()
        for (const pitch of pitches) {
            chord.notes.push(noteFactory(offTime, pitch))
        }
        return chord
    }

    it('separateTupletVoices', () => {
        const tupletLen = fromTicks(Constants.DIVISION)
        const chords = newChordMap()
        // let's create 3 tuplets with the same first chord

        // triplet
        const tripletLen = tupletLen
        const tripletNumber = 3
        const tripletNoteLen = tripletLen.div(tripletNumber)

        const firstChord = chordFactory(tripletNoteLen, [76, 71, 67])
        chords.insert(RF(0, 1), firstChord.clone())

        let pitches = [74, 77]
        for (let i = 1; i !== tripletNumber; ++i) {
            chords.insert(tripletNoteLen.times(i), chordFactory(tripletNoteLen.times(i + 1), [pitches[i - 1]]))
        }
        // quintuplet
        const quintupletLen = tupletLen
        const quintupletNumber = 5
        const quintupletNoteLen = quintupletLen.div(quintupletNumber)
        pitches = [60, 62, 58, 60]
        for (let i = 1; i !== quintupletNumber; ++i) {
            chords.insert(quintupletNoteLen.times(i), chordFactory(quintupletNoteLen.times(i + 1), [pitches[i - 1]]))
        }
        // septuplet
        const septupletLen = tupletLen.times(2)
        const septupletNumber = 7
        const septupletNoteLen = septupletLen.div(septupletNumber)
        pitches = [50, 52, 48, 51, 47, 47]
        for (let i = 1; i !== septupletNumber; ++i) {
            chords.insert(septupletNoteLen.times(i), chordFactory(septupletNoteLen.times(i + 1), [pitches[i - 1]]))
        }

        const makeInfo = (len: ReducedFraction, count: number, noteLen: ReducedFraction): TupletInfo => {
            const info = new TupletInfo()
            info.onTime = RF(0, 1)
            info.len = len
            info.firstChordIndex = 0
            for (let i = 0; i !== count; ++i) {
                const onTime = noteLen.times(i)
                info.chords.insert(onTime, chords.find(onTime))
            }
            return info
        }
        let tripletInfo = makeInfo(tripletLen, 3, tripletNoteLen)
        let quintupletInfo = makeInfo(quintupletLen, 5, quintupletNoteLen)
        let septupletInfo = makeInfo(septupletLen, 7, septupletNoteLen)

        const tuplets: TupletInfo[] = [tripletInfo.clone(), quintupletInfo.clone(), septupletInfo.clone()]

        expect(chords.size()).toBe(13)

        const firstChordTime = RF(0, 1)
        const pitchesOf = (info: TupletInfo): number[] => info.chords.find(firstChordTime).second.second.notes.map(n => n.pitch)

        expect(pitchesOf(tripletInfo)).toEqual([76, 71, 67])
        expect(pitchesOf(quintupletInfo)).toEqual([76, 71, 67])
        expect(pitchesOf(septupletInfo)).toEqual([76, 71, 67])

        splitFirstTupletChords(tuplets, chords)
        expect(chords.size()).toBe(15)

        tripletInfo = tuplets[0]
        quintupletInfo = tuplets[1]
        septupletInfo = tuplets[2]

        expect(pitchesOf(tripletInfo)).toEqual([76])
        expect(pitchesOf(quintupletInfo)).toEqual([71])
        expect(pitchesOf(septupletInfo)).toEqual([67])
    })

    it('findLongestUncommonGroup', () => {
        let tuplets: TupletInfo[] = []
        const basicQuant = fromTicks(Constants.DIVISION).div(4) // 1/16
        const add = (onTime: ReducedFraction, len: ReducedFraction): void => {
            const info = new TupletInfo()
            info.onTime = onTime
            info.len = len
            tuplets.push(info)
        }
        add(RF(5, 8), RF(1, 8)) // 0
        add(RF(3, 4), RF(1, 8)) // 1
        add(RF(7, 8), RF(1, 8)) // 2
        add(RF(1, 2), RF(1, 4)) // 3
        add(RF(3, 4), RF(1, 4)) // 4
        add(RF(1, 2), RF(1, 2)) // 5
        add(RF(0, 1), RF(1, 1)) // 6

        let result = [...findLongestUncommonGroup(tuplets, basicQuant)]
        expect(result.length).toBe(3)
        expect(JSON.stringify(result) === '[0,1,2]' || JSON.stringify(result) === '[1,2,3]').toBe(true)

        // test unsuccessful case
        tuplets = []
        add(RF(5, 8), RF(1, 8)) // 0
        add(RF(1, 2), RF(1, 2)) // 1
        add(RF(0, 1), RF(1, 1)) // 2

        result = [...findLongestUncommonGroup(tuplets, basicQuant)]
        expect(result.length).toBe(1)
    })

    // metric bar analysis

    it('metricDivisionsOfTuplet', () => {
        const tupletData = new TupletData(0, fromTicks(480), fromTicks(480), 3)
        const tupletStartLevel = -3
        const tupletDivInfo = metricDivisionsOfTuplet(tupletData, tupletStartLevel)

        expect(tupletDivInfo.isTuplet).toBe(true)
        expect(tupletDivInfo.len.eq(fromTicks(480))).toBe(true)
        expect(tupletDivInfo.onTime.eq(fromTicks(480))).toBe(true)
        expect(tupletDivInfo.divLengths.length).toBe(5)

        expect(tupletDivInfo.divLengths[0].len.eq(tupletData.len)).toBe(true)
        expect(tupletDivInfo.divLengths[0].level).toBe(TUPLET_BOUNDARY_LEVEL)

        for (let i = 1; i <= 4; ++i) {
            const n = 2 ** (i - 1) * tupletData.tupletNumber
            expect(tupletDivInfo.divLengths[i].len.eq(tupletData.len.div(n))).toBe(true)
            expect(tupletDivInfo.divLengths[i].level).toBe(tupletStartLevel - (i - 1))
        }
    })

    it('maxLevelBetween', () => {
        const barFraction = RF(4, 4)
        let startTickInBar = fromTicks(240)
        let endTickInBar = fromTicks(500)

        const regularDivInfo = metricDivisionsOfBar(barFraction)
        expect(regularDivInfo.divLengths.length).toBe(8)

        const check = (level: { level: number, pos: ReducedFraction, levelCount: number }, l: number,
                       pos: ReducedFraction, count: number): void => {
            expect(level.level).toBe(l)
            expect(level.pos.eq(pos), `${level.pos} != ${pos}`).toBe(true)
            expect(level.levelCount).toBe(count)
        }

        let level = maxLevelBetween(startTickInBar, endTickInBar, regularDivInfo)
        check(level, -2, fromTicks(480), 1)

        startTickInBar = fromTicks(499)
        level = maxLevelBetween(startTickInBar, endTickInBar, regularDivInfo)
        check(level, 0, RF(-1, 1), 0)

        const tupletData = new TupletData(0, fromTicks(480), fromTicks(480), 3)

        const tupletStartLevel = -3
        const tupletDivInfo = metricDivisionsOfTuplet(tupletData, tupletStartLevel)
        expect(tupletDivInfo.divLengths.length).toBe(5)

        startTickInBar = tupletData.onTime
        endTickInBar = startTickInBar.plus(tupletData.len)
        level = maxLevelBetween(startTickInBar, endTickInBar, tupletDivInfo)
        check(level, tupletStartLevel, tupletData.onTime.plus(tupletData.len.div(tupletData.tupletNumber)), 2)

        // first elements of vector - all tuplets division info
        // last element - whole bar (regular) division info
        const divInfo: DivisionInfo[] = [tupletDivInfo, regularDivInfo]
        const on = tupletData.onTime
        const len = tupletData.len
        const num = tupletData.tupletNumber

        // s < e < ts < te
        startTickInBar = fromTicks(0)
        endTickInBar = startTickInBar.plus(on).div(2)
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, -4, startTickInBar.plus(endTickInBar).div(2), 1)
        // s < e == ts < te
        startTickInBar = fromTicks(0)
        endTickInBar = on
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, -3, startTickInBar.plus(on).div(2), 1)
        // s < ts < e < te
        startTickInBar = fromTicks(0)
        endTickInBar = on.plus(len.div(2))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, TUPLET_BOUNDARY_LEVEL, on, 1)
        // s < ts < e == te
        startTickInBar = fromTicks(0)
        endTickInBar = on.plus(len)
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, TUPLET_BOUNDARY_LEVEL, on, 1)
        // s < ts < te < e
        startTickInBar = fromTicks(0)
        endTickInBar = on.plus(len).plus(RF(1, 3))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, TUPLET_BOUNDARY_LEVEL, on.plus(len), 1)
        // s == ts < e < te
        startTickInBar = on
        endTickInBar = on.plus(len.div(2))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, tupletStartLevel, on.plus(len.div(num)), 1)
        // s == ts < e == te
        startTickInBar = on
        endTickInBar = on.plus(len)
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, tupletStartLevel, on.plus(len.div(num)), 2)
        // s == ts < te < e
        startTickInBar = on
        endTickInBar = on.plus(len.times(2))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, TUPLET_BOUNDARY_LEVEL, on.plus(len), 1)
        // ts < s < e < te
        startTickInBar = on.plus(len.div(num))
        endTickInBar = on.plus(len.times(2).div(num))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, tupletStartLevel - 1, startTickInBar.plus(endTickInBar).div(2), 1)
        // ts < s < e = te
        startTickInBar = on.plus(len.div(num))
        endTickInBar = on.plus(len)
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, tupletStartLevel, on.plus(len.times(2).div(num)), 1)
        // ts < s < te < e
        startTickInBar = on.plus(len.div(2))
        endTickInBar = on.plus(len).plus(RF(1, 3))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        check(level, TUPLET_BOUNDARY_LEVEL, on.plus(len), 1)
        // ts < te = s < e
        startTickInBar = on.plus(len)
        endTickInBar = on.plus(len).plus(RF(1, 3))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        expect(level.level).not.toBe(TUPLET_BOUNDARY_LEVEL)
        // ts < te < s < e
        startTickInBar = on.plus(len).plus(RF(1, 3))
        endTickInBar = startTickInBar.plus(RF(1, 3))
        level = findMaxLevelBetween(startTickInBar, endTickInBar, divInfo)
        expect(level.level).not.toBe(TUPLET_BOUNDARY_LEVEL)
    })

    it('isSimpleDuration', () => {
        for (const [z, n] of [[4, 2], [4, 1], [2, 2], [2, 1], [1, 1], [1, 2], [1, 4], [1, 8], [1, 16], [1, 32], [1, 64],
            [1, 128]]) {
            expect(isSimpleNoteDuration(RF(z, n)), `${z}/${n}`).toBe(true)
        }
        for (const [z, n] of [[1, 6], [3, 2], [12, 8], [3, 16], [3, 4], [3, 8], [1, 5]]) {
            expect(isSimpleNoteDuration(RF(z, n)), `${z}/${n}`).toBe(false)
        }
    })
})
