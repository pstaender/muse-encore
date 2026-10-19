/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/measurelayout.h/.cpp
 *
 * TODO(port): multi measure rests (createMMRest), repeat courtesy parentheses, play count texts,
 * MM rest ranges, practice mode, time tick anchors
 */

import { LineF, PointF, type ScaleF } from '../../../framework/draw/types/geometry'
import { Fraction } from '../../types/fraction'
import {
    AlignH, BarLineType, CourtesyBarlineMode, DirectionH, DurationType, ElementType, Key, MeasureNumberPlacement, ParenthesesMode, TimeSigPlacement, VOICES,
    staff2track, track2staff, type staff_idx_t, type track_idx_t,
} from '../../types/types'
import { Sid } from '../../style/styledef'
import { Factory } from '../../dom/factory'
import { Pid } from '../../dom/property'
import { MeasureNumber } from '../../dom/measurenumber'
import { Segment, SegmentType } from '../../dom/segment'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Clef } from '../../dom/clef'
import type { KeySig } from '../../dom/keysig'
import type { Measure } from '../../dom/measure'
import type { MeasureBase } from '../../dom/measurebase'
import type { Rest } from '../../dom/rest'
import type { Staff } from '../../dom/staff'
import type { StaffLines } from '../../dom/stafflines'
import type { TimeSig } from '../../dom/timesig'
import type { GraceNotesGroup } from '../../dom/chord'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ModifyDom } from './modifydom'
import { SegmentLayout } from './segmentlayout'
import { BeamLayout } from './beamlayout'
import { ChordLayout } from './chordlayout'
import { RestLayout } from './restlayout'
import { SlurTieLayout } from './slurtielayout'
import type { MMRest } from '../../dom/mmrest'
import type { EngravingItem } from '../../dom/engravingitem'
import type { TextBase } from '../../dom/textbase'
import { ArpeggioLayout } from './arpeggiolayout'
import type { Arpeggio } from '../../dom/arpeggio'
import { TremoloLayout } from './tremololayout'
import { ParenthesisLayout } from './parenthesislayout'
import type { Parenthesis } from '../../dom/parenthesis'
import { findFollowingRepeatMeasures } from '../../dom/utils'

interface MeasureStartEndPos {
    x1: number
    x2: number
}

const segmentCreate = (m: Measure, st: SegmentType, t: Fraction): Segment => new Segment(m, st, t)

const BREAK_TYPES = new Set<ElementType>([
    ElementType.TEMPO_TEXT,
    ElementType.REHEARSAL_MARK,
    ElementType.HARMONY,
    ElementType.STAFF_TEXT,
    ElementType.EXPRESSION,
    ElementType.DYNAMIC,
    ElementType.SYSTEM_TEXT,
    ElementType.TRIPLET_FEEL,
    ElementType.PLAYTECH_ANNOTATION,
    ElementType.CAPO,
    ElementType.INSTRUMENT_CHANGE,
    ElementType.STRING_TUNINGS,
    ElementType.SYMBOL,
    ElementType.FRET_DIAGRAM,
    ElementType.HARP_DIAGRAM,
    ElementType.PLAY_COUNT_TEXT,
    ElementType.BREATH,
])

const ALWAYS_BREAK_TYPES = new Set<ElementType>([
    ElementType.TEMPO_TEXT,
    ElementType.REHEARSAL_MARK,
])

const CONDITIONAL_BREAK_TYPES = new Set<ElementType>([
    ElementType.HARMONY,
    ElementType.STAFF_TEXT,
    ElementType.EXPRESSION,
    ElementType.DYNAMIC,
    ElementType.SYSTEM_TEXT,
    ElementType.TRIPLET_FEEL,
    ElementType.PLAYTECH_ANNOTATION,
    ElementType.CAPO,
    ElementType.INSTRUMENT_CHANGE,
    ElementType.STRING_TUNINGS,
    ElementType.SYMBOL,
    ElementType.FRET_DIAGRAM,
    ElementType.HARP_DIAGRAM,
    ElementType.BREATH,
])

function validMMRestMeasure(ctx: LayoutContext, m: Measure): boolean {
    if (m.irregular()) {
        return false
    }

    const nstaves = ctx.dom().nstaves()
    for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
        if (m.isMeasureRepeatGroup(staffIdx)) {
            return false
        }
    }

    let n = 0
    for (let s = m.first(); s; s = s.next()) {
        for (const e of s.annotations()) {
            if (e.staffIdx() >= nstaves || !e.staff()!.show() || !e.visible()) {
                continue
            }
            if (BREAK_TYPES.has(e.type()) && !s.rtick().isZero()) {
                // play count text is permitted at the end of a measure
                if (!e.isPlayCountText()) {
                    return false
                }
            }
        }
        if (s.isChordRestType()) {
            let restFound = false
            const tracks = ctx.dom().ntracks()
            for (let track = 0; track < tracks; ++track) {
                if ((track % VOICES) === 0 && !ctx.dom().staff(Math.trunc(track / VOICES))!.show()) {
                    track += VOICES - 1
                    continue
                }
                const e = s.element(track)
                if (e) {
                    if (!e.isRest()) {
                        return false
                    } else {
                        const isNonEmptyIrregular = m.isIrregular() && !(e as Rest).isFullMeasureRest()
                        if (isNonEmptyIrregular) {
                            return false
                        }
                    }
                    restFound = true
                }
            }
            for (const e of s.annotations()) {
                if (e.isFermata()) {
                    return false
                }
            }
            if (restFound) {
                ++n
            }
            // measure is not empty if there is more than one rest
            if (n > 1) {
                return false
            }
        }
    }
    return true
}

function breakMultiMeasureRest(ctx: LayoutContext, m: Measure): boolean {
    if (m.breakMultiMeasureRest()) {
        return true
    }

    const pm = m.prevMeasure()
    if (m.repeatStart()
        || (pm && pm.repeatEnd())
        || m.isIrregular()
        || (pm && pm.isIrregular())
        || (pm && pm.sectionBreak())) {
        return true
    }

    const breakSpannerTypes = new Set<ElementType>([ElementType.VOLTA, ElementType.GRADUAL_TEMPO_CHANGE, ElementType.TEXTLINE])
    // Break for spanners/textLines in this measure
    for (const s of ctx.dom().spannerMap().findOverlapping(m.tick().ticks(), m.endTick().ticks())) {
        if (!s.visible()) {
            continue
        }
        const spannerStartsInside = s.tick().ge(m.tick()) && s.tick().lt(m.endTick())
        const spannerEndsInside = s.tick2().ge(m.tick()) && s.tick2().lt(m.endTick())
        if (breakSpannerTypes.has(s.type()) && (spannerStartsInside || spannerEndsInside)) {
            return true
        }
    }
    // Break for spanners/textLines starting or ending mid-way inside the *previous* measure
    if (pm) {
        for (const s of ctx.dom().spannerMap().findOverlapping(pm.tick().ticks(), pm.endTick().ticks())) {
            if (!s.visible()) {
                continue
            }
            const spannerStartsInside = s.tick().gt(pm.tick()) && s.tick().lt(pm.endTick())
            const spannerEndsInside = s.tick2().gt(pm.tick()) && s.tick2().lt(pm.endTick())
            if (breakSpannerTypes.has(s.type()) && (spannerStartsInside || spannerEndsInside)) {
                return true
            }
        }
    }

    const markerAlignedRight = (e: EngravingItem): boolean => e.isTextBase() && (e as TextBase).align().horizontal === AlignH.RIGHT

    // break for marker in this measure
    for (const e of m.el()) {
        if (e.isMarker() && !markerAlignedRight(e)) {
            return true
        }
    }

    // break for marker & jump in previous measure
    if (pm) {
        for (const e of pm.el()) {
            if (e.isJump()) {
                return true
            } else if (e.isMarker() && markerAlignedRight(e)) {
                return true
            }
        }
    }

    const breakForAnnotation = (e: EngravingItem): boolean => {
        if (ALWAYS_BREAK_TYPES.has(e.type())) {
            return true
        }
        const breakForElement = e.systemFlag() || e.staff()!.show()
        return CONDITIONAL_BREAK_TYPES.has(e.type()) && breakForElement
    }

    // Break for annotations found mid-way into the previous measure
    if (pm) {
        for (let s = pm.first(); s; s = s.next()) {
            for (const e of s.annotations()) {
                if (!e.visible()) {
                    continue
                }
                const isInMidMeasure = e.rtick().gt(new Fraction(0, 1))
                if (isInMidMeasure && breakForAnnotation(e)) {
                    return true
                }
            }
        }
    }

    for (let s = m.first(); s; s = s.next()) {
        // Break for annotations in this measure
        for (const e of s.annotations()) {
            if (e.visible() && breakForAnnotation(e)) {
                return true
            }
        }
        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            if (!ctx.dom().staff(staffIdx)!.show()) {
                continue
            }
            const e = s.element(staffIdx * VOICES)
            if (!e || e.generated()) {
                continue
            }
            if (s.isStartRepeatBarLineType()) {
                return true
            }
            if (s.isSegType(SegmentType.KeySig | SegmentType.TimeSig) && m.tick().isNotZero()) {
                return true
            }
            if (s.isClefType()) {
                if (!s.tick().eq(m.endTick()) && m.tick().isNotZero()) {
                    return true
                }
            }
        }
    }
    if (pm) {
        const s = pm.findSegmentR(SegmentType.EndBarLine, pm.ticks())
        if (s) {
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const bl = s.element(staffIdx * VOICES) as BarLine | null
                if (bl) {
                    const t = bl.barLineType()
                    if (t !== BarLineType.NORMAL && t !== BarLineType.BROKEN && t !== BarLineType.DOTTED && !bl.generated()) {
                        return true
                    } else {
                        break
                    }
                }
            }
        }
        // Check for courtesy clefs at the end of the previous measure
        // Only break if the clef is on a visible staff
        const hasVisibleElement = (seg: Segment): boolean => {
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                if (!ctx.dom().staff(staffIdx)!.show()) {
                    continue
                }
                const e = seg.element(staffIdx * VOICES)
                if (e && !e.generated()) {
                    return true
                }
            }
            return false
        }
        const clefSeg = pm.findSegment(SegmentType.Clef, m.tick())
        if (clefSeg && hasVisibleElement(clefSeg)) {
            return true
        }
        const tsSeg = pm.findSegment(SegmentType.TimeSigType, m.tick())
        if (tsSeg && hasVisibleElement(tsSeg)) {
            return true
        }
        const ksSeg = pm.findSegment(SegmentType.KeySigType, m.tick())
        if (ksSeg && hasVisibleElement(ksSeg)) {
            return true
        }
    }
    return false
}

export class MeasureLayout {
    // ---------------------------------------------------------
    //   layout2
    //    called after layout of page
    // ---------------------------------------------------------

    static layout2(item: Measure, ctx: LayoutContext): void {
        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            const spDown = item.vspacerDown(staffIdx)
            if (spDown) {
                TLayout.layoutSpacer(spDown, ctx)
                const y = item.system()!.staff(staffIdx)!.y() + spDown.staffOffsetY()
                spDown.setPos(item.spatium() * 0.5, y + spDown.staff()!.staffHeight(item.tick()))
            }
            const spUp = item.vspacerUp(staffIdx)
            if (spUp) {
                TLayout.layoutSpacer(spUp, ctx)
                const y = item.system()!.staff(staffIdx)!.y() + spUp.staffOffsetY()
                spUp.setPos(item.spatium() * 0.5, y - spUp.absoluteGap())
            }
        }

        TLayout.layoutBaseMeasureBase(item, ctx)

        //
        //   cross-staff ties
        //
        const layoutCrossStaffTies = (chord: Chord, stick: Fraction): void => {
            for (const note of chord.notes()) {
                const tieFor = note.tieFor()
                const tieBack = note.tieBack()
                // TODO(port): laissez vibrer
                if (tieFor && tieFor.isCrossStaff()) {
                    SlurTieLayout.layoutTieFor(tieFor, item.system()!)
                }
                if (tieBack && tieBack.tick().lt(stick) && tieBack.isCrossStaff()) {
                    SlurTieLayout.layoutTieBack(tieBack, item.system()!, ctx)
                }
            }
        }

