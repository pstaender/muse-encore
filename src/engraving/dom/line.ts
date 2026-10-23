/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/line.h/.cpp
 *
 */

import { Color } from '../../framework/draw/types/color'
import { LineF, PointF, type RectF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, LineType, PlacementV, SpannerSegmentType, track2staff } from '../types/types'
import { nextChordNote, prevChordNote } from './utils'
import { Sid } from '../style/styledef'
import { Grip, KeyboardKey, KeyboardModifier, type EditData } from '../editing/editdata'
import { EditTimeTickAnchors, MoveElementAnchors } from './anchors'
import { scoreRendererHooks } from './score'
import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { Spanner, SpannerAnchor, SpannerSegment } from './spanner'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Segment } from './segment'
import type { System } from './system'

export abstract class LineSegment extends SpannerSegment {
    protected constructor(type: ElementType, sp: Spanner | null, parent: System | null, f: number = ElementFlag.NOTHING) {
        super(type, sp, parent, f)
    }

    line(): SLine { return this.spanner() as SLine }

    // ---- grips and drag (line.cpp) ----

    override needStartEditingAfterSelecting(): boolean { return true }
    override gripsCount(): number { return 3 }
    override initialEditModeGrip(): Grip { return Grip.END }
    override defaultGrip(): Grip { return Grip.MIDDLE }

    override gripsPositions(_ed?: EditData): PointF[] {
        const grips: PointF[] = []
        const pp = this.pagePos()
        grips[Grip.START] = pp
        grips[Grip.END] = this.pos2().plus(pp)
        grips[Grip.MIDDLE] = this.pos2().times(0.5).plus(pp)
        return grips
    }

    override startDrag(ed: EditData): void {
        super.startDrag(ed)
        const eed = ed.getData(this)
        if (!eed) {
            return
        }
        eed.pushProperty(Pid.OFFSET2)
    }

    override startDragGrip(ed: EditData): void {
        const eed = ed.getData(this)
        if (!eed) {
            return
        }
        eed.pushProperty(Pid.OFFSET)
        eed.pushProperty(Pid.OFFSET2)
        eed.pushProperty(Pid.AUTOPLACE)
        if (ed.modifiers & KeyboardModifier.AltModifier) {
            this.setAutoplace(false)
        }

        EditTimeTickAnchors.updateAnchors(this)
    }

    override dragGrip(ed: EditData): void {
        // Only for resizing according to the diagonal properties
        const deltaResize = new PointF(ed.evtDelta.x(), this.line().diagonal() ? ed.evtDelta.y() : 0.0)

        switch (ed.curGrip) {
        case Grip.START: // Resize the begin of element (left grip)
            this.setOffset(this.offset().plus(deltaResize))
            this.m_offset2 = this.m_offset2.minus(deltaResize)

            if (this.isStyled(Pid.OFFSET)) {
                this.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
            }
            this.rebaseAnchors(ed, ed.curGrip)
            break
        case Grip.END: // Resize the end of element (right grip)
            this.m_offset2 = this.m_offset2.plus(deltaResize)
            this.rebaseAnchors(ed, ed.curGrip)
            break
        case Grip.MIDDLE: { // Move the element (middle grip)
            // Only for moving, no y limitation
            this.setOffset(this.offset().plus(ed.evtDelta))
            this.setOffsetChanged(true)
            if (this.isStyled(Pid.OFFSET)) {
                this.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
            }
            this.rebaseAnchors(ed, ed.curGrip)
            break
        }
        default:
            return
        }
        // TODO(port): note anchored lines: changing the end note (ed.view()->elementNear)

        EditTimeTickAnchors.updateAnchors(this)

        this.triggerLayout()
    }

    override isEditAllowed(ed: EditData): boolean {
        return (ed.modifiers & KeyboardModifier.ShiftModifier) !== 0
    }

