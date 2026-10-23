/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/input.h/.cpp and noteval.h
 */

import { Fraction } from '../types/fraction'
import { BeamMode, DurationType, NoteHeadGroup, StaffGroup, VOICES, nidx, track2staff, type staff_idx_t, type track_idx_t, type voice_idx_t } from '../types/types'
import { TDuration } from './durationtype'
import { AccidentalType } from './accidentaldata'
import { NoteType } from './chordrest'
import { SegmentType, type Segment } from './segment'
import { Tpc } from './pitchspelling'
import type { SymId } from '../types/symid'
import type { EngravingItem } from './engravingitem'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Staff } from './staff'
import type { Selection } from './select'
import type { Drumset } from './drumset'
import type { Slur } from './slur'
import type { Measure } from './measure'

export const INVALID_FRET_INDEX = -1
export const INVALID_STRING_INDEX = -1

/** helper structure (C++ struct NoteVal) */
export class NoteVal {
    pitch = -1
    velocityOverride = 0
    tpc1: number = Tpc.TPC_INVALID
    tpc2: number = Tpc.TPC_INVALID
    fret = INVALID_FRET_INDEX
    string = INVALID_STRING_INDEX
    headGroup = NoteHeadGroup.HEAD_NORMAL

    constructor(p = -1) {
        this.pitch = p
    }

    clone(): NoteVal {
        return Object.assign(new NoteVal(), this)
    }

    equals(v: NoteVal): boolean {
        return this.pitch === v.pitch && this.velocityOverride === v.velocityOverride && this.tpc1 === v.tpc1
            && this.tpc2 === v.tpc2 && this.fret === v.fret && this.string === v.string && this.headGroup === v.headGroup
    }

    tpc(concertPitch: boolean): number { return concertPitch ? this.tpc1 : this.tpc2 }
    isRest(): boolean { return this.pitch === -1 }
}

export type NoteValList = NoteVal[]

// no ordinal for the visual repres. of string
// (topmost in TAB varies according to visual order and presence of bass strings)
export const VISUAL_INVALID_STRING_INDEX = -100

export enum NoteEntryMethod {
    UNKNOWN, BY_NOTE_NAME, BY_DURATION, REPITCH, RHYTHM, REALTIME_AUTO, REALTIME_MANUAL, TIMEWISE,
}

export class InputState {
    private m_track: track_idx_t = 0
    private m_prevTrack: track_idx_t = 0 // used for navigation

    private m_drumNote = -1
    private m_string = VISUAL_INVALID_STRING_INDEX // visual string selected for input (TAB staves only)

    private m_notes: NoteValList = []

    private m_lastSegment: Segment | null = null
    private m_segment: Segment | null = null // current segment

    private m_noteEntryMode = false
    private m_noteEntryMethod = NoteEntryMethod.BY_NOTE_NAME

    private m_duration = new TDuration(DurationType.V_INVALID) // currently duration
    private m_rest = false // rest mode

    private m_noteType = NoteType.NORMAL
    private m_beamMode = BeamMode.AUTO

    private m_accidentalType = AccidentalType.NONE
    private m_slur: Slur | null = null

    private m_articulationIds = new Set<SymId>()

    /** C++ copy constructor / assignment (InputState is a value type) */
    clone(): InputState {
        const c = new InputState()
        Object.assign(c, this)
        c.m_notes = this.m_notes.map(n => n.clone())
        c.m_duration = this.m_duration.clone()
        c.m_articulationIds = new Set(this.m_articulationIds)
        return c
    }

    isValid(): boolean {
        return this.m_segment !== null && this.m_track !== nidx
    }

    cr(): ChordRest | null {
        // _track could potentially be invalid, for instance after navigation through a frame
        return this.m_segment && this.m_track !== nidx ? this.m_segment.element(this.m_track) as ChordRest | null : null
    }

    tick(): Fraction {
        return this.m_segment ? this.m_segment.tick() : new Fraction(0, 1)
    }

    setDuration(d: TDuration | DurationType): void { this.m_duration = d instanceof TDuration ? d.clone() : new TDuration(d) }
    duration(): TDuration { return this.m_duration }

    setDots(n: number): void {
        if (n && (!this.m_duration.isValid() || this.m_duration.isZero() || this.m_duration.isMeasure())) {
            this.m_duration = new TDuration(DurationType.V_QUARTER)
        }
        this.m_duration.setDots(n)
    }

    ticks(): Fraction { return this.m_duration.ticks() }

    segment(): Segment | null { return this.m_segment }

    setSegment(s: Segment | null): void {
        if (s && s.measure().isMMRest()) {
            const m = s.measure().mmRestFirst()!
            s = m.findSegment(SegmentType.ChordRest, m.tick())
        }
        this.m_segment = s
        this.m_lastSegment = s
    }

