/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/engraving/editing/edit.cpp that creating a new score needs (plus
 * MasterScore::insertMeasure of masterscore.cpp and Measure::adjustToLen of measure.cpp, which use the same
 * editing functions). The C++ functions are methods of Score/MasterScore/Measure; here they are added to these
 * classes by this module (module augmentation), so it must be imported before they are used.
 *
 * There is no undo stack: where C++ calls undo(new Command(...)), the command's redo() is done directly
 * (marked "TODO(port): undo"). Linked staves/excerpts are not ported, so the "linked" loops only handle the
 * element itself.
 */

import { Fraction } from '../types/fraction'
import {
    BracketType, DurationType, ElementType, KeyMode, Key, TextStyleType, VOICES, nidx,
    type staff_idx_t, type track_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Factory } from '../dom/factory'
import { Pid } from '../dom/property'
import { Score } from '../dom/score'
import { MasterScore } from '../dom/masterscore'
import { Measure } from '../dom/measure'
import { SegmentType } from '../dom/segment'
import { KeySigEvent, type KeyList } from '../dom/key'
import { TDuration, toRhythmicDurationList } from '../dom/durationtype'
import { Transpose } from './transpose'
import { Interval } from '../dom/interval'
import { ChangeMeasureLen, InsertMeasures, InsertTime } from './editmeasures'
import type { EngravingItem } from '../dom/engravingitem'
import type { MeasureBase } from '../dom/measurebase'
import type { ChordRest } from '../dom/chordrest'
import type { Rest } from '../dom/rest'
import type { Part } from '../dom/part'
import type { Staff } from '../dom/staff'
import type { TimeSig } from '../dom/timesig'
import type { KeySig } from '../dom/keysig'
import { Text } from '../dom/text'
import type { TextBase } from '../dom/textbase'
import type { Spanner } from '../dom/spanner'

/** C++ Score::InsertMeasureOptions */
export class InsertMeasureOptions {
    createEmptyMeasures = false
    moveSignaturesClef = true
    needDeselectAll = true
    cloneBoxToAllParts = true
    moveStaffTypeChanges = true
    ignoreBarLines = false
}

declare module '../dom/score' {
    interface Score {
        doUndoAddElement(element: EngravingItem): void
        undoAddElement(element: EngravingItem): void
        doUndoRemoveElement(element: EngravingItem): void
        undoInsertPart(part: Part, targetPartIndex: number): void
        undoInsertStaff(staff: Staff, ridx: staff_idx_t, createRests?: boolean): void
        undoAddBracket(staff: Staff, level: number, type: BracketType, span: number): void
        undoInsertTime(tick: Fraction, len: Fraction): void
        undoAddCR(cr: ChordRest, measure: Measure, tick: Fraction): void
        insertMeasure(type: ElementType, beforeMeasure?: MeasureBase | null, options?: InsertMeasureOptions): MeasureBase | null
        insertBox(type: ElementType, beforeMeasure: MeasureBase | null, options?: InsertMeasureOptions): MeasureBase | null
        restoreInitialKeySigAndTimeSig(): void
        cmdAddTimeSig(fm: Measure, staffIdx: staff_idx_t, ts: TimeSig, local: boolean): void
        undoChangeKeySig(ostaff: Staff, tick: Fraction, key: KeySigEvent): void
        addText(type: TextStyleType, destinationElement?: EngravingItem | null): TextBase | null
        clearSystemLocks(): void
        adjustKeySigs(sidx: staff_idx_t, eidx: staff_idx_t, km: KeyList): void
    }
}

declare module '../dom/masterscore' {
    interface MasterScore {
        /** C++ MasterScore::insertMeasure(MeasureBase*, const InsertMeasureOptions&) (renamed: no overloads in TS) */
        insertMeasureInMaster(beforeMeasure?: MeasureBase | null, options?: InsertMeasureOptions): Measure | null
    }
}

declare module '../dom/measure' {
    interface Measure {
        adjustToLen(nf: Fraction, appendRestsIfNecessary?: boolean): void
    }
}

