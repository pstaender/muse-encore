/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/durationtype.h/.cpp (rhythmic splitting not ported)
 */

import { Fraction } from '../types/fraction'
import { DurationType, DurationTypeWithDots, NoteHeadType } from '../types/types'

export const MAX_DOTS = 4

function getDots(base: number, rest: number): [number, number] {
    let dots = 0
    if (base < 16) {
        return [rest, dots]
    }
    if (rest >= base / 2) {
        dots++
        rest -= base / 2
    }
    if (rest >= base / 4) {
        dots++
        rest -= base / 4
    }
    if (rest >= base / 8) {
        dots++
        rest -= base / 8
    }
    if (rest >= base / 16) {
        dots++
        rest -= base / 16
    }
    if (dots > MAX_DOTS) {
        dots = MAX_DOTS
    }
    return [rest, dots]
}

export class TDuration {
    private m_val: DurationType = DurationType.V_INVALID
    private m_dots = 0

    constructor(t?: DurationType | DurationTypeWithDots | Fraction, truncate = false, maxDots = 4,
        maxType: DurationType = DurationType.V_LONG) {
        if (t === undefined) {
            return
        }
        if (t instanceof Fraction) {
            void truncate
            this.setType(maxType) // use maxType to avoid testing all types if you know that l is smaller than a certain DurationType
            this.setDots(maxDots)
            this.truncateToFraction(t, maxDots)
        } else if (t instanceof DurationTypeWithDots) {
            this.m_val = t.type
            this.m_dots = t.dots
        } else {
            this.m_val = t
        }
    }

    clone(): TDuration {
        const d = new TDuration(this.m_val)
        d.m_dots = this.m_dots
        return d
    }

    type(): DurationType { return this.m_val }
    typeWithDots(): DurationTypeWithDots { return new DurationTypeWithDots(this.m_val, this.m_dots) }
    isValid(): boolean { return this.m_val !== DurationType.V_INVALID }
    isZero(): boolean { return this.m_val === DurationType.V_ZERO }
    isMeasure(): boolean { return this.m_val === DurationType.V_MEASURE }

    setType(t: DurationType): void {
        this.m_val = t
        if (this.m_val === DurationType.V_MEASURE) {
            this.m_dots = 0
        }
    }

    dots(): number { return this.m_dots }

    setDots(v: number): void {
        if (v > MAX_DOTS) {
            v = MAX_DOTS
        }
        if (v < 0) {
            v = 0
        }
        this.m_dots = v
    }

    equals(t: TDuration | DurationType): boolean {
        if (t instanceof TDuration) {
            return t.m_val === this.m_val && t.m_dots === this.m_dots
        }
        return t === this.m_val
    }

    setVal(ticks: number): void {
        if (ticks === 0) {
            this.m_val = DurationType.V_MEASURE
        } else {
            const dt = new TDuration()
            for (let i = 0; i < DurationType.V_ZERO; ++i) {
                dt.setType(i as DurationType)
                const t = dt.ticks().ticks()
                if (Math.trunc(ticks / t)) {
                    const remain = ticks % t
                    const SMALLEST_DOT_DIVISOR = 1 << MAX_DOTS
                    if ((t - remain) < (t / SMALLEST_DOT_DIVISOR)) {
                        this.m_val = (i - 1) as DurationType
                        return
                    }
                    this.m_val = i as DurationType
                    this.m_dots = getDots(t, remain)[1]
                    return
                }
            }
            this.m_val = DurationType.V_QUARTER // fallback default value
        }
    }

    ticks(): Fraction {
        let t: Fraction
        switch (this.m_val) {
        case DurationType.V_QUARTER: t = new Fraction(1, 4); break
        case DurationType.V_1024TH: t = new Fraction(1, 1024); break
        case DurationType.V_512TH: t = new Fraction(1, 512); break
        case DurationType.V_256TH: t = new Fraction(1, 256); break
        case DurationType.V_128TH: t = new Fraction(1, 128); break
        case DurationType.V_64TH: t = new Fraction(1, 64); break
        case DurationType.V_32ND: t = new Fraction(1, 32); break
        case DurationType.V_16TH: t = new Fraction(1, 16); break
        case DurationType.V_EIGHTH: t = new Fraction(1, 8); break
        case DurationType.V_HALF: t = new Fraction(1, 2); break
        case DurationType.V_WHOLE: t = new Fraction(1, 1); break
        case DurationType.V_BREVE: t = new Fraction(2, 1); break
        case DurationType.V_LONG: t = new Fraction(4, 1); break
        case DurationType.V_ZERO:
        case DurationType.V_MEASURE:
            return new Fraction(0, 1)
        default:
            return new Fraction(-1, 1)
        }
        let tmp = t
        for (let i = 0; i < this.m_dots; ++i) {
            tmp = tmp.times(new Fraction(1, 2))
            t = t.plus(tmp)
        }
        return t
    }

    headType(): NoteHeadType {
        switch (this.m_val) {
        case DurationType.V_1024TH:
        case DurationType.V_512TH:
        case DurationType.V_256TH:
        case DurationType.V_128TH:
        case DurationType.V_64TH:
        case DurationType.V_32ND:
        case DurationType.V_16TH:
        case DurationType.V_EIGHTH:
        case DurationType.V_QUARTER:
            return NoteHeadType.HEAD_QUARTER
        case DurationType.V_HALF:
            return NoteHeadType.HEAD_HALF
        case DurationType.V_MEASURE:
        case DurationType.V_WHOLE:
            return NoteHeadType.HEAD_WHOLE
        case DurationType.V_BREVE:
        case DurationType.V_LONG:
            return NoteHeadType.HEAD_BREVIS
        default:
            return NoteHeadType.HEAD_QUARTER
        }
    }

