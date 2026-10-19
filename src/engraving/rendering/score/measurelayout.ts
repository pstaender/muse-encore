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
    BarLineType, ElementType, Key, MeasureNumberPlacement, VOICES, staff2track, track2staff, type staff_idx_t,
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

interface MeasureStartEndPos {
    x1: number
    x2: number
}

const segmentCreate = (m: Measure, st: SegmentType, t: Fraction): Segment => new Segment(m, st, t)

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
        if (ctx.conf().styleB(Sid.createMultiMeasureRests)) {
            // TODO(port): MeasureLayout::createMMRest
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

                // TODO(port): ArpeggioLayout::clearAccidentals

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
                if ((e.isRest() && (e as Rest).isFullMeasureRest()) || e.isMMRest() || e.isMeasureRepeat()) {
                    //
                    // element has to be centered in free space
                    //    x1 - left measure position of free space
                    //    x2 - right measure position of free space
                    const measureStartEnd = MeasureLayout.getMeasureStartEndPos(m, s, staffIdx, e.isMMRest(), false, ctx)
                    const x1 = measureStartEnd.x1
                    const x2 = measureStartEnd.x2

                    if (e.isMMRest() || e.isMeasureRepeat()) {
                        // TODO(port): MMRest, MeasureRepeat
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
                    // TODO(port): tremolos
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
            const beforeKSCourtesy = keySigBarlineMode === 1 /* DOUBLE_BEFORE_COURTESY */ && m.hasCourtesyKeySig()
            const alwaysDoubleKS = keySigBarlineMode === 2 /* ALWAYS_DOUBLE */ && hasKeySig
            const beforeRepeatKS = isRepeatSigBarline && hasKeySig && ctx.conf().styleB(Sid.doubleBarlineBeforeKeySig)
            if (beforeKSCourtesy || alwaysDoubleKS || beforeRepeatKS) {
                blType = BarLineType.DOUBLE
            }
            // Time sig barline
            const timeSigBarlineMode = ctx.conf().styleI(Sid.timeSigCourtesyBarlineMode)
            const beforeTSCourtesy = timeSigBarlineMode === 1 /* DOUBLE_BEFORE_COURTESY */ && hasCourtesyTimeSig
            const alwaysDoubleTS = timeSigBarlineMode === 2 /* ALWAYS_DOUBLE */ && hasTimeSig
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
        if (showCourtesyRepeats || showCourtesyOtherJumps) {
            MeasureLayout.addRepeatCourtesies(m, ctx)
            // TODO(port): addRepeatCourtesyParentheses / removeRepeatCourtesyParenthesesMeasure
        }
        if (!showCourtesyRepeats && !showCourtesyOtherJumps) {
            MeasureLayout.removeRepeatCourtesies(m)
        }

        const prev = m.prevMeasure()
        const courtesiesAfterCancellingRepeats = !!prev && prev.repeatEnd()
                                                 && ctx.conf().styleB(Sid.showCourtesiesAfterCancellingRepeats)
                                                 && ctx.conf().styleB(Sid.showCourtesiesRepeats)
        const courtesiesAfterCancellingOtherJumps = !!prev && prev.repeatJump()
                                                    && ctx.conf().styleB(Sid.showCourtesiesAfterCancellingOtherJumps)
                                                    && ctx.conf().styleB(Sid.showCourtesiesOtherJumps)
        if (courtesiesAfterCancellingRepeats || courtesiesAfterCancellingOtherJumps) {
            MeasureLayout.addRepeatContinuationCourtesies(m, ctx)
        }
        if (!courtesiesAfterCancellingRepeats && !courtesiesAfterCancellingOtherJumps) {
            MeasureLayout.removeRepeatContinuationCourtesies(m)
        }
    }

    static addRepeatCourtesies(m: Measure, _ctx: LayoutContext): void {
        // TODO(port): findFollowingRepeatMeasures() (repeat list)
        MeasureLayout.removeRepeatCourtesies(m)
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
