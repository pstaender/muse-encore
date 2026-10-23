/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Paint provider that writes the pages of a PdfDocument (vector output for the PDF export; MuseScore paints on a
 * QPdfWriter). Drawing coordinates are MuseScore's pixels (1200 DPI) with y down; each page maps them to points.
 * Text is drawn as glyph outlines (form XObjects shared by all pages), like the SVG output. Grayscale: QPdfWriter's
 * grayscale color model (the colors as qGray).
 */

import { BrushStyle, PenCapStyle, PenJoinStyle, PenStyle, PolygonMode } from './types/drawtypes'
import type { Color } from './types/color'
import { PointF, type RectF } from './types/geometry'
import { FillRule, PainterPath, PainterPathElementType } from './types/painterpath'
import type { Transform } from './types/transform'
import type { IPaintProvider, PaintMask, PaintState } from './painter'
import type { GlyphRef } from './internal/fontprovider'
import type { Pixmap } from './types/pixmap'
import { pdfNum, qGray, type PdfDocument } from './pdfdocument'

const POINTS_PER_INCH = 72

function matrix(t: Transform): string {
    return t.isIdentity() ? '' : `${pdfNum(t.m11, 6)} ${pdfNum(t.m12, 6)} ${pdfNum(t.m21, 6)} ${pdfNum(t.m22, 6)} ${pdfNum(t.dx)} ${pdfNum(t.dy)} cm\n`
}

function pathOps(path: PainterPath, digits = 2): string {
    const els = path.elements()
    let d = ''
    for (let i = 0; i < els.length; ++i) {
        const e = els[i]
        switch (e.type) {
        case PainterPathElementType.MoveToElement:
            d += `${pdfNum(e.x, digits)} ${pdfNum(e.y, digits)} m\n`
            break
        case PainterPathElementType.LineToElement:
            d += `${pdfNum(e.x, digits)} ${pdfNum(e.y, digits)} l\n`
            break
        case PainterPathElementType.CurveToElement:
            d += `${pdfNum(e.x, digits)} ${pdfNum(e.y, digits)} ${pdfNum(els[i + 1].x, digits)} ${pdfNum(els[i + 1].y, digits)} `
                + `${pdfNum(els[i + 2].x, digits)} ${pdfNum(els[i + 2].y, digits)} c\n`
            i += 2
            break
        default:
            break
        }
    }
    return d
}

function rectOps(r: RectF): string {
    return `${pdfNum(r.x())} ${pdfNum(r.y())} ${pdfNum(r.width())} ${pdfNum(r.height())} re\n`
}

export interface PdfPaintOptions {
    grayscale?: boolean
}

export class PdfPaintProvider implements IPaintProvider {
    private m_content: string[] = []
    private m_clip = ''
    private m_masks = new Map<PaintMask, string>()
    private m_pageSize = { width: 0, height: 0 }

    constructor(private m_doc: PdfDocument, private m_options: PdfPaintOptions = {}) {}

    /**
     * starts a page of `width` x `height` inches showing the drawing area `viewBox` (drawing units) at its top left
     */
    beginPage(width: number, height: number, viewBox: RectF, dpi: number): void {
        this.m_content = []
        this.m_clip = ''
        this.m_masks.clear()
        this.m_pageSize = { width: width * POINTS_PER_INCH, height: height * POINTS_PER_INCH }
        const s = POINTS_PER_INCH / dpi
        // y down: drawing (x, y) -> ((x - left) * s, height - (y - top) * s)
        this.m_content.push(`q\n${pdfNum(s, 6)} 0 0 ${pdfNum(-s, 6)} ${pdfNum(-viewBox.x() * s)} ${pdfNum(this.m_pageSize.height + viewBox.y() * s)} cm\n`)
    }

    endPage(): void {
        this.m_content.push('Q\n')
        this.m_doc.addPage(this.m_pageSize.width, this.m_pageSize.height, this.m_content.join(''))
        this.m_content = []
    }

    private color(c: Color, stroke: boolean): string {
        if (this.m_options.grayscale) {
            return `${pdfNum(qGray(c.r, c.g, c.b) / 255)} ${stroke ? 'G' : 'g'}\n`
        }
        return `${pdfNum(c.r / 255)} ${pdfNum(c.g / 255)} ${pdfNum(c.b / 255)} ${stroke ? 'RG' : 'rg'}\n`
    }

    /** the graphics state of the colors' transparency, '' if both are opaque */
    private alpha(fill: Color | null, stroke: Color | null): string {
        const fa = fill ? fill.a / 255 : 1
        const sa = stroke ? stroke.a / 255 : 1
        if (fa >= 1 && sa >= 1) {
            return ''
        }
        return `/${this.m_doc.extGState(`/ca ${pdfNum(fa)} /CA ${pdfNum(sa)}`)} gs\n`
    }

    /** adds a drawing, inside the current clip and the state's mask */
    private add(ops: string, state: PaintState, alpha = ''): void {
        let pre = this.m_clip
        if (state.mask) {
            pre += `/${this.maskName(state.mask)} gs\n`
        }
        this.m_content.push(`q\n${pre}${alpha}${matrix(state.transform)}${ops}Q\n`)
    }