    /** Shift+arrows (Home/End) move the start or end of the line; returns true if the event is accepted */
    override edit(ed: EditData): boolean {
        const moveStart = ed.curGrip === Grip.START
        const moveEnd = ed.curGrip === Grip.END || ed.curGrip === Grip.MIDDLE

        const st = this.spannerSegmentType() // may change later
        const l = this.line()

        if (!this.isEditAllowed(ed)) {
            return false
        }

        switch (l.anchor()) {
        case SpannerAnchor.SEGMENT: {
            let s1 = this.spanner()!.startSegment()
            let s2 = this.spanner()!.endSegment()
            // check for line going to end of score
            if (this.spanner()!.tick2().ge(this.score().lastSegment()!.tick())) {
                // endSegment calculated above will be the last chord/rest of score
                // but that is not correct - it should be an imaginary note *after* the end of the score
                // best we can do is set s2 to lastSegment (probably the end barline)
                s2 = this.score().lastSegment()
            }
            if (!s1 && !s2) {
                return true
            }
            if (moveStart) {
                s1 = MoveElementAnchors.findNewAnchorSegmentForLine(this, ed, s1!)
            } else {
                s2 = MoveElementAnchors.findNewAnchorSegmentForLine(this, ed, s2!)
            }
            if (!s1 || !s2 || s1.tick().ge(s2.tick())) {
                return true
            }

            this.undoMoveStartEndAndSnappedItems(ed, moveStart, moveEnd, s1, s2)

            EditTimeTickAnchors.updateAnchors(this)
            break
        }
        case SpannerAnchor.NOTE: {
            let note1 = l.startElement() as unknown as Note | null
            let note2 = l.endElement() as unknown as Note | null
            const oldNote1 = note1
            const oldNote2 = note2
            if (!note1 && !note2) {
                return true // accept the event without doing anything
            }

            switch (ed.key) {
            case KeyboardKey.Key_Left:
                if (moveStart) {
                    note1 = prevChordNote(note1!)
                } else if (moveEnd) {
                    note2 = prevChordNote(note2!)
                }
                break
            case KeyboardKey.Key_Right:
                if (moveStart) {
                    note1 = nextChordNote(note1!)
                } else if (moveEnd) {
                    note2 = nextChordNote(note2!)
                }
                break
            case KeyboardKey.Key_Up:
                if (moveStart) {
                    note1 = this.score().upAlt(note1!) as unknown as Note | null
                } else if (moveEnd) {
                    note2 = this.score().upAlt(note2!) as unknown as Note | null
                }
                break
            case KeyboardKey.Key_Down:
                if (moveStart) {
                    note1 = this.score().downAlt(note1!) as unknown as Note | null
                } else if (moveEnd) {
                    note2 = this.score().downAlt(note2!) as unknown as Note | null
                }
                break
            default:
                return true
            }

            // check prevChordNote() and nextchordNote() didn't return null
            // OR Score::upAlt() and Score::downAlt() didn't return non-Note (notably rests)
            // OR spanner duration is > 0
            // OR note1 and note2 didn't end up in different instruments
            // if this is the case, accepts the event and return without doing nothing
            if (!note1 || !note2
                || !note1.isNote() || !note2.isNote()
                || note1.chord().tick().ge(note2.chord().tick())
                || note1.chord().staff()!.part()!.instrument(note1.chord().tick())
                !== note2.chord().staff()!.part()!.instrument(note2.chord().tick())) {
                return true
            }
            if (note1 !== oldNote1 || note2 !== oldNote2) {
                this.score().undoChangeSpannerElements(this.spanner()!, note1, note2)
            }
            break
        }
        case SpannerAnchor.MEASURE:
        case SpannerAnchor.CHORD: {
            let m1 = l.startMeasure()!
            let m2 = l.endMeasure()!

            if (ed.key === KeyboardKey.Key_Left) {
                if (moveStart) {
                    if (m1.prevMeasure()) {
                        m1 = m1.prevMeasure()!
                    }
                } else if (moveEnd) {
                    const m = m2.prevMeasure()
                    if (m) {
                        m2 = m
                    }
                }
            } else if (ed.key === KeyboardKey.Key_Right) {
                if (moveStart) {
                    if (m1.nextMeasure()) {
                        m1 = m1.nextMeasure()!
                    }
                } else if (moveEnd) {
                    if (m2.nextMeasure()) {
                        m2 = m2.nextMeasure()!
                    }
                }
            } else if (ed.key === KeyboardKey.Key_Home) {
                if (moveStart) {
                    m1 = m1.system()!.firstMeasure()!
                } else if (moveEnd) {
                    m2 = m2.system()!.firstMeasure()!
                }
            } else if (ed.key === KeyboardKey.Key_End) {
                if (moveStart) {
                    m1 = m1.system()!.lastMeasure()!
                } else if (moveEnd) {
                    m2 = m2.system()!.lastMeasure()!
                }
            }
            if (m1.tick().gt(m2.tick())) {
                return true
            }
            if (l.startElement() !== (m1 as unknown)) {
                this.spanner()!.undoChangeProperty(Pid.SPANNER_TICK, m1.tick())
                this.spanner()!.undoChangeProperty(Pid.SPANNER_TICKS, m2.endTick().minus(m1.tick()))
            } else if (l.endElement() !== (m2 as unknown)) {
                this.spanner()!.undoChangeProperty(Pid.SPANNER_TICKS, m2.endTick().minus(m1.tick()))
            }
            break
        }
        }
        this.triggerLayout()
        // recompute segment list, segment type may change
        scoreRendererHooks.layoutItem!(l)

        let nls: LineSegment | null = null
        if (st === SpannerSegmentType.SINGLE) {
            if (moveStart) {
                nls = l.frontSegment() as LineSegment | null
            } else if (moveEnd) {
                nls = l.backSegment() as LineSegment | null
            }
        } else if (st === SpannerSegmentType.BEGIN) {
            nls = l.frontSegment() as LineSegment | null
        } else if (st === SpannerSegmentType.END) {
            nls = l.backSegment() as LineSegment | null
        }

        if (nls && nls !== this) {
            ed.view?.changeEditElement?.(nls)
        }

        this.triggerLayout()
        return true
    }