// TODO(port): undo, linked elements (C++ undoAddElement adds the element to all linked staves)
Score.prototype.doUndoAddElement = function (this: Score, element: EngravingItem): void {
    this.addElement(element)
}

Score.prototype.undoAddElement = function (this: Score, element: EngravingItem): void {
    this.doUndoAddElement(element)
}

// TODO(port): undo, linked elements
Score.prototype.doUndoRemoveElement = function (this: Score, element: EngravingItem): void {
    this.removeElement(element)
}

Score.prototype.undoInsertPart = function (this: Score, part: Part, targetPartIndex: number): void {
    this.insertPart(part, targetPartIndex) // TODO(port): undo (InsertPart)
}

/** ridx - index of staff in part */
Score.prototype.undoInsertStaff = function (this: Score, staff: Staff, ridx: staff_idx_t, _createRests = true): void {
    this.insertStaff(staff, ridx) // TODO(port): undo (InsertStaff)
    if (this.firstMeasure()) {
        // TODO(port): Measure::cmdAddStaves (adding staves to a score with measures)
        throw new Error('TODO(port): Score::undoInsertStaff into a score with measures')
    }
    // when newly adding an instrument,
    // this was already set when we created the staff
    // we don't have any better info at this point
    // and it doesn't work to adjust bracket & barlines until all staves are added
    // TODO: adjust brackets only when appropriate
    //adjustBracketsIns(idx, idx+1);
}

Score.prototype.undoAddBracket = function (this: Score, staff: Staff, level: number, type: BracketType, span: number): void {
    const startStaffIdx = staff.idx()
    const totStaves = this.nstaves()

    // Make sure this brackets won't overlap with others sharing same column.
    // If overlaps are found, move the other brackets outwards (i.e. increase column).
    for (let staffIdx = startStaffIdx; staffIdx < startStaffIdx + span && staffIdx < totStaves; ++staffIdx) {
        const brackets = this.staves()[staffIdx].brackets()

        for (let i = brackets.length - 1; i >= level; --i) {
            if (i >= brackets.length) {
                // This might theoretically happen when a lot of brackets get cleaned up
                // after changing the column of the first bracket we see
                continue
            }

            if (brackets[i].bracketType() === BracketType.NO_BRACKET) {
                continue
            }

            brackets[i].undoChangeProperty(Pid.BRACKET_COLUMN, brackets[i].column() + 1)
        }
    }

    // TODO(port): undo (AddBracket)
    staff.setBracketType(level, type)
    staff.setBracketSpan(level, span)
}

/** acts on the linked scores as well (TODO(port): linked scores) */
Score.prototype.undoInsertTime = function (this: Score, tick: Fraction, len: Fraction): void {
    if (len.isZero()) {
        return
    }

    const spannersToAdjust: Spanner[] = []
    for (const s of this.spanner()) {
        if (s.tick2().lt(tick)) {
            continue
        }
        let append = false
        if (len.gt(new Fraction(0, 1))) {
            if (tick.gt(s.tick()) && tick.lt(s.tick2())) {
                append = true
            } else if (tick.le(s.tick())) {
                append = true
            }
        } else {
            // TODO(port): removing time
            throw new Error('TODO(port): Score::undoInsertTime with negative length')
        }
        if (append) {
            spannersToAdjust.push(s)
        }
    }
    for (const s of spannersToAdjust) {
        if (tick.eq(s.tick()) && s.isVolta()) {
            s.undoChangeProperty(Pid.SPANNER_TICKS, s.ticks().plus(len))
        } else if (tick.gt(s.tick()) && tick.lt(s.tick2())) {
            //
            //  case a:
            //  +----spanner--------+
            //    +---add---
            //
            s.undoChangeProperty(Pid.SPANNER_TICKS, s.ticks().plus(len))
        } else if (tick.le(s.tick())) {
            //
            //  case b:
            //       +----spanner--------
            //  +---add---
            // and
            //            +----spanner--------
            //  +---add---+
            const startElement = s.startElement()
            const endElement = s.endElement()
            s.setStartElement(null) // undoChangeSpannerElements
            s.setEndElement(null)
            s.undoChangeProperty(Pid.SPANNER_TICK, s.tick().plus(len))
            s.setStartElement(startElement)
            s.setEndElement(endElement)
        }
    }

    // TODO(port): insert time in linked scores (undo(new InsertTime(...)) is done by the callers here)
}

