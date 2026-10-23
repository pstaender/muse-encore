/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/geometry.h
 *
 * NOTE: In C++ these are value types. In TypeScript they are reference types,
 * so every API that stores a point/rect must copy it (see clone()).
 * Methods that return a modified copy never mutate `this`.
 */

import { isEqual, isZero } from '../../global/realfn'

// ====================================
// Point
// ====================================

export class PointF {
    constructor(public x_ = 0, public y_ = 0) {}

    static fromXY(p: { x: number; y: number }): PointF { return new PointF(p.x, p.y) }

    clone(): PointF { return new PointF(this.x_, this.y_) }

    isNull(): boolean { return isZero(this.x_) && isZero(this.y_) }

    x(): number { return this.x_ }
    y(): number { return this.y_ }
    setX(x: number): void { this.x_ = x }
    setY(y: number): void { this.y_ = y }
    setXY(x: number, y: number): void { this.x_ = x; this.y_ = y }

    equals(p: PointF): boolean { return isEqual(p.x_, this.x_) && isEqual(p.y_, this.y_) }

    neg(): PointF { return new PointF(-this.x_, -this.y_) }
    plus(p: PointF): PointF { return new PointF(this.x_ + p.x_, this.y_ + p.y_) }
    minus(p: PointF): PointF { return new PointF(this.x_ - p.x_, this.y_ - p.y_) }
    times(c: number): PointF { return new PointF(this.x_ * c, this.y_ * c) }
    div(c: number): PointF { return new PointF(this.x_ / c, this.y_ / c) }

    /** in place += */
    add(p: PointF): this { this.x_ += p.x_; this.y_ += p.y_; return this }
    /** in place -= */
    sub(p: PointF): this { this.x_ -= p.x_; this.y_ -= p.y_; return this }
    /** in place *= */
    mul(c: number): this { this.x_ *= c; this.y_ *= c; return this }

    manhattanLength(): number { return Math.abs(this.x_) + Math.abs(this.y_) }

    static dotProduct(p1: PointF, p2: PointF): number { return p1.x_ * p2.x_ + p1.y_ * p2.y_ }

    normalized(): PointF {
        const len = this.x_ * this.x_ + this.y_ * this.y_
        if (Math.abs(len - 1.0) <= 0.000000001 || Math.abs(len) <= 0.000000001) {
            return this.clone()
        }
        const l = Math.sqrt(len)
        return new PointF(this.x_ / l, this.y_ / l)
    }

    toString(): string { return `{x: ${this.x_}, y: ${this.y_}}` }
}

export type PairF = [number, number]

// ====================================
// Line
// ====================================

export class LineF {
    private m_p1: PointF
    private m_p2: PointF

    constructor(p1?: PointF | number, p2?: PointF | number, x2?: number, y2?: number) {
        if (typeof p1 === 'number') {
            this.m_p1 = new PointF(p1, p2 as number)
            this.m_p2 = new PointF(x2, y2)
        } else {
            this.m_p1 = p1 ? p1.clone() : new PointF()
            this.m_p2 = p2 ? (p2 as PointF).clone() : new PointF()
        }
    }

    clone(): LineF { return new LineF(this.m_p1, this.m_p2) }
    isNull(): boolean { return this.m_p1.isNull() && this.m_p2.isNull() }
    p1(): PointF { return this.m_p1 }
    p2(): PointF { return this.m_p2 }
    x1(): number { return this.m_p1.x() }
    y1(): number { return this.m_p1.y() }
    x2(): number { return this.m_p2.x() }
    y2(): number { return this.m_p2.y() }
    setP1(p: PointF): void { this.m_p1 = p.clone() }
    setP2(p: PointF): void { this.m_p2 = p.clone() }
    setLine(x1: number, y1: number, x2: number, y2: number): void {
        this.m_p1 = new PointF(x1, y1)
        this.m_p2 = new PointF(x2, y2)
    }
    pointAt(t: number): PointF {
        return new PointF(this.m_p1.x() + (this.m_p2.x() - this.m_p1.x()) * t, this.m_p1.y() + (this.m_p2.y() - this.m_p1.y()) * t)
    }
    translate(p: PointF): void { this.m_p1.add(p); this.m_p2.add(p) }
    translated(p: PointF): LineF { return new LineF(this.m_p1.plus(p), this.m_p2.plus(p)) }
    length(): number { return Math.hypot(this.x2() - this.x1(), this.y2() - this.y1()) }
}

