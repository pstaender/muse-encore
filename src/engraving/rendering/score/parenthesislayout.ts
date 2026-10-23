/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/parenthesislayout.h/.cpp
 * TODO(port): note parentheses on chords (NoteParenthesisInfo, layoutChordParentheses, setChordValues)
 */

import { PointF, RectF, SizeF } from '../../../framework/draw/types/geometry'
import { PainterPath } from '../../../framework/draw/types/painterpath'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { RealIsNull } from '../../../framework/global/realfn'
import { SymId } from '../../types/symid'
import { DirectionH, ElementType, TimeSigPlacement } from '../../types/types'
import { Fraction } from '../../types/fraction'
import { Sid } from '../../style/styledef'
import { Shape, ShapeType } from '../../infrastructure/shape'
import { CubicBezier } from '../../dom/slurtie'
import type { Chord } from '../../dom/chord'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Harmony } from '../../dom/harmony'
import { TextSegment } from '../../dom/harmony'
import type { Note } from '../../dom/note'
import type { Parenthesis, ParenthesisLayoutData } from '../../dom/parenthesis'
import type { TimeSig } from '../../dom/timesig'
import { ParenPaddingTable } from '../paddingtable'
import type { LayoutContext } from './layoutcontext'
import { HorizontalSpacing } from './horizontalspacing'

const maxMidPointThicknessSpRatio = 0.2

export class ParenthesisLayout {
    /** Layout parentheses surrounding an engraving item. Handle padding and placement */
    static layoutParentheses(parent: EngravingItem, ctx: LayoutContext): void {
        const leftParen = parent.leftParen() as Parenthesis | null
        const rightParen = parent.rightParen() as Parenthesis | null

        if (!(leftParen || rightParen)) {
            return
        }

        if (leftParen) {
            ParenthesisLayout.layoutParenthesis(leftParen, ctx)
        }

        if (rightParen) {
            ParenthesisLayout.layoutParenthesis(rightParen, ctx)
        }

        const itemAddToSkyline = parent.autoplace() && !parent.ldata().isSkipDraw()
        const dummyItemShape = ParenthesisLayout.getParentShape(parent)

        ParenthesisLayout.layoutParenthesesPair(leftParen, rightParen, dummyItemShape, itemAddToSkyline)
    }

    static layoutChordParentheses(chord: Chord, ctx: LayoutContext): void {
        for (const parenNotesInfo of chord.noteParentheses()) {
            const leftParen = parenNotesInfo.leftParen()
            const rightParen = parenNotesInfo.rightParen()

            if (!(leftParen || rightParen)) {
                return
            }
            if (leftParen) {
                ParenthesisLayout.layoutParenthesis(leftParen, ctx)
            }

            if (rightParen) {
                ParenthesisLayout.layoutParenthesis(rightParen, ctx)
            }

            const itemAddToSkyline = chord.autoplace() && !chord.ldata().isSkipDraw()
            const dummyItemShape = ParenthesisLayout.getParentShape(chord)

            ParenthesisLayout.layoutParenthesesPair(leftParen, rightParen, dummyItemShape, itemAddToSkyline)
        }
    }

