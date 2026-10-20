/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Paint provider that writes SVG (vector output, e.g. for printing).
 * Glyph outlines are defined once (SvgGlyphDefs, can be shared by several pages) and placed with <use>.
 */

import { BrushStyle, PenCapStyle, PenJoinStyle, PenStyle, PolygonMode } from './types/drawtypes'
import type { Color } from './types/color'
import { PointF, RectF } from './types/geometry'
import { FillRule, PainterPath, PainterPathElementType } from './types/painterpath'
import { Transform } from './types/transform'
import type { IPaintProvider, PaintMask, PaintState } from './painter'
import { type FallbackFont, type GlyphRef } from './internal/fontprovider'

/** number with at most `digits` decimals, without trailing zeros */
function num(v: number, digits = 2): string {
    const s = v.toFixed(digits)
    return s.includes('.') ? s.replace(/\.?0+$/, '') || '0' : s
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function matrix(t: Transform): string {
    return t.isIdentity() ? '' : ` transform="matrix(${num(t.m11, 6)} ${num(t.m12, 6)} ${num(t.m21, 6)} ${num(t.m22, 6)} ${num(t.dx)} ${num(t.dy)})"`
}

function pathData(path: PainterPath, digits = 2): string {
    const els = path.elements()
    let d = ''
    for (let i = 0; i < els.length; ++i) {
        const e = els[i]
        switch (e.type) {
        case PainterPathElementType.MoveToElement:
            d += `M${num(e.x, digits)} ${num(e.y, digits)}`
            break
        case PainterPathElementType.LineToElement:
            d += `L${num(e.x, digits)} ${num(e.y, digits)}`
            break
        case PainterPathElementType.CurveToElement:
            d += `C${num(e.x, digits)} ${num(e.y, digits)} ${num(els[i + 1].x, digits)} ${num(els[i + 1].y, digits)} `
                + `${num(els[i + 2].x, digits)} ${num(els[i + 2].y, digits)}`
            i += 2
            break
        default:
            break
        }
    }
    return d
}

function rectData(r: RectF): string {
    return `M${num(r.left())} ${num(r.top())}H${num(r.right())}V${num(r.bottom())}H${num(r.left())}Z`
}

/** glyph outlines (in font units) referenced by the pages */
export class SvgGlyphDefs {
    private m_ids = new Map<string, string>()
    private m_defs: string[] = []

    constructor(private m_prefix = 'g') {}

    /** id of the glyph's definition, '' for glyphs without outline (spaces) */
    id(glyph: GlyphRef): string {
        let id = this.m_ids.get(glyph.key)
        if (id === undefined) {
            const path = glyph.path()
            id = path.isEmpty() ? '' : `${this.m_prefix}${glyph.key}`
            if (id) {
                this.m_defs.push(`<path id="${id}" d="${pathData(path, 1)}"/>`)
            }
            this.m_ids.set(glyph.key, id)
        }
        return id
    }

    /** the definitions, to be put into a <defs> element */
    content(): string {
        return this.m_defs.join('\n')
    }

    /** a hidden SVG element holding the definitions, for pages in the same HTML document */
    svg(): string {
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>\n${this.content()}\n</defs></svg>`
    }
}

export class SvgPaintProvider implements IPaintProvider {
    private m_body: string[] = []
    private m_defs: string[] = []
    private m_masks = new Map<PaintMask, string>()
    private m_clipId = ''
    private m_nextId = 0

    /**
     * @param m_glyphs glyph definitions; shared by several pages or private to this one
     * @param m_idPrefix prefix of the mask and clip ids, unique per page if pages share an HTML document
     */
    constructor(private m_glyphs: SvgGlyphDefs = new SvgGlyphDefs(), private m_idPrefix = '') {}

    beginObject(name: string): void {
        this.m_body.push(`<g class="${esc(name)}">`)
    }

    endObject(): void {
        this.m_body.push('</g>')
    }

    private newId(kind: string): string {
        return `${this.m_idPrefix}${kind}${this.m_nextId++}`
    }

    /** adds an element, inside the current clip and the state's mask */
    private add(element: string, state: PaintState): void {
        let e = element
        if (state.mask) {
            e = `<g mask="url(#${this.maskId(state.mask)})">${e}</g>`
        }
        if (this.m_clipId) {
            e = `<g clip-path="url(#${this.m_clipId})">${e}</g>`
        }
        this.m_body.push(e)
    }

    /** "background minus rects": white background, black rects (overlapping rects stay hidden, unlike even-odd clipping) */
    private maskId(mask: PaintMask): string {
        let id = this.m_masks.get(mask)
        if (!id) {
            id = this.newId('m')
            const r = mask.transform.mapRect(mask.background)
            const t = matrix(mask.transform)
            this.m_defs.push(`<mask id="${id}" maskUnits="userSpaceOnUse" x="${num(r.x())}" y="${num(r.y())}" `
                + `width="${num(r.width())}" height="${num(r.height())}"><g${t}>`
                + `<path fill="#fff" d="${rectData(mask.background)}"/>`
                + `<path fill="#000" d="${mask.rects.map(rectData).join('')}"/></g></mask>`)
            this.m_masks.set(mask, id)
        }
        return id
    }

    private penAttrs(state: PaintState): string {
        const pen = state.pen
        if (pen.style() === PenStyle.NoPen) {
            return ''
        }
        let a = ` stroke="${pen.color().toCss()}"`
        // Qt draws a cosmetic line of one device pixel for width 0
        const w = pen.widthF()
        a += w > 0 ? ` stroke-width="${num(w, 3)}"` : ' stroke-width="1" vector-effect="non-scaling-stroke"'
        const cap = pen.capStyle()
        if (cap !== PenCapStyle.FlatCap) {
            a += ` stroke-linecap="${cap === PenCapStyle.RoundCap ? 'round' : 'square'}"`
        }
        const join = pen.joinStyle()
        if (join !== PenJoinStyle.MiterJoin) {
            a += ` stroke-linejoin="${join === PenJoinStyle.RoundJoin ? 'round' : 'bevel'}"`
        }
        const dash = pen.dashPattern()
        if (dash.length) {
            // in units of the pen width, negative values are drawn as 0 (see CanvasPaintProvider)
            const pw = w > 0 ? w : 1
            a += ` stroke-dasharray="${dash.map(d => num(Math.max(0, d * pw), 3)).join(' ')}"`
        }
        return a
    }

    private brushAttrs(state: PaintState, fillRule: FillRule | null): string {
        if (state.brush.style() === BrushStyle.NoBrush) {
            return ' fill="none"'
        }
        return ` fill="${state.brush.color().toCss()}"` + (fillRule === FillRule.OddEvenFill ? ' fill-rule="evenodd"' : '')
    }

    drawPath(path: PainterPath, state: PaintState): void {
        if (path.isEmpty()) {
            return
        }
        this.add(`<path${matrix(state.transform)}${this.brushAttrs(state, path.fillRule())}${this.penAttrs(state)} d="${pathData(path)}"/>`, state)
    }

    drawPolygon(points: readonly PointF[], mode: PolygonMode, state: PaintState): void {
        if (points.length === 0) {
            return
        }
        const pts = points.map(p => `${num(p.x())},${num(p.y())}`).join(' ')
        if (mode === PolygonMode.Polyline) {
            this.add(`<polyline${matrix(state.transform)} fill="none"${this.penAttrs(state)} points="${pts}"/>`, state)
            return
        }
        const rule = mode === PolygonMode.OddEven ? FillRule.OddEvenFill : FillRule.WindingFill
        this.add(`<polygon${matrix(state.transform)}${this.brushAttrs(state, rule)}${this.penAttrs(state)} points="${pts}"/>`, state)
    }

    drawGlyphs(glyphs: readonly GlyphRef[], color: Color, state: PaintState): void {
        let uses = ''
        for (const g of glyphs) {
            const id = this.m_glyphs.id(g)
            if (id) {
                const t = new Transform(g.scale, 0, 0, g.scale, g.x, g.y)
                uses += `<use xlink:href="#${id}"${matrix(t)}/>`
            }
        }
        if (uses) {
            this.add(`<g${matrix(state.transform)} fill="${color.toCss()}">${uses}</g>`, state)
        }
    }

    drawFallbackText(text: string, pos: PointF, font: FallbackFont, color: Color, state: PaintState): void {
        const style = (font.italic ? ' font-style="italic"' : '') + (font.bold ? ' font-weight="bold"' : '')
        this.add(`<text${matrix(state.transform)} x="${num(pos.x())}" y="${num(pos.y())}" font-family="${font.serif ? 'serif' : 'sans-serif'}" `
            + `font-size="${num(font.pixelSize)}"${style} fill="${color.toCss()}" xml:space="preserve">${esc(text)}</text>`, state)
    }

    setClipRect(rect: RectF | null, state: PaintState): void {
        if (!rect) {
            this.m_clipId = ''
            return
        }
        this.m_clipId = this.newId('c')
        this.m_defs.push(`<clipPath id="${this.m_clipId}" clipPathUnits="userSpaceOnUse">`
            + `<path${matrix(state.transform)} d="${rectData(rect)}"/></clipPath>`)
    }

    /**
     * The SVG document.
     * @param width,height size with unit (e.g. "8.27in")
     * @param viewBox the drawn area in drawing coordinates
     * @param includeGlyphs put the glyph definitions into this SVG (standalone file); false if they are shared
     */
    svg(width: string, height: string, viewBox: RectF, includeGlyphs = true): string {
        const vb = `${num(viewBox.x())} ${num(viewBox.y())} ${num(viewBox.width())} ${num(viewBox.height())}`
        const defs = [...(includeGlyphs ? [this.m_glyphs.content()] : []), ...this.m_defs].filter(Boolean).join('\n')
        return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${vb}">\n`
            + (defs ? `<defs>\n${defs}\n</defs>\n` : '')
            + this.m_body.join('\n')
            + '\n</svg>\n'
    }
}