        const stick = item.system()!.measures()[0].tick()
        const tracks = ctx.dom().ntracks()
        const st = SegmentType.ChordRest
        for (let track = 0; track < tracks; ++track) {
            if (!ctx.dom().staff(track2staff(track))!.show()) {
                track += VOICES - 1
                continue
            }
            for (let seg = item.first(st); seg; seg = seg.next(st)) {
                const element = seg.element(track)
                if (!element || !element.isChord()) {
                    continue
                }
                const chord = element as Chord
                layoutCrossStaffTies(chord, stick)
                for (const graceChord of chord.graceNotes()) {
                    layoutCrossStaffTies(graceChord, stick)
                }
            }
        }
    }

    static moveToNextMeasure(ctx: LayoutContext): void {
        const state = ctx.mutState()
        state.setPrevMeasure(state.curMeasure())
        state.setCurMeasure(state.nextMeasure())
        if (!state.curMeasure()) {
            state.setNextMeasure(ctx.conf().isShowVBox() ? ctx.mutDom().first() : ctx.mutDom().firstMeasure())
        } else {
            const m = ctx.conf().isShowVBox() ? state.curMeasure()!.next() : state.curMeasure()!.nextMeasure()
            state.setNextMeasure(m)
        }
    }

    static createMultiMeasureRestsIfNeed(currentMB: MeasureBase, ctx: LayoutContext): void {
        if (!currentMB.isMeasure() || ctx.dom().nstaves() === 0) {
            return
        }
        const mno = ctx.state().measureNo()
        const firstMeasure = currentMB as Measure

        if (ctx.conf().styleB(Sid.createMultiMeasureRests)) {
            let measureToBeChecked = firstMeasure
            let lastMeasure = measureToBeChecked
            let n = 0
            let len = new Fraction(0, 1)

            while (validMMRestMeasure(ctx, measureToBeChecked)) {
                if (n && breakMultiMeasureRest(ctx, measureToBeChecked)) {
                    break
                }
                if (measureToBeChecked !== firstMeasure) {
                    const measureNo = MeasureLayout.adjustMeasureNo(measureToBeChecked, ctx.state().measureNo())
                    ctx.mutState().setMeasureNo(measureNo)
                }
                ++n
                len = len.plus(measureToBeChecked.ticks())
                lastMeasure = measureToBeChecked
                const nextMeasureBase = ctx.conf().isShowVBox() ? measureToBeChecked.next() : measureToBeChecked.nextMeasure()
                if (!(nextMeasureBase && nextMeasureBase.isMeasure())) {
                    break
                }
                measureToBeChecked = nextMeasureBase as Measure
            }

            if (n >= ctx.conf().styleI(Sid.minEmptyMeasures)) {
                MeasureLayout.createMMRest(ctx, firstMeasure, lastMeasure, len)
                ctx.mutState().setCurMeasure(firstMeasure.mmRest())
                ctx.mutState().setNextMeasure(ctx.conf().isShowVBox() ? lastMeasure.next() : lastMeasure.nextMeasure())
            } else {
                if (firstMeasure.mmRest()) {
                    MeasureLayout.removeMMRestElements(firstMeasure.mmRest()!)
                    firstMeasure.setMMRest(null)
                }
                firstMeasure.setMMRestCount(0)
                ctx.mutState().setMeasureNo(mno)
            }
        } else if (firstMeasure.mmRest()) {
            MeasureLayout.removeMMRestElements(firstMeasure.mmRest()!)
            if (firstMeasure.mmRestCount() > 0) {
                const measureNo = ctx.state().measureNo() + firstMeasure.mmRestCount() - 1
                ctx.mutState().setMeasureNo(measureNo)
            }
        }
    }

    static createMMRest(ctx: LayoutContext, firstMeasure: Measure, lastMeasure: Measure, len: Fraction): void {
        const score = ctx.score()
        let numMeasuresInMMRest = 1
        if (firstMeasure !== lastMeasure) {
            for (let m = firstMeasure.nextMeasure(); m; m = m.nextMeasure()) {
                ++numMeasuresInMMRest
                m.setMMRestCount(-1)
                if (m.mmRest()) {
                    m.setMMRest(null)
                }
                if (m === lastMeasure) {
                    break
                }
            }
        }

        // mmrMeasure coexists with n undisplayed measures of rests
        let mmrMeasure = firstMeasure.mmRest()
        if (mmrMeasure) {
            // reuse existing mmrest
            if (!mmrMeasure.ticks().eq(len)) {
                const bls = mmrMeasure.findSegmentR(SegmentType.EndBarLine, mmrMeasure.ticks())
                const cs = mmrMeasure.findSegmentR(SegmentType.Clef, mmrMeasure.ticks())
                // adjust length
                mmrMeasure.setTicks(len)
                // move existing end barline and clef
                if (bls) {
                    bls.setRtick(len)
                }
                if (cs) {
                    cs.setRtick(len)
                }
            }
            MeasureLayout.removeSystemTrailer(mmrMeasure, ctx)
        } else {
            mmrMeasure = Factory.createItem(ElementType.MEASURE, score) as Measure
            mmrMeasure.setScore(score)
            mmrMeasure.setTicks(len)
            mmrMeasure.setTick(firstMeasure.tick())
            firstMeasure.setMMRest(mmrMeasure)
        }
        mmrMeasure.setTimesig(firstMeasure.timesig())
        mmrMeasure.setPageBreak(lastMeasure.pageBreak())
        mmrMeasure.setLineBreak(lastMeasure.lineBreak())
        mmrMeasure.setRepeatCount(lastMeasure.repeatCount())
        mmrMeasure.setMMRestCount(numMeasuresInMMRest)
        mmrMeasure.setNo(firstMeasure.no())

        ctx.mutDom().updateSystemLocksOnCreateMMRest(firstMeasure, lastMeasure)

        //
        // set mmrMeasure with same barline as last underlying measure
        //
        const lastMeasureEndBarlineSeg = lastMeasure.findSegmentR(SegmentType.EndBarLine, lastMeasure.ticks())
        if (lastMeasureEndBarlineSeg) {
            const mmrEndBarlineSeg = mmrMeasure.undoGetSegmentR(SegmentType.EndBarLine, mmrMeasure.ticks())
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const e = lastMeasureEndBarlineSeg.element(staffIdx * VOICES)
                if (e) {
                    const generated = e.generated()
                    if (!mmrEndBarlineSeg.element(staffIdx * VOICES)) {
                        const eClone = generated ? e.clone() : e.linkedClone()
                        eClone.setGenerated(generated)
                        eClone.setParent(mmrEndBarlineSeg)
                        score.addElement(eClone)
                    } else {
                        const mmrEndBarline = mmrEndBarlineSeg.element(staffIdx * VOICES) as BarLine
                        const lastMeasureEndBarline = e as BarLine
                        if (!generated && !mmrEndBarline.links()) {
                            mmrEndBarline.linkTo(lastMeasureEndBarline)
                        }
                        if (mmrEndBarline.barLineType() !== lastMeasureEndBarline.barLineType()) {
                            // change directly when generating mmrests, do not change underlying measures or follow links
                            mmrEndBarline.setProperty(Pid.BARLINE_TYPE, lastMeasureEndBarline.barLineType())
                            mmrEndBarline.setGenerated(generated)
                        }
                    }
                }
            }
            MeasureLayout.cloneAnnotationsToMMRest(lastMeasureEndBarlineSeg, mmrEndBarlineSeg, ctx)
        }

        //
        // if last underlying measure ends with clef change, show same at end of mmrest
        //
        const lastMeasureClefSeg = lastMeasure.findSegmentR(SegmentType.Clef | SegmentType.HeaderClef, lastMeasure.ticks())
        if (lastMeasureClefSeg) {
            const mmrClefSeg = mmrMeasure.undoGetSegment(lastMeasureClefSeg.segmentType(), lastMeasure.endTick())
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const track = staff2track(staffIdx)
                const e = lastMeasureClefSeg.element(track)
                if (e && e.isClef()) {
                    const lastMeasureClef = e as Clef
                    if (!mmrClefSeg.element(track)) {
                        const mmrClef = (lastMeasureClef.generated() ? lastMeasureClef.clone() : lastMeasureClef.linkedClone()) as Clef
                        mmrClef.setParent(mmrClefSeg)
                        score.addElement(mmrClef)
                    } else {
                        const mmrClef = mmrClefSeg.element(track) as Clef
                        mmrClef.setClefType(lastMeasureClef.clefType())
                        mmrClef.setShowCourtesy(lastMeasureClef.showCourtesy())
                    }
                }
            }
        }

        mmrMeasure.setRepeatStart(firstMeasure.repeatStart() || lastMeasure.repeatStart())
        mmrMeasure.setRepeatEnd(firstMeasure.repeatEnd() || lastMeasure.repeatEnd())
        mmrMeasure.setSectionBreak(lastMeasure.sectionBreak())

        //
        // copy markers to mmrMeasure
        //
        const oldList = mmrMeasure.takeElements()
        const newList = [...lastMeasure.el()]
        for (const e of firstMeasure.el()) {
            if (e.isMarker() && firstMeasure !== lastMeasure) {
                newList.push(e)
            }
        }
        for (const e of newList) {
            let found = false
            for (const ee of oldList) {
                if (ee.type() === e.type() && ee.subtype() === e.subtype()) {
                    mmrMeasure.add(ee)
                    oldList.splice(oldList.indexOf(ee), 1)
                    found = true
                    break
                }
            }
            if (!found) {
                const newEl = e.isLayoutBreak() ? e.clone() : e.linkedClone()
                newEl.setParent(mmrMeasure)
                score.addElement(newEl)
            }
        }
        // the elements of oldList are not added again (C++ doUndoRemoveElement)

        const s = mmrMeasure.undoGetSegmentR(SegmentType.ChordRest, new Fraction(0, 1))
        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            const track = staffIdx * VOICES
            if (!s.element(track)) {
                const mmr = Factory.createItem(ElementType.MMREST, s) as MMRest
                mmr.setDurationType(DurationType.V_MEASURE)
                mmr.setTicks(mmrMeasure.ticks())
                mmr.setTrack(track)
                mmr.setParent(s)
                score.addElement(mmr)
            }
        }

        //
        // further check for clefs
        //
        let underlyingSeg = lastMeasure.findSegmentR(SegmentType.Clef, lastMeasure.ticks())
        let mmrSeg = mmrMeasure.findSegment(SegmentType.Clef, lastMeasure.endTick())
        if (underlyingSeg) {
            if (!mmrSeg) {
                mmrSeg = mmrMeasure.undoGetSegmentR(SegmentType.Clef, lastMeasure.ticks())
            }
            mmrSeg.setEnabled(underlyingSeg.enabled())
            mmrSeg.setTrailer(underlyingSeg.trailer())
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const track = staffIdx * VOICES
                const clef = underlyingSeg.element(track) as Clef | null
                if (clef && !mmrSeg.element(track)) {
                    mmrSeg.add(clef.clone())
                }
            }
        } else if (mmrSeg) {
            mmrMeasure.remove(mmrSeg)
        }

        //
        // check for time signature
        //
        const copyTimeSigs = (underlying: Segment, mmrTsSeg: Segment): void => {
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const track = staffIdx * VOICES
                const underlyingTimeSig = underlying.element(track) as TimeSig | null
                if (underlyingTimeSig) {
                    let mmrTimeSig = mmrTsSeg.element(track) as TimeSig | null
                    if (!mmrTimeSig) {
                        mmrTimeSig = (underlyingTimeSig.generated() ? underlyingTimeSig.clone() : underlyingTimeSig.linkedClone()) as TimeSig
                        mmrTimeSig.setParent(mmrTsSeg)
                        score.addElement(mmrTimeSig)
                    } else {
                        TLayout.layoutTimeSig(mmrTimeSig, ctx)
                    }
                }
            }
        }
        underlyingSeg = firstMeasure.findSegmentR(SegmentType.TimeSig, new Fraction(0, 1))
        mmrSeg = mmrMeasure.findSegment(SegmentType.TimeSig, firstMeasure.tick())
        if (underlyingSeg) {
            if (!mmrSeg) {
                mmrSeg = mmrMeasure.undoGetSegmentR(SegmentType.TimeSig, new Fraction(0, 1))
            }
            mmrSeg.setEnabled(underlyingSeg.enabled())
            mmrSeg.setHeader(underlyingSeg.header())
            copyTimeSigs(underlyingSeg, mmrSeg)
        } else if (mmrSeg) {
            mmrMeasure.remove(mmrSeg)
        }

        //
        // check for end of measure time signature
        //
        underlyingSeg = lastMeasure.findSegmentR(SegmentType.TimeSig, lastMeasure.ticks())
        mmrSeg = mmrMeasure.findSegmentR(SegmentType.TimeSig, mmrMeasure.ticks())
        if (underlyingSeg) {
            if (!mmrSeg) {
                mmrSeg = mmrMeasure.undoGetSegmentR(SegmentType.TimeSig, mmrMeasure.ticks())
            }
            mmrSeg.setEnabled(underlyingSeg.enabled())
            mmrSeg.setHeader(underlyingSeg.header())
            mmrSeg.setEndOfMeasureChange(underlyingSeg.endOfMeasureChange())
            copyTimeSigs(underlyingSeg, mmrSeg)
        } else if (mmrSeg) {
            mmrMeasure.remove(mmrSeg)
        }

        // TODO(port): ambitus

        //
        // check for key signature
        //
        underlyingSeg = firstMeasure.findSegmentR(SegmentType.KeySig, new Fraction(0, 1))
        mmrSeg = mmrMeasure.findSegmentR(SegmentType.KeySig, new Fraction(0, 1))
        if (underlyingSeg) {
            if (!mmrSeg) {
                mmrSeg = mmrMeasure.undoGetSegmentR(SegmentType.KeySig, new Fraction(0, 1))
            }
            mmrSeg.setEnabled(underlyingSeg.enabled())
            mmrSeg.setHeader(underlyingSeg.header())
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const track = staffIdx * VOICES
                const underlyingKeySig = underlyingSeg.element(track) as KeySig | null
                if (underlyingKeySig) {
                    let mmrKeySig = mmrSeg.element(track) as KeySig | null
                    if (!mmrKeySig) {
                        mmrKeySig = (underlyingKeySig.generated() ? underlyingKeySig.clone() : underlyingKeySig.linkedClone()) as KeySig
                        mmrKeySig.setParent(mmrSeg)
                        mmrKeySig.setGenerated(true)
                        score.addElement(mmrKeySig)
                    } else if (!mmrKeySig.keySigEvent().equals(underlyingKeySig.keySigEvent())) {
                        mmrKeySig.setKeySigEvent(underlyingKeySig.keySigEvent())
                    }
                }
            }
        } else if (mmrSeg) {
            mmrSeg.setEnabled(false)
        }

        mmrMeasure.checkHeader()
        mmrMeasure.checkTrailer()

        //
        // check for rehearsal mark etc.
        //
        underlyingSeg = firstMeasure.findSegmentR(SegmentType.ChordRest, new Fraction(0, 1))
        MeasureLayout.cloneAnnotationsToMMRest(underlyingSeg, s, ctx)

        const nm = ctx.conf().isShowVBox() ? lastMeasure.next() : lastMeasure.nextMeasure()
        mmrMeasure.setNext(nm)
        mmrMeasure.setPrev(firstMeasure.prev())
    }

    private static cloneAnnotationsToMMRest(underlyingSeg: Segment | null, mmrSeg: Segment, ctx: LayoutContext): void {
        if (!underlyingSeg) {
            return
        }
        // clone elements from underlying measure to mmr
        for (const e of underlyingSeg.annotations()) {
            // look at elements in underlying measure
            if (!BREAK_TYPES.has(e.type()) || !e.visible()) {
                continue
            }
            // try to find a match in mmr
            const found = mmrSeg.annotations().some(ee => e.linkList().includes(ee))
            // add to mmr if no match found
            if (!found) {
                const eClone = e.linkedClone()
                eClone.setParent(mmrSeg)
                ctx.score().addElement(eClone)
            }
        }

        // remove stray elements (possibly leftover from a previous layout of this mmr)
        for (const e of [...mmrSeg.annotations()]) {
            if (!BREAK_TYPES.has(e.type())) {
                continue
            }
            const found = underlyingSeg.annotations().some(ee => e.linkList().includes(ee))
            if (!found) {
                ctx.score().removeElement(e)
            }
        }
    }

    static removeMMRestElements(mmRestMeasure: Measure): void {
        // Removed linked clones that were created for the mmRest measure
        for (const item of [...mmRestMeasure.el()]) {
            item.undoUnlink()
            mmRestMeasure.score().removeElement(item)
        }
        for (let seg = mmRestMeasure.first(); seg && seg.rtick().isZero(); seg = seg.next()) {
            for (const item of [...seg.annotations()]) {
                item.undoUnlink()
                mmRestMeasure.score().removeElement(item)
            }
        }
    }

    static checkStaffMoveValidity(measure: Measure, ctx: LayoutContext): void {
        for (let segment = measure.first(); segment; segment = segment.next()) {
            if (!segment.isJustType(SegmentType.ChordRest)) {
                continue
            }
            for (let t = 0; t < ctx.dom().nstaves() * VOICES; ++t) {
                const cr = segment.element(t) as ChordRest | null
                if (cr) {
                    if (cr.staffMove() || cr.storedStaffMove()) {
                        cr.checkStaffMoveValidity()
                    }
                }
            }
        }
    }

    // ---------------------------------------------------------
    //   layoutMeasure
    // ---------------------------------------------------------

    static layoutMeasure(currentMB: MeasureBase | null, ctx: LayoutContext): void {
        if (!currentMB) {
            return
        }

        const measureNo = MeasureLayout.adjustMeasureNo(currentMB, ctx.state().measureNo())
        ctx.mutState().setMeasureNo(measureNo)

        MeasureLayout.createMultiMeasureRestsIfNeed(currentMB, ctx)

        currentMB = ctx.mutState().curMeasure()!

        if (!currentMB.isMeasure()) {
            return
        }

        const measure = currentMB as Measure

        measure.moveTicks(ctx.state().tick().minus(measure.tick()))

        ctx.mutState().setTick(ctx.state().tick().plus(measure.ticks()))

        if (ctx.conf().isLinearMode() && (measure.tick().lt(ctx.state().startTick()) || measure.tick().gt(ctx.state().endTick()))) {
            // Only layout measures in range
            return
        }

        if (ctx.dom().allStavesInvisible()) {
            return
        }

        MeasureLayout.checkStaffMoveValidity(measure, ctx)

        ModifyDom.setCrossMeasure(measure, ctx)
        ModifyDom.connectTremolo(measure)
        ModifyDom.cmdUpdateNotes(measure, ctx.dom())
        ModifyDom.createStems(measure, ctx)
        ModifyDom.setTrackForChordGraceNotes(measure, ctx.dom())
        ModifyDom.sortMeasureSegments(measure, ctx)

        const dom = ctx.dom()
        const conf = ctx.conf()
        for (let staffIdx = 0; staffIdx < dom.nstaves(); ++staffIdx) {
            const staff = dom.staff(staffIdx)!
            const startTrack = staffIdx * VOICES
            const endTrack = startTrack + VOICES

            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (!staff.show() && !segment.isSegType(SegmentType.TimeSigType)) {
                    continue
                }

                SegmentLayout.layoutMeasureIndependentElements(segment, startTrack, ctx)

                if (!segment.isJustType(SegmentType.ChordRest)) {
                    continue
                }

                SegmentLayout.setChordMag(staff, segment, startTrack, endTrack, conf)
                SegmentLayout.layoutChordDrumset(staff, segment, startTrack, endTrack, conf)
                SegmentLayout.computeChordsUp(segment, startTrack, endTrack, ctx)
                SegmentLayout.layoutChordsStem(segment, startTrack, endTrack, ctx)
            }
        }

        BeamLayout.createBeams(ctx, measure)

        /* HACK: The real beam layout is computed at much later stage (you can't do the beams until you know
         * horizontal spacing). However, horizontal spacing needs to know stems extensions to avoid collision
         * with stems, and stems extensions depend on beams. Solution: we compute dummy beams here, *before*
         * horizontal spacing. It is pointless for the beams themselves, but it *does* correctly extend the
         * stems, thus allowing to compute horizontal spacing correctly. (M.S.) */
        for (let s = measure.first(); s; s = s.next()) {
            if (!s.isChordRestType()) {
                continue
            }
            for (const item of s.elist()) {
                if (!item || !item.isChordRest()) {
                    continue
                }
                const staff = ctx.dom().staff(item.vStaffIdx())
                if (staff && staff.show()) {
                    BeamLayout.layoutNonCrossBeams(item as ChordRest, ctx)
                }
            }
        }

        for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
            const staff = ctx.dom().staff(staffIdx)!
            if (!staff.show()) {
                continue
            }
            for (let segment = measure.first(); segment; segment = segment.next()) {
                if (segment.isChordRestType()) {
                    ChordLayout.layoutChords1(ctx, segment, staffIdx)
                    RestLayout.resolveVerticalRestConflicts(ctx, segment, staffIdx)
                    for (let voice = 0; voice < VOICES; ++voice) {
                        const cr = segment.cr(staffIdx * VOICES + voice)
                        if (cr) {
                            for (const l of cr.lyrics()) {
                                if (l) {
                                    TLayout.layoutLyrics(l, ctx)
                                }
                            }
                        }
                    }
                }
            }
        }

        for (let segment = measure.first(); segment; segment = segment.next()) {
            if (segment.isBreathType()) {
                for (const e of segment.elist()) {
                    if (e && e.isBreath()) {
                        TLayout.layoutItem(e, ctx)
                    }
                }
            } else if (segment.isChordRestType()) {
                for (const e of segment.annotations()) {
                    if (e.isSymbol() || e.isHarmony() || e.isFretDiagram()) {
                        TLayout.layoutItem(e, ctx)
                    }
                }
            }
        }

        let seg = measure.findSegmentR(SegmentType.StartRepeatBarLine, new Fraction(0, 1))
        if (measure.repeatStart()) {
            if (!seg) {
                seg = measure.getSegmentR(SegmentType.StartRepeatBarLine, new Fraction(0, 1))
            }
            MeasureLayout.barLinesSetSpan(seg, ctx) // this also creates necessary barlines
            for (let staffIdx = 0; staffIdx < ctx.dom().nstaves(); ++staffIdx) {
                const b = seg.element(staffIdx * VOICES) as BarLine | null
                if (b) {
                    b.setBarLineType(BarLineType.START_REPEAT)
                    TLayout.layoutBarLine(b, ctx)
                }
            }
        } else if (seg) {
            measure.remove(seg)
        }

        for (let s = measure.first(); s; s = s.next()) {
            if (s.isEndBarLineType()) {
                continue
            }
            s.createShapes()
        }

        measure.computeTicks() // Must be called *after* Segment::createShapes() because it relies on the
        // Segment::visible() property, which is determined by Segment::createShapes().
    }

    static updateGraceNotes(measure: Measure, ctx: LayoutContext): void {
        // Clean everything
        for (let s = measure.first(); s; s = s.next()) {
            for (let track = 0; track < ctx.dom().ntracks(); ++track) {
                const e = s.preAppendedItem(track)
                if (e && e.isGraceNotesGroup()) {
                    s.clearPreAppended(track)
                    const stavesToReShape = new Set<staff_idx_t>()
                    for (const grace of e as unknown as GraceNotesGroup) {
                        stavesToReShape.add(grace.staffIdx())
                        stavesToReShape.add(grace.vStaffIdx())
                    }
                    for (const staffToReshape of stavesToReShape) {
                        s.createShape(staffToReshape)
                    }
                }
            }
        }

        // Append all
        for (let s = measure.first(); s; s = s.next()) {
            if (!s.isChordRestType()) {
                continue
            }
            for (const el of s.elist()) {
                if (el && el.isChord() && (el as Chord).graceNotes().length) {
                    ChordLayout.appendGraceNotes(el as Chord)
                }
            }
        }

        // Layout grace note groups
        for (let s = measure.first(); s; s = s.next()) {
            for (let track = 0; track < ctx.dom().ntracks(); ++track) {
                const e = s.preAppendedItem(track)
                if (e && e.isGraceNotesGroup()) {
                    const gng = e as unknown as GraceNotesGroup
                    TLayout.layoutGraceNotesGroup(gng, ctx)
                    gng.addToShape()
                }
            }
        }
    }

    static getNextMeasure(ctx: LayoutContext): void {
        MeasureLayout.moveToNextMeasure(ctx)
        MeasureLayout.layoutMeasure(ctx.mutState().curMeasure(), ctx)
    }

    static adjustMeasureNo(m: MeasureBase, measureNo: number): number {
        measureNo += m.noOffset()
        m.setNo(measureNo)
        if (!m.irregular()) { // don’t count measure
            ++measureNo
        }
        const layoutBreak = m.sectionBreakElement()
        if (layoutBreak && layoutBreak.startWithMeasureOne()) {
            measureNo = 0
        }
        return measureNo
    }

    /****************************************************************
     * computePreSpacingItems
     * Computes information that is needed before horizontal spacing.
     * Caution: assumes that the system is known! (which is why we
     * cannot compute this stuff in LayoutMeasure::getNextMeasure().)
     * **************************************************************/
    static computePreSpacingItems(m: Measure, ctx: LayoutContext): void {
        // Compute chord properties
        let isFirstChordInMeasure = true
        ChordLayout.clearLineAttachPoints(m)
        for (let seg = m.first(); seg; seg = seg.next()) {
            if (!seg.isChordRestType()) {
                continue
            }
            for (const e of seg.elist()) {
                if (!e || !e.isChord()) {
                    continue
                }
                const chord = e as Chord
                const staff = chord.staff()
                if (staff && !staff.show()) {
                    continue
                }

                ChordLayout.updateLineAttachPoints(chord, isFirstChordInMeasure, ctx)
                for (const gn of chord.graceNotes()) {
                    ChordLayout.updateLineAttachPoints(gn, false, ctx)
                }

                if (chord.arpeggio()) {
                    ArpeggioLayout.clearAccidentals(chord.arpeggio() as Arpeggio, ctx)
                }

                ChordLayout.layoutArticulations(chord, ctx)
                ChordLayout.checkStartEndSlurs(chord, ctx)
                ChordLayout.layoutArticulations2(chord, ctx)

                chord.computeKerningExceptions()
            }
            for (const annotation of seg.annotations()) {
                if (annotation.isFermata()) {
                    TLayout.layoutItem(annotation, ctx)
                }
            }
            seg.createShapes()
            isFirstChordInMeasure = false
        }
    }

    static layoutStaffLines(m: Measure, ctx: LayoutContext): void {
        let staffIdx = 0
        for (const ms of m.mstaves()) {
            if (m.isCutawayClef(staffIdx) && (ctx.dom().staff(staffIdx)!.cutaway() || !m.visible(staffIdx))) {
                // draw short staff lines for a courtesy clef on a hidden measure
                const clefSeg = m.findSegmentR(SegmentType.Clef, m.ticks())
                const staffMag = ctx.dom().staff(staffIdx)!.staffMag(m.tick())
                const partialWidth = clefSeg
                    ? m.width() - clefSeg.x() + clefSeg.minLeft() + ctx.conf().styleMM(Sid.clefLeftMargin) * staffMag
                    : 0.0
                MeasureLayout.layoutPartialWidth(ms.lines(), ctx, m.width(), partialWidth / (m.spatium() * staffMag), true)
            } else {
                // normal staff lines
                TLayout.layoutStaffLines(ms.lines(), ctx)
            }
            staffIdx += 1
        }
    }

    static layoutMeasureNumber(m: Measure, ctx: LayoutContext): void {
        const placementMode = ctx.conf().styleV(Sid.measureNumberPlacementMode) as MeasureNumberPlacement
        const stringNum = String(m.no() + 1)
        const score = m.score()
        const measureStaves = m.mstaves()
        for (let staffIdx = 0; staffIdx < score.nstaves(); ++staffIdx) {
            if (staffIdx >= measureStaves.length) {
                break
            }
            if (m.showMeasureNumberOnStaff(staffIdx)) {
                let measureNumber = measureStaves[staffIdx].measureNumber() as MeasureNumber | null
                if (!measureNumber) {
                    measureNumber = new MeasureNumber(m)
                    measureNumber.setTrack(staff2track(staffIdx))
                    measureNumber.setGenerated(true)
                    measureNumber.setParent(m)
                    m.add(measureNumber)
                }
                measureNumber.setXmlText(stringNum)
                measureNumber.setSystemFlag(placementMode !== MeasureNumberPlacement.ON_ALL_STAVES)
                TLayout.layoutMeasureNumber(measureNumber, ctx)
            }
        }
    }

    static getMeasureStartEndPos(measure: Measure, firstCrSeg: Segment, staffIdx: staff_idx_t, needsHeaderException: boolean,
                                 modernMMRest: boolean, ctx: LayoutContext): MeasureStartEndPos {
        let s1: Segment | null
        for (s1 = firstCrSeg.prevActive(); s1 && s1.allElementsInvisible(); s1 = s1.prevActive()) {
            // nothing
        }
        let s2: Segment | null
        for (s2 = firstCrSeg.nextActive(); s2; s2 = s2.nextActive()) {
            if (modernMMRest && !s2.isChordRestType() && s2.element(staffIdx * VOICES)) {
                break
            }
            if (!modernMMRest
                && (s2.isClefRepeatAnnounceType() || (s2.isTimeSigRepeatAnnounceType() && !s2.hasTimeSigAboveStaves())
                    || s2.isKeySigRepeatAnnounceType() || s2.isEndBarLineType()) && s2.element(staffIdx * VOICES)) {
                break
            }
        }
        let x1 = 0.0
        while (s1) {
            if (!s1.hasTimeSigAboveStaves() && !s1.allElementsInvisible()) {
                x1 = Math.max(x1, s1.x() + s1.minRight())
                if (s1.isCourtesySegment()) {
                    break
                }
            }
            s1 = s1.prevActive()
        }
        let x2 = s2 ? s2.x() - s2.minLeft() : measure.width()
        const headerException = measure.header() && !!firstCrSeg.prev() && !firstCrSeg.prev()!.isStartRepeatBarLineType()
                                && needsHeaderException
        if (headerException) { //needs this exception on header bar
            x1 = firstCrSeg.x() - ctx.conf().styleMM(Sid.barNoteDistance)
        }
        x2 = s2 ? x2 : measure.width()
        return { x1, x2 }
    }

    // ---------------------------------------------------------
    //   layoutMeasureElements
    // ---------------------------------------------------------

    static layoutMeasureElements(m: Measure, ctx: LayoutContext): void {
        //
        // layout individual elements
        //
        for (let s = m.first(); s; s = s.next()) {
            if (!s.enabled()) {
                continue
            }
            // After the rest of the spacing is calculated we position grace-notes-after.
            ChordLayout.repositionGraceNotesAfter(s, ctx.dom().ntracks())
            for (const e of s.elist()) {
                if (!e) {
                    continue
                }
                const staffIdx = e.staffIdx()
                const modernMMRest = e.isMMRest() && !(e as MMRest).isOldStyle()
                if ((e.isRest() && (e as Rest).isFullMeasureRest()) || e.isMMRest() || e.isMeasureRepeat()) {
                    //
                    // element has to be centered in free space
                    //    x1 - left measure position of free space
                    //    x2 - right measure position of free space
                    const measureStartEnd = MeasureLayout.getMeasureStartEndPos(m, s, staffIdx, e.isMMRest(), modernMMRest, ctx)
                    const x1 = measureStartEnd.x1
                    const x2 = measureStartEnd.x2

                    if (e.isMMRest()) {
                        const mmrest = e as MMRest
                        // center multimeasure rest
                        const d = ctx.conf().styleMM(Sid.multiMeasureRestMargin)
                        const w = x2 - x1 - 2 * d
                        const mmrestLD = mmrest.mutldata()
                        mmrestLD.restWidth = w
                        TLayout.layoutMMRest(mmrest, ctx)
                        mmrestLD.setPosX(x1 - s.x() + d)
                    } else if (e.isMeasureRepeat()) {
                        // TODO(port): MeasureRepeat
                    } else {
                        // full measure rest or one-measure repeat
                        TLayout.layoutItem(e, ctx)
                        const sh = e.ldata().shape()
                        let shEL = sh.find_first(ElementType.REST)
                        if (!shEL) {
                            shEL = sh.get_first()
                        }
                        if (shEL) {
                            e.mutldata().setPosX((x2 - x1 - shEL.width()) * 0.5 + x1 - s.x() - shEL.x())
                        }
                    }
                    s.createShape(staffIdx) // DEBUG
                } else if (e.isRest()) {
                    e.mutldata().setPosX(0)
                } else if (e.isChord()) {
                    const c = e as Chord
                    if (c.tremoloSingleChord()) {
                        TremoloLayout.layoutSingleChord(c.tremoloSingleChord()!, ctx)
                    }

                    const tr = c.tremoloTwoChord()
                    if (tr) {
                        const c1 = tr.chord1()
                        const c2 = tr.chord2()
                        if (c1 && !c1.staffMove() && c2 && !c2.staffMove()) {
                            TremoloLayout.layoutTwoChord(tr, ctx)
                        }
                    }

                    for (const g of c.graceNotes()) {
                        if (g.tremoloSingleChord()) {
                            TremoloLayout.layoutSingleChord(g.tremoloSingleChord()!, ctx)
                        }

                        const gtr = g.tremoloTwoChord()
                        if (gtr) {
                            const gc1 = gtr.chord1()
                            const gc2 = gtr.chord2()
                            if (gc1 && !gc1.staffMove() && gc2 && !gc2.staffMove()) {
                                TremoloLayout.layoutTwoChord(gtr, ctx)
                            }
                        }
                    }
                } else if (e.isBarLine()) {
                    e.mutldata().setPosY(0.0)
                    // for end barlines, x position was set in createEndBarLines
                    if (s.segmentType() !== SegmentType.EndBarLine) {
                        e.mutldata().setPosX(0.0)
                    }
                }
            }
        }
    }

    static barLinesSetSpan(seg: Segment, ctx: LayoutContext): void {
        let track = 0
        for (const staff of ctx.dom().staves()) {
            let bl = seg.element(track) as BarLine | null // get existing bar line for this staff, if any
            if (bl) {
                if (bl.generated()) {
                    bl.setSpanStaff(staff.barLineSpan())
                    bl.setSpanFrom(staff.barLineFrom())
                    bl.setSpanTo(staff.barLineTo())
                }
            } else {
                bl = Factory.createItem(ElementType.BAR_LINE, seg) as BarLine
                bl.setParent(seg)
                bl.setTrack(track)
                bl.setGenerated(true)
                bl.setSpanStaff(staff.barLineSpan())
                bl.setSpanFrom(staff.barLineFrom())
                bl.setSpanTo(staff.barLineTo())
                TLayout.layoutBarLine(bl, ctx)
                ctx.mutDom().addElement(bl)
            }
            track += VOICES
        }
    }

    // ---------------------------------------------------------
    //   createEndBarLines
    //    actually create or modify barlines
    // ---------------------------------------------------------

    static createEndBarLines(m: Measure, isLastMeasureInSystem: boolean, ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()
        let barlineSeg = m.findSegmentR(SegmentType.EndBarLine, m.ticks())
        const nextMeasure = m.nextMeasure()

        let barlineWidth = 0.0
        let sectionBreakHideCourtesy = false
        const sectionBreakElement = m.sectionBreakElement()
        if (sectionBreakElement) {
            sectionBreakHideCourtesy = !sectionBreakElement.showCourtesy()
        }

        m.setHasCourtesyKeySig(false)

        let hasKeySig = false
        let hasTimeSig = false
        let hasCourtesyTimeSig = false
        if (nextMeasure && !sectionBreakHideCourtesy) {
            // Check key sigs
            const showCourtesyKeySig = (isLastMeasureInSystem && ctx.conf().styleB(Sid.genCourtesyKeysig))
                                       || (m.repeatJump() && ctx.conf().styleB(Sid.showCourtesiesOtherJumps))
            const tick = m.endTick()
            for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                const staff = ctx.dom().staff(staffIdx)!
                const key1 = staff.keySigEvent(tick.minus(Fraction.eps()))
                const key2 = staff.keySigEvent(tick)
                if (key1.equals(key2)) {
                    continue
                }
                const keySigSeg = nextMeasure.findSegment(SegmentType.KeySig, tick)
                if (keySigSeg) {
                    hasKeySig = true
                    const keySig = keySigSeg.element(staffIdx * VOICES) as KeySig | null
                    if (keySig && !keySig.showCourtesy()) {
                        continue
                    }
                }
                if (showCourtesyKeySig) {
                    m.setHasCourtesyKeySig(true)
                }
                break
            }

            // Check time sigs
            const showCourtesyTimeSig = (isLastMeasureInSystem && ctx.conf().styleB(Sid.genCourtesyTimesig))
                                        || (m.repeatJump() && ctx.conf().styleB(Sid.showCourtesiesOtherJumps))
            const timeSigSeg = nextMeasure.findSegmentR(SegmentType.TimeSig, new Fraction(0, 1))
            if (timeSigSeg) {
                for (let track = 0; track < nstaves * VOICES; track += VOICES) {
                    const timeSig = timeSigSeg.element(track) as TimeSig | null
                    if (!timeSig) {
                        continue
                    }
                    hasTimeSig = true
                    if (timeSig.showCourtesySig() && showCourtesyTimeSig) {
                        hasCourtesyTimeSig = true
                    }
                    break
                }
            }
        }

        const nextMeasRepeat = !!nextMeasure && nextMeasure.repeatStart() && !m.repeatEnd() && !isLastMeasureInSystem
                               && m.next() === nextMeasure
        const barlineBeforeRepeatSigs = ctx.conf().styleB(Sid.barlineBeforeSigChange) && (hasTimeSig || hasKeySig)

        // If we have a repeat start in the next measure, we don't need a barline here (unless there's a sig change)
        if (nextMeasRepeat && !barlineBeforeRepeatSigs) {
            if (!barlineSeg) {
                return
            }
            barlineSeg.setEnabled(false)
        } else {
            let blType = nextMeasure ? BarLineType.NORMAL : BarLineType.END
            if (!barlineSeg) {
                barlineSeg = m.getSegmentR(SegmentType.EndBarLine, m.ticks())
            }
            barlineSeg.setEnabled(true)

            const isRepeatSigBarline = ctx.conf().styleB(Sid.barlineBeforeSigChange) && nextMeasRepeat
            // Key sig barline
            const keySigBarlineMode = ctx.conf().styleI(Sid.keySigCourtesyBarlineMode)
            const beforeKSCourtesy = keySigBarlineMode === CourtesyBarlineMode.DOUBLE_BEFORE_COURTESY && m.hasCourtesyKeySig()
            const alwaysDoubleKS = keySigBarlineMode === CourtesyBarlineMode.ALWAYS_DOUBLE && hasKeySig
            const beforeRepeatKS = isRepeatSigBarline && hasKeySig && ctx.conf().styleB(Sid.doubleBarlineBeforeKeySig)
            if (beforeKSCourtesy || alwaysDoubleKS || beforeRepeatKS) {
                blType = BarLineType.DOUBLE
            }
            // Time sig barline
            const timeSigBarlineMode = ctx.conf().styleI(Sid.timeSigCourtesyBarlineMode)
            const beforeTSCourtesy = timeSigBarlineMode === CourtesyBarlineMode.DOUBLE_BEFORE_COURTESY && hasCourtesyTimeSig
            const alwaysDoubleTS = timeSigBarlineMode === CourtesyBarlineMode.ALWAYS_DOUBLE && hasTimeSig
            const beforeRepeatTS = isRepeatSigBarline && hasTimeSig && ctx.conf().styleB(Sid.doubleBarlineBeforeTimeSig)
            if (beforeTSCourtesy || alwaysDoubleTS || beforeRepeatTS) {
                blType = BarLineType.DOUBLE
            }

            // if next measure has a repeat start, the barline is an end repeat barline
            let force = false
            if (m.repeatEnd()) {
                blType = BarLineType.END_REPEAT
                force = true
            }
            for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                const track = staffIdx * VOICES
                let barLine = barlineSeg.element(track) as BarLine | null
                const staff = ctx.dom().staff(staffIdx)!
                if (!barLine) {
                    barLine = Factory.createItem(ElementType.BAR_LINE, barlineSeg) as BarLine
                    barLine.setParent(barlineSeg)
                    barLine.setTrack(track)
                    barLine.setGenerated(true)
                    barLine.setSpanStaff(staff.barLineSpan())
                    barLine.setSpanFrom(staff.barLineFrom())
                    barLine.setSpanTo(staff.barLineTo())
                    barLine.setBarLineType(blType)
                    ctx.mutDom().addElement(barLine)
                } else {
                    // do not change bar line type if bar line is user modified
                    // and its not a repeat start/end barline (forced)
                    if (barLine.generated()) {
                        barLine.setSpanStaff(staff.barLineSpan())
                        barLine.setSpanFrom(staff.barLineFrom())
                        barLine.setSpanTo(staff.barLineTo())
                        barLine.setBarLineType(blType)
                    } else if (barLine.barLineType() !== blType && force) {
                        barLine.setBarLineType(blType)
                        barLine.setGenerated(true)
                    }
                }
                TLayout.layoutBarLine(barLine, ctx)
                barlineWidth = Math.max(barlineWidth, barLine.width())
            }
            // right align within segment
            for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                const track = staffIdx * VOICES
                const barLine = barlineSeg.element(track) as BarLine | null
                if (!barLine) {
                    continue
                }
                barLine.mutldata().moveX(barlineWidth - barLine.width())
            }
            barlineSeg.createShapes()
        }

        // fix courtesy key signatures and clefs
        MeasureLayout.setClefSegVisibility(m, isLastMeasureInSystem, ctx)
    }

    static setClefSegVisibility(m: Measure, isLastMeasureInSystem: boolean, ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()
        let sectionBreakHideCourtesy = false
        const sectionBreakElement = m.sectionBreakElement()
        if (sectionBreakElement) {
            sectionBreakHideCourtesy = !sectionBreakElement.showCourtesy()
        }
        const nextMeasure = m.nextMeasure()
        let clefSeg = m.findSegmentR(SegmentType.Clef, m.ticks())
        if (!clefSeg && nextMeasure) {
            clefSeg = nextMeasure.findSegmentR(SegmentType.Clef, new Fraction(0, 1))
        }
        if (!clefSeg) {
            return
        }
        let visibleClef = false
        let clefFound = false
        for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
            if (!ctx.dom().staff(staffIdx)!.show()) {
                continue
            }
            const track = staffIdx * VOICES
            const clef = clefSeg.element(track) as Clef | null
            if (!clef) {
                continue
            }
            clefFound = true
            const showCourtesy = ctx.conf().styleB(Sid.genCourtesyClef) && clef.showCourtesy() // normally show a courtesy clef
            // check if the measure is the last measure of the system or the last measure before a frame
            const lastMeasure = isLastMeasureInSystem || (nextMeasure ? !(m.next() === nextMeasure) : true)
            if (!nextMeasure || sectionBreakHideCourtesy || (lastMeasure && !showCourtesy)) {
                // hide the courtesy clef in the final measure of a section, or if the measure is the final measure of a system
                // and the score style or the clef style is set to "not show courtesy clef",
                // or if the clef is at the end of the very last measure of the score
                clef.clear()
                clefSeg.createShape(staffIdx)
            } else {
                TLayout.layoutClef(clef, ctx)
                clefSeg.createShape(staffIdx)
                visibleClef = true
            }
        }
        if (visibleClef) { // there is at least one visible clef in the clef segment
            clefSeg.setVisible(true)
        } else { // all (courtesy) clefs in the clef segment are not visible
            clefSeg.setVisible(false)
            if (!clefFound) {
                return
            }
        }
    }

    static setCourtesyTimeSig(m: Measure, refSigTick: Fraction, courtesySigTick: Fraction, courtesySegType: SegmentType,
                              ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()
        const courtesySigRTick = courtesySigTick.minus(m.tick())
        const prevMeasure = m.prevMeasureMM()
        const isTrailer = courtesySegType === SegmentType.TimeSigAnnounce
        const isContinuationCourtesy = courtesySegType === SegmentType.TimeSigStartRepeatAnnounce
        const prevCourtesySegment = prevMeasure ? prevMeasure.findSegmentR(SegmentType.TimeSigRepeatAnnounce, prevMeasure.ticks()) : null
        const checkPrevMeasure = isContinuationCourtesy && !!prevMeasure
                                 && ((prevMeasure.repeatEnd() && ctx.conf().styleB(Sid.changesBeforeBarlineRepeats))
                                     || (prevMeasure.repeatJump() && ctx.conf().styleB(Sid.changesBeforeBarlineOtherJumps)))

        let tsSegAtCourtesyTick = m.findSegmentR(SegmentType.TimeSig, courtesySigRTick)
        tsSegAtCourtesyTick = !tsSegAtCourtesyTick && checkPrevMeasure
            ? prevMeasure!.findSegmentR(SegmentType.TimeSig, courtesySigTick.minus(prevMeasure!.tick())) : tsSegAtCourtesyTick

        const shouldShowContCourtesy = !!prevMeasure && prevMeasure.hasCourtesyTimeSig()

        let courtesySigSeg = m.findSegmentR(courtesySegType, courtesySigRTick)

        for (let track = 0; track < nstaves * VOICES; track += VOICES) {
            const staff = ctx.dom().staff(track2staff(track))!
            const actualTimeSig = staff.timeSig(refSigTick)
            const curTimeSig = staff.timeSig(courtesySigTick.minus(Fraction.eps()))
            if (!actualTimeSig || !curTimeSig) {
                continue
            }
            const sigsDifferent = !actualTimeSig.sig().eq(curTimeSig.sig())
            const needsCourtesy = isContinuationCourtesy
                ? shouldShowContCourtesy && !!prevCourtesySegment && !!prevCourtesySegment.element(track)
                : (isTrailer ? actualTimeSig.tick().eq(m.endTick()) : sigsDifferent)
            const hasSigAtTick = !!tsSegAtCourtesyTick && tsSegAtCourtesyTick.enabled() && !!tsSegAtCourtesyTick.element(track)
            const actualShowCourtesy = actualTimeSig.showCourtesySig()
            const show = actualShowCourtesy && needsCourtesy && !hasSigAtTick && ctx.conf().styleB(Sid.genCourtesyTimesig)

            if (!courtesySigSeg) {
                if (!show) {
                    continue
                }
                // no courtesy timesig segment yet; create it
                courtesySigSeg = segmentCreate(m, courtesySegType, courtesySigRTick)
                m.add(courtesySigSeg)
                m.setTrailer(m.trailer() || isTrailer)
            }
            if (!isContinuationCourtesy) {
                m.setHasCourtesyTimeSig(true)
            }
            courtesySigSeg.setTrailer(isTrailer)
            courtesySigSeg.setEnabled(true)

            let courtesyTimeSig: TimeSig | null = null
            const timeSigElem = courtesySigSeg.element(track)
            if (timeSigElem && timeSigElem.isTimeSig()) {
                courtesyTimeSig = timeSigElem as TimeSig
            }
            if (!show) {
                if (courtesyTimeSig) {
                    courtesySigSeg.remove(courtesyTimeSig)
                }
                continue
            }
            if (!courtesyTimeSig) {
                courtesyTimeSig = Factory.createItem(ElementType.TIMESIG, courtesySigSeg) as TimeSig
                courtesyTimeSig.setTrack(track)
                courtesyTimeSig.setGenerated(true)
                courtesyTimeSig.setParent(courtesySigSeg)
                courtesyTimeSig.setIsCourtesy(true)
                courtesySigSeg.add(courtesyTimeSig)
            }
            courtesyTimeSig.setFrom(actualTimeSig)
            if (courtesyTimeSig.isStyled(Pid.SCALE)) {
                courtesyTimeSig.setScale(courtesyTimeSig.propertyDefault(Pid.SCALE) as ScaleF)
            }
            TLayout.layoutTimeSig(courtesyTimeSig, ctx)
        }

        if (courtesySigSeg && ((!isContinuationCourtesy && !m.hasCourtesyTimeSig()) || !ctx.conf().styleB(Sid.genCourtesyTimesig))) {
            if (!isContinuationCourtesy) {
                m.setHasCourtesyTimeSig(false)
            }
            courtesySigSeg.setEnabled(false)
        }
        if (courtesySigSeg && courtesySigSeg.enabled()) {
            if (courtesySigSeg.hasElements()) {
                courtesySigSeg.createShapes()
            } else {
                courtesySigSeg.setEnabled(false)
                if (!isContinuationCourtesy) {
                    m.setHasCourtesyTimeSig(false)
                }
            }
        }
    }

    static setCourtesyKeySig(m: Measure, refSigTick: Fraction, courtesySigTick: Fraction, courtesySegType: SegmentType,
                             ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()
        const courtesySigRTick = courtesySigTick.minus(m.tick())
        const prevMeasure = m.prevMeasureMM()
        const isTrailer = courtesySegType === SegmentType.KeySigAnnounce
        const isContinuationCourtesy = courtesySegType === SegmentType.KeySigStartRepeatAnnounce
        const prevCourtesySegment = prevMeasure ? prevMeasure.findSegmentR(SegmentType.KeySigRepeatAnnounce, prevMeasure.ticks()) : null
        const checkPrevMeasure = isContinuationCourtesy && !!prevMeasure
                                 && ((prevMeasure.repeatEnd() && ctx.conf().styleB(Sid.changesBeforeBarlineRepeats))
                                     || (prevMeasure.repeatJump() && ctx.conf().styleB(Sid.changesBeforeBarlineOtherJumps)))
        let ksSegAtCourtesyTick = m.findSegmentR(SegmentType.KeySig, courtesySigRTick)
        ksSegAtCourtesyTick = !ksSegAtCourtesyTick && checkPrevMeasure
            ? prevMeasure!.findSegmentR(SegmentType.KeySig, courtesySigTick.minus(prevMeasure!.tick())) : ksSegAtCourtesyTick

        const shouldShowContCourtesy = !!prevMeasure && prevMeasure.hasCourtesyKeySig()

        let courtesySigSeg = m.findSegmentR(courtesySegType, courtesySigRTick)

        for (let track = 0; track < nstaves * VOICES; track += VOICES) {
            const staff = ctx.dom().staff(track2staff(track))!
            const refSigElementTick = staff.currentKeyTick(refSigTick)
            const refMeasure = ctx.dom().tick2measureMM(refSigElementTick)
            const actualKeySigSeg = refMeasure ? refMeasure.findSegmentR(SegmentType.KeySig, refSigElementTick.minus(refMeasure.tick())) : null
            const el = actualKeySigSeg ? actualKeySigSeg.element(track) : null
            const actualKeySig = el ? el as KeySig : null
            const refKey = staff.keySigEvent(refSigTick)
            const sigsDifferent = staff.key(m.endTick().minus(Fraction.eps())) !== refKey.key()
            const needsCourtesy = isContinuationCourtesy
                ? shouldShowContCourtesy && !!prevCourtesySegment && !!prevCourtesySegment.element(track) : sigsDifferent
            const staffIsPitchedAtNextMeas = ctx.dom().lastMeasureMM() === m
                                             || (!!m.nextMeasureMM() && staff.isPitchedStaff(m.nextMeasureMM()!.tick()))
            const hasSigAtTick = !!ksSegAtCourtesyTick && ksSegAtCourtesyTick.enabled() && !!ksSegAtCourtesyTick.element(track)
            const actualShowCourtesy = actualKeySig ? actualKeySig.showCourtesy() : true
            const show = actualShowCourtesy && staffIsPitchedAtNextMeas && needsCourtesy && !hasSigAtTick
                         && ctx.conf().styleB(Sid.genCourtesyKeysig)

            if (!courtesySigSeg) {
                if (!show) {
                    continue
                }
                // no courtesy keysig segment yet; create it
                courtesySigSeg = segmentCreate(m, courtesySegType, courtesySigRTick)
                m.add(courtesySigSeg)
                m.setTrailer(m.trailer() || isTrailer)
            }
            if (!isContinuationCourtesy) {
                m.setHasCourtesyKeySig(true)
            }
            courtesySigSeg.setTrailer(isTrailer)
            courtesySigSeg.setEnabled(true)

            let courtesyKeySig: KeySig | null = null
            const keySigElem = courtesySigSeg.element(track)
            if (keySigElem && keySigElem.isKeySig()) {
                courtesyKeySig = keySigElem as KeySig
            }
            if (!show) {
                if (courtesyKeySig) {
                    courtesySigSeg.remove(courtesyKeySig)
                }
                continue
            }
            if (!courtesyKeySig) {
                courtesyKeySig = Factory.createItem(ElementType.KEYSIG, courtesySigSeg) as KeySig
                courtesyKeySig.setTrack(track)
                courtesyKeySig.setGenerated(true)
                courtesyKeySig.setParent(courtesySigSeg)
                courtesyKeySig.setIsCourtesy(true)
                courtesySigSeg.add(courtesyKeySig)
            }
            courtesyKeySig.setKeySigEvent(refKey)
            TLayout.layoutKeySig(courtesyKeySig, ctx)
        }

        if (courtesySigSeg && ((!isContinuationCourtesy && !m.hasCourtesyKeySig()) || !ctx.conf().styleB(Sid.genCourtesyKeysig))) {
            if (!isContinuationCourtesy) {
                m.setHasCourtesyKeySig(false)
            }
            courtesySigSeg.setEnabled(false)
        }
        if (courtesySigSeg && courtesySigSeg.enabled()) {
            if (courtesySigSeg.hasElements()) {
                courtesySigSeg.createShapes()
            } else {
                courtesySigSeg.setEnabled(false)
                if (!isContinuationCourtesy) {
                    m.setHasCourtesyKeySig(false)
                }
            }
        }
    }

    static setCourtesyClef(m: Measure, refClefTick: Fraction, courtesyClefTick: Fraction, courtesySegType: SegmentType,
                           ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()
        const courtesyClefRTick = courtesyClefTick.minus(m.tick())
        const prevMeasure = m.prevMeasureMM()
        const isContinuationCourtesy = courtesySegType === SegmentType.ClefStartRepeatAnnounce
        const prevCourtesySegment = prevMeasure ? prevMeasure.findSegmentR(SegmentType.ClefRepeatAnnounce, prevMeasure.ticks()) : null
        let clefSegAtCourtesyTick = m.findSegmentR(SegmentType.Clef | SegmentType.HeaderClef, courtesyClefRTick)
        clefSegAtCourtesyTick = !clefSegAtCourtesyTick && prevMeasure
            ? prevMeasure.findSegmentR(SegmentType.KeySig, courtesyClefTick.minus(prevMeasure.tick())) : clefSegAtCourtesyTick

        const shouldShowContCourtesy = !!prevMeasure && prevMeasure.hasCourtesyClef()

        let courtesyClefSeg = m.findSegmentR(courtesySegType, courtesyClefRTick)

        for (let track = 0; track < nstaves * VOICES; track += VOICES) {
            const staff = ctx.dom().staff(track2staff(track))!
            const refClefElementTick = staff.currentClefTick(refClefTick)
            const refMeasure = ctx.dom().tick2measureMM(refClefElementTick)
            let actualClefSeg = refMeasure
                ? refMeasure.findSegmentR(SegmentType.Clef | SegmentType.HeaderClef, refClefElementTick.minus(refMeasure.tick())) : null
            if (!actualClefSeg && refMeasure && refMeasure.prevMeasureMM()) {
                const refPrevMeasure = refMeasure.prevMeasureMM()!
                actualClefSeg = refPrevMeasure.findSegmentR(SegmentType.Clef | SegmentType.HeaderClef,
                    refClefElementTick.minus(refPrevMeasure.tick()))
            }
            const el = actualClefSeg ? actualClefSeg.element(track) : null
            const actualClef = el ? el as Clef : null
            const refClef = staff.clef(refClefTick)
            const clefsDifferent = staff.clef(m.endTick().minus(Fraction.eps())) !== refClef
            const needsCourtesy = isContinuationCourtesy
                ? shouldShowContCourtesy && !!prevCourtesySegment && !!prevCourtesySegment.element(track) : clefsDifferent
            const hasClefAtTick = !!clefSegAtCourtesyTick && clefSegAtCourtesyTick.enabled() && !!clefSegAtCourtesyTick.element(track)
            const actualShowCourtesy = !!actualClef && actualClef.showCourtesy()
            const show = actualShowCourtesy && needsCourtesy && !hasClefAtTick && ctx.conf().styleB(Sid.genCourtesyClef)

            if (!courtesyClefSeg) {
                if (!show) {
                    continue
                }
                // no courtesy clef segment yet; create it
                courtesyClefSeg = segmentCreate(m, courtesySegType, courtesyClefRTick)
                m.add(courtesyClefSeg)
                courtesyClefSeg.setTrailer(false)
            }
            if (!isContinuationCourtesy) {
                m.setHasCourtesyClef(true)
            }
            courtesyClefSeg.setEnabled(true)

            let courtesyClef: Clef | null = null
            const clefElem = courtesyClefSeg.element(track)
            if (clefElem && clefElem.isClef()) {
                courtesyClef = clefElem as Clef
            }
            if (!show) {
                if (courtesyClef) {
                    courtesyClefSeg.remove(courtesyClef)
                }
                continue
            }
            if (!courtesyClef) {
                courtesyClef = Factory.createItem(ElementType.CLEF, courtesyClefSeg) as Clef
                courtesyClef.setTrack(track)
                courtesyClef.setGenerated(true)
                courtesyClef.setSmall(true)
                courtesyClef.setParent(courtesyClefSeg)
                courtesyClef.setClefType(actualClef!.clefType())
                courtesyClef.setIsCourtesy(true)
                courtesyClefSeg.add(courtesyClef)
            }
            TLayout.layoutClef(courtesyClef, ctx)
        }

        if (courtesyClefSeg && (!ctx.conf().styleB(Sid.genCourtesyClef) || (!isContinuationCourtesy && !m.hasCourtesyClef()))) {
            if (!isContinuationCourtesy) {
                m.setHasCourtesyClef(false)
            }
            courtesyClefSeg.setEnabled(false)
        }
        if (courtesyClefSeg && courtesyClefSeg.enabled()) {
            if (courtesyClefSeg.hasElements()) {
                courtesyClefSeg.createShapes()
            } else {
                courtesyClefSeg.setEnabled(false)
                if (isContinuationCourtesy) {
                    m.setHasCourtesyClef(false)
                }
            }
        }
    }

    static setRepeatCourtesiesAndParens(m: Measure, ctx: LayoutContext): void {
        const showCourtesyRepeats = m.repeatEnd() && ctx.conf().styleB(Sid.showCourtesiesRepeats)
        const showCourtesyOtherJumps = m.repeatJump() && ctx.conf().styleB(Sid.showCourtesiesOtherJumps)

        if (showCourtesyRepeats) {
            MeasureLayout.addRepeatCourtesies(m, ctx)
            if (ctx.conf().styleB(Sid.useParensRepeatCourtesies)) {
                MeasureLayout.addRepeatCourtesyParentheses(m, false, ctx)
            } else {
                MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, false, ctx)
            }
        }

        if (showCourtesyOtherJumps) {
            MeasureLayout.addRepeatCourtesies(m, ctx)
            if (ctx.conf().styleB(Sid.useParensOtherJumpCourtesies)) {
                MeasureLayout.addRepeatCourtesyParentheses(m, false, ctx)
            } else {
                MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, false, ctx)
            }
        }

        if (!showCourtesyRepeats && !showCourtesyOtherJumps) {
            MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, false, ctx)
            MeasureLayout.removeRepeatCourtesies(m)
        }

        const prev = m.prevMeasure()
        const courtesiesAfterCancellingRepeats = !!prev && prev.repeatEnd()
                                                 && ctx.conf().styleB(Sid.showCourtesiesAfterCancellingRepeats)
                                                 && ctx.conf().styleB(Sid.showCourtesiesRepeats)
        const courtesiesAfterCancellingOtherJumps = !!prev && prev.repeatJump()
                                                    && ctx.conf().styleB(Sid.showCourtesiesAfterCancellingOtherJumps)
                                                    && ctx.conf().styleB(Sid.showCourtesiesOtherJumps)
        if (courtesiesAfterCancellingRepeats) {
            MeasureLayout.addRepeatContinuationCourtesies(m, ctx)
            if (ctx.conf().styleB(Sid.useParensRepeatCourtesiesAfterCancelling)) {
                MeasureLayout.addRepeatCourtesyParentheses(m, true, ctx)
            } else {
                MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, true, ctx)
            }
        }

        if (courtesiesAfterCancellingOtherJumps) {
            MeasureLayout.addRepeatContinuationCourtesies(m, ctx)
            if (ctx.conf().styleB(Sid.useParensOtherJumpCourtesiesAfterCancelling)) {
                MeasureLayout.addRepeatCourtesyParentheses(m, true, ctx)
            } else {
                MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, true, ctx)
            }
        }

        if (!courtesiesAfterCancellingRepeats && !courtesiesAfterCancellingOtherJumps) {
            MeasureLayout.removeRepeatCourtesyParenthesesMeasure(m, true, ctx)
            MeasureLayout.removeRepeatContinuationCourtesies(m)
        }
    }

    private static calcParenTopBottom(item: Parenthesis, tb: { top: number, bottom: number }, ctx: LayoutContext): void {
        const parent = item.parentItem()
        const spatium = item.spatium()
        if (!parent) {
            return
        }

        if (!parent.ldata().isValid()) {
            TLayout.layoutItem(parent, ctx)
        }

        const bbox = parent.ldata().bbox()

        tb.top = Math.min(tb.top, bbox.top() + parent.pos().y() + spatium / 4)
        tb.bottom = Math.max(tb.bottom, bbox.bottom() + parent.pos().y() - spatium / 4)
    }

    static addRepeatCourtesyParentheses(m: Measure, continuation: boolean, ctx: LayoutContext): void {
        const tsSegType = continuation ? SegmentType.TimeSigStartRepeatAnnounce : SegmentType.TimeSigRepeatAnnounce
        const ksSegType = continuation ? SegmentType.KeySigStartRepeatAnnounce : SegmentType.KeySigRepeatAnnounce
        const clefSegType = continuation ? SegmentType.ClefStartRepeatAnnounce : SegmentType.ClefRepeatAnnounce

        const sigTick = continuation ? new Fraction(0, 1) : m.ticks()

        const elShouldHaveParenthesis = (seg: Segment | null, track: track_idx_t): boolean => {
            if (!seg || !seg.enabled() || track > ctx.dom().ntracks()) {
                return false
            }

            const staff = ctx.dom().staff(track2staff(track))
            if (!staff) {
                return false
            }
            const st = staff.staffType(seg.tick())
            const noTimesig = !!st && seg.isSegType(SegmentType.TimeSigType) && !st.genTimesig()
            const noKeysig = !!st && seg.isSegType(SegmentType.KeySigType) && !st.genKeysig()
            const noClef = !!st && seg.isSegType(SegmentType.ClefType) && !st.genClef()
            if (noTimesig || noKeysig || noClef) {
                return false
            }

            const el = seg.element(track)
            return !!el && el.visible()
        }

        const timeSigShouldHaveOwnParentheses = (seg: Segment | null, track: track_idx_t): boolean => {
            if (!elShouldHaveParenthesis(seg, track)) {
                return false
            }

            const el = seg ? seg.element(track) : null
            if (!el || !el.isTimeSig()) {
                return false
            }

            return (ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) !== TimeSigPlacement.NORMAL
        }

        const createParenthesesForSegments = (leftSeg: Segment | null, rightSeg: Segment | null, track: track_idx_t): void => {
            const tb = { top: Number.MAX_VALUE, bottom: -Number.MAX_VALUE }
            const leftItem = leftSeg ? leftSeg.element(track) : null
            const rightItem = rightSeg ? rightSeg.element(track) : null
            let leftParen: Parenthesis | null = null
            if (leftItem) {
                leftItem.setParenthesesMode(leftItem.rightParen() ? ParenthesesMode.BOTH : ParenthesesMode.LEFT, true, true)
                leftParen = leftItem.leftParen() as Parenthesis | null
            }
            let rightParen: Parenthesis | null = null
            if (rightItem) {
                rightItem.setParenthesesMode(rightItem.leftParen() ? ParenthesesMode.BOTH : ParenthesesMode.RIGHT, true, true)
                rightParen = rightItem.rightParen() as Parenthesis | null
            }
            const needsBigTimeSigAdjust = !!leftSeg && !!rightSeg && leftSeg === rightSeg && leftSeg.isSegType(SegmentType.TimeSigType)
                                          && (ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) !== TimeSigPlacement.NORMAL
            if ((ctx.conf().styleB(Sid.smallParens) || needsBigTimeSigAdjust) && leftParen && rightParen) {
                const spatium = leftParen.spatium()
                MeasureLayout.calcParenTopBottom(leftParen, tb, ctx)
                MeasureLayout.calcParenTopBottom(rightParen, tb, ctx)

                let top = tb.top
                let height = tb.bottom - tb.top

                if (!ctx.conf().styleB(Sid.smallParens)) {
                    top -= 1.25 * spatium
                    height += 2.5 * spatium
                }

                const rl = rightParen.mutldata()
                rl.startY = top
                rl.height = height
                rl.midPointThickness = height / 60 * rl.mag() // 0.1sp for a height of 6sp
                const ll = leftParen.mutldata()
                ll.startY = top
                ll.height = height
                ll.midPointThickness = height / 60 * ll.mag() // 0.1sp for a height of 6sp

                const mag = Math.max(ll.mag(), rl.mag())
                ll.setMag(mag)
                rl.setMag(mag)
            } else if (leftParen || rightParen) {
                const staff = (leftParen ? leftParen.staff() : rightParen!.staff())!
                const spatium = leftParen ? leftParen.spatium() : rightParen!.spatium()
                const tick = leftParen ? leftParen.tick() : rightParen!.tick()
                if (leftParen) {
                    const ll = leftParen.mutldata()
                    ll.startY = -spatium
                    ll.height = staff.staffHeight(tick) + 2 * spatium * leftParen.mag()
                    ll.midPointThickness = ll.height / 60 * ll.mag() // 0.1sp for a height of 6sp
                }
                if (rightParen) {
                    const rl = rightParen.mutldata()
                    rl.startY = -spatium
                    rl.height = staff.staffHeight(tick) + 2 * spatium * rightParen.mag()
                    rl.midPointThickness = rl.height / 60 * rl.mag() // 0.1sp for a height of 6sp
                }
            }

            if (leftParen) {
                ParenthesisLayout.layoutParentheses(leftItem!, ctx)
            }

            if (rightParen && rightItem !== leftItem) {
                ParenthesisLayout.layoutParentheses(rightItem!, ctx)
            }
        }

        for (let track = 0; track <= ctx.dom().nstaves() * VOICES; track += VOICES) {
            const clefSeg = m.findSegmentR(clefSegType, sigTick)
            const ksSeg = m.findSegmentR(ksSegType, sigTick)
            const tsSeg = m.findSegmentR(tsSegType, sigTick)
            const separateTsParens = timeSigShouldHaveOwnParentheses(tsSeg, track)

            let leftMostSeg: Segment | null = clefSeg

            if (!elShouldHaveParenthesis(leftMostSeg, track)) {
                leftMostSeg = ksSeg
            }

            if (!separateTsParens && !elShouldHaveParenthesis(leftMostSeg, track)) {
                leftMostSeg = tsSeg
            }

            if (!elShouldHaveParenthesis(leftMostSeg, track)) {
                leftMostSeg = null
            }

            // Remove stale parentheses
            for (const seg of [clefSeg, ksSeg, tsSeg]) {
                if (seg === leftMostSeg || !seg || (seg === tsSeg && separateTsParens) || !seg.element(track)) {
                    continue
                }
                MeasureLayout.removeRepeatCourtesyParenthesis(seg.element(track), DirectionH.LEFT)
            }

            let rightMostSeg: Segment | null = separateTsParens ? null : tsSeg

            if (!elShouldHaveParenthesis(rightMostSeg, track)) {
                rightMostSeg = ksSeg
            }

            if (!elShouldHaveParenthesis(rightMostSeg, track)) {
                rightMostSeg = clefSeg
            }

            if (!elShouldHaveParenthesis(rightMostSeg, track)) {
                rightMostSeg = null
            }

            // Remove stale parentheses
            for (const seg of [clefSeg, ksSeg, tsSeg]) {
                if (seg === rightMostSeg || !seg || (seg === tsSeg && separateTsParens) || !seg.element(track)) {
                    continue
                }
                MeasureLayout.removeRepeatCourtesyParenthesis(seg.element(track), DirectionH.RIGHT)
            }

            createParenthesesForSegments(leftMostSeg, rightMostSeg, track)

            if (separateTsParens) {
                createParenthesesForSegments(tsSeg, tsSeg, track)
            }
        }
    }

    static removeRepeatCourtesyParenthesesMeasure(m: Measure, continuation: boolean, ctx: LayoutContext): void {
        const tsSegType = continuation ? SegmentType.TimeSigStartRepeatAnnounce : SegmentType.TimeSigRepeatAnnounce
        const ksSegType = continuation ? SegmentType.KeySigStartRepeatAnnounce : SegmentType.KeySigRepeatAnnounce
        const clefSegType = continuation ? SegmentType.ClefStartRepeatAnnounce : SegmentType.ClefRepeatAnnounce

        const sigTick = continuation ? new Fraction(0, 1) : m.ticks()

        const clefSeg = m.findSegmentR(clefSegType, sigTick)
        const ksSeg = m.findSegmentR(ksSegType, sigTick)
        const tsSeg = m.findSegmentR(tsSegType, sigTick)

        for (const seg of [clefSeg, ksSeg, tsSeg]) {
            if (!seg) {
                continue
            }
            for (let track = 0; track <= ctx.dom().nstaves() * VOICES; track += VOICES) {
                const item = seg.element(track)
                if (!item) {
                    continue
                }
                MeasureLayout.removeRepeatCourtesyParenthesis(item)
            }
        }
    }

    static removeRepeatCourtesyParenthesis(item: EngravingItem | null, direction = DirectionH.AUTO): void {
        if (!item) {
            return
        }
        if (direction === DirectionH.AUTO) {
            const leftParen = item.leftParen()
            if (leftParen) {
                item.remove(leftParen)
            }
            const rightParen = item.rightParen()
            if (rightParen) {
                item.remove(rightParen)
            }
            return
        }

        const paren = item.paren(direction === DirectionH.LEFT)
        if (!paren) {
            return
        }

        item.remove(paren)
    }

    static addRepeatCourtesies(m: Measure, ctx: LayoutContext): void {
        const measures = findFollowingRepeatMeasures(m)
        if (!measures.length) {
            MeasureLayout.removeRepeatCourtesies(m)
            return
        }

        let hasCourtesies = false
        for (const repeatStartMeasure of measures) {
            // Follow section break courtesy property
            const prevMeasure = repeatStartMeasure.prevMeasure()
            const sectionBreak = prevMeasure ? prevMeasure.sectionBreakElement() : null
            const sectionBreakHideCourtesies = !!sectionBreak && !sectionBreak.showCourtesy()

            if (repeatStartMeasure === m.nextMeasure() || sectionBreakHideCourtesies) {
                continue
            }
            MeasureLayout.setCourtesyClef(m, repeatStartMeasure.tick(), m.endTick(), SegmentType.ClefRepeatAnnounce, ctx)
            MeasureLayout.setCourtesyKeySig(m, repeatStartMeasure.tick(), m.endTick(), SegmentType.KeySigRepeatAnnounce, ctx)
            MeasureLayout.setCourtesyTimeSig(m, repeatStartMeasure.tick(), m.endTick(), SegmentType.TimeSigRepeatAnnounce, ctx)

            hasCourtesies = true
        }

        if (!hasCourtesies) {
            MeasureLayout.removeRepeatCourtesies(m)
        }
    }

    static removeRepeatCourtesies(m: Measure): void {
        for (let seg = m.last(); seg && seg !== m.first(); seg = seg.prev()) {
            if (seg.isChordRestType()) {
                break
            }
            if (!seg.isSegType(SegmentType.ClefRepeatAnnounce | SegmentType.TimeSigRepeatAnnounce | SegmentType.KeySigRepeatAnnounce)) {
                continue
            }
            seg.mutldata().reset()
            if (seg.enabled()) {
                seg.setEnabled(false)
            }
        }
        m.setHasCourtesyClef(false)
        m.setHasCourtesyKeySig(false)
        m.setHasCourtesyTimeSig(false)
    }

    static addRepeatContinuationCourtesies(m: Measure, ctx: LayoutContext): void {
        MeasureLayout.setCourtesyTimeSig(m, m.tick(), m.tick(), SegmentType.TimeSigStartRepeatAnnounce, ctx)
        MeasureLayout.setCourtesyKeySig(m, m.tick(), m.tick(), SegmentType.KeySigStartRepeatAnnounce, ctx)
        MeasureLayout.setCourtesyClef(m, m.tick(), m.tick(), SegmentType.ClefStartRepeatAnnounce, ctx)
    }

    static removeRepeatContinuationCourtesies(m: Measure): void {
        for (let seg = m.first(); seg && seg !== m.last(); seg = seg.next()) {
            if (seg.isChordRestType()) {
                break
            }
            if (!seg.isSegType(SegmentType.ClefStartRepeatAnnounce | SegmentType.TimeSigStartRepeatAnnounce
                               | SegmentType.KeySigStartRepeatAnnounce)) {
                continue
            }
            seg.mutldata().reset()
            if (seg.enabled()) {
                seg.setEnabled(false)
            }
        }
    }

    static addHeaderClef(m: Measure, isFirstClef: boolean, staff: Staff, ctx: LayoutContext): Segment | null {
        const staffIdx = staff.idx()
        const track = staffIdx * VOICES
        let cSegment = m.findFirstR(SegmentType.HeaderClef, new Fraction(0, 1))
        const staffType = staff.staffType(m.tick())
        const hideClef = staffType.isTabStaff() ? ctx.conf().styleB(Sid.hideTabClefAfterFirst) : !ctx.conf().styleB(Sid.genClef)

        // find the clef type at the previous tick
        let cl = staff.clefType(m.tick().minus(Fraction.eps()))
        let showCourtesy = true
        let s: Segment | null = null
        if (m.prevMeasure()) {
            // look for a clef change at the end of the previous measure
            s = m.prevMeasure()!.findSegment(SegmentType.Clef, m.tick())
        } else if (m.isMMRest()) {
            // look for a header clef at the beginning of the first underlying measure
            s = m.mmRestFirst()!.findFirstR(SegmentType.HeaderClef, new Fraction(0, 1))
        }
        if (s) {
            const c = s.element(track) as Clef | null
            if (c) {
                cl = c.clefTypeList()
                showCourtesy = c.showCourtesy()
            }
        }
        let clef: Clef | null = null
        if (cSegment) {
            clef = cSegment.element(track) as Clef | null
        }
        if (staff.staffTypeForElement(m).genClef() && (isFirstClef || !hideClef)) {
            if (!cSegment) {
                cSegment = segmentCreate(m, SegmentType.HeaderClef, new Fraction(0, 1))
                m.add(cSegment)
            }
            cSegment.setHeader(true)
            if (!clef) {
                //
                // create missing clef
                //
                clef = Factory.createItem(ElementType.CLEF, cSegment) as Clef
                clef.setTrack(track)
                clef.setGenerated(true)
                clef.setParent(cSegment)
                clef.setIsHeader(true)
                clef.setShowCourtesy(showCourtesy)
                cSegment.add(clef)
            }
            if (clef.generated()) {
                clef.setClefType(cl)
            }
            clef.setSmall(false)
            clef.mutldata().reset()
            TLayout.layoutClef(clef, ctx)
            cSegment.setEnabled(true)
        } else if (clef) {
            clef.parentItem()!.remove(clef)
        }
        return cSegment
    }

    static addHeaderKeySig(m: Measure, isFirstKeysig: boolean, staff: Staff, ctx: LayoutContext): Segment | null {
        const staffIdx = staff.idx()
        const track = staffIdx * VOICES
        let kSegment = m.findFirstR(SegmentType.KeySig, new Fraction(0, 1))

        // keyIdx is the key signature at the beginning of the measure
        const keyIdx = staff.keySigEvent(m.tick())
        let ksAnnounce: KeySig | null = null
        if ((isFirstKeysig || ctx.conf().styleB(Sid.genKeysig)) && (keyIdx.key() === Key.C)) {
            const pm = m.prevMeasureMM()
            if (pm && pm.hasCourtesyKeySig()) {
                const ks = pm.first(SegmentType.KeySigAnnounce)
                if (ks) {
                    ksAnnounce = ks.element(track) as KeySig | null
                    if (ksAnnounce) {
                        isFirstKeysig = false
                    }
                }
            }
        }

        const isPitchedStaff = staff.isPitchedStaff(m.tick())
        let keysig: KeySig | null = null
        if (kSegment) {
            keysig = kSegment.element(track) as KeySig | null
        }

        if ((isFirstKeysig || ctx.conf().styleB(Sid.genKeysig)) && isPitchedStaff) {
            if (!kSegment) {
                kSegment = segmentCreate(m, SegmentType.KeySig, new Fraction(0, 1))
                m.add(kSegment)
            }
            kSegment.setHeader(true)
            if (!keysig) {
                //
                // create missing key signature
                //
                keysig = Factory.createItem(ElementType.KEYSIG, kSegment) as KeySig
                keysig.setTrack(track)
                keysig.setGenerated(true)
                keysig.setParent(kSegment)
                kSegment.add(keysig)
            }
            keysig.setKeySigEvent(keyIdx)
            keysig.mutldata().reset()
            TLayout.layoutKeySig(keysig, ctx)
            kSegment.setEnabled(true)
        } else if (keysig && isPitchedStaff) {
            // do not remove user modified keysigs
            let remove = true
            const e = kSegment!.element(staffIdx * VOICES)
            const key = staff.key(m.tick())
            if ((e && !e.generated()) || (key !== keyIdx.key())) {
                remove = false
            }
            if (remove) {
                keysig.parentItem()!.remove(keysig)
            }
        }
        return kSegment
    }

    // ---------------------------------------------------------
    //   addSystemHeader
    //    add generated timesig, keysig and clef
    // ---------------------------------------------------------

    static addSystemHeader(m: Measure, isFirstSystem: boolean, ctx: LayoutContext): void {
        let staffIdx = 0
        let kSegment: Segment | null = null
        let cSegment: Segment | null = null

        for (const staff of ctx.dom().staves()) {
            const track = staffIdx * VOICES

            let isFirstClef = true
            let isFirstKeySig = true
            if (!isFirstSystem) {
                // Search backwards to see if this is the first clef/keysig in the score
                const clefTick = staff.currentClefTick(m.tick())
                const keySigTick = staff.currentKeyTick(m.tick())
                let searchMeasure: Measure | null = ctx.mutDom().tick2measure(clefTick.lt(keySigTick) ? clefTick : keySigTick)
                searchMeasure = searchMeasure!.hasMMRest() && ctx.conf().styleB(Sid.createMultiMeasureRests)
                    ? searchMeasure!.mmRest() : searchMeasure
                while (searchMeasure && searchMeasure.tick().lt(m.tick()) && (isFirstClef || isFirstKeySig)) {
                    const sys = searchMeasure.system()
                    if (isFirstClef && searchMeasure.tick().ge(clefTick)) {
                        let clefSeg = searchMeasure.findFirstR(SegmentType.Clef | SegmentType.HeaderClef, new Fraction(0, 1))
                        const prevMeas = searchMeasure.prevMeasure()
                        if (prevMeas && !clefSeg) {
                            clefSeg = prevMeas.findSegment(SegmentType.Clef, m.tick())
                        }
                        if (clefSeg && clefSeg.enabled()) {
                            const c = clefSeg.element(track) as Clef | null
                            if (c && sys && sys.staff(staffIdx)!.show()) {
                                isFirstClef = false
                            }
                        }
                    }
                    if (isFirstKeySig && searchMeasure.tick().ge(keySigTick)) {
                        const ksSeg = searchMeasure.findSegment(SegmentType.KeySig, searchMeasure.tick())
                        if (ksSeg && ksSeg.enabled()) {
                            const ks = ksSeg.element(track) as KeySig | null
                            if (ks && sys && sys.staff(staffIdx)!.show()) {
                                isFirstKeySig = false
                            }
                        }
                    }
                    searchMeasure = searchMeasure.nextMeasureMM()
                }
            }

            cSegment = MeasureLayout.addHeaderClef(m, isFirstSystem || isFirstClef, staff, ctx)
            kSegment = MeasureLayout.addHeaderKeySig(m, isFirstSystem || isFirstKeySig, staff, ctx)

            ++staffIdx
        }
        if (cSegment) {
            cSegment.createShapes()
        }
        if (kSegment) {
            kSegment.createShapes()
        }

        MeasureLayout.createSystemBeginBarLine(m, ctx)

        m.checkHeader()
    }

    // ---------------------------------------------------------
    //   removeSystemHeader
    // ---------------------------------------------------------

    static removeSystemHeader(m: Measure): void {
        if (!m.header()) {
            return
        }
        for (let seg = m.first(); seg; seg = seg.next()) {
            if (seg.isKeySigType()) {
                let keySigChangeHappensHere = false
                for (const staff of m.score().staves()) {
                    if (staff.keyList().has(m.tick().ticks())) {
                        keySigChangeHappensHere = true
                        break
                    }
                }
                if (seg.header() && !keySigChangeHappensHere) {
                    seg.setEnabled(false)
                }
            }
            if (!seg.header()) {
                break
            }
            if (!seg.isKeySigType()) {
                seg.setEnabled(false)
            }
        }
        m.setHeader(false)
    }

    // ---------------------------------------------------------
    //   addSystemTrailer
    // ---------------------------------------------------------

    static addSystemTrailer(m: Measure, nm: Measure | null, ctx: LayoutContext): void {
        const nstaves = ctx.dom().nstaves()

        // locate a time sig. in the next measure and, if found,
        // check if it has court. sig turned off
        let systemBreakHideCourtesy = false
        const sectionBreakElement = m.sectionBreakElement()
        if (sectionBreakElement) {
            systemBreakHideCourtesy = !sectionBreakElement.showCourtesy()
        }

        if (nm && ctx.conf().styleB(Sid.genCourtesyTimesig) && !systemBreakHideCourtesy && !ctx.conf().isFloatMode()) {
            MeasureLayout.setCourtesyTimeSig(m, nm.tick(), m.endTick(), SegmentType.TimeSigAnnounce, ctx)
        }

        // courtesy key signatures, clefs
        if (nm && ctx.conf().styleB(Sid.genCourtesyKeysig) && !systemBreakHideCourtesy) {
            MeasureLayout.setCourtesyKeySig(m, nm.tick(), m.endTick(), SegmentType.KeySigAnnounce, ctx)
        }

        const courtesyClefSeg = m.findSegmentR(SegmentType.Clef, m.ticks())
        if (courtesyClefSeg) {
            for (let staffIdx = 0; staffIdx < nstaves; ++staffIdx) {
                const track = staffIdx * VOICES
                const courtesyClef = courtesyClefSeg.element(track) as Clef | null
                if (courtesyClef) {
                    courtesyClef.setSmall(true)
                    courtesyClef.setIsTrailer(true)
                }
            }
            courtesyClefSeg.createShapes()
        }

        m.checkTrailer()
    }

    // ---------------------------------------------------------
    //   removeSystemTrailer
    // ---------------------------------------------------------

    static removeSystemTrailer(m: Measure, ctx: LayoutContext): void {
        for (let seg = m.last(); seg && seg !== m.first(); seg = seg.prev()) {
            if (seg.isChordRestType()) {
                break
            }
            if (seg.isClefType()) {
                for (const el of seg.elist()) {
                    if (!el) {
                        continue
                    }
                    const clef = el as Clef
                    clef.setIsTrailer(false)
                    TLayout.layoutClef(clef, ctx)
                }
                seg.createShapes()
            }
            if (seg.isTimeTickType() || !seg.trailer()) {
                continue
            }
            if (seg.enabled()) {
                seg.setEnabled(false)
                seg.setTrailer(false)
            }
        }
        m.setTrailer(false)
    }

    // ---------------------------------------------------------
    //   createSystemBeginBarLine
    // ---------------------------------------------------------

    static createSystemBeginBarLine(m: Measure, ctx: LayoutContext): void {
        if (!m.system()) {
            return
        }
        let s = m.findSegment(SegmentType.BeginBarLine, m.tick())
        let n = 0
        for (const sysStaff of m.system()!.staves()) {
            if (sysStaff.show()) {
                ++n
            }
        }
        if ((n > 1 && ctx.conf().styleB(Sid.startBarlineMultiple))
            || (n === 1 && (ctx.conf().styleB(Sid.startBarlineSingle) || m.system()!.brackets().length))) {
            if (!s) {
                s = segmentCreate(m, SegmentType.BeginBarLine, new Fraction(0, 1))
                m.add(s)
            }
            for (let track = 0; track < ctx.dom().ntracks(); track += VOICES) {
                let bl = s.element(track) as BarLine | null
                if (!bl) {
                    bl = Factory.createItem(ElementType.BAR_LINE, s) as BarLine
                    bl.setTrack(track)
                    bl.setGenerated(true)
                    bl.setParent(s)
                    bl.setBarLineType(BarLineType.NORMAL)
                    bl.setSpanStaff(true)
                    s.add(bl)
                }
                TLayout.layoutBarLine(bl, ctx)
            }
            s.createShapes()
            s.setEnabled(true)
            s.setHeader(true)
            m.setHeader(true)
        } else if (s) {
            s.setEnabled(false)
        }
    }

    static layoutTimeTickAnchors(_m: Measure, _ctx: LayoutContext): void {
        // TODO(port): time tick anchors are only shown in edit mode
    }

    static layoutPartialWidth(lines: StaffLines, ctx: LayoutContext, w: number, wPartial: number, alignRight: boolean): void {
        const ldata = lines.mutldata()
        const s = lines.staff()
        const sp = lines.spatium()
        wPartial *= sp
        let dist = sp
        lines.setPos(new PointF(0.0, 0.0))
        let nlines: number
        if (s) {
            lines.mutldata().setMag(s.staffMag(lines.measure().tick()))
            lines.setColor(s.staffColor(lines.measure().tick()))
            const st = s.staffType(lines.measure().tick())
            dist *= st.lineDistance().val()
            nlines = st.lines()
            lines.mutldata().setPosY(lines.staffOffsetY())
        } else {
            nlines = 5
        }
        lines.setLw(ctx.conf().styleS(Sid.staffLineWidth).val() * sp)
        const x1 = lines.pos().x()
        const x2 = x1 + w
        let y = lines.pos().y()
        ldata.setBbox(x1, -lines.lw() * 0.5 + y, w, (nlines - 1) * dist + lines.lw())

        if (nlines === 1) {
            const extraSize = sp
            ldata.setBbox(ldata.bbox().adjusted(0, -extraSize, 0, extraSize))
        }

        const ll: LineF[] = []
        for (let i = 0; i < nlines; ++i) {
            if (alignRight) {
                ll.push(new LineF(x2 - wPartial, y, x2, y))
            } else {
                ll.push(new LineF(x1, y, x1 + wPartial, y))
            }
            y += dist
        }
        lines.setLines(ll)
    }

    static updateKeySignatures(measure: Measure, ctx: LayoutContext): void {
        const prevMeasure = measure.prevMeasure()
        if (!prevMeasure || !prevMeasure.repeatEnd()) {
            return
        }
        for (let seg = measure.first(); seg; seg = seg.next()) {
            if (!seg.isSegType(SegmentType.KeySigType)) {
                continue
            }
            for (const el of seg.elist()) {
                if (!el) {
                    continue
                }
                TLayout.layoutKeySig(el as KeySig, ctx)
            }
        }
    }
}