    /** C++ layoutParentheses(Parenthesis*, Parenthesis*, Shape&, bool, ctx) */
    private static layoutParenthesesPair(leftParen: Parenthesis | null, rightParen: Parenthesis | null, dummyItemShape: Shape,
        itemAddToSkyline: boolean): void {
        if (!leftParen || !rightParen) {
            // 1 parenthesis
            const paren = (leftParen ? leftParen : rightParen)!
            const ldata = paren.mutldata()
            const leftBracket = paren.direction() === DirectionH.LEFT
            let minDist = 0.0
            if (!leftBracket && itemAddToSkyline) {
                // Space against existing item shape
                minDist = HorizontalSpacing.minHorizontalDistance(dummyItemShape, paren.shape().translated(ldata.pos()), paren.spatium())
            } else if (itemAddToSkyline) {
                // Space following item shape against this
                minDist = -HorizontalSpacing.minHorizontalDistance(paren.shape().translated(ldata.pos()), dummyItemShape, paren.spatium())
            }
            paren.mutldata().moveX(minDist)
            return
        }

        // 2 parentheses
        if (!itemAddToSkyline) {
            return
        }

        const leftLdata = leftParen.mutldata()
        const rightLdata = rightParen.mutldata()

        const itemLeftX = dummyItemShape.bbox().x()
        const parentWidth = dummyItemShape.bbox().width()
        const itemRightX = itemLeftX + parentWidth

        const leftParenPadding = HorizontalSpacing.minHorizontalDistance(leftParen.shape().translated(leftLdata.pos()),
            dummyItemShape, leftParen.spatium())
        leftLdata.moveX(-leftParenPadding)

        dummyItemShape.add(leftParen.shape().translate(leftLdata.pos().plus(leftParen.staffOffset())))

        const rightParenPadding = HorizontalSpacing.minHorizontalDistance(dummyItemShape, rightParen.shape().translated(
            rightLdata.pos()), rightParen.spatium())
        rightLdata.moveX(rightParenPadding)

        // If the right parenthesis has been padded against the left parenthesis, this means the parenthesis -> parenthesis padding distance
        // is larger than the width of the item the parentheses surrounds. In this case, the result is visually unbalanced.  Move both parens
        // to the left (relative to the segment) in order to centre the item: (b  ) -> ( b )
        const itemWidth = parentWidth
        let parenPadding = ParenthesisLayout.computeInternalParenthesisPadding(leftParen, rightParen)
        parenPadding *= (leftParen.ldata().mag() + rightParen.ldata().mag()) / 2
        if (itemWidth >= parenPadding) {
            return
        }

        // Move parentheses to place item in the middle
        const leftParenX = leftLdata.pos().x() + leftParen.ldata().bbox().x() + leftParen.ldata().midPointThickness
        const rightParenX = rightLdata.pos().x() + rightParen.ldata().bbox().x() + rightParen.width()
                            - rightParen.ldata().midPointThickness
        const leftParenToItem = itemLeftX - leftParenX
        const itemToRightParen = rightParenX - itemRightX
        const parenToItemDist = (leftParenToItem + itemToRightParen) / 2
        leftLdata.moveX(-(parenToItemDist - leftParenToItem))
        rightLdata.moveX(-(itemToRightParen - parenToItemDist))
    }

    static layoutParenthesis(item: Parenthesis, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ParenthesisLayout.setLayoutValues(item, ldata, ctx)

        if (ldata.symId === SymId.noSym) {
            ParenthesisLayout.createPathAndShape(item, ldata)
        } else {
            ParenthesisLayout.createSmuflShape(item, ldata)
        }
    }

    private static isInternalParenPadding(item1: EngravingItem, item2: EngravingItem): boolean {
        const chord1 = item1.findAncestor(ElementType.CHORD) as Chord | null
        const chord2 = item2.findAncestor(ElementType.CHORD) as Chord | null
        const parent1 = item1.parentItem()
        const parent2 = item2.parentItem()
        const internalPadding = (item1.isParenthesis() && parent1 === item2)
                                || (item2.isParenthesis() && parent2 === item1)
                                || parent1 === parent2
                                || (!!chord1 && !!chord2 && chord1 === chord2)
        return internalPadding
    }

    private static computeExternalParenthesisPadding(item1: EngravingItem, item2: EngravingItem): number {
        const parent = item1.isParenthesis() ? item1.parentItem()! : item2.parentItem()!
        const type1 = item1.type()
        const type2 = item2.type()

        const paddingTable = ParenPaddingTable.getPaddingTable(parent)
        let padding = paddingTable.padding(type1, type2)
        const scaling = (item1.mag() + item2.mag()) / 2
        padding *= scaling

        return padding
    }

    static computeParenthesisPadding(item1: EngravingItem, item2: EngravingItem): number {
        if (ParenthesisLayout.isInternalParenPadding(item1, item2)) {
            return ParenthesisLayout.computeInternalParenthesisPadding(item1, item2)
        }

        return ParenthesisLayout.computeExternalParenthesisPadding(item1, item2)
    }

