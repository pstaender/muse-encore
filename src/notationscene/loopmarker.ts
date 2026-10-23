/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/loopmarker.h/.cpp: the markers of the loop boundaries (a line
 * with a triangle) in canvas coordinates. paint() draws with the library's Painter; the views may also use geometry().
 */

import { Brush, Pen, PenCapStyle, PenJoinStyle, PenStyle } from '../framework/draw/types/drawtypes'
import { Color } from '../framework/draw/types/color'
import { PointF, PolygonF, RectF } from '../framework/draw/types/geometry'
import type { Painter } from '../framework/draw/painter'
import type { Score } from '../engraving/dom/score'
import { LoopBoundaryType } from '../engraving/dom/score'
import { SegmentType, type Segment } from '../engraving/dom/segment'
import { Fraction } from '../engraving/types/fraction'
import { SymId } from '../engraving/types/symid'
import { Sid } from '../engraving/style/styledef'

/** NotationConfiguration::loopMarkerColor() */
export const LOOP_MARKER_COLOR = new Color(0x24, 0x56, 0xAA)

export class LoopMarker {
    private m_visible = false
    private m_rect = new RectF()

    constructor(private m_type: LoopBoundaryType, private m_score: Score | null = null) {}

    setScore(score: Score | null): void { this.m_score = score }
    setVisible(visible: boolean): void { this.m_visible = visible }
    visible(): boolean { return this.m_visible }
    rect(): RectF { return this.m_rect }

    updatePosition(tick: Fraction): void {
        this.m_rect = this.resolveMarkerRectByTick(tick)
    }

    private resolveMarkerRectByTick(tick: Fraction): RectF {
        const score = this.m_score
        if (!score) {
            return new RectF()
        }

        // set mark height for whole system
        if (this.m_type === LoopBoundaryType.LoopOut && tick.gt(new Fraction(0, 1))) {
            tick = tick.minus(Fraction.fromTicks(1))
        }

        const measure = score.tick2measureMM(tick)
        if (!measure) {
            return new RectF()
        }

        const system = measure.system()
        if (!system || !system.page() || !system.staves().length) {
            return new RectF()
        }

        let x = 0.0
        let s: Segment | null = null
        for (s = measure.first(SegmentType.ChordRest); s;) {
            const t1 = s.tick()
            const x1 = Math.trunc(s.canvasPos().x())
            let x2 = 0.0
            let t2: Fraction

            let ns = s.next(SegmentType.ChordRest)
            while (ns && !ns.visible()) {
                ns = ns.next(SegmentType.ChordRest)
            }

            if (ns) {
                t2 = ns.tick()
                x2 = ns.canvasPos().x()
            } else {
                t2 = measure.endTick()
                // measure->width is not good enough because of courtesy keysig, timesig
                const seg = measure.findSegment(SegmentType.EndBarLine, measure.endTick())
                if (seg) {
                    x2 = seg.canvasPos().x()
                } else {
                    x2 = measure.canvasPos().x() + measure.width() // safety, should not happen
                }
            }

            if (tick.ge(t1) && tick.lt(t2)) {
                const dt = t2.minus(t1)
                const dx = x2 - x1
                x = x1 + dx * tick.minus(t1).ticks() / dt.ticks()
                break
            }
            s = ns
        }

        if (!s) {
            return new RectF()
        }

        const _spatium = score.style().spatium()
        const mag = _spatium / score.style().defaultSpatium()

        const width = (_spatium * 2.0 + score.engravingFont().width(SymId.noteheadBlack, mag)) / 3

        if (this.m_type === LoopBoundaryType.LoopIn) {
            x = x - _spatium + width / 1.5
        } else {
            x = x - _spatium * 0.5
        }

        const y = system.staffCanvasYpage(0) - 3 * _spatium

        // set cursor height for whole system
        let y2 = 0.0

        for (let i = 0; i < score.nstaves(); ++i) {
            const ss = system.staff(i)
            if (!ss || !ss.show() || !score.staff(i)!.show()) {
                continue
            }
            y2 = ss.y() + ss.bbox().height()
        }

        const height = y2 + 6 * _spatium

        return new RectF(x, y, width, height)
    }

    /** the line (x, top, bottom), the triangle and the line width of the marker */
    geometry(): { x: number; top: number; bottom: number; triangle: PointF[]; lineWidth: number } | null {
        if (!this.m_visible || !this.m_score || !this.m_rect.isValid()) {
            return null
        }

        const spatium = this.m_score.style().spatium()

        const x = this.m_rect.left()
        const y = this.m_rect.top()
        const h = this.m_score.style().styleD(Sid.spatium) * 2

        let triangle: PointF[]
        switch (this.m_type) {
        case LoopBoundaryType.LoopIn: { // draw a right-pointing triangle
            const tx = x - 1.0
            triangle = [new PointF(tx, y), new PointF(tx, y + h), new PointF(tx + h, y + h / 2)]
        }
            break
        case LoopBoundaryType.LoopOut: // draw a left-pointing triangle
            triangle = [new PointF(x, y), new PointF(x, y + h), new PointF(x - h, y + h / 2)]
            break
        default:
            return null
        }

        return { x, top: y, bottom: this.m_rect.bottom(), triangle, lineWidth: 0.15 * spatium }
    }

    paint(painter: Painter): void {
        const g = this.geometry()
        if (!g) {
            return
        }

        painter.setPen(new Pen(LOOP_MARKER_COLOR, g.lineWidth, PenStyle.SolidLine, PenCapStyle.FlatCap, PenJoinStyle.MiterJoin))
        painter.drawLine(g.x, g.top, g.x, g.bottom)
        painter.setBrush(new Brush(LOOP_MARKER_COLOR))
        painter.drawConvexPolygon(PolygonF.fromPoints(g.triangle))
    }
}
