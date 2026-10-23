/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/painter.h/.cpp
 *
 * Differences to the C++ version: the painter keeps the whole state (pen, brush,
 * font, transform) itself and hands self-contained primitives to the provider.
 * Text and symbols are converted to glyph outlines here, so every backend
 * renders exactly the same shapes.
 */

import { AlignmentFlag, Brush, BrushStyle, Pen, PenStyle, PolygonMode } from './types/drawtypes'
import { Color } from './types/color'
import { Font, FontType } from './types/font'
import { LineF, PointF, PolygonF, RectF } from './types/geometry'
import { FillRule, PainterPath } from './types/painterpath'
import { Transform } from './types/transform'
import type { FallbackFont, FallbackSegment, FontProvider, GlyphRef } from './internal/fontprovider'
import type { Pixmap } from './types/pixmap'

/** clip region "background minus rects" (QPainter clip path set by Painter::setMask), in coordinates of `transform` */
export interface PaintMask {
    background: RectF
    rects: RectF[]
    transform: Transform
}

export interface PaintState {
    transform: Transform
    pen: Pen
    brush: Brush
    font: Font
    antialiasing: boolean
    mask: PaintMask | null
}

export interface IPaintProvider {
    beginObject?(name: string): void
    endObject?(): void
    drawPath(path: PainterPath, state: PaintState): void
    drawPolygon(points: readonly PointF[], mode: PolygonMode, state: PaintState): void
    setClipRect?(rect: RectF | null, state: PaintState): void
    /** text in a platform font (characters missing in the loaded fonts), `pos` is the baseline origin */
    drawFallbackText?(text: string, pos: PointF, font: FallbackFont, color: Color, state: PaintState): void
    /** if implemented, text and symbols are passed as glyph references instead of one path (drawPath) */
    drawGlyphs?(glyphs: readonly GlyphRef[], color: Color, state: PaintState): void
    /** draws the (encoded) image scaled into `rect` */
    drawPixmap?(rect: RectF, pixmap: Pixmap, state: PaintState): void
}

export class Painter {
    private m_states: PaintState[]
    private m_clip: RectF | null = null

    constructor(private m_provider: IPaintProvider, private m_fontProvider: FontProvider, private m_name = '') {
        this.m_states = [{
            transform: new Transform(),
            pen: new Pen(),
            brush: new Brush(Color.BLACK, BrushStyle.NoBrush),
            font: new Font(),
            antialiasing: true,
            mask: null,
        }]
    }

    name(): string { return this.m_name }
    provider(): IPaintProvider { return this.m_provider }
    fontProvider(): FontProvider { return this.m_fontProvider }

    private get st(): PaintState { return this.m_states[this.m_states.length - 1] }

    beginObject(name: string): void { this.m_provider.beginObject?.(name) }
    endObject(): void { this.m_provider.endObject?.() }

    setAntialiasing(arg: boolean): void { this.st.antialiasing = arg }

    setFont(font: Font): void { this.st.font = font.clone() }
    font(): Font { return this.st.font }

    setPen(pen: Pen | Color): void {
        if (pen instanceof Color) {
            this.st.pen = new Pen(pen.isValid() ? pen : Color.BLACK)
        } else {
            this.st.pen = pen.clone()
        }
    }
    setNoPen(): void { this.st.pen = Pen.noPen() }
    pen(): Pen { return this.st.pen }

    setBrush(brush: Brush | BrushStyle | Color): void {
        if (brush instanceof Brush) {
            this.st.brush = brush.clone()
        } else if (brush instanceof Color) {
            this.st.brush = new Brush(brush)
        } else {
            this.st.brush = new Brush(Color.BLACK, brush)
        }
    }
    brush(): Brush { return this.st.brush }

    setWorldTransform(t: Transform, combine = false): void {
        this.st.transform = combine ? t.multiplied(this.st.transform) : t.clone()
    }
    worldTransform(): Transform { return this.st.transform }

    scale(sx: number, sy: number): void { this.st.transform.scale(sx, sy) }
    rotate(angle: number): void { this.st.transform.rotate(angle) }
    translate(dx: number | PointF, dy?: number): void {
        if (dx instanceof PointF) {
            this.st.transform.translate(dx.x(), dx.y())
        } else {
            this.st.transform.translate(dx, dy ?? 0)
        }
    }