    private static computeInternalParenthesisPadding(item1: EngravingItem, item2: EngravingItem): number {
        const parenFirst = item1.isParenthesis()
        const other = item1.isParenthesis() ? item2 : item1
        const spatium = item1.style().spatium()

        let padding = 0.0
        switch (other.type()) {
        case ElementType.NOTE:
            if (item1.staffType() && item1.staffType()!.isTabStaff()) {
                padding = item1.style().styleS(Sid.tabFretPadding).val() * spatium
            } else {
                padding = 0.3 * spatium
            }
            break
        case ElementType.ARTICULATION:
        case ElementType.ACCIDENTAL:
        case ElementType.STEM:
            padding = 0.3 * spatium
            break
        case ElementType.NOTEDOT:
            padding = 0.15 * spatium
            break
        case ElementType.LEDGER_LINE:
            padding = 0.3 * spatium
            break
        case ElementType.HOOK:
            padding = 0.3 * spatium
            break
        case ElementType.KEYSIG:
            padding = (parenFirst ? 0.35 : 0.25) * spatium
            break
        case ElementType.TIMESIG:
            padding = (parenFirst ? 0.2 : 0.25) * spatium
            break
        case ElementType.CLEF:
            padding = (parenFirst ? 0.2 : 0.25) * spatium
            break
        case ElementType.HARMONY:
            padding = 0.2 * spatium
            break
        case ElementType.PARENTHESIS:
            padding = spatium
            break
        default:
            padding = 0.1 * spatium
            break
        }

        const scaling = (item1.mag() + item2.mag()) / 2
        padding *= scaling

        return padding
    }

    static createPathAndShape(item: Parenthesis, ldata: ParenthesisLayoutData): void {
        const spatium = item.spatium()
        const leftBracket = item.direction() === DirectionH.LEFT
        const startY = ldata.startY
        const height = ldata.height
        const xPos = ldata.pos().x()
        const mag = ldata.mag()
        const maxMidPointThickness = maxMidPointThicknessSpRatio * spatium
        const midPointThickness = Math.min(ldata.midPointThickness, maxMidPointThickness)
        const heightInSpatium = height / spatium
        const shoulderYOffset = 0.2 * height

        if (!Number.isFinite(height)) {
            return // Error: parenthesis height is infinite
        }

        // Control width of parentheses. We don't want tall parens to be too wide, nor do we want parens at a small scale to lose their curve too much
        let shoulderX = !RealIsNull(ldata.shoulderWidth) ? ldata.shoulderWidth : 0.2 * Math.pow(height, 0.95) * Math.pow(mag, 0.1)
        const minShoulderX = 0.25 * spatium * ldata.intrinsicMag
        shoulderX = Math.max(shoulderX, minShoulderX)

        const start = new PointF(xPos, startY)
        const end = new PointF(xPos, start.y() + height)
        const endNormalised = end.minus(start)

        const direction = leftBracket ? -1 : 1
        const shoulderForX = direction * shoulderX + midPointThickness * direction
        const shoulderBackX = direction * shoulderX + midPointThickness * direction * -1

        const bezier1for = new PointF(shoulderForX, shoulderYOffset)
        const bezier2for = new PointF(shoulderForX, endNormalised.y() - shoulderYOffset)
        const bezier1back = new PointF(shoulderBackX, endNormalised.y() - shoulderYOffset)
        const bezier2back = new PointF(shoulderBackX, shoulderYOffset)

        const path = new PainterPath()
        path.moveTo(new PointF())
        path.cubicTo(bezier1for, bezier2for, endNormalised)
        path.cubicTo(bezier1back, bezier2back, new PointF())

        ldata.path = path

        // Fill shape
        const shape = new Shape(undefined, undefined, ShapeType.Composite)
        let startPoint = new PointF()
        const midThickness = 2 * midPointThickness
        let nbShapes = Math.round(2.0 * heightInSpatium)
        nbShapes = Math.min(Math.max(nbShapes, 3), 10)
        const bezier1mid = bezier1for.minus(new PointF(midPointThickness * direction, 0.0))
        const bezier2mid = bezier2for.minus(new PointF(midPointThickness * direction, 0.0))
        const b = new CubicBezier(startPoint, bezier1mid, bezier2mid, endNormalised)
        for (let i = 1; i <= nbShapes; i++) {
            const percent = Math.pow(Math.sin(0.5 * Math.PI * (i / nbShapes)), 2)
            const point = b.pointAtPercent(percent)
            const re = RectF.fromPoints(startPoint, point).normalized()
            const approxThicknessAtPercent = (1 - 2 * Math.abs(0.5 - percent)) * midThickness
            if (re.width() < approxThicknessAtPercent) {
                const adjust = (approxThicknessAtPercent - re.width()) * 0.5
                re.adjust(-adjust, 0.0, adjust, 0.0)
            }
            shape.add(re, item)
            startPoint = point
        }

        ldata.setShape(shape)
        item.setPos(start)
    }

