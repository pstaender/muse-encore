/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/editmode/editmoderenderer.h/.cpp: painting of the element in edit mode (the text
 * cursor and selection of an edited text, the grips of an element). The painter draws in canvas coordinates.
 *
 * Deviation: the text selection is painted with a translucent selection color (the painter has no
 * CompositionMode::HardLight).
 * TODO(port): bar line edit data (BarLineEditData yoff1/yoff2)
 */

import { Brush, BrushStyle, Pen, PenJoinStyle } from '../../../framework/draw/types/drawtypes'
import { Color } from '../../../framework/draw/types/color'
import { PointF, RectF } from '../../../framework/draw/types/geometry'
import type { Painter } from '../../../framework/draw/painter'
import { ElementType } from '../../types/types'
import { EngravingConfiguration } from '../../internal/engravingconfiguration'
import { Grip, type EditData } from '../../editing/editdata'
import { TextBase } from '../../dom/textbase'
import type { EngravingItem } from '../../dom/engravingitem'
import type { PaintOptions } from '../paintoptions'

/** C++ EngravingConfiguration::scoreGreyColor() default */
const SCORE_GREY_COLOR = Color.fromString('#A0A0A4')

const TEXT_BASE_TYPES: ReadonlySet<ElementType> = new Set([
    ElementType.CAPO, ElementType.EXPRESSION, ElementType.FIGURED_BASS, ElementType.FINGERING, ElementType.GUITAR_BEND_TEXT,
    ElementType.HARMONY, ElementType.HARP_DIAGRAM, ElementType.INSTRUMENT_CHANGE, ElementType.INSTRUMENT_NAME,
    ElementType.JUMP, ElementType.LYRICS, ElementType.MMREST_RANGE, ElementType.MARKER, ElementType.MEASURE_NUMBER,
    ElementType.PLAY_COUNT_TEXT, ElementType.PLAYTECH_ANNOTATION, ElementType.REHEARSAL_MARK, ElementType.STAFF_TEXT,
    ElementType.STICKING, ElementType.STRING_TUNINGS, ElementType.SYSTEM_TEXT, ElementType.TEMPO_TEXT, ElementType.TEXT,
    ElementType.TRIPLET_FEEL,
])

const SLUR_TIE_SEGMENT_TYPES: ReadonlySet<ElementType> = new Set([
    ElementType.LAISSEZ_VIB_SEGMENT, ElementType.PARTIAL_TIE_SEGMENT, ElementType.SLUR_SEGMENT, ElementType.TIE_SEGMENT,
    ElementType.HAMMER_ON_PULL_OFF_SEGMENT, ElementType.TAPPING_HALF_SLUR_SEGMENT,
])

export class EditModeRenderer {
    static drawItem(item: EngravingItem, painter: Painter, ed: EditData, currentViewScaling: number, opt: PaintOptions): void {
        if (item.type() === ElementType.DYNAMIC) {
            EditModeRenderer.drawDynamic(item, painter, ed, currentViewScaling, opt)
        } else if (TEXT_BASE_TYPES.has(item.type())) {
            EditModeRenderer.drawTextBase(item as unknown as TextBase, painter, ed, currentViewScaling, opt)
        } else if (SLUR_TIE_SEGMENT_TYPES.has(item.type())) {
            EditModeRenderer.drawSlurTieSegment(item, painter, ed, currentViewScaling, opt)
        } else {
            EditModeRenderer.drawEngravingItem(item, painter, ed, currentViewScaling, opt)
        }
    }

    static drawEngravingItem(_item: EngravingItem, painter: Painter, ed: EditData, _currentViewScaling: number, opt: PaintOptions): void {
        const pen = new Pen(opt.invertColors ? EngravingConfiguration.scoreInversionColor() : EngravingConfiguration.defaultColor(), 0.0)
        painter.setPen(pen)
        for (let i = 0; i < ed.grips; ++i) {
            if (i === ed.curGrip) {
                painter.setBrush(SCORE_GREY_COLOR)
            } else {
                painter.setBrush(BrushStyle.NoBrush)
            }
            painter.drawRect(ed.grip[i])
        }
    }

