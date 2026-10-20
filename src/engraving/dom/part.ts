/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/part.h/.cpp (engraving relevant parts)
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { AutoOnOff, ElementType, PreferSharpFlat, VOICES, nidx, type staff_idx_t, type track_idx_t } from '../types/types'
import { EngravingObject } from './engravingobject'
import { Instrument, InstrumentList, type StaffNameList } from './instrument'
import { Pid } from './property'
import type { Score } from './score'
import type { Staff } from './staff'
import type { StringData } from './stringdata'

export class Part extends EngravingObject {
    static readonly MAIN_INSTRUMENT_TICK = new Fraction(-1, 1)
    static readonly DEFAULT_COLOR = 0x3399ff

    private m_partName = '' // used in tracklist (mixer)
    private m_instruments = new InstrumentList()
    private m_staves: Staff[] = []
    private m_id = ''
    private m_show = true // show part in partitur if true
    private m_soloist = false
    private m_color = Part.DEFAULT_COLOR
    private m_hideWhenEmpty: AutoOnOff = AutoOnOff.AUTO
    private m_hideStavesWhenIndividuallyEmpty = false
    private m_preferSharpFlat: PreferSharpFlat = PreferSharpFlat.AUTO

    constructor(score: Score) {
        super(ElementType.PART, score)
        this.m_instruments.setInstrument(new Instrument(), -1) // default instrument
    }

    id(): string { return this.m_id }
    setId(id: string): void { this.m_id = id }

    nstaves(): number { return this.m_staves.length }
    staves(): readonly Staff[] { return this.m_staves }
    appendStaff(staff: Staff): void { this.m_staves.push(staff) }
    clearStaves(): void { this.m_staves = [] }
    staff(idx: number): Staff | null { return this.m_staves[idx] ?? null }

    startTrack(): track_idx_t {
        if (!this.m_staves.length) {
            return nidx
        }
        return this.m_staves[0].idx() * VOICES
    }

    endTrack(): track_idx_t {
        if (!this.m_staves.length) {
            return nidx
        }
        return this.m_staves[this.m_staves.length - 1].idx() * VOICES + VOICES
    }

    /** TODO(port): StringTunings */
    stringData(tick: Fraction, _staffIdx: staff_idx_t): StringData {
        return this.instrument(tick).stringData()
    }

    instrument(tick: Fraction = new Fraction(-1, 1)): Instrument {
        return this.m_instruments.instrument(tick.ticks())
    }

    instruments(): InstrumentList { return this.m_instruments }

    setInstrument(i: Instrument, tick: Fraction = new Fraction(-1, 1)): void {
        this.m_instruments.setInstrument(i, tick.ticks())
    }

    removeInstrument(tick: Fraction): void {
        this.m_instruments.erase(tick.ticks())
    }

    longNames(tick: Fraction = new Fraction(-1, 1)): StaffNameList { return this.instrument(tick).longNames() }
    shortNames(tick: Fraction = new Fraction(-1, 1)): StaffNameList { return this.instrument(tick).shortNames() }

    longName(tick: Fraction = new Fraction(-1, 1)): string {
        const nl = this.longNames(tick)
        return nl.length ? nl[0].name() : ''
    }

    shortName(tick: Fraction = new Fraction(-1, 1)): string {
        const nl = this.shortNames(tick)
        return nl.length ? nl[0].name() : ''
    }

    instrumentName(tick: Fraction = new Fraction(-1, 1)): string { return this.instrument(tick).trackName() }
    instrumentId(tick: Fraction = new Fraction(-1, 1)): string { return this.instrument(tick).id() }

    show(): boolean { return this.m_show }
    setShow(val: boolean): void { this.m_show = val }
    isVisible(): boolean { return this.m_show }
    soloist(): boolean { return this.m_soloist }
    setSoloist(val: boolean): void { this.m_soloist = val }
    partName(): string { return this.m_partName }
    setPartName(s: string): void { this.m_partName = s }
    color(): number { return this.m_color }
    setColor(v: number): void { this.m_color = v }
    hideWhenEmpty(): AutoOnOff { return this.m_hideWhenEmpty }
    setHideWhenEmpty(v: AutoOnOff): void { this.m_hideWhenEmpty = v }
    hideStavesWhenIndividuallyEmpty(): boolean { return this.m_hideStavesWhenIndividuallyEmpty }
    setHideStavesWhenIndividuallyEmpty(v: boolean): void { this.m_hideStavesWhenIndividuallyEmpty = v }
    preferSharpFlat(): PreferSharpFlat { return this.m_preferSharpFlat }
    setPreferSharpFlat(v: PreferSharpFlat): void { this.m_preferSharpFlat = v }

    hasPitchedStaff(): boolean { return this.m_staves.some(s => s.isPitchedStaff(new Fraction(0, 1))) }
    hasTabStaff(): boolean { return this.m_staves.some(s => s.isTabStaff(new Fraction(0, 1))) }
    hasDrumStaff(): boolean { return this.m_staves.some(s => s.isDrumStaff(new Fraction(0, 1))) }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.VISIBLE:
            return this.m_show
        case Pid.HIDE_WHEN_EMPTY:
            return this.m_hideWhenEmpty
        case Pid.HIDE_STAVES_WHEN_INDIVIDUALLY_EMPTY:
            return this.m_hideStavesWhenIndividuallyEmpty
        default:
            return undefined
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.VISIBLE:
            this.setShow(!!v)
            break
        case Pid.HIDE_WHEN_EMPTY:
            this.setHideWhenEmpty(v as AutoOnOff)
            break
        case Pid.HIDE_STAVES_WHEN_INDIVIDUALLY_EMPTY:
            this.setHideStavesWhenIndividuallyEmpty(!!v)
            break
        default:
            return false
        }
        return true
    }
}
