/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/painterpath.h/.cpp
 */

import { RealIsEqual, RealIsNull } from '../../global/realfn'
import { Bezier } from './bezier'
import { PointF, RectF } from './geometry'

const pathKappa = 0.5522847498

export enum PainterPathElementType {
    MoveToElement,
    LineToElement,
    CurveToElement,
    CurveToDataElement,
}

export enum FillRule {
    OddEvenFill,
    WindingFill,
}

export interface PainterPathElement {
    x: number
    y: number
    type: PainterPathElementType
}

function isValidCoord(c: number): boolean {
    return Number.isFinite(c) && Math.abs(c) < 1e128
}

function hasValidPoint(p: PointF): boolean {
    return isValidCoord(p.x()) && isValidCoord(p.y())
}

function hasValidRect(r: RectF): boolean {
    return isValidCoord(r.x()) && isValidCoord(r.y()) && isValidCoord(r.width()) && isValidCoord(r.height())
}

export class PainterPath {
    static readonly ElementType = PainterPathElementType
    static readonly FillRule = FillRule

    private m_cStart = 0
    private m_bounds = new RectF()
    private m_requireMoveTo = false
    private m_dirtyBounds = false
    private m_fillRule = FillRule.OddEvenFill
    private m_elements: PainterPathElement[] = []

    clone(): PainterPath {
        const p = new PainterPath()
        p.m_cStart = this.m_cStart
        p.m_bounds = this.m_bounds.clone()
        p.m_requireMoveTo = this.m_requireMoveTo
        p.m_dirtyBounds = this.m_dirtyBounds
        p.m_fillRule = this.m_fillRule
        p.m_elements = this.m_elements.map(e => ({ ...e }))
        return p
    }

    moveTo(x: number | PointF, y?: number): void {
        const p = x instanceof PointF ? x : new PointF(x, y)
        if (!hasValidPoint(p)) {
            return
        }
        this.ensureData()
        this.setDirty()
        this.m_requireMoveTo = false
        const back = this.m_elements[this.m_elements.length - 1]
        if (back.type === PainterPathElementType.MoveToElement) {
            back.x = p.x()
            back.y = p.y()
        } else {
            this.m_elements.push({ x: p.x(), y: p.y(), type: PainterPathElementType.MoveToElement })
        }
        this.m_cStart = this.m_elements.length - 1
    }

    lineTo(x: number | PointF, y?: number): void {
        const p = x instanceof PointF ? x : new PointF(x, y)
        if (!hasValidPoint(p)) {
            return
        }
        this.ensureData()
        this.setDirty()
        this.maybeMoveTo()
        const back = this.m_elements[this.m_elements.length - 1]
        if (p.equals(new PointF(back.x, back.y))) {
            return
        }
        this.m_elements.push({ x: p.x(), y: p.y(), type: PainterPathElementType.LineToElement })
    }

    cubicTo(c1: PointF | number, c2: PointF | number, e: PointF | number,
        c2y?: number, ex?: number, ey?: number): void {
        let ctrlPt1: PointF, ctrlPt2: PointF, endPt: PointF
        if (c1 instanceof PointF) {
            ctrlPt1 = c1
            ctrlPt2 = c2 as PointF
            endPt = e as PointF
        } else {
            ctrlPt1 = new PointF(c1, c2 as number)
            ctrlPt2 = new PointF(e as number, c2y)
            endPt = new PointF(ex, ey)
        }
        if (!hasValidPoint(ctrlPt1) || !hasValidPoint(ctrlPt2) || !hasValidPoint(endPt)) {
            return
        }
        this.ensureData()
        this.setDirty()
        // Abort on empty curve as a stroker cannot handle this and the
        // curve is irrelevant anyway.
        const back = this.m_elements[this.m_elements.length - 1]
        if (ctrlPt1.equals(new PointF(back.x, back.y)) && ctrlPt1.equals(ctrlPt2) && ctrlPt2.equals(endPt)) {
            return
        }
        this.maybeMoveTo()
        this.m_elements.push({ x: ctrlPt1.x(), y: ctrlPt1.y(), type: PainterPathElementType.CurveToElement })
        this.m_elements.push({ x: ctrlPt2.x(), y: ctrlPt2.y(), type: PainterPathElementType.CurveToDataElement })
        this.m_elements.push({ x: endPt.x(), y: endPt.y(), type: PainterPathElementType.CurveToDataElement })
    }

