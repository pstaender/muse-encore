/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gprhythm.h
 */

export enum GPRhythmRhytmType {
    SixtyFourth, ThirtySecond, Sixteenth, Eighth, Quarter, Half, Whole
}

export interface GPRhythmTuplet {
    num: number
    denom: number
}

export class GPRhythm {
    private _rhythm = GPRhythmRhytmType.Whole
    private _tuplet: GPRhythmTuplet = { num: -1, denom: -1 }
    private _dotCount = 0

    setRhytm(t: GPRhythmRhytmType): void { this._rhythm = t }
    /** [dotCount, rhythm type] */
    length(): [number, GPRhythmRhytmType] { return [this._dotCount, this._rhythm] }
    type(): GPRhythmRhytmType { return this._rhythm }
    setTuplet(t: GPRhythmTuplet): void { this._tuplet = { ...t } }
    tuplet(): GPRhythmTuplet { return { ...this._tuplet } }
    setDotCount(c: number): void { this._dotCount = c }
    dotCount(): number { return this._dotCount }
}