    lastSegment(): Segment | null { return this.m_lastSegment }
    setLastSegment(s: Segment | null): void { this.m_lastSegment = s }

    staff(): Staff | null {
        if (!this.m_segment || this.m_track === nidx) {
            return null
        }

        return this.m_segment.score().staff(track2staff(this.m_track))
    }

    staffIdx(): staff_idx_t { return track2staff(this.m_track) }

    drumset(): Drumset | null {
        if (!this.m_segment || this.m_track === nidx) {
            return null
        }

        const staff = this.m_segment.score().staff(Math.trunc(this.m_track / VOICES))
        if (!staff) {
            return null
        }

        return staff.part().instrument(this.m_segment.tick()).drumset()
    }

    drumNote(): number { return this.m_drumNote }
    setDrumNote(v: number): void { this.m_drumNote = v }

    // Used in the input-by-duration mode
    notes(): readonly NoteVal[] { return this.m_notes }
    setNotes(v: readonly NoteVal[]): void { this.m_notes = v.map(n => n.clone()) }

    voice(): voice_idx_t { return this.m_track === nidx ? 0 : (this.m_track % VOICES) }

    setVoice(v: voice_idx_t): void {
        const score = this.m_segment ? this.m_segment.score() : null

        if (!score || v >= VOICES || v === this.voice() || this.m_track === nidx) {
            return
        }

        const newTrack = Math.trunc(this.m_track / VOICES) * VOICES + v
        const currSeg = this.segment()
        if (!currSeg || currSeg.cr(newTrack)) {
            this.setTrack(newTrack)
            return
        }

        // If we haven't returned early - it means that currSeg doesn't have a valid ChordRest for the desired voice. If
        // tuplets are involved, we may need to move the input position backwards to the last valid ChordRest...
        let candidateSeg: Segment | null = currSeg

        // First thing to check - is currSeg part of a tuplet? If so, move candidateSeg to the start of that tuplet...
        const currCR = currSeg.cr(this.track())
        const currTuplet = currCR ? currCR.topTuplet() : null
        if (currTuplet) {
            candidateSeg = score.tick2segment(currTuplet.tick())
            if (!candidateSeg) {
                this.setSegment(currSeg.measure().first())
                this.setTrack(newTrack)
                return
            }
        }

        // If candidateSeg still doesn't have a valid ChordRest for the desired voice, we'll now check whether it is
        // within the range of a tuplet at our desired voice. If so, move candidateSeg to the start of that tuplet...
        const nextCR = candidateSeg.nextChordRest(newTrack, /*backwards*/ true, /*stopAtMeasureBoundary*/ true)
        const nextTuplet = nextCR ? nextCR.topTuplet() : null
        if (!candidateSeg.cr(newTrack) && nextTuplet) {
            candidateSeg = score.tick2segment(nextTuplet.tick())
            if (!candidateSeg) {
                this.setSegment(currSeg.measure().first())
                this.setTrack(newTrack)
                return
            }
        }

        if (candidateSeg !== currSeg) {
            this.setSegment(candidateSeg)
        }

        this.setTrack(newTrack)
    }

    track(): track_idx_t { return this.m_track }
    setTrack(v: track_idx_t): void {
        this.m_prevTrack = this.m_track
        this.m_track = v
    }
    prevTrack(): track_idx_t { return this.m_prevTrack }

    string(): number { return this.m_string }
    setString(val: number): void { this.m_string = val }

    staffGroup(): StaffGroup {
        if (!this.m_segment || this.m_track === nidx) {
            return StaffGroup.STANDARD
        }

        const tick = this.m_segment.tick()
        const staff = this.m_segment.score().staff(Math.trunc(this.m_track / VOICES))
        if (!staff) {
            return StaffGroup.STANDARD
        }

        let staffGroup = staff.staffType(tick)!.group()
        const instrument = staff.part().instrument(tick)

        // if not tab, pitched/unpitched input depends on instrument, not staff (override StaffGroup)
        if (staffGroup !== StaffGroup.TAB) {
            staffGroup = instrument.useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
        }

        return staffGroup
    }

    rest(): boolean { return this.m_rest }
    setRest(v: boolean): void { this.m_rest = v }

    noteType(): NoteType { return this.m_noteType }
    setNoteType(t: NoteType): void { this.m_noteType = t }

    beamMode(): BeamMode { return this.m_beamMode }
    setBeamMode(m: BeamMode): void { this.m_beamMode = m }

    noteEntryMode(): boolean { return this.m_noteEntryMode }
    setNoteEntryMode(v: boolean): void { this.m_noteEntryMode = v }