Score.prototype.undoAddCR = function (this: Score, cr: ChordRest, measure: Measure, tick: Fraction): void {
    // TODO(port): lyrics, linked staves, tuplets
    const ostaff = cr.staff()!
    const strack = cr.track()

    const segmentType = SegmentType.ChordRest

    for (const staff of ostaff.staffList()) {
        const linkedTrack: track_idx_t = strack // ostaff->getLinkedTrackInStaff(staff, strack)

        if (linkedTrack === nidx || linkedTrack < staff.part().startTrack() || linkedTrack >= staff.part().endTrack()) {
            continue
        }

        const score = staff.score()
        const m = score === this ? measure : score.tick2measure(tick)
        if (!m) {
            break
        }
        const seg = m.undoGetSegment(segmentType, tick)

        const newcr = staff === ostaff ? cr : cr.linkedClone() as ChordRest
        newcr.setScore(score)

        newcr.setTrack(linkedTrack)
        newcr.setParent(seg)

        if (newcr.isRest() && (newcr as Rest).isGap() && !(newcr.track() % VOICES)) {
            (newcr as Rest).setGap(false)
        }

        this.doUndoAddElement(newcr)
    }
}

/**
 * if inserting Measure, act on master score (and add to all linked scores);
 * if inserting Box, add to local score only
 */
Score.prototype.insertMeasure = function (this: Score, type: ElementType, beforeMeasure: MeasureBase | null = null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): MeasureBase | null {
    let localInsertMeasureBase: MeasureBase | null = null
    if (type === ElementType.MEASURE) {
        const masterInsertMeasure = this.masterScore().insertMeasureInMaster(beforeMeasure, options)
        if (masterInsertMeasure) {
            localInsertMeasureBase = this.tick2measureBase(masterInsertMeasure.tick())
        }
    } else {
        localInsertMeasureBase = this.insertBox(type, beforeMeasure, options)
    }

    // TODO(port): deselectAll()

    return localInsertMeasureBase
}

Score.prototype.insertBox = function (this: Score, type: ElementType, beforeMeasure: MeasureBase | null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): MeasureBase | null {
    const isFrame = type === ElementType.FBOX || type === ElementType.HBOX || type === ElementType.TBOX || type === ElementType.VBOX

    if (!isFrame) {
        return null
    }

    let tick: Fraction
    const isTitleFrame = type === ElementType.VBOX && !!beforeMeasure && beforeMeasure === beforeMeasure.score().first()
    if (beforeMeasure) {
        if (beforeMeasure.isMeasure()) {
            const m = beforeMeasure as Measure
            if (m.isMMRest()) {
                beforeMeasure = m.mmRestFirst()
            }
            // TODO(port): measure repeat groups (MsError::CANNOT_SPLIT_MEASURE_REPEAT)
        } else {
            beforeMeasure = beforeMeasure.top() // don't try to insert in front of nested frame
        }
        tick = beforeMeasure!.tick()
    } else {
        tick = this.last() ? this.last()!.endTick() : new Fraction(0, 1)
    }

    const newMeasureBase = Factory.createItem(type, this.dummySystem()) as MeasureBase
    newMeasureBase.setTick(tick)
    newMeasureBase.setNext(beforeMeasure)
    newMeasureBase.setPrev(beforeMeasure ? beforeMeasure.prev() : this.last())
    newMeasureBase.setSizeIsSpatiumDependent(!isTitleFrame)

    // TODO(port): FBox::init()

    new InsertMeasures(newMeasureBase, newMeasureBase).redo() // TODO(port): undo

    if (options.cloneBoxToAllParts) {
        // TODO(port): newMeasureBase->manageExclusionFromParts(false) (excerpts)
    }

    return newMeasureBase
}

