/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_inner.h/.cpp
 *
 * The methods of MTrack that are defined in importmidi.cpp (createNotes, processPendingNotes, processMeta,
 * fillGapWithRests, toDurationList, createKeys) are added to MTrack in importmidi.ts (module augmentation).
 * MTrack is a C++ value type: copies are clone() (like the C++ copy constructor it does not copy the tuplets but
 * rebuilds them from the chords).
 */

import { StdMap, StdMultimap, type MapNode } from '../../../../framework/global/stdmap'
import type { Staff } from '../../../../engraving/dom/staff'
import type { TDuration } from '../../../../engraving/dom/durationtype'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { GM1Program } from '../midishared/generalmidi'
import type { MidiTrack } from '../midishared/midifile'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import { type ChordIt, type ChordMap, newChordMap, copyChordMap } from './importmidi_chord'
import { type TupletIt, type TupletMap, newTupletMap } from './importmidi_tuplet'
import { TimeSigDenominator, TimeSigNumerator } from './importmidi_operation'
import { midiImportOperations } from './importmidi_operations'

// ---------------------------------------------------------------------------------------
// namespace Meter
// ---------------------------------------------------------------------------------------

// max level for tuplets: duration cannot go over the tuplet boundary
// this level should be greater than any other level
export const TUPLET_BOUNDARY_LEVEL = 10

export class MaxLevel {
    level = 0 // 0 - the biggest, whole bar level; other: -1, -2, ...
    levelCount = 0 // number of positions with 'level' value
    pos = new ReducedFraction(-1, 1) // first position with value 'level'; -1 - undefined pos
}

export interface DivLengthInfo {
    len: ReducedFraction
    level: number
}

export class DivisionInfo {
    onTime = new ReducedFraction() // division start tick (tick is counted from the beginning of bar)
    len = new ReducedFraction() // length of this whole division
    isTuplet = false
    divLengths: DivLengthInfo[] = [] // lengths of 'len' subdivisions
}

export function userTimeSigToFraction(timeSigNumerator: TimeSigNumerator,
                                      timeSigDenominator: TimeSigDenominator): ReducedFraction {
    let numerator = 4
    let denominator = 4

    switch (timeSigNumerator) {
    case TimeSigNumerator._2: numerator = 2; break
    case TimeSigNumerator._3: numerator = 3; break
    case TimeSigNumerator._4: numerator = 4; break
    case TimeSigNumerator._5: numerator = 5; break
    case TimeSigNumerator._6: numerator = 6; break
    case TimeSigNumerator._7: numerator = 7; break
    case TimeSigNumerator._9: numerator = 9; break
    case TimeSigNumerator._12: numerator = 12; break
    case TimeSigNumerator._15: numerator = 15; break
    case TimeSigNumerator._21: numerator = 21; break
    default: break
    }

    switch (timeSigDenominator) {
    case TimeSigDenominator._2: denominator = 2; break
    case TimeSigDenominator._4: denominator = 4; break
    case TimeSigDenominator._8: denominator = 8; break
    case TimeSigDenominator._16: denominator = 16; break
    case TimeSigDenominator._32: denominator = 32; break
    default: break
    }

    return new ReducedFraction(numerator, denominator)
}

export function fractionNumeratorToUserValue(n: number): TimeSigNumerator {
    let numerator = TimeSigNumerator._4

    if (n === 2) {
        numerator = TimeSigNumerator._2
    } else if (n === 3) {
        numerator = TimeSigNumerator._3
    } else if (n === 4) {
        numerator = TimeSigNumerator._4
    } else if (n === 5) {
        numerator = TimeSigNumerator._5
    } else if (n === 6) {
        numerator = TimeSigNumerator._6
    } else if (n === 7) {
        numerator = TimeSigNumerator._7
    } else if (n === 9) {
        numerator = TimeSigNumerator._9
    } else if (n === 12) {
        numerator = TimeSigNumerator._12
    } else if (n === 15) {
        numerator = TimeSigNumerator._15
    } else if (n === 21) {
        numerator = TimeSigNumerator._21
    }

    return numerator
}

