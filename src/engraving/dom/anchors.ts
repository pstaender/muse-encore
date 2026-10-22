/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/anchors.h/.cpp: the time tick anchors (shown while an element is edited or dragged),
 * EditTimeTickAnchors and MoveElementAnchors (moving elements to other segments by dragging and with the keyboard).
 */

import { ElementType, VOICES, VoiceAssignment, staff2track, type staff_idx_t, type voice_idx_t } from '../types/types'
import { Fraction } from '../types/fraction'
import type { PointF } from '../../framework/draw/types/geometry'
import { ElementFlag, EngravingItem, LayoutData } from './engravingitem'
import { CHORD_REST_OR_TIME_TICK_TYPE, SegmentType, type Segment } from './segment'
import { Pid } from './property'
import { dragPositionToSegment } from './utils'
import { KeyboardKey, KeyboardModifier, type EditData } from '../editing/editdata'
import type { Measure } from './measure'
import type { MeasureBase } from './measurebase'
import { ShowAnchors } from './showanchors'
import type { Staff } from './staff'
import type { FiguredBass } from './figuredbass'
import type { SpannerSegment } from './spanner'
import type { TextLineBaseSegment } from './textlinebase'
import type { LineSegment, SLine } from './line'

/** set by rendering/score/scorerenderer.ts (C++ calls MeasureLayout::layoutTimeTickAnchors directly) */
export const anchorsLayoutHooks: { layoutTimeTickAnchors?: (measure: Measure) => void } = {}

const INT_MAX = 2147483647

export enum DrawRegion {
    OUT_OF_RANGE,
    MAIN_REGION,
    EXTENDED_REGION,
}

export class TimeTickAnchorLayoutData extends LayoutData {
    private m_darker = false

    darker(): boolean { return this.m_darker }
    setDarker(v: boolean): void { this.m_darker = v }
}

export class TimeTickAnchor extends EngravingItem {
    constructor(parent: Segment) {
        super(ElementType.TIME_TICK_ANCHOR, parent, ElementFlag.ON_STAFF | ElementFlag.NOT_SELECTABLE | ElementFlag.GENERATED)
        this.setZ(-INT_MAX) // Make sure it is behind everything
    }

    protected override createLayoutData(): TimeTickAnchorLayoutData { return new TimeTickAnchorLayoutData(this) }
    override ldata(): TimeTickAnchorLayoutData { return super.ldata() as TimeTickAnchorLayoutData }
    override mutldata(): TimeTickAnchorLayoutData { return super.ldata() as TimeTickAnchorLayoutData }

    segment(): Segment { return this.parentItem() as unknown as Segment }

    drawRegion(): DrawRegion {
        const showAnchors = this.score().showAnchors()
        const thisStaffIdx = this.staffIdx()
        const thisTick = this.segment().tick()

        const trackOutOfRange = thisStaffIdx < showAnchors.staffIdx || thisStaffIdx >= showAnchors.endStaffIdx
        const tickOutOfRange = thisTick.lt(showAnchors.startTickExtendedRegion) || thisTick.ge(showAnchors.endTickExtendedRegion)
        if (trackOutOfRange || tickOutOfRange) {
            return DrawRegion.OUT_OF_RANGE
        }

        if (thisTick.lt(showAnchors.startTickMainRegion) || thisTick.ge(showAnchors.endTickMainRegion)) {
            return DrawRegion.EXTENDED_REGION
        }

        return DrawRegion.MAIN_REGION
    }

    voiceIdx(): voice_idx_t {
        return this.score().showAnchors().voiceIdx
    }
}

