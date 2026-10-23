/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/guitardivelayout.h/.cpp
 */

import { PainterPath } from '../../../framework/draw/types/painterpath'
import { PointF, RectF } from '../../../framework/draw/types/geometry'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { DirectionV, ElementType, GuitarBendType } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Shape } from '../../infrastructure/shape'
import type { GuitarBend, GuitarBendSegment } from '../../dom/guitarbend'
import type { LineSegment } from '../../dom/line'
import type { Note } from '../../dom/note'
import type { LayoutContext } from './layoutcontext'
import { HorizontalSpacing } from './horizontalspacing'
import { TextLayout } from './textlayout'
import { TLayout } from './tlayout'

export class GuitarDiveLayout {
    static updateDiveSequences(bends: readonly GuitarBend[], ctx: LayoutContext): void {
        const dives: GuitarBend[] = []
        for (const bend of bends) {
            if ((bend.bendType() === GuitarBendType.DIVE || bend.bendType() === GuitarBendType.PRE_DIVE) && bend.staffType()!.isTabStaff()) {
                dives.push(bend)
            }
        }

        for (const dive of dives) {
            dive.computeBendAmount()
            dive.mutldata().resetDiveLevels()
        }

        for (let ri = dives.length - 1; ri >= 0; --ri) {
            const dive = dives[ri]
            if (dive.ldata().diveLevels.size) {
                continue
            }

            // On-staff vs above-staff layout
            let tabPos = dive.diveTabPos()

            const diveLevels = new Set<number>()
            const diveSequence = new Set<GuitarBend>()

            diveLevels.add(dive.totBendAmountIncludingPrecedingBends())
            diveSequence.add(dive)

            // Consider dives part of the same sequence if they are directly connected
            // or if they are spanned by the same whammy bar line

            const whammyBar = dive.findOverlappingWhammyBar(dive.tick(), dive.tick2())
            if (whammyBar) {
                for (let ri2 = ri - 1; ri2 >= 0; --ri2) {
                    const earlierDive = dives[ri2]
                    if (earlierDive.tick().ge(whammyBar.tick())) {
                        diveLevels.add(earlierDive.totBendAmountIncludingPrecedingBends())
                        diveSequence.add(earlierDive)
                        if (earlierDive.diveTabPos() !== DirectionV.AUTO) {
                            tabPos = earlierDive.diveTabPos()
                        }
                    }
                }
            }

            let prevDive = dive.findPrecedingBend()
            while (prevDive) {
                diveLevels.add(prevDive.totBendAmountIncludingPrecedingBends())
                diveSequence.add(prevDive)
                if (prevDive.diveTabPos() !== DirectionV.AUTO) {
                    tabPos = prevDive.diveTabPos()
                }
                prevDive = prevDive.findPrecedingBend()
            }

            const layoutAboveStaff = tabPos === DirectionV.UP || (tabPos === DirectionV.AUTO && ctx.conf().styleB(Sid.guitarDivesAboveStaff))

            for (const d of diveSequence) {
                d.mutldata().diveLevels = new Set(diveLevels)
                d.mutldata().aboveStaff = layoutAboveStaff
            }
        }
    }

