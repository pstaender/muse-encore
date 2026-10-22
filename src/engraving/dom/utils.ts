/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/utils.h/.cpp (subset)
 */

import { Fraction } from '../types/fraction'
import type { PointF } from '../../framework/draw/types/geometry'
import { SymId, type SymIdList } from '../types/symid'
import {
    AccidentalVal, ClefType, ElementType, Key, TimeSigPlacement, TimeSigStyle, VOICES, nidx, type staff_idx_t, type track_idx_t,
} from '../types/types'
import { ClefInfo } from './clefinfo'
import {
    MAX_PITCH, MIN_PITCH, PITCH_DELTA_OCTAVE, Prefer, STEP_DELTA_OCTAVE, clampPitch, pitch2tpc, tpc2pitch, tpc2step,
} from './pitchspelling'
import type { Tuplet } from './tuplet'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType, type Segment } from './segment'
import type { Score } from './score'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { Note } from './note'
import type { Rest } from './rest'
import type { Measure } from './measure'
import type { System } from './system'
import type { EngravingItem } from './engravingitem'
import type { Spanner } from './spanner'
import type { Staff } from './staff'
import type { KeySig } from './keysig'
import type { Selection } from './select'
import type { NoteVal } from './input'
import { Sid } from '../style/styledef'
import { INVALID_PITCH, Tpc, pitchIsValid, tpc2alter } from './pitchspelling'

const PTAB: number[][] = [
    //   c  d  e  f  g   a  b
    [-1, 1, 3, 4, 6, 8, 10], // Bes
    [-1, 1, 3, 5, 6, 8, 10], // Ges
    [0, 1, 3, 5, 6, 8, 10], // Des
    [0, 1, 3, 5, 7, 8, 10], // As
    [0, 2, 3, 5, 7, 8, 10], // Es
    [0, 2, 3, 5, 7, 9, 10], // B
    [0, 2, 4, 5, 7, 9, 10], // F
    [0, 2, 4, 5, 7, 9, 11], // C
    [0, 2, 4, 6, 7, 9, 11], // G
    [1, 2, 4, 6, 7, 9, 11], // D
    [1, 2, 4, 6, 8, 9, 11], // A
    [1, 3, 4, 6, 8, 9, 11], // E
    [1, 3, 4, 6, 8, 10, 11], // H
    [1, 3, 5, 6, 8, 10, 11], // Fis
    [1, 3, 5, 6, 8, 10, 12], // Cis
]

export function yStaffDifference(system1: System | null, system2: System | null, staffIdx: staff_idx_t): number {
    if (!system1 || !system2) {
        return 0.0
    }

    const staff1 = system1.staff(staffIdx)
    const staff2 = system2.staff(staffIdx)
    if (!staff1 || !staff2) {
        return 0.0
    }
    return staff1.y() - staff2.y()
}

export function pitchKeyAdjust(step: number, key: Key): number {
    return PTAB[key + 7][step]
}

export function line2pitch(line: number, clef: ClefType, key: Key): number {
    let l = Math.max(ClefInfo.pitchOffset(clef) - line, 0)
    const octave = Math.trunc(l / STEP_DELTA_OCTAVE)
    l %= STEP_DELTA_OCTAVE
    const pitch = pitchKeyAdjust(l, key) + octave * PITCH_DELTA_OCTAVE
    return clampPitch(pitch)
}

export function y2pitch(y: number, clef: ClefType, spatium: number): number {
    const l = Math.round(y / spatium * 2.0)
    return line2pitch(l, clef, Key.C)
}

/** absStep(tpc, pitch) */
export function absStep(tpc: number, pitch?: number): number {
    if (pitch === undefined) {
        // absStep(pitch): TODO - does this need to be key-aware?
        pitch = tpc
        tpc = pitch2tpc(pitch, Key.C, Prefer.NEAREST)
    }
    let line = tpc2step(tpc) + Math.trunc(pitch / PITCH_DELTA_OCTAVE) * STEP_DELTA_OCTAVE
    const tpcPitch = tpc2pitch(tpc)
    if (tpcPitch < MIN_PITCH) {
        line += STEP_DELTA_OCTAVE
    } else {
        line -= Math.trunc(tpcPitch / PITCH_DELTA_OCTAVE) * STEP_DELTA_OCTAVE
    }
    return line
}

/** absStep(line, clef) */
export function absStepFromLine(line: number, clef: ClefType): number {
    return ClefInfo.pitchOffset(clef) - line
}

export function relStep(line: number, clef: ClefType): number {
    return ClefInfo.pitchOffset(clef) - line
}

export function relStepFromPitch(pitch: number, tpc: number, clef: ClefType): number {
    return relStep(absStep(tpc, pitch), clef)
}

export function pitch2step(pitch: number): number {
    //           C  C# D  D# E  F  F# G  G# A  A# B
    const tab = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
    return tab[pitch % 12]
}

export function step2pitch(step: number): number {
    const tab = [0, 2, 4, 5, 7, 9, 11]
    return tab[step % 7]
}

const valSharp = ['c', 'c♯', 'd', 'd♯', 'e', 'f', 'f♯', 'g', 'g♯', 'a', 'a♯', 'b']
const valFlat = ['c', 'd♭', 'd', 'e♭', 'e', 'f', 'g♭', 'g', 'a♭', 'a', 'b♭', 'b']

