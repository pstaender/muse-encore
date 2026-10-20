/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stringdata.h/.cpp
 *
 * TODO(port): capos (Staff::capo()), sortChordNotesUseSameString (configuration()->preferSameStringForTranspose() is off by default)
 */

import type { Fraction } from '../types/fraction'
import { INVALID_FRET_INDEX, INVALID_STRING_INDEX, VOICES } from '../types/types'
import type { Chord } from './chord'
import { DisplayFretOption, type Note } from './note'
import { INVALID_PITCH, pitchIsValid } from './pitchspelling'
import type { Staff } from './staff'

// defines the string of an instrument
export class InstrString {
    constructor(
        public pitch = 0, // the pitch of the string
        public open = false, // true: string is open | false: string is fretted
        public startFret = 0, // banjo 5th string starts on 5th fret
        public useFlat = false) {}

    equals(d: InstrString): boolean { return d.pitch === this.pitch && d.open === this.open }
}

export class StringData {
    private static bFretting = false

    private m_stringTable: InstrString[] = [] // no strings by default
    private m_frets = 0
    private m_useFlats = false

    isNull(): boolean {
        return this.m_frets === 0 && this.m_stringTable.length === 0
    }

    strings(): number { return this.m_stringTable.length }
    stringList(): InstrString[] { return this.m_stringTable }
    frets(): number { return this.m_frets }
    setFrets(val: number): void { this.m_frets = val }
    useFlats(): boolean { return this.m_useFlats }

    frettedStrings(): number {
        let num = 0
        for (const s of this.m_stringTable) {
            if (!s.open) {
                num++
            }
        }
        return num
    }

    //---------------------------------------------------------
    //   fret
    //    Returns the fret corresponding to the pitch / string combination
    //    at given staff.
    //    Returns INVALID_FRET_INDEX if not possible
    //---------------------------------------------------------

    fretForStaff(pitch: number, string: number, staff: Staff | null, tick?: Fraction): number {
        return this.fret(pitch, string, tick ? StringData.pitchOffsetAt(staff, tick) : StringData.pitchOffsetAtStaff(staff))
    }

    //---------------------------------------------------------
    //   fretChords
    //    Assigns fretting to all the notes of each chord in the same segment of chord
    //    re-using existing fretting wherever possible
    //
    //    Minimizes fret conflicts (multiple notes on the same string)
    //    but marks as fretConflict notes which cannot be fretted
    //    (outside tablature range) or which cannot be assigned
    //    a separate string
    //---------------------------------------------------------

    fretChords(chord: Chord): void {
        if (StringData.bFretting) {
            return
        }
        StringData.bFretting = true
        try {
            this.doFretChords(chord)
        } finally {
            StringData.bFretting = false
        }
    }

    private doFretChords(chord: Chord): void {
        const strings = this.strings()

        // we need the notes sorted in order of string (from highest to lowest) and then pitch
        const sortedNotes = new Map<number, Note>()
        const count = { v: 0 }
        // if chord parent is not a segment, the chord is special (usually a grace chord):
        // fret it by itself, ignoring the segment
        if (!chord.explicitParent()!.isSegment()) {
            this.sortChordNotes(sortedNotes, chord, count)
        } else {
            // scan each chord of seg from same staff as 'chord', inserting each of its notes in sortedNotes
            const seg = chord.segment()!
            const trkFrom = Math.trunc(chord.track() / VOICES) * VOICES
            const trkTo = trkFrom + VOICES
            for (let trk = trkFrom; trk < trkTo; ++trk) {
                const ch = seg.elist()[trk]
                if (ch && ch.isChord()) {
                    this.sortChordNotes(sortedNotes, ch as Chord, count)
                }
            }
        }
        // C++ std::map iterates in key order
        const notes = [...sortedNotes.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])

        for (const note of notes) {
            if (note.string() >= strings) {
                note.setString(INVALID_STRING_INDEX)
                note.setFret(INVALID_FRET_INDEX)
            }
        }

        if (!strings) {
            return
        }

        // we need to keep track of string allocation
        const bUsed = new Array<number>(strings).fill(0)

        for (const note of notes) {
            if (note.string() !== INVALID_STRING_INDEX && note.displayFret() === DisplayFretOption.NoHarmonic) {
                bUsed[note.string()]++
            }
        }

