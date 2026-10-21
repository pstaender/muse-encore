/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/types/pitchvalue.h
 */

//---------------------------------------------------------
//   PitchValue
//    used in class Bend, SquareCanvas
//
//    - time is 0 - 60 for 0-100% of the chord duration the
//      bend is attached to
//    - pitch is 100 for one semitone
//---------------------------------------------------------

export class PitchValue {
    static readonly MAX_TIME = 60
    static readonly PITCH_FOR_SEMITONE = 100

    constructor(public time = 0, public pitch = 0, public vibrato = false) {}

    equals(pv: PitchValue): boolean { return pv.time === this.time && pv.pitch === this.pitch && pv.vibrato === this.vibrato }
    clone(): PitchValue { return new PitchValue(this.time, this.pitch, this.vibrato) }
}

export type PitchValues = PitchValue[]

export function pitchValuesEqual(a: readonly PitchValue[], b: readonly PitchValue[]): boolean {
    return a.length === b.length && a.every((v, i) => v.equals(b[i]))
}