    findSegmentForGrip(grip: Grip, pos: PointF): Segment | null {
        if (grip !== Grip.START && grip !== Grip.END) {
            return null
        }

        const l = this.line()
        const left = grip === Grip.START

        const oldStaffIndex = left ? this.staffIdx() : track2staff(l.effectiveTrack2())

        const spacingFactor = 0.5 // defines the point where canvas is divided between segments, systems etc.

        let sys = this.system()
        const foundSystems = this.score().searchSystem(pos, sys, spacingFactor)

        if (foundSystems.length && !foundSystems.includes(sys!) && foundSystems[0].staves().length) {
            sys = foundSystems[0]
        }

        if (!sys) {
            return null
        }

        // Restrict searching segment to the correct staff
        pos = new PointF(pos.x(), sys.staffCanvasYpage(oldStaffIndex))

        // don't prefer any segment while searching line position
        const seg = this.score().dragPosition(pos, oldStaffIndex, null, spacingFactor, this.allowTimeAnchor()).seg

        // Lines that don't allow time anchors can anchor to the last segment in the score (see also LineSegment::findNewAnchorSegment)
        if (seg && !this.allowTimeAnchor() && grip === Grip.END) {
            const last = this.score().lastSegment()!
            const lastSegIsClosest = Math.abs(last.canvasX() - pos.x()) < Math.abs(seg.canvasX() - pos.x())
            if (lastSegIsClosest) {
                return last
            }
        }

        return seg
    }

    static lastSegmentEndTick(seg: Segment, s: Spanner): Fraction {
        return seg.tick().plus(seg.ticksInStaff(track2staff(s.effectiveTrack2())))
    }