Score.prototype.restoreInitialKeySigAndTimeSig = function (this: Score): void {
    const concertPitch = this.style().styleB(Sid.concertPitch)
    const startTick = new Fraction(0, 1)

    const firstMeas = this.firstMeasure()!
    for (const staff of this.staves()) {
        const concertKey = Key.C
        let transposedKey = concertKey
        const part = staff.part()
        const instrument = part.instrument()
        const transpose = -instrument.transpose().chromatic
        if (!concertPitch) {
            transposedKey = Transpose.transposeKey(transposedKey, Interval.fromChromatic(transpose), part.preferSharpFlat())
        }

        const keySegment = firstMeas.undoGetSegment(SegmentType.KeySig, startTick)

        const keySigEvent = new KeySigEvent()
        keySigEvent.setConcertKey(concertKey)
        keySigEvent.setKey(transposedKey)
        // use atonal KS for drums
        if (instrument.useDrumset()) {
            keySigEvent.setCustom(true)
            keySigEvent.setMode(KeyMode.NONE)
        }

        const newKeySig = Factory.createItem(ElementType.KEYSIG, keySegment) as KeySig
        newKeySig.setTrack(staff.idx() * VOICES)
        keySegment.add(newKeySig)
        newKeySig.setKeySigEvent(keySigEvent)
        this.undoAddElement(newKeySig)

        staff.setKey(new Fraction(0, 1), keySigEvent)

        const timeSegment = firstMeas.undoGetSegment(SegmentType.TimeSig, startTick)
        const newTimeSig = Factory.createItem(ElementType.TIMESIG, timeSegment) as TimeSig
        newTimeSig.setTrack(staff.idx() * VOICES)
        newTimeSig.setSig(new Fraction(4, 4))
        timeSegment.add(newTimeSig)
        this.undoAddElement(newTimeSig)
    }

    firstMeas.setTimesig(new Fraction(4, 4))
    firstMeas.setTicks(new Fraction(4, 4))
}

