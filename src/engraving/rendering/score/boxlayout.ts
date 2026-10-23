/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/boxlayout.h/.cpp
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { AlignH, DPMM, ElementType } from '../../types/types'
import { RealIsNull } from '../../../framework/global/realfn'
import { Pid } from '../../dom/property'
import type { Box, FBox, HBox, TBox, VBox } from '../../dom/box'
import type { FretDiagram } from '../../dom/fret'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { HarmonyLayout } from './harmonylayout'
import { SegmentType } from '../../dom/segment'
import { HarmonyType, type Harmony } from '../../dom/harmony'

export class BoxLayout {
    static layoutBox(item: Box, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.HBOX:
            BoxLayout.layoutHBox(item as HBox, ctx)
            break
        case ElementType.VBOX:
            BoxLayout.layoutVBox(item as VBox, ctx)
            break
        case ElementType.FBOX:
            BoxLayout.layoutFBox(item as FBox, ctx)
            break
        case ElementType.TBOX:
            BoxLayout.layoutTBox(item as TBox, ctx)
            break
        default:
            break
        }
    }

    static layoutBaseBox(item: Box, ctx: LayoutContext): void {
        TLayout.layoutBaseMeasureBase(item, ctx)
    }

    static layoutHBox(item: HBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const parent = item.explicitParent()
        if (parent && parent.isVBox()) {
            const parentVBox = parent as unknown as VBox
            const x = parentVBox.leftMargin() * DPMM
            const y = parentVBox.topMargin() * DPMM
            const w = item.absoluteFromSpatium(item.boxWidth())
            const h = parentVBox.ldata().bbox().height() - (parentVBox.topMargin() + parentVBox.bottomMargin()) * DPMM
            ldata.setPos(x, y)
            ldata.setBbox(0.0, 0.0, w, h)
        } else if (item.system()) {
            const parentSystem = item.system()!
            if (!ldata.isSetPos()) {
                ldata.setPos(new PointF())
            }
            ldata.setBbox(item.absoluteFromSpatium(item.topGap()), 0.0, item.absoluteFromSpatium(item.boxWidth()),
                          parentSystem.ldata().bbox().height())
        } else {
            ldata.setPos(new PointF())
            ldata.setBbox(0.0, 0.0, 50, 50)
        }
        BoxLayout.layoutBaseBox(item, ctx)
    }

    static layoutHBox2(item: HBox, ctx: LayoutContext): void {
        BoxLayout.layoutBaseBox(item, ctx)
    }

    static layoutVBox(item: VBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.setPos(new PointF())

        if (item.system()) {
            const parentSystem = item.system()!
            ldata.setBbox(0.0, 0.0, parentSystem.ldata().bbox().width(), item.absoluteFromSpatium(item.boxHeight()))
        } else {
            ldata.setBbox(0.0, 0.0, 50, 50)
        }

        for (const e of item.el()) {
            TLayout.layoutItem(e, ctx)
        }

        const boxAutoSize = item.getProperty(Pid.BOX_AUTOSIZE) as boolean
        let heightChanged = false
        if (boxAutoSize) {
            let contentHeight = item.contentRect().height()

            if (contentHeight < item.minHeight()) {
                contentHeight = item.minHeight()
            }

            ldata.setHeight(contentHeight)
            heightChanged = true
        }

        // MScore::noImages is false

        if (heightChanged) {
            for (const e of item.el()) {
                TLayout.layoutItem(e, ctx)
            }
        }
    }

    static layoutFBox(item: FBox, ctx: LayoutContext): void {
        const score = item.score()

        if (item.needsRebuild()) {
            for (const element of item.el()) {
                if (!element || !element.isFretDiagram()) {
                    continue
                }

                const diagram = element as FretDiagram
                //! NOTE: We need to layout the diagrams to get the harmony names to show in the UI
                TLayout.layoutItem(diagram, ctx)
                if (!diagram.visible()) {
                    //! but we don't need to draw them, so let's add a skip
                    diagram.mutldata().setIsSkipDraw(true)
                    diagram.harmony()!.mutldata().setIsSkipDraw(true)
                    continue
                }
            }

            /// FBox::init requires all chord symbols in the score have valid ldata
            /// Perform layout
            for (let segment = score.firstSegment(SegmentType.ChordRest); segment; segment = segment.next1(SegmentType.ChordRest)) {
                for (const segItem of segment.annotations()) {
                    if (!segItem || !segItem.part()) {
                        continue
                    }
                    if (!(segItem.isHarmony() || segItem.isFretDiagram())) {
                        continue
                    }

                    const harmony = segItem.isHarmony() ? segItem as Harmony : (segItem as FretDiagram).harmony()
                    if (!harmony || harmony.harmonyType() !== HarmonyType.STANDARD || harmony.ldata().isValid()) {
                        continue
                    }

                    HarmonyLayout.layoutHarmony(harmony, ctx)
                }
            }

            item.init()
            item.setNeedsRebuild(false)
        }

        const ldata = item.mutldata()
        ldata.setPos(new PointF())

        const fretDiagrams: FretDiagram[] = []
        for (const element of item.el()) {
            if (!element || !element.isFretDiagram() || !element.visible()) {
                continue
            }

            fretDiagrams.push(element as FretDiagram)
        }

        //! NOTE: layout fret diagrams and calculate sizes

        const totalDiagrams = fretDiagrams.length
        let maxFretDiagramWidth = 0.0

        for (let i = 0; i < totalDiagrams; ++i) {
            const fretDiagram = fretDiagrams[i]
            fretDiagram.setUserMag(item.diagramScale())

            const harmony = fretDiagram.harmony()!
            harmony.mutldata().setMag(item.textScale())

            TLayout.layoutItem(fretDiagram, ctx)

            fretDiagram.mutldata().setIsSkipDraw(false)
            harmony.mutldata().setIsSkipDraw(false)

            const width = fretDiagram.ldata().bbox().width()
            maxFretDiagramWidth = Math.max(maxFretDiagramWidth, width)
        }

        //! NOTE: table view layout

        const spatium = item.spatium()
        const chordsPerRow = item.chordsPerRow()
        const rowGap = item.rowGap().val() * spatium
        const columnGap = item.columnGap().val() * spatium

        //! The height of each row is determined by the height of the tallest cell in that row
        const rowHeights: number[] = []
        const harmonyHeights: number[] = []
        const harmonyBaselines: number[] = []
        for (let i = 0; i < totalDiagrams; i += chordsPerRow) {
            const itemsInRow = Math.min(chordsPerRow, totalDiagrams - i)
            let maxRowHeight = 0.0
            let maxHarmonyHeight = 0.0
            let harmonyBaseline = 0.0

            for (let j = 0; j < itemsInRow; ++j) {
                const fretDiagram = fretDiagrams[i + j]

                const fretRect = fretDiagram.ldata().bbox()

                const harmonyLdata = fretDiagram.harmony()!.ldata()
                const harmonyRect = harmonyLdata.bbox().translated(harmonyLdata.pos())

                const height = fretRect.united(harmonyRect).height()
                maxRowHeight = Math.max(maxRowHeight, height)
                maxHarmonyHeight = Math.max(maxHarmonyHeight, -harmonyRect.top())
                harmonyBaseline = Math.min(harmonyBaseline, harmonyLdata.pos().y())
            }

            rowHeights.push(maxRowHeight)
            harmonyHeights.push(maxHarmonyHeight)
            harmonyBaselines.push(harmonyBaseline)
        }

        const cellWidth = maxFretDiagramWidth
        const columns = Math.min(totalDiagrams, chordsPerRow)

        const totalTableWidth = cellWidth * columns + (columns - 1) * columnGap

        const alignH = item.contentHorizontalAlignment()
        const leftMargin = Number(item.getProperty(Pid.LEFT_MARGIN) ?? 0) * spatium
        const rightMargin = Number(item.getProperty(Pid.RIGHT_MARGIN) ?? 0) * spatium
        const topMargin = Number(item.getProperty(Pid.TOP_MARGIN) ?? 0) * spatium
        const bottomMargin = Number(item.getProperty(Pid.BOTTOM_MARGIN) ?? 0) * spatium

        const width = item.system()!.width()

        const startX = alignH === AlignH.HCENTER
            ? (width - totalTableWidth) / 2
            : alignH === AlignH.RIGHT ? width - totalTableWidth : 0.0
        const startY = topMargin

        let bottomY = 0.0

        for (let i = 0; i < totalDiagrams; ++i) {
            const fretDiagram = fretDiagrams[i]
            const harmony = fretDiagram.harmony()!

            const row = Math.trunc(i / chordsPerRow)
            const col = i % chordsPerRow

            const itemsInRow = Math.min(chordsPerRow, totalDiagrams - row * chordsPerRow)
            const rowOffsetX = alignH === AlignH.HCENTER
                ? (totalTableWidth - (itemsInRow * cellWidth + (itemsInRow - 1) * columnGap)) / 2
                : alignH === AlignH.RIGHT
                    ? totalTableWidth - (itemsInRow * cellWidth + (itemsInRow - 1) * columnGap) - rightMargin + spatium
                    : leftMargin + spatium

            const x = startX + rowOffsetX + col * (cellWidth + columnGap)

            let y = startY
            for (let r = 0; r < row; ++r) {
                y += rowHeights[r] + rowGap
            }

            const commonBaseline = harmonyBaselines[row]
            const thisBaseline = harmony.ldata().pos().y()
            const baselineOff = commonBaseline - thisBaseline
            harmony.mutldata().moveY(baselineOff)

            const fretDiagramX = x
            const fretDiagramY = y + harmonyHeights[row]

            fretDiagram.mutldata().setPos(new PointF(fretDiagramX, fretDiagramY))

            bottomY = Math.max(bottomY, fretDiagram.ldata().bbox().translated(fretDiagram.ldata().pos()).bottom())
        }

        let height = bottomY + bottomMargin
        if (RealIsNull(height)) {
            height = item.minHeight()
        }

        ldata.setBbox(0.0, 0.0, width, height)
    }

    static layoutTBox(item: TBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const parentSystem = item.system()!

        ldata.setPos(new PointF())
        ldata.setBbox(0.0, 0.0, parentSystem.ldata().bbox().width(), 0)

        const text = item.text()
        TLayout.layoutText(text, ctx)

        const textLD = text.mutldata()

        let h: number
        if (text.empty()) {
            h = new FontMetrics(text.font()).ascent()
        } else {
            h = textLD.bbox().height()
        }
        const y = item.topMargin() * DPMM
        textLD.setPos(item.leftMargin() * DPMM, y)
        h += item.topMargin() * DPMM + item.bottomMargin() * DPMM
        ldata.setBbox(0.0, 0.0, parentSystem.width(), h)

        TLayout.layoutBaseMeasureBase(item, ctx) // layout LayoutBreak's
    }
}