    /**
     * If system has changed, returns the new line segment (may appear to be reused this segment), otherwise returns
     * null.
     */
    rebaseAnchor(grip: Grip, newSeg: Segment | null): LineSegment | null {
        switch (grip) {
        case Grip.START:
            if (!this.isSingleBeginType()) {
                return null
            }
            break
        case Grip.END:
            if (!this.isSingleEndType()) {
                return null
            }
            break
        default:
            return null
        }

        const l = this.line()
        const left = grip === Grip.START
        const oldSeg = left ? l.startSegment() : l.endSegment()
        const oldLineSegSystem = this.system()
        const oldSpannerSystem = oldSeg ? oldSeg.measure().system() : null

        if (!newSeg || oldSeg === newSeg) {
            return null
        }

        const newSegTick = newSeg.tick()
        let startTick = left ? newSegTick : l.tick()
        let endTick = left ? l.tick2() : (newSegTick.eq(startTick) ? newSegTick.plus(newSeg.ticks()) : newSegTick)

        if (endTick.le(startTick)) {
            if (left) {
                endTick = LineSegment.lastSegmentEndTick(newSeg, l)
            } else {
                startTick = newSeg.tick()
            }
        }

        let anchorChanged = false

        const oldPos = this.line().linePos(grip).pos

        if (!l.tick().eq(startTick)) {
            l.undoChangeProperty(Pid.SPANNER_TICK, startTick)
            anchorChanged = true
        }

        const ticksLength = endTick.minus(startTick)
        if (!ticksLength.eq(l.ticks())) {
            l.undoChangeProperty(Pid.SPANNER_TICKS, ticksLength)
            anchorChanged = true
        }

        const newTickSeg = left ? l.startSegment() : l.endSegment()
        const newSpannerSystem = newTickSeg ? newTickSeg.measure().system() : null

        if ((oldLineSegSystem && newSeg.system() !== oldLineSegSystem) || oldSpannerSystem !== newSpannerSystem) {
            scoreRendererHooks.layoutItem!(l)
            return l.segmentsEmpty() ? null : left ? l.frontSegment() as LineSegment : l.backSegment() as LineSegment
        } else if (anchorChanged) {
            this.rebaseOffsetsOnAnchorChanged(grip, oldPos)
        }

        return null
    }

    rebaseOffsetsOnAnchorChanged(grip: Grip, oldPos: PointF): void {
        const newPos = this.line().linePos(grip).pos
        const delta = oldPos.minus(newPos)
        if (grip === Grip.START) {
            this.setOffset(this.offset().plus(delta))
            this.m_offset2 = this.m_offset2.minus(delta)
            this.setOffsetChanged(true)
        } else {
            this.m_offset2 = this.m_offset2.plus(delta)
        }
    }