Score.prototype.cmdAddTimeSig = function (this: Score, fm: Measure, staffIdx: staff_idx_t, ts: TimeSig, local: boolean): void {
    // TODO(port): deselectAll()

    if (fm.isMMRest()) {
        fm = fm.mmRestFirst()!
    }

    const ns = ts.sig()
    const tick = fm.tick()
    if (local) {
        const stretch = ns.div(fm.timesig()).reduced()
        ts.setStretch(stretch)
    }

    const track = staffIdx * VOICES
    let seg = fm.findSegment(SegmentType.TimeSig, tick)
    let ots = seg ? seg.element(track) as TimeSig | null : null

    // Check same tick at end of previous measure
    if (!ots) {
        const prevMeasure = fm.prevMeasure()
        seg = prevMeasure ? prevMeasure.findSegmentR(SegmentType.TimeSig, prevMeasure.ticks()) : seg
        ots = seg ? seg.element(track) as TimeSig | null : null
    }

    if (ots && ots.equals(ts)) {
        //
        //  ignore if there is already a timesig
        //  with same values
        //
        return
    }

    seg = fm.undoGetSegment(SegmentType.TimeSig, tick)

    const getStaffIdxRange = (score: Score): [staff_idx_t, staff_idx_t] => {
        if (local) {
            // TODO(port): linked staves in other scores
            return [staffIdx, staffIdx + 1]
        }
        return [0, score.nstaves()]
    }

    if (ots && ots.sig().eq(ns) && ots.stretch().eq(ts.stretch())) {
        //
        // the measure duration does not change,
        // so its ok to just update the time signatures
        //
        const nts = this.staff(staffIdx)!.nextTimeSig(tick.plus(Fraction.eps()))
        const lmTick = nts ? nts.segment().tick() : new Fraction(-1, 1)
        for (const score of [this]) { // TODO(port): scoreList()
            const mf = score.tick2measure(tick)
            const lm = !lmTick.eq(new Fraction(-1, 1)) ? score.tick2measure(lmTick) : null
            for (let m = mf; m && m !== lm; m = m.nextMeasure()) {
                const changeActual = m.ticks().eq(m.timesig())
                m.undoChangeProperty(Pid.TIMESIG_NOMINAL, ns)
                if (changeActual) {
                    m.undoChangeProperty(Pid.TIMESIG_ACTUAL, ns)
                }
            }
            const [first, end] = getStaffIdxRange(score)
            for (let si = first; si < end; ++si) {
                const nsig = seg.element(si * VOICES) as TimeSig | null
                if (!nsig) {
                    continue
                }
                nsig.undoChangeProperty(Pid.SHOW_COURTESY, ts.showCourtesySig())
                nsig.undoChangeProperty(Pid.TIMESIG, ts.sig())
                nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                nsig.undoChangeProperty(Pid.NUMERATOR_STRING, ts.numeratorString())
                nsig.undoChangeProperty(Pid.DENOMINATOR_STRING, ts.denominatorString())
                nsig.undoChangeProperty(Pid.TIMESIG_STRETCH, ts.stretch())
                nsig.undoChangeProperty(Pid.GROUP_NODES, ts.groups().nodes())
                // TODO(port): nsig->setSelected(false); nsig->setDropTarget(false)
            }
        }
    } else {
        const mScore = this.masterScore()
        let mf: Measure | null = mScore.tick2measure(tick)

        //
        // rewrite all measures up to the next time signature
        //
        if (mf === mScore.firstMeasure() && mf!.nextMeasure() && !mf!.ticks().eq(mf!.timesig())) {
            // handle upbeat
            mf!.undoChangeProperty(Pid.TIMESIG_NOMINAL, ns)
            const m = mf!.nextMeasure()!
            const s = m.findSegment(SegmentType.TimeSig, m.tick())
            mf = s ? null : mf!.nextMeasure()
        } else {
            if (this.sigmap().timesig(seg.tick().ticks()).nominal().identical(ns)) {
                // no change to global time signature,
                // but we need to rewrite any staves with local time signatures
                for (let i = 0; i < this.nstaves(); ++i) {
                    const its = this.staff(i)!.timeSig(tick)
                    if (its && its.isLocal()) {
                        // TODO(port): MasterScore::rewriteMeasures
                        throw new Error('TODO(port): Score::rewriteMeasures (local time signatures)')
                    }
                }
                mf = null
            }
        }

        // try to rewrite the measures first
        // we will only add time signatures if this succeeds
        // this means, however, that the rewrite cannot depend on the time signatures being in place
        if (mf) {
            const [first, end] = getStaffIdxRange(mScore)
            if (end !== first) {
                // TODO(port): MasterScore::rewriteMeasures (copy/paste of the measure contents)
                throw new Error('TODO(port): Score::rewriteMeasures')
            }
        }
        // add the time signatures
        for (const score of [this]) { // TODO(port): scoreList(), links to the master time signatures
            const nfm = score.tick2measure(tick)!
            seg = nfm.undoGetSegment(SegmentType.TimeSig, nfm.tick())
            const [first, end] = getStaffIdxRange(score)
            for (let si = first; si < end; ++si) {
                // TODO(port): if (fm->isMeasureRepeatGroup(si)) deleteItem(fm->measureRepeatElement(si))
                let nsig = seg.element(si * VOICES) as TimeSig | null
                if (!nsig) {
                    nsig = ts.clone() as TimeSig // Factory::copyTimeSig
                    nsig.setScore(score)
                    nsig.setTrack(si * VOICES)
                    nsig.setParent(seg)
                    nsig.styleChanged()
                    this.undoAddElement(nsig)
                } else {
                    nsig.undoChangeProperty(Pid.SHOW_COURTESY, ts.showCourtesySig())
                    nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                    nsig.undoChangeProperty(Pid.TIMESIG, ts.sig())
                    nsig.undoChangeProperty(Pid.NUMERATOR_STRING, ts.numeratorString())
                    nsig.undoChangeProperty(Pid.DENOMINATOR_STRING, ts.denominatorString())

                    // HACK do it twice to accommodate undo
                    nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                    nsig.undoChangeProperty(Pid.TIMESIG_STRETCH, ts.stretch())
                    nsig.undoChangeProperty(Pid.GROUP_NODES, ts.groups().nodes())
                }
            }
        }
    }
}