    /** "background minus rects" as a soft mask: background white (visible), rects black (hidden) */
    private maskName(mask: PaintMask): string {
        let name = this.m_masks.get(mask)
        if (!name) {
            const r = mask.transform.mapRect(mask.background)
            const content = `q\n${matrix(mask.transform)}1 g\n${rectOps(mask.background)}f\n0 g\n${mask.rects.map(rectOps).join('')}f\nQ\n`
            name = this.m_doc.softMask(content, [r.left(), r.top(), r.right(), r.bottom()])
            this.m_masks.set(mask, name)
        }
        return name
    }

    private penOps(state: PaintState): string | null {
        const pen = state.pen
        if (pen.style() === PenStyle.NoPen) {
            return null
        }
        // Qt draws a cosmetic line of one device pixel for width 0: the thinnest line in PDF
        const w = pen.widthF()
        let ops = this.color(pen.color(), true) + `${pdfNum(Math.max(0, w), 3)} w\n`
        const cap = pen.capStyle()
        ops += `${cap === PenCapStyle.RoundCap ? 1 : cap === PenCapStyle.SquareCap ? 2 : 0} J\n`
        const join = pen.joinStyle()
        ops += `${join === PenJoinStyle.RoundJoin ? 1 : join === PenJoinStyle.BevelJoin ? 2 : 0} j\n`
        const dash = pen.dashPattern()
        if (dash.length) {
            // in units of the pen width, negative values are drawn as 0 (see CanvasPaintProvider)
            const pw = w > 0 ? w : 1
            ops += `[${dash.map(d => pdfNum(Math.max(0, d * pw), 3)).join(' ')}] 0 d\n`
        }
        return ops
    }

    private paint(path: string, state: PaintState, fillRule: FillRule | null, canFill = true): void {
        const fill = canFill && state.brush.style() !== BrushStyle.NoBrush ? state.brush.color() : null
        const pen = this.penOps(state)
        if (!fill && !pen) {
            return
        }
        const evenOdd = fillRule === FillRule.OddEvenFill
        const op = fill && pen ? (evenOdd ? 'B*' : 'B') : fill ? (evenOdd ? 'f*' : 'f') : 'S'
        const ops = (fill ? this.color(fill, false) : '') + (pen ?? '') + path + op + '\n'
        this.add(ops, state, this.alpha(fill, pen ? state.pen.color() : null))
    }

    drawPath(path: PainterPath, state: PaintState): void {
        if (path.isEmpty()) {
            return
        }
        this.paint(pathOps(path), state, path.fillRule())
    }

    drawPolygon(points: readonly PointF[], mode: PolygonMode, state: PaintState): void {
        if (points.length === 0) {
            return
        }
        let ops = `${pdfNum(points[0].x())} ${pdfNum(points[0].y())} m\n`
        for (let i = 1; i < points.length; ++i) {
            ops += `${pdfNum(points[i].x())} ${pdfNum(points[i].y())} l\n`
        }
        if (mode === PolygonMode.Polyline) {
            this.paint(ops, state, null, false)
            return
        }
        this.paint(ops + 'h\n', state, mode === PolygonMode.OddEven ? FillRule.OddEvenFill : FillRule.WindingFill)
    }

    drawGlyphs(glyphs: readonly GlyphRef[], color: Color, state: PaintState): void {
        let ops = ''
        for (const g of glyphs) {
            const name = this.m_doc.glyph(g.key, () => {
                const path = g.path()
                if (path.isEmpty()) {
                    return null
                }
                const b = path.boundingRect()
                return { content: pathOps(path, 1) + 'f\n', bbox: [b.left() - 1, b.top() - 1, b.right() + 1, b.bottom() + 1] }
            })
            if (name) {
                ops += `q\n${pdfNum(g.scale, 6)} 0 0 ${pdfNum(g.scale, 6)} ${pdfNum(g.x)} ${pdfNum(g.y)} cm\n/${name} Do\nQ\n`
            }
        }
        if (ops) {
            this.add(this.color(color, false) + ops, state, this.alpha(color, null))
        }
    }

    drawPixmap(rect: RectF, pixmap: Pixmap, state: PaintState): void {
        const img = this.m_doc.image(pixmap.key(), pixmap.data(), pixmap.mimeType(), !!this.m_options.grayscale)
        if (!img) {
            return
        }
        // the image's unit square, its first row at the top
        this.add(`${pdfNum(rect.width())} 0 0 ${pdfNum(-rect.height())} ${pdfNum(rect.x())} ${pdfNum(rect.bottom())} cm\n/${img.name} Do\n`, state)
    }

    // TODO(port): drawFallbackText (characters missing in the loaded fonts) is not drawn in PDFs

    setClipRect(rect: RectF | null, state: PaintState): void {
        if (!rect) {
            this.m_clip = ''
            return
        }
        // in page coordinates (the clip must not change the transform of the drawings)
        const t = state.transform
        const pts = [rect.topLeft(), rect.topRight(), rect.bottomRight(), rect.bottomLeft()].map(p => t.map(p))
        this.m_clip = `${pdfNum(pts[0].x())} ${pdfNum(pts[0].y())} m\n`
            + pts.slice(1).map(p => `${pdfNum(p.x())} ${pdfNum(p.y())} l\n`).join('') + 'h W n\n'
    }
}
