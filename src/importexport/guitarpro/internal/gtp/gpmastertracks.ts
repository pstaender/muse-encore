/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpmastertracks.h
 */

export enum GPMasterTracksAutomationType {
    tempo, volume, pan
}

export class GPMasterTracksAutomation {
    bar = 0
    type = GPMasterTracksAutomationType.tempo
    position = 0
    linear = false
    value = 0
    tempoUnit = 0
    text = ''
}

export class GPMasterTracks {
    private _tempoMap: GPMasterTracksAutomation[] = []
    private _tracksCount = 0

    setTempoMap(tM: GPMasterTracksAutomation[]): void { this._tempoMap = tM }
    tempoMap(): GPMasterTracksAutomation[] { return this._tempoMap }
    setTracksCount(tc: number): void { this._tracksCount = tc }
    tracksCount(): number { return this._tracksCount }
}