export class EditTimeTickAnchors {
    static updateAnchors(item: EngravingItem): void {
        if (!item.allowTimeAnchor()) {
            item.score().hideAnchors()
            return
        }

        const startTickMainRegion = item.isSpannerSegment() ? (item as unknown as SpannerSegment).spanner()!.tick() : item.tick()
        const endTickMainRegion = item.isSpannerSegment() ? (item as unknown as SpannerSegment).spanner()!.tick2() : item.tick()

        const score = item.score()
        const startMeasure = score.tick2measure(startTickMainRegion)
        const endMeasure = score.tick2measure(endTickMainRegion)
        if (!startMeasure || !endMeasure) {
            return
        }

        const staff = item.staffIdx()
        const startOneBefore = startMeasure.prevMeasure()
        for (let mb: MeasureBase | null = startOneBefore ? startOneBefore : startMeasure; mb && mb.tick().le(endMeasure.tick()); mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            EditTimeTickAnchors.updateAnchorsInMeasure(mb as unknown as Measure, staff)
        }

        const startTickExtendedRegion = startMeasure.tick()
        const endTickExtendedRegion = endMeasure.endTick()
        const voiceIdx = item.hasVoiceAssignmentProperties()
            && item.getProperty(Pid.VOICE_ASSIGNMENT) !== VoiceAssignment.CURRENT_VOICE_ONLY ? VOICES : item.voice()

        score.setShowAnchors(ShowAnchors.create(voiceIdx, staff, startTickMainRegion, endTickMainRegion,
            startTickExtendedRegion, endTickExtendedRegion))

        item.triggerLayout()
    }

    /** C++ updateAnchors(Measure*, staff_idx_t, const std::set<Fraction>&) (renamed: no overloads in TS) */
    static updateAnchorsInMeasure(measure: Measure, staffIdx: staff_idx_t, additionalAnchorRelTicks: Fraction[] = []): void {
        const startTick = new Fraction(0, 1)
        const endTick = measure.ticks()

        const timeSig = measure.score().staff(staffIdx)!.timeSig(measure.tick())
        const timeSigFrac = timeSig ? timeSig.sig() : measure.timesig()
        let halfDivision = new Fraction(1, 2 * timeSigFrac.denominator())
        if (timeSig) {
            halfDivision = halfDivision.div(timeSig.stretch())
        }

        // std::set<Fraction>: sorted, unique
        const anchorTicks: Fraction[] = []
        const insert = (t: Fraction): void => {
            if (!anchorTicks.some(a => a.eq(t))) {
                anchorTicks.push(t)
            }
        }
        for (const t of additionalAnchorRelTicks) {
            insert(t)
        }
        for (let tick = startTick; tick.le(endTick); tick = tick.plus(halfDivision)) {
            insert(tick)
        }
        for (let seg = measure.first(CHORD_REST_OR_TIME_TICK_TYPE); seg; seg = seg.next(CHORD_REST_OR_TIME_TICK_TYPE)) {
            insert(seg.rtick())
        }
        anchorTicks.sort((a, b) => a.lt(b) ? -1 : a.gt(b) ? 1 : 0)

        for (const anchorTick of anchorTicks) {
            EditTimeTickAnchors.createTimeTickAnchor(measure, anchorTick, staffIdx)
        }

        EditTimeTickAnchors.updateLayout(measure)
    }

    static createTimeTickAnchor(measure: Measure, relTick: Fraction, staffIdx: staff_idx_t): TimeTickAnchor | null {
        let returnAnchor: TimeTickAnchor | null = null

        const staff = measure.score().staff(staffIdx)
        if (!staff) {
            return null
        }

        for (const linkedObj of staff.linkList()) {
            const linkedStaff = linkedObj as Staff
            const linkedMeasure = linkedObj === staff ? measure : linkedStaff.score().tick2measureMM(measure.tick())
            if (!linkedMeasure) {
                continue
            }

            const segment = linkedMeasure.getSegmentR(SegmentType.TimeTick, relTick)
            const track = staff2track(linkedStaff.idx())
            const element = segment.element(track)
            let anchor = element ? element as TimeTickAnchor : null
            if (!anchor) {
                anchor = new TimeTickAnchor(segment)
                anchor.setParent(segment)
                anchor.setTrack(track)
                segment.add(anchor)
            }
            if (linkedMeasure === measure) {
                returnAnchor = anchor
            }
        }

        return returnAnchor
    }

    static updateLayout(measure: Measure): void {
        measure.computeTicks()

        anchorsLayoutHooks.layoutTimeTickAnchors?.(measure)
    }
}