Score.prototype.undoChangeKeySig = function (this: Score, ostaff: Staff, tick: Fraction, key: KeySigEvent): void {
    for (const staff of ostaff.staffList()) {
        if (staff.isDrumStaff(tick)) {
            continue
        }

        const score = staff.score()
        const measure = score.tick2measure(tick)
        if (!measure) {
            continue
        }
        const s = measure.undoGetSegment(SegmentType.KeySig, tick)

        const staffIdx = staff.idx()
        const track = staffIdx * VOICES
        const ks = s.element(track) as KeySig | null

        const interval = staff.part().instrument(tick).transpose().clone()
        const nkey = key.clone()
        const concertPitch = score.style().styleB(Sid.concertPitch)

        if (interval.chromatic && !concertPitch && !nkey.isAtonal()) {
            interval.flip()
            nkey.setKey(Transpose.transposeKey(key.concertKey(), interval, staff.part().preferSharpFlat()))
            interval.flip()
        }

        // TODO(port): updateInstrumentChangeTranspositions(key, staff, tick)
        if (ks) {
            ks.undoChangeProperty(Pid.GENERATED, false)
            // TODO(port): undo (ChangeKeySig::flip with evtInStaff = true)
            const segment = ks.segment()!
            ks.setKeySigEvent(nkey)
            ks.setShowCourtesy(ks.showCourtesy())
            ks.staff()!.setKey(segment.tick(), nkey) // replace
            segment.setEnabled(true)
            segment.setHeader(false)
        } else {
            const nks = Factory.createItem(ElementType.KEYSIG, s) as KeySig
            nks.setParent(s)
            nks.setTrack(track)
            nks.setKeySigEvent(nkey)
            this.doUndoAddElement(nks)
            // TODO(port): links between the key signatures of linked staves
        }
        // TODO(port): Transpose::transpositionChanged if the staff transposition changed (transposes existing notes)
    }
}

Score.prototype.addText = function (this: Score, type: TextStyleType, destinationElement: EngravingItem | null = null): TextBase | null {
    let textBox: TextBase | null = null

    switch (type) {
    case TextStyleType.TITLE:
    case TextStyleType.SUBTITLE:
    case TextStyleType.COMPOSER:
    case TextStyleType.LYRICIST:
    case TextStyleType.INSTRUMENT_EXCERPT: {
        let frame: MeasureBase | null = null

        if (destinationElement && destinationElement.isVBox()) {
            frame = destinationElement as unknown as MeasureBase
        } else {
            frame = this.first()
            if (!frame || !frame.isBox()) {
                frame = this.insertBox(ElementType.VBOX, frame)
            }
        }

        textBox = new Text(frame, type) // Factory::createText(frame, type)
        textBox.setParent(frame)
        this.undoAddElement(textBox)
        break
    }
    case TextStyleType.FRAME: {
        if (!destinationElement) {
            break
        }
        textBox = new Text(destinationElement, type)
        textBox.setParent(destinationElement)
        this.undoAddElement(textBox)
        break
    }
    default:
        // TODO(port): rehearsal marks, staff/system texts, dynamics, expressions, ... (they need a chord/rest)
        break
    }

    return textBox
}

