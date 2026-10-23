/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/easeInOut.h/.cpp
 */

import { RealIsNull } from '../../framework/global/realfn'

/** std::lround: half away from zero */
function lround(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * Specialized transfer curve using an underlying Bezier curve.
 * The second and third control points of the Bezier curve are moveable along the x axis according to two
 * parameters 'EaseIn' and 'EaseOut', which results in a transfer curve that goes from a straight line to an S
 * shaped curve.
 */
export class EaseInOut {
    constructor(private m_easeIn = 0.0, private m_easeOut = 1.0) {}

    SetEases(easeIn: number, easeOut: number): void {
        this.m_easeIn = easeIn
        this.m_easeOut = easeOut
    }

    EvalX(t: number): number {
        const tCompl = 1.0 - t
        return (3.0 * this.m_easeIn * tCompl * tCompl + (3.0 - 3.0 * this.m_easeOut * tCompl - 2.0 * t) * t) * t
    }

    EvalY(t: number): number { return -(t * t) * (2.0 * t - 3.0) }

    YfromX(x: number): number { return this.EvalY(this.tFromX(x)) }
    XfromY(y: number): number { return this.EvalX(this.tFromY(y)) }

    // The following function is inspired by "A Primer on Bézier Curve" sections 17 and 23 by Pomax:
    // https://pomax.github.io/bezierinfo/
    // However, the function is greatly specialized, simplified and optimized for use as an ease-in and
    // ease-out transfer curve for bends, glissandi and portamenti in MuseScore. The function computes
    // Y from X by performing a cubic root finding to compute t from X on the X component of the
    // transfer curve and then a cubic Bezier evaluation to compute Y from t on the Y component of the
    // transfer curve. The code could be simplified because the Bezier curve is constrained as a well
    // defined transfer function. It is not suitable for general or arbitrary Bezier curve work. -YP
    tFromX(x: number): number {
        const pi = 3.14159265358979323846
        const w1 = this.m_easeIn - x
        const w2 = 1.0 - this.m_easeOut - x
        const d = x + 3.0 * w1 - 3.0 * w2 + (1.0 - x)
        const a = (-3.0 * x - 6.0 * w1 + 3 * w2) / d
        const b = (3.0 * x + 3.0 * w1) / d
        const c = -x / d
        const a2 = a * a
        const p = (3.0 * b - a2) / 3.0
        const q = (2.0 * a2 * a - 9.0 * a * b + 27.0 * c) / 27.0
        const discr = (q * q) / 4.0 + (p * p * p) / 27.0
        let t = 0.0
        // Crazy idea to first test the least probable case with such an expensive test but...
        if (RealIsNull(discr)) {
            // Case that happens extremely rarely --> 2 roots.
            const q2 = q / 2.0
            const u = q2 < 0.0 ? Math.pow(-q2, 1.0 / 3.0) : -Math.pow(q2, 1.0 / 3.0)
            // Find the only root that is within the 0 to 1 interval.
            t = 2.0 * u - a / 3.0
            if (0.0 > t || t > 1.0) {
                t = -u - a / 3.0
            }
        } else if (discr < 0.0) {
            // Case that happens about 75% of the time --> 3 roots.
            const mp3 = -p / 3.0
            const r = Math.sqrt(mp3 * mp3 * mp3)
            const phi = Math.acos(Math.min(Math.max(-1.0, -q / (2.0 * r)), 1.0))
            const t1 = 2.0 * Math.pow(r, 1.0 / 3.0)
            // Find the only root that is within the 0 to 1 interval.
            t = t1 * Math.cos(phi / 3.0) - a / 3.0
            if (0.0 > t || t > 1.0) {
                t = t1 * Math.cos((phi + 2.0 * pi) / 3.0) - a / 3.0
                if (0.0 > t || t > 1.0) {
                    t = t1 * Math.cos((phi + 4.0 * pi) / 3.0) - a / 3.0
                }
            }
        } else if (discr > 0.0) {
            // Case that happens about 25% of the time --> 1 root.
            const q2 = q / 2.0
            const sd = Math.sqrt(discr)
            const u = Math.pow(-q2 + sd, 1.0 / 3.0)
            const v = Math.pow(q2 + sd, 1.0 / 3.0)
            t = u - v - a / 3.0
        }
        return t
    }

    // This function is even more simplified and optimized because all the Bezier control points are
    // constant. Thus, when computing the Y root there is only one case and the math simplifies to the
    // following simple expression.
    tFromY(y: number): number {
        return 0.5 + Math.cos((4.0 * Math.PI + Math.acos(1.0 - 2.0 * y)) / 3.0)
    }

    /**
     * Given a number of note to place within the given duration, return the list of on-times for each
     * note given the current ease-in and ease-out parameters.
     */
    timeList(nbNotes: number, duration: number, times: number[]): void {
        const nNotes = nbNotes
        const space = duration
        if (RealIsNull(this.m_easeIn) && RealIsNull(this.m_easeOut)) {
            for (let n = 0; n <= nbNotes; n++) {
                times.push(lround((n / nNotes) * space))
            }
        } else {
            for (let n = 0; n <= nbNotes; n++) {
                times.push(lround(this.XfromY(n / nNotes) * space))
            }
        }
    }
}