    save(): void {
        const s = this.st
        this.m_states.push({
            transform: s.transform.clone(),
            pen: s.pen.clone(),
            brush: s.brush.clone(),
            font: s.font.clone(),
            antialiasing: s.antialiasing,
            mask: s.mask,
        })
    }

    restore(): void {
        if (this.m_states.length > 1) {
            this.m_states.pop()
        }
    }

    // drawing functions

    fillPath(path: PainterPath, brush: Brush): void {
        this.save()
        this.setNoPen()
        this.setBrush(brush)
        this.drawPath(path)
        this.restore()
    }

    strokePath(path: PainterPath, pen: Pen): void {
        this.save()
        this.setPen(pen)
        this.setBrush(BrushStyle.NoBrush)
        this.drawPath(path)
        this.restore()
    }

    drawPath(path: PainterPath): void {
        this.m_provider.drawPath(path, this.st)
    }

    drawLines(lines: readonly LineF[]): void {
        for (const l of lines) {
            this.drawPolyline([l.p1(), l.p2()])
        }
    }

    drawLine(a: LineF | PointF | number, b?: PointF | number, x2?: number, y2?: number): void {
        if (a instanceof LineF) {
            this.drawPolyline([a.p1(), a.p2()])
        } else if (a instanceof PointF) {
            this.drawPolyline([a, b as PointF])
        } else {
            this.drawPolyline([new PointF(a, b as number), new PointF(x2, y2)])
        }
    }

    drawRect(r: RectF | number, y?: number, w?: number, h?: number): void {
        const rect = r instanceof RectF ? r : new RectF(r, y, w, h)
        const path = new PainterPath()
        path.addRect(rect)
        if (path.isEmpty()) {
            return
        }
        this.drawPath(path)
    }

    drawRects(rects: readonly RectF[]): void {
        for (const r of rects) {
            this.drawRect(r)
        }
    }

    drawRoundedRect(rect: RectF, xRadius: number, yRadius: number): void {
        if (xRadius <= 0 || yRadius <= 0) {
            this.drawRect(rect)
            return
        }
        const path = new PainterPath()
        path.addRoundedRect(rect, xRadius, yRadius)
        this.drawPath(path)
    }

    drawEllipse(rect: RectF | PointF, rx?: number, ry?: number): void {
        const r = rect instanceof RectF ? rect : new RectF(rect.x() - rx!, rect.y() - ry!, 2 * rx!, 2 * ry!)
        const path = new PainterPath()
        path.addEllipse(r)
        this.drawPath(path)
    }

    drawPolyline(points: readonly PointF[]): void {
        this.m_provider.drawPolygon(points, PolygonMode.Polyline, this.st)
    }

    drawPolygon(points: readonly PointF[], fillRule: FillRule = FillRule.OddEvenFill): void {
        const mode = fillRule === FillRule.OddEvenFill ? PolygonMode.OddEven : PolygonMode.Winding
        this.m_provider.drawPolygon(points, mode, this.st)
    }

    drawConvexPolygon(points: readonly PointF[] | PolygonF): void {
        this.m_provider.drawPolygon(points, PolygonMode.Convex, this.st)
    }

    /** a, alen in 1/16th of a degree (Qt) */
    drawArc(r: RectF, a: number, alen: number): void {
        const rect = r.normalized()
        const path = new PainterPath()
        path.arcMoveTo(rect, a / 16.0)
        path.arcTo(rect, a / 16.0, alen / 16.0)
        this.strokePath(path, this.pen())
    }

    /** Draws text with the current font and pen color, `point` is the baseline origin */
    drawText(point: PointF | number, y: number | string, text?: string): void {
        let p: PointF
        let s: string
        if (point instanceof PointF) {
            p = point
            s = y as string
        } else {
            p = new PointF(point, y as number)
            s = text ?? ''
        }
        if (!s) {
            return
        }
        const f = this.st.font
        const fallbacks: FallbackSegment[] = []
        if (this.m_provider.drawGlyphs) {
            this.drawGlyphRefs(this.m_fontProvider.textGlyphs(f, s, p, fallbacks))
        } else {
            this.fillGlyphs(this.m_fontProvider.textPath(f, s, p, fallbacks))
        }
        for (const fb of fallbacks) {
            this.m_provider.drawFallbackText?.(fb.text, new PointF(fb.x, p.y()), fb.font, this.glyphColor(), this.st)
        }

        if (f.underline() || f.strike()) {
            const w = this.m_fontProvider.horizontalAdvance(f, s)
            const lw = Math.max(1, this.m_fontProvider.ascent(f) / 14)
            this.save()
            this.setPen(new Pen(this.st.pen.color(), lw))
            if (f.underline()) {
                const dy = this.m_fontProvider.descent(f) * 0.5
                this.drawLine(new PointF(p.x(), p.y() + dy), new PointF(p.x() + w, p.y() + dy))
            }
            if (f.strike()) {
                const dy = -this.m_fontProvider.xHeight(f) * 0.5
                this.drawLine(new PointF(p.x(), p.y() + dy), new PointF(p.x() + w, p.y() + dy))
            }
            this.restore()
        }
    }