    static createSmuflShape(item: Parenthesis, ldata: ParenthesisLayoutData): void {
        const bbox = new Shape(item.symBbox(ldata.symId), item)
        const scale = item.ldata().symScale
        bbox.scale(new SizeF(scale, scale))
        ldata.setShape(bbox)
    }

    private static setLayoutValues(item: Parenthesis, ldata: ParenthesisLayoutData, ctx: LayoutContext): void {
        if (!item.parentItem()) {
            return
        }

        ldata.setPos(new PointF())
        ldata.reset()
        ldata.path = new PainterPath()
        ldata.symId = SymId.noSym

        // Set ldata values based on parent
        switch (item.parentItem()!.type()) {
        case ElementType.CHORD:
            ParenthesisLayout.setChordValues(item, ldata)
            break
        // height & startY are set in MeasureLayout for clef, timesig and keysig
        // TODO: create generic way of matching height & startY between parentheses on different items
        case ElementType.CLEF:
            ParenthesisLayout.setClefValues(item, ldata)
            break
        case ElementType.TIMESIG:
            ParenthesisLayout.setTimeSigValues(item, ldata, ctx)
            break
        case ElementType.KEYSIG:
            break
        case ElementType.HARMONY:
            ParenthesisLayout.setHarmonyValues(item, ldata, ctx)
            break
        default:
            ParenthesisLayout.setDefaultValues(item, ldata)
            break
        }
    }

    private static setClefValues(item: Parenthesis, ldata: ParenthesisLayoutData): void {
        const parent = item.parentItem()!
        const tick = parent.tick()
        const measure = item.findMeasure()
        let offset = -parent.pos().y()

        if (!measure || !tick.eq(measure.endTick())) {
            ldata.startY += offset
            return
        }

        const spatium = item.spatium()
        const staff = parent.staff()!
        const tickPrev = tick.minus(Fraction.eps())
        const st = staff.staffType(tick)
        const stPrev = !tickPrev.negative() ? item.staff()!.staffType(tickPrev) : null
        offset += (st.yoffset().val() - (stPrev ? stPrev.yoffset().val() : 0)) * spatium
        ldata.startY += offset
    }

    private static setTimeSigValues(item: Parenthesis, ldata: ParenthesisLayoutData, ctx: LayoutContext): void {
        const parentTs = item.parentItem() as TimeSig
        if ((ctx.conf().styleV(Sid.timeSigPlacement) as TimeSigPlacement) === TimeSigPlacement.NORMAL) {
            return
        }
        const yOffset = -parentTs.pos().y()
        ldata.startY += yOffset
    }

    private static setHarmonyValues(item: Parenthesis, ldata: ParenthesisLayoutData, ctx: LayoutContext): void {
        const spatium = item.spatium()
        const parent = item.parentItem() as Harmony
        const bbox = parent.ldata().bbox()
        const endPointThickness = 0.03
        const extension = 0.1 * spatium * (parent.size() / 10.0)

        const bottom = parent.baseLine() + extension
        const defaultCapHeight = new FontMetrics(parent.font()).capHeight()
        let topCapHeight = Number.MAX_VALUE
        let rootTextSeg: TextSegment | null = null
        const renderItemList = parent.ldata().renderItemList
        if (renderItemList.length) {
            for (const renderItem of renderItemList) {
                if (renderItem instanceof TextSegment) {
                    topCapHeight = Math.min(topCapHeight, renderItem.pos().y() - renderItem.capHeight())
                    rootTextSeg = !rootTextSeg ? renderItem : rootTextSeg
                }
            }
        } else {
            topCapHeight = defaultCapHeight
        }

        const top = topCapHeight - extension
        const height = bottom - top

        if (ctx.conf().styleB(Sid.harmonyParenUseSmuflSym)) {
            ldata.symId = item.direction() === DirectionH.LEFT ? SymId.csymParensLeftTall : SymId.csymParensRightTall
            const symHeight = item.symHeight(ldata.symId)
            ldata.symScale = height / symHeight
            return
        }

        const rootCapHeight = rootTextSeg ? rootTextSeg.capHeight() : defaultCapHeight
        const scale = (height - 2 * extension) / rootCapHeight

        ldata.setMag(parent.mag())
        ldata.startY = top
        ldata.height = height
        const HEIGHT_TO_WIDTH_RATIO = 20
        ldata.midPointThickness = ldata.height / HEIGHT_TO_WIDTH_RATIO * ldata.mag() * 1 / Math.sqrt(scale)
        ldata.endPointThickness = endPointThickness
        const shoulder = 0.2 * ldata.height * Math.pow(ldata.mag(), 0.1) * 1 / Math.sqrt(scale)
        ldata.shoulderWidth = shoulder

        const PADDING = spatium * 0.2
        ldata.setPosX(item.direction() === DirectionH.RIGHT ? bbox.right() + PADDING : bbox.left() - PADDING)
    }

