/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/fontmetrics.h/.cpp
 */

import type { RectF } from './types/geometry'
import type { Font } from './types/font'
import type { FontProvider } from './internal/fontprovider'

let s_provider: FontProvider | null = null

/** replaces the injected IFontProvider of FontMetrics */
export function setFontMetricsProvider(p: FontProvider): void { s_provider = p }

export class FontMetrics {
    private m_font: Font

    constructor(font: Font) {
        this.m_font = font.clone()
    }

    private static provider(): FontProvider {
        if (!s_provider) {
            throw new Error('FontMetrics: no font provider set')
        }
        return s_provider
    }

    lineSpacing(): number { return FontMetrics.provider().lineSpacing(this.m_font) }
    xHeight(): number { return FontMetrics.provider().xHeight(this.m_font) }
    height(): number { return FontMetrics.provider().height(this.m_font) }
    capHeight(): number { return FontMetrics.provider().capHeight(this.m_font) }
    ascent(): number { return FontMetrics.provider().ascent(this.m_font) }
    descent(): number { return FontMetrics.provider().descent(this.m_font) }
    inFont(ucs4: number): boolean { return FontMetrics.provider().inFont(this.m_font, ucs4) }
    width(text: string | number): number { return this.horizontalAdvance(text) }
    horizontalAdvance(text: string | number): number { return FontMetrics.provider().horizontalAdvance(this.m_font, text) }
    boundingRect(text: string | number): RectF { return FontMetrics.provider().boundingRect(this.m_font, text) }
    tightBoundingRect(text: string | number): RectF { return FontMetrics.provider().tightBoundingRect(this.m_font, text) }

    static width(f: Font, text: string): number { return new FontMetrics(f).width(text) }
    static ascent(f: Font): number { return new FontMetrics(f).ascent() }
}