export class MoveElementAnchors {
    static moveElementAnchors(element: EngravingItem, key: KeyboardKey, mod: number): void {
        const segment = element.parentItem() && element.parentItem()!.isSegment() ? element.parentItem() as unknown as Segment : null
        if (!segment) {
            return
        }

        const altMod = (mod & KeyboardModifier.AltModifier) !== 0

        const anchorToEndOfPrevious = !!element.getProperty(Pid.ANCHOR_TO_END_OF_PREVIOUS)
        const changeAnchorType = altMod && MoveElementAnchors.canAnchorToEndOfPrevious(element)
        const resetAnchorType = !altMod && anchorToEndOfPrevious
        if (changeAnchorType || resetAnchorType) {
            element.undoChangeProperty(Pid.ANCHOR_TO_END_OF_PREVIOUS, !anchorToEndOfPrevious,
                element.propertyFlags(Pid.ANCHOR_TO_END_OF_PREVIOUS))

            const needMoveSeg = (key === KeyboardKey.Key_Left && anchorToEndOfPrevious)
                || (key === KeyboardKey.Key_Right && !anchorToEndOfPrevious)
            if (!needMoveSeg) {
                MoveElementAnchors.checkMeasureBoundariesAndMoveIfNeed(element)
                return
            }
        }

        MoveElementAnchors.moveSegmentForward(element, /*forward*/ key === KeyboardKey.Key_Right)
        EditTimeTickAnchors.updateAnchors(element)
        MoveElementAnchors.checkMeasureBoundariesAndMoveIfNeed(element)
    }

    static canAnchorToEndOfPrevious(element: EngravingItem): boolean {
        switch (element.type()) {
        case ElementType.HARMONY:
        case ElementType.FRET_DIAGRAM:
        case ElementType.REHEARSAL_MARK:
            return false
        default:
            return true
        }
    }

    static checkMeasureBoundariesAndMoveIfNeed(element: EngravingItem): void {
        const curSeg = element.explicitParent() as unknown as Segment
        const curTick = curSeg.tick()
        const curMeasure = curSeg.measure()
        const prevMeasure = curMeasure.prevMeasure()
        const anchorToEndOfPrevious = !!element.getProperty(Pid.ANCHOR_TO_END_OF_PREVIOUS)
        const needMoveToNext = curTick.eq(curMeasure.endTick()) && !anchorToEndOfPrevious
        const needMoveToPrevious = curSeg.rtick().isZero() && anchorToEndOfPrevious && !!prevMeasure

        if (!needMoveToPrevious && !needMoveToNext) {
            return
        }

        let newSeg: Segment | null = null
        if (needMoveToPrevious) {
            newSeg = prevMeasure!.findSegment(SegmentType.TimeTick, curSeg.tick())
            if (!newSeg) {
                const anchor = EditTimeTickAnchors.createTimeTickAnchor(prevMeasure!, curTick.minus(prevMeasure!.tick()),
                    element.staffIdx())
                EditTimeTickAnchors.updateLayout(prevMeasure!)
                newSeg = anchor!.segment()
            }
        } else {
            newSeg = curSeg.next1(SegmentType.ChordRest)
        }

        if (newSeg && newSeg.tick().eq(curTick)) {
            MoveElementAnchors.moveSegment(element, newSeg, new Fraction(0, 1))
        }
    }

    static moveElementAnchorsOnDrag(element: EngravingItem, ed: EditData): void {
        const segment = element.explicitParent() && element.explicitParent()!.isSegment()
            ? element.explicitParent() as unknown as Segment : null
        if (!segment) {
            return
        }

        const km = ed.modifiers
        if (km & (KeyboardModifier.ShiftModifier | KeyboardModifier.ControlModifier)) {
            return
        }

        EditTimeTickAnchors.updateAnchors(element)

        const newSeg = MoveElementAnchors.findNewAnchorableSegmentFromDrag(element, segment)

        if (newSeg && (newSeg !== segment && !newSeg.measure().isMMRest())) {
            const curOffset = element.offset().clone()
            MoveElementAnchors.moveSegment(element, newSeg, newSeg.tick().minus(segment.tick()))
            MoveElementAnchors.rebaseOffsetOnMoveSegment(element, curOffset, newSeg, segment)
        }
    }

    static findNewAnchorableSegmentFromDrag(element: EngravingItem, curSeg: Segment): Segment | null {
        const system = curSeg.system()
        if (!system) {
            return null
        }

        let newMeasure: Measure | null = null
        const xRef = element.canvasX() - system.canvasX()
        for (const mb of system.measures()) {
            if (!mb.isMeasure()) {
                continue
            }
            if (mb.x() + mb.width() > xRef) {
                newMeasure = mb as unknown as Measure
                break
            }
        }
        if (!newMeasure) {
            return null
        }

        return dragPositionToSegment(element.canvasPos(), newMeasure, element.staffIdx(), null, 0.5, true)
    }

