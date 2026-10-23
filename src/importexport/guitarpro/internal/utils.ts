/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/utils.h/.cpp (namespace mu::iex::guitarpro::utils)
 */

import type { Chord } from '../../../engraving/dom/chord'
import type { Note } from '../../../engraving/dom/note'
import type { Score } from '../../../engraving/dom/score'
import type { Fraction } from '../../../engraving/types/fraction'
import type { track_idx_t } from '../../../engraving/types/types'

/** muse::RealIsEqual(float, float): the harmonic values are floats in C++ */
function RealIsEqual(p1: number, p2: number): boolean {
    return Math.abs(p1 - p2) * 1000000.0 <= Math.min(Math.abs(p1), Math.abs(p2))
}

export function harmonicOvertone(note: Note, harmonicValue: number, harmonicType: number): number {
    let result = 0

    if (RealIsEqual(harmonicValue, 12.0)) {
        result = 12
    } else if (RealIsEqual(harmonicValue, 7.0) || RealIsEqual(harmonicValue, 19.0)) {
        result = 19
    } else if (RealIsEqual(harmonicValue, 5.0) || RealIsEqual(harmonicValue, 24.0)) {
        result = 24
    } else if (RealIsEqual(harmonicValue, 3.9)
               || RealIsEqual(harmonicValue, 4.0)
               || RealIsEqual(harmonicValue, 9.0)
               || RealIsEqual(harmonicValue, 16.0)) {
        result = 28
    } else if (RealIsEqual(harmonicValue, 3.2)) {
        result = 31
    } else if (RealIsEqual(harmonicValue, 2.7)
               || RealIsEqual(harmonicValue, 5.8)
               || RealIsEqual(harmonicValue, 9.6)
               || RealIsEqual(harmonicValue, 14.7)
               || RealIsEqual(harmonicValue, 21.7)) {
        result = 34
    } else if (RealIsEqual(harmonicValue, 2.3)
               || RealIsEqual(harmonicValue, 2.4)
               || RealIsEqual(harmonicValue, 8.2)
               || RealIsEqual(harmonicValue, 17.0)) {
        result = 36
    } else if (RealIsEqual(harmonicValue, 2.0)) {
        result = 38
    } else if (RealIsEqual(harmonicValue, 1.8)) {
        result = 40
    }

    return harmonicType === 1 ? result : (result + note.fret())
}

export function getLocatedChord(score: Score, tickFr: Fraction, track: track_idx_t): Chord | null {
    const measure = score.tick2measure(tickFr)
    if (!measure) {
        console.error(`bend import error: no valid measure for track ${track}, tick ${tickFr.ticks()}`)
        return null
    }

    const chord = measure.findChord(tickFr, track)
    if (!chord) {
        console.error(`bend import error: no valid chord for track ${track}, tick ${tickFr.ticks()}`)
        return null
    }

    return chord
}