/** Returns the latin letter name, accidental, and octave numeral of the pitch. Uses upper case only for pitches 0-24. */
export function pitch2string(v: number, useFlats = false): string {
    if (!pitchIsValid(v)) {
        return '----'
    }
    const octave = Math.trunc(v / PITCH_DELTA_OCTAVE) - 1
    const o = String(octave)
    const i = v % PITCH_DELTA_OCTAVE

    let pitchStr = useFlats ? valFlat[i] : valSharp[i]
    if (octave < 0) {
        pitchStr = pitchStr.toUpperCase()
    }

    return pitchStr + o
}

/** Returns the pitch number of the string representation of a note (pitch2string) */
export function string2pitch(s: string): number {
    if (s === '----') {
        return INVALID_PITCH
    }

    const negative = s.includes('-')
    const octave = (parseInt(s[s.length - 1], 10) || 0) * (negative ? -1 : 1)
    if (octave < -1 || octave > 9) {
        return -1
    }

    const value = s.substring(0, s.length - (negative ? 2 : 1)).toLowerCase()

    let pitchIndex = -1
    for (let i = 0; i < PITCH_DELTA_OCTAVE; ++i) {
        if (value === valFlat[i] || value === valSharp[i]) {
            pitchIndex = i
            break
        }
    }

    if (pitchIndex === -1) {
        return -1
    }

    return (octave + 1) * PITCH_DELTA_OCTAVE + pitchIndex
}

const TS_DICT: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmall,
    '0': SymId.timeSig0,
    '1': SymId.timeSig1,
    '2': SymId.timeSig2,
    '3': SymId.timeSig3,
    '4': SymId.timeSig4,
    '5': SymId.timeSig5,
    '6': SymId.timeSig6,
    '7': SymId.timeSig7,
    '8': SymId.timeSig8,
    '9': SymId.timeSig9,
    'C': SymId.timeSigCommon,
    '(': SymId.timeSigParensLeftSmall,
    ')': SymId.timeSigParensRightSmall,
    '[': SymId.timeSigBracketLeftSmall,
    ']': SymId.timeSigBracketRightSmall,
    '¢': SymId.timeSigCutCommon,
    '½': SymId.timeSigFractionHalf,
    '¼': SymId.timeSigFractionQuarter,
    '*': SymId.timeSigMultiply,
    'X': SymId.timeSigMultiply,
    'x': SymId.timeSigMultiply,
    '×': SymId.timeSigMultiply,
    [String.fromCharCode(59664)]: SymId.mensuralProlation1,
    'O': SymId.mensuralProlation2,
    [String.fromCharCode(59665)]: SymId.mensuralProlation2,
    'Ø': SymId.mensuralProlation3,
    [String.fromCharCode(59666)]: SymId.mensuralProlation3,
    [String.fromCharCode(59667)]: SymId.mensuralProlation4,
    [String.fromCharCode(59668)]: SymId.mensuralProlation5,
    [String.fromCharCode(59669)]: SymId.mensuralProlation6,
    [String.fromCharCode(59670)]: SymId.mensuralProlation7,
    [String.fromCharCode(59671)]: SymId.mensuralProlation8,
    [String.fromCharCode(59672)]: SymId.mensuralProlation9,
    [String.fromCharCode(59673)]: SymId.mensuralProlation10,
    [String.fromCharCode(59674)]: SymId.mensuralProlation11,
}

const TS_DICT_LARGE: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmallLarge,
    '0': SymId.timeSig0Large,
    '1': SymId.timeSig1Large,
    '2': SymId.timeSig2Large,
    '3': SymId.timeSig3Large,
    '4': SymId.timeSig4Large,
    '5': SymId.timeSig5Large,
    '6': SymId.timeSig6Large,
    '7': SymId.timeSig7Large,
    '8': SymId.timeSig8Large,
    '9': SymId.timeSig9Large,
    'C': SymId.timeSigCommonLarge,
    '(': SymId.timeSigParensLeftSmallLarge,
    ')': SymId.timeSigParensRightSmallLarge,
    '[': SymId.timeSigBracketLeftSmallLarge,
    ']': SymId.timeSigBracketRightSmallLarge,
    '¢': SymId.timeSigCutCommonLarge,
    '½': SymId.timeSigFractionHalfLarge,
    '¼': SymId.timeSigFractionQuarterLarge,
    '*': SymId.timeSigMultiplyLarge,
    'X': SymId.timeSigMultiplyLarge,
    'x': SymId.timeSigMultiplyLarge,
    '×': SymId.timeSigMultiplyLarge,
}

const TS_DICT_NARROW: Record<string, SymId> = {
    '+': SymId.timeSigPlusSmallNarrow,
    '0': SymId.timeSig0Narrow,
    '1': SymId.timeSig1Narrow,
    '2': SymId.timeSig2Narrow,
    '3': SymId.timeSig3Narrow,
    '4': SymId.timeSig4Narrow,
    '5': SymId.timeSig5Narrow,
    '6': SymId.timeSig6Narrow,
    '7': SymId.timeSig7Narrow,
    '8': SymId.timeSig8Narrow,
    '9': SymId.timeSig9Narrow,
    'C': SymId.timeSigCommonNarrow,
    '(': SymId.timeSigParensLeftSmallNarrow,
    ')': SymId.timeSigParensRightSmallNarrow,
    '[': SymId.timeSigBracketLeftSmallNarrow,
    ']': SymId.timeSigBracketRightSmallNarrow,
    '¢': SymId.timeSigCutCommonNarrow,
    '½': SymId.timeSigFractionHalfNarrow,
    '¼': SymId.timeSigFractionQuarterNarrow,
    '*': SymId.timeSigMultiplyNarrow,
    'X': SymId.timeSigMultiplyNarrow,
    '×': SymId.timeSigMultiplyNarrow,
}