// ====================================
// Size
// ====================================

export class SizeF {
    constructor(public w_ = 0, public h_ = 0) {}
    clone(): SizeF { return new SizeF(this.w_, this.h_) }
    isNull(): boolean { return isZero(this.w_) && isZero(this.h_) }
    width(): number { return this.w_ }
    height(): number { return this.h_ }
    setWidth(w: number): void { this.w_ = w }
    setHeight(h: number): void { this.h_ = h }
    equals(s: SizeF): boolean { return isEqual(s.w_, this.w_) && isEqual(s.h_, this.h_) }
    times(c: number): SizeF { return new SizeF(this.w_ * c, this.h_ * c) }
    transposed(): SizeF { return new SizeF(this.h_, this.w_) }
}

export class ScaleF extends SizeF {
    override clone(): ScaleF { return new ScaleF(this.w_, this.h_) }
}

// ====================================
// Rect
// ====================================

export class RectF {
    constructor(public x_ = 0, public y_ = 0, public w_ = 0, public h_ = 0) {}

    static fromPoints(topLeft: PointF, bottomRight: PointF): RectF {
        return new RectF(topLeft.x(), topLeft.y(), bottomRight.x() - topLeft.x(), bottomRight.y() - topLeft.y())
    }

    static fromPointSize(topLeft: PointF, size: SizeF): RectF {
        return new RectF(topLeft.x(), topLeft.y(), size.width(), size.height())
    }

    clone(): RectF { return new RectF(this.x_, this.y_, this.w_, this.h_) }

    isNull(): boolean { return isZero(this.w_) && isZero(this.h_) }
    isEmpty(): boolean { return this.w_ <= 0 || this.h_ <= 0 }
    isValid(): boolean { return this.w_ > 0 && this.h_ > 0 }

    x(): number { return this.x_ }
    y(): number { return this.y_ }
    width(): number { return this.w_ }
    height(): number { return this.h_ }
    size(): SizeF { return new SizeF(this.w_, this.h_) }

    left(): number { return this.x_ }
    top(): number { return this.y_ }
    right(): number { return this.x_ + this.w_ }
    bottom(): number { return this.y_ + this.h_ }

    topLeft(): PointF { return new PointF(this.x_, this.y_) }
    bottomRight(): PointF { return new PointF(this.x_ + this.w_, this.y_ + this.h_) }
    topRight(): PointF { return new PointF(this.x_ + this.w_, this.y_) }
    bottomLeft(): PointF { return new PointF(this.x_, this.y_ + this.h_) }
    center(): PointF { return new PointF(this.x_ + this.w_ / 2, this.y_ + this.h_ / 2) }

    setCoords(x1: number, y1: number, x2: number, y2: number): void {
        this.x_ = x1; this.y_ = y1; this.w_ = x2 - x1; this.h_ = y2 - y1
    }
    setRect(x: number, y: number, w: number, h: number): void { this.x_ = x; this.y_ = y; this.w_ = w; this.h_ = h }
    setHeight(h: number): void { this.h_ = h }
    setWidth(w: number): void { this.w_ = w }
    setSize(s: SizeF): void { this.w_ = s.width(); this.h_ = s.height() }
    setLeft(pos: number): void { const diff = pos - this.x_; this.x_ += diff; this.w_ -= diff }
    setRight(pos: number): void { this.w_ = pos - this.x_ }
    setTop(pos: number): void { const diff = pos - this.y_; this.y_ += diff; this.h_ -= diff }
    setBottom(pos: number): void { this.h_ = pos - this.y_ }
    setX(x: number): void { this.x_ = x }
    setY(y: number): void { this.y_ = y }
    setTopLeft(p: PointF): void { this.setLeft(p.x()); this.setTop(p.y()) }
    setTopRight(p: PointF): void { this.setRight(p.x()); this.setTop(p.y()) }
    setBottomLeft(p: PointF): void { this.setLeft(p.x()); this.setBottom(p.y()) }
    setBottomRight(p: PointF): void { this.setRight(p.x()); this.setBottom(p.y()) }