    private static setChordValues(item: Parenthesis, ldata: ParenthesisLayoutData): void {
        const chord = item.parentItem() as Chord

        ldata.setMag(chord.mag())
        ldata.intrinsicMag = chord.intrinsicMag() // Scaling information not linked to staff size. item->spatium is NOT scaled by this

        const notesShape = new Shape()

        const parenInfo = chord.findNoteParenthesisInfo(item)
        if (!parenInfo) {
            return
        }

        for (const note of parenInfo.notes()) {
            notesShape.add(ParenthesisLayout.getNoteShape(note, item).translated(note.pos()))
        }

        const st = chord.staffType()!
        const isTab = st.isTabStaff()

        const calculateMidPointThickness = (): number => {
            const sp = item.spatium()
            const sp0 = item.defaultSpatium()

            if (!(sp > 0.0 && sp0 > 0.0)) {
                return 0.0
            }

            const exponent = isTab ? 0.36 : 0.33
            const exponentComplement = 1.0 - exponent

            const normalizedHeight = ldata.height / sp

            // Scale factor that keeps the normalized formula compatible with the
            // original formula at the default spatium.
            const scaleNormalization = sp / Math.pow(sp0, exponentComplement)
            return Math.pow(normalizedHeight, exponent) * scaleNormalization * ldata.intrinsicMag
        }

        if (isTab) {
            ldata.startY = notesShape.top()
            ldata.height = notesShape.bbox().height()
        } else {
            ldata.startY = notesShape.top() - 0.25 * item.spatium() * ldata.intrinsicMag
            ldata.height = notesShape.bbox().height() + 0.5 * item.spatium() * ldata.intrinsicMag
        }
        ldata.midPointThickness = calculateMidPointThickness()
        ldata.endPointThickness = 0.05
    }

    private static setDefaultValues(item: Parenthesis, ldata: ParenthesisLayoutData): void {
        const spatium = item.spatium()
        const parent = item.parentItem()!
        const bbox = parent.ldata().bbox()

        ldata.setMag(parent.mag())
        ldata.startY = bbox.top() - 0.25 * spatium
        ldata.height = bbox.height() + 0.5 * spatium
        ldata.midPointThickness = ldata.height / 60 * ldata.mag() // 0.1sp for a height of 6sp

        const PADDING = spatium * 0.2
        ldata.setPosX(item.direction() === DirectionH.RIGHT ? bbox.right() + PADDING : bbox.left() - PADDING)
    }

    private static getParentShape(parent: EngravingItem): Shape {
        const parentShape = parent.shape().clone()
        const isChord = parent.isChord()
        parentShape.remove_if((s) => {
            const it = s.item()
            return !it || it.isParenthesis()
                   || (it.isLaissezVibSegment() && isChord)
                   || (it.isHook() && isChord)
                   || (it.isStem() && isChord)
                   || (it.isArpeggio() && isChord)
                   || (it.isChordBracket() && isChord)
        })
        return parentShape
    }

    static getNoteShape(note: Note, paren: Parenthesis): Shape {
        const noteShape = note.shape().clone()
        noteShape.remove_if((s) => {
            const it = s.item()
            return it === paren || !!it && (it.isBend() || it.isParenthesis() || it.isAccidental() || it.isNoteDot()
                                            || it.isLaissezVibSegment())
        })
        return noteShape
    }
}
