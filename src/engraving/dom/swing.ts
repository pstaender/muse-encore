/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/swing.h/.cpp
 */

import { RealIsNull } from '../../framework/global/realfn'
import type { SwingParameters } from '../types/types'
import { nextChordRest, prevChordRest, type Chord } from './chord'
import type { ChordRest } from './chordrest'

export class ChordDurationAdjustment {
    remainingDurationMultiplier = 0.0
    durationMultiplier = 0.0

    isNull(): boolean {
        return RealIsNull(this.remainingDurationMultiplier) && RealIsNull(this.durationMultiplier)
    }
}

/** Check for subdivided beat */
function isSubdivided(chord: ChordRest | null, swingUnit: number): boolean {
    if (!chord) {
        return false
    }

    const prev = prevChordRest(chord)
    if (chord.actualTicks().ticks() < swingUnit || (prev && prev.actualTicks().ticks() < swingUnit)) {
        return true
    }

    return false
}

export class Swing {
    /** C++ swingAdjustParams(chord, params, int& onTime, int& gateTime): returns the new [onTime, gateTime] */
    static swingAdjustParams(chord: Chord, params: SwingParameters, onTime: number, gateTime: number): [number, number] {
        const tick = chord.rtick().plus(chord.measure().anacrusisOffset())

        const swingBeat = params.swingUnit * 2
        const ticksDuration = chord.actualTicks().ticks()
        const swingTickAdjust = swingBeat * ((params.swingRatio - 50) / 100.0)
        const swingActualAdjust = (swingTickAdjust / ticksDuration) * 1000.0
        const startTick = tick.ticks()

        //Check the position of the chord to apply changes accordingly
        if (startTick % swingBeat === params.swingUnit) {
            if (!isSubdivided(chord, params.swingUnit)) {
                onTime = Math.trunc(onTime + swingActualAdjust)
                gateTime = Math.trunc(200 - (gateTime + (swingActualAdjust / 10)))
            }
        }

        const endTick = Math.trunc(startTick + ticksDuration)
        if (endTick % swingBeat === params.swingUnit) {
            const ncr = nextChordRest(chord)

            if (!isSubdivided(ncr, params.swingUnit)) {
                gateTime = Math.trunc(gateTime + (swingActualAdjust / 10))
            }
        }
        return [onTime, gateTime]
    }

    static applySwing(chord: Chord, params: SwingParameters): ChordDurationAdjustment {
        const adjusted = Swing.swingAdjustParams(chord, params, 0, 100)
        const onTime = adjusted[0]
        let gateTime = adjusted[1]

        if (gateTime <= 0) {
            gateTime = 100
        }

        const result = new ChordDurationAdjustment()
        result.remainingDurationMultiplier = onTime / 1000.0
        result.durationMultiplier = gateTime / 100.0

        return result
    }
}
