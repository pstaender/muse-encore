/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/utilities/engravingitempreviewpainter.h/.cpp: paints a single element (palette cell)
 * centered in a rectangle, optionally on dummy staff lines. Uses the single renderer (SingleLayout/SingleDraw).
 */

import type { Painter } from '../framework/draw/painter'
import type { Color } from '../framework/draw/types/color'
import { Pen } from '../framework/draw/types/drawtypes'
import { LineF, type RectF } from '../framework/draw/types/geometry'
import { Sid } from '../engraving/style/styledef'
import { DefaultStyle } from '../engraving/style/defaultstyle'
import { Pid } from '../engraving/dom/property'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { Spanner } from '../engraving/dom/spanner'
import { gpaletteScore } from '../engraving/dom/palettescore'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'
import { SingleDraw } from '../engraving/rendering/single/singledraw'
import type { PaintOptions } from '../engraving/rendering/paintoptions'

export interface PaintParams {
    painter: Painter
    color: Color
    rect: RectF
    mag: number
    xoffset: number
    yoffset: number
    spatium: number
    numStaffLines: number
    useElementColors?: boolean
    colorsInversionEnabled?: boolean
}

export class EngravingItemPreviewPainter {
    /**
     * Paint `element` centered inside `params.rect`. If `params.numStaffLines > 0`, then the element is only centered
     * horizontally; i.e. vertical alignment is unchanged from the default so that item will appear at the correct
     * height on the staff.
     */
    static paintPreview(element: EngravingItem, params: PaintParams): void {
        const painter = params.painter
        painter.setPen(params.color)

        const rectOrigin = params.rect.center() // draw element at center of cell by default
        if (params.numStaffLines > 0) {
            const topLinePos = EngravingItemPreviewPainter.paintStaff(params) // draw dummy staff lines onto rect.
            rectOrigin.setY(topLinePos) // vertical position relative to staff instead of cell center.
        }

        painter.translate(rectOrigin)
        painter.translate(params.xoffset * params.spatium, params.yoffset * params.spatium) // additional offset for element only

        const sizeRatio = params.spatium / gpaletteScore().style().spatium()
        painter.scale(sizeRatio, sizeRatio) // scale coordinates so element is drawn at correct size

        // calculate bbox
        SingleLayout.layoutItem(element)

        const elementOrigin = element.ldata().bbox().center()
        if (params.numStaffLines > 0) {
            // y = 0 is position of the element's parent.
            // If the parent is the staff (or a segment on the staff) then
            // y = 0 corresponds to the position of the top staff line.
            elementOrigin.setY(0.0)
        }

        // shift coordinates so element is drawn at correct position
        painter.translate(elementOrigin.times(-1))

        EngravingItemPreviewPainter.paintItem(element, params)
    }

    static paintItem(element: EngravingItem, params: PaintParams): void {
        const doPaint = (item: EngravingItem): void => {
            const painter = params.painter
            painter.save()
            painter.translate(item.pos()) // necessary for drawing child items

            const colorBackup = item.getProperty(Pid.COLOR) as Color
            const frameColorBackup = item.getProperty(Pid.FRAME_FG_COLOR) as Color

            if (!params.useElementColors) {
                item.setProperty(Pid.COLOR, params.color)
                item.setProperty(Pid.FRAME_FG_COLOR, params.color)
            }

            const opt: PaintOptions = { invertColors: params.colorsInversionEnabled }
            SingleDraw.drawItem(item, painter, opt)

            item.setProperty(Pid.COLOR, colorBackup)
            item.setProperty(Pid.FRAME_FG_COLOR, frameColorBackup)

            painter.restore()
        }

        if (element.isSpanner() && !(element as unknown as Spanner).segmentsEmpty()) {
            const spannerSeg = (element as unknown as Spanner).frontSegment()
            spannerSeg.scanElements(doPaint)
        } else {
            element.scanElements(doPaint)
        }
    }

    /** Paint a staff centered within a rect and return the distance from the top of the rect to the uppermost staff line. */
    static paintStaff(params: PaintParams): number {
        const painter = params.painter
        painter.save()

        const staffLinesColor = params.color.clone()
        staffLinesColor.a = 127 // reduce alpha of staff lines to half
        painter.setPen(new Pen(staffLinesColor, DefaultStyle.defaultStyle().styleS(Sid.staffLineWidth).val() * params.spatium))

        const staffHeight = params.spatium * (params.numStaffLines - 1)
        const topLineDist = params.rect.center().y() - (staffHeight / 2.0)

        // lines bounded horizontally by edge of target (with small margin)
        const margin = 3.0
        const x1 = params.rect.left() + margin
        const x2 = params.rect.right() - margin

        // draw staff lines with middle line centered vertically on target
        let y = topLineDist
        for (let i = 0; i < params.numStaffLines; ++i) {
            painter.drawLine(new LineF(x1, y, x2, y))
            y += params.spatium
        }

        painter.restore()
        return topLineDist
    }
}

