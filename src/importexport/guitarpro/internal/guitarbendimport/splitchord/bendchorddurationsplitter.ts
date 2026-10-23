/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/splitchord/bendchorddurationsplitter.h/.cpp
 */

import { Fraction } from '../../../../../engraving/types/fraction'

const MAX_DENOMINATOR = 64
const ONE_DOT_DURATION_MULTIPLIER = new Fraction(3, 2)
const TWO_DOTS_DURATION_MULTIPLIER = new Fraction(7, 4)

function sum(v: readonly Fraction[]): Fraction {
    return v.reduce((acc, f) => acc.plus(f), new Fraction(0, 1))
}

export class BendChordDurationSplitter {
    static findValidNoteSplit(totalDuration: Fraction, proportions: readonly Fraction[], maxDenominator: number): Fraction[] {
        if (proportions.length === 1) {
            return [totalDuration]
        }

        let splitReached = false
        let skipFirstBest = false
        let durations: Fraction[] = []

        do {
            durations = fillDurationsByProportions(totalDuration, proportions, maxDenominator, skipFirstBest)

            const accumulatedDuration = sum(durations)
            const lastDuration = totalDuration.minus(accumulatedDuration)

            if (lastDuration.isNotZero() && !lastDuration.negative() && canBeRepresentedAsDottedNote(lastDuration, maxDenominator)) {
                durations.push(lastDuration)
                splitReached = true
            } else if (!skipFirstBest) {
                skipFirstBest = true
            } else {
                durations = bruteForceSplit(totalDuration, proportions, maxDenominator)
                splitReached = true
            }
        } while (!splitReached)

        return durations
    }
}

function fillDurationsByProportions(totalDuration: Fraction, proportions: readonly Fraction[], maxDenominator: number,
    skipFirstBest: boolean): Fraction[] {
    const durations: Fraction[] = []

    for (let i = 0; i < proportions.length - 1; i++) {
        const targetDuration = totalDuration.times(proportions[i])
        const closestDuration = findClosestDisplayableDuration(totalDuration, targetDuration, maxDenominator,
            i === 0 ? skipFirstBest : false)
        durations.push(closestDuration)
    }

    return durations
}

function bruteForceSplit(totalDuration: Fraction, proportions: readonly Fraction[], maxDenominator: number): Fraction[] {
    const durations = generateDurations(maxDenominator)
    durations.sort((a, b) => a.compare(b))

    if (proportions.length === 2) {
        return bruteForceSplitInTwo(totalDuration, proportions, durations)
    }

    return bruteForceSplitInThree(totalDuration, durations)
}

function bruteForceSplitInTwo(target: Fraction, proportions: readonly Fraction[], durations: readonly Fraction[]): Fraction[] {
    if (proportions[0].lt(proportions[proportions.length - 1])) {
        for (let i1 = 0; i1 < durations.length; ++i1) {
            for (let i2 = i1; i2 < durations.length; ++i2) {
                if (durations[i1].plus(durations[i2]).eq(target)) {
                    return [durations[i1], durations[i2]]
                }
            }
        }
    } else {
        for (let i1 = durations.length - 1; i1 >= 0; --i1) {
            for (let i2 = i1; i2 >= 0; --i2) {
                if (durations[i1].plus(durations[i2]).eq(target)) {
                    return [durations[i1], durations[i2]]
                }
            }
        }
    }

    return []
}

function bruteForceSplitInThree(target: Fraction, durations: readonly Fraction[]): Fraction[] {
    for (let i1 = 0; i1 < durations.length; ++i1) {
        for (let i2 = i1; i2 < durations.length; ++i2) {
            for (let i3 = i2; i3 < durations.length; ++i3) {
                if (durations[i1].plus(durations[i2]).plus(durations[i3]).eq(target)) {
                    return [durations[i1], durations[i2], durations[i3]]
                }
            }
        }
    }

    return []
}

function generateDurations(maxDenominator: number): Fraction[] {
    const durations: Fraction[] = []
    for (let denom = 1; denom <= Math.min(maxDenominator, MAX_DENOMINATOR); denom *= 2) {
        durations.push(new Fraction(1, denom))
        // C++ ONE_DOT_DURATION_MULTIPLIER * denom (sic)
        durations.push(ONE_DOT_DURATION_MULTIPLIER.times(denom))
        durations.push(TWO_DOTS_DURATION_MULTIPLIER.times(denom))
    }
    return durations
}

function findClosestDisplayableDuration(totalDuration: Fraction, targetDuration: Fraction, requestedDenominator: number,
    skipFirstBest: boolean): Fraction {
    let closestFraction = new Fraction(0, 1)
    let minDifference = Number.MAX_VALUE
    const numerator = targetDuration.numerator()
    const denominator = targetDuration.denominator()
    const smallestFraction = new Fraction(1, requestedDenominator)

    let firstBestSkipped = false

    for (let candidateNumerator = 1; candidateNumerator < requestedDenominator; candidateNumerator++) {
        const originalFraction = numerator / denominator
        const candidateFraction = candidateNumerator / requestedDenominator

        const difference = Math.abs(originalFraction - candidateFraction)

        if (difference < minDifference) {
            let resultCandidateFraction = new Fraction(candidateNumerator, requestedDenominator)
            // std::max / std::min
            resultCandidateFraction = resultCandidateFraction.lt(smallestFraction) ? smallestFraction : resultCandidateFraction
            const upper = totalDuration.minus(smallestFraction)
            resultCandidateFraction = upper.lt(resultCandidateFraction) ? upper : resultCandidateFraction

            if (canBeRepresentedAsDottedNote(resultCandidateFraction, requestedDenominator)) {
                if (skipFirstBest && !firstBestSkipped) {
                    firstBestSkipped = true
                } else {
                    minDifference = difference
                    closestFraction = resultCandidateFraction
                }
            }
        }
    }

    return closestFraction.reduced()
}

function canBeRepresentedAsDottedNote(duration: Fraction, maxDenominator: number): boolean {
    let denom = 1
    while (denom <= Math.min(maxDenominator, MAX_DENOMINATOR)) {
        const base = new Fraction(1, denom)
        if (duration.eq(base) || duration.eq(base.times(ONE_DOT_DURATION_MULTIPLIER))
            || duration.eq(base.times(TWO_DOTS_DURATION_MULTIPLIER))) {
            return true
        }

        denom *= 2
    }

    return false
}