export function timeSigSymIdsFromString(string: string, timeSigStyle: TimeSigStyle = TimeSigStyle.NORMAL): SymIdList {
    const dict = timeSigStyle === TimeSigStyle.NARROW ? TS_DICT_NARROW
        : timeSigStyle === TimeSigStyle.LARGE ? TS_DICT_LARGE : TS_DICT
    const list: SymIdList = []
    // iterate UTF-16 code units like C++ String (char16_t)
    for (let i = 0; i < string.length; ++i) {
        const sym = dict[string[i]]
        if (sym !== undefined && sym !== SymId.noSym) {
            list.push(sym)
        }
    }
    return list
}

export function actualTicks(duration: Fraction, tuplet: Tuplet | null, timeStretch: Fraction): Fraction {
    let f = duration.div(timeStretch)
    for (let t = tuplet; t; t = t.tuplet()) {
        f = f.div(t.ratio())
    }
    return f
}

// ---------------------------------------------------------
//   skipTuplet
//    return segment of last element of tuplet
// ---------------------------------------------------------

export function skipTuplet(tuplet: Tuplet): Segment {
    let nde = tuplet.elements()[tuplet.elements().length - 1]
    while (nde.isTuplet()) {
        tuplet = nde as unknown as Tuplet
        nde = tuplet.elements()[tuplet.elements().length - 1]
    }
    return (nde as unknown as ChordRest).segment()
}

// ---------------------------------------------------------
//   searchTieNote
//    search Note to tie to "note"
// ---------------------------------------------------------

export function searchTieNote(note: Note | null, nextSegment: Segment | null = null, disableOverRepeats = true): Note | null {
    if (!note) {
        return null
    }
    let note2: Note | null = null
    let chord = note.chord()
    const seg = chord.segment()
    if (!nextSegment) {
        nextSegment = seg.next1(SegmentType.ChordRest)
        while (nextSegment && nextSegment.tick().lt(chord.endTick())) {
            nextSegment = nextSegment.next1(SegmentType.ChordRest)
        }
    }
    if (!nextSegment) {
        return null
    }

    if (disableOverRepeats && !segmentsAreAdjacent(seg, nextSegment)) {
        return null
    }

    if (chord.isGraceBefore()) {
        chord = chord.explicitParent() as unknown as Chord
        // try to tie to next grace note
        const index = note.chord().graceIndex()
        for (const c of chord.graceNotes()) {
            if (c.graceIndex() === index + 1) {
                note2 = c.findNote(note.pitch())
                if (note2) {
                    return note2
                }
            }
        }
        // try to tie to note in parent chord
        note2 = chord.findNote(note.pitch())
        if (note2) {
            return note2
        }
    } else if (chord.isGraceAfter()) {
        // grace after
        // we will try to tie to note in next normal chord, below
        // meanwhile, set chord to parent chord so the endTick calculation will make sense
        chord = chord.explicitParent() as unknown as Chord
    } else {
        // normal chord
        // try to tie to grace note after if present
        const gna = chord.graceNotesAfter()
        if (!gna.empty()) {
            const gc = gna.front()
            note2 = gc.findNote(note.pitch())
            if (note2) {
                return note2
            }
        }
    }
    // at this point, chord is a regular chord, not a grace chord
    // and we are looking for a note in the *next* chord (grace or regular)

    // calculate end of current note duration
    // but err on the safe side in case there is roundoff in tick count
    const idx1 = note.unisonIndex()
    const part = chord.part()!
    for (let track = part.startTrack(); track < part.endTrack(); ++track) {
        const e = nextSegment.element(track)
        if (!e || !e.isChord()) {
            continue
        }
        const c = e as unknown as Chord
        if (c.vStaffIdx() !== chord.vStaffIdx()) {
            continue
        }
        // if there are grace notes before, try to tie to first one
        const gnb = c.graceNotesBefore()
        if (!gnb.empty()) {
            const gc = gnb.front()
            const gn2 = gc.findNote(note.pitch())
            if (gn2) {
                return gn2
            }
        }
        let idx2 = 0
        for (const n of c.notes()) {
            if (n.pitch() === note.pitch()) {
                if (idx1 === idx2) {
                    if (!note2 || c.track() === chord.track()) {
                        note2 = n
                        break
                    }
                } else {
                    ++idx2
                }
            }
        }
    }
    return note2
}

export function collectChordsAndRest(segment: Segment | null, staffIdx: staff_idx_t, chords: Chord[], rests: Rest[]): void {
    if (!segment) {
        return
    }
    const startTrack = staffIdx * VOICES
    const endTrack = startTrack + VOICES
    for (let track = startTrack; track < endTrack; ++track) {
        const e = segment.element(track)
        if (!e) {
            continue
        }
        if (e.isChord() && !(e as Chord).staffMove()) {
            chords.push(e as Chord)
        } else if (e.isRest() && !(e as Rest).staffMove() && !(e as Rest).isFullMeasureRest()) {
            rests.push(e as Rest)
        }
    }
}

