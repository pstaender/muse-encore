/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Paint provider for the HTML Canvas 2D API
 * (replacement for src/framework/draw/internal/qpainterprovider.cpp).
 * Works with a browser CanvasRenderingContext2D and compatible node
 * implementations (e.g. @napi-rs/canvas).
 */

import { BrushStyle, PenCapStyle, PenJoinStyle, PenStyle, PolygonMode } from './types/drawtypes'
import { PointF, RectF } from './types/geometry'
import { FillRule, PainterPath, PainterPathElementType } from './types/painterpath'
import { Transform } from './types/transform'
import type { IPaintProvider, PaintState } from './painter'

/** The subset of CanvasRenderingContext2D that is used */
export interface Canvas2D {
    save(): void
    restore(): void
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
    beginPath(): void
    moveTo(x: number, y: number): void
    lineTo(x: number, y: number): void
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void
    closePath(): void
    rect(x: number, y: number, w: number, h: number): void
    clip(fillRule?: CanvasFillRule): void
    fill(fillRule?: CanvasFillRule): void
    stroke(): void
    setLineDash(segments: number[]): void
    fillStyle: unknown
    strokeStyle: unknown
    lineWidth: number
    lineCap: CanvasLineCap
    lineJoin: CanvasLineJoin
    imageSmoothingEnabled?: boolean
}

export class CanvasPaintProvider implements IPaintProvider {
    /**
     * @param ctx the canvas context
     * @param baseTransform transform from score coordinates (1200 DPI) to canvas pixels
     */
    constructor(private ctx: Canvas2D, private baseTransform: Transform = new Transform()) {}

    private applyTransform(t: Transform): void {
        const m = t.multiplied(this.baseTransform)
        this.ctx.setTransform(m.m11, m.m12, m.m21, m.m22, m.dx, m.dy)
    }

    private tracePath(path: PainterPath): void {
        const ctx = this.ctx
        ctx.beginPath()
        const els = path.elements()
        for (let i = 0; i < els.length; ++i) {
            const e = els[i]
            switch (e.type) {
            case PainterPathElementType.MoveToElement:
                ctx.moveTo(e.x, e.y)
                break
            case PainterPathElementType.LineToElement:
                ctx.lineTo(e.x, e.y)
                break
            case PainterPathElementType.CurveToElement:
                ctx.bezierCurveTo(e.x, e.y, els[i + 1].x, els[i + 1].y, els[i + 2].x, els[i + 2].y)
                i += 2
                break
            default:
                break
            }
        }
    }

    private setupPen(state: PaintState): boolean {
        const pen = state.pen
        if (pen.style() === PenStyle.NoPen) {
            return false
        }
        const ctx = this.ctx
        // Qt draws a cosmetic 1 device pixel line for width 0
        let w = pen.widthF()
        if (w <= 0) {
            const s = state.transform.multiplied(this.baseTransform).scaleFactor()
            w = s > 0 ? 1 / s : 1
        }
        ctx.lineWidth = w
        ctx.strokeStyle = pen.color().toCss()
        ctx.lineCap = pen.capStyle() === PenCapStyle.FlatCap ? 'butt' : pen.capStyle() === PenCapStyle.RoundCap ? 'round' : 'square'
        ctx.lineJoin = pen.joinStyle() === PenJoinStyle.MiterJoin ? 'miter' : pen.joinStyle() === PenJoinStyle.RoundJoin ? 'round' : 'bevel'
        const dash = pen.dashPattern()
        // Qt dash patterns are in units of the pen width
        ctx.setLineDash(dash.length ? dash.map(d => d * w) : [])
        return true
    }

    drawPath(path: PainterPath, state: PaintState): void {
        if (path.isEmpty()) {
            return
        }
        const ctx = this.ctx
        ctx.save()
        this.applyTransform(state.transform)
        this.tracePath(path)
        if (state.brush.style() !== BrushStyle.NoBrush) {
            ctx.fillStyle = state.brush.color().toCss()
            ctx.fill(path.fillRule() === FillRule.WindingFill ? 'nonzero' : 'evenodd')
        }
        if (this.setupPen(state)) {
            ctx.stroke()
        }
        ctx.restore()
    }

    drawPolygon(points: readonly PointF[], mode: PolygonMode, state: PaintState): void {
        if (points.length === 0) {
            return
        }
        const ctx = this.ctx
        ctx.save()
        this.applyTransform(state.transform)
        ctx.beginPath()
        ctx.moveTo(points[0].x(), points[0].y())
        for (let i = 1; i < points.length; ++i) {
            ctx.lineTo(points[i].x(), points[i].y())
        }
        if (mode !== PolygonMode.Polyline) {
            ctx.closePath()
            if (state.brush.style() !== BrushStyle.NoBrush) {
                ctx.fillStyle = state.brush.color().toCss()
                ctx.fill(mode === PolygonMode.OddEven ? 'evenodd' : 'nonzero')
            }
        }
        if (this.setupPen(state)) {
            ctx.stroke()
        }
        ctx.restore()
    }

    private m_clipped = false

    setClipRect(rect: RectF | null, state: PaintState): void {
        const ctx = this.ctx
        if (this.m_clipped) {
            ctx.restore()
            this.m_clipped = false
        }
        if (rect) {
            ctx.save()
            this.applyTransform(state.transform)
            ctx.beginPath()
            ctx.rect(rect.x(), rect.y(), rect.width(), rect.height())
            ctx.clip()
            this.m_clipped = true
        }
    }
}