    static drawDynamic(item: EngravingItem, painter: Painter, ed: EditData, currentViewScaling: number, opt: PaintOptions): void {
        const text = item as unknown as TextBase
        if (text.cursor() && text.cursor().editing()) {
            EditModeRenderer.drawTextBase(text, painter, ed, currentViewScaling, opt)
            return
        }

        EditModeRenderer.drawEngravingItem(item, painter, ed, currentViewScaling, opt)
    }

    static drawSlurTieSegment(item: EngravingItem, painter: Painter, ed: EditData, currentViewScaling: number, opt: PaintOptions): void {
        if (ed.grip.length > Grip.DRAG) {
            const polygon: PointF[] = [
                ed.grip[Grip.START].center(),
                ed.grip[Grip.BEZIER1].center(),
                ed.grip[Grip.SHOULDER].center(),
                ed.grip[Grip.BEZIER2].center(),
                ed.grip[Grip.END].center(),
                ed.grip[Grip.DRAG].center(),
                ed.grip[Grip.START].center(),
            ]
            painter.setPen(new Pen(SCORE_GREY_COLOR, 0.0))
            painter.drawPolyline(polygon)
        }

        EditModeRenderer.drawEngravingItem(item, painter, ed, currentViewScaling, opt)
    }

    private static drawTextBaseSelection(painter: Painter, r: RectF): void {
        painter.save()
        const bg = EngravingConfiguration.selectionColor().clone()
        bg.setAlpha(100) // C++ CompositionMode::HardLight with the opaque selection color
        painter.setBrush(new Brush(bg))
        painter.setNoPen()
        painter.drawRect(r)
        painter.restore()
    }

    static drawTextBase(item: TextBase, painter: Painter, ed: EditData, currentViewScaling: number, opt: PaintOptions): void {
        const pos = item.canvasPos()
        painter.translate(pos)

        const ted = ed.getData(item)
        if (!ted) {
            painter.translate(pos.times(-1))
            return
        }
        const cursor = item.cursor()

        const ldata = item.ldata()

        if (cursor.hasSelection()) {
            painter.setBrush(BrushStyle.NoBrush)
            painter.setPen(item.textColor(opt))
            const [r1, c1, r2, c2] = TextBase.sort(cursor.selectLine(), cursor.selectColumn(), cursor.row(), cursor.column())
            let row = 0
            for (const t of ldata.blocks) {
                if (row >= r1 && row <= r2) {
                    let br: RectF
                    if (row === r1 && r1 === r2) {
                        br = t.boundingRect(c1, c2, item)
                    } else if (row === r1) {
                        br = t.boundingRect(c1, t.columns(), item)
                    } else if (row === r2) {
                        br = t.boundingRect(0, c2, item)
                    } else {
                        br = t.boundingRect()
                    }
                    br = br.translated(new PointF(0.0, t.y()))
                    EditModeRenderer.drawTextBaseSelection(painter, br)
                }
                ++row
            }
        }
        painter.setBrush(item.curColor(opt))
        const pen = new Pen(item.curColor(opt))
        pen.setJoinStyle(PenJoinStyle.MiterJoin)
        painter.setPen(pen)

        // Don't draw cursor if there is a selection
        if (!cursor.hasSelection()) {
            painter.drawRect(cursor.cursorRect())
        }

        painter.translate(pos.times(-1))
        painter.setPen(new Pen(EngravingConfiguration.frameColor(), 2.0 / currentViewScaling)) // 2 pixel pen size
        painter.setBrush(BrushStyle.NoBrush)

        const m = item.spatium()
        const r = item.canvasBoundingRect().adjusted(-m, -m, m, m)

        painter.drawRect(r)
    }
}