export function collectChordsOverlappingRests(segment: Segment, staffIdx: staff_idx_t, chords: Chord[]): void {
    // Check if previous segments contain chords in other voices
    // whose duration overlaps with rests on this segment
    const startTrack = staffIdx * VOICES
    const endTrack = startTrack + VOICES

    const tracksToCheck = new Set<track_idx_t>()
    for (let track = startTrack; track < endTrack; ++track) {
        const item = segment.element(track)
        if (!item || !item.isRest()) {
            tracksToCheck.add(track)
        }
    }
    const sortedTracks = [...tracksToCheck].sort((a, b) => a - b)

    const curTick = segment.rtick()
    for (let prevSeg = segment.prev(); prevSeg; prevSeg = prevSeg.prev()) {
        if (!prevSeg.isChordRestType()) {
            continue
        }
        const prevSegTick = prevSeg.rtick()
        for (const track of sortedTracks) {
            const e = prevSeg.element(track)
            if (!e || !e.isChord()) {
                continue
            }
            const chord = e as Chord
            const chordEndTick = prevSegTick.plus(chord.actualTicks())
            if (chordEndTick.le(curTick)) {
                continue
            }
            chords.push(chord)
        }
    }
}

export function findFollowingRepeatMeasures(measure: Measure): Measure[] {
    const master = measure.masterScore()
    const score = measure.score()

    const masterMeasure = master.tick2measure(measure.tick())

    const repeatList = master.repeatList(true, false)

    const measures: Measure[] = []

    for (let i = 0; i < repeatList.length; i++) {
        const rs = repeatList[i]
        if (!rs.endsWithMeasure(masterMeasure) || i + 1 === repeatList.length) {
            continue
        }

        // Get next segment
        const nextSeg = repeatList[i + 1]
        const firstMasterMeasure = nextSeg.firstMeasure()
        const firstMeasure = firstMasterMeasure ? score.tick2measure(firstMasterMeasure.tick()) : null
        if (!firstMeasure) {
            continue
        }

        measures.push(firstMeasure)
    }

    return measures
}

export function findPreviousRepeatMeasures(measure: Measure): Measure[] {
    const master = measure.masterScore()
    const score = measure.score()

    const masterMeasure = master.tick2measure(measure.tick())

    const repeatList = master.repeatList(true, false)

    const measures: Measure[] = []

    for (let i = 1; i < repeatList.length; i++) {
        const rs = repeatList[i]
        if (!rs.startsWithMeasure(masterMeasure)) {
            continue
        }

        // Get next segment
        const prevSeg = repeatList[i - 1]
        const lastMasterMeasure = prevSeg.lastMeasure()
        const lastMeasure = lastMasterMeasure ? score.tick2measure(lastMasterMeasure.tick()) : null
        if (!lastMeasure) {
            continue
        }

        measures.push(lastMeasure)
    }

    return measures
}

export function segmentsAreAdjacent(firstSeg: Segment | null, secondSeg: Segment | null): boolean {
    if (!firstSeg || !secondSeg) {
        return false
    }
    const master = firstSeg.masterScore()

    const firstMeasure = firstSeg.measure()
    const secondMeasure = secondSeg.measure()

    if (firstMeasure === secondMeasure) {
        return true
    }

    const firstMasterMeasure = master.tick2measure(firstMeasure.tick())
    const secondMasterMeasure = master.tick2measure(secondMeasure.tick())

    if (!firstMasterMeasure || !secondMasterMeasure) {
        return false
    }

    const repeatList = firstSeg.score().masterScore().repeatList(true, false)

    const measures: Measure[] = []

    let firstMeasureSegmentFound = false
    let secondMeasureSegmentFound = false

    for (let i = 0; i < repeatList.length; i++) {
        const rs = repeatList[i]

        // Check if measures are in the same repeat segment
        const containsFirstMeasure = rs.containsMeasure(firstMasterMeasure)
        const containsSecondMeasure = rs.containsMeasure(secondMasterMeasure)
        firstMeasureSegmentFound ||= containsFirstMeasure
        secondMeasureSegmentFound ||= containsSecondMeasure

        if (containsFirstMeasure && containsSecondMeasure) {
            return true
        }

        // Continue to build list of measures at the start of following repeat segments
        if (!rs.endsWithMeasure(firstMasterMeasure) || i + 1 === repeatList.length) {
            continue
        }

        // Get next segment
        const nextSegFirstMeasure = repeatList[i + 1].firstMeasure()
        if (!nextSegFirstMeasure) {
            continue
        }

        measures.push(nextSegFirstMeasure)
    }

    // Check if second segment is in a following measure in the repeat structure
    for (const m of measures) {
        if (m === secondMasterMeasure) {
            return true
        }
    }

    if (!firstMeasureSegmentFound && !secondMeasureSegmentFound) {
        // The measures are outside of the (invalid) repeat structure
        return firstMasterMeasure.nextMeasure() === secondMasterMeasure
    }

    return false
}