    rebaseAnchors(ed: EditData, grip: Grip): void {
        if (this.line().anchor() !== SpannerAnchor.SEGMENT) {
            return
        }

        // don't change anchors on keyboard adjustment or if Ctrl is pressed
        // (Ctrl+Left/Right is handled elsewhere!)
        if (ed.key === KeyboardKey.Key_Left || ed.key === KeyboardKey.Key_Right || ed.key === KeyboardKey.Key_Up
            || ed.key === KeyboardKey.Key_Down || (ed.modifiers & KeyboardModifier.ControlModifier)) {
            return
        }

        const startSeg = this.line().startSegment()
        const endSeg = this.line().endSegment()
        const xDistanceFromStartSegment = startSeg && startSeg.system() === this.system()
            ? (startSeg.x() + startSeg.measure().x()) - this.ldata().pos().x() : 0.0
        const xDistanceFromEndSegment = endSeg && endSeg.system() === this.system()
            ? (endSeg.x() + endSeg.measure().x()) - (this.ldata().pos().x() + this.ipos2().x()) : 0.0

        switch (grip) {
        case Grip.START:
        case Grip.END: {
            const left = grip === Grip.START

            if (left && !this.isSingleBeginType()) {
                return
            }
            if (!left && !this.isSingleEndType()) {
                return
            }

            // Find an appropriate segment to bind from actual mouse
            // position. This allows changing systems while dragging
            // while not setting line position to something
            // inappropriate.
            const seg = this.findSegmentForGrip(grip, ed.pos
                .plus(left ? new PointF(xDistanceFromStartSegment, 0.0) : new PointF(xDistanceFromEndSegment, 0.0)))
            const newLineSegment = this.rebaseAnchor(grip, seg)

            if (newLineSegment) {
                // If new line segment is not the same as this one,
                // switch to dragging that new segment.
                if (newLineSegment !== this) {
                    // Reset offset for the old line segment
                    if (left) {
                        this.m_offset2.setX(this.m_offset2.x() - this.offset().x())
                        this.setOffset(new PointF())
                    } else {
                        this.setUserOff2(new PointF())
                    }

                    // Switch to dragging the new line segment
                    ed.view?.changeEditElement?.(newLineSegment)
                }

                // Set offset for the new line segment for grip to appear under the mouse cursor
                const { pos: lp, system: sys } = this.line().linePos(grip)
                const xoff = ed.pos.minus(sys!.canvasPos()).x() - lp.x() // sys->mapFromCanvas(ed.pos)

                if (left) {
                    newLineSegment.setOffset(new PointF(xoff, newLineSegment.offset().y()))
                    newLineSegment.setUserOff2(new PointF(-xoff, 0.0))
                } else {
                    newLineSegment.setUserXoffset2(xoff)
                }
            }
            break
        }
        case Grip.MIDDLE: {
            if (!this.isSingleType()) {
                return
            }

            const sys = this.system()
            if (!sys) {
                return
            }

            const l = this.line()

            // If dragging middle grip (or the entire hairpin), mouse position
            // does not directly correspond to any sensible position, so use
            // actual line coordinates instead. This method doesn't allow for
            // system changes, but that seems OK when dragging the entire line:
            // the line will just push away other systems according to autoplacement
            // rules if necessary.
            let cpos = this.canvasPos()
            cpos = new PointF(cpos.x(), sys.staffCanvasYpage(l.staffIdx())) // prevent cross-system move

            const seg1 = this.findSegmentForGrip(Grip.START, cpos.plus(new PointF(xDistanceFromStartSegment, 0.0)))
            const seg2 = this.findSegmentForGrip(Grip.END, cpos.plus(this.pos2()).plus(new PointF(xDistanceFromEndSegment, 0.0)))

            if (!(seg1 && seg2 && seg1.system() === seg2.system() && seg1.system() === sys)) {
                return
            }

            const oldStartPos = this.line().linePos(Grip.START).pos
            const oldEndPos = this.line().linePos(Grip.END).pos

            this.undoMoveStartEndAndSnappedItems(ed, true, true, seg1, seg2)

            this.rebaseOffsetsOnAnchorChanged(Grip.START, oldStartPos)
            this.rebaseOffsetsOnAnchorChanged(Grip.END, oldEndPos)
            break
        }
        default:
            break
        }
    }

    undoMoveStartEndAndSnappedItems(ed: EditData, moveStart: boolean, moveEnd: boolean, s1: Segment, s2: Segment): void {
        const moveSnapped = !(ed.modifiers & KeyboardModifier.AltModifier)
        const thisLine = this.line()
        if (moveStart) {
            const tickDiff = s1.tick().minus(thisLine.tick())
            const itemSnappedBefore = this.ldata().itemSnappedBefore()
            if (itemSnappedBefore && moveSnapped) {
                if (itemSnappedBefore.isTextBase()) {
                    MoveElementAnchors.moveSegment(itemSnappedBefore, s1, tickDiff)
                } else if (itemSnappedBefore.isLineSegment()) {
                    (itemSnappedBefore as LineSegment).line().undoMoveEnd(tickDiff)
                    thisLine.undoMoveStart(tickDiff)
                }
            } else {
                thisLine.undoMoveStart(tickDiff)
            }
        }
        if (moveEnd) {
            const tickDiff = s2.tick().minus(thisLine.tick2())
            const itemSnappedAfter = thisLine.backSegment()!.ldata().itemSnappedAfter()
            if (itemSnappedAfter && moveSnapped) {
                if (itemSnappedAfter.isTextBase()) {
                    MoveElementAnchors.moveSegment(itemSnappedAfter, s2, tickDiff)
                } else if (itemSnappedAfter.isLineSegment()) {
                    (itemSnappedAfter as LineSegment).line().undoMoveStart(tickDiff)
                    thisLine.undoMoveEnd(tickDiff)
                }
            } else {
                thisLine.undoMoveEnd(tickDiff)
            }
        }
    }