        // scan chord notes from highest, matching with strings from the highest
        for (const note of notes) {
            const nString = note.string()
            let nNewString = nString
            const nFret = note.fret()
            let nNewFret = nFret
            note.setFretConflict(false) // assume no conflicts on this note
            // if no fretting (any invalid fretting has been erased by sortChordNotes() )
            if (nString === INVALID_STRING_INDEX) {
                // get a new fretting
                const res = this.convertPitch(note.pitch(), StringData.pitchOffsetAt(chord.staff(), chord.tick()))
                nNewString = res.string
                nNewFret = res.fret
                if (res.ok && note.displayFret() === DisplayFretOption.NoHarmonic && !note.negativeFretUsed()) {
                    // Check if this string should be ignored in capo params and updated fret
                    nNewFret = this.fret(note.pitch(), nNewString, StringData.pitchOffsetAt(chord.staff(), chord.tick()))
                    // note can be fretted: use string
                    bUsed[nNewString]++
                } else {
                    // no way to fit this note in this tab:
                    // mark as fretting conflict
                    note.setFretConflict(true)
                    // store fretting change without affecting chord context
                    if (nFret !== nNewFret) {
                        note.setFret(nNewFret)
                    }
                    if (nString !== nNewString) {
                        note.setString(nNewString)
                    }
                    continue
                }
            }

            // if the note string (either original or newly assigned) is also used by another note
            if (note.displayFret() === DisplayFretOption.NoHarmonic && bUsed[nNewString] > 1) {
                // attempt to find a suitable string, from topmost
                for (let nTempString = 0; nTempString < strings; nTempString++) {
                    let nTempFret: number
                    if (bUsed[nTempString] < 1
                        && (nTempFret = this.fret(note.pitch(), nTempString,
                            StringData.pitchOffsetAt(chord.staff(), chord.tick()))) !== INVALID_FRET_INDEX) {
                        bUsed[nNewString]-- // free previous string
                        bUsed[nTempString]++ // and occupy new string
                        nNewFret = nTempFret
                        nNewString = nTempString
                        break
                    }
                }
            }

            // TODO : try to optimize used fret range, avoiding excessively open positions

            // if fretting did change, store as a fret change
            if (nFret !== nNewFret) {
                note.setFret(nNewFret)
            }
            if (nString !== nNewString) {
                note.setString(nNewString)
            }
        }

