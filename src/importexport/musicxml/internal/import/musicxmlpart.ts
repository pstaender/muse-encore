/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/musicxmlpart.h/.cpp
 *
 * MusicXmlPart is a value type in C++ (muse::value(m_parts, id) returns a copy): clone() makes the copy.
 */

import type { Interval } from '../../../../engraving/dom/interval'
import { Fraction } from '../../../../engraving/types/fraction'
import { MAX_STAVES } from '../../../../engraving/types/types'
import { FractionMap, IntMap } from '../../../../framework/global/orderedmap'
import { LyricNumberHandler, MusicXmlInstrList, MusicXmlIntervalList } from '../shared/musicxmltypes'
import { VoiceList } from './musicxmlvoicedesc'

const vocalInstrumentNames: readonly string[] = [
    'Voice',
    'Soprano',
    'Mezzo-Soprano',
    'Alto',
    'Tenor',
    'Baritone',
    'Bass',
    'Women',
    'Men',
]

const percussionInstrumentNames: readonly string[] = [
    'Percussion',
    'Timpani',
    'Glockenspiel',
    'Xylophone',
    'Vibraphone',
    'Marimba',
    'Bell',
    'Drum',
    'Cymbal',
    'Triangle',
    'Claves',
    'Wood Blocks',
    'Tambourine',
    'Finger Snap',
    'Hand Clap',
    'Slap',
    'Stamp',
]

export class MusicXmlOctaveShiftList extends FractionMap<number> {
    octaveShift(f: Fraction): number {
        if (this.empty()) {
            return 0
        }
        const i = this.upperBound(f)
        if (i === 0) {
            return 0
        }
        return this.valueAt(i - 1)
    }

    addOctaveShift(shift: number, f: Fraction): void {
        if (!new Fraction(0, 1).le(f)) {
            return
        }

        const i = this.find(f)
        if (i < 0) {
            this.insert(f, shift)
        } else {
            this.setValueAt(i, this.valueAt(i) + shift)
        }
    }

    calcOctaveShiftShifts(): void {
        // to each MusicXmlOctaveShiftList entry, add the sum of all previous ones
        let currentShift = 0
        for (let i = 0; i < this.size(); ++i) {
            currentShift += this.valueAt(i)
            this.setValueAt(i, currentShift)
        }
    }

    clone(): MusicXmlOctaveShiftList {
        const r = new MusicXmlOctaveShiftList()
        for (const [k, v] of this) {
            r.set(k, v)
        }
        return r
    }
}

export class MusicXmlPart {
    voicelist = new VoiceList()           // the voice map information TODO: make private
    _instrList = new MusicXmlInstrList()   // TODO: make private
    _intervals = new MusicXmlIntervalList()                       ///< Transpositions

    private m_id: string
    private m_name: string
    private m_printName = true
    private m_abbr = ''
    private m_printAbbr = true
    private m_measureNumbers: string[] = []               // MusicXML measure number attribute
    private m_measureDurations: Fraction[] = []         // duration in fraction for every measure
    private m_octaveShifts: MusicXmlOctaveShiftList[] = []   // octave shift list for every staff
    private m_lyricNumberHandler = new LyricNumberHandler()
    private m_maxStaff = -1                      // maximum staff value found (0 based), -1 = none
    private m_hasLyrics = false
    // Mapping from staff number to index in staff list.
    // Only for when staves are discarded in MusicXmlParserPass1::attributes.
    private m_staffNumberToIndex = new IntMap<number>()

    constructor(id = '', name = '') {
        this.m_id = id
        this.m_name = name
        for (let i = 0; i < MAX_STAVES; ++i) {
            this.m_octaveShifts.push(new MusicXmlOctaveShiftList())
        }
    }

    /** the C++ copy */
    clone(): MusicXmlPart {
        const r = new MusicXmlPart(this.m_id, this.m_name)
        r.voicelist = this.voicelist.clone()
        r._instrList = this._instrList.clone()
        r._intervals = this._intervals.clone()
        r.m_printName = this.m_printName
        r.m_abbr = this.m_abbr
        r.m_printAbbr = this.m_printAbbr
        r.m_measureNumbers = this.m_measureNumbers.slice()
        r.m_measureDurations = this.m_measureDurations.slice()
        r.m_octaveShifts = this.m_octaveShifts.map(l => l.clone())
        r.m_lyricNumberHandler = this.m_lyricNumberHandler.clone()
        r.m_maxStaff = this.m_maxStaff
        r.m_hasLyrics = this.m_hasLyrics
        for (const [k, v] of this.m_staffNumberToIndex) {
            r.m_staffNumberToIndex.set(k, v)
        }
        return r
    }

