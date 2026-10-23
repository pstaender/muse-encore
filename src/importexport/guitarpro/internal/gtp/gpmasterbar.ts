/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/gtp/gpmasterbar.h
 */

import type { GPBar } from './gpbar'

export enum GPMasterBarRepeatType {
    None, Start, End, StartEnd
}

export class GPMasterBarRepeat {
    type = GPMasterBarRepeatType.None
    count = 1
}

export enum GPMasterBarKeySigAccidentals {
    C_B = -7,
    G_B, D_B, A_B, E_B, B_B, F, C,
    G, D, A, E, B, F_S, C_S,
}

export enum GPMasterBarKeySigMode {
    Major,
    Minor
}

export class GPMasterBarKeySig {
    accidentalCount = GPMasterBarKeySigAccidentals.C
    mode = GPMasterBarKeySigMode.Major
}

export enum GPMasterBarTripletFeelType {
    Triplet8th,
    Triplet16th,
    Dotted8th,
    Dotted16th,
    Scottish8th,
    Scottish16th,
    None
}

export enum GPMasterBarBarlineType {
    NORMAL,
    DOUBLE
}

export class GPMasterBarTimeSig {
    numerator = 0
    denominator = 0
}

export enum GPMasterBarFermataType {
    Short, Medium, Long
}

export class GPMasterBarFermata {
    type = GPMasterBarFermataType.Medium
    length = 0
    offsetNum = 0 // numerator of offset field in GP
    offsetDenom = 0 // denominator of offset field in GP
}

export enum GPMasterBarDirectionType {
    Repeat, Jump, Marker
}

export class GPMasterBarDirection {
    type = GPMasterBarDirectionType.Repeat
    name = ''
}

export class GPMasterBar {
    private _id = -1
    private _bars: GPBar[] = []
    private _fermatas: GPMasterBarFermata[] = []
    private _directions: GPMasterBarDirection[] = []
    private _timeSig = new GPMasterBarTimeSig()
    private _keySig = new GPMasterBarKeySig()
    private _useFlats = false
    private _repeat = new GPMasterBarRepeat()
    private _alternateEndings: number[] = []
    private _tripletFeel = GPMasterBarTripletFeelType.None
    private _barlineType = GPMasterBarBarlineType.NORMAL
    private _freeTime = false
    private _section: [string, string] = ['', '']

    addGPBar(b: GPBar): void { this._bars.push(b) }
    setTimeSig(sig: GPMasterBarTimeSig): void { this._timeSig = sig }
    timeSig(): GPMasterBarTimeSig { return this._timeSig }
    useFlats(): boolean { return this._useFlats }
    setKeySig(sig: GPMasterBarKeySig, useFlats = false): void {
        this._keySig = sig
        this._useFlats = useFlats
    }
    keySig(): GPMasterBarKeySig { return this._keySig }
    setFermatas(f: GPMasterBarFermata[]): void { this._fermatas = f }
    fermatas(): GPMasterBarFermata[] { return this._fermatas }
    setRepeat(r: GPMasterBarRepeat): void { this._repeat = r }
    repeat(): GPMasterBarRepeat { return this._repeat }
    setTripletFeel(t: GPMasterBarTripletFeelType): void { this._tripletFeel = t }
    tripletFeel(): GPMasterBarTripletFeelType { return this._tripletFeel }
    setBarlineType(t: GPMasterBarBarlineType): void { this._barlineType = t }
    barlineType(): GPMasterBarBarlineType { return this._barlineType }
    setFreeTime(freeTime: boolean): void { this._freeTime = freeTime }
    freeTime(): boolean { return this._freeTime }
    setAlternativeEnding(r: number[]): void { this._alternateEndings = r }
    alternateEnding(): number[] { return this._alternateEndings }
    setSection(s: [string, string]): void { this._section = s }
    section(): [string, string] { return this._section }
    setDirections(d: GPMasterBarDirection[]): void { this._directions = d }
    directions(): GPMasterBarDirection[] { return this._directions }
    setId(id: number): void { this._id = id }
    id(): number { return this._id } // debug helper
    bars(): GPBar[] { return this._bars }
}