export function fractionDenominatorToUserValue(z: number): TimeSigDenominator {
    let denominator = TimeSigDenominator._4

    if (z === 2) {
        denominator = TimeSigDenominator._2
    } else if (z === 4) {
        denominator = TimeSigDenominator._4
    } else if (z === 8) {
        denominator = TimeSigDenominator._8
    } else if (z === 16) {
        denominator = TimeSigDenominator._16
    } else if (z === 32) {
        denominator = TimeSigDenominator._32
    }

    return denominator
}

// ---------------------------------------------------------------------------------------
// MTrack
// ---------------------------------------------------------------------------------------

export class MTrack {
    program: GM1Program = GM1Program.AcousticGrandPiano
    staff: Staff | null = null
    mtrack: MidiTrack | null = null
    name = ''
    hasKey = false
    indexOfOperation = 0
    division = 0
    isDivisionInTps = false // ticks per second
    hadInitialNotes = false

    volumes = new StdMultimap<ReducedFraction, number>(compareReducedFractions)
    chords: ChordMap = newChordMap()
    tuplets: TupletMap = newTupletMap() // <tupletOnTime, ...>

    /** C++ copy constructor: copies the chords; the tuplets are extracted from the chords (updateTupletsFromChords) */
    clone(): MTrack {
        const t = new MTrack()
        t.program = this.program
        t.staff = this.staff
        t.mtrack = this.mtrack
        t.name = this.name
        t.hasKey = this.hasKey
        t.indexOfOperation = this.indexOfOperation
        t.division = this.division
        t.isDivisionInTps = this.isDivisionInTps
        t.hadInitialNotes = this.hadInitialNotes
        t.volumes = this.volumes.copy()
        t.chords = copyChordMap(this.chords)
        t.updateTupletsFromChords()
        return t
    }

    /**
     * C++ operator=(MTrack other) (other is a copy): sets all members to the ones of a copy of other and rebuilds the
     * tuplets from the chords (the tuplets of this track are kept, like C++)
     */
    assign(other: MTrack): void {
        const o = other.clone()
        this.program = o.program
        this.staff = o.staff
        this.mtrack = o.mtrack
        this.name = o.name
        this.hasKey = o.hasKey
        this.indexOfOperation = o.indexOfOperation
        this.division = o.division
        this.isDivisionInTps = o.isDivisionInTps
        this.hadInitialNotes = o.hadInitialNotes
        this.volumes = o.volumes
        this.chords = o.chords
        this.updateTupletsFromChords()
    }

    // chords of the MTrack are considered to be created/copied already;
    // tuplets here are extracted and inserted to the tuplet map of the MTrack
    // from tuplet iterators in chords/notes
    updateTupletsFromChords(): void {
        for (const chord of this.chords) {
            if (chord.second.isInTuplet) {
                chord.second.tuplet = this.updateTuplet(chord.second.tuplet)
            }
            for (const note of chord.second.notes) {
                if (note.isInTuplet) {
                    note.tuplet = this.updateTuplet(note.tuplet)
                }
            }
        }
    }

    /** C++ updateTuplet(iterator&): returns the new value of the iterator */
    private updateTuplet(tupletIt: TupletIt): TupletIt {
        let foundTuplet = this.tuplets.end()
        const [first, second] = this.tuplets.equalRange(tupletIt.first)
        for (let it = first; it !== second; it = it.next()) {
            if (it.second.voice === tupletIt.second.voice) {
                foundTuplet = it
                break
            }
        }
        if (foundTuplet !== this.tuplets.end()) {
            return foundTuplet
        } else {
            return this.tuplets.insert(tupletIt.first, tupletIt.second.clone())
        }
    }
}

/** std::multimap<int, MTrack> (<track index, track>) */
export type TrackMap = StdMultimap<number, MTrack>

export function newTrackMap(): TrackMap {
    return new StdMultimap<number, MTrack>()
}

// ---------------------------------------------------------------------------------------
// namespace MidiTuplet
// ---------------------------------------------------------------------------------------

