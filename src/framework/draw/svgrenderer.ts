/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement of muse::draw::SvgRenderer (src/framework/draw/svgrenderer.cpp, QSvgRenderer).
 * The document is not interpreted: defaultSize() reads the size of the root element like QSvgTinyDocument::size()
 * (width/height converted to pixels at Qt's 90 DPI, else the view box), and render() draws the document as an image
 * (the paint provider decodes it). Deviation: browsers keep the document's preserveAspectRatio when it is drawn into
 * a rect with another aspect ratio, QSvgRenderer stretches it.
 */

import { gunzipSync, strFromU8 } from 'fflate'
import { SizeF, type RectF } from './types/geometry'
import { Pixmap } from './types/pixmap'
import type { Painter } from './painter'

/** QSvgHandler convertToPixels(): lengths in user units (pixels at 90 DPI) */
function toPixels(attr: string | null): { value: number; percent: boolean } | null {
    if (!attr) {
        return null
    }
    const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-z%]*)\s*$/.exec(attr)
    if (!m) {
        return null
    }
    const len = parseFloat(m[1])
    switch (m[2]) {
    case 'pt': return { value: len * 1.25, percent: false }
    case 'mm': return { value: len * 3.543307, percent: false }
    case 'cm': return { value: len * 35.43307, percent: false }
    case 'in': return { value: len * 90, percent: false }
    case 'pc': return { value: len * 15, percent: false }
    case '%': return { value: len, percent: true }
    default: return { value: len, percent: false }
    }
}

function attribute(tag: string, name: string): string | null {
    const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag)
    return m ? (m[2] ?? m[3]) : null
}

export class SvgRenderer {
    private m_valid = false
    private m_defaultSize = new SizeF()
    private m_pixmap: Pixmap

    constructor(data: Uint8Array, key?: string) {
        let doc = data
        if (doc.length > 2 && doc[0] === 0x1f && doc[1] === 0x8b) { // svgz
            try {
                doc = gunzipSync(doc)
            } catch {
                doc = new Uint8Array(0)
            }
        }
        const text = strFromU8(doc)
        const m = /<svg\b[^>]*>/.exec(text)
        if (m) {
            this.m_valid = true
            const tag = m[0]
            const w = toPixels(attribute(tag, 'width'))
            const h = toPixels(attribute(tag, 'height'))
            const vb = (attribute(tag, 'viewBox') ?? '').trim().split(/[\s,]+/).map(parseFloat)
            const vbw = vb.length === 4 && !vb.some(Number.isNaN) ? vb[2] : 0
            const vbh = vb.length === 4 && !vb.some(Number.isNaN) ? vb[3] : 0
            let width = w && !w.percent ? w.value : 0
            let height = h && !h.percent ? h.value : 0
            if (w && w.percent) {
                width = vbw * w.value / 100
            }
            if (h && h.percent) {
                height = vbh * h.value / 100
            }
            if (width <= 0 || height <= 0) {
                width = vbw
                height = vbh
            }
            // QSize: integers
            this.m_defaultSize = new SizeF(Math.round(width), Math.round(height))
        }
        this.m_pixmap = new Pixmap(doc, 'image/svg+xml', this.m_defaultSize.width(), this.m_defaultSize.height(), key)
    }

    isValid(): boolean { return this.m_valid }
    defaultSize(): SizeF { return this.m_defaultSize.clone() }

    /** renders the document into the rect */
    render(painter: Painter, rect: RectF): void {
        if (!this.m_valid) {
            return
        }
        painter.drawPixmapInRect(rect, this.m_pixmap)
    }
}