    static findNewAnchorSegmentForLine(lineSegment: LineSegment, ed: EditData, curSeg: Segment): Segment | null {
        const line = lineSegment.line()
        const score = lineSegment.score()
        if (!line.allowTimeAnchor()) {
            if (ed.key === KeyboardKey.Key_Left) {
                return curSeg.prev1WithElemsOnStaff(lineSegment.staffIdx())
            }
            if (ed.key === KeyboardKey.Key_Right) {
                let lastCRSegInScore = score.lastSegment()
                while (lastCRSegInScore && !lastCRSegInScore.isChordRestType()) {
                    lastCRSegInScore = lastCRSegInScore.prev1(SegmentType.ChordRest)
                }
                if (curSeg === lastCRSegInScore && curSeg === line.endSegment()) {
                    // If we reach this point, it means that the line in question does not accept time anchors
                    // and that the line's end segment is the last CR segment in the score. Trying to use
                    // next1WithElemsOnStaff won't do anything from here, but the last segment in the score is
                    // still a valid new anchor segment for this line (see also LineSegment::edit)...
                    return score.lastSegment()
                }
                return curSeg.next1WithElemsOnStaff(lineSegment.staffIdx())
            }
        }

        switch (ed.key) {
        case KeyboardKey.Key_Left: {
            if (ed.modifiers & KeyboardModifier.ControlModifier) {
                const m = curSeg.rtick().isZero() ? curSeg.measure().prevMeasure() : curSeg.measure()
                return m ? m.findFirstR(SegmentType.ChordRest, new Fraction(0, 1)) : null
            }
            return MoveElementAnchors.findNewAnchorableSegment(curSeg, /*forward*/ false)
        }
        case KeyboardKey.Key_Right: {
            if (ed.modifiers & KeyboardModifier.ControlModifier) {
                const measure = curSeg.measure().nextMeasure()
                if (measure) {
                    return measure.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))
                } else {
                    const m = score.lastMeasure()!
                    EditTimeTickAnchors.updateAnchorsInMeasure(m, lineSegment.staffIdx())
                    return m.getChordRestOrTimeTickSegment(m.endTick())
                }
            }
            return MoveElementAnchors.findNewAnchorableSegment(curSeg, /*forward*/ true)
        }
        case KeyboardKey.Key_Home: {
            let m = curSeg.measure().system()!.firstMeasure()!
            if (curSeg.rtick().isZero() && m === curSeg.measure() && m.prevMeasure()) {
                m = m.prevMeasure()!.system()!.firstMeasure()!
            }
            return m.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))
        }
        case KeyboardKey.Key_End: {
            const measure = curSeg.measure().system()!.lastMeasure()!.nextMeasure()
            if (measure) {
                return measure.findFirstR(SegmentType.ChordRest, new Fraction(0, 1))
            } else {
                const m = score.lastMeasure()!
                EditTimeTickAnchors.updateAnchorsInMeasure(m, lineSegment.staffIdx())
                return m.getChordRestOrTimeTickSegment(m.endTick())
            }
        }
        }

        return null
    }

    /** C++ moveSegment(EngravingItem*, bool forward) (renamed: no overloads in TS) */
    static moveSegmentForward(element: EngravingItem, forward: boolean): void {
        const curSeg = element.parentItem() as unknown as Segment
        const newSeg = MoveElementAnchors.getNewSegment(element, curSeg, forward)

        if (newSeg) {
            MoveElementAnchors.moveSegment(element, newSeg, newSeg.tick().minus(curSeg.tick()))
        }
    }

    static getNewSegment(element: EngravingItem, curSeg: Segment, forward: boolean): Segment | null {
        switch (element.type()) {
        case ElementType.REHEARSAL_MARK: {
            const measure = curSeg.measure()
            const newMeasure = forward ? measure.nextMeasureMM() : measure.prevMeasureMM()
            return newMeasure ? newMeasure.first(SegmentType.ChordRest) : null
        }
        default:
            return MoveElementAnchors.findNewAnchorableSegment(curSeg, forward)
        }
    }

    static findNewAnchorableSegment(curSeg: Segment, forward: boolean): Segment | null {
        let newSeg = forward ? curSeg.next1(CHORD_REST_OR_TIME_TICK_TYPE) : curSeg.prev1(CHORD_REST_OR_TIME_TICK_TYPE)

        // Continue until we get to a different tick than where we are
        while (newSeg && newSeg.tick().eq(curSeg.tick())) {
            newSeg = forward ? newSeg.next1(CHORD_REST_OR_TIME_TICK_TYPE) : newSeg.prev1(CHORD_REST_OR_TIME_TICK_TYPE)
        }
        if (!newSeg) {
            return null
        }

        // Always prefer ChordRest segment if one exists at the same tick
        if (newSeg.segmentType() !== SegmentType.ChordRest) {
            const newChordRestSeg = forward ? newSeg.next1(SegmentType.ChordRest) : newSeg.prev1(SegmentType.ChordRest)
            if (newChordRestSeg && newChordRestSeg.tick().eq(newSeg.tick())) {
                newSeg = newChordRestSeg
            }
        }

        return newSeg
    }

    static moveSegment(element: EngravingItem, newSeg: Segment, tickDiff: Fraction): void {
        switch (element.type()) {
        case ElementType.FIGURED_BASS:
            MoveElementAnchors.doMoveFiguredBassSegment(element as unknown as FiguredBass, newSeg, tickDiff)
            break
        case ElementType.HARMONY:
        case ElementType.FRET_DIAGRAM:
            MoveElementAnchors.doMoveHarmonyOrFretDiagramSegment(element, newSeg, tickDiff)
            break
        default:
            MoveElementAnchors.doMoveSegment(element, newSeg, tickDiff)
            break
        }
    }

    static doMoveSegment(element: EngravingItem, newSeg: Segment, tickDiff: Fraction): void {
        if (!element.explicitParent() || !element.explicitParent()!.isSegment()) {
            return
        }

        // NOTE: when creating mmRests, we clone text elements from the underlying measure onto the
        // mmRest measure. This creates lots of additional linked copies which are hard to manage
        // and can result in duplicates. Here we need to remove copies on mmRests because they are invalidated
        // when moving segments (and if needed will be recreated at the next layout). In future we need to
        // change approach and *move* elements onto the mmRests, not clone them. [M.S.]

        const score = element.score()
        const parentMeasure = element.findAncestor(ElementType.MEASURE) as unknown as Measure | null
        const parentMeasureIsMMRest = !!parentMeasure && parentMeasure.isMMRest()

        const linkedElements = [...element.linkList()]
        for (const linkedElement of linkedElements) {
            if (linkedElement === element) {
                continue
            }
            const linkedParentMeasure = (linkedElement as EngravingItem).findAncestor(ElementType.MEASURE) as unknown as Measure | null
            const linkedParentMeasureIsMMrest = !!linkedParentMeasure && linkedParentMeasure.isMMRest()
            if (linkedParentMeasureIsMMrest !== parentMeasureIsMMRest) {
                for (const child of linkedElement.children()) {
                    // e.g. fret diagram should also remove the harmony
                    child.undoUnlink()
                    score.undoRemoveElement(child as EngravingItem)
                }
                linkedElement.undoUnlink()
                score.undoRemoveElement(linkedElement as EngravingItem)
            }
        }

        score.undoChangeParent(element, newSeg, element.staffIdx())
        MoveElementAnchors.moveSnappedItems(element, newSeg, tickDiff)
    }

    /** C++ doMoveSegment(FiguredBass*, Segment*, Fraction) (renamed: no overloads in TS) */
    static doMoveFiguredBassSegment(element: FiguredBass, newSeg: Segment, tickDiff: Fraction): void {
        if (!element.explicitParent() || !element.explicitParent()!.isSegment()) {
            return
        }

        const oldSeg = element.segment()!

        MoveElementAnchors.doMoveSegment(element, newSeg, tickDiff)

        const startTrack = staff2track(element.staffIdx())
        const endTrack = startTrack + VOICES

        // Shorten this if needed
        if (newSeg.tick().gt(oldSeg.tick())) {
            let nextFB: FiguredBass | null = null
            const endTick = newSeg.tick().plus(element.ticks())
            for (let seg = newSeg.next1(CHORD_REST_OR_TIME_TICK_TYPE); seg && seg.tick().le(endTick);
                seg = seg.next1(CHORD_REST_OR_TIME_TICK_TYPE)) {
                nextFB = seg.findAnnotation(ElementType.FIGURED_BASS, startTrack, endTrack) as unknown as FiguredBass | null
                if (nextFB) {
                    break
                }
            }
            if (nextFB) {
                element.setTicks(nextFB.tick().minus(newSeg.tick()))
            }
        }

        // Shorten previous if needed
        if (newSeg.tick().lt(oldSeg.tick())) {
            let prevFB: FiguredBass | null = null
            for (let seg = newSeg.prev1(CHORD_REST_OR_TIME_TICK_TYPE); seg && seg.measure().isAfterOrEqual(newSeg.measure());
                seg = seg.prev1(CHORD_REST_OR_TIME_TICK_TYPE)) {
                prevFB = seg.findAnnotation(ElementType.FIGURED_BASS, startTrack, endTrack) as unknown as FiguredBass | null
                if (prevFB) {
                    break
                }
            }
            if (prevFB) {
                const d = newSeg.tick().minus(prevFB.tick())
                prevFB.setTicks(prevFB.ticks().lt(d) ? prevFB.ticks() : d)
            }
        }
    }

    static doMoveHarmonyOrFretDiagramSegment(element: EngravingItem, newSeg: Segment, tickDiff: Fraction): void {
        for (const item of element.linkList()) {
            const score = item.score()
            const measure = score.tick2measure(newSeg.tick())!
            const chordRestSeg = measure.undoGetSegment(SegmentType.ChordRest, newSeg.tick())
            if (item === element) {
                newSeg = chordRestSeg
            }
        }

        const oldTick = element.tick()

        MoveElementAnchors.doMoveSegment(element, newSeg, tickDiff)

        for (const item of element.linkList()) {
            const score = item.score()
            const oldSegment = score.tick2segment(oldTick, true, SegmentType.ChordRest, false)
            if (oldSegment) {
                oldSegment.checkEmpty()
                if (oldSegment.empty()) {
                    score.undoRemoveElement(oldSegment)
                }
            }
        }
    }

    static moveSnappedItems(element: EngravingItem, newSeg: Segment, tickDiff: Fraction): void {
        const itemAfter = element.mutldata().itemSnappedAfter()
        if (itemAfter) {
            if (itemAfter.isTextBase() && itemAfter.explicitParent() !== newSeg) {
                element.score().undoChangeParent(itemAfter, newSeg, itemAfter.staffIdx())
                MoveElementAnchors.moveSnappedItems(itemAfter, newSeg, tickDiff)
            } else if (itemAfter.isTextLineBaseSegment()) {
                const textLine = (itemAfter as unknown as TextLineBaseSegment).textLineBase() as unknown as SLine
                if (!textLine.tick().eq(newSeg.tick())) {
                    textLine.undoMoveStart(tickDiff)
                }
            }
        }

        const itemBefore = element.mutldata().itemSnappedBefore()
        if (itemBefore) {
            if (itemBefore.isTextBase() && itemBefore.explicitParent() !== newSeg) {
                element.score().undoChangeParent(itemBefore, newSeg, itemBefore.staffIdx())
                MoveElementAnchors.moveSnappedItems(itemBefore, newSeg, tickDiff)
            } else if (itemBefore.isTextLineBaseSegment()) {
                const textLine = (itemBefore as unknown as TextLineBaseSegment).textLineBase() as unknown as SLine
                if (!textLine.tick2().eq(newSeg.tick())) {
                    textLine.undoMoveEnd(tickDiff)
                }
            }
        }
    }

    static rebaseOffsetOnMoveSegment(element: EngravingItem, curOffset: PointF, newSeg: Segment, oldSeg: Segment): void {
        const offsetShift = newSeg.pagePos().minus(oldSeg.pagePos())
        element.setOffset(curOffset.minus(offsetShift))

        const itemBefore = element.mutldata().itemSnappedBefore()
        if (itemBefore && itemBefore.isTextBase()) {
            itemBefore.setOffset(itemBefore.offset().minus(offsetShift))
        }

        const itemAfter = element.mutldata().itemSnappedAfter()
        if (itemAfter && itemAfter.isTextBase()) {
            itemAfter.setOffset(itemAfter.offset().minus(offsetShift))
        }
    }
}