    static layoutDiveTabStaff(item: GuitarBendSegment, ctx: LayoutContext): void {
        const bend = item.guitarBend()
        if (bend.bendType() === GuitarBendType.DIP) {
            GuitarDiveLayout.layoutDip(item, ctx)
            return
        }
        if (bend.bendType() === GuitarBendType.SCOOP) {
            GuitarDiveLayout.layoutScoop(item)
            return
        }

        const ldata = item.mutldata()

        const startNote = bend.startNote()
        const endNote = bend.endNote()
        if (!startNote || !endNote) {
            return
        }

        const startChord = startNote.chord()
        const endChord = endNote.chord()
        if (startNote.string() !== startChord.upString() || endNote.string() !== endChord.upString()) {
            return // On TAB only one dive line can exist and only from the top note
        }

        if (bend.bendType() === GuitarBendType.PRE_DIVE) {
            const alignToGrace = ctx.conf().styleB(Sid.alignPreBendAndPreDiveToGraceNote)
            for (const note of startChord.notes()) {
                if (!note.overrideBendVisibilityRules()) {
                    note.setVisible(alignToGrace)
                }
            }
            for (const note of endChord.notes()) {
                if (!note.overrideBendVisibilityRules()) {
                    note.setVisible(!alignToGrace)
                }
            }
        } else if (bend.isFullReleaseDive() || item.isEndType()) {
            for (const note of endChord.notes()) {
                if (!note.overrideBendVisibilityRules()) {
                    note.setVisible(true)
                }
                note.setGhost(true)
                note.mutldata().reset()
            }
            TLayout.layoutChord(endNote.chord(), ctx)
        } else if (!bend.isFullReleaseDive() || !ctx.conf().styleB(Sid.showFretOnFullBendRelease)) {
            for (const note of endChord.notes()) {
                if (!note.overrideBendVisibilityRules()) {
                    note.setVisible(false)
                }
            }
        }

        const aboveStaff = bend.ldata().aboveStaff
        if (aboveStaff) {
            item.setPos(GuitarDiveLayout.computeStartPosAboveStaff(item, ctx))
            item.setPos2(GuitarDiveLayout.computeEndPosAboveStaff(item, ctx).minus(item.ldata().pos()))
        } else {
            item.setPos(GuitarDiveLayout.computeStartPosOnStaff(item, ctx))
            item.setPos2(GuitarDiveLayout.computeEndPosOnStaff(item, ctx).minus(item.ldata().pos()))
        }

        const bendText = item.bendText()
        if (item.isSingleEndType()) {
            bendText.setParent(item)
            bendText.setXmlText(bend.ldata().bendDigit)
            TextLayout.layoutBaseTextBase(bendText, ctx)
            const verticalTextPad = 0.35 * item.spatium()
            let bendTextPos = item.pos2()
            if (aboveStaff) {
                if (bend.bendType() === GuitarBendType.PRE_DIVE && bend.bendAmountInQuarterTones() < 0) {
                    bendTextPos = new PointF() // If predive is downwards the text must be above the start
                }
                bendTextPos = bendTextPos.plus(new PointF(-0.5 * bendText.width(), -bendText.height() - verticalTextPad))
            } else {
                bendTextPos = bendTextPos.plus(new PointF(-0.5 * bendText.width(),
                    item.pos().y() + item.pos2().y() > 0 ? verticalTextPad : -bendText.height() - verticalTextPad))
            }
            bendText.setPos(bendTextPos)
        } else {
            bendText.mutldata().reset()
        }

        const path = new PainterPath()
        if (bend.isSlack()) {
            const slackLineLen = 2 * item.spatium()
            const vertexPoint = item.pos2().minus(new PointF(0.5 * slackLineLen, 0.0))
            path.lineTo(vertexPoint)
            item.setPos2(item.pos2().plus(new PointF(0.5 * slackLineLen, 0.0)))
        }
        path.lineTo(item.pos2())
        ldata.path = path

        const lineWidth = item.bendLineWidth()
        const r = RectF.fromPoints(new PointF(), item.pos2()).normalized()
        if (RealIsNull(r.height())) {
            r.setHeight(lineWidth)
        }
        if (RealIsNull(r.width())) {
            r.setWidth(lineWidth)
        }
        item.mutldata().setBbox(r)
    }