        // check for any remaining fret conflict
        for (const note of notes) {
            if (!note.negativeFretUsed() && (note.string() === -1 || bUsed[note.string()] > 1)) {
                note.setFretConflict(true)
            }
        }
    }

    //---------------------------------------------------------
    //   pitchOffsetAt
    //   Computes the pitch offset relevant for string data calculation at the given point.
    //
    //   For string data calculations, pitch offset may depend on transposition, capos and, possibly, ottavas.
    //---------------------------------------------------------

    static pitchOffsetAtStaff(staff: Staff | null): number {
        return -(staff ? staff.part()!.instrument().transpose().chromatic : 0)
    }

    static pitchOffsetAt(staff: Staff | null, tick: Fraction): number {
        if (!staff) {
            return 0
        }
        const transp = staff.part()!.instrument(tick).transpose().chromatic
        // TODO(port): capo offset
        return -transp + staff.pitchOffset(tick)
    }

    //---------------------------------------------------------
    //   convertPitch
    //   Finds string and fret for a note.
    //
    //   Returns suitable string and fret values for pitch / pitchOffset,
    //   using the highest possible string.
    //   If note cannot be fretted, uses fret 0 on nearest string and returns ok = false
    //
    //    Note: Strings are stored internally from lowest (0) to highest (strings()-1),
    //          but the returned string value references strings in reversed, 'visual', order:
    //          from highest (0) to lowest (strings()-1)
    //---------------------------------------------------------

    convertPitch(pitch: number, pitchOffset: number): { ok: boolean; string: number; fret: number } {
        const strings = this.m_stringTable.length
        if (strings < 1) {
            return { ok: false, string: INVALID_STRING_INDEX, fret: INVALID_FRET_INDEX }
        }

        pitch += pitchOffset

        // if above max fret on highest string, fret on first string, but return failure
        if (pitch > this.m_stringTable[strings - 1].pitch + this.m_frets) {
            return { ok: false, string: 0, fret: 0 }
        }

        if (this.isFiveStringBanjo()) {
            // special case: open banjo 5th string
            if (pitch === this.m_stringTable[0].pitch) {
                return { ok: true, string: 4, fret: 0 }
            }
            // test remaining 4 strings from highest to lowest
            for (let i = 4; i > 0; i--) {
                const strg = this.m_stringTable[i]
                if (pitch >= strg.pitch) {
                    return { ok: true, string: strings - i - 1, fret: pitch - strg.pitch }
                }
            }
        } else {
            // look for a suitable string, starting from the highest
            // NOTE: this assumes there are always enough frets to fill
            // the interval between any fretted string and the next
            for (let i = strings - 1; i >= 0; i--) {
                const strg = this.m_stringTable[i]
                if (pitch >= strg.pitch) {
                    return { ok: true, string: strings - i - 1, fret: pitch - strg.pitch }
                }
            }
        }

        // if no string found, pitch is below lowest string:
        // fret on last string, but return failure
        return { ok: false, string: strings - 1, fret: 0 }
    }

    //---------------------------------------------------------
    //   getPitch
    //    Returns the pitch corresponding to the string / fret / pitchOffset combination.
    //    Returns INVALID_PITCH if not possible
    //    Note: frets above max fret are accepted.
    //---------------------------------------------------------

    getPitch(string: number, fret: number, pitchOffset: number): number {
        const strings = this.m_stringTable.length
        if (string < 0 || string >= strings) {
            return INVALID_PITCH
        }
        const strg = this.m_stringTable[strings - string - 1]
        let pitch = strg.pitch - pitchOffset + (strg.open ? 0 : fret)
        if (strg.startFret > 0 && fret >= strg.startFret) {
            pitch -= strg.startFret // banjo 5th string adjustment
        }
        return pitch
    }

    //---------------------------------------------------------
    //   fret
    //    Returns the fret corresponding to the pitch / string / pitchOffset combination.
    //    returns INVALID_FRET_INDEX if not possible
    //---------------------------------------------------------

    fret(pitch: number, string: number, pitchOffset: number): number {
        const strings = this.m_stringTable.length
        if (strings < 1) { // no strings at all!
            return INVALID_FRET_INDEX
        }

        if (string < 0 || string >= strings) { // no such a string
            return INVALID_FRET_INDEX
        }

        pitch += pitchOffset

        const strg = this.m_stringTable[strings - string - 1]
        let fret = pitch - strg.pitch
        if (fret > 0 && strg.startFret > 0) {
            fret += strg.startFret // banjo 5th string adjustment
        }

        // fret number is invalid or string cannot be fretted
        if (fret < 0 || fret > this.m_frets || (fret > 0 && strg.open)) {
            return INVALID_FRET_INDEX
        }
        return fret
    }

    //---------------------------------------------------------
    //   sortChordNotes
    //    Adds to sortedNotes the notes of Chord in string/pitch order
    //    Note: notes are sorted first by string (top string being 0),
    //          then by negated pitch (higher pitches resulting in lower key),
    //          then by order of submission to disambiguate notes with the same pitch.
    //          Everything else being equal, this makes notes in higher-numbered voices
    //          to be sorted after notes in lower-numbered voices (voice 2 after voice 1 and so on)
    //    Notes without a string assigned yet, are sorted according to the lowest string which can accommodate them.
    //---------------------------------------------------------

    private sortChordNotes(sortedNotes: Map<number, Note>, chord: Chord, count: { v: number }): void {
        const transp = chord.staff() ? chord.part()!.instrument(chord.tick()).transpose().chromatic : 0
        const pitchOffset = -transp + chord.staff()!.pitchOffset(chord.segment()!.tick())

        for (const note of chord.notes()) {
            if (note.displayFret() !== DisplayFretOption.NoHarmonic) {
                continue
            }

            const string = note.string()
            const noteFret = note.fret()

            const pitch = this.getPitch(string, noteFret, StringData.pitchOffsetAt(chord.staff(), chord.tick()))
            // if note not fretted yet or current fretting no longer valid,
            // use most convenient string as key
            if (!note.negativeFretUsed() && (string <= INVALID_STRING_INDEX || noteFret <= INVALID_FRET_INDEX
                                             || (pitchIsValid(pitch) && pitch !== note.pitch()))) {
                note.setString(INVALID_STRING_INDEX)
                note.setFret(INVALID_FRET_INDEX)
            }

            let key = string * 100000
            key += -(note.pitch() + pitchOffset) * 100 + count.v // disambiguate notes of equal pitch
            if (!sortedNotes.has(key)) { // C++ std::map::insert keeps an existing key
                sortedNotes.set(key, note)
            }
            count.v++
        }
    }

    //---------------------------------------------------------
    //   configBanjo5thString
    //   Assumes isFiveStringBanjo() has already been called.
    //   This method looks at the banjo tuning and sets startFret
    //   appropriately.
    //---------------------------------------------------------

    configBanjo5thString(): void {
        // banjo 5th string (pitch 67 == G)
        const strg5 = this.m_stringTable[0]

        this.m_frets = 24 // not needed after bug #316931 is fixed

        // adjust startFret if using a 5th string capo (6..12)
        if (strg5.pitch > 67 && strg5.pitch < 74) {
            strg5.startFret = strg5.pitch - 62
        } else {
            strg5.startFret = 5 // no 5th string capo
        }
    }

    //---------------------------------------------------------
    //    isFiveStringBanjo
    //    Based only on number of strings and tuning - other info
    //    may not be available when this is called. Checks 5th string
    //    pitch is higher than 4th (i.e. not a 5 string bass)
    //---------------------------------------------------------

    isFiveStringBanjo(): boolean {
        return this.m_stringTable.length === 5 && this.m_stringTable[0].pitch > this.m_stringTable[1].pitch
    }
}
