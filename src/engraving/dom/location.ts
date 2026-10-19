/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/location.h/.cpp
 */

import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { VOICES } from '../types/types'
import { Pid } from './property'
import type { EngravingItem } from './engravingitem'
import type { Chord } from './chord'
import type { Note } from './note'

export const INT_MIN = -2147483648

export class Location {
    private m_isTimeTick = false

    constructor(private m_staff: number, private m_voice: number, private m_measure: number, private m_frac: Fraction,
                private m_graceIndex: number, private m_note: number, private m_rel: boolean) {}

    clone(): Location {
        const l = new Location(this.m_staff, this.m_voice, this.m_measure, this.m_frac, this.m_graceIndex, this.m_note, this.m_rel)
        l.m_isTimeTick = this.m_isTimeTick
        return l
    }

    static absolute(): Location {
        return new Location(INT_MIN, INT_MIN, INT_MIN, new Fraction(INT_MIN, 1), INT_MIN, INT_MIN, false)
    }

    static relative(): Location { return new Location(0, 0, 0, new Fraction(0, 1), INT_MIN, 0, true) }

    toAbsolute(ref: Location): void {
        if (this.isAbsolute()) {
            return
        }
        this.m_staff += ref.m_staff
        this.m_voice += ref.m_voice
        this.m_measure += ref.m_measure
        this.m_frac = this.m_frac.plus(ref.m_frac)
        this.m_note += ref.m_note
        this.m_rel = false
    }

    toRelative(ref: Location): void {
        if (this.isRelative()) {
            return
        }
        this.m_staff -= ref.m_staff
        this.m_voice -= ref.m_voice
        this.m_measure -= ref.m_measure
        this.m_frac = this.m_frac.minus(ref.m_frac)
        this.m_note -= ref.m_note
        this.m_rel = true
    }

    isAbsolute(): boolean { return !this.m_rel }
    isRelative(): boolean { return this.m_rel }
    staff(): number { return this.m_staff }
    setStaff(staff: number): void { this.m_staff = staff }
    voice(): number { return this.m_voice }
    setVoice(voice: number): void { this.m_voice = voice }

    track(): number {
        if (this.m_staff === INT_MIN || this.m_voice === INT_MIN) {
            return INT_MIN
        }
        return VOICES * this.m_staff + this.m_voice
    }

    setTrack(track: number): void {
        this.m_staff = Math.trunc(track / VOICES)
        this.m_voice = track % VOICES
    }

    measure(): number { return this.m_measure }
    setMeasure(measure: number): void { this.m_measure = measure }
    frac(): Fraction { return this.m_frac }
    setFrac(frac: Fraction): void { this.m_frac = frac }
    graceIndex(): number { return this.m_graceIndex }
    setGraceIndex(index: number): void { this.m_graceIndex = index }
    note(): number { return this.m_note }
    setNote(note: number): void { this.m_note = note }
    setIsTimeTick(v: boolean): void { this.m_isTimeTick = v }
    isTimeTick(): boolean { return this.m_isTimeTick }

    fillPositionForElement(e: EngravingItem | null, absfrac = true): void {
        if (!e) {
            return
        }
        if (this.track() === INT_MIN) {
            this.setTrack(Location.trackOf(e))
        }
        if (this.frac().numerator() === INT_MIN && this.frac().denominator() === 1) {
            this.setFrac(absfrac ? e.tick() : e.rtick())
        }
        if (this.measure() === INT_MIN) {
            this.setMeasure(absfrac ? 0 : Location.measureOf(e))
        }
    }

    fillForElement(e: EngravingItem | null, absfrac = true): void {
        if (!e) {
            return
        }
        this.fillPositionForElement(e, absfrac)
        this.setGraceIndex(Location.graceIndexOf(e))
        this.setNote(Location.noteOf(e))
    }

    static forElement(e: EngravingItem, absfrac = true): Location {
        const i = Location.absolute()
        i.fillForElement(e, absfrac)
        return i
    }

    static positionForElement(e: EngravingItem, absfrac = true): Location {
        const i = Location.absolute()
        i.fillPositionForElement(e, absfrac)
        return i
    }

    private static trackOf(e: EngravingItem): number {
        let track = e.track()
        if (track < 0) {
            const mb = e.findMeasureBase()
            if (mb && !mb.isMeasure()) {
                // Such elements are written with track: -1
                track = 0
            }
        }
        return track
    }

    private static measureOf(e: EngravingItem): number {
        const m = e.findMeasure()
        return m ? m.measureIndex() : 0
    }

    private static graceIndexOf(e: EngravingItem): number {
        const p = e.explicitParent()
        if (e.isChord() || (p && p.isChord())) {
            const ch = (e.isChord() ? e : p) as unknown as Chord
            if (ch.isGrace()) {
                return ch.graceIndex()
            }
        }
        return INT_MIN
    }

    private static noteOf(e: EngravingItem): number {
        if (e.isNote()) {
            const n = e as unknown as Note
            const notes = n.chord().notes()
            if (notes.length === 1) {
                return 0
            }
            const idx = notes.indexOf(n)
            return idx >= 0 ? idx : notes.length
        }
        return INT_MIN
    }

    static getLocationProperty(pid: Pid, start: EngravingItem | null, end: EngravingItem | null): PropertyValue {
        if (!start || !end) {
            return 0
        }
        switch (pid) {
        case Pid.LOCATION_STAVES:
            return Math.trunc(Location.trackOf(start) / VOICES) - Math.trunc(Location.trackOf(end) / VOICES)
        case Pid.LOCATION_VOICES:
            return (Location.trackOf(start) % VOICES) - Math.trunc(Location.trackOf(end) / VOICES)
        case Pid.LOCATION_MEASURES:
            return Location.measureOf(end) - Location.measureOf(start)
        case Pid.LOCATION_FRACTIONS:
            return end.rtick().minus(start.rtick())
        case Pid.LOCATION_GRACE:
            return Location.graceIndexOf(start) - Location.graceIndexOf(end)
        case Pid.LOCATION_NOTE:
            return Location.noteOf(start) - Location.noteOf(end)
        default:
            return undefined
        }
    }

    equals(pi2: Location): boolean {
        return this.m_frac.eq(pi2.m_frac)
               && this.m_measure === pi2.m_measure
               && this.m_voice === pi2.m_voice
               && this.m_staff === pi2.m_staff
               && this.m_graceIndex === pi2.m_graceIndex
               && this.m_note === pi2.m_note
    }
}