export class TupletInfo {
    id = 0
    onTime = new ReducedFraction(-1, 1) // invalid
    len = new ReducedFraction(-1, 1)
    tupletNumber = -1
    // <chord onTime, chord iterator>
    chords = new StdMap<ReducedFraction, ChordIt>(compareReducedFractions)
    tupletSumError = new ReducedFraction()
    regularSumError = new ReducedFraction()
    sumLengthOfRests = new ReducedFraction()
    firstChordIndex = -1
    staccatoChords = new StdMap<ReducedFraction, number>(compareReducedFractions) // <onTime, note index>

    /** C++ copy */
    clone(): TupletInfo {
        const t = new TupletInfo()
        t.id = this.id
        t.onTime = this.onTime
        t.len = this.len
        t.tupletNumber = this.tupletNumber
        t.chords = this.chords.copy()
        t.tupletSumError = this.tupletSumError
        t.regularSumError = this.regularSumError
        t.sumLengthOfRests = this.sumLengthOfRests
        t.firstChordIndex = this.firstChordIndex
        t.staccatoChords = this.staccatoChords.copy()
        return t
    }
}

/** std::pair<ReducedFraction, ReducedFraction> (an interval) */
export type FractionPair = [ReducedFraction, ReducedFraction]

export function haveIntersection(interval1: FractionPair, interval2: FractionPair, strictComparison?: boolean): boolean
export function haveIntersection(interval: FractionPair, intervals: readonly FractionPair[], strictComparison?: boolean): boolean
export function haveIntersection(interval1: FractionPair, interval2: FractionPair | readonly FractionPair[],
                                 strictComparison = true): boolean {
    if (isIntervalList(interval2)) {
        for (const i of interval2) {
            if (haveIntersection(i, interval1, strictComparison)) {
                return true
            }
        }
        return false
    }
    if (strictComparison) {
        return interval1[1].gt(interval2[0]) && interval1[0].lt(interval2[1])
    }
    return interval1[1].ge(interval2[0]) && interval1[0].le(interval2[1])
}

function isIntervalList(v: FractionPair | readonly FractionPair[]): v is readonly FractionPair[] {
    return v.length === 0 || Array.isArray(v[0])
}

// ---------------------------------------------------------------------------------------
// namespace MidiCharset
// ---------------------------------------------------------------------------------------

/**
 * C++ std::string of the MIDI file (the bytes of a text) is a "binary" string here: one character per byte
 * (char codes 0-255). convertToCharset decodes it with the charset of the current MIDI file.
 */
export function convertToCharset(text: string): string {
    // charset for the current MIDI file
    const charset = midiImportOperations.data().charset
    const bytes = Uint8Array.from(text, c => c.charCodeAt(0) & 0xff)
    try {
        return new TextDecoder(charset).decode(bytes)
    } catch {
        return new TextDecoder('utf-8').decode(bytes)
    }
}

export function defaultCharset(): string {
    return 'UTF-8'
}

/** the bytes up to the terminating 0 as a binary string (see convertToCharset) */
export function fromUchar(text: Uint8Array): string {
    let s = ''
    for (let i = 0; i < text.length && text[i] !== 0; ++i) {
        s += String.fromCharCode(text[i])
    }
    return s
}

// ---------------------------------------------------------------------------------------
// namespace MidiBar
// ---------------------------------------------------------------------------------------

export function findBarStart(time: ReducedFraction, sigmap: TimeSigMap): ReducedFraction {
    const [barIndex] = sigmap.tickValues(time.ticks())
    return ReducedFraction.fromTicks(sigmap.bar2tick(barIndex, 0))
}

// ---------------------------------------------------------------------------------------
// namespace MidiDuration
// ---------------------------------------------------------------------------------------

export function durationCount(durations: readonly [ReducedFraction, TDuration][]): number {
    let count = durations.length
    for (const d of durations) {
        if (d[1].dots()) {
            count += 0.5
        }
    }
    return count
}

export type { MapNode }