/** (score.cpp) */
Score.prototype.adjustKeySigs = function (this: Score, sidx: staff_idx_t, eidx: staff_idx_t, km: KeyList): void {
    for (let staffIdx = sidx; staffIdx < eidx; ++staffIdx) {
        const staff = this.staves()[staffIdx]
        for (const [t, ke] of km.entries()) {
            const tick = Fraction.fromTicks(t)
            const measure = this.tick2measure(tick)
            if (!measure) {
                continue
            }
            if (staff.isDrumStaff(tick)) {
                continue
            }
            const key = ke.clone()
            const v = staff.part().instrument(tick).transpose().clone()
            if (!v.isZero() && !this.style().styleB(Sid.concertPitch) && !key.isAtonal()) {
                v.flip()
                key.setKey(Transpose.transposeKey(key.concertKey(), v, staff.part().preferSharpFlat()))
            }
            staff.setKey(tick, key)

            const s = measure.getSegment(SegmentType.KeySig, tick)
            const keysig = Factory.createItem(ElementType.KEYSIG, s) as KeySig
            keysig.setParent(s)
            keysig.setTrack(staffIdx * VOICES)
            keysig.setKeySigEvent(key)
            this.doUndoAddElement(keysig)
        }
    }
}

Score.prototype.clearSystemLocks = function (this: Score): void {
    this.systemLocks().clear()
}

/**
 * Create a new MeasureBase of Measure type and insert before measure. If measure is zero, append new MeasureBase.
 * TODO(port): inserting before existing measures (moving clefs, key and time signatures, barlines, repeats)
 */
MasterScore.prototype.insertMeasureInMaster = function (this: MasterScore, beforeMeasure: MeasureBase | null = null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): Measure | null {
    let tick: Fraction
    if (beforeMeasure) {
        // TODO(port): mm rests, measure repeat groups and the moved elements below
        throw new Error('TODO(port): MasterScore::insertMeasure before a measure')
    } else {
        tick = this.last() ? this.last()!.endTick() : new Fraction(0, 1)
    }

    const isBeginning = tick.isZero()

    // Use nominal time signature of current or previous measure, depending on whether
    // the time sig from `beforeMeasure` will be moved to the newly created measure
    const currentTimeSig = this.sigmap().timesig(tick).nominal() // (prevMeasure()->tick() when inserting before a measure)

    let masterMeasure: Measure | null = null
    let ticks = new Fraction(0, 1)

    for (const score of [this as Score]) { // TODO(port): scoreList() (excerpts)
        const actualBeforeMeasure: MeasureBase | null = null

        const newMeasure = Factory.createItem(ElementType.MEASURE, score.dummySystem()) as Measure
        newMeasure.setTick(tick)

        newMeasure.setNext(actualBeforeMeasure)
        newMeasure.setPrev(score.last())

        newMeasure.setTimesig(currentTimeSig)
        newMeasure.setTicks(currentTimeSig)

        new InsertMeasures(newMeasure, newMeasure, options.moveStaffTypeChanges).redo() // TODO(port): undo

        ticks = newMeasure.ticks()
        const measureInsert: Measure | null = null // insert before

        if (score.isMaster()) {
            masterMeasure = newMeasure
        }

        const pm = newMeasure.prevMeasure()

        if (!measureInsert && tick.eq(new Fraction(0, 1))) {
            // If inserting measure into an empty score, restore default C key signature
            // and 4/4 time signature
            score.restoreInitialKeySigAndTimeSig()
        }

        if (pm && !options.moveSignaturesClef && !options.ignoreBarLines) {
            // TODO(port): move the end barlines of the previous measure (only when inserting before a measure)
        }
    }

    this.undoInsertTime(tick, ticks)

    if (masterMeasure && !options.createEmptyMeasures) {
        //
        // fill measure with rest
        // undoAddCR adds rest to linked staves as well
        for (let staffIdx = 0; staffIdx < this.nstaves(); ++staffIdx) {
            const track = staffIdx * VOICES
            const rest = Factory.createItem(ElementType.REST, this) as Rest // parent: dummy segment
            rest.setDurationType(new TDuration(DurationType.V_MEASURE))
            const timeStretch = this.staff(staffIdx)!.timeStretch(masterMeasure.tick())
            rest.setTicks(masterMeasure.ticks().times(timeStretch))
            rest.setTrack(track)
            this.undoAddCR(rest, masterMeasure, tick)
        }
    }

    // TODO(port): deselectAll()

    return masterMeasure
}

