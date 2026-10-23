/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpbar.h
 */

import type { GPVoice } from './gpvoice'

export enum GPBarClefType {
    G2, F4, C3, C4, Neutral
}

export enum GPBarOttaviaType {
    ma15, va8, Regular, vb8, mb15
}

export enum GPBarSimileMark {
    None, Simple, FirstOfDouble, SecondOfDouble
}

export class GPBarClef {
    type = GPBarClefType.G2
    ottavia = GPBarOttaviaType.Regular

    constructor(type = GPBarClefType.G2, ottavia = GPBarOttaviaType.Regular) {
        this.type = type
        this.ottavia = ottavia
    }

    equals(c: GPBarClef): boolean { return this.type === c.type && this.ottavia === c.ottavia }
}

export class GPBar {
    private _id = -1
    private _voices: GPVoice[] = []
    private _clef = new GPBarClef()
    private _simileMark = GPBarSimileMark.None

    addGPVoice(v: GPVoice): void { this._voices.push(v) }
    setClefType(clef: GPBarClefType): void { this._clef.type = clef }
    setOttaviaType(ottavia: GPBarOttaviaType): void { this._clef.ottavia = ottavia }
    clef(): GPBarClef { return new GPBarClef(this._clef.type, this._clef.ottavia) }
    setSimileMark(s: GPBarSimileMark): void { this._simileMark = s }
    simileMark(): GPBarSimileMark { return this._simileMark }
    setId(id: number): void { this._id = id }
    id(): number { return this._id }
    voices(): GPVoice[] { return this._voices }
}
