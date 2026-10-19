/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the pure helpers of src/engraving/editing/transpose.cpp (undo commands are not ported)
 */

import { Key, PreferSharpFlat } from '../types/types'
import {
    PITCH_DELTA_OCTAVE, STEP_DELTA_OCTAVE, TPC_DELTA_ENHARMONIC, TPC_DELTA_SEMITONE,
    clampEnharmonic, clampKey, key2Tpc, tpc2Key, tpcIsValid,
} from '../dom/pitchspelling'
import type { Interval } from '../dom/interval'

export class Transpose {
    static transposeKey(key: Key, interval: Interval, prefer: PreferSharpFlat = PreferSharpFlat.NONE): Key {
        const keyAsTpc = key2Tpc(key)
        const newKey = tpc2Key(Transpose.transposeTpc(keyAsTpc, interval, false))

        // ignore prefer for octave transposing instruments
        if (interval.chromatic % PITCH_DELTA_OCTAVE === 0 && interval.diatonic % STEP_DELTA_OCTAVE === 0) {
            prefer = PreferSharpFlat.NONE
        }
        return clampKey(newKey, prefer)
    }

    /** transposes a pitch spelling by a given interval, option to enharmonically reduce tpc using double alterations */
    static transposeTpc(tpc: number, interval: Interval, useDoubleSharpsFlats: boolean): number {
        const deltaTpc = (interval.chromatic * TPC_DELTA_SEMITONE) - (interval.diatonic * TPC_DELTA_ENHARMONIC)
        if (!tpcIsValid(tpc) || deltaTpc === 0) { // perfect unison & perfect octave
            return tpc
        }
        return clampEnharmonic(tpc + deltaTpc, useDoubleSharpsFlats)
    }
}