    private static computeStartPosOnStaff(item: GuitarBendSegment, ctx: LayoutContext): PointF {
        const bend = item.guitarBend()

        if (bend.bendType() === GuitarBendType.PRE_DIVE) {
            let note = ctx.conf().styleB(Sid.alignPreBendAndPreDiveToGraceNote) ? bend.startNote()! : bend.endNote()!
            if (bend.bendAmountInQuarterTones() > 0) {
                note = note.chord().upNote()
            } else {
                note = note.chord().downNote()
            }
            let notePos = note.systemPos()
            const noteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(note)
            const verticalPadding = 0.25 * item.spatium()
            notePos = notePos.plus(new PointF(0.5 * noteBbox.width(), bend.bendAmountInQuarterTones() > 0
                ? noteBbox.top() - verticalPadding
                : noteBbox.bottom() + verticalPadding))
            return notePos
        }

        const prevSegment = GuitarDiveLayout.findPrevHoldOrBendSegment(item, /*excludeFullReleaseDive*/ true)
        if (prevSegment) {
            return prevSegment.pos().plus(prevSegment.pos2())
        }

        let startPos = new PointF()
        const startNote = bend.startNote()!
        const startNoteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(startNote)
        if (item.isSingleBeginType()) {
            startPos = startNote.systemPos()
            const horizontalIndent = 0.25 * item.spatium()
            startPos = startPos.plus(new PointF(startNoteBbox.right() + horizontalIndent,
                -0.5 * startNoteBbox.height() + 0.5 * item.bendLineWidth()))
        } else {
            startPos.setX(item.system()!.firstNoteRestSegmentX(true))
            startPos.setY(bend.frontSegment().ldata().pos().y() + bend.frontSegment().ipos2().y())
        }

        return startPos
    }

    private static computeEndPosOnStaff(item: GuitarBendSegment, _ctx: LayoutContext): PointF {
        const bend = item.guitarBend()
        const spatium = item.spatium()

        let x = 0.0
        if (item.isSingleEndType()) {
            const endNote = bend.endNote()!
            const endNotePos = endNote.systemPos()
            const endNoteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(endNote)

            if (bend.isFullReleaseDive()) {
                x = endNotePos.x() + endNoteBbox.left() - 0.25 * spatium
                const y = endNotePos.y() + endNoteBbox.top() + 0.5 * item.bendLineWidth()
                return new PointF(x, y)
            }

            x = bend.bendType() === GuitarBendType.PRE_DIVE ? item.pos().x() : endNotePos.x() + 0.5 * endNoteBbox.width()
        } else {
            x = item.system()!.endingXForOpenEndedLines()

            if (bend.isFullReleaseDive()) {
                /* Full release dives end at the same y as they started, so we can use the startNote's position
                 * here in the case that the segment is BEGIN type (bc its endNote hasn't been laid out yet) */
                const startNote = bend.startNote()!
                const startNotePos = startNote.systemPos()
                const startNoteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(startNote)
                const y = startNotePos.y() + startNoteBbox.top() + 0.5 * item.bendLineWidth()
                return new PointF(x, y)
            }
        }

        if (bend.bendType() === GuitarBendType.PRE_DIVE) {
            const prevSegment = GuitarDiveLayout.findPrevHoldOrBendSegment(item)
            if (prevSegment && prevSegment.isGuitarBendHoldSegment()) {
                const y = prevSegment.pos().y() + prevSegment.pos2().y()
                return new PointF(x, y)
            }
        }

        const diveLevel = bend.totBendAmountIncludingPrecedingBends()
        const aboveStaff = diveLevel > 0

        const staffType = item.staffType()
        if (!staffType) {
            return new PointF(x, 0.0)
        }
        const staffLines = staffType.lines()
        const lineDist = staffType.lineDistance().val() * spatium

        if (!item.isSingleEndType()) {
            const y = aboveStaff ? -lineDist : staffLines * lineDist
            return new PointF(x, y)
        }

        const diveLevels = [...bend.ldata().diveLevels].sort((a, b) => a - b)
        const diveLevelsInThisDirection: number[] = []
        for (const level of diveLevels) {
            if (aboveStaff && level > 0) {
                diveLevelsInThisDirection.push(level)
            } else if (!aboveStaff && level < 0) {
                diveLevelsInThisDirection.unshift(level)
            }
        }

        const levelNumber = diveLevelsInThisDirection.indexOf(diveLevel)
        if (levelNumber < 0) {
            return new PointF(x, 0.0)
        }

        const zeroDiveLevel = aboveStaff ? -1.5 * lineDist : lineDist * (staffLines + 0.5)
        const increment = spatium

        const y = zeroDiveLevel + (aboveStaff ? -1 : 1) * (increment * levelNumber)

        return new PointF(x, y)
    }

