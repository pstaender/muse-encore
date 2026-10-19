/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/fraction.h
 *
 * Immutable in TypeScript: all arithmetic returns a new Fraction.
 */

import { Constants } from './constants'

function gcd(a: number, b: number): number {
    a = Math.abs(a)
    b = Math.abs(b)
    while (b) {
        const t = b
        b = a % b
        a = t
    }
    return a
}

export class Fraction {
    private readonly m_numerator: number
    private readonly m_denominator: number

    constructor(z = 0, n = 1) {
        this.m_numerator = n < 0 ? -z : z
        this.m_denominator = n < 0 ? -n : n
    }

    numerator(): number { return this.m_numerator }
    denominator(): number { return this.m_denominator }

    /** Use this when you need to initialize a Fraction to an arbitrary high value */
    static max(): Fraction { return new Fraction(2147483647, 1) }

    isZero(): boolean { return this.m_numerator === 0 }
    isNotZero(): boolean { return this.m_numerator !== 0 }
    negative(): boolean { return this.m_numerator < 0 }
    positive(): boolean { return this.m_numerator >= 0 }
    isValid(): boolean { return this.m_denominator !== 0 }

    /** check if two fractions are identical (numerator & denominator) */
    identical(v: Fraction): boolean {
        return this.m_numerator === v.m_numerator && this.m_denominator === v.m_denominator
    }

    absValue(): Fraction { return new Fraction(Math.abs(this.m_numerator), this.m_denominator) }
    inverse(): Fraction { return new Fraction(this.m_denominator, this.m_numerator) }

    reduced(): Fraction {
        const g = gcd(this.m_numerator, this.m_denominator)
        if (g) {
            return new Fraction(this.m_numerator / g, this.m_denominator / g)
        }
        return this
    }

    // comparison
    lt(v: Fraction): boolean { return this.m_numerator * v.m_denominator < v.m_numerator * this.m_denominator }
    le(v: Fraction): boolean { return this.m_numerator * v.m_denominator <= v.m_numerator * this.m_denominator }
    ge(v: Fraction): boolean { return this.m_numerator * v.m_denominator >= v.m_numerator * this.m_denominator }
    gt(v: Fraction): boolean { return this.m_numerator * v.m_denominator > v.m_numerator * this.m_denominator }
    eq(v: Fraction): boolean { return this.m_numerator * v.m_denominator === v.m_numerator * this.m_denominator }
    ne(v: Fraction): boolean { return !this.eq(v) }

    compare(v: Fraction): number {
        const a = this.m_numerator * v.m_denominator
        const b = v.m_numerator * this.m_denominator
        return a < b ? -1 : a > b ? 1 : 0
    }

    // arithmetic
    plus(v: Fraction): Fraction {
        if (this.m_denominator === v.m_denominator) {
            return new Fraction(this.m_numerator + v.m_numerator, this.m_denominator)
        }
        const g = gcd(this.m_denominator, v.m_denominator)
        if (g) {
            const m1 = v.m_denominator / g
            return new Fraction(this.m_numerator * m1 + v.m_numerator * (this.m_denominator / g), m1 * this.m_denominator)
        }
        return this
    }

    minus(v: Fraction): Fraction {
        if (this.m_denominator === v.m_denominator) {
            return new Fraction(this.m_numerator - v.m_numerator, this.m_denominator)
        }
        const g = gcd(this.m_denominator, v.m_denominator)
        if (g) {
            const m1 = v.m_denominator / g
            return new Fraction(this.m_numerator * m1 - v.m_numerator * (this.m_denominator / g), m1 * this.m_denominator)
        }
        return this
    }

    neg(): Fraction { return new Fraction(-this.m_numerator, this.m_denominator) }

    times(v: Fraction | number): Fraction {
        if (typeof v === 'number') {
            return new Fraction(this.m_numerator * v, this.m_denominator)
        }
        const r = new Fraction(this.m_numerator * v.m_numerator, this.m_denominator * v.m_denominator)
        if (v.m_denominator > 1 || v.m_denominator < -1) {
            return r.reduced()
        }
        return r
    }

    div(v: Fraction | number): Fraction {
        if (typeof v === 'number') {
            let n = this.m_numerator
            let d = this.m_denominator * v
            if (d < 0) {
                d = -d
                n = -n
            }
            return new Fraction(n, d).reduced()
        }
        const sign = v.m_numerator >= 0 ? 1 : -1
        const r = new Fraction(this.m_numerator * sign * v.m_denominator, this.m_denominator * sign * v.m_numerator)
        if (v.m_numerator !== sign) {
            return r.reduced()
        }
        return r
    }

    // conversion
    ticks(): number {
        if (this.m_numerator === -1 && this.m_denominator === 1) { // HACK
            return -1
        }
        // Constants::division     - ticks per quarter note
        // Constants::division * 4 - ticks per whole note
        // result: rounded (Constants::division * 4 * m_numerator * 1.0 / m_denominator) value
        const sgn = this.m_numerator < 0 ? -1 : 1
        return sgn * Math.trunc((sgn * this.m_numerator * Constants.DIVISION * 4 + Math.trunc(this.m_denominator / 2)) / this.m_denominator)
    }

    static fromTicks(ticks: number): Fraction {
        if (ticks === -1) {
            return new Fraction(-1, 1) // HACK
        }
        return new Fraction(ticks, Constants.DIVISION * 4).reduced()
    }

    /** A very small fraction, corresponds to 1 MIDI tick */
    static eps(): Fraction { return new Fraction(1, Constants.DIVISION * 4) }

    toString(): string { return `${this.m_numerator}/${this.m_denominator}` }

    toDouble(): number { return this.m_numerator / this.m_denominator }

    static fromString(str: string): Fraction {
        const i = str.indexOf('/')
        if (i < 0) {
            return new Fraction(parseInt(str, 10) || 0, 1)
        }
        return new Fraction(parseInt(str.slice(0, i), 10) || 0, parseInt(str.slice(i + 1), 10) || 0)
    }

    static min(a: Fraction, b: Fraction): Fraction { return a.lt(b) ? a : b }
    static max2(a: Fraction, b: Fraction): Fraction { return a.gt(b) ? a : b }
}
