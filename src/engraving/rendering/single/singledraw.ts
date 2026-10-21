/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/single/singledraw.h/.cpp: drawing of single elements (palette cells).
 * SingleDraw's functions are copies of TDraw's for most elements; here they delegate to TDraw (which handles
 * elements without staff) and only the differing ones are ported.
 *
 * Deviation: ActionIcon and LayoutBreak are glyphs of the UI icon font and are drawn by the UI (palette/api.ts).
 */

import type { Painter } from '../../../framework/draw/painter'
import { Brush, BrushStyle, Pen, PenCapStyle, PenStyle } from '../../../framework/draw/types/drawtypes'
import { LineF } from '../../../framework/draw/types/geometry'
import { SymId } from '../../types/symid'
import { Sid } from '../../style/styledef'
import { DirectionV, ElementType } from '../../types/types'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Spacer } from '../../dom/spacer'
import type { Symbol as SymbolItem } from '../../dom/symbol'
import type { TextBase } from '../../dom/textbase'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'
import type { PaintOptions } from '../paintoptions'
import type { ChordBracket } from '../../dom/chordbracket'
import type { Tapping } from '../../dom/tapping'
import { TDraw } from '../score/tdraw'

export class SingleDraw {
    static drawItem(item: EngravingItem, painter: Painter, opt: PaintOptions): void {
        switch (item.type()) {
        case ElementType.ACTION_ICON:
        case ElementType.LAYOUT_BREAK:
            // drawn by the UI with the icon font
            break
        case ElementType.SPACER: SingleDraw.drawSpacer(item as Spacer, painter, opt)
            break
        case ElementType.NOTEHEAD: TDraw.drawSymbol(item as SymbolItem, painter, opt)
            break
        case ElementType.PLAYTECH_ANNOTATION:
        case ElementType.CAPO:
        case ElementType.STICKING:
        case ElementType.HARP_DIAGRAM:
        case ElementType.STRING_TUNINGS:
            TDraw.drawTextBase(item as TextBase, painter, opt)
            break
        case ElementType.CHORD_BRACKET: SingleDraw.drawChordBracket(item as ChordBracket, painter, opt)
            break
        case ElementType.TAPPING: {
            const text = (item as Tapping).tappingText()
            if (text) {
                TDraw.drawTextBase(text, painter, opt)
            }
            break
        }
        case ElementType.TREMOLO_SINGLECHORD: SingleDraw.drawTremoloSingleChord(item as TremoloSingleChord, painter, opt)
            break
        case ElementType.TREMOLO_TWOCHORD: SingleDraw.drawTremoloTwoChord(item as TremoloTwoChord, painter, opt)
            break
        default:
            TDraw.drawItem(item, painter, opt)
            break
        }
    }

    static drawChordBracket(item: ChordBracket, painter: Painter, opt: PaintOptions): void {
        const ldata = item.ldata()

        const lineWidth = item.style().styleMM(Sid.chordBracketLineWidth)
        painter.setPen(new Pen(item.curColor(opt), lineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap))

        const halfLineWidth = 0.5 * lineWidth
        const y1 = ldata.bbox().top() + halfLineWidth
        const y2 = ldata.bbox().bottom() - halfLineWidth

        const w = item.hookLength().val() * item.spatium()
        if (item.hookPos() !== DirectionV.DOWN) {
            painter.drawLine(new LineF(0.0, y1, w, y1))
        }
        if (item.hookPos() !== DirectionV.UP) {
            painter.drawLine(new LineF(0.0, y2, w, y2))
        }

        const x = halfLineWidth
        painter.drawLine(new LineF(x, y1, x, y2))
    }

    static drawSpacer(item: Spacer, painter: Painter, opt: PaintOptions): void {
        painter.setPen(new Pen(item.curColor(opt), item.spatium() * 0.3))
        painter.setBrush(BrushStyle.NoBrush)
        painter.drawPath(item.ldata().path)
    }

    static drawTremoloSingleChord(item: TremoloSingleChord, painter: Painter, opt: PaintOptions): void {
        if (item.isBuzzRoll()) {
            painter.setPen(item.curColor(opt))
            item.drawSymbol(SymId.buzzRoll, painter)
        } else {
            painter.setBrush(new Brush(item.curColor(opt)))
            painter.setNoPen()
            painter.drawPath(item.path())
        }

        // vertical line (stem)
        const x = 0.0 // bbox().width() * .25
        painter.setPen(new Pen(item.curColor(opt), item.absoluteFromSpatium(item.style().styleS(Sid.stemWidth))))
        const sp = item.spatium()
        if (item.isBuzzRoll()) {
            painter.drawLine(new LineF(x, -sp, x, item.ldata().bbox().bottom() + sp))
        } else {
            painter.drawLine(new LineF(x, -sp * 0.5, x, item.path().boundingRect().height() + sp))
        }
    }

    static drawTremoloTwoChord(item: TremoloTwoChord, painter: Painter, opt: PaintOptions): void {
        painter.setBrush(new Brush(item.curColor(opt)))
        painter.setNoPen()
        painter.drawPath(item.path())
    }
}