    translate(dx: number | PointF, dy?: number): void {
        if (dx instanceof PointF) {
            dy = dx.y()
            dx = dx.x()
        }
        dy = dy ?? 0
        if (RealIsNull(dx) && RealIsNull(dy)) {
            return
        }
        if (this.m_elements.length === 0) {
            return
        }
        this.setDirty()
        for (const e of this.m_elements) {
            e.x += dx
            e.y += dy
        }
    }

    translated(offset: PointF): PainterPath {
        const p = this.clone()
        p.translate(offset)
        return p
    }

    boundingRect(): RectF {
        if (this.m_dirtyBounds) {
            this.computeBoundingRect()
        }
        return this.m_bounds.clone()
    }

    isEmpty(): boolean {
        return this.m_elements.length === 0
               || (this.m_elements.length === 1 && this.m_elements[0].type === PainterPathElementType.MoveToElement)
    }

    elementCount(): number { return this.m_elements.length }
    elementAt(i: number): PainterPathElement { return this.m_elements[i] }
    elements(): readonly PainterPathElement[] { return this.m_elements }

    addRect(x: number | RectF, y?: number, w?: number, h?: number): void {
        const r = x instanceof RectF ? x : new RectF(x, y, w, h)
        if (!hasValidRect(r) || r.isNull()) {
            return
        }
        this.ensureData()
        this.setDirty()
        this.moveTo(r.x(), r.y())
        this.m_elements.push({ x: r.x() + r.width(), y: r.y(), type: PainterPathElementType.LineToElement })
        this.m_elements.push({ x: r.x() + r.width(), y: r.y() + r.height(), type: PainterPathElementType.LineToElement })
        this.m_elements.push({ x: r.x(), y: r.y() + r.height(), type: PainterPathElementType.LineToElement })
        this.m_elements.push({ x: r.x(), y: r.y(), type: PainterPathElementType.LineToElement })
        this.m_requireMoveTo = true
    }

    addEllipse(boundingRect: RectF): void {
        if (!hasValidRect(boundingRect) || boundingRect.isNull()) {
            return
        }
        this.ensureData()
        this.setDirty()
        const pts: PointF[] = []
        const start = curvesForArc(boundingRect, 0, -360, pts)
        this.moveTo(start)
        this.cubicTo(pts[0], pts[1], pts[2]) // 0 -> 270
        this.cubicTo(pts[3], pts[4], pts[5]) // 270 -> 180
        this.cubicTo(pts[6], pts[7], pts[8]) // 180 -> 90
        this.cubicTo(pts[9], pts[10], pts[11]) // 90 - >0
        this.m_requireMoveTo = true
    }

    addRoundedRect(rect: RectF, xRadius: number, yRadius: number): void {
        const r = rect.normalized()
        if (r.isNull()) {
            return
        }
        {
            const w = r.width() / 2
            const h = r.height() / 2
            xRadius = RealIsNull(w) ? 0.0 : 100 * Math.min(xRadius, w) / w
            yRadius = RealIsNull(h) ? 0.0 : 100 * Math.min(yRadius, h) / h
        }
        if (xRadius <= 0 || yRadius <= 0) { // add normal rectangle
            this.addRect(r)
            return
        }
        const x = r.x()
        const y = r.y()
        const w = r.width()
        const h = r.height()
        const rxx2 = w * xRadius / 100
        const ryy2 = h * yRadius / 100

        this.ensureData()
        this.setDirty()

        this.arcMoveTo(new RectF(x, y, rxx2, ryy2), 180)
        this.arcTo(new RectF(x, y, rxx2, ryy2), 180, -90)
        this.arcTo(new RectF(x + w - rxx2, y, rxx2, ryy2), 90, -90)
        this.arcTo(new RectF(x + w - rxx2, y + h - ryy2, rxx2, ryy2), 0, -90)
        this.arcTo(new RectF(x, y + h - ryy2, rxx2, ryy2), 270, -90)
        this.closeSubpath()
        this.m_requireMoveTo = true
    }

    arcMoveTo(rect: RectF, angle: number): void {
        if (rect.isNull()) {
            return
        }
        const [pt] = findEllipseCoords(rect, angle, 0)
        this.moveTo(pt)
    }

    arcTo(rect: RectF, startAngle: number, sweepLength: number): void {
        if (!hasValidRect(rect) || !isValidCoord(startAngle) || !isValidCoord(sweepLength) || rect.isNull()) {
            return
        }
        this.ensureData()
        this.setDirty()
        const pts: PointF[] = []
        const curveStart = curvesForArc(rect, startAngle, sweepLength, pts)
        this.lineTo(curveStart)
        for (let i = 0; i < pts.length; i += 3) {
            this.cubicTo(pts[i], pts[i + 1], pts[i + 2])
        }
    }