    equals(r: RectF): boolean {
        return isEqual(r.x_, this.x_) && isEqual(r.y_, this.y_) && isEqual(r.w_, this.w_) && isEqual(r.h_, this.h_)
    }

    moveTo(x: number, y: number): void { this.x_ = x; this.y_ = y }
    moveCenter(p: PointF): void { this.x_ = p.x() - this.w_ / 2; this.y_ = p.y() - this.h_ / 2 }
    moveTop(pos: number): void { this.y_ = pos }

    translate(dx: number | PointF, dy?: number): this {
        if (dx instanceof PointF) {
            this.x_ += dx.x(); this.y_ += dx.y()
        } else {
            this.x_ += dx; this.y_ += dy ?? 0
        }
        return this
    }

    translated(dx: number | PointF, dy?: number): RectF {
        return this.clone().translate(dx, dy)
    }

    adjust(x1: number, y1: number, x2: number, y2: number): this {
        this.x_ += x1; this.y_ += y1; this.w_ += x2 - x1; this.h_ += y2 - y1
        return this
    }

    adjusted(x1: number, y1: number, x2: number, y2: number): RectF {
        return new RectF(this.x_ + x1, this.y_ + y1, this.w_ + x2 - x1, this.h_ + y2 - y1)
    }

    pad(p: number): this { return this.adjust(-p, -p, p, p) }
    padded(p: number): RectF { return this.adjusted(-p, -p, p, p) }

    scale(mag: SizeF): this {
        this.x_ *= mag.width(); this.y_ *= mag.height(); this.w_ *= mag.width(); this.h_ *= mag.height()
        return this
    }

    scaled(mag: SizeF): RectF { return this.clone().scale(mag) }

    united(r: RectF): RectF {
        if (this.isNull()) {
            return r.clone()
        }
        if (r.isNull()) {
            return this.clone()
        }

        let left = this.x_
        let right = this.x_
        if (this.w_ < 0) {
            left += this.w_
        } else {
            right += this.w_
        }
        if (r.w_ < 0) {
            left = Math.min(left, r.x_ + r.w_)
            right = Math.max(right, r.x_)
        } else {
            left = Math.min(left, r.x_)
            right = Math.max(right, r.x_ + r.w_)
        }

        let top = this.y_
        let bottom = this.y_
        if (this.h_ < 0) {
            top += this.h_
        } else {
            bottom += this.h_
        }
        if (r.h_ < 0) {
            top = Math.min(top, r.y_ + r.h_)
            bottom = Math.max(bottom, r.y_)
        } else {
            top = Math.min(top, r.y_)
            bottom = Math.max(bottom, r.y_ + r.h_)
        }

        return new RectF(left, top, right - left, bottom - top)
    }

    unite(r: RectF): this {
        const u = this.united(r)
        this.setRect(u.x_, u.y_, u.w_, u.h_)
        return this
    }

    private static hspan(r: RectF): [number, number] {
        return r.w_ < 0 ? [r.x_ + r.w_, r.x_] : [r.x_, r.x_ + r.w_]
    }

    private static vspan(r: RectF): [number, number] {
        return r.h_ < 0 ? [r.y_ + r.h_, r.y_] : [r.y_, r.y_ + r.h_]
    }

