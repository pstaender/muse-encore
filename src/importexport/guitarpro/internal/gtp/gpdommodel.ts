/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpdommodel.h
 */

import type { GPMasterBar } from './gpmasterbar'
import type { GPMasterTracks } from './gpmastertracks'
import type { GPScore } from './gpscore'
import type { GPTrack } from './gptrack'

export class GPDomModel {
    private _score: GPScore | null = null
    private _masterTracks: GPMasterTracks | null = null
    /** C++ std::map<int, GPTrack>: kept sorted by the track index */
    private _tracks = new Map<number, GPTrack>()
    private _masterBars: GPMasterBar[] = []

    addGPScore(score: GPScore): void { this._score = score }
    addGPMasterTracks(mTr: GPMasterTracks): void { this._masterTracks = mTr }
    addGPTracks(tr: Map<number, GPTrack>): void {
        this._tracks = new Map([...tr.entries()].sort((a, b) => a[0] - b[0]))
    }
    addGPMasterBars(mB: GPMasterBar[]): void { this._masterBars = mB }
    score(): GPScore | null { return this._score }
    masterTracks(): GPMasterTracks | null { return this._masterTracks }
    tracks(): Map<number, GPTrack> { return this._tracks }
    masterBars(): GPMasterBar[] { return this._masterBars }
}