    private static computeStartPosAboveStaff(item: GuitarBendSegment, ctx: LayoutContext): PointF {
        const bend = item.guitarBend()

        const prevSegment = GuitarDiveLayout.findPrevHoldOrBendSegment(item)
        if (prevSegment) {
            return prevSegment.pos().plus(prevSegment.pos2())
        }

        const startPos = new PointF()

        if (item.isSingleBeginType()) {
            const note = bend.bendType() === GuitarBendType.PRE_BEND && !ctx.conf().styleB(Sid.alignPreBendAndPreDiveToGraceNote)
                ? bend.endNote()! : bend.startNote()!
            const noteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(note)
            startPos.setX(note.systemPos().x() + 0.5 * noteBbox.width())

            const staffType = item.staffType()
            if (!staffType) {
                startPos.setY(0.0)
            } else {
                const spatium = item.spatium()
                const lineDist = staffType.lineDistance().val() * spatium
                const baseLine = -1.5 * lineDist
                const increment = spatium
                const diveLevels = new Set(bend.mutldata().diveLevels)
                diveLevels.add(0) // Because for dives above the staff we need the zero level too
                const zeroLevel = [...diveLevels].sort((a, b) => a - b).indexOf(0)
                const totIncrement = increment * zeroLevel
                startPos.setY(baseLine - totIncrement)
            }
        } else {
            startPos.setX(item.system()!.firstNoteRestSegmentX(true))
            startPos.setY(bend.frontSegment().ldata().pos().y())
        }

        return startPos
    }

    private static computeEndPosAboveStaff(item: GuitarBendSegment, _ctx: LayoutContext): PointF {
        const bend = item.guitarBend()
        const spatium = item.spatium()

        let x = 0.0
        if (item.isSingleEndType()) {
            const endNote = bend.endNote()!
            const endNotePos = endNote.systemPos()
            const endNoteBbox = GuitarDiveLayout.getNoteAndParenthesesShape(endNote)
            x = bend.bendType() === GuitarBendType.PRE_DIVE
                ? item.pos().x() : endNotePos.x() + 0.5 * endNoteBbox.width()
        } else {
            x = item.system()!.endingXForOpenEndedLines()
        }

        if (bend.bendType() === GuitarBendType.PRE_DIVE) {
            const prevSegment = GuitarDiveLayout.findPrevHoldOrBendSegment(item)
            if (prevSegment && prevSegment.isGuitarBendHoldSegment()) {
                const y = prevSegment.pos().y() + prevSegment.pos2().y()
                return new PointF(x, y)
            }
        }

        const endingLevel = bend.totBendAmountIncludingPrecedingBends()
        const startingLevel = endingLevel - bend.bendAmountInQuarterTones()

        const diveLevelsSet = new Set(bend.ldata().diveLevels)
        diveLevelsSet.add(0) // Because for dives above the staff we need the zero level too
        const diveLevels = [...diveLevelsSet].sort((a, b) => a - b)

        const endingIdx = diveLevels.indexOf(endingLevel)
        const startingIdx = diveLevels.indexOf(startingLevel)
        if (endingIdx < 0 || startingIdx < 0 || endingIdx === startingIdx) {
            return new PointF(x, 0.0)
        }

        const steps = endingIdx - startingIdx
        const increment = spatium

        const y = item.ldata().pos().y() - steps * increment

        return new PointF(x, y)
    }