    hooks(): number {
        const table = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0]
        return table[this.m_val] ?? 0
    }

    hasStem(): boolean {
        switch (this.m_val) {
        case DurationType.V_1024TH:
        case DurationType.V_512TH:
        case DurationType.V_256TH:
        case DurationType.V_128TH:
        case DurationType.V_64TH:
        case DurationType.V_32ND:
        case DurationType.V_16TH:
        case DurationType.V_EIGHTH:
        case DurationType.V_QUARTER:
        case DurationType.V_HALF:
        case DurationType.V_LONG:
            return true
        default:
            return false
        }
    }

    /** dots are not retained */
    shift(nSteps: number): TDuration {
        const d = new TDuration(this.type())
        d.shiftType(nSteps)
        return d
    }

    shiftRetainDots(nSteps: number, stepDotted = false): TDuration {
        const d = new TDuration(this.type())
        d.setDots(this.m_dots)
        d.shiftType(nSteps, stepDotted)
        return d
    }

    private shiftType(nSteps: number, stepDotted = false): void {
        if (this.m_val === DurationType.V_MEASURE || this.m_val === DurationType.V_INVALID || this.m_val === DurationType.V_ZERO) {
            this.setType(DurationType.V_INVALID)
        } else {
            let newValue: number
            let newDots: number
            if (stepDotted) {
                const roundDownSingleDots = (this.m_dots > 0) ? -1 : 0
                const newValAsNumSingleDotSteps = this.m_val * 2 + roundDownSingleDots + nSteps
                newDots = newValAsNumSingleDotSteps % 2 // odd means there is a dot
                newValue = Math.trunc(newValAsNumSingleDotSteps / 2) + newDots // if new duration has a dot, then that
            } else {
                newDots = this.m_dots
                newValue = this.m_val + nSteps
            }
            if ((newValue < DurationType.V_LONG) || (newValue > DurationType.V_1024TH)
                || ((newValue >= DurationType.V_1024TH) && (newDots >= 1))
                || ((newValue >= DurationType.V_512TH) && (newDots >= 2))
                || ((newValue >= DurationType.V_256TH) && (newDots >= 3))
                || ((newValue >= DurationType.V_128TH) && (newDots >= 4))) {
                this.setType(DurationType.V_INVALID)
            } else {
                this.setType(newValue as DurationType)
                this.setDots(newDots)
            }
        }
    }

    lt(t: TDuration): boolean {
        if (t.m_val < this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots < t.m_dots
    }

    gt(t: TDuration): boolean {
        if (t.m_val > this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots > t.m_dots
    }

    ge(t: TDuration): boolean {
        if (t.m_val > this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots >= t.m_dots
    }

    le(t: TDuration): boolean {
        if (t.m_val < this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots <= t.m_dots
    }

    fraction(): Fraction {
        let z = 1
        let n: number
        switch (this.m_val) {
        case DurationType.V_1024TH: n = 1024; break
        case DurationType.V_512TH: n = 512; break
        case DurationType.V_256TH: n = 256; break
        case DurationType.V_128TH: n = 128; break
        case DurationType.V_64TH: n = 64; break
        case DurationType.V_32ND: n = 32; break
        case DurationType.V_16TH: n = 16; break
        case DurationType.V_EIGHTH: n = 8; break
        case DurationType.V_QUARTER: n = 4; break
        case DurationType.V_HALF: n = 2; break
        case DurationType.V_WHOLE: n = 1; break
        case DurationType.V_BREVE: z = 2; n = 1; break
        case DurationType.V_LONG: z = 4; n = 1; break
        case DurationType.V_ZERO: z = 0; n = 1; break
        default: z = 0; n = 0; break // zero+invalid fraction
        }
        const dotN = (1 << (this.m_dots + 1)) - 1
        const dotD = 1 << this.m_dots
        return new Fraction(z * dotN, n * dotD)
    }

    static isValidFraction(f: Fraction): boolean {
        const t = new TDuration()
        t.setType(DurationType.V_LONG)
        t.setDots(4)
        t.truncateToFraction(f, 4)
        return t.isValid() && t.fraction().minus(f).numerator() === 0
    }

    private truncateToFraction(l: Fraction, maxDots: number): void {
        if (this.setDotsToFitFraction(l, this.m_dots)) {
            return
        }
        for (this.shiftType(1); this.isValid(); this.shiftType(1)) {
            if (this.setDotsToFitFraction(l, maxDots)) {
                return // duration fits in l
            }
        }
    }

    private setDotsToFitFraction(l: Fraction, maxDots: number): boolean {
        for (; maxDots >= 0; maxDots--) {
            this.m_dots = maxDots // ensures _dots >= 0 if function returns false.
            if (this.fraction().minus(l).numerator() <= 0) {
                return true // duration fits in l
            }
        }
        return false // doesn't fit by changing dots alone (type needs to be changed too)
    }
}

/**
 * Port of toDurationList(): splits a fraction into a list of durations
 */
export function toDurationList(l: Fraction, useDots: boolean, maxDots = 4, printRestRemains = true): TDuration[] {
    void printRestRemains
    const dList: TDuration[] = []
    if (useDots) {
        for (let dt = new TDuration(DurationType.V_LONG); dt.isValid() && l.numerator() !== 0;) {
            const d = new TDuration(l, true, maxDots, dt.type())
            if (!d.isValid()) {
                break
            }
            dList.push(d)
            l = l.minus(d.fraction())
            dt = d.shift(1)
        }
    } else {
        for (let dt = new TDuration(DurationType.V_LONG); dt.isValid() && l.numerator() !== 0; dt = dt.shift(1)) {
            const f = dt.fraction()
            while (l.ge(f)) {
                dList.push(dt.clone())
                l = l.minus(f)
            }
        }
    }
    return dList
}
