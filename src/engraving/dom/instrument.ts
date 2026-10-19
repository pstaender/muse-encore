/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrument.h/.cpp (only what is needed for engraving:
 * names, clefs, transposition; no MIDI/playback data)
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { ClefType } from '../types/types'
import { ClefTypeList } from './clefinfo'
import { Interval } from './interval'

export class StaffName {
    constructor(private m_name = '', private m_pos = 0) {} // html string; even number -> between staves

    name(): string { return this.m_name }
    setName(n: string): void { this.m_name = n }
    pos(): number { return this.m_pos }
    setPos(p: number): void { this.m_pos = p }

    toPlainText(): string {
        return this.m_name.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    }
}

export type StaffNameList = StaffName[]

export class Instrument {
    private m_longNames: StaffNameList = []
    private m_shortNames: StaffNameList = []
    private m_trackName = ''
    private m_transpose = new Interval()
    private m_useDrumset = false
    private m_clefType: ClefTypeList[] = []
    private m_minPitchA = 0
    private m_maxPitchA = 127
    private m_minPitchP = 0
    private m_maxPitchP = 127
    private m_instrumentId = ''
    // TODO(port): Drumset, StringData, channels, articulations

    constructor(private m_id = '') {}

    id(): string { return this.m_id }
    setId(id: string): void { this.m_id = id }
    instrumentId(): string { return this.m_instrumentId }
    setInstrumentId(id: string): void { this.m_instrumentId = id }

    longNames(): StaffNameList { return this.m_longNames }
    shortNames(): StaffNameList { return this.m_shortNames }
    setLongNames(l: StaffNameList): void { this.m_longNames = l }
    setShortNames(l: StaffNameList): void { this.m_shortNames = l }

    setLongName(f: string): void {
        this.m_longNames = []
        if (f.length) {
            this.m_longNames.push(new StaffName(f, 0))
        }
    }

    setShortName(f: string): void {
        this.m_shortNames = []
        if (f.length) {
            this.m_shortNames.push(new StaffName(f, 0))
        }
    }

    trackName(): string { return this.m_trackName }
    setTrackName(s: string): void { this.m_trackName = s }

    transpose(): Interval { return this.m_transpose }
    setTranspose(v: Interval): void { this.m_transpose = v }

    useDrumset(): boolean { return this.m_useDrumset }
    setUseDrumset(v: boolean): void { this.m_useDrumset = v }

    clefType(staffIdx: number): ClefTypeList {
        if (staffIdx >= this.m_clefType.length) {
            if (this.m_clefType.length === 0) {
                return new ClefTypeList()
            }
            return this.m_clefType[0]
        }
        return this.m_clefType[staffIdx]
    }

    setClefType(staffIdx: number, c: ClefTypeList): void {
        while (this.m_clefType.length <= staffIdx) {
            this.m_clefType.push(new ClefTypeList(ClefType.INVALID))
        }
        this.m_clefType[staffIdx] = c
    }

    minPitchA(): number { return this.m_minPitchA }
    maxPitchA(): number { return this.m_maxPitchA }
    minPitchP(): number { return this.m_minPitchP }
    maxPitchP(): number { return this.m_maxPitchP }
    setMinPitchA(v: number): void { this.m_minPitchA = v }
    setMaxPitchA(v: number): void { this.m_maxPitchA = v }
    setMinPitchP(v: number): void { this.m_minPitchP = v }
    setMaxPitchP(v: number): void { this.m_maxPitchP = v }
}

const defaultInstrument = new Instrument()

export class InstrumentList extends SortedMap<Instrument> {
    instrument(tick: number): Instrument {
        if (this.empty()) {
            return defaultInstrument
        }
        let i = this.upperBound(tick)
        if (i === 0) {
            return defaultInstrument
        }
        --i
        return this.valueAt(i)
    }

    setInstrument(instr: Instrument, tick: number): void {
        this.set(tick, instr)
    }
}