/** C++ collectElementsAnchoredToChordRest (a Set keeps the insertion order, C++ uses an unordered_set) */
export function collectElementsAnchoredToChordRest(cr: ChordRest): Set<EngravingItem> {
    const elems = new Set<EngravingItem>()
    for (const lyric of cr.lyrics()) {
        elems.add(lyric)
    }
    if (!cr.isChord()) {
        return elems
    }
    const chord = cr as unknown as Chord
    const arp = chord.arpeggio()
    if (arp) {
        elems.add(arp)
    }
    const tremTwo = chord.tremoloTwoChord()
    if (tremTwo) {
        elems.add(tremTwo)
    }
    const tremSing = chord.tremoloSingleChord()
    if (tremSing) {
        elems.add(tremSing)
    }
    for (const art of chord.articulations()) {
        elems.add(art)
    }
    // Chord brackets and chord lines
    for (const e of chord.el()) {
        elems.add(e)
    }
    for (const grace of chord.graceNotes()) {
        elems.add(grace)
        for (const gArt of grace.articulations()) {
            elems.add(gArt)
        }
        const gTremSing = grace.tremoloSingleChord()
        if (gTremSing) {
            elems.add(gTremSing)
        }
    }
    return elems
}

/** C++ collectElementsAnchoredToNote */
export function collectElementsAnchoredToNote(note: Note, includeForwardTiesSpanners: boolean,
    includeBackwardTiesSpanners: boolean): Set<EngravingItem> {
    const elems = new Set<EngravingItem>()
    const lv = note.laissezVib()
    if (lv && !lv.segmentsEmpty()) {
        elems.add(lv)
    }
    const ipt = note.incomingPartialTie()
    if (ipt && !ipt.segmentsEmpty()) {
        elems.add(ipt)
    }
    const opt = note.outgoingPartialTie()
    if (opt && !opt.segmentsEmpty()) {
        elems.add(opt)
    }
    // The following is a bit of a hack - addressing properly would require a fingering rework...
    for (const elem of note.el()) {
        if (elem.isFingering()) {
            elems.add(elem)
        }
    }
    if (includeForwardTiesSpanners) {
        const tieFor = note.tieFor()
        if (tieFor && !tieFor.segmentsEmpty()) {
            elems.add(tieFor)
        }
        for (const sp of note.spannerFor()) {
            if (sp.segmentsEmpty()) {
                continue
            }
            elems.add(sp)
        }
    }
    if (includeBackwardTiesSpanners) {
        const tieBack = note.tieBack()
        if (tieBack && !tieBack.segmentsEmpty()) {
            elems.add(tieBack)
        }
        for (const sp of note.spannerBack()) {
            if (sp.segmentsEmpty()) {
                continue
            }
            elems.add(sp)
        }
    }
    const noteParenInfo = note.parenthesisInfo()
    if (noteParenInfo && noteParenInfo.notes().length) {
        elems.add(noteParenInfo.leftParen())
        elems.add(noteParenInfo.rightParen())
    }
    return elems
}

/** C++ noteAnchoredSpannerIsInRange */
export function noteAnchoredSpannerIsInRange(spanner: Spanner, rangeStart: Fraction, rangeEnd: Fraction): boolean {
    if (!rangeStart.lt(rangeEnd)) {
        return false
    }
    const startElement = spanner.startElement()
    const endElement = spanner.endElement()
    if (!(startElement && startElement.isNote() && endElement && endElement.isNote())) {
        // Cannot calculate isInRange - might be a partial tie or laissez vibrer
        return false
    }
    const startNote = startElement as unknown as Note
    const startSeg = startNote.chord().segment()
    if (startSeg.tick().lt(rangeStart)) {
        return false
    }
    const endNote = endElement as unknown as Note
    const endSeg = endNote.chord().segment()
    return !endSeg || endSeg.tick().le(rangeEnd)
}

function noteValToEffectivePitchAndTpc(nval: NoteVal, staff: Staff, tick: Fraction): { epitch: number; tpc: number } {
    const concertPitch = staff.style().styleB(Sid.concertPitch) // C++ staff->concertPitch()

    let epitch: number
    if (concertPitch) {
        epitch = nval.pitch
    } else {
        const pitchOffset = staff.part().instrument(tick).transpose().chromatic
        epitch = nval.pitch - pitchOffset
    }

    let tpc = nval.tpc(concertPitch)
    if (tpc === Tpc.TPC_INVALID) {
        tpc = pitch2tpc(epitch, staff.key(tick), Prefer.NEAREST)
    }
    return { epitch, tpc }
}

export function noteValToLine(nval: NoteVal, staff: Staff, tick: Fraction): number {
    if (staff.isDrumStaff(tick)) {
        const drumset = staff.part().instrument(tick).drumset()
        if (drumset) {
            return drumset.line(nval.pitch)
        }
    }

    if (nval.isRest()) {
        return staff.middleLine(tick)
    }

    const { epitch, tpc } = noteValToEffectivePitchAndTpc(nval, staff, tick)

    return relStepFromPitch(epitch, tpc, staff.clef(tick))
}

export function noteValToAccidentalVal(nval: NoteVal, staff: Staff, tick: Fraction): AccidentalVal {
    if (nval.isRest()) {
        return AccidentalVal.NATURAL
    }

    if (staff.isDrumStaff(tick)) {
        return AccidentalVal.NATURAL
    }

    const { tpc } = noteValToEffectivePitchAndTpc(nval, staff, tick)

    return tpc2alter(tpc)
}