    closeSubpath(): void {
        if (this.isEmpty()) {
            return
        }
        this.setDirty()
        this.m_requireMoveTo = true
        const first = this.m_elements[this.m_cStart]
        const last = this.m_elements[this.m_elements.length - 1]
        if (first.x !== last.x || first.y !== last.y) {
            if (RealIsEqual(first.x, last.x) && RealIsEqual(first.y, last.y)) {
                last.x = first.x
                last.y = first.y
            } else {
                this.m_elements.push({ x: first.x, y: first.y, type: PainterPathElementType.LineToElement })
            }
        }
    }

    fillRule(): FillRule {
        return this.isEmpty() ? FillRule.OddEvenFill : this.m_fillRule
    }

    setFillRule(fillRule: FillRule): void {
        this.ensureData()
        if (this.m_fillRule === fillRule) {
            return
        }
        this.setDirty()
        this.m_fillRule = fillRule
    }

    private ensureData(): void {
        if (this.m_elements.length === 0) {
            this.m_elements.push({ x: 0, y: 0, type: PainterPathElementType.MoveToElement })
        }
    }

    private maybeMoveTo(): void {
        if (this.m_requireMoveTo) {
            const e = this.m_elements[this.m_elements.length - 1]
            this.m_elements.push({ x: e.x, y: e.y, type: PainterPathElementType.MoveToElement })
            this.m_requireMoveTo = false
        }
    }

    private setDirty(): void {
        this.m_dirtyBounds = true
    }

    private computeBoundingRect(): void {
        this.m_dirtyBounds = false
        if (this.m_elements.length === 0) {
            this.m_bounds = new RectF()
            return
        }
        let minx = this.m_elements[0].x
        let maxx = minx
        let miny = this.m_elements[0].y
        let maxy = miny
        for (let i = 1; i < this.m_elements.length; ++i) {
            const e = this.m_elements[i]
            switch (e.type) {
            case PainterPathElementType.MoveToElement:
            case PainterPathElementType.LineToElement:
                if (e.x > maxx) {
                    maxx = e.x
                } else if (e.x < minx) {
                    minx = e.x
                }
                if (e.y > maxy) {
                    maxy = e.y
                } else if (e.y < miny) {
                    miny = e.y
                }
                break
            case PainterPathElementType.CurveToElement: {
                const p0 = this.m_elements[i - 1]
                const p2 = this.m_elements[i + 1]
                const p3 = this.m_elements[i + 2]
                const b = new Bezier(p0.x, p0.y, e.x, e.y, p2.x, p2.y, p3.x, p3.y)
                const r = painterpathBezierExtrema(b)
                if (r.x() < minx) {
                    minx = r.x()
                }
                if (r.right() > maxx) {
                    maxx = r.right()
                }
                if (r.y() < miny) {
                    miny = r.y()
                }
                if (r.bottom() > maxy) {
                    maxy = r.bottom()
                }
                i += 2
                break
            }
            default:
                break
            }
        }
        this.m_bounds = new RectF(minx, miny, maxx - minx, maxy - miny)
    }
}

function findEllipseCoords(r: RectF, angle: number, length: number): [PointF, PointF] {
    if (r.isNull()) {
        return [new PointF(), new PointF()]
    }
    const w2 = r.width() / 2
    const h2 = r.height() / 2
    const angles = [angle, angle + length]
    const result: PointF[] = []
    for (let i = 0; i < 2; ++i) {
        const theta = angles[i] - 360 * Math.floor(angles[i] / 360)
        let t = theta / 90
        // truncate
        const quadrant = Math.trunc(t)
        t -= quadrant
        t = angleForArc(90 * t)
        // swap x and y?
        if (quadrant & 1) {
            t = 1 - t
        }
        const [a, b, c, d] = Bezier.coefficients(t)
        let px = a + b + c * pathKappa
        let py = d + c + b * pathKappa
        // left quadrants
        if (quadrant === 1 || quadrant === 2) {
            px = -px
        }
        // top quadrants
        if (quadrant === 0 || quadrant === 1) {
            py = -py
        }
        result.push(r.center().plus(new PointF(w2 * px, h2 * py)))
    }
    return [result[0], result[1]]
}

