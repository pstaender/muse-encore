/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/interval.h/.cpp
 */

export class Interval {
    constructor(public diatonic = 0, public chromatic = 0) {}

    static fromChromatic(c: number): Interval {
        // TODO(port): Interval(int chromatic) computes the diatonic part from a table
        return new Interval(0, c)
    }

    clone(): Interval { return new Interval(this.diatonic, this.chromatic) }
    flip(): void {
        this.diatonic = -this.diatonic
        this.chromatic = -this.chromatic
    }
    isZero(): boolean { return this.diatonic === 0 && this.chromatic === 0 }
    equals(o: Interval): boolean { return o.diatonic === this.diatonic && o.chromatic === this.chromatic }
}