/**
 * The elements of a selection a dropped (palette) element is applied to; unique: true if only one element per
 * measure and/or staff is returned
 */
export function filterTargetElements(sel: Pick<Selection, 'isRange' | 'startSegment' | 'staffStart' | 'elements'>,
    dropElement: EngravingItem): { elements: EngravingItem[]; unique: boolean } {
    let uniqueMeasures = false
    let uniqueStaves = false

    switch (dropElement.type()) {
    // Brackets have a special logic for range selections.
    // For other selections add only one to each staff:
    case ElementType.BRACKET:
        if (sel.isRange()) {
            const e = sel.startSegment()!.firstElementForNavigation(sel.staffStart())
            return { elements: e ? [e] : [], unique: true }
        }
        uniqueStaves = true
        break

    // Barlines are only added to measures in range selections:
    case ElementType.BAR_LINE:
        uniqueMeasures = sel.isRange()
        break

    // For multi-measure measure repeats, avoid overlap by adding only one per staff:
    case ElementType.MEASURE_REPEAT:
        uniqueStaves = true
        uniqueMeasures = (dropElement as unknown as { numMeasures(): number }).numMeasures() === 1
        break

    // Add these elements once per measure in list selections, else once total:
    case ElementType.MARKER:
    case ElementType.JUMP:
    case ElementType.SPACER: //! HACK - these should be applied "per staff" in range selections (see issue #33486)
    case ElementType.STAFFTYPE_CHANGE: //! HACK - these should be applied "per staff" in range selections (see issue #33486)
    case ElementType.VBOX:
    case ElementType.HBOX:
    case ElementType.TBOX:
    case ElementType.FBOX:
    case ElementType.MEASURE:
        if (sel.isRange()) {
            const e = sel.startSegment()!.firstElementForNavigation(sel.staffStart())
            return { elements: e ? [e] : [], unique: true }
        }
        uniqueMeasures = true
        break

    // Add these elements once per measure, always:
    case ElementType.MEASURE_NUMBER:
        uniqueMeasures = true
        break

    // TODO(port): ACTION_ICON (frames, measures, staff type changes)
    default: break
    }

    const unique = uniqueStaves || uniqueMeasures
    if (!unique) {
        return { elements: [...sel.elements()], unique }
    }

    const result: EngravingItem[] = []
    if (uniqueStaves && uniqueMeasures) {
        const found = new Set<string>()
        for (const e of sel.elements()) {
            const m = e.findMeasure()
            if (m) {
                const key = `${m.tick().ticks()}:${e.staffIdx()}` // C++: the MStaff of the measure
                if (!found.has(key)) {
                    result.push(e)
                    found.add(key)
                }
            }
        }
    } else if (uniqueStaves) {
        const foundStaves = new Set<staff_idx_t>()
        for (const e of sel.elements()) {
            if (!foundStaves.has(e.staffIdx())) {
                result.push(e)
                foundStaves.add(e.staffIdx())
            }
        }
    } else {
        const foundMeasures = new Set<EngravingItem>()
        for (const e of sel.elements()) {
            const mb = e.findMeasureBase()
            if (mb && !foundMeasures.has(mb)) {
                result.push(e)
                foundMeasures.add(mb)
            }
        }
    }
    return { elements: result, unique }
}

export function allowRemoveWhenRemovingStaves(item: EngravingItem | null, startStaff: staff_idx_t, endStaff: staff_idx_t = 0): boolean {
    // Sanity checks
    if (!item || item.staffIdx() === nidx || startStaff === nidx || endStaff === nidx) {
        return false
    }

    const score = item.score()
    if (score.nstaves() === 1) {
        return true
    }

    if (endStaff === 0) { // Default initialized
        endStaff = startStaff + 1
    }

    const staffIdx = item.staffIdx()
    if (staffIdx < startStaff || staffIdx >= endStaff) {
        return false
    }

    const nextRemaining = score.staff(endStaff)
    const nextRemainingIsSystemObjectStaff = !!nextRemaining && nextRemaining.isSystemObjectStaff()
    if (item.isTopSystemObject() && !nextRemainingIsSystemObjectStaff) {
        return false
    }

    return true
}

export function moveDownWhenAddingStaves(item: EngravingItem | null, startStaff: staff_idx_t, endStaff: staff_idx_t = 0): boolean {
    // Sanity checks
    if (!item || item.staffIdx() === nidx || startStaff === nidx || endStaff === nidx) {
        return false
    }

    if (item.staffIdx() < startStaff) {
        return false
    }

    if (endStaff === 0) { // Default initialized
        endStaff = startStaff + 1
    }

    const score = item.score()
    const nextAfterInserted = score.staff(endStaff)
    const nextAfterInsertedIsSystemObjectStaff = !!nextAfterInserted && nextAfterInserted.isSystemObjectStaff()
    if (item.isTopSystemObject() && !nextAfterInsertedIsSystemObjectStaff) {
        return false
    }

    return true
}

