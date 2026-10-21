/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/noteentry.cpp (note input: Score::noteValForPosition, addPitch, putNote, ...) and of
 * Score::padToggle and Score::getPosition of score.cpp. The functions are added to Score by this module (module
 * augmentation), so it must be imported before they are used.
 *
 * TODO(port): the message box when note input removes a measure repeat (the repeat is removed without asking),
 * excerpts (tracks mapping).
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { DirectionV, DurationType, NoteHeadGroup, StaffGroup, VOICES, nidx, track2staff, type track_idx_t, type voice_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { Score, Pad, Position } from './score'
import { InputState, NoteEntryMethod, NoteVal, INVALID_FRET_INDEX } from './input'
import { AccidentalType } from './accidentaldata'
import { Accidental } from './accidental'
import { SegmentType, type Segment } from './segment'
import { toDurationList } from './durationtype'
import { MAX_PITCH, MIN_PITCH, step2tpc } from './pitchspelling'
import { absStep, absStepFromLine, relStep, step2pitch } from './utils'
import { StringData } from './stringdata'
import { SelectType } from './select'
import { nextChordRest, type Chord } from './chord'
import { Transpose } from '../editing/transpose'
import type { EngravingItem } from './engravingitem'
import type { ChordRest } from './chordrest'
import type { Note } from './note'
import type { Rest } from './rest'
import type { Measure } from './measure'
import type { SysStaff, System } from './system'

declare module './score' {
    interface Score {
        /** null: C++ error = true */
        noteValForPosition(pos: Position, at: AccidentalType): NoteVal | null
        addPitch(nval: NoteVal, addFlag: boolean, externalInputState?: InputState | null): Note | null
        addPitchToChord(nval: NoteVal, chord: Chord, externalInputState?: InputState | null, forceAccidental?: boolean): Note | null
        /**
         * C++ putNote(const PointF&, bool replace, bool insert) (mouse click in note input) and
         * putNote(const Position&, bool replace); false: C++ returns an error
         */
        putNote(pos: PointF | Position, replace: boolean, insert?: boolean): boolean
        handleOverlappingChordRest(inputState: InputState): void
        /** C++ Score::getPosition (score.cpp): null if no valid position is found */
        getPosition(p: PointF, voice: voice_idx_t): Position | null
        /** C++ Score::padToggle (score.cpp) */
        padToggle(p: Pad, toggleForSelectionOnly?: boolean): void
    }
}

Score.prototype.noteValForPosition = function (this: Score, pos: Position, at: AccidentalType): NoteVal | null {
    const is = this.inputState()
    const s = pos.segment!
    let line = pos.line
    const tick = s.tick()
    const staffIdx = pos.staffIdx
    const st = this.staff(staffIdx)!
    const clef = st.clef(tick)
    const instr = st.part().instrument(s.tick())
    const nval = new NoteVal()
    let stringData: StringData | null = null

    // pitched/unpitched note entry depends on instrument (override StaffGroup)
    let staffGroup = st.staffType(tick).group()
    if (staffGroup !== StaffGroup.TAB) {
        staffGroup = instr.useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
    }

    if (staffGroup !== StaffGroup.PERCUSSION) {
        stringData = st.part().stringData(s.tick(), st.idx())
    }

    switch (staffGroup) {
    case StaffGroup.PERCUSSION: {
        if (is.rest()) {
            break
        }
        const ds = instr.drumset()!
        nval.pitch = is.drumNote()
        if (!ds.isValid(nval.pitch) || ds.line(nval.pitch) !== line) {
            // Drum note from input state is not valid - fall back to the first valid pitch for this line...
            const defaultPitch = ds.defaultPitchForLine(line)
            if (ds.isValid(defaultPitch)) {
                nval.pitch = defaultPitch
            }
        }
        if (nval.pitch < 0) {
            return null
        }
        nval.headGroup = ds.noteHead(nval.pitch)
        if (nval.headGroup === NoteHeadGroup.HEAD_INVALID) {
            return null
        }
        break
    }
    case StaffGroup.TAB: {
        if (is.rest()) {
            return nval
        }
        line = st.staffType(tick).visualStringToPhys(line)
        if (!stringData || line < 0 || line >= stringData.strings()) {
            return null
        }
        // build a default NoteVal for that string
        nval.string = line
        if (pos.fret !== INVALID_FRET_INDEX) { // if a fret is given, use it
            nval.fret = pos.fret
        } else { // if no fret, use 0 as default
            is.setString(line)
            nval.fret = 0
        }
        // reduce within fret limit
        if (nval.fret > stringData.frets()) {
            nval.fret = stringData.frets()
        }
        // for open strings, only accepts fret 0 (strings in StringData are from bottom to top)
        const strgDataIdx = stringData.strings() - line - 1
        if (nval.fret > 0 && stringData.stringList()[strgDataIdx].open) {
            nval.fret = 0
        }
        nval.pitch = stringData.getPitch(line, nval.fret, StringData.pitchOffsetAt(st, pos.segment!.tick()))
        break
    }

    case StaffGroup.STANDARD: {
        let acci: number
        if (at === AccidentalType.NONE) {
            const [a, error] = s.measure().findAccidentalAtLine(s, staffIdx, line)
            if (error) {
                return null
            }
            acci = a
        } else {
            acci = Accidental.subtype2value(at)
        }
        const step = absStepFromLine(line, clef)
        const octave = Math.trunc(step / 7)
        nval.pitch = step2pitch(step) + octave * 12 + acci
        if (this.style().styleB(Sid.concertPitch)) {
            nval.tpc1 = step2tpc(step % 7, acci)
        } else {
            nval.pitch += instr.transpose().chromatic
            nval.tpc2 = step2tpc(step % 7, acci)
            const v = st.transpose(tick)
            if (v.isZero()) {
                nval.tpc1 = nval.tpc2
            } else {
                nval.tpc1 = Transpose.transposeTpc(nval.tpc2, v, true)
            }
        }
        if (stringData) {
            const r = stringData.convertPitch(nval.pitch, StringData.pitchOffsetAt(st, pos.segment!.tick()))
            nval.string = r.string
            nval.fret = r.fret
        }
        break
    }
    }
    return nval
}

Score.prototype.addPitch = function (this: Score, nval: NoteVal, addFlag: boolean, externalInputState: InputState | null = null): Note | null {
    const is = externalInputState ?? this.inputState()

    if (addFlag) {
        const c = is.lastSegment()?.element(is.track()) as unknown as ChordRest | null
        if (!c || !c.isChord()) {
            // C++: LOGD("Score::addPitch: cr %s", c ? c->typeName() : "zero")
            return null
        }

        return this.addPitchToChord(nval, c as Chord, externalInputState)
    }

    this.expandVoice(is.segment(), is.track())

    // insert note
    let stemDirection = DirectionV.AUTO
    let track = is.track()
    const ds = is.drumset()
    if (ds) {
        if (!ds.isValid(nval.pitch)) {
            return null
        }

        nval.headGroup = ds.noteHead(nval.pitch)
        stemDirection = ds.stemDirection(nval.pitch)
        track = ds.voice(nval.pitch) + Math.trunc(is.track() / VOICES) * VOICES
        is.setTrack(track)
        this.expandVoice(is.segment(), is.track())
    }

    if (!is.cr()) {
        this.handleOverlappingChordRest(is)
    }

    const measure = is.segment()!.measure()
    if (measure.isMeasureRepeatGroup(track2staff(track))) {
        const mr = measure.measureRepeatElement(track2staff(track))
        if (mr) {
            this.deleteItem(mr) // resets any measures related to mr
        }
    }
    let duration: Fraction
    if (is.usingNoteEntryMethod(NoteEntryMethod.REALTIME_AUTO) || is.usingNoteEntryMethod(NoteEntryMethod.REALTIME_MANUAL)) {
        // FIXME: truncate duration at barline in real-time modes.
        const ticks2measureEnd = is.segment()!.measure().ticks().minus(is.segment()!.rtick())
        duration = is.duration().fraction().gt(ticks2measureEnd) ? ticks2measureEnd : is.duration().fraction()
    } else {
        duration = is.duration().fraction()
    }
    let note: Note | null = null
    let lastTiedNote: Note | null = null
    if (is.usingNoteEntryMethod(NoteEntryMethod.REPITCH) && is.cr()?.isChord()) {
        const chord = is.cr() as unknown as Chord
        ;[note, lastTiedNote] = this.repitchReplaceNote(chord, nval) // the add (not replace) case was handled above
    } else if (!is.usingNoteEntryMethod(NoteEntryMethod.REPITCH)) {
        const seg = this.setNoteRest(is.segment()!, track, nval, duration, stemDirection, /* forceAccidental */ false,
            is.articulationIds(), /* rhythmic */ false, externalInputState)
        if (seg) {
            note = (seg.element(track) as unknown as Chord).upNote()
        }
    }

    const slur = is.slur()
    if (slur) {
        //
        // extend slur
        //
        const e = this.searchNote(is.tick(), is.track())
        const ee = slur.startElement()
        if (e && ee) {
            let stick = new Fraction(0, 1)
            if (ee.isChordRest()) {
                stick = (ee as unknown as ChordRest).tick()
            } else if (ee.isNote()) {
                stick = (ee as unknown as Note).chord().tick()
            }
            if (stick.eq(e.tick())) {
                slur.setTick(stick)
                slur.setStartElement(e)
            } else {
                slur.setTick2(e.tick())
                slur.setEndElement(e)
            }
        } else {
            // C++: LOGD("addPitch: cannot find slur note")
        }
    }
    if (is.usingNoteEntryMethod(NoteEntryMethod.REPITCH)) {
        // move cursor to next note, but skip tied notes (they were already repitched above)
        let next = lastTiedNote ? nextChordRest(lastTiedNote.chord()) : (is.cr() ? nextChordRest(is.cr()!) : null)
        while (next && !next.isChord()) {
            next = nextChordRest(next)
        }
        if (next) {
            is.moveInputPos(next.segment() as unknown as EngravingItem)
        }
    } else {
        const entryMethod = is.noteEntryMethod()
        if (entryMethod !== NoteEntryMethod.REALTIME_AUTO && entryMethod !== NoteEntryMethod.REALTIME_MANUAL) {
            is.moveToNextInputPos()
        }
    }
    return note
}

Score.prototype.addPitchToChord = function (this: Score, nval: NoteVal, chord: Chord, externalInputState: InputState | null = null,
    forceAccidental = false): Note | null {
    if (!chord) {
        return null
    }

    const is = externalInputState ?? this.inputState()

    const isTied = (ch: Chord): boolean => {
        if (ch.notes().length === 0) {
            return false
        }
        const n = ch.notes()[0]
        return !!n.tieFor() || !!n.tieBack()
    }

    let note: Note | null
    if (isTied(chord)) {
        note = this.addNoteToTiedChord(chord, nval, forceAccidental)
        if (!note) {
            note = this.addNote(chord, nval, forceAccidental, /* articulationIds */ new Set(), externalInputState)
        }
    } else {
        note = this.addNote(chord, nval, forceAccidental, /* articulationIds */ new Set(), externalInputState)
    }

    if (is.usingNoteEntryMethod(NoteEntryMethod.REPITCH)) {
        // move cursor to next note
        let next = nextChordRest(note.chord())
        while (next && !next.isChord()) {
            next = nextChordRest(next)
        }
        if (next) {
            is.moveInputPos(next.segment() as unknown as EngravingItem)
        }
    } else if (is.lastSegment() === is.segment()) {
        const entryMethod = is.noteEntryMethod()
        if (entryMethod !== NoteEntryMethod.REALTIME_AUTO && entryMethod !== NoteEntryMethod.REALTIME_MANUAL) {
            is.moveToNextInputPos()
        }
    }

    return note
}

Score.prototype.putNote = function (this: Score, pos: PointF | Position, replace: boolean, insert = false): boolean {
    if (pos instanceof PointF) {
        // mouse click in state NoteType::ENTRY
        const p = this.getPosition(pos, this.inputState().voice())
        if (!p) {
            // C++: LOGD("cannot put note here, get position failed")
            return false
        }

        const score = p.segment!.score()
        // it is not safe to call Score::repitchNote() if p is on a TAB staff
        const isTablature = this.staff(p.staffIdx)!.isTabStaff(p.segment!.tick())

        //  calculate actual clicked line from staffType offset and stepOffset
        const ss = score.staff(p.staffIdx)!
        const stepOffset = ss.staffType(p.segment!.tick()).stepOffset()
        const stYOffset = ss.staffType(p.segment!.tick()).yoffset().val()
        const lineDist = ss.staffType(p.segment!.tick()).lineDistance().val()
        p.line -= stepOffset + 2 * stYOffset / lineDist

        if (score.inputState().usingNoteEntryMethod(NoteEntryMethod.REPITCH) && !isTablature) {
            return score.repitchNote(p, replace)
        } else {
            if (insert || score.inputState().usingNoteEntryMethod(NoteEntryMethod.TIMEWISE)) {
                return score.insertChordByInsertingTime(p)
            } else {
                return score.putNote(p, replace)
            }
        }
    }

    // C++ putNote(const Position& p, bool replace)
    const p = pos
    const is = this.inputState()
    const st = this.staff(p.staffIdx)!
    const s = p.segment!

    is.setTrack(p.staffIdx * VOICES + is.voice())
    is.setSegment(s)

    // TODO(port): excerpts (tracks mapping of the excerpt)

    let stemDirection = DirectionV.AUTO
    const nval = this.noteValForPosition(p, is.accidentalType())
    if (!nval) {
        return false
    }

    // delete MeasureRepeat if necessary
    // TODO(port): C++ asks first ("Note input will remove measure repeat")
    const m = is.segment()!.measure()
    const staffIdx = track2staff(is.track())
    if (m.isMeasureRepeatGroup(staffIdx)) {
        const mr = m.measureRepeatElement(staffIdx)
        if (mr) {
            this.deleteItem(mr)
        }
    }

    let stringData: StringData | null = null

    // pitched/unpitched note entry depends on instrument (override StaffGroup)
    let staffGroup = st.staffType(s.tick()).group()
    if (staffGroup !== StaffGroup.TAB) {
        staffGroup = st.part().instrument(s.tick()).useDrumset() ? StaffGroup.PERCUSSION : StaffGroup.STANDARD
    }

    switch (staffGroup) {
    case StaffGroup.PERCUSSION: {
        const ds = st.part().instrument(s.tick()).drumset()
        if (ds) {
            stemDirection = ds.stemDirection(nval.pitch)
            is.setVoice(ds.voice(nval.pitch))
        }
        break
    }
    case StaffGroup.TAB:
        stringData = st.part().stringData(s.tick(), st.idx())
        is.setDrumNote(-1)
        break
    case StaffGroup.STANDARD:
        is.setDrumNote(-1)
        break
    }

    this.expandVoice()

    // If there's an overlapping ChordRest at the current input position, shorten it...
    if (!is.cr()) {
        this.handleOverlappingChordRest(is)
    }

    const cr = is.cr()

    const checkTied = (): boolean => {
        if (!cr || !cr.isChord()) {
            return false
        }
        const ch = cr as Chord
        return ch.notes().length > 0 && !ch.notes()[0].tieBack() && !!ch.notes()[0].tieFor()
    }

    let addToChord = false
    const shouldAddAsTied = checkTied()

    if (cr) {
        // retrieve total duration of current chord
        const d = cr.durationType()
        // if not in replace mode AND chord duration == input duration AND not rest input
        // we need to add to current chord (otherwise, we will need to replace it or create a new one)
        if (!replace
            && (d.equals(is.duration()) || shouldAddAsTied)
            && cr.isChord()
            && !is.rest()) {
            if (st.isTabStaff(cr.tick())) { // TAB
                // if a note on same string already exists, update to new pitch/fret
                for (const note of (cr as Chord).notes()) {
                    if (note.string() === nval.string) { // if string is the same
                        // if adding a new digit will keep fret number within fret limit,
                        // add a digit to existing fret number
                        if (stringData) {
                            const fret = note.fret() * 10 + nval.fret
                            if (fret <= stringData.frets()) {
                                nval.fret = fret
                                nval.pitch = stringData.getPitch(nval.string, nval.fret, StringData.pitchOffsetAtStaff(st))
                            } else {
                                // C++: LOGD("can't increase fret to %d", fret)
                            }
                        }
                        // set fret number (original or combined) in all linked notes
                        const tpc1 = note.tpc1default(nval.pitch)
                        const tpc2 = note.tpc2default(nval.pitch)
                        this.undoChangeFretting(note, nval.pitch, nval.string, nval.fret, tpc1, tpc2)
                        // TODO(port): setPlayNote(true)
                        return true
                    }
                }
            } else { // not TAB
                // if a note with the same pitch already exists in the chord, remove it
                const chord = cr as Chord
                const note = chord.findNote(nval.pitch)
                if (note) {
                    if (chord.notes().length > 1) {
                        this.undoRemoveElement(note)
                    }
                    return true
                }
            }
            addToChord = true // if no special case, add note to chord
        }
    }
    let forceAccidental = false
    if (is.accidentalType() !== AccidentalType.NONE) {
        const nval2 = this.noteValForPosition(p, AccidentalType.NONE)
        forceAccidental = !!nval2 && (nval.pitch === nval2.pitch)
    }

    let ret = true

    if (addToChord && cr!.isChord()) {
        // if adding, add!
        const chord = cr as Chord
        if (shouldAddAsTied) {
            const n = this.addNoteToTiedChord(chord, nval, forceAccidental, is.articulationIds())
            if (!n) {
                ret = false
            }

            is.setAccidentalType(AccidentalType.NONE)
            return ret
        }
        const note = this.addNote(chord, nval, forceAccidental, is.articulationIds())
        if (!note) {
            ret = false
        }

        is.setAccidentalType(AccidentalType.NONE)
        return ret
    } else {
        // if not adding, replace current chord (or create a new one)
        if (is.rest()) {
            nval.pitch = -1
        }

        const seg = this.setNoteRest(is.segment()!, is.track(), nval, is.duration().fraction(), stemDirection, forceAccidental,
            is.articulationIds())
        if (!seg) {
            ret = false
        }

        is.setAccidentalType(AccidentalType.NONE)
    }

    if (cr && !st.isTabStaff(cr.tick())) {
        is.moveToNextInputPos()
    }

    return ret
}

Score.prototype.handleOverlappingChordRest = function (this: Score, inputState: InputState): void {
    const ms = this.masterScore()
    const prevCr = inputState.segment()!.nextChordRest(inputState.track(), /*backwards*/ true, /*stopAtMeasureBoundary*/ true)
    if (prevCr && prevCr.endTick().gt(inputState.tick())) {
        const overlapDuration = prevCr.endTick().minus(inputState.tick())
        const desiredDuration = prevCr.ticks().minus(overlapDuration)

        const inputStateToRestore = inputState.clone() // because changeCRlen will alter the input state
        ms.changeCRlen(prevCr, desiredDuration, /*fillWithRest*/ true)

        // Fill the difference with tied notes if necessary...
        const difference = desiredDuration.minus(prevCr.ticks())
        if (prevCr.isChord() && difference.isNotZero()) {
            let startTick = prevCr.endTick()
            let prevChord: Chord | null = prevCr as Chord
            const durationList = toDurationList(difference, true)
            for (const dur of durationList) {
                prevChord = ms.addChord(startTick, dur, prevChord!, /*genTie*/ !!prevChord, prevChord!.tuplet())
                startTick = startTick.plus(dur.fraction())
            }
        }

        // C++: inputState = inputStateToRestore (assignment of the referenced object)
        Object.assign(inputState, inputStateToRestore)
    }
}

function getNextValidInputSegment(segment: Segment | null, track: track_idx_t, voice: voice_idx_t): Segment | null {
    if (!segment) {
        return null
    }

    // C++: assert(segment->segmentType() == SegmentType::ChordRest)

    let nextTick = segment.measure().tick()
    for (let s1: Segment | null = segment; s1; s1 = s1.prev(SegmentType.ChordRest)) {
        const element = s1.element(track + voice)
        if (element) {
            nextTick = (element as unknown as ChordRest).endTick()
            break
        }
    }

    for (; segment; segment = segment.next(SegmentType.ChordRest)) {
        if (segment.element(track + voice) || (voice && segment.tick().eq(nextTick))) {
            break
        }
    }

    return segment
}

Score.prototype.getPosition = function (this: Score, p: PointF, voice: voice_idx_t): Position | null {
    let preferredSystem: System | null = null
    let preferredStaffIdx = nidx
    const spacingFactor = 0.5
    const preferredSpacingFactor = 0.75
    if (this.noteEntryMode() && this.inputState().staffGroup() !== StaffGroup.TAB) {
        // for non-tab staves, prefer the current system & staff
        // this makes it easier to add notes far above or below the staff
        // not helpful for tab since notes are not entered above or below
        const seg = this.inputState().segment()
        if (seg) {
            preferredSystem = seg.system()
        }
        const track = this.inputState().track()
        if (track !== nidx) {
            preferredStaffIdx = track >> 2
        }
    }
    const measure: Measure | null = this.searchMeasure(p, preferredSystem, spacingFactor, preferredSpacingFactor)
    if (!measure) {
        return null
    }

    const pos = new Position()
    pos.fret = INVALID_FRET_INDEX
    //
    //    search staff
    //
    pos.staffIdx = 0
    let sstaff: SysStaff | null = null
    const system = measure.system()!
    const y = p.y() - system.pagePos().y()
    for (; pos.staffIdx < this.nstaves(); ++pos.staffIdx) {
        const st = this.staff(pos.staffIdx)!
        if (!st.part().show()) {
            continue
        }
        let sy2: number
        const ss = system.staff(pos.staffIdx)!
        if (!ss.show()) {
            continue
        }
        let idx = nidx
        let nstaff: SysStaff | null = null

        // find next visible staff
        for (let i = pos.staffIdx + 1; i < this.nstaves(); ++i) {
            const sti = this.staff(i)!
            if (!sti.part().show()) {
                continue
            }
            nstaff = system.staff(i)
            if (!nstaff || !nstaff.show()) {
                nstaff = null
                continue
            }
            if (i === preferredStaffIdx) {
                idx = i
            }
            break
        }

        if (nstaff) {
            let currentSpacingFactor: number
            if (pos.staffIdx === preferredStaffIdx) {
                currentSpacingFactor = preferredSpacingFactor
            } else if (idx === preferredStaffIdx) {
                currentSpacingFactor = 1.0 - preferredSpacingFactor
            } else {
                currentSpacingFactor = spacingFactor
            }
            const s1y2 = ss.bbox().bottom()
            sy2 = system.page()!.canvasPos().y() + s1y2 + (nstaff.bbox().y() - s1y2) * currentSpacingFactor
        } else {
            sy2 = system.page()!.canvasPos().y() + system.page()!.height() - system.pagePos().y() // system->height();
        }
        if (y < sy2) {
            sstaff = ss
            break
        }
    }
    if (!sstaff) {
        return null
    }

    //
    //    search segment
    //
    const pppp = p.minus(measure.canvasPos())
    let x = pppp.x()
    let segment: Segment | null
    pos.segment = null

    const track = pos.staffIdx * VOICES

    for (segment = measure.first(SegmentType.ChordRest); segment;) {
        segment = getNextValidInputSegment(segment, track, voice)
        if (!segment) {
            break
        }
        const ns = getNextValidInputSegment(segment.next(SegmentType.ChordRest), track, voice)

        const x1 = segment.x()
        let x2: number
        let d: number
        if (ns) {
            x2 = ns.x()
            d = x2 - x1
        } else {
            x2 = measure.ldata().bbox().width()
            d = (x2 - x1) * 2.0
            x = x1
            pos.segment = segment
            break
        }

        if (x < (x1 + d * 0.5)) {
            x = x1
            pos.segment = segment
            break
        }
        segment = ns
    }
    if (!segment) {
        return null
    }
    //
    // TODO: restrict to reasonable values (pitch 0-127)
    //
    const s = this.staff(pos.staffIdx)!
    const tick = segment.tick()
    const mag = s.staffMag(tick)
    // in TABs, step from one string to another; in other staves, step on and between lines
    const lineDist = s.staffType(tick).lineDistance().val()
        * (s.isTabStaff(measure.tick()) ? 1 : 0.5)
        * mag
        * this.style().spatium()

    const yOff = sstaff.yOffset() // Get system staff vertical offset (usually for 1-line staves)
    pos.line = Math.round((pppp.y() - sstaff.bbox().y() - yOff) / lineDist)
    if (s.isTabStaff(measure.tick())) {
        if (pos.line < -1 || pos.line > s.lines(tick) + 1) {
            return null
        }
        if (pos.line < 0) {
            pos.line = 0
        } else if (pos.line >= s.lines(tick)) {
            pos.line = s.lines(tick) - 1
        }
    } else {
        let minLine = absStep(MIN_PITCH)
        const clef = s.clef(pos.segment!.tick())
        minLine = relStep(minLine, clef)
        let maxLine = absStep(MAX_PITCH)
        maxLine = relStep(maxLine, clef)

        if (pos.line > minLine || pos.line < maxLine) {
            return null
        }
    }

    const yy = sstaff.y() + pos.line * lineDist
    pos.pos = new PointF(x, yy).plus(measure.canvasPos())
    return pos
}

Score.prototype.padToggle = function (this: Score, p: Pad, toggleForSelectionOnly = false): void {
    const is = this.inputState()
    if (!this.noteEntryMode()) {
        for (const cr of this.getSelectedChordRests()) {
            if (cr.isChord() && (cr as Chord).isTrillCueNote()) {
                return
            }
        }
    }

    const oldDuration = is.duration().clone()
    const oldRest = is.rest()
    const oldAccidentalType = is.accidentalType()

    switch (p) {
    case Pad.NOTE00:
        is.setDuration(DurationType.V_LONG)
        break
    case Pad.NOTE0:
        is.setDuration(DurationType.V_BREVE)
        break
    case Pad.NOTE1:
        is.setDuration(DurationType.V_WHOLE)
        break
    case Pad.NOTE2:
        is.setDuration(DurationType.V_HALF)
        break
    case Pad.NOTE4:
        is.setDuration(DurationType.V_QUARTER)
        break
    case Pad.NOTE8:
        is.setDuration(DurationType.V_EIGHTH)
        break
    case Pad.NOTE16:
        is.setDuration(DurationType.V_16TH)
        break
    case Pad.NOTE32:
        is.setDuration(DurationType.V_32ND)
        break
    case Pad.NOTE64:
        is.setDuration(DurationType.V_64TH)
        break
    case Pad.NOTE128:
        is.setDuration(DurationType.V_128TH)
        break
    case Pad.NOTE256:
        is.setDuration(DurationType.V_256TH)
        break
    case Pad.NOTE512:
        is.setDuration(DurationType.V_512TH)
        break
    case Pad.NOTE1024:
        is.setDuration(DurationType.V_1024TH)
        break
    case Pad.REST:
        if (this.noteEntryMode()) {
            is.setRest(!is.rest())
            is.setAccidentalType(AccidentalType.NONE)
        } else if (this.selection().isNone()) {
            is.setDuration(DurationType.V_QUARTER)
            is.setRest(true)
        } else {
            for (const cr of this.getSelectedChordRests()) {
                if (!cr.isRest()) {
                    this.setNoteRest(cr.segment(), cr.track(), new NoteVal(), cr.durationTypeTicks(), DirectionV.AUTO, false,
                        is.articulationIds())
                }
            }
        }
        break
    case Pad.DOT:
        if ((is.duration().dots() === 1) || (is.duration().equals(DurationType.V_1024TH))) {
            is.setDots(0)
        } else {
            is.setDots(1)
        }
        break
    case Pad.DOT2:
        if ((is.duration().dots() === 2)
            || (is.duration().equals(DurationType.V_512TH))
            || (is.duration().equals(DurationType.V_1024TH))) {
            is.setDots(0)
        } else {
            is.setDots(2)
        }
        break
    case Pad.DOT3:
        if ((is.duration().dots() === 3)
            || (is.duration().equals(DurationType.V_256TH))
            || (is.duration().equals(DurationType.V_512TH))
            || (is.duration().equals(DurationType.V_1024TH))) {
            is.setDots(0)
        } else {
            is.setDots(3)
        }
        break
    case Pad.DOT4:
        if ((is.duration().dots() === 4)
            || (is.duration().equals(DurationType.V_128TH))
            || (is.duration().equals(DurationType.V_256TH))
            || (is.duration().equals(DurationType.V_512TH))
            || (is.duration().equals(DurationType.V_1024TH))) {
            is.setDots(0)
        } else {
            is.setDots(4)
        }
        break
    }
    if (p >= Pad.NOTE00 && p <= Pad.NOTE1024) {
        is.setDots(0)
        //
        // if in "note enter" mode, reset
        // rest flag
        //
        if (this.noteEntryMode() && !toggleForSelectionOnly) {
            if (this.usingNoteEntryMethod(NoteEntryMethod.BY_DURATION) || this.usingNoteEntryMethod(NoteEntryMethod.RHYTHM)) {
                switch (oldDuration.dots()) {
                case 1:
                    this.padToggle(Pad.DOT)
                    break
                case 2:
                    this.padToggle(Pad.DOT2)
                    break
                case 3:
                    this.padToggle(Pad.DOT3)
                    break
                case 4:
                    this.padToggle(Pad.DOT4)
                    break
                }

                if (is.rest()) {
                    // Enter a rest
                    this.setNoteRest(is.segment()!, is.track(), new NoteVal(), is.duration().fraction())
                    is.moveToNextInputPos()
                } else {
                    if (this.usingNoteEntryMethod(NoteEntryMethod.RHYTHM)) {
                        const selectedItem = this.selection().element()
                        if (selectedItem && selectedItem.isNote()) {
                            is.setNotes([(selectedItem as unknown as Note).noteVal()])
                        }
                    }

                    const cr = is.cr()
                    let chord: Chord | null = null

                    if (cr && cr.isChord() && cr.durationType().equals(is.duration())) {
                        chord = cr as Chord
                    }

                    for (const nval of is.notes()) {
                        if (chord && chord.findNote(nval.pitch)) {
                            is.moveToNextInputPos()
                            continue
                        }

                        const copy = nval.clone()
                        let note: Note | null

                        if (chord) {
                            note = this.addPitchToChord(copy, chord)
                        } else {
                            note = this.addPitch(copy, false /*addFlag*/)
                        }

                        if (note) {
                            chord = note.chord()
                        }
                    }
                }
            } else {
                is.setRest(false)
            }
        }
    }

    if (this.noteEntryMode()) {
        if (!toggleForSelectionOnly || this.selection().isNone()) {
            return
        }
    }

    let crs: ChordRest[] = []
    const elementsToSelect: EngravingItem[] = []

    if (this.selection().isSingle()) {
        const e = this.selection().element()!
        let cr = InputState.chordRest(e)

        // do not allow to add a dot on a full measure rest
        if (cr && cr.isRest()) {
            const r = cr as Rest
            if (r.isFullMeasureRest()) {
                is.setDots(0)
            }
        }

        // on measure rest, select the first actual rest
        if (cr && cr.isMMRest()) {
            const m = cr.measure().mmRestFirst()
            if (m) {
                cr = m.findChordRest(m.tick(), 0)
            }
        }

        if (cr) {
            crs.push(cr)
        } else {
            this.deselect(e)
        }
    } else if (this.selection().isNone() && p !== Pad.REST) {
        const td = is.duration()
        is.setDuration(td)
        is.setAccidentalType(AccidentalType.NONE)
    } else {
        const elements = this.selection().uniqueElements()
        for (const e of elements) {
            if (this.selection().isList() || e.isRest() || e.isNote()) {
                elementsToSelect.push(e)
                this.deselect(e)
            }
        }
        let canAdjustLength = true
        for (const e of elements) {
            const cr = InputState.chordRest(e)
            if (!cr) {
                continue
            }
            if (cr.isMeasureRepeat() || cr.isMMRest()) {
                canAdjustLength = false
                break
            }
            crs.push(cr)
        }

        if (canAdjustLength) {
            // Change length from last to first chord/rest
            crs.sort((cr1, cr2) => {
                if (cr2.track() === cr1.track()) {
                    return cr2.isBefore(cr1) ? -1 : cr1.isBefore(cr2) ? 1 : 0
                }
                return cr2.track() < cr1.track() ? -1 : 1
            })
            // Remove duplicates from the list
            crs = crs.filter((cr, i) => i === 0 || crs[i - 1] !== cr)
        } else {
            crs = []
        }
    }

    const dots = is.duration().dots()

    if (toggleForSelectionOnly && dots > 0 && crs.length) {
        let shouldRemoveDots = true
        for (const cr of crs) {
            if (dots !== cr.dots()) {
                shouldRemoveDots = false
                break
            }
        }

        if (shouldRemoveDots) {
            is.setDots(0)
        }
    }

    for (const cr of crs) {
        if (cr.isChord() && (cr as Chord).isGrace()) {
            //
            // handle appoggiatura and acciaccatura
            //
            this.undoChangeChordRestLen(cr, is.duration())
        } else {
            this.changeCRlen(cr, is.duration())
        }
    }

    if (elementsToSelect.length) {
        const selectList: EngravingItem[] = []
        for (const e of elementsToSelect) {
            if (this.canReselectItem(e)) {
                selectList.push(e)
            }
        }

        this.select(selectList, SelectType.ADD, 0)
        this.selection().updateSelectedElements()
    }

    if (toggleForSelectionOnly) {
        is.setDuration(oldDuration)
        is.setRest(oldRest)
        is.setAccidentalType(oldAccidentalType)

        if (this.noteEntryMode()) {
            if (is.lastSegment() === is.segment()) {
                is.moveToNextInputPos()
            }
        }
    }
}


// =====================================================================================================================
//   re-pitch and insert note input (noteentry.cpp: repitchNote, repitchReplaceNote, insertChordByInsertingTime)
// =====================================================================================================================

// (imports of this section; ES imports are hoisted)
import { AccidentalRole, ElementType } from '../types/types'
import { MScore as NoteEntryMScore, MsError as NoteEntryMsError } from './mscore'
import { Factory as NoteEntryFactory } from './factory'
import { tpc2alter as noteEntryTpc2alter } from './pitchspelling'
import { ChangeMeasureLen, InsertTime } from '../editing/editmeasures'
import { Pid as NoteEntryPid } from './property'
import type { Tie } from './tie'
import type { ChordLine } from './chordline'

declare module './score' {
    interface Score {
        /** false: C++ returns an error */
        repitchNote(p: Position, replace: boolean): boolean
        /** returns [note, lastTiedNote] */
        repitchReplaceNote(chord: Chord, nval: NoteVal, forceAccidental?: boolean): [Note, Note]
        /** insert by increasing measure length; false: C++ returns an error */
        insertChordByInsertingTime(pos: Position): boolean
    }
}

Score.prototype.repitchNote = function (this: Score, p: Position, replace: boolean): boolean {
    const is = this.inputState()
    const s = p.segment!
    const tick = s.tick()
    const st = this.staff(p.staffIdx)!
    const clef = st.clef(tick)

    const nval = new NoteVal()
    const at = is.accidentalType()
    if (is.drumset() && is.drumNote() !== -1) {
        nval.pitch = is.drumNote()
    } else {
        let acci: number
        if (at === AccidentalType.NONE) {
            const [a, error] = s.measure().findAccidentalAtLine(s, p.staffIdx, p.line)
            if (error) {
                return false
            }
            acci = a
        } else {
            acci = Accidental.subtype2value(at)
        }

        const step = absStepFromLine(p.line, clef)
        const octave = Math.trunc(step / 7)
        nval.pitch = step2pitch(step) + octave * 12 + acci

        if (this.style().styleB(Sid.concertPitch)) {
            nval.tpc1 = step2tpc(step % 7, acci)
        } else {
            nval.pitch += st.part().instrument(s.tick()).transpose().chromatic
            nval.tpc2 = step2tpc(step % 7, acci)
        }
    }

    if (!is.segment()) {
        return false
    }

    let chord: Chord
    let cr: ChordRest | null = is.cr()
    if (!cr) {
        cr = is.segment()!.nextChordRest(is.track())
        if (!cr) {
            return false
        }
    }
    if (cr.isRest()) { //skip rests
        let next = nextChordRest(cr)
        while (next && !next.isChord()) {
            next = nextChordRest(next)
        }
        if (next) {
            is.moveInputPos(next.segment() as unknown as EngravingItem)
        }
        return true
    } else {
        chord = cr as unknown as Chord
    }

    let forceAccidental = false
    if (is.accidentalType() !== AccidentalType.NONE) {
        const nval2 = this.noteValForPosition(p, AccidentalType.NONE)
        forceAccidental = !!nval2 && nval.pitch === nval2.pitch
    }

    // Note: not sure this is ever called with replace == false, since add (not replace) case is handled already in cmdAddPitch
    if (!replace) {
        return !!this.addPitchToChord(nval, chord, /* externalInputState */ null, forceAccidental)
    }

    const [, lastTiedNote] = this.repitchReplaceNote(chord, nval, forceAccidental)
    // TODO(port): setPlayChord(true)

    // move to next Chord
    let next = nextChordRest(lastTiedNote.chord())
    while (next && !next.isChord()) {
        next = nextChordRest(next)
    }
    if (next) {
        is.moveInputPos(next.segment() as unknown as EngravingItem)
    }

    return true
}

Score.prototype.repitchReplaceNote = function (this: Score, chord: Chord, nval: NoteVal, forceAccidental = false): [Note, Note] {
    const note = NoteEntryFactory.createItem(ElementType.NOTE, chord) as unknown as Note
    note.setParent(chord)
    note.setTrack(chord.track())
    note.setNval(nval)

    let firstTiedNote: Note | null = null
    let lastTiedNote: Note = note
    const notes: Note[] = [...chord.notes()]
    // break all ties into current chord
    // these will exist only if user explicitly moved cursor to a tied-into note
    // in ordinary use, cursor will automatically skip past these during note entry
    for (const n of notes) {
        if (n.tieBack()) {
            this.undoRemoveElement(n.tieBack()!)
        }
    }
    // Keep first chordline only
    const chordLine = chord.chordLine() ? chord.chordLine()!.clone() as unknown as ChordLine : null
    for (const e of [...chord.el()]) {
        if (e.isChordLine()) {
            this.undoRemoveElement(e)
        }
    }
    // for the first note of the chord only, preserve ties by changing pitch of all forward notes
    // the tie forward itself will be added later
    // multi-note chords get reduced to single note chords anyhow since we remove the old notes below
    if (notes[0].tieFor()) {
        let tn: Note | null = notes[0].tieFor()!.endNote()
        while (tn) {
            const tc = tn.chord()
            if (tc.notes().length !== 1) {
                const notesToRemove = tc.notes().filter(n => n !== tn)
                for (const n of notesToRemove) {
                    this.undoRemoveElement(n)
                }
            }
            if (!firstTiedNote) {
                firstTiedNote = tn
            }
            lastTiedNote = tn
            this.undoChangePitch(tn, note.pitch(), note.tpc1(), note.tpc2())
            if (tn.tieFor()) {
                tn = tn.tieFor()!.endNote()
            } else {
                break
            }
        }
    }
    // remove all notes from chord
    // the new note will be added below
    while (chord.notes().length) {
        this.undoRemoveElement(chord.notes()[0])
    }

    // add new note to chord
    this.undoAddElement(note)

    if (chordLine) {
        chordLine.setNote(note)
        this.undoAddElement(chordLine)
    }

    if (forceAccidental) {
        const tpc = this.style().styleB(Sid.concertPitch) ? nval.tpc1 : nval.tpc2
        const alter = noteEntryTpc2alter(tpc)
        const at = Accidental.value2subtype(alter)
        const a = NoteEntryFactory.createItem(ElementType.ACCIDENTAL, note) as unknown as Accidental
        a.setAccidentalType(at)
        a.setRole(AccidentalRole.USER)
        a.setParent(note)
        this.undoAddElement(a)
    }
    // TODO(port): setPlayNote(true)
    // recreate tie forward if there is a note to tie to
    // one-sided ties will not be recreated
    if (firstTiedNote) {
        const tie = NoteEntryFactory.createItem(ElementType.TIE, note) as unknown as Tie
        tie.setStartNote(note)
        tie.setEndNote(firstTiedNote)
        tie.setTick(tie.startNote()!.tick())
        tie.setTick2(tie.endNote()!.tick())
        tie.setTrack(note.track())
        this.undoAddElement(tie)
    }
    this.select(lastTiedNote)

    return [note, lastTiedNote]
}

Score.prototype.insertChordByInsertingTime = function (this: Score, pos: Position): boolean {
    // insert by increasing measure length
    //
    // TODO:
    //    - check voices
    //    - split chord/rest

    const el = this.selection().element()
    if (!el || !(el.isNote() || el.isRest())) {
        return false
    }

    const seg = pos.segment!
    if (seg.splitsTuplet()) {
        NoteEntryMScore.setError(NoteEntryMsError.CANNOT_INSERT_TUPLET)
        return false
    }

    // remove all two-note tremolos that end on this tick
    for (const e of seg.elist()) {
        if (!e || !e.isChord()) {
            continue
        }
        const c = e as unknown as Chord
        const t = c.tremoloTwoChord()
        if (t && t.chord2() === c) {
            // we have to remove this tremolo because we are adding time in the middle of it
            // (if c is chord1 then we're inserting before the trem so it's fine)
            this.undoRemoveElement(t)
        }
    }

    const duration = this.inputState().duration()
    const fraction = duration.fraction()
    const len = fraction
    const tick = seg.tick()
    const measure = seg.measure().isMMRest() ? seg.measure().mmRestFirst()! : seg.measure()
    const targetMeasureLen = measure.ticks().plus(fraction)

    // Shift spanners, enlarge the measure.
    // The approach is similar to that in Measure::adjustToLen() but does
    // insert time to the middle of the measure rather than to the end.
    this.undoInsertTime(tick, len)

    for (const score of [this as Score]) { // TODO(port): scoreList() (excerpts)
        score.undo(new InsertTime(score, tick, len))
        const m = score.tick2measure(tick)!
        this.undo(new ChangeMeasureLen(m, targetMeasureLen))
        const scoreSeg = m.tick2segment(tick)
        for (let s = scoreSeg; s; s = s.next()) {
            s.undoChangeProperty(NoteEntryPid.TICK, s.rtick().plus(len))
        }
    }

    // Fill the inserted time with rests.
    // This is better to be done in master score to cover all staves.
    const ms = this.masterScore()
    const msMeasure = ms.tick2measure(tick)!
    const msTracks = ms.ntracks()

    const firstSeg = msMeasure.first(SegmentType.ChordRest)!
    for (let track = 0; track < msTracks; ++track) {
        const maybeRest = firstSeg.element(track)
        let measureIsFull = false

        // I. Convert any measure rests into normal (non-measure) rest(s) of equivalent duration
        if (maybeRest && maybeRest.isRest() && (maybeRest as unknown as Rest).durationType().isMeasure()) {
            ms.undoRemoveElement(maybeRest)
            const measureRest = maybeRest as unknown as Rest
            // If measure rest is situated at measure start we will fill
            // the whole measure with rests.
            measureIsFull = measureRest.rtick().isZero()
            const fillLen = measureIsFull ? targetMeasureLen : measureRest.ticks()
            ms.setRest(measureRest.tick(), track, fillLen, /* useDots */ false, /* tuplet */ null, /* useFullMeasureRest */ false)
        }

        // II. Make chord or rest in other track longer if it crosses the insert area
        if (!measureIsFull) {
            const cr = ms.findCR(tick, track)
            if (cr && cr.tick().lt(tick) && cr.endTick().gt(tick)) {
                if (cr.isRest()) {
                    const fillLen = cr.ticks().plus(fraction)
                    ms.undoRemoveElement(cr)
                    ms.setRest(cr.tick(), track, fillLen, /* useDots */ false, /* tuplet */ null, /* useFullMeasureRest */ false)
                } else if (cr.isChord()) {
                    const chord = cr as unknown as Chord
                    const durations = toDurationList(chord.ticks().plus(fraction), /* useDots */ true)
                    let p = chord.tick()
                    ms.undoRemoveElement(chord)
                    let prevChord: Chord | null = null
                    for (const dur of durations) {
                        const prototype = prevChord ?? chord
                        const genTie = !!prevChord
                        prevChord = ms.addChord(p, dur, prototype, genTie, /* tuplet */ null)
                        p = p.plus(dur.fraction())
                    }
                    // TODO: reconnect ties if this chord was tied to other
                }
                measureIsFull = true
            }
        }

        // III. insert rest(s) to fill the inserted space
        if (!measureIsFull && msMeasure.hasVoice(track)) {
            ms.setRest(tick, track, fraction, /* useDots */ false, /* tuplet */ null)
        }
    }

    // Put the note itself.
    const s = measure.undoGetSegment(SegmentType.ChordRest, tick)
    const p = new Position()
    p.segment = s
    p.staffIdx = pos.staffIdx
    p.line = pos.line
    p.fret = pos.fret
    p.pos = pos.pos.clone()
    this.putNote(p, true)

    return true
}