/** Fills `curves` with control points, returns start point */
function curvesForArc(rect: RectF, startAngle: number, sweepLength: number, curves: PointF[]): PointF {
    curves.length = 0
    if (Number.isNaN(rect.x()) || Number.isNaN(rect.y()) || Number.isNaN(rect.width()) || Number.isNaN(rect.height())
        || Number.isNaN(startAngle) || Number.isNaN(sweepLength)) {
        return new PointF()
    }
    if (rect.isNull()) {
        return new PointF()
    }

    const x = rect.x()
    const y = rect.y()
    const w = rect.width()
    const w2 = rect.width() / 2
    const w2k = w2 * pathKappa
    const h = rect.height()
    const h2 = rect.height() / 2
    const h2k = h2 * pathKappa

    const points = [
        // start point
        new PointF(x + w, y + h2),
        // 0 -> 270 degrees
        new PointF(x + w, y + h2 + h2k),
        new PointF(x + w2 + w2k, y + h),
        new PointF(x + w2, y + h),
        // 270 -> 180 degrees
        new PointF(x + w2 - w2k, y + h),
        new PointF(x, y + h2 + h2k),
        new PointF(x, y + h2),
        // 180 -> 90 degrees
        new PointF(x, y + h2 - h2k),
        new PointF(x + w2 - w2k, y),
        new PointF(x + w2, y),
        // 90 -> 0 degrees
        new PointF(x + w2 + w2k, y),
        new PointF(x + w, y + h2 - h2k),
        new PointF(x + w, y + h2),
    ]

    if (sweepLength > 360) {
        sweepLength = 360
    } else if (sweepLength < -360) {
        sweepLength = -360
    }

    // Special case fast paths
    if (RealIsNull(startAngle)) {
        if (RealIsEqual(sweepLength, 360.0)) {
            for (let i = 11; i >= 0; --i) {
                curves.push(points[i])
            }
            return points[12]
        } else if (RealIsEqual(sweepLength, -360.0)) {
            for (let i = 1; i <= 12; ++i) {
                curves.push(points[i])
            }
            return points[0]
        }
    }

    let startSegment = Math.floor(startAngle / 90)
    let endSegment = Math.floor((startAngle + sweepLength) / 90)

    let startT = (startAngle - startSegment * 90) / 90
    let endT = (startAngle + sweepLength - endSegment * 90) / 90

    const delta = sweepLength > 0 ? 1 : -1
    if (delta < 0) {
        startT = 1 - startT
        endT = 1 - endT
    }

    // avoid empty start segment
    if (RealIsNull(startT - 1)) {
        startT = 0.0
        startSegment += delta
    }

    // avoid empty end segment
    if (RealIsNull(endT)) {
        endT = 1
        endSegment -= delta
    }

    startT = angleForArc(startT * 90)
    endT = angleForArc(endT * 90)

    const splitAtStart = !RealIsNull(startT)
    const splitAtEnd = !RealIsNull(endT - 1)

    const end = endSegment + delta

    // empty arc?
    if (startSegment === end) {
        const quadrant = 3 - ((startSegment % 4) + 4) % 4
        const j = 3 * quadrant
        return delta > 0 ? points[j + 3] : points[j]
    }

    const [startPoint, endPoint] = findEllipseCoords(rect, startAngle, sweepLength)

    for (let i = startSegment; i !== end; i += delta) {
        const quadrant = 3 - ((i % 4) + 4) % 4
        const j = 3 * quadrant

        let b: Bezier
        if (delta > 0) {
            b = Bezier.fromPoints(points[j + 3], points[j + 2], points[j + 1], points[j])
        } else {
            b = Bezier.fromPoints(points[j], points[j + 1], points[j + 2], points[j + 3])
        }

        // empty arc?
        if (startSegment === endSegment && RealIsEqual(startT, endT)) {
            return startPoint
        }

        if (i === startSegment) {
            if (i === endSegment && splitAtEnd) {
                b = b.bezierOnInterval(startT, endT)
            } else if (splitAtStart) {
                b = b.bezierOnInterval(startT, 1)
            }
        } else if (i === endSegment && splitAtEnd) {
            b = b.bezierOnInterval(0, endT)
        }

        // push control points
        curves.push(b.pt2())
        curves.push(b.pt3())
        curves.push(b.pt4())
    }

    curves[curves.length - 1] = endPoint
    return startPoint
}