    intersected(r: RectF): RectF {
        const [l1, r1] = RectF.hspan(this)
        if (isEqual(l1, r1)) {
            return new RectF()
        }
        const [l2, r2] = RectF.hspan(r)
        if (isEqual(l2, r2)) {
            return new RectF()
        }
        if (l1 >= r2 || l2 >= r1) {
            return new RectF()
        }
        const [t1, b1] = RectF.vspan(this)
        if (isEqual(t1, b1)) {
            return new RectF()
        }
        const [t2, b2] = RectF.vspan(r)
        if (isEqual(t2, b2)) {
            return new RectF()
        }
        if (t1 >= b2 || t2 >= b1) {
            return new RectF()
        }
        const x = Math.max(l1, l2)
        const y = Math.max(t1, t2)
        return new RectF(x, y, Math.min(r1, r2) - x, Math.min(b1, b2) - y)
    }

    intersects(r: RectF): boolean {
        const [l1, r1] = RectF.hspan(this)
        if (isEqual(l1, r1)) {
            return false
        }
        const [l2, r2] = RectF.hspan(r)
        if (isEqual(l2, r2)) {
            return false
        }
        if (l1 >= r2 || l2 >= r1) {
            return false
        }
        const [t1, b1] = RectF.vspan(this)
        if (isEqual(t1, b1)) {
            return false
        }
        const [t2, b2] = RectF.vspan(r)
        if (isEqual(t2, b2)) {
            return false
        }
        if (t1 >= b2 || t2 >= b1) {
            return false
        }
        return true
    }

    contains(p: PointF | RectF): boolean {
        const [l, r] = RectF.hspan(this)
        if (isEqual(l, r)) {
            return false
        }
        const [t, b] = RectF.vspan(this)
        if (isEqual(t, b)) {
            return false
        }
        if (p instanceof PointF) {
            return !(p.x() < l || p.x() > r || p.y() < t || p.y() > b)
        }
        const [l2, r2] = RectF.hspan(p)
        if (isEqual(l2, r2)) {
            return false
        }
        const [t2, b2] = RectF.vspan(p)
        if (isEqual(t2, b2)) {
            return false
        }
        return !(l2 < l || r2 > r || t2 < t || b2 > b)
    }

    distanceTo(p: PointF): number {
        const dx = Math.max(this.left() - p.x(), 0.0, p.x() - this.right())
        const dy = Math.max(this.bottom() - p.y(), 0.0, p.y() - this.top())
        return Math.sqrt(dx * dx + dy * dy)
    }

    normalized(): RectF {
        const r = this.clone()
        if (r.w_ < 0) {
            r.x_ += r.w_
            r.w_ = -r.w_
        }
        if (r.h_ < 0) {
            r.y_ += r.h_
            r.h_ = -r.h_
        }
        return r
    }

    toString(): string { return `{x: ${this.x_}, y: ${this.y_}, w: ${this.w_}, h: ${this.h_}}` }
}

// ====================================
// Polygon
// ====================================

export class PolygonF extends Array<PointF> {
    static fromPoints(points: readonly PointF[]): PolygonF {
        const p = new PolygonF()
        for (const pt of points) {
            p.push(pt.clone())
        }
        return p
    }

    translate(offset: PointF): void {
        if (offset.isNull()) {
            return
        }
        for (const p of this) {
            p.add(offset)
        }
    }

    translated(offset: PointF): PolygonF {
        const copy = PolygonF.fromPoints(this)
        copy.translate(offset)
        return copy
    }

    boundingRect(): RectF {
        if (this.length === 0) {
            return new RectF(0, 0, 0, 0)
        }
        let minx = this[0].x()
        let maxx = minx
        let miny = this[0].y()
        let maxy = miny
        for (let i = 1; i < this.length; ++i) {
            const p = this[i]
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
        return new RectF(minx, miny, maxx - minx, maxy - miny)
    }
}
