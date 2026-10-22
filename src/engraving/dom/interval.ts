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

    /** C++ Interval(int chromatic) */
    static fromChromatic(c: number): Interval {
        return new Interval(Interval.chromatic2diatonic(c), c)
    }

    static chromatic2diatonic(semitones: number): number {
        // diatonic steps of: Perfect Unison, Minor Second, Major Second, Minor Third, Major Third, Perfect Fourth,
        // Augmented Fourth, Perfect Fifth, Minor Sixth, Major Sixth, Minor Seventh, Major Seventh (allIntervals[il[i]])
        const il = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6]
        const down = semitones < 0
        if (down) {
            semitones = -semitones
        }
        const val = semitones % 12
        const octave = Math.trunc(semitones / 12)
        const steps = il[val] + octave * 7
        return down ? -steps : steps
    }

    /** C++ Interval::allIntervals (the intervals of the Transpose dialog) */
    static readonly allIntervals: readonly Interval[] = [
        // diatonic - chromatic
        new Interval(0, 0), //  0 Perfect Unison
        new Interval(0, 1), //  1 Augmented Unison

        new Interval(1, 0), //  2 Diminished Second
        new Interval(1, 1), //  3 Minor Second
        new Interval(1, 2), //  4 Major Second
        new Interval(1, 3), //  5 Augmented Second

        new Interval(2, 2), //  6 Diminished Third
        new Interval(2, 3), //  7 Minor Third
        new Interval(2, 4), //  8 Major Third
        new Interval(2, 5), //  9 Augmented Third

        new Interval(3, 4), // 10 Diminished Fourth
        new Interval(3, 5), // 11 Perfect Fourth
        new Interval(3, 6), // 12 Augmented Fourth

        new Interval(4, 6), // 13 Diminished Fifth
        new Interval(4, 7), // 14 Perfect Fifth
        new Interval(4, 8), // 15 Augmented Fifth

        new Interval(5, 7), // 16 Diminished Sixth
        new Interval(5, 8), // 17 Minor Sixth
        new Interval(5, 9), // 18 Major Sixth
        new Interval(5, 10), // 19 Augmented Sixth

        new Interval(6, 9), // 20 Diminished Seventh
        new Interval(6, 10), // 21 Minor Seventh
        new Interval(6, 11), // 22 Major Seventh
        new Interval(6, 12), // 23 Augmented Seventh

        new Interval(7, 11), // 24 Diminished Octave
        new Interval(7, 12), // 25 Perfect Octave
    ]

    clone(): Interval { return new Interval(this.diatonic, this.chromatic) }
    flip(): void {
        this.diatonic = -this.diatonic
        this.chromatic = -this.chromatic
    }
    isZero(): boolean { return this.diatonic === 0 && this.chromatic === 0 }
    equals(o: Interval): boolean { return o.diatonic === this.diatonic && o.chromatic === this.chromatic }
}
