/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_fraction.h/.cpp
 *
 * Immutable in TypeScript (like Fraction): `a += b` is `a = a.plus(b)`. Like C++, the results of the arithmetic are
 * not reduced (only operands with values >= 10000 are reduced before an operation, preventOverflow). The integer
 * arithmetic truncates like C++ int division; overflows of 32 bit ints are not emulated.
 */

import { Fraction } from '../../../../engraving/types/fraction'
import { Constants } from '../../../../engraving/types/constants'

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

/** least common multiple. always returns a positive val */
function lcm(a: number, b: number): number {
    const g = gcd(a, b)
    const l = Math.trunc(a / g) * b // Divide first to minimize overflow risk
    return l >= 0 ? l : -l
}

// helper function
function fractionPart(lcmPart: number, numerator: number, denominator: number): number {
    const part = Math.trunc(lcmPart / denominator)
    return numerator * part
}

export class ReducedFraction {
    private readonly numerator_: number
    private readonly denominator_: number

    constructor(z = 0, n = 1) {
        this.numerator_ = z
        this.denominator_ = n
    }

    static fromFraction(f: Fraction): ReducedFraction {
        return new ReducedFraction(f.numerator(), f.denominator())
    }

    fraction(): Fraction { return new Fraction(this.numerator_, this.denominator_) }
    numerator(): number { return this.numerator_ }
    denominator(): number { return this.denominator_ }

    static fromTicks(ticks: number): ReducedFraction {
        return new ReducedFraction(ticks, Constants.DIVISION * 4).reduced()
    }

    reduced(): ReducedFraction {
        const tmp = gcd(this.numerator_, this.denominator_)
        return new ReducedFraction(Math.trunc(this.numerator_ / tmp), Math.trunc(this.denominator_ / tmp))
    }

    absValue(): ReducedFraction { return new ReducedFraction(Math.abs(this.numerator_), Math.abs(this.denominator_)) }
    toDouble(): number { return this.numerator_ * 1.0 / this.denominator_ }

    ticks(): number {
        const integral = Math.trunc(this.numerator_ / this.denominator_)
        const newNumerator = this.numerator_ % this.denominator_
        const division = Constants.DIVISION * 4
        const tmp = newNumerator * division + Math.trunc(this.denominator_ / 2)
        return Math.trunc(tmp / this.denominator_) + integral * division
    }

    /** C++ reduce() (in place): the reduced value with a denominator of 1 for 0 */
    private reducedForOverflow(): ReducedFraction {
        if (this.numerator_ === 0) {
            return new ReducedFraction(0, 1)
        }
        const tmp = gcd(this.numerator_, this.denominator_)
        return new ReducedFraction(Math.trunc(this.numerator_ / tmp), Math.trunc(this.denominator_ / tmp))
    }

    private preventOverflow(): ReducedFraction {
        const reduceLimit = 10000
        if (this.numerator_ >= reduceLimit || this.denominator_ >= reduceLimit) {
            return this.reducedForOverflow()
        }
        return this
    }

    isIdenticalTo(f: ReducedFraction): boolean {
        return f.numerator_ === this.numerator_ && f.denominator_ === this.denominator_
    }

    // operator+=, ...: like C++ only *this is reduced to prevent an overflow (the reduced copy of val is unused)
    plus(val: ReducedFraction): ReducedFraction {
        const t = this.preventOverflow()
        const tmp = lcm(t.denominator_, val.denominator_)
        return new ReducedFraction(fractionPart(tmp, t.numerator_, t.denominator_)
                                   + fractionPart(tmp, val.numerator_, val.denominator_), tmp)
    }

    minus(val: ReducedFraction): ReducedFraction {
        const t = this.preventOverflow()
        const tmp = lcm(t.denominator_, val.denominator_)
        return new ReducedFraction(fractionPart(tmp, t.numerator_, t.denominator_)
                                   - fractionPart(tmp, val.numerator_, val.denominator_), tmp)
    }

    times(val: ReducedFraction | number): ReducedFraction {
        const t = this.preventOverflow()
        if (typeof val === 'number') {
            return new ReducedFraction(t.numerator_ * val, t.denominator_)
        }
        return new ReducedFraction(t.numerator_ * val.numerator_, t.denominator_ * val.denominator_)
    }

    div(val: ReducedFraction | number): ReducedFraction {
        const t = this.preventOverflow()
        if (typeof val === 'number') {
            return new ReducedFraction(t.numerator_, t.denominator_ * val)
        }
        return new ReducedFraction(t.numerator_ * val.denominator_, t.denominator_ * val.numerator_)
    }

    /** -1, 0, 1 like the C++ operator< / operator== (for the ordered containers) */
    compare(val: ReducedFraction): number {
        const v = lcm(this.denominator_, val.denominator_)
        const a = fractionPart(v, this.numerator_, this.denominator_)
        const b = fractionPart(v, val.numerator_, val.denominator_)
        return a < b ? -1 : a > b ? 1 : 0
    }

    lt(val: ReducedFraction): boolean { return this.compare(val) < 0 }
    le(val: ReducedFraction): boolean { return this.compare(val) <= 0 }
    gt(val: ReducedFraction): boolean { return this.compare(val) > 0 }
    ge(val: ReducedFraction): boolean { return this.compare(val) >= 0 }
    eq(val: ReducedFraction): boolean { return this.compare(val) === 0 }
    ne(val: ReducedFraction): boolean { return this.compare(val) !== 0 }

    toString(): string { return `${this.numerator_}/${this.denominator_}` }

    static min(a: ReducedFraction, b: ReducedFraction): ReducedFraction { return b.lt(a) ? b : a }
    static max(a: ReducedFraction, b: ReducedFraction): ReducedFraction { return a.lt(b) ? b : a }
}

/** the comparison of ReducedFraction keys (std::map<ReducedFraction, ...>) */
export function compareReducedFractions(a: ReducedFraction, b: ReducedFraction): number {
    return a.compare(b)
}

export function toMuseScoreTicks(tick: number, oldDivision: number, isDivisionInTps: boolean): ReducedFraction {
    if (isDivisionInTps) {
        return ReducedFraction.fromTicks(tick)
    }
    const integral = Math.trunc(tick / oldDivision)
    const remainder = tick % oldDivision
    const tmp = remainder * Constants.DIVISION + Math.trunc(oldDivision / 2)
    return ReducedFraction.fromTicks(Math.trunc(tmp / oldDivision) + integral * Constants.DIVISION)
}
