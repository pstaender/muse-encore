/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/interval.h/.cpp
 */

import { IntervalStep, IntervalType, type OrnamentInterval } from '../types/types'

export class Interval {
    constructor(public diatonic = 0, public chromatic = 0) {}

    static fromOrnamentInterval(ornInt: OrnamentInterval): Interval {
        const resultingInterval = new Interval(0, 0)

        resultingInterval.diatonic = ornInt.step

        let cromaticSteps = 0
        switch (ornInt.step) {
        case IntervalStep.UNISON: cromaticSteps = 0; break
        case IntervalStep.SECOND: cromaticSteps = 2; break
        case IntervalStep.THIRD: cromaticSteps = 4; break
        case IntervalStep.FOURTH: cromaticSteps = 5; break
        case IntervalStep.FIFTH: cromaticSteps = 7; break
        case IntervalStep.SIXTH: cromaticSteps = 9; break
        case IntervalStep.SEVENTH: cromaticSteps = 11; break
        case IntervalStep.OCTAVE: cromaticSteps = 12; break
        default: break
        }

        if (ornInt.isPerfect()) {
            switch (ornInt.type) {
            case IntervalType.DIMINISHED: cromaticSteps -= 1; break
            case IntervalType.AUGMENTED: cromaticSteps += 1; break
            default: break
            }
        } else {
            switch (ornInt.type) {
            case IntervalType.DIMINISHED: cromaticSteps -= 2; break
            case IntervalType.MINOR: cromaticSteps -= 1; break
            case IntervalType.AUGMENTED: cromaticSteps += 1; break
            default: break
            }
        }

        resultingInterval.chromatic = cromaticSteps

        return resultingInterval
    }

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
