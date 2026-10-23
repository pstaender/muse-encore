/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/guitarbendlayout.h/.cpp
 */

import { PainterPath } from '../../../framework/draw/types/painterpath'
import { PointF, PolygonF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { DirectionV, GuitarBendType, SpannerSegmentType, VibratoType } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { Chord } from '../../dom/chord'
import {
    GuitarBend, type GuitarBendHoldSegment, type GuitarBendSegment,
} from '../../dom/guitarbend'
import type { LineSegment, SLine } from '../../dom/line'
import type { Note } from '../../dom/note'
import type { System } from '../../dom/system'
import type { LayoutContext } from './layoutcontext'
import { GuitarDiveLayout } from './guitardivelayout'
import { TextLayout } from './textlayout'
import { TLayout } from './tlayout'

export class GuitarBendLayout {
    /* If system is different from nullptr, only the segment belonging to it is laid out.
     * Otherwise, all segments which have a system are laid out. */
    static updateSegmentsAndLayout(item: SLine, ctx: LayoutContext, system: System | null = null): void {
        const startNote = item.startElement() as Note | null
        const endNote = item.endElement() as Note | null
        if (!startNote || !endNote) {
            return
        }

        const system1 = startNote.findMeasure()!.system()
        const system2 = endNote.findMeasure()!.system()

        if (!system1) { // system2 may be null if the end note's system hasn't been laid out yet
            return
        }

        item.setTick(startNote.tick())
        item.setTick2(endNote.tick())

        const segmentsNeeded = system1 === system2 ? 1 : 2
        const segmentCount = item.spannerSegments().length
        if (segmentCount !== segmentsNeeded) {
            item.fixupSegments(segmentsNeeded, (parent) => item.createLineSegment(parent))
        }

        item.frontSegment().setSystem(system1)
        if (segmentsNeeded === 1) {
            item.frontSegment().setSpannerSegmentType(SpannerSegmentType.SINGLE)
        } else {
            item.frontSegment().setSpannerSegmentType(SpannerSegmentType.BEGIN)
            item.backSegment().setSystem(system2)
            item.backSegment().setSpannerSegmentType(SpannerSegmentType.END)
        }

        for (const segment of item.spannerSegments()) {
            if (!segment.system() || (system && segment.system() !== system)) {
                /* this segment belongs to a system which either has already been
                 * laid out or will be laid out in a later pass */
                continue
            }
            segment.setTrack(item.track())
            TLayout.layoutItem(segment as LineSegment, ctx)
        }

        TLayout.fillNoteShape(startNote)
    }

    static layoutStandardStaff(item: GuitarBendSegment, ctx: LayoutContext): void {
        const bend = item.guitarBend()

        if (bend.bendType() === GuitarBendType.DIP) {
            GuitarDiveLayout.layoutDip(item, ctx)
        } else if (bend.bendType() === GuitarBendType.SCOOP) {
            GuitarDiveLayout.layoutScoop(item)
        } else if (bend.bendType() === GuitarBendType.SLIGHT_BEND) {
            GuitarBendLayout.layoutSlightBend(item, ctx)
        } else {
            GuitarBendLayout.layoutAngularBend(item, ctx)
        }
    }

    private static layoutAngularBend(item: GuitarBendSegment, ctx: LayoutContext): void {
        const bend = item.guitarBend()

        GuitarBendLayout.computeUp(bend)
        GuitarBendLayout.computeIsInside(bend)

        const startNote = bend.startNote()
        const endNote = bend.endNote()
        if (!startNote || !endNote) {
            return
        }

        if ((bend.bendType() === GuitarBendType.PRE_BEND || bend.bendType() === GuitarBendType.PRE_DIVE)
            && !startNote.parenthesisInfo()) {
            startNote.setGhost(true)
            startNote.mutldata().reset()
            TLayout.layoutChord(startNote.chord(), ctx)
        }

        const startSystem = startNote.chord().segment()!.system()
        if (!startSystem) {
            return
        }

        const up = bend.ldata().up
        const upSign = up ? -1 : 1
        const isInside = bend.ldata().isInside
        const spatium = item.spatium()
        const verticalPadding = 0.2 * spatium
        const horizontalIndent = 0.2 * spatium
        const heightDiff = endNote.y() - startNote.y()

        let startPos: PointF
        let endPos: PointF

        if (item.isSingleBeginType()) {
            const startChord = startNote.chord()
            startPos = GuitarBendLayout.notePosInSystem(startNote, startChord)

            const xOff = (isInside ? 1 : 0.5) * startNote.width() + horizontalIndent * startNote.mag()
            let yOff = upSign * verticalPadding * startNote.mag()
            if (!isInside) {
                yOff += upSign * 0.5 * startNote.height()
            }

            startPos = startPos.plus(new PointF(xOff, yOff))
        } else {
            const endSystem = endNote.chord().segment()!.system()
            if (!endSystem) {
                return
            }
            const x = endSystem.firstNoteRestSegmentX(true)
            const y = endNote.y() + upSign * 0.5 * endNote.height() - 0.5 * heightDiff
            startPos = new PointF(x, y)
        }

        if (item.isSingleEndType()) {
            const endChord = endNote.chord()
            endPos = GuitarBendLayout.notePosInSystem(endNote, endChord)

            const xOff = (isInside ? 0 : 0.5) * endNote.width() - horizontalIndent * endNote.mag()
            let yOff = upSign * verticalPadding * endNote.mag()
            if (!isInside) {
                yOff += upSign * 0.5 * endNote.height()
            }

            endPos = endPos.plus(new PointF(xOff, yOff))
        } else {
            const x = startSystem.endingXForOpenEndedLines()
            const y = startNote.y() + upSign * 0.5 * startNote.height() + 0.5 * heightDiff
            endPos = new PointF(x, y)
        }

        GuitarBendLayout.avoidBadStaffLineIntersection(item, startPos)
        GuitarBendLayout.avoidBadStaffLineIntersection(item, endPos)
        GuitarBendLayout.adjustX(item, startPos, endPos, startNote, endNote)

        if (bend.isDive() && bend.overlappingBendOrDive()) {
            const yOff = (up ? -1 : 1) * spatium
            startPos.setY(startPos.y() + yOff)
            endPos.setY(endPos.y() + yOff)
        }

        item.setPos(startPos)
        item.setPos2(endPos.minus(startPos))

        const vertexHeightMin = 0.75 * spatium
        const vertexHeightMax = 2.0 * spatium

        const relEndPoint = endPos.minus(startPos)
        const angle = -Math.atan(relEndPoint.y() / relEndPoint.x())

        const baseLength = relEndPoint.x()
        const minLength = spatium
        let vertexHeight = vertexHeightMin + 0.1 * (baseLength - minLength)
        vertexHeight = Math.min(vertexHeight, vertexHeightMax)

        let vertex = relEndPoint.times(0.5)
        const vertexDispl = new PointF(upSign * vertexHeight * Math.sin(angle), upSign * vertexHeight * Math.cos(angle))
        vertex = vertex.plus(vertexDispl)

        const vertexAbsCoord = vertex.plus(startPos)
        GuitarBendLayout.avoidBadStaffLineIntersection(item, vertexAbsCoord)
        vertex = vertexAbsCoord.minus(startPos)

        item.mutldata().vertexPoint = vertex

        if (item.isSingleBeginType()) {
            startNote.addStartLineAttachPoint(item.pos(), bend)
        }
        if (item.isSingleEndType()) {
            endNote.addEndLineAttachPoint(item.pos().plus(item.pos2()), bend)
        }

        const path = new PainterPath()
        path.lineTo(vertex.plus(item.vertexPointOff()))
        path.lineTo(item.pos2())
        item.mutldata().path = path

        const r = RectF.fromPoints(new PointF(0.0, 0.0), vertex.plus(item.vertexPointOff()))
        r.unite(RectF.fromPoints(vertex.plus(item.vertexPointOff()), item.pos2()))
        item.setbbox(r)
    }

    /** C++ note->pos() + chord->pos() + chord->segment()->pos() + chord->measure()->pos() */
    private static notePosInSystem(note: Note, chord: Chord): PointF {
        return note.pos().plus(chord.pos()).plus(chord.segment()!.pos()).plus(chord.measure().pos())
    }

    private static computeUp(item: GuitarBend): void {
        // NOTE: at some point, it would be good to find a way to reuse the logic of Tie::computeUp() (M.S.)

        const layoutData = item.mutldata()

        if (item.direction() !== DirectionV.AUTO) {
            layoutData.up = item.direction() === DirectionV.UP
            return
        }

        const measure = item.score().tick2measure(item.tick())
        if (!measure) {
            return
        }
        if (measure.hasVoices(item.staffIdx())) {
            layoutData.up = !!(item.track() % 2)
            return
        }

        const startN = item.startNote()!
        const startChord = startN.chord()
        const endN = item.endNote()!
        const endChord = endN.chord()

        if (startChord.up() !== endChord.up()) {
            layoutData.up = true
            return
        }

        if (startChord.notes().length === 1 && startChord.stem()) {
            layoutData.up = !startChord.up()
            return
        }

        if (endChord.notes().length === 1 && endChord.stem()) {
            layoutData.up = !endChord.up()
            return
        }

        let bendCount = 0
        let indexOfThis = 0
        for (const note of (startChord.notes().length > 1 ? startChord.notes() : endChord.notes())) {
            for (const spanner of note.spannerFor()) {
                if (spanner.isGuitarBend()) {
                    if (spanner === item) {
                        indexOfThis = bendCount
                    }
                    ++bendCount
                }
            }
        }

        const up = indexOfThis >= Math.floor(bendCount / 2)
        layoutData.up = up
    }

    private static computeIsInside(item: GuitarBend): void {
        const layoutData = item.mutldata()
        const startN = item.startNote()!
        const startChord = startN.chord()
        const endN = item.endNote()!
        const endChord = endN.chord()

        if (startChord.notes().length <= 2 || endChord.notes().length <= 2) {
            layoutData.isInside = false
            return
        }

        if (startN === startChord.upNote() || startN === startChord.downNote()
            || endN === endChord.upNote() || endN === endChord.downNote()) {
            layoutData.isInside = false
            return
        }

        layoutData.isInside = true
    }

    /** modifies point */
    private static avoidBadStaffLineIntersection(item: GuitarBendSegment, point: PointF): void {
        const upSign = item.guitarBend().ldata().up ? -1 : 1
        const spatium = item.spatium()
        const lineDist = spatium * item.staff()!.lineDistance(item.tick())
        const closestStaffLineY = lineDist * Math.round(point.y() / lineDist)

        const isInsideStaff = closestStaffLineY >= 0 && closestStaffLineY <= 4 * spatium
        if (isInsideStaff && item.autoplace()) {
            const minLineDist = 0.5 * item.style().styleMM(Sid.staffLineWidth) + 0.15 * spatium
            const pointLineDist = point.y() - closestStaffLineY
            if (Math.abs(pointLineDist) < minLineDist) {
                point.setY(closestStaffLineY + upSign * minLineDist)
            }
        }
    }

    /** modifies startPos and endPos */
    private static adjustX(item: GuitarBendSegment, startPos: PointF, endPos: PointF, startNote: Note, endNote: Note): void {
        const bend = item.guitarBend()
        const layoutData = bend.mutldata()
        const up = item.guitarBend().ldata().up
        const startChord = startNote.chord()
        const endChord = endNote.chord()

        const adjustStart = item.isSingleBeginType() && ((!!startChord.stem() && startChord.up() && up)
                                                         || (up && startNote !== startChord.upNote())
                                                         || (!up && startNote !== startChord.downNote()))
        const adjustEnd = item.isSingleEndType() && ((!!endChord.stem() && !endChord.up() && !up)
                                                     || (up && endNote !== endChord.upNote())
                                                     || (!up && endNote !== endChord.downNote()))

        if (!layoutData.isInside && !adjustStart && !adjustEnd) {
            return
        }

        const vertMargin = 0.1 * item.spatium()
        const padding = 0.2 * item.spatium()

        if (item.isSingleBeginType()) {
            const startChordShape = startChord.shape().translated(
                startChord.pos().plus(startChord.segment()!.pos()).plus(startChord.measure().pos()))
            let pointToClear = startChordShape.rightMostEdgeAtHeight(startPos.y() - vertMargin, startPos.y() + vertMargin)
            pointToClear += padding
            const resultingX = Math.max(startPos.x(), pointToClear)
            startPos.setX(resultingX)
        }

        if (item.isSingleEndType()) {
            const endChordShape = endChord.shape().translated(
                endChord.pos().plus(endChord.segment()!.pos()).plus(endChord.measure().pos()))
            let pointToClear = endChordShape.leftMostEdgeAtHeight(endPos.y() - vertMargin, endPos.y() + vertMargin)
            pointToClear -= padding
            const resultingX = Math.min(endPos.x(), pointToClear)
            endPos.setX(resultingX)
        }
    }

    private static layoutSlightBend(item: GuitarBendSegment, _ctx: LayoutContext): void {
        const bend = item.guitarBend()
        const startNote = bend.startNote()!

        const startChord = startNote.chord()
        const startNotePos = GuitarBendLayout.notePosInSystem(startNote, startChord)

        const spatium = item.spatium()
        const startPos = startNotePos.plus(new PointF(startNote.width() + 0.25 * spatium, -0.25 * spatium))
        const endPos = new PointF(1.25 * spatium, -1.0 * spatium)
        const curve = new PointF(endPos.x(), 0.0)

        item.setPos(startPos)
        item.setPos2(endPos)
        item.mutldata().vertexPoint = curve

        item.mutldata().setBbox(RectF.fromPoints(new PointF(), item.pos2()).normalized())

        const path = new PainterPath()
        path.cubicTo(new PointF(0.0, 0.0), curve.plus(item.vertexPointOff()), item.pos2())
        item.mutldata().path = path
    }

    private static checkConflictWithOtherBends(item: GuitarBendSegment): void {
        const thisBend = item.guitarBend()
        const startNote = thisBend.startNote()!
        const startChord = startNote.chord()

        let otherBend: GuitarBend | null = null
        for (const note of startChord.notes()) {
            if (note.string() >= startNote.string()) {
                continue
            }
            const bendFor = note.bendFor()
            if (bendFor) {
                otherBend = bendFor
                break
            }
        }

        if (!otherBend) {
            return
        }

        if (otherBend.ldata().bendDigit !== thisBend.ldata().bendDigit) {
            if (thisBend.bendType() !== GuitarBendType.PRE_BEND) {
                const ldata = item.mutldata()
                const spatium = item.spatium()
                const endPointMove = new PointF(spatium, spatium)
                item.setPos2(item.pos2().plus(endPointMove))
                ldata.arrow.translate(endPointMove)
                ldata.vertexPoint = ldata.vertexPoint.plus(new PointF(endPointMove.x(), 0.0))

                const text = item.bendText()
                text.mutldata().setPos(text.ldata().pos().plus(endPointMove).plus(new PointF(0.35 * text.width(), 0.0)))
            }
        }
    }

    static startOnEndNote(bend: GuitarBend): boolean {
        const bendT = bend.bendType()
        if (!(bendT === GuitarBendType.PRE_BEND || bendT === GuitarBendType.GRACE_NOTE_BEND || bendT === GuitarBendType.PRE_DIVE)) {
            return false
        }

        const preBendsAlignToGrace = bend.style().styleB(Sid.alignPreBendAndPreDiveToGraceNote)
        if (!preBendsAlignToGrace && (bendT === GuitarBendType.PRE_BEND || bendT === GuitarBendType.PRE_DIVE)) {
            return true
        }

        if (bendT === GuitarBendType.PRE_BEND || bendT === GuitarBendType.GRACE_NOTE_BEND) {
            const startChord = bend.startNote()!.chord()
            let bendsCount = 0
            for (const note of startChord.notes()) {
                if (note.bendFor()) {
                    ++bendsCount
                }
            }

            if (bendsCount < bend.endNote()!.chord().notes().length) {
                return true
            }
        }

        return false
    }

    static layoutTabStaff(item: GuitarBendSegment, ctx: LayoutContext): void {
        if (item.guitarBend().isDive()) {
            GuitarDiveLayout.layoutDiveTabStaff(item, ctx)
        } else {
            GuitarBendLayout.layoutBendTabStaff(item, ctx)
        }
    }

    private static layoutBendTabStaff(item: GuitarBendSegment, ctx: LayoutContext): void {
        const bend = item.guitarBend()
        const ldata = item.mutldata()

        const startNote = bend.startNote()
        const endNote = bend.endNote()
        if (!startNote || !endNote) {
            return
        }

        const spatium = bend.spatium()
        const style = item.style()
        const verticalPad = 0.25 * spatium
        const distAboveTab = style.styleD(Sid.guitarBendHeightAboveTABStaff) * spatium * item.staff()!.lineDistance(item.tick())
        const arrowWidth = style.styleMM(Sid.guitarBendArrowWidth)
        const arrowHeight = style.styleMM(Sid.guitarBendArrowHeight)
        const lineWidth = item.bendLineWidth()

        let startPos: PointF
        let endPos: PointF
        let arrow = new PolygonF()

        const prevBend = bend.findPrecedingBend()
        const prevBendSeg = prevBend && !prevBend.segmentsEmpty() && !prevBend.isFullRelease()
            ? prevBend.backSegment() as GuitarBendSegment : null
        const prevHoldLine = prevBend && prevBend.holdLine() && !prevBend.holdLine()!.segmentsEmpty()
                             && prevBend.endNote() !== bend.startNote()
            ? prevBend.holdLine()!.backSegment() as GuitarBendHoldSegment : null

        let prevEndPoint = new PointF(0.0, 0.0)
        if (prevHoldLine) {
            prevEndPoint = prevHoldLine.pos2().plus(prevHoldLine.pos())
        } else if (prevBendSeg) {
            const prevArrow = prevBendSeg.ldata().arrow
            if (prevArrow.length) {
                prevEndPoint = prevArrow[0].plus(prevBendSeg.pos())
                prevEndPoint = prevEndPoint.plus(new PointF(0.0, (prevBend!.isReleaseBend() ? -0.5 : 0.5) * lineWidth))
            }
        }

        if (item.isSingleBeginType() && bend.bendType() !== GuitarBendType.PRE_BEND && !prevEndPoint.isNull()) {
            startPos = prevEndPoint
        } else {
            startPos = GuitarBendLayout.computeStartPos(item, startNote, distAboveTab, verticalPad, arrowHeight)
        }

        endPos = GuitarBendLayout.computeEndPos(item, endNote, distAboveTab, verticalPad, arrowHeight, arrowWidth, startPos, prevEndPoint)
        endPos.setX(Math.max(startPos.x(), endPos.x())) // Edge case for ultra-ultra-narrow situations: ensure bend doesn't end before its start

        const vertex = bend.bendType() === GuitarBendType.PRE_BEND && !bend.angledPreBend()
            ? startPos.plus(endPos).times(0.5) : new PointF(endPos.x(), startPos.y())

        arrow = bend.isReleaseBend()
            ? PolygonF.fromPoints([new PointF(0, arrowHeight), new PointF(arrowWidth * 0.5, 0.0), new PointF(-arrowWidth * 0.5, 0.0)]) // arrow-down
            : PolygonF.fromPoints([new PointF(0, -arrowHeight), new PointF(arrowWidth * 0.5, 0.0), new PointF(-arrowWidth * 0.5, 0.0)]) // arrow-up

        if (bend.isReleaseBend() && !endNote.ghost()) {
            endNote.setGhost(true)
            endNote.mutldata().reset()
            TLayout.layoutChord(endNote.chord(), ctx)
        }

        if (GuitarBendLayout.startOnEndNote(bend)) {
            if (!startNote.overrideBendVisibilityRules()) {
                startNote.setVisible(false)
            }
            if (!endNote.overrideBendVisibilityRules()) {
                endNote.setVisible(true)
            }
        } else if (bend.bendType() !== GuitarBendType.SLIGHT_BEND
                   && (!style.styleB(Sid.showFretOnFullBendRelease) || !bend.isFullRelease())) {
            if (bend.bendType() === GuitarBendType.GRACE_NOTE_BEND || bend.bendType() === GuitarBendType.PRE_BEND) {
                if (!startNote.overrideBendVisibilityRules()) {
                    startNote.setVisible(true)
                }
            }
            if (!endNote.overrideBendVisibilityRules()) {
                endNote.setVisible(false)
            }
        }

        item.setPos(startPos)
        item.setPos2(endPos.minus(startPos))
        ldata.vertexPoint = vertex.minus(startPos)

        arrow.translate(item.pos2())
        ldata.arrow = arrow

        const guitarBendText = item.bendText()
        guitarBendText.setParent(item)
        guitarBendText.setXmlText(bend.ldata().bendDigit)
        TextLayout.layoutBaseTextBase(guitarBendText, ctx)
        const verticalTextPad = 0.2 * spatium
        const centering = new PointF(-0.5 * guitarBendText.width(),
            (bend.isReleaseBend() ? verticalTextPad : -(guitarBendText.height() + verticalTextPad)))
        guitarBendText.mutldata().setPos(arrow[0].plus(centering))

        GuitarBendLayout.checkConflictWithOtherBends(item)

        const path = new PainterPath()
        if (bend.angledPreBend()) {
            path.lineTo(ldata.vertexPoint.plus(item.vertexPointOff()))
            path.lineTo(item.pos2())
        } else {
            path.cubicTo(new PointF(0.0, 0.0), ldata.vertexPoint.plus(item.vertexPointOff()), item.pos2())
        }
        ldata.path = path

        let r: RectF
        if (RealIsNull(item.pos2().x())) {
            r = new RectF(-0.5 * lineWidth, 0.0, lineWidth, ldata.arrow[0].y())
        } else {
            r = RectF.fromPoints(new PointF(), new PointF(ldata.arrow[1].x(), ldata.arrow[0].y()))
        }
        item.mutldata().setBbox(r.normalized())
    }

    private static computeStartPos(item: GuitarBendSegment, startNote: Note, distAboveTab: number, verticalPad: number,
                                   arrowHeight: number): PointF {
        const bend = item.guitarBend()
        const startChord = startNote.chord()
        const startNotePos = GuitarBendLayout.notePosInSystem(startNote, startChord)

        const spatium = item.spatium()
        const lineWidth = item.bendLineWidth()
        const horizontalIndent = 0.25 * spatium
        const system = item.system()!

        let startPos = new PointF()

        if (GuitarBendLayout.startOnEndNote(bend)) {
            const endN = bend.endNote()!
            startPos = endN.systemPos()
            const endChord = endN.chord()
            const startFromTheSide = bend.bendType() === GuitarBendType.GRACE_NOTE_BEND
                                     || (endChord.notes().length > 1 && endN.string() > endChord.upString())
            if (startFromTheSide) {
                startPos = startPos.plus(new PointF(endN.width() + horizontalIndent, -0.5 * endN.height() + 0.5 * lineWidth))
            } else {
                startPos = startPos.plus(new PointF(0.5 * endN.width(), -0.5 * endN.height() - verticalPad))
            }
            return startPos
        }

        if (bend.bendType() === GuitarBendType.PRE_BEND) {
            startPos = startNote.systemPos()
            startPos = startPos.plus(new PointF(0.5 * startNote.width(), -0.5 * startNote.height() - verticalPad))
            return startPos
        }

        if (bend.isReleaseBend()) {
            if (item.isSingleBeginType()) {
                startPos.setX(startNotePos.x())
                startPos.setY(-distAboveTab - arrowHeight + 0.5 * lineWidth)
            } else {
                startPos.setX(system.firstNoteRestSegmentX(true))
                startPos.setY(-distAboveTab)
            }
            return startPos
        }

        if (item.isSingleBeginType()) {
            startPos = startNotePos
            startPos = startPos.plus(new PointF(startNote.width() + horizontalIndent, -0.5 * startNote.height() + 0.5 * lineWidth))
        } else {
            startPos.setX(system.firstNoteRestSegmentX(true))
            startPos.setY(0.5 * spatium)
        }

        return startPos
    }

    private static computeEndPos(item: GuitarBendSegment, endNote: Note, distAboveTab: number, verticalPad: number, arrowHeight: number,
                                 arrowWidth: number, startPos: PointF, prevEndPoint: PointF): PointF {
        const bend = item.guitarBend()
        const endChord = endNote.chord()
        const endNotePos = GuitarBendLayout.notePosInSystem(endNote, endChord)

        const style = item.style()
        const partialBendHeight = style.styleMM(Sid.guitarBendPartialBendHeight)
        const spatium = item.spatium()
        const system = item.system()!

        let endPos = new PointF()

        if (bend.bendType() === GuitarBendType.PRE_BEND && !bend.angledPreBend()) {
            endPos = new PointF(startPos.x(), -distAboveTab) // TODO: style
            return endPos
        }

        if (bend.isReleaseBend()) {
            if (item.isSingleEndType()) {
                endPos = endNotePos
                endPos = endPos.plus(new PointF(0.5 * endNote.width(), 0.0))
                if (bend.isFullRelease()) {
                    endPos.setY(endPos.y() - 0.5 * endNote.height() - arrowHeight - verticalPad)
                } else {
                    endPos.setY(startPos.y() + partialBendHeight)
                }
            } else {
                endPos.setX(system.endingXForOpenEndedLines() - 0.5 * arrowWidth)
                endPos.setY(-arrowHeight)
            }
            return endPos
        }

        if (bend.bendType() === GuitarBendType.SLIGHT_BEND) {
            const slightBendWidth = 1.25 * spatium
            endPos = startPos.plus(new PointF(slightBendWidth, 0.0))
        } else {
            if (item.isSingleEndType()) {
                endPos = endNotePos
                endPos = endPos.plus(new PointF(0.5 * endNote.width(), 0.0))
            } else {
                endPos.setX(system.endingXForOpenEndedLines() - 0.5 * arrowWidth)
            }
        }
        endPos = new PointF(endPos.x(), prevEndPoint.isNull() ? -distAboveTab : startPos.y() - partialBendHeight) // TODO: style
        endPos.setX(Math.max(endPos.x(), startPos.x() + 0.75 * spatium))

        return endPos
    }

    static layoutHoldLine(item: GuitarBendHoldSegment): void {
        if (!item.system()) {
            return
        }

        const startBend = item.guitarBendHold().guitarBend()
        if (!startBend || startBend.segmentsEmpty()) {
            return
        }

        const spatium = item.spatium()
        const lineWidth = item.bendLineWidth()

        let startPos = new PointF()
        const endPos = new PointF()

        const endNote = item.guitarBendHold().endNote()

        const endChord = endNote.chord()
        const endNotePos = GuitarBendLayout.notePosInSystem(endNote, endChord)

        let startBendSegment: GuitarBendSegment | null = null
        if (!startBend.isFullRelease() && !startBend.segmentsEmpty()) {
            startBendSegment = startBend.backSegment() as GuitarBendSegment
        } else {
            return
        }
        item.setStartBendSeg(startBendSegment)

        let endBendSegment: GuitarBendSegment | null = null
        if (item.isSingleEndType()) {
            const bend = endNote.bendFor()
            if (bend && bend !== startBend && !bend.segmentsEmpty()) {
                endBendSegment = bend.frontSegment() as GuitarBendSegment
            }
        }
        item.setEndBendSeg(endBendSegment)

        if (item.isSingleBeginType()) {
            startPos = startBendSegment.pos().plus(startBend.isDive() ? startBendSegment.pos2() : startBendSegment.ldata().arrow[0])
            if (!startBend.isDive()) {
                const gap = item.dashLength() * lineWidth
                startPos = startPos.plus(new PointF(gap, (startBend.isReleaseBend() ? -0.5 : +0.5) * lineWidth))
            }
        } else {
            startPos.setX(item.system()!.firstNoteRestSegmentX(true))
            startPos.setY(item.guitarBendHold().frontSegment().pos().y())
        }

        if (item.isSingleEndType()) {
            if (endBendSegment) {
                const endBend = endBendSegment.guitarBend()
                if (endBend.bendType() === GuitarBendType.PRE_DIVE || endBend.bendType() === GuitarBendType.PRE_BEND) {
                    const note = GuitarBendLayout.startOnEndNote(endBend) ? endBend.endNote()! : endBend.startNote()!
                    endPos.setX(note.systemPos().x() + 0.5 * note.ldata().bbox().width())
                } else {
                    endPos.setX(endNotePos.x())
                }
            } else {
                endPos.setX(endNotePos.x() + endNote.chord().segment()!.width() - 1.5 * spatium)
            }
        } else {
            endPos.setX(item.system()!.endingXForOpenEndedLines())
        }

        const minLen = spatium
        endPos.setX(Math.max(startPos.x() + minLen, endPos.x()))

        endPos.setY(startPos.y())

        item.setPos(startPos)
        item.setPos2(endPos.minus(startPos))

        if (startBend.dipVibratoType() !== VibratoType.NONE) {
            let symId = SymId.noSym
            switch (startBend.dipVibratoType()) {
            case VibratoType.GUITAR_VIBRATO:
                symId = SymId.guitarVibratoStroke
                break
            case VibratoType.GUITAR_VIBRATO_WIDE:
                symId = SymId.guitarWideVibratoStroke
                break
            default:
                symId = SymId.noSym
            }
            const lineLength = item.pos2().x()
            const symAdvance = item.symAdvance(symId)
            let symsCount = Math.floor(lineLength / symAdvance)
            symsCount = Math.max(symsCount, 1)
            item.mutldata().symIds = new Array<SymId>(symsCount).fill(symId)
            item.mutldata().moveY(0.5 * item.symHeight(symId))
            let bbox = item.symBbox(symId)
            for (let i = 1; i < item.ldata().symIds.length; ++i) {
                bbox = bbox.united(bbox.translated(new PointF(symAdvance, 0.0)))
            }
            item.mutldata().setBbox(bbox)
            return
        }

        const r = new RectF(0.0, -0.5 * lineWidth, item.pos2().x(), lineWidth)
        item.mutldata().setBbox(r)
    }
}