    /** C++ leftAnchorPosition(systemPositionY): page coordinates */
    leftAnchorPosition(systemPositionY: number): PointF {
        if (this.isMiddleType() || this.isEndType()) {
            return new PointF(this.system()!.firstMeasure()!.pageBoundingRect().left(), systemPositionY)
        }

        let result = new PointF()

        const startSeg = this.line().startSegment()
        if (!startSeg) {
            return result
        }

        const s = startSeg.measure().system()
        result = startSeg.pos().plus(startSeg.measure().pos())
        result.setY(result.y() + systemPositionY - this.system()!.pos().y())

        if (s) {
            result = result.plus(s.pos()) // to page coordinates
        }
        return result
    }

    /** C++ rightAnchorPosition(systemPositionY): page coordinates */
    rightAnchorPosition(systemPositionY: number): PointF {
        const sys = this.system()
        if (!sys) {
            return new PointF()
        }

        const endsAtSystemEnd = this.isSingleEndType() && this.line().tick2().eq(sys.endTick())
        if (this.isMiddleType() || this.isBeginType() || endsAtSystemEnd) {
            return new PointF(sys.endingXForOpenEndedLines() + sys.x(), systemPositionY)
        }

        let result = new PointF()

        const endSeg = this.line().endSegment()
        if (!endSeg) {
            return result
        }

        const s = endSeg.measure().system()
        result = endSeg.pos().plus(endSeg.measure().pos())
        result.setY(result.y() + systemPositionY - this.system()!.pos().y())

        if (s) {
            result = result.plus(s.pos()) // to page coordinates
        }
        return result
    }

    /** return page coordinates */
    override gripAnchorLines(grip: Grip): LineF[] {
        const result: LineF[] = []

        // Middle or aperture grip have no anchor
        const system = this.system()
        if (!system || grip === Grip.APERTURE) {
            return result
        }

        const stIdx = this.staffIdx()
        let y = system.staffYpage(stIdx)
        if (this.line().placement() === PlacementV.BELOW) {
            y += system.staff(stIdx)!.bbox().height()
        }
        // adjust Y to staffType offset
        y += this.staffOffsetY()

        const p = system.page()
        const pageOffset = p ? p.pos() : new PointF()
        switch (grip) {
        case Grip.START:
            result.push(new LineF(this.leftAnchorPosition(y), this.gripsPositions()[Grip.START]).translated(pageOffset))
            break
        case Grip.END:
            result.push(new LineF(this.rightAnchorPosition(y), this.gripsPositions()[Grip.END]).translated(pageOffset))
            break
        case Grip.MIDDLE:
            result.push(new LineF(this.leftAnchorPosition(y), this.gripsPositions()[Grip.START]).translated(pageOffset))
            result.push(new LineF(this.rightAnchorPosition(y), this.gripsPositions()[Grip.END]).translated(pageOffset))
            break
        default:
            break
        }

        return result
    }

    override dragAnchorLines(): LineF[] {
        return this.gripAnchorLines(Grip.MIDDLE)
    }

    override drag(ed: EditData): RectF {
        this.setOffset(this.offset().plus(ed.evtDelta))
        this.setOffsetChanged(true)

        if (this.isStyled(Pid.OFFSET)) {
            this.setPropertyFlags(Pid.OFFSET, PropertyFlags.UNSTYLED)
        }

        this.rebaseAnchors(ed, Grip.MIDDLE)

        return this.canvasBoundingRect()
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.DIAGONAL
            || pid === Pid.COLOR
            || pid === Pid.LINE_WIDTH
            || pid === Pid.LINE_STYLE
            || pid === Pid.DASH_LINE_LEN
            || pid === Pid.DASH_GAP_LEN) {
            return this.spanner()
        }
        return super.propertyDelegate(pid)
    }

    lineWidth(): Spatium {
        return this.hasSpanner() ? this.line().lineWidth() : new Spatium(0.0)
    }

    override absoluteFromSpatium(sp: Spatium): number {
        if (!this.hasSpanner()) {
            return super.absoluteFromSpatium(sp)
        }
        return this.line().absoluteFromSpatium(sp)
    }

    /** C++ calls EngravingItem::spatiumChanged (not SpannerSegment's) and always scales offset2 */
    override spatiumChanged(ov: number, nv: number): void {
        this.spatiumChangedItem(ov, nv)
        this.m_offset2 = this.m_offset2.times(nv / ov)
    }
}