function angleForArc(angle: number): number {
    if (RealIsNull(angle)) {
        return 0
    }
    if (RealIsEqual(angle, 90)) {
        return 1
    }

    const radians = angle * (Math.PI / 180)
    const cosAngle = Math.cos(radians)
    const sinAngle = Math.sin(radians)

    // initial guess
    let tc = angle / 90
    // do some iterations of newton's method to approximate cosAngle
    // finds the zero of the function b.pointAt(tc).x() - cosAngle
    tc -= ((((2 - 3 * pathKappa) * tc + 3 * (pathKappa - 1)) * tc) * tc + 1 - cosAngle) // value
          / (((6 - 9 * pathKappa) * tc + 6 * (pathKappa - 1)) * tc) // derivative
    tc -= ((((2 - 3 * pathKappa) * tc + 3 * (pathKappa - 1)) * tc) * tc + 1 - cosAngle) // value
          / (((6 - 9 * pathKappa) * tc + 6 * (pathKappa - 1)) * tc) // derivative

    // initial guess
    let ts = tc
    // do some iterations of newton's method to approximate sinAngle
    // finds the zero of the function b.pointAt(tc).y() - sinAngle
    ts -= ((((3 * pathKappa - 2) * ts - 6 * pathKappa + 3) * ts + 3 * pathKappa) * ts - sinAngle)
          / (((9 * pathKappa - 6) * ts + 12 * pathKappa - 6) * ts + 3 * pathKappa)
    ts -= ((((3 * pathKappa - 2) * ts - 6 * pathKappa + 3) * ts + 3 * pathKappa) * ts - sinAngle)
          / (((9 * pathKappa - 6) * ts + 12 * pathKappa - 6) * ts + 3 * pathKappa)

    // use the average of the t that best approximates cosAngle
    // and the t that best approximates sinAngle
    return 0.5 * (tc + ts)
}

function painterpathBezierExtrema(b: Bezier): RectF {
    let minx: number, miny: number, maxx: number, maxy: number

    // initialize with end points
    if (b.m_x1 < b.m_x4) {
        minx = b.m_x1
        maxx = b.m_x4
    } else {
        minx = b.m_x4
        maxx = b.m_x1
    }

    if (b.m_y1 < b.m_y4) {
        miny = b.m_y1
        maxy = b.m_y4
    } else {
        miny = b.m_y4
        maxy = b.m_y1
    }

    const checkT = (t: number): void => {
        if (t >= 0 && t <= 1) {
            const p = b.pointAt(t)
            if (p.x() < minx) {
                minx = p.x()
            } else if (p.x() > maxx) {
                maxx = p.x()
            }
            if (p.y() < miny) {
                miny = p.y()
            } else if (p.y() > maxy) {
                maxy = p.y()
            }
        }
    }

    // Update for the X extrema
    {
        const ax = 3 * (-b.m_x1 + 3 * b.m_x2 - 3 * b.m_x3 + b.m_x4)
        const bx = 6 * (b.m_x1 - 2 * b.m_x2 + b.m_x3)
        const cx = 3 * (-b.m_x1 + b.m_x2)
        // specialcase quadratic curves to avoid div by zero
        if (RealIsNull(ax)) {
            // linear curves are covered by initialization.
            if (!RealIsNull(bx)) {
                checkT(-cx / bx)
            }
        } else {
            const tx = bx * bx - 4 * ax * cx
            if (tx >= 0) {
                const temp = Math.sqrt(tx)
                const rcp = 1 / (2 * ax)
                checkT((-bx + temp) * rcp)
                checkT((-bx - temp) * rcp)
            }
        }
    }

    // Update for the Y extrema
    {
        const ay = 3 * (-b.m_y1 + 3 * b.m_y2 - 3 * b.m_y3 + b.m_y4)
        const by = 6 * (b.m_y1 - 2 * b.m_y2 + b.m_y3)
        const cy = 3 * (-b.m_y1 + b.m_y2)
        // specialcase quadratic curves to avoid div by zero
        if (RealIsNull(ay)) {
            // linear curves are covered by initialization.
            if (!RealIsNull(by)) {
                checkT(-cy / by)
            }
        } else {
            const ty = by * by - 4 * ay * cy
            if (ty > 0) {
                const temp = Math.sqrt(ty)
                const rcp = 1 / (2 * ay)
                checkT((-by + temp) * rcp)
                checkT((-by - temp) * rcp)
            }
        }
    }

    return new RectF(minx, miny, maxx - minx, maxy - miny)
}