    private static findPrevHoldOrBendSegment(item: GuitarBendSegment, excludeFullReleaseDive = false): LineSegment | null {
        const bend = item.guitarBend()
        const prevBend = item.guitarBend().findPrecedingBend()
        if (!prevBend) {
            return null
        }

        const hold = prevBend.holdLine()
        if (hold && !hold.segmentsEmpty() && prevBend.endNote() !== bend.startNote() && hold.backSegment().system() === item.system()) {
            return hold.backSegment()
        }

        if (!prevBend.segmentsEmpty() && !(excludeFullReleaseDive && prevBend.isFullReleaseDive())
            && prevBend.backSegment().system() === item.system()) {
            return prevBend.backSegment()
        }

        return null
    }

    static layoutDip(item: GuitarBendSegment, ctx: LayoutContext): void {
        const bend = item.guitarBend()
        const startNote = bend.startNote()
        if (!startNote) {
            return
        }

        const notePos = startNote.systemPos()
        const centerX = notePos.x() + 0.5 * startNote.width()
        const spatium = item.spatium()
        const baseY = Math.min(-spatium, notePos.y() - 0.5 * startNote.height() - spatium)

        const vHeight = 2 * spatium
        const vWidth = 2 * spatium

        const upwards = bend.bendAmountInQuarterTones() > 0
        const start = new PointF(centerX - 0.5 * vWidth, upwards ? baseY : baseY - vHeight)
        const vertex = new PointF(centerX, upwards ? baseY - vHeight : baseY).minus(start)
        const end = new PointF(centerX + 0.5 * vWidth, upwards ? baseY : baseY - vHeight).minus(start)

        item.setPos(start)
        item.setPos2(end)

        const path = new PainterPath()
        path.lineTo(vertex)
        path.lineTo(end)
        item.mutldata().path = path

        const bbox = RectF.fromPoints(new PointF(), vertex).normalized().united(RectF.fromPoints(vertex, end).normalized())
        item.mutldata().setBbox(bbox)

        const bendText = item.bendText()
        bendText.setParent(item)
        bendText.setXmlText(bend.ldata().bendDigit)
        TextLayout.layoutBaseTextBase(bendText, ctx)
        const verticalTextPad = 0.35 * item.spatium()
        bendText.setPos(new PointF(vertex.x() - 0.5 * bendText.width(), bbox.top() - verticalTextPad - bendText.height()))
    }

    static layoutScoop(item: GuitarBendSegment): void {
        const bend = item.guitarBend()
        const startNote = bend.startNote()
        if (!startNote) {
            return
        }

        const scoopSym = SymId.guitarVibratoBarScoop
        const bbox = item.symBbox(scoopSym)
        item.setbbox(bbox)

        const pos = startNote.systemPos()
        const spatium = item.spatium()
        const leftPad = 0.25 * spatium
        const downPad = 0.35 * spatium

        let yMove = bbox.height()
        if (item.staffType() && item.staffType()!.isTabStaff()) {
            yMove -= 0.5 * startNote.height()
        } else {
            yMove += startNote.line() % 2 ? 0.0 : downPad
        }

        const chordShape = startNote.chord().shape().clone()
        chordShape.removeTypes(new Set([ElementType.GUITAR_BEND, ElementType.GUITAR_BEND_SEGMENT, ElementType.BEAM]))

        const xMove = -HorizontalSpacing.minHorizontalDistance(new Shape(bbox.translated(0.0, startNote.y())), chordShape, spatium) - leftPad

        startNote.chord().segment()!.staffShape(startNote.staffIdx()).add(bbox.translated(xMove, yMove + startNote.y()))

        item.setPos(pos.plus(new PointF(xMove, yMove)))
        item.setPos2(new PointF())
    }

    static getNoteAndParenthesesShape(note: Note): RectF {
        const parenInfo = note.parenthesisInfo()
        const noteBbox = note.ldata().bbox().clone()

        if (!parenInfo) {
            return noteBbox
        }

        const leftParen = parenInfo.leftParen()
        const rightParen = parenInfo.rightParen()

        noteBbox.unite(leftParen.ldata().bbox().translated(leftParen.pos().minus(note.pos())))
        noteBbox.unite(rightParen.ldata().bbox().translated(rightParen.pos().minus(note.pos())))

        return noteBbox
    }
}