    noteEntryMethod(): NoteEntryMethod { return this.m_noteEntryMethod }
    setNoteEntryMethod(m: NoteEntryMethod): void { this.m_noteEntryMethod = m }
    usingNoteEntryMethod(m: NoteEntryMethod): boolean { return m === this.noteEntryMethod() }

    accidentalType(): AccidentalType { return this.m_accidentalType }
    setAccidentalType(val: AccidentalType): void { this.m_accidentalType = val }

    articulationIds(): ReadonlySet<SymId> { return this.m_articulationIds }
    setArticulationIds(ids: Iterable<SymId>): void { this.m_articulationIds = new Set(ids) }

    slur(): Slur | null { return this.m_slur }
    setSlur(s: Slur | null): void { this.m_slur = s }

    // TODO: unify with Selection::cr()?
    static note(e: EngravingItem | null): Note | null {
        return e && e.isNote() ? e as unknown as Note : null
    }

    static chordRest(e: EngravingItem | null): ChordRest | null {
        if (!e) {
            return null
        }
        if (e.isChordRest()) {
            return e as unknown as ChordRest
        }
        if (e.isNote()) {
            return (e as unknown as Note).chord()
        }
        if (e.isStem() || e.isHook()) {
            return (e as unknown as { chord(): Chord }).chord()
        }
        return null
    }

    update(selection: Selection): void {
        this.setDuration(DurationType.V_INVALID)
        this.setRest(false)
        this.setAccidentalType(AccidentalType.NONE)
        this.setNotes([])

        let n1: Note | null = null
        let cr1: ChordRest | null = null
        let differentAccidentals = false
        let differentDurations = false
        let chordsAndRests = false

        // TODO(port): articulations of the selected notes (splitArticulations/flipArticulations/joinArticulations)
        for (const e of selection.elements()) {
            const n = InputState.note(e)
            if (n) {
                if (n1) {
                    if (n.accidentalType() !== n1.accidentalType()) {
                        this.setAccidentalType(AccidentalType.NONE)
                        differentAccidentals = true
                    }
                } else {
                    this.setAccidentalType(n.accidentalType())
                    n1 = n
                }
            }

            const cr = InputState.chordRest(e)
            if (cr) {
                if (cr1) {
                    if (!cr.durationType().equals(cr1.durationType())) {
                        this.setDuration(DurationType.V_INVALID)
                        differentDurations = true
                    }
                    if ((cr.isRest() && !cr1.isRest()) || (!cr.isRest() && cr1.isRest())) {
                        this.setRest(false)
                        chordsAndRests = true
                    }
                } else {
                    this.setDuration(cr.durationType())
                    this.setRest(cr.isRest())
                    cr1 = cr
                }
            }

            if (differentAccidentals && differentDurations && chordsAndRests) {
                break
            }
        }

        const e = selection.element()
        if (!e) {
            if (!selection.isNone()) {
                this.setTrack(selection.activeTrack())
                this.setSegment(selection.startSegment())
            }
            return
        }

        const cr = InputState.chordRest(e)
        let n = InputState.note(e)
        if (!n && cr && cr.isChord()) {
            n = (cr as Chord).upNote()
        }

        if (cr) {
            this.setTrack(cr.track())
            this.setNoteType(n ? n.noteType() : NoteType.NORMAL)
            this.setBeamMode(cr.beamMode())
        }

        this.setDrumNote(-1)
        if (n) {
            const instr = n.part()!.instrument(n.tick())
            if (instr.useDrumset()) {
                this.setDrumNote(n.pitch())
            }
        }
    }

    moveInputPos(e: EngravingItem | null): void {
        if (!e) {
            return
        }

        let s: Segment
        if (e.isChordRest()) {
            s = (e as unknown as ChordRest).segment()
        } else {
            s = e as unknown as Segment
        }

        if (s.isSegment()) {
            if (s.measure().isMMRest()) {
                const m: Measure = s.measure().mmRestFirst()!
                s = m.findSegment(SegmentType.ChordRest, m.tick())!
            }
            this.m_lastSegment = this.m_segment
            this.m_segment = s
        }
    }

    private nextInputPos(): Segment | null {
        const m = this.m_segment!.measure()
        let s = this.m_segment!.next1(SegmentType.ChordRest)
        while (s) {
            if (s.element(this.m_track) || s.measure() !== m) {
                return s
            }
            s = s.next1(SegmentType.ChordRest)
        }
        return null
    }

    // TODO: special case: note is first note of tie: goto to last note of tie
    moveToNextInputPos(): void {
        const s = this.nextInputPos()
        this.m_lastSegment = this.m_segment
        if (s) {
            this.m_segment = s
        }
    }

    endOfScore(): boolean {
        return (this.m_lastSegment === this.m_segment) && !this.nextInputPos()
    }
}