/** the system objects of the given staves (no staves: the top system objects) */
export function collectSystemObjects(score: Score, staves: readonly Staff[] = []): EngravingItem[] {
    const result: EngravingItem[] = []

    const timeSigPlacement = score.style().styleV(Sid.timeSigPlacement) as TimeSigPlacement
    const isOnStaffTimeSig = timeSigPlacement !== TimeSigPlacement.NORMAL

    for (let measure = score.firstMeasure(); measure; measure = measure.nextMeasure()) {
        for (const measureElement of measure.el()) {
            if (!measureElement || !measureElement.systemFlag() || measureElement.isLayoutBreak()) {
                continue
            }
            if (staves.length) {
                if (staves.includes(measureElement.staff()!)) {
                    result.push(measureElement)
                }
            } else if (measureElement.isTopSystemObject()) {
                result.push(measureElement)
            }
        }

        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (seg.segmentType() & (CHORD_REST_OR_TIME_TICK_TYPE | SegmentType.EndBarLine)) {
                for (const annotation of seg.annotations()) {
                    if (!annotation || !annotation.systemFlag()) {
                        continue
                    }

                    if (staves.length) {
                        if (staves.includes(annotation.staff()!)) {
                            result.push(annotation)
                        }
                    } else if (annotation.isTopSystemObject()) {
                        result.push(annotation)
                    }
                }
            }

            if (isOnStaffTimeSig && (seg.segmentType() & SegmentType.TimeSigType)) {
                for (const item of seg.elist()) {
                    if (!item || !item.isTimeSig()) {
                        continue
                    }

                    if (staves.length) {
                        if (staves.includes(item.staff()!)) {
                            result.push(item)
                        }
                    } else if (item.staffIdx() === 0) {
                        result.push(item)
                    }
                }
            }
        }
    }

    for (const spanner of score.spanner()) {
        if (!spanner.systemFlag()) {
            continue
        }

        if (staves.length) {
            if (staves.includes(spanner.staff()!)) {
                result.push(spanner)
            }
        } else if (spanner.isTopSystemObject()) {
            result.push(spanner)
        }
    }

    return result
}

//---------------------------------------------------------
//   convertLine
// find the line in clefF corresponding to lineL2 in clefR
//---------------------------------------------------------

export function convertLine(lineL2: number, clefL: ClefType, clefR: ClefType): number {
    let lineR2 = lineL2
    const goalpitch = line2pitch(lineL2, clefL, Key.C)
    let p: number
    while ((p = line2pitch(lineR2, clefR, Key.C)) > goalpitch && p < MAX_PITCH) {
        lineR2++
    }
    while ((p = line2pitch(lineR2, clefR, Key.C)) < goalpitch && p > MIN_PITCH) {
        lineR2--
    }
    return lineR2
}

/**
 * convertLine(lineL2, noteL, noteR): find the line in clef for NoteL corresponding to lineL2 in clef for noteR
 * for example middle C is line 10 in Treble clef, but is line -2 in Bass clef.
 */
export function convertLineForNotes(lineL2: number, noteL: Note, noteR: Note): number {
    return convertLine(lineL2,
        noteL.chord().staff()!.clef(noteL.chord().tick()),
        noteR.chord().staff()!.clef(noteR.chord().tick()))
}

//---------------------------------------------------------
//   chromaticPitchSteps -- an articulation such as a trill, or mordant consists of several notes
// played in succession.  The pitch offsets of each such note in the sequence can be represented either
// as a number of steps in the diatonic scale, or in half steps as on a piano keyboard.
// this function, articulationExcursion, takes deltastep indicating the number of steps in the
// diatonic scale, and calculates (and returns) the number of half steps, taking several things into account.
// E.g., the key signature, a trill from e to f, is to be understood as a trill between E and F# if we are
// in the key of G.
// E.g., if previously (looking backward in time) in the same measure there is another note on the same
// staff line/space, and that note has an accidental (sharp,flat,natural,etc), then we want to match that
// tone exactly.
// noteL is the note to measure the deltastep from, i.e., ornaments are w.r.t. this note
// noteR is the note to search backward from to find accidentals.
//    for ornament calculation noteL and noteR are the same, but for glissando they are
//     the start and end note of glissando.
// nominalDiatonicSteps is the desired number of diatonic steps between the base note and this articulation step.
//---------------------------------------------------------

export function chromaticPitchSteps(noteL: Note, noteR: Note, nominalDiatonicSteps: number): number {
    if (0 === nominalDiatonicSteps) {
        return 0
    }
    const chordL = noteL.chord()
    const chordR = noteR.chord()
    const epitchL = noteL.epitch()
    const tickL = chordL.tick()
    // we cannot use staffL = chord->staff() because that won't correspond to the noteL->line()
    //   in the case the user has pressed Shift-Cmd->Up or Shift-Cmd-Down.
    //   Therefore we have to take staffMove() into account using vStaffIdx().
    const staffL = noteL.score().staff(chordL.vStaffIdx())!
    const clefL = staffL.clef(tickL)
    // line represents the ledger line of the staff.  0 is the top line, 1, is the space between the top 2 lines,
    //  ... 8 is the bottom line.
    let lineL = noteL.line()
    if (lineL === -10000 /* INVALID_LINE */) {
        const absLine = absStep(noteL.tpc(), noteL.epitch())
        const clef = noteL.staff()!.clef(noteL.tick())
        lineL = relStep(absLine, clef)
    }

    // we use line - deltastep, because lines are oriented from top to bottom, while step is oriented from bottom to top.
    const lineL2 = lineL - nominalDiatonicSteps
    const measureR = chordR.segment().measure()

    const segment = noteL.chord().segment()
    const lineR2 = convertLineForNotes(lineL2, noteL, noteR)
    // is there another note in this segment on the same line?
    // if so, use its pitch exactly.
    let halfsteps = 0
    const staffIdx = noteL.chord().staff()!.idx() // cannot use staffL->idx() because of staffMove()
    const startTrack = staffIdx * VOICES
    const endTrack = startTrack + VOICES
    const done = false
    for (let track = startTrack; track < endTrack; ++track) {
        const e = segment.element(track)
        if (!e || !e.isChord()) {
            continue
        }
        const chord = e as unknown as Chord
        if (chord.vStaffIdx() !== chordL.vStaffIdx()) {
            continue
        }
        if (!done) {
            if (staffL.isPitchedStaff(segment.tick())) {
                const [acciv2] = measureR.findAccidentalAtLine(chordR.segment(), chordR.vStaffIdx(), lineR2)
                const acci2 = acciv2 as number
                // epitch (effective pitch) is a visible pitch so line2pitch returns exactly that.
                halfsteps = line2pitch(lineL - nominalDiatonicSteps, clefL, Key.C) + acci2 - epitchL
            } else {
                // cannot rely on accidentals or key signatures
                halfsteps = nominalDiatonicSteps
            }
        }
    }
    return halfsteps
}

