/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpvoice.h
 */

import type { GPBeat } from './gpbeat'

export class GPVoice {
    private _id = -1 // imported id
    private _pos = 0 // for defining correct track number
    private _beats: GPBeat[] = []

    addGPBeat(b: GPBeat): void { this._beats.push(b) }
    setId(id: number): void { this._id = id }
    id(): number { return this._id }
    setPosition(pos: number): void { this._pos = pos }
    position(): number { return this._pos }
    beats(): GPBeat[] { return this._beats }
}
