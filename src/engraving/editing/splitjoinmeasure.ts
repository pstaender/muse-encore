/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/splitjoinmeasure.h/.cpp
 */

import { Fraction } from '../types/fraction'
import { BarLineType, ElementType, VOICES } from '../types/types'
import { MScore, MsError } from '../dom/mscore'
import { Pid } from '../dom/property'
import { SegmentType } from '../dom/segment'
import { ScoreRange } from '../dom/range'
import { Factory } from '../dom/factory'
import { InsertMeasureOptions } from './edit'
import { ChangeStartEndSpanner } from './editspanner'
import { Link } from './addremoveelement'
import type { MasterScore } from '../dom/masterscore'
import type { Measure } from '../dom/measure'
import type { Score } from '../dom/score'
import type { Spanner } from '../dom/spanner'
import type { TimeSig } from '../dom/timesig'
import type { EngravingItem } from '../dom/engravingitem'
import { chordRestEditHooks } from '../dom/chordrest'

/** C++ literal multiplication without reducing (Fraction::setNumerator/setDenominator) */
function expand(f: Fraction, mult: number): Fraction {
    return new Fraction(f.numerator() * mult, f.denominator() * mult)
}

export class SplitJoinMeasure {
    static splitMeasure(masterScore: MasterScore, tick: Fraction): void {
        const segment = masterScore.tick2segment(tick, false, SegmentType.ChordRest)!

        if (segment.rtick().isZero()) {
            MScore.setError(MsError.CANNOT_SPLIT_MEASURE_FIRST_BEAT)
            return
        }
        if (segment.splitsTuplet()) {
            MScore.setError(MsError.CANNOT_SPLIT_MEASURE_TUPLET)
            return
        }

        const measure = masterScore.tick2measure(tick)!

        for (let staffIdx = 0; staffIdx < masterScore.nstaves(); ++staffIdx) {
            if (measure.isMeasureRepeatGroup(staffIdx)) {
                MScore.setError(MsError.CANNOT_SPLIT_MEASURE_REPEAT)
                return
            }
        }

        const range = new ScoreRange()
        range.read(measure.first()!, measure.last()!)

        const stick = measure.tick()
        const etick = measure.endTick()

        const spanners: [Spanner, Fraction, Fraction][] = []
        for (const s of [...masterScore.spanner()]) {
            let start: EngravingItem | null = s.startElement()
            let end: EngravingItem | null = s.endElement()
            if (s.tick().ge(stick) && s.tick().lt(etick)) {
                start = null
            }
            if (s.tick2().ge(stick) && s.tick2().lt(etick)) {
                end = null
            }
            if (start !== s.startElement() || end !== s.endElement()) {
                spanners.push([s, s.tick(), s.ticks()])
                masterScore.undo(new ChangeStartEndSpanner(s, start, end))
            }
            if (s.tick().lt(stick) && s.tick2().gt(stick)) {
                spanners.push([s, s.tick(), s.ticks()])
            }
        }

        const nm = measure.next()

        // create empty measures:
        const options = new InsertMeasureOptions()
        options.createEmptyMeasures = true
        options.moveSignaturesClef = false
        options.moveStaffTypeChanges = false
        options.ignoreBarLines = true

        masterScore.insertMeasureInMaster(nm, options)
        const m2 = (nm ? nm.prev() : masterScore.lastMeasure()) as Measure
        masterScore.insertMeasureInMaster(m2, options)
        const m1 = m2.prev() as Measure

        for (const s of masterScore.scoreList()) {
            const m = s.tick2measure(tick)!
            s.undoRemoveMeasures(m, m, true, false)
        }
        masterScore.undoInsertTime(measure.tick(), measure.ticks().neg())

        m1.setTick(measure.tick())
        m2.setTick(tick)

        let ticks1 = tick.minus(measure.tick())
        let ticks2 = measure.ticks().minus(ticks1)

        m1.setTimesig(measure.timesig())
        m2.setTimesig(measure.timesig())

        ticks1 = ticks1.reduced()
        ticks2 = ticks2.reduced()
        // Now make sure this reduction doesn't go 'beyond' the original measure's
        // actual denominator for both resultant measures.
        if (ticks1.denominator() < measure.ticks().denominator()) {
            if (measure.ticks().denominator() % m1.timesig().denominator() === 0) {
                const mult = Math.trunc(measure.ticks().denominator() / ticks1.denominator())
                // *= operator automatically reduces via GCD, so rather do literal multiplication:
                ticks1 = expand(ticks1, mult)
            }
        }
        if (ticks2.denominator() < measure.ticks().denominator()) {
            if (measure.ticks().denominator() % m2.timesig().denominator() === 0) {
                const mult = Math.trunc(measure.ticks().denominator() / ticks2.denominator())
                ticks2 = expand(ticks2, mult)
            }
        }
        if (ticks1.denominator() > 128 || ticks2.denominator() > 128) {
            MScore.setError(MsError.CANNOT_SPLIT_MEASURE_TOO_SHORT)
            return
        }

        m1.adjustToLen(ticks1, false)
        m2.adjustToLen(ticks2, false)

        // set correct barline types if needed
        for (const linkedScore of masterScore.scoreList()) {
            const sM1 = linkedScore.tick2measure(m1.tick())!
            const sM2 = linkedScore.tick2measure(m2.tick())!
            // TODO: handle other end barline types; they may differ per staff
            if (measure.endBarLineType() === BarLineType.END_REPEAT) {
                sM2.undoChangeProperty(Pid.REPEAT_END, true)
            }
            if (measure.getProperty(Pid.REPEAT_START)) {
                sM1.undoChangeProperty(Pid.REPEAT_START, true)
            }
        }

        range.write(masterScore, m1.tick())

        for (const [s, t, ticks] of spanners) {
            if (!s.tick().eq(t)) {
                s.undoChangeProperty(Pid.SPANNER_TICK, t)
            }
            if (!s.ticks().eq(ticks)) {
                s.undoChangeProperty(Pid.SPANNER_TICKS, ticks)
            }
        }

        for (let staffIdx = 0; staffIdx < masterScore.nstaves(); ++staffIdx) {
            const staff = masterScore.staves()[staffIdx]
            if (staff.isStaffTypeStartFrom(stick)) {
                const stc = Factory.createItem(ElementType.STAFFTYPE_CHANGE, m1)!
                stc.setParent(m1)
                stc.setTrack(staffIdx * VOICES)
                masterScore.addElement(stc)
            }
        }
    }