    /** QPainter::drawText(const QRectF&, int flags, const QString&) for single line text (alignment within the rect) */
    drawTextInRect(rect: RectF, flags: number, text: string): void {
        const f = this.st.font
        const w = this.m_fontProvider.horizontalAdvance(f, text)
        const ascent = this.m_fontProvider.ascent(f)
        const height = this.m_fontProvider.height(f)
        let x = rect.left()
        if (flags & AlignmentFlag.AlignRight) {
            x = rect.right() - w
        } else if (flags & AlignmentFlag.AlignHCenter) {
            x = rect.left() + (rect.width() - w) / 2
        }
        let y = rect.top() + ascent
        if (flags & AlignmentFlag.AlignBottom) {
            y = rect.bottom() - height + ascent
        } else if (flags & AlignmentFlag.AlignVCenter) {
            y = rect.top() + (rect.height() - height) / 2 + ascent
        }
        this.drawText(new PointF(x, y), text)
    }

    /** QPainter::drawPixmap(const QPointF&, const QPixmap&): one pixel per unit of the current coordinates */
    drawPixmap(point: PointF, pm: Pixmap): void {
        if (pm.isNull()) {
            return
        }
        this.m_provider.drawPixmap?.(new RectF(point.x(), point.y(), pm.width(), pm.height()), pm, this.st)
    }

    /** QPainter::drawPixmap(const QRectF& target, const QPixmap&, const QRectF& source) with the whole pixmap as source */
    drawPixmapInRect(rect: RectF, pm: Pixmap): void {
        if (pm.isNull()) {
            return
        }
        this.m_provider.drawPixmap?.(rect, pm, this.st)
    }

    drawSymbol(point: PointF, ucs4Code: number): void {
        if (this.m_provider.drawGlyphs) {
            this.drawGlyphRefs(this.m_fontProvider.symbolGlyphs(this.st.font, ucs4Code, point))
        } else {
            this.fillGlyphs(this.m_fontProvider.symbolPath(this.st.font, ucs4Code, point))
        }
    }

    /** glyphs are filled with the pen color (QPainter::drawText) */
    private glyphColor(): Color {
        return this.st.pen.style() === PenStyle.NoPen ? this.st.brush.color() : this.st.pen.color()
    }

    private drawGlyphRefs(glyphs: GlyphRef[]): void {
        if (glyphs.length) {
            this.m_provider.drawGlyphs!(glyphs, this.glyphColor(), this.st)
        }
    }

    private fillGlyphs(path: PainterPath): void {
        if (path.isEmpty()) {
            return
        }
        path.setFillRule(FillRule.WindingFill)
        this.save()
        const color = this.glyphColor()
        this.setNoPen()
        this.setBrush(new Brush(color))
        this.drawPath(path)
        this.restore()
    }

    fillRect(rect: RectF, brush: Brush | Color): void {
        this.save()
        this.setNoPen()
        this.setBrush(brush instanceof Brush ? brush : new Brush(brush))
        this.drawRect(rect)
        this.restore()
    }

    setMask(background: RectF, maskRects: readonly RectF[]): void {
        this.st.mask = maskRects.length
            ? { background: background.clone(), rects: maskRects.map(r => r.clone()), transform: this.st.transform.clone() }
            : null
    }

    hasClipping(): boolean { return this.m_clip !== null }

    setClipRect(rect: RectF): void {
        this.m_clip = rect.clone()
        this.m_provider.setClipRect?.(this.m_clip, this.st)
    }

    setClipping(enable: boolean): void {
        if (!enable) {
            this.m_clip = null
            this.m_provider.setClipRect?.(null, this.st)
        }
    }
}

export { FontType }