Measure.prototype.adjustToLen = function (this: Measure, nf: Fraction, _appendRestsIfNecessary = true): void {
    const ol = this.ticks()
    const nl = nf
    const diff = nl.minus(ol)

    let startTick = this.endTick()
    if (diff.lt(new Fraction(0, 1))) {
        startTick = startTick.plus(diff)
    }

    this.score().undoInsertTime(startTick, diff)

    for (const s of [this.score()]) { // TODO(port): scoreList()
        new InsertTime(s, startTick, diff).redo() // TODO(port): undo
        const m = s.tick2measure(this.tick())!
        new ChangeMeasureLen(m, nf).redo() // TODO(port): undo
        if (nl.gt(ol)) {
            // move EndBarLine, TimeSigAnnounce, KeySigAnnounce
            for (let seg = m.first(); seg; seg = seg.next()) {
                if (seg.segmentType() & (SegmentType.EndBarLine | SegmentType.CourtesyTimeSigType | SegmentType.CourtesyKeySigType)) {
                    seg.setRtick(nl)
                }
            }
        }
    }
    const s = this.score().masterScore()
    const m = s.tick2measure(this.tick())!
    const sl = s.uniqueStaves()

    for (const staffIdx of sl) {
        let rests = 0
        let chords = 0
        let rest: Rest | null = null
        for (let segment = m.first(); segment; segment = segment.next()) {
            const strack = staffIdx * VOICES
            const etrack = strack + VOICES
            for (let track = strack; track < etrack; ++track) {
                const e = segment.element(track)
                if (e) {
                    if (e.isRest()) {
                        ++rests
                        rest = e as Rest
                    } else if (e.isChord()) {
                        ++chords
                    }
                }
            }
        }
        const stretch = s.staff(staffIdx)!.timeStretch(this.tick())
        // if just a single rest
        if (rests === 1 && chords === 0) {
            // if measure value didn't change, stick to whole measure rest
            if (this.timesig().eq(nf)) {
                rest!.undoChangeProperty(Pid.DURATION, nf.times(stretch))
                rest!.undoChangeProperty(Pid.DURATION_TYPE_WITH_DOTS, new TDuration(DurationType.V_MEASURE).typeWithDots())
            } else { // if measure value did change, represent with rests actual measure value
                // convert the measure duration in a list of values (no dots for rests)
                const durList = toRhythmicDurationList(nf.times(stretch), /*isRest=*/ true, /*rtickStart=*/ new Fraction(0, 1),
                    /*nominal=*/ this.score().sigmap().timesig(this.tick().ticks()).nominal(), /*measure=*/ this, /*maxDots=*/ 0, stretch)
                if (durList.length === 0) {
                    continue
                }
                // set the existing rest to the first value of the duration list
                const firstDur = durList[0]
                rest!.undoChangeProperty(Pid.DURATION, firstDur.isMeasure() ? this.ticks() : firstDur.fraction())
                rest!.undoChangeProperty(Pid.DURATION_TYPE_WITH_DOTS, durList[0].typeWithDots())

                // add rests for any other duration list value
                let tickOffset = this.tick().plus(rest!.actualTicks())
                for (let i = 1; i < durList.length; i++) {
                    const newRest = Factory.createItem(ElementType.REST, s) as Rest // parent: dummy segment
                    const dur = durList[i]
                    newRest.setDurationType(dur)
                    newRest.setTicks(dur.isMeasure() ? this.ticks() : dur.fraction())
                    newRest.setTrack(rest!.track())
                    this.score().undoAddCR(newRest, this, tickOffset)
                    tickOffset = tickOffset.plus(newRest.actualTicks())
                }
            }
            continue
        }

        // TODO(port): measures with notes or several rests (removing/appending chords and rests)
        throw new Error('TODO(port): Measure::adjustToLen of a measure with notes')
    }
    // TODO(port): remove slurs when shortening, update the selection
}

