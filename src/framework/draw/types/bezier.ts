/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/bezier.h/.cpp
 */

import { RealIsEqual, RealIsNull } from '../../global/realfn'
import { PointF } from './geometry'

export class Bezier {
    constructor(
        public m_x1 = 0, public m_y1 = 0,
        public m_x2 = 0, public m_y2 = 0,
        public m_x3 = 0, public m_y3 = 0,
        public m_x4 = 0, public m_y4 = 0) {}

    static fromPoints(p1: PointF, p2: PointF, p3: PointF, p4: PointF): Bezier {
        return new Bezier(p1.x(), p1.y(), p2.x(), p2.y(), p3.x(), p3.y(), p4.x(), p4.y())
    }

    clone(): Bezier {
        return new Bezier(this.m_x1, this.m_y1, this.m_x2, this.m_y2, this.m_x3, this.m_y3, this.m_x4, this.m_y4)
    }

    /** returns [a, b, c, d] */
    static coefficients(t: number): [number, number, number, number] {
        const t1 = 1 - t
        let b = t1 * t1
        let c = t * t
        const d = c * t
        const a = b * t1
        b *= 3 * t
        c *= 3 * t1
        return [a, b, c, d]
    }

    bezierOnInterval(t0: number, t1: number): Bezier {
        if (RealIsNull(t0) && RealIsEqual(t1, 1)) {
            return this.clone()
        }
        const bezier = this.clone()
        const result = new Bezier()
        bezier.parameterSplitLeft(t0, result)
        const trueT = (t1 - t0) / (1 - t0)
        bezier.parameterSplitLeft(trueT, result)
        return result
    }

    pt1(): PointF { return new PointF(this.m_x1, this.m_y1) }
    pt2(): PointF { return new PointF(this.m_x2, this.m_y2) }
    pt3(): PointF { return new PointF(this.m_x3, this.m_y3) }
    pt4(): PointF { return new PointF(this.m_x4, this.m_y4) }

    pointAt(t: number): PointF {
        // numerically more stable:
        const t1 = 1 - t
        let a = this.m_x1 * t1 + this.m_x2 * t
        let b = this.m_x2 * t1 + this.m_x3 * t
        let c = this.m_x3 * t1 + this.m_x4 * t
        a = a * t1 + b * t
        b = b * t1 + c * t
        const x = a * t1 + b * t

        a = this.m_y1 * t1 + this.m_y2 * t
        b = this.m_y2 * t1 + this.m_y3 * t
        c = this.m_y3 * t1 + this.m_y4 * t
        a = a * t1 + b * t
        b = b * t1 + c * t
        const y = a * t1 + b * t
        return new PointF(x, y)
    }

    private parameterSplitLeft(t: number, left: Bezier): void {
        left.m_x1 = this.m_x1
        left.m_y1 = this.m_y1

        left.m_x2 = this.m_x1 + t * (this.m_x2 - this.m_x1)
        left.m_y2 = this.m_y1 + t * (this.m_y2 - this.m_y1)

        left.m_x3 = this.m_x2 + t * (this.m_x3 - this.m_x2) // temporary holding spot
        left.m_y3 = this.m_y2 + t * (this.m_y3 - this.m_y2) // temporary holding spot

        this.m_x3 = this.m_x3 + t * (this.m_x4 - this.m_x3)
        this.m_y3 = this.m_y3 + t * (this.m_y4 - this.m_y3)

        this.m_x2 = left.m_x3 + t * (this.m_x3 - left.m_x3)
        this.m_y2 = left.m_y3 + t * (this.m_y3 - left.m_y3)

        left.m_x3 = left.m_x2 + t * (left.m_x3 - left.m_x2)
        left.m_y3 = left.m_y2 + t * (left.m_y3 - left.m_y2)

        left.m_x4 = this.m_x1 = left.m_x3 + t * (this.m_x2 - left.m_x3)
        left.m_y4 = this.m_y1 = left.m_y3 + t * (this.m_y2 - left.m_y3)
    }
}