export abstract class SLine extends Spanner {
    private m_lineWidth = new Spatium(0.15)
    private m_lineColor: Color = Color.BLACK.clone()
    private m_lineStyle = LineType.SOLID
    private m_dashLineLen = 5.0
    private m_dashGapLen = 5.0
    private m_diagonal = false

    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
        this.setTrack(0)
    }

    abstract createLineSegment(parent: System | null): LineSegment

    diagonal(): boolean { return this.m_diagonal }
    setDiagonal(v: boolean): void { this.m_diagonal = v }
    lineWidth(): Spatium { return this.m_lineWidth }
    lineColor(): Color { return this.m_lineColor }
    lineStyle(): LineType { return this.m_lineStyle }
    setLineWidth(v: Spatium): void { this.m_lineWidth = v }
    setLineColor(v: Color): void { this.m_lineColor = v.clone() }
    setLineStyle(v: LineType): void { this.m_lineStyle = v }
    dashLineLen(): number { return this.m_dashLineLen }
    setDashLineLen(val: number): void { this.m_dashLineLen = val }
    dashGapLen(): number { return this.m_dashGapLen }
    setDashGapLen(val: number): void { this.m_dashGapLen = val }

    override frontSegment(): LineSegment { return super.frontSegment() as LineSegment }
    override backSegment(): LineSegment { return super.backSegment() as LineSegment }
    override segmentAt(n: number): LineSegment { return super.segmentAt(n) as LineSegment }

    override allowTimeAnchor(): boolean { return true }

    /** C++ linePos(Grip, System** system): returns the position and the system */
    linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        const mmRest = this.style().styleB(Sid.createMultiMeasureRests)

        switch (this.anchor()) {
        case SpannerAnchor.NOTE: {
            const item = start ? this.startElement() : this.endElement()
            const note = item && item.isNote() ? item as Note : null
            if (!note) {
                return { pos: new PointF(), system: null }
            }
            const system = note.chord().segment()!.measure().system()
            if (!system) {
                return { pos: new PointF(), system: null }
            }
            return { pos: note.pagePos().minus(system.pagePos()), system }
        }
        case SpannerAnchor.CHORD:
        case SpannerAnchor.SEGMENT: {
            let segment: Segment | null = start ? this.startSegment() : this.endSegment()
            if (!segment) {
                return { pos: new PointF(), system: null }
            }
            if (this.anchor() === SpannerAnchor.CHORD && !segment.isChordRestType()) {
                return { pos: new PointF(), system: null }
            }
            if (!start) {
                const curTick = segment.tick()
                while (true) {
                    const prevSeg: Segment | null = mmRest ? segment!.prev1MM() : segment!.prev1()
                    if (prevSeg && prevSeg.tick().eq(curTick)) {
                        segment = prevSeg
                    } else {
                        break
                    }
                }
            }
            const system = segment.measure().system()
            const x = segment.x() + segment.measure().x() - (start ? 0.0 : this.spatium())
            return { pos: new PointF(x, 0.0), system }
        }
        case SpannerAnchor.MEASURE: {
            const measure = this.score().tick2measureMM(start ? this.tick() : this.tick2())
            if (!measure) {
                return { pos: new PointF(), system: null }
            }
            return { pos: new PointF(measure.x(), 0.0), system: measure.system() }
        }
        default:
            return { pos: new PointF(), system: null }
        }
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.DIAGONAL: return this.m_diagonal
        case Pid.COLOR: return this.m_lineColor
        case Pid.LINE_WIDTH: return this.m_lineWidth
        case Pid.LINE_STYLE: return this.m_lineStyle
        case Pid.DASH_LINE_LEN: return this.dashLineLen()
        case Pid.DASH_GAP_LEN: return this.dashGapLen()
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.DIAGONAL:
            this.m_diagonal = v as boolean
            break
        case Pid.COLOR:
            this.setLineColor(v as Color)
            break
        case Pid.LINE_WIDTH:
            this.m_lineWidth = v instanceof Spatium ? v : Spatium.fromMM(v as number, this.spatium())
            break
        case Pid.LINE_STYLE:
            this.m_lineStyle = v as LineType
            break
        case Pid.DASH_LINE_LEN:
            this.setDashLineLen(v as number)
            break
        case Pid.DASH_GAP_LEN:
            this.setDashGapLen(v as number)
            break
        default:
            return super.setProperty(id, v)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.DIAGONAL:
            return false
        case Pid.COLOR:
            return Color.BLACK.clone()
        case Pid.LINE_WIDTH:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return new Spatium(0.15)
        case Pid.LINE_STYLE:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return LineType.SOLID
        case Pid.DASH_LINE_LEN:
        case Pid.DASH_GAP_LEN:
            if (this.propertyFlags(pid) !== PropertyFlags.NOSTYLE) {
                return super.propertyDefault(pid)
            }
            return 5.0
        default:
            return super.propertyDefault(pid)
        }
    }

    static guessFinalNote(startNote: Note): Note | null {
        let chord: Chord = startNote.chord()
        if (chord.isGraceBefore()) {
            const parentChord = chord.parent() as unknown as Chord
            const gracesBefore = parentChord.graceNotesBefore().chords()
            const positionOfThis = gracesBefore.indexOf(chord)
            if (positionOfThis >= 0 && positionOfThis + 1 < gracesBefore.length) {
                return gracesBefore[positionOfThis + 1].upNote()
            }
            return parentChord.upNote()
        } else if (chord.isGraceAfter()) {
            const parentChord = chord.parent() as unknown as Chord
            const gracesAfter = parentChord.graceNotesAfter().chords()
            const positionOfThis = gracesAfter.indexOf(chord)
            if (positionOfThis >= 0 && positionOfThis + 1 < gracesAfter.length) {
                return gracesAfter[positionOfThis + 1].upNote()
            }
            chord = parentChord
        } else {
            const graces = chord.graceNotesAfter().chords()
            if (graces.length > 0) {
                return graces[0].upNote()
            }
        }

        if (!chord.explicitParent()!.isSegment()) {
            return null
        }

        let segm = chord.score().tick2rightSegment(chord.endTick())
        while (segm && !segm.isChordRestType()) {
            segm = segm.next1()
        }
        if (!segm) {
            return null
        }

        const chordTrack = chord.track()
        const part = chord.part()
        let target: Chord | null = null
        const e = segm.element(chordTrack)
        if (e && e.isChord()) {
            target = e as Chord
        } else {
            for (const currChord of segm.elist()) {
                if (currChord && currChord.isChord() && currChord.part() === part) {
                    target = currChord as Chord
                    break
                }
            }
        }

        if (target && target.notes().length > 0) {
            const graces = target.graceNotesBefore().chords()
            if (graces.length > 0) {
                return graces[0].upNote()
            }
            // normal case: try to return the note in the next chord that is in the
            // same position as the start note relative to the end chord
            const startNoteIdx = chord.notes().indexOf(startNote)
            const endNoteIdx = Math.min(startNoteIdx, target.notes().length - 1)
            return target.notes()[endNoteIdx]
        }
        return null
    }

    undoMoveStart(tickDiff: Fraction): void {
        const newTick = this.tick().plus(tickDiff)
        if (newTick.ge(new Fraction(0, 1))) {
            this.undoChangeProperty(Pid.SPANNER_TICK, newTick)
        }
        const newDuration = this.ticks().minus(tickDiff)
        if (newDuration.gt(new Fraction(0, 1))) {
            this.undoChangeProperty(Pid.SPANNER_TICKS, newDuration)
        }
    }

    undoMoveEnd(tickDiff: Fraction): void {
        const newDuration = this.ticks().plus(tickDiff)
        if (newDuration.gt(new Fraction(0, 1))) {
            this.undoChangeProperty(Pid.SPANNER_TICKS, newDuration)
        } else {
            const newTick = this.tick().plus(tickDiff)
            if (newTick.ge(new Fraction(0, 1))) {
                this.undoChangeProperty(Pid.SPANNER_TICK, this.tick().plus(tickDiff))
            }
        }
    }
}
