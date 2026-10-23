/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/transform.h (affine part only)
 *
 * Qt convention: x' = m11*x + m21*y + dx ; y' = m12*x + m22*y + dy
 */

import { LineF, PointF, RectF } from './geometry'
import type { PainterPath } from './painterpath'

export class Transform {
    constructor(
        public m11 = 1, public m12 = 0,
        public m21 = 0, public m22 = 1,
        public dx = 0, public dy = 0) {}

    clone(): Transform { return new Transform(this.m11, this.m12, this.m21, this.m22, this.dx, this.dy) }

    isIdentity(): boolean {
        return this.m11 === 1 && this.m12 === 0 && this.m21 === 0 && this.m22 === 1 && this.dx === 0 && this.dy === 0
    }

    /** this = t * this  (t is applied first, like QTransform::operator* with t on the left) */
    private premultiply(t: Transform): this {
        const m11 = t.m11 * this.m11 + t.m12 * this.m21
        const m12 = t.m11 * this.m12 + t.m12 * this.m22
        const m21 = t.m21 * this.m11 + t.m22 * this.m21
        const m22 = t.m21 * this.m12 + t.m22 * this.m22
        const dx = t.dx * this.m11 + t.dy * this.m21 + this.dx
        const dy = t.dx * this.m12 + t.dy * this.m22 + this.dy
        this.m11 = m11; this.m12 = m12; this.m21 = m21; this.m22 = m22; this.dx = dx; this.dy = dy
        return this
    }

    /** returns this * t (this applied first, then t) */
    multiplied(t: Transform): Transform {
        return t.clone().premultiply(this)
    }

    translate(dx: number, dy: number): this { return this.premultiply(new Transform(1, 0, 0, 1, dx, dy)) }
    scale(sx: number, sy: number): this { return this.premultiply(new Transform(sx, 0, 0, sy, 0, 0)) }
    shear(sh: number, sv: number): this { return this.premultiply(new Transform(1, sv, sh, 1, 0, 0)) }

    /** angle in degrees */
    rotate(a: number): this {
        const rad = a * Math.PI / 180
        let sina: number
        let cosa: number
        if (a === 90 || a === -270) {
            sina = 1; cosa = 0
        } else if (a === 270 || a === -90) {
            sina = -1; cosa = 0
        } else if (a === 180) {
            sina = 0; cosa = -1
        } else {
            sina = Math.sin(rad); cosa = Math.cos(rad)
        }
        return this.premultiply(new Transform(cosa, sina, -sina, cosa, 0, 0))
    }

    rotateRadians(a: number): this {
        const sina = Math.sin(a)
        const cosa = Math.cos(a)
        return this.premultiply(new Transform(cosa, sina, -sina, cosa, 0, 0))
    }

    reset(): void {
        this.m11 = 1; this.m12 = 0; this.m21 = 0; this.m22 = 1; this.dx = 0; this.dy = 0
    }

    determinant(): number { return this.m11 * this.m22 - this.m12 * this.m21 }

    /** QTransform::inverted() for affine transforms (returns identity if not invertible) */
    inverted(): Transform {
        const det = this.determinant()
        if (det === 0) {
            return new Transform()
        }
        const inv = 1.0 / det
        const h11 = this.m22 * inv
        const h12 = -this.m12 * inv
        const h21 = -this.m21 * inv
        const h22 = this.m11 * inv
        const hdx = (this.m21 * this.dy - this.m22 * this.dx) * inv
        const hdy = (this.m12 * this.dx - this.m11 * this.dy) * inv
        return new Transform(h11, h12, h21, h22, hdx, hdy)
    }

    mapPath(path: PainterPath): PainterPath {
        return path.mapped((x, y) => this.mapXY(x, y))
    }

    map(p: PointF): PointF {
        return new PointF(this.m11 * p.x() + this.m21 * p.y() + this.dx, this.m12 * p.x() + this.m22 * p.y() + this.dy)
    }

    mapXY(x: number, y: number): [number, number] {
        return [this.m11 * x + this.m21 * y + this.dx, this.m12 * x + this.m22 * y + this.dy]
    }

    mapLine(l: LineF): LineF { return new LineF(this.map(l.p1()), this.map(l.p2())) }

    mapRect(r: RectF): RectF {
        const pts = [r.topLeft(), r.topRight(), r.bottomLeft(), r.bottomRight()].map(p => this.map(p))
        const xs = pts.map(p => p.x())
        const ys = pts.map(p => p.y())
        const x0 = Math.min(...xs)
        const y0 = Math.min(...ys)
        return new RectF(x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0)
    }

    /** uniform scale factor, used for line widths */
    scaleFactor(): number {
        return Math.sqrt(Math.abs(this.m11 * this.m22 - this.m12 * this.m21))
    }
}
