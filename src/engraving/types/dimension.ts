/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/dimension.h
 * Millimetre is represented as a plain number.
 */

import { isEqual } from '../../framework/global/realfn'

export class Spatium {
    constructor(private readonly m_val = 0) {}

    val(): number { return this.m_val }
    toDouble(): number { return this.m_val }

    equals(o: Spatium): boolean { return isEqual(this.m_val, o.m_val) }
    neg(): Spatium { return new Spatium(-this.m_val) }
    plus(o: Spatium): Spatium { return new Spatium(this.m_val + o.m_val) }
    minus(o: Spatium): Spatium { return new Spatium(this.m_val - o.m_val) }
    times(v: number): Spatium { return new Spatium(this.m_val * v) }

    /** absolute value in "pixels" (1200 DPI) for the given spatium */
    toAbsolute(spatium: number): number { return this.m_val * spatium }

    static fromAbsolute(abs: number, spatium: number): Spatium { return new Spatium(abs / spatium) }

    toString(): string { return `${this.m_val}sp` }
}

export type Millimetre = number

/** shorthand for C++ `_sp` literal */
export function sp(v: number): Spatium { return new Spatium(v) }