    addMeasureNumberAndDuration(measureNumber: string, measureDuration: Fraction): void {
        this.m_measureNumbers.push(measureNumber)
        this.m_measureDurations.push(measureDuration)
    }

    getId(): string { return this.m_id }

    toString(): string {
        let res = `part id '${this.m_id}' name '${this.m_name}' print ${this.m_printName ? 1 : 0} abbr '${this.m_abbr}'`
                  + ` print ${this.m_printAbbr ? 1 : 0} maxStaff ${this.m_maxStaff}\n`

        for (const [k, v] of this.voicelist) {
            res += `voice ${k + 1} map staff data ${v.toString()}\n`
        }

        for (let i = 0; i < this.m_measureNumbers.length; ++i) {
            if (i > 0) {
                res += '\n'
            }
            res += `measure ${this.m_measureNumbers[i]} duration ${this.m_measureDurations[i].toString()}`
                   + ` (${this.m_measureDurations[i].ticks()})`
        }

        return res
    }

    measureDuration(i: number): Fraction {
        if (i < this.m_measureDurations.length) {
            return this.m_measureDurations[i]
        }
        return new Fraction(0, 0)   // return invalid fraction
    }

    nMeasures(): number { return this.m_measureDurations.length }

    interval(f: Fraction): Interval {
        return this._intervals.interval(f)
    }

    octaveShift(staff: number, f: Fraction): number {
        if (MAX_STAVES <= staff) {
            return 0
        }
        if (f.lt(new Fraction(0, 1))) {
            return 0
        }
        return this.m_octaveShifts[staff].octaveShift(f)
    }

    addOctaveShift(staff: number, shift: number, f: Fraction): void {
        if (MAX_STAVES <= staff) {
            return
        }
        if (f.lt(new Fraction(0, 1))) {
            return
        }
        this.m_octaveShifts[staff].addOctaveShift(shift, f)
    }

    calcOctaveShifts(): void {
        for (let i = 0; i < MAX_STAVES; ++i) {
            this.m_octaveShifts[i].calcOctaveShiftShifts()
        }
    }

    setName(nm: string): void { this.m_name = nm }
    getName(): string { return this.m_name }
    setPrintName(b: boolean): void { this.m_printName = b }
    getPrintName(): boolean { return this.m_printName }
    setAbbr(ab: string): void { this.m_abbr = ab }
    getAbbr(): string { return this.m_abbr }
    setPrintAbbr(b: boolean): void { this.m_printAbbr = b }
    getPrintAbbr(): boolean { return this.m_printAbbr }

    /** C++ staffNumberToIndex() (the map) */
    staffNumberToIndexMap(): IntMap<number> { return this.m_staffNumberToIndex }

    //---------------------------------------------------------
    //   staffNumberToIndex
    //---------------------------------------------------------

    /**
     This handles the mapping from MusicXML staff number to the index
     in a Part's Staff list.
     In most cases, this is a simple decrement from the 1-based staff number
     to the 0-based index.
     However, in some parts some MusicXML staves are discarded, and a mapping
     must be stored from MusicXML staff number to index. When this mapping is
     defined (i.e. size() != 0), it is used. See MusicXmlParserPass1::attributes()
     for more information.
     */

    staffNumberToIndex(staffNumber: number): number {
        if (this.m_staffNumberToIndex.size() === 0) {
            return staffNumber - 1
        } else if (this.m_staffNumberToIndex.has(staffNumber)) {
            return this.m_staffNumberToIndex.get(staffNumber)!
        } else {
            return -1
        }
    }

    insertStaffNumberToIndex(staffNumber: number, staffIndex: number): void {
        this.m_staffNumberToIndex.insert(staffNumber, staffIndex)
    }

    lyricNumberHandler(): LyricNumberHandler { return this.m_lyricNumberHandler }

    setMaxStaff(staff: number): void {
        if (staff > this.m_maxStaff) {
            this.m_maxStaff = staff
        }
    }

    maxStaff(): number { return this.m_maxStaff }

    isVocalStaff(): boolean {
        return vocalInstrumentNames.includes(this.m_name)
    }

    isPercussionStaff(): boolean {
        for (const name of percussionInstrumentNames) {
            if (this.m_name.includes(name)) {
                return true
            }
        }
        return false
    }

    hasLyrics(b: boolean): void { this.m_hasLyrics = b }
}