    static joinMeasures(masterScore: MasterScore, tick1: Fraction, tick2: Fraction): void {
        let m1 = masterScore.tick2measure(tick1)
        let m2 = masterScore.tick2measure(tick2)

        if (!m1 || !m2) {
            return
        }

        for (let staffIdx = 0; staffIdx < masterScore.nstaves(); ++staffIdx) {
            if (m1.isMeasureRepeatGroupWithPrevM(staffIdx)
                || m2.isMeasureRepeatGroupWithNextM(staffIdx)) {
                MScore.setError(MsError.CANNOT_SPLIT_MEASURE_REPEAT)
                return
            }
            if (masterScore.staves()[staffIdx].staffTypeRange(tick2)[0] > tick1.ticks()) {
                MScore.setError(MsError.CANNOT_JOIN_MEASURE_STAFFTYPE_CHANGE)
                return
            }
        }

        if (m1.isMMRest()) {
            m1 = m1.mmRestFirst()!
        }
        if (m2.isMMRest()) {
            m2 = m2.mmRestLast()!
        }

        masterScore.deselectAll()

        const range = new ScoreRange()
        range.read(m1.first()!, m2.last()!)

        const startTick = m1.tick()
        const endTick = m2.endTick()

        const spanners = masterScore.spannerMap().findContained(startTick.ticks(), endTick.ticks())
        for (const sp of spanners) {
            masterScore.doUndoRemoveElement(sp)
        }

        const spannersEndingInRange = new Map<Spanner, Fraction>()
        for (const s of [...masterScore.spanner()]) {
            if (s.tick().ge(startTick) && s.tick().lt(endTick)) {
                s.setStartElement(null)
            }
            if (s.tick2().ge(startTick) && s.tick2().lt(endTick)) {
                s.setEndElement(null)
            }
            // Maintain length of spanners starting outside and ending within join range
            if (s.tick().lt(startTick) && s.tick2().lt(endTick)) {
                spannersEndingInRange.set(s, s.tick2())
            }
            // Remove spanners starting within join range and ending outside
            // These will be replaced on range.write
            if (s.tick().gt(startTick) && s.tick().lt(endTick) && s.tick2().gt(endTick)) {
                masterScore.doUndoRemoveElement(s)
            }
        }

        const next = m2.next()
        masterScore.deleteMeasures(m1, m2, true)

        const options = new InsertMeasureOptions()
        options.createEmptyMeasures = true
        options.moveSignaturesClef = false
        options.moveStaffTypeChanges = false
        options.ignoreBarLines = true
        const joinedMeasure = masterScore.insertMeasureInMaster(next, options)!

        for (const [sp, spEndTick] of spannersEndingInRange) {
            sp.setTick2(spEndTick)
        }

        for (let staffIdx = 0; staffIdx < masterScore.nstaves(); ++staffIdx) {
            const staff = masterScore.staves()[staffIdx]
            if (staff.isStaffTypeStartFrom(tick1)) {
                const stc = Factory.createItem(ElementType.STAFFTYPE_CHANGE, joinedMeasure)!
                stc.setParent(joinedMeasure)
                stc.setTrack(staffIdx * VOICES)
                masterScore.addElement(stc)
            }
        }

        const newTimesig = m1.timesig()
        let newLen = new Fraction(0, 1)
        for (let mm: Measure | null = m1; mm; mm = mm.nextMeasure()) {
            newLen = newLen.plus(mm.ticks())
            if (mm === m2) {
                break
            }
        }

        // The loop since measures are not currently linked in MuseScore
        // change nominal time sig, as inserted measure took it from next measure
        for (const linkedScore of masterScore.scoreList()) {
            const ins = linkedScore.tick2measure(startTick)!
            ins.undoChangeProperty(Pid.TIMESIG_NOMINAL, newTimesig)
            // set correct barline types if needed
            // TODO: handle other end barline types; they may differ per staff
            if (m2.endBarLineType() === BarLineType.END_REPEAT) {
                ins.undoChangeProperty(Pid.REPEAT_END, true)
            }
            if (m1.getProperty(Pid.REPEAT_START)) {
                ins.undoChangeProperty(Pid.REPEAT_START, true)
            }
        }
        const inserted = (next ? next.prevMeasure() : masterScore.lastMeasure())!
        inserted.adjustToLen(newLen, /* appendRests... */ false)

        range.write(masterScore, m1.tick())

        // if there are some Time Signatures in joined measures, move last one to the next measure (if there is not one already)
        const ts = inserted.last()!.prev(SegmentType.TimeSig)
        if (ts && ts.rtick().isNotZero()) {
            for (let insMSeg = inserted.last()!.prev(SegmentType.TimeSig); insMSeg && insMSeg.rtick().isNotZero();
                insMSeg = insMSeg.prev(SegmentType.TimeSig)) {
                for (let staffIdx = 0; staffIdx < masterScore.nstaves(); ++staffIdx) {
                    const insTimeSig = insMSeg.element(staffIdx * VOICES) as unknown as TimeSig | null
                    if (insTimeSig) {
                        let lts: TimeSig | null = null
                        for (const l of [...insTimeSig.linkList()]) {
                            const linkedScore = l.score()
                            const timeSig = l as unknown as TimeSig
                            const tSeg = timeSig.segment()!
                            const track = timeSig.track()
                            const sNext = next ? linkedScore.tick2measure(next.tick()) : null
                            const nextTSeg = sNext ? sNext.undoGetSegmentR(SegmentType.TimeSig, new Fraction(0, 1)) : null
                            if (sNext && !nextTSeg!.element(track)) {
                                const nsig = timeSig.clone() as TimeSig // Factory::copyTimeSig
                                nsig.setScore(linkedScore)
                                nsig.setTrack(track)
                                nsig.setParent(nextTSeg)

                                linkedScore.doUndoAddElement(nsig)

                                if (!lts) {
                                    lts = nsig
                                } else {
                                    linkedScore.undo(new Link(lts, nsig))
                                }
                            }
                            linkedScore.doUndoRemoveElement(timeSig)
                            if (tSeg.empty()) {
                                linkedScore.doUndoRemoveElement(tSeg)
                            }
                        }
                    }
                }
            }
        }
    }
}

chordRestEditHooks.splitMeasure = (masterScore, tick) => SplitJoinMeasure.splitMeasure(masterScore, tick)
