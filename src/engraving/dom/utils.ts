/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/utils.h/.cpp (subset)
 */

import { Fraction } from '../types/fraction'
import { SymId, type SymIdList } from '../types/symid'
import { AccidentalVal, ClefType, Key, TimeSigStyle, VOICES, type staff_idx_t, type track_idx_t } from '../types/types'
import { ClefInfo } from './clefinfo'
import {
    MIN_PITCH, PITCH_DELTA_OCTAVE, Prefer, STEP_DELTA_OCTAVE, clampPitch, pitch2tpc, tpc2pitch, tpc2step,
} from './pitchspelling'
import type { Tuplet } from './tuplet'
import { SegmentType, type Segment } from './segment'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { Note } from './note'
import type { Rest } from './rest'
import type { Measure } from './measure'
import type { System } from './system'
import type { EngravingItem } from './engravingitem'
import type { Spanner } from './spanner'
import type { Staff } from './staff'
import type { NoteVal } from './input'
import { Sid } from '../style/styledef'
import { Tpc, tpc2alter } from './pitchspelling'

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
