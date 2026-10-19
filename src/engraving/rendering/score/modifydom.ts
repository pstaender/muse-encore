/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/modifydom.h/.cpp
 *
 * TODO(port): multi measure rest counterparts in sortMeasureSegments
 */

import { Fraction } from '../../types/fraction'
import { ClefToBarlinePosition, VOICES, track2staff } from '../../types/types'
import { Sid } from '../../style/styledef'
import { AccidentalState } from '../../dom/key'
import { SegmentType, type Segment } from '../../dom/segment'
import type { Chord } from '../../dom/chord'
import type { Clef } from '../../dom/clef'
import type { Measure } from '../../dom/measure'
import type { DomAccessor, LayoutContext } from './layoutcontext'
import { ChordLayout } from './chordlayout'
import type { Trill } from '../../dom/trill'
import { absStep, findFollowingRepeatMeasures } from '../../dom/utils'
import { OrnamentShowAccidental } from '../../types/types'

export class ModifyDom {
    static setCrossMeasure(measure: Measure, ctx: LayoutContext): void {
        const crossMeasure = ctx.conf().styleB(Sid.crossMeasureValues)
        const dom = ctx.dom()
        for (let staffIdx = 0; staffIdx < dom.nstaves(); ++staffIdx) {
            const staff = dom.staff(staffIdx)!
            if (!staff.show()) {
                continue
            }
            const startTrack = staffIdx * VOICES
            const endTrack = startTrack + VOICES
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!segment.isJustType(SegmentType.ChordRest)) {
                    continue
                }
                for (let t = startTrack; t < endTrack; ++t) {
                    const cr = segment.cr(t)
                    if (!cr) {
                        continue
                    }
                    if (cr.isChord()) {
                        const chord = cr as Chord
                        if (!chord.isGrace()) {
                            ChordLayout.crossMeasureSetup(chord, crossMeasure, ctx)
                        }
                    }
                }
            }
        }
    }

    static connectTremolo(m: Measure): void {
        m.connectTremolo()
    }

    static cmdUpdateNotes(measure: Measure, dom: DomAccessor): void {
        for (let staffIdx = 0; staffIdx < dom.nstaves(); ++staffIdx) {
            const staff = dom.staff(staffIdx)!
            if (!staff.show()) {
                continue
            }
            const as = new AccidentalState() // list of already set accidentals for this measure
            as.init(staff.keySigEvent(measure.tick()))

            // Trills may carry an accidental into this measure that requires a force-restate
            const ticks = measure.tick().ticks()
            for (const spanner of dom.spannerMap().findOverlapping(ticks, ticks, true)) {
                if (spanner.staffIdx() !== staffIdx || !spanner.isTrill()
                    || spanner.tick().eq(measure.tick()) || spanner.tick2().eq(measure.tick())) {
                    continue
                }
                const ornament = (spanner as Trill).ornament()
                const trillNote = ornament ? ornament.noteAbove() : null
                if (trillNote && trillNote.accidental() && ornament!.showAccidental() === OrnamentShowAccidental.DEFAULT) {
                    const line = absStep(trillNote.tpc(), trillNote.epitch())
                    as.setForceRestateAccidental(line, true)
                }
            }

            const startTrack = staff.part().startTrack()
            const mainTrack = staffIdx * VOICES
            const endTrack = staff.part().endTrack()

            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (segment.isJustType(SegmentType.KeySig)) {
                    const ks = segment.element(mainTrack)
                    if (ks && ks.isKeySig()) {
                        const tick = segment.tick()
                        as.init(staff.keySigEvent(tick))
                    }
                } else if (segment.isJustType(SegmentType.ChordRest)) {
                    for (let t = startTrack; t < endTrack; ++t) {
                        const e = segment.element(t)
                        if (e && e.isChord()) { // maybe Rest
                            (e as Chord).cmdUpdateNotes(as, staffIdx)
                        }
                    }
                }
            }
        }
    }

    static createStems(measure: Measure, ctx: LayoutContext): void {
        const dom = ctx.dom()
        for (let staffIdx = 0; staffIdx < dom.nstaves(); ++staffIdx) {
            const staff = dom.staff(staffIdx)!
            if (!staff.show()) {
                continue
            }
            const startTrack = staffIdx * VOICES
            const endTrack = startTrack + VOICES
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!segment.isJustType(SegmentType.ChordRest)) {
                    continue
                }
                for (let t = startTrack; t < endTrack; ++t) {
                    const cr = segment.cr(t)
                    if (!cr) {
                        continue
                    }
                    const createStems = (chord: Chord): void => {
                        if (!chord.shouldHaveStem()) {
                            chord.removeStem()
                            return
                        }
                        if (!chord.stem()) {
                            chord.createStem()
                        }
                    }
                    if (cr.isChord()) {
                        const chord = cr as Chord
                        for (const c of chord.graceNotes()) {
                            createStems(c)
                        }
                        createStems(chord) // create stems needed to calculate spacing
                        // stem direction can change later
                    }
                }
            }
        }
    }

    static setTrackForChordGraceNotes(measure: Measure, dom: DomAccessor): void {
        for (let staffIdx = 0; staffIdx < dom.nstaves(); ++staffIdx) {
            const startTrack = staffIdx * VOICES
            const endTrack = startTrack + VOICES
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!segment.isJustType(SegmentType.ChordRest)) {
                    continue
                }
                for (let t = startTrack; t < endTrack; ++t) {
                    const cr = segment.cr(t)
                    if (cr && cr.isChord()) {
                        for (const c of (cr as Chord).graceNotes()) {
                            c.setTrack(t)
                        }
                    }
                }
            }
        }
    }

    static sortMeasureSegments(m: Measure, ctx: LayoutContext): void {
        const measure = m.coveringMMRestOrThis()

        const changeAppliesToRepeatAndContinuation = (seg: Segment): boolean => {
            const measures = findFollowingRepeatMeasures(measure)
            for (const repeatMeasure of measures) {
                if (repeatMeasure === measure.nextMeasureMM()) {
                    continue
                }
                const startTick = repeatMeasure.tick()
                for (let track = 0; track < ctx.dom().nstaves(); track += VOICES) {
                    const staff = ctx.dom().staff(track2staff(track))!
                    if (seg.isKeySigType()) {
                        const continuationKey = staff.key(seg.tick())
                        const repeatKey = staff.key(startTick)
                        const keyBeforeContinuation = staff.key(seg.tick().minus(Fraction.eps()))
                        return keyBeforeContinuation !== continuationKey && continuationKey === repeatKey
                    }
                    if (seg.isTimeSigType()) {
                        const continuationTimeSig = staff.timeSig(seg.tick())
                        const repeatTimeSig = staff.timeSig(startTick)
                        const timeSigBeforeContinuation = staff.timeSig(seg.tick().minus(Fraction.eps()))
                        return !!continuationTimeSig && !!repeatTimeSig && !!timeSigBeforeContinuation
                               && !timeSigBeforeContinuation.sig().eq(continuationTimeSig.sig())
                               && continuationTimeSig.sig().eq(repeatTimeSig.sig())
                    }
                    if (seg.isClefType()) {
                        const continuationClef = staff.clef(seg.tick())
                        const repeatClef = staff.clef(startTick)
                        const clefBeforeContinuation = staff.clef(seg.tick().minus(Fraction.eps()))
                        if (clefBeforeContinuation !== continuationClef && continuationClef === repeatClef) {
                            return true
                        }
                    }
                }
            }
            return false
        }

        const clefSegBarlinePosition = (seg: Segment): ClefToBarlinePosition => {
            for (const el of seg.elist()) {
                if (!el || !el.isClef()) {
                    continue
                }
                const clef = el as Clef
                if (clef.clefToBarlinePosition() !== ClefToBarlinePosition.AUTO) {
                    return clef.clefToBarlinePosition()
                }
            }
            return ClefToBarlinePosition.AUTO
        }

        const nextMb = measure ? measure.nextMM() : null
        if (!nextMb || !nextMb.isMeasure()) {
            return
        }
        const nextMeasure = nextMb as Measure

        const sigsShouldBeInThisMeasure = (measure.repeatEnd() && ctx.conf().styleB(Sid.changesBeforeBarlineRepeats))
                                          || (measure.repeatJump() && ctx.conf().styleB(Sid.changesBeforeBarlineOtherJumps))

        const segsToRemove: Segment[] = []
        const segsToMoveToNextMeasure: Segment[] = []
        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (!seg.tick().eq(measure.endTick()) || seg.isChordRestType()) {
                continue
            }
            if (seg.isClefType()) {
                const pos = clefSegBarlinePosition(seg)
                if (pos === ClefToBarlinePosition.BEFORE) {
                    continue
                } else if (pos === ClefToBarlinePosition.AFTER) {
                    segsToMoveToNextMeasure.push(seg)
                    continue
                }
                if (!measure.repeatEnd()) {
                    continue
                }
                if ((!sigsShouldBeInThisMeasure && !changeAppliesToRepeatAndContinuation(seg))
                    || (measure.repeatEnd() && !ctx.conf().styleB(Sid.placeClefsBeforeRepeats))) {
                    segsToMoveToNextMeasure.push(seg)
                    continue
                }
            }
            if ((seg.isKeySigType() || seg.isTimeSigType()) && !seg.header() && !seg.trailer()
                && (!sigsShouldBeInThisMeasure || !changeAppliesToRepeatAndContinuation(seg))) {
                if (nextMeasure.findSegmentR(seg.segmentType(), new Fraction(0, 1))) {
                    segsToRemove.push(seg)
                    continue
                }
                segsToMoveToNextMeasure.push(seg)
            }
        }

        const segsToMoveToThisMeasure: Segment[] = []
        for (let seg = nextMeasure.first(); seg; seg = seg.next()) {
            if (!seg.tick().eq(nextMeasure.tick()) || seg.isChordRestType()) {
                continue
            }
            if (seg.isClefType()) {
                const pos = clefSegBarlinePosition(seg)
                if (pos === ClefToBarlinePosition.BEFORE) {
                    segsToMoveToThisMeasure.push(seg)
                    continue
                } else if (pos === ClefToBarlinePosition.AFTER) {
                    continue
                }
                if (!measure.repeatEnd()) {
                    segsToMoveToThisMeasure.push(seg)
                    continue
                }
                if ((sigsShouldBeInThisMeasure && changeAppliesToRepeatAndContinuation(seg))
                    || !measure.repeatEnd() || ctx.conf().styleB(Sid.placeClefsBeforeRepeats)) {
                    segsToMoveToThisMeasure.push(seg)
                }
            }
            if ((seg.isTimeSigType() || seg.isKeySigType()) && !seg.header() && !seg.trailer()
                && sigsShouldBeInThisMeasure && changeAppliesToRepeatAndContinuation(seg)) {
                if (measure.findSegmentR(seg.segmentType(), measure.ticks())) {
                    segsToRemove.push(seg)
                    continue
                }
                segsToMoveToThisMeasure.push(seg)
            }
        }

        for (const seg of segsToRemove) {
            seg.measure().remove(seg)
        }

        for (const seg of segsToMoveToNextMeasure) {
            seg.setEndOfMeasureChange(false)
            ModifyDom.changeSegmentParent(seg, nextMeasure, new Fraction(0, 1))
        }

        for (const seg of segsToMoveToThisMeasure) {
            seg.setEndOfMeasureChange(true)
            ModifyDom.changeSegmentParent(seg, measure, measure.ticks())
        }

        measure.checkEndOfMeasureChange()

        ModifyDom.removeAndAddBeginSegments(nextMeasure)

        const prevMeasure = measure.prevMeasure()
        if (prevMeasure && prevMeasure === ctx.dom().firstMeasure()) {
            ModifyDom.removeAndAddBeginSegments(prevMeasure)
        }
    }

    /** ChangeSegmentParent undo command (editing/addremoveelement.cpp) */
    private static changeSegmentParent(segment: Segment, parent: Measure, tick: Fraction): void {
        const p = segment.measure()
        p.remove(segment)
        segment.setParent(parent)
        segment.setRtick(tick)
        parent.add(segment)
    }

    static removeAndAddBeginSegments(measure: Measure): void {
        // Remove and re-add segments to make sure they're sorted correctly
        const segsToSort: Segment[] = []
        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (!seg.rtick().eq(new Fraction(0, 1)) || seg.isChordRestType() || seg.isEndBarLineType()) {
                continue
            }
            segsToSort.push(seg)
        }
        for (const seg of segsToSort) {
            measure.segments().remove(seg)
        }
        for (const seg of segsToSort) {
            measure.add(seg)
        }
    }
}
