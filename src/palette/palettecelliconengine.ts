/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettecelliconengine.h/.cpp and the palette values of PaletteConfiguration
 * (paletteconfiguration.cpp). The background of selected/current cells is drawn by the UI.
 */

import type { Painter } from '../framework/draw/painter'
import type { Color } from '../framework/draw/types/color'
import type { RectF } from '../framework/draw/types/geometry'
import { EngravingItemPreviewPainter } from './engravingitempreviewpainter'
import type { PaletteCell } from './palettecell'

/** PaletteConfiguration::paletteSpatium(): 1.764 mm at the nominal 96 DPI of the display, in pixels */
export function paletteSpatium(): number {
    const DPI_DISPLAY = 96.0 // 96 DPI nominal resolution
    const DPMM_DISPLAY = DPI_DISPLAY / 25.4
    return 1.764 * DPMM_DISPLAY
}

export class PaletteCellIconEngine {
    constructor(private m_cell: PaletteCell | null, private m_extraMag = 1.0) {}

    paintCell(painter: Painter, rect: RectF, color: Color): void {
        const element = this.m_cell?.element
        if (!this.m_cell || !element) {
            return
        }

        const mag = this.m_extraMag * this.m_cell.mag
        EngravingItemPreviewPainter.paintPreview(element, {
            painter,
            color,
            mag,
            xoffset: this.m_cell.xoffset,
            yoffset: this.m_cell.yoffset,
            rect,
            spatium: paletteSpatium() * mag,
            //! NOTE: Slight hack - we can now specify exactly now many staff lines we want...
            numStaffLines: this.m_cell.drawStaff ? 5 : 0,
        })
    }
}