export function isFirstSystemKeySig(ks: KeySig | null): boolean {
    if (!ks) {
        return false
    }
    const sys = ks.measure()!.system()
    if (!sys) {
        return false
    }
    return ks.tick().eq(sys.firstMeasure()!.tick())
}

export function formatUniqueExcerptName(baseName: string, allExcerptLowerNames: readonly string[]): string {
    let result = baseName
    let num = 0

    while (allExcerptLowerNames.includes(result.toLowerCase())) {
        result = `${baseName} (${++num})`
    }

    return result
}

/** the measure and staff at the drag position (canvas coordinates); null if there is none */
export function dragPositionToMeasure(pos: PointF, score: Score, measure: Measure | null, staffIdx: staff_idx_t,
    spacingFactor: number): { measure: Measure; staffIdx: staff_idx_t } | null {
    const preferredSystem = measure ? measure.system() : null

    const m = score.searchMeasure(pos, preferredSystem, spacingFactor)
    if (!m) {
        return null
    }

    const system = m.system()!
    const y = pos.y() - system.canvasPos().y()
    const i = system.searchStaff(y, staffIdx, spacingFactor)
    if (!score.staff(i)) {
        return null
    }

    return { measure: m, staffIdx: i }
}

/** the segment at the drag position (canvas coordinates) in the measure; null if there is none */
export function dragPositionToSegment(pos: PointF, measure: Measure, staffIdx: staff_idx_t, segment: Segment | null,
    spacingFactor: number, allowTimeAnchor: boolean): Segment | null {
    const strack = staffIdx * VOICES
    const etrack = strack + VOICES

    const x = pos.x() - measure.canvasPos().x()
    const st = allowTimeAnchor ? CHORD_REST_OR_TIME_TICK_TYPE : SegmentType.ChordRest
    const s = measure.searchSegment(x, st, strack, etrack, segment, spacingFactor)
    if (!s) {
        return null
    }

    return segmentOrChordRestSegmentAtSameTick(s)
}

export function segmentOrChordRestSegmentAtSameTick(segment: Segment): Segment {
    // If TimeTick and ChordRest segments are at the same tick, prefer ChordRest
    if (segment.isTimeTickType() && segment.measure()) {
        const crSegAtSameTick = segment.measure().findSegmentR(SegmentType.ChordRest, segment.rtick())
        if (crSegAtSameTick) {
            return crSegAtSameTick
        }
    }

    return segment
}

export function nextChordNote(note: Note): Note | null {
    const track = note.track()
    const fromTrack = Math.floor(track / VOICES) * VOICES
    const toTrack = fromTrack + VOICES
    // TODO : limit to same instrument, not simply to same staff!
    let seg = note.chord().segment()!.nextCR(track, true)
    while (seg) {
        let targetElement = seg.element(track)
        // if a chord exists in the same track, return its top note
        if (targetElement && targetElement.isChord()) {
            return (targetElement as unknown as Chord).upNote()
        }
        // if not, return topmost chord in track range
        for (let i = fromTrack; i < toTrack; i++) {
            targetElement = seg.element(i)
            if (targetElement && targetElement.isChord()) {
                return (targetElement as unknown as Chord).upNote()
            }
        }
        seg = seg.nextCR(track, true)
    }
    return null
}

export function prevChordNote(note: Note): Note | null {
    const track = note.track()
    const fromTrack = Math.floor(track / VOICES) * VOICES
    const toTrack = fromTrack + VOICES
    // TODO : limit to same instrument, not simply to same staff!
    let seg = note.chord().segment()!.prev1()
    while (seg) {
        if (seg.segmentType() === SegmentType.ChordRest) {
            let targetElement = seg.element(track)
            // if a chord exists in the same track, return its top note
            if (targetElement && targetElement.isChord()) {
                return (targetElement as unknown as Chord).upNote()
            }
            // if not, return topmost chord in track range
            for (let i = fromTrack; i < toTrack; i++) {
                targetElement = seg.element(i)
                if (targetElement && targetElement.isChord()) {
                    return (targetElement as unknown as Chord).upNote()
                }
            }
        }
        seg = seg.prev1()
    }
    return null
}
