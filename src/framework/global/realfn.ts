/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/realfn.h and types/number.h
 */

const COMPARE_DOUBLE_EPSILON = 1000000000.0
const COMPARE_DOUBLE_NULL = 0.000000001

// number_t<T> uses its own (coarser) precision
const COMPARE_REAL_EPSILON = 1e-7

export function RealIsEqual(p1: number, p2: number): boolean {
    return Math.abs(p1 - p2) * COMPARE_DOUBLE_EPSILON <= Math.min(Math.abs(p1), Math.abs(p2))
}

export function RealIsEqualOrMore(p1: number, p2: number): boolean {
    return p1 > p2 || RealIsEqual(p1, p2)
}

export function RealIsEqualOrLess(p1: number, p2: number): boolean {
    return p1 < p2 || RealIsEqual(p1, p2)
}

export function RealIsNull(d: number): boolean {
    return Math.abs(d) <= COMPARE_DOUBLE_NULL
}

export function RealRound(value: number, prec: number): number {
    const round = Math.pow(10, prec)
    return Math.floor(value * round + 0.5) / round
}

export function RealFloor(value: number, prec: number): number {
    const round = Math.pow(10, prec)
    return Math.floor(value * round) / round
}

/** muse::is_zero for number_t<double> */
export function isZero(v: number): boolean {
    return Math.abs(v) <= COMPARE_REAL_EPSILON
}

/** muse::is_equal for number_t<double> */
export function isEqual(v1: number, v2: number): boolean {
    return Math.abs(v1 - v2) <= Math.max(Math.abs(v1), Math.abs(v2)) * COMPARE_REAL_EPSILON
}

export function divide(dividend: number, divisor: number, def = 0): number {
    if (isZero(divisor)) {
        return def
    }
    return dividend / divisor
}

export const DBL_MAX = Number.MAX_VALUE
export const nidx = -1

export function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(v, hi))
}

/** C/C++ std::round(): rounds half away from zero (Math.round rounds half up) */
export function stdRound(v: number): number {
    return v < 0 ? -Math.round(-v) : Math.round(v)
}

/** C/C++ lrint() with the default rounding mode: rounds half to even */
export function lrint(v: number): number {
    const r = Math.round(v)
    return (Math.abs(v % 1) === 0.5 && r % 2 !== 0) ? r - 1 : r
}
