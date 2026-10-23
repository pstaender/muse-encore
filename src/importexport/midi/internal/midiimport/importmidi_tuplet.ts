/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tuplet.h/.cpp (namespace MidiTuplet)
 *
 * std::multimap<ReducedFraction, TupletData> is TupletMap (StdMultimap: its nodes are the C++ iterators).
 */

import { MapNode, StdMultimap } from '../../../../framework/global/stdmap'
import type { DurationElement } from '../../../../engraving/dom/durationelement'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import type { ChordIt, ChordMap, ChordPair, MidiNote } from './importmidi_chord'
import { findChordsForTimeRange, findMaxChordLength, maxNoteOffTime, minAllowedDuration } from './importmidi_chord'
import { type FractionPair, type MTrack, type TupletInfo, haveIntersection } from './importmidi_inner'
import {
    findMaxQuantizedOffTime, findMinQuantizedOnTime, findOffTimeQuantError, findOffTimeTupletQuantError,
    findOnTimeQuantError, findOnTimeTupletQuantError,
} from './importmidi_quant'
import { midiImportOperations } from './importmidi_operations'
import { detectTuplets } from './importmidi_tuplet_detect'
import { filterTuplets } from './importmidi_tuplet_filter'
import { type TiedTuplet, assignVoices, chordInterval, findBackTiedTuplets, tupletVoiceLimit } from './importmidi_tuplet_voice'

export class TupletData {
    voice = 0
    onTime = new ReducedFraction()
    len = new ReducedFraction()
    tupletNumber = 0
    elements: DurationElement[] = []

    /** C++ aggregate initialization {voice, onTime, len, tupletNumber} */
    constructor(voice = 0, onTime = new ReducedFraction(), len = new ReducedFraction(), tupletNumber = 0,
                elements: DurationElement[] = []) {
        this.voice = voice
        this.onTime = onTime
        this.len = len
        this.tupletNumber = tupletNumber
        this.elements = elements
    }

    /** C++ copy */
    clone(): TupletData {
        return new TupletData(this.voice, this.onTime, this.len, this.tupletNumber, this.elements.slice())
    }
}

export interface TupletLimits {
    // ratio - for conversion from tuplet durations to regular durations
    // for example, 8th note in triplet * 3/2 = regular 8th note
    ratio: ReducedFraction
    minNoteCount: number
    minNoteCountAddVoice: number
    minNoteCountStaccato: number
    minNoteCountHuman: number
}

/** std::multimap<ReducedFraction, TupletData> */
export type TupletMap = StdMultimap<ReducedFraction, TupletData>
/** std::multimap<ReducedFraction, TupletData>::iterator */
export type TupletIt = MapNode<ReducedFraction, TupletData>

export function newTupletMap(): TupletMap {
    return new StdMultimap<ReducedFraction, TupletData>(compareReducedFractions)
}

// ---- MidiTuplet functions (importmidi_tuplet.cpp) below ----

const s_tupletsLimits = new Map<number, TupletLimits>([
    [2, { ratio: new ReducedFraction(2, 3), minNoteCount: 1, minNoteCountAddVoice: 2, minNoteCountStaccato: 2, minNoteCountHuman: 2 }],
    [3, { ratio: new ReducedFraction(3, 2), minNoteCount: 1, minNoteCountAddVoice: 3, minNoteCountStaccato: 3, minNoteCountHuman: 2 }],
    [4, { ratio: new ReducedFraction(4, 3), minNoteCount: 3, minNoteCountAddVoice: 4, minNoteCountStaccato: 3, minNoteCountHuman: 3 }],
    [5, { ratio: new ReducedFraction(5, 4), minNoteCount: 3, minNoteCountAddVoice: 4, minNoteCountStaccato: 4, minNoteCountHuman: 4 }],
    [7, { ratio: new ReducedFraction(7, 8), minNoteCount: 4, minNoteCountAddVoice: 6, minNoteCountStaccato: 5, minNoteCountHuman: 6 }],
    [9, { ratio: new ReducedFraction(9, 8), minNoteCount: 6, minNoteCountAddVoice: 7, minNoteCountStaccato: 7, minNoteCountHuman: 8 }],
])

export function tupletsLimits(): ReadonlyMap<number, TupletLimits> {
    return s_tupletsLimits
}

export function tupletLimits(tupletNumber: number): TupletLimits {
    const it = s_tupletsLimits.get(tupletNumber)
    if (!it) {
        throw new Error('MidiTuplet::tupletValue: Unknown tuplet')
    }
    return it
}

export function tupletFromId(id: number, tuplets: readonly TupletInfo[]): TupletInfo {
    const it = tuplets.find(t => t.id === id)
    if (!it) {
        throw new Error('MidiTuplet::tupletFromId: Tuplet not found from id')
    }
    return it
}

export function hasNonTrivialChord(
    chordOnTime: ReducedFraction,
    notes: readonly MidiNote[],
    tupletOnTime: ReducedFraction,
    tupletLen: ReducedFraction): boolean {
    if (chordOnTime.eq(tupletOnTime)) {
        for (const note of notes) {
            if (note.offTime.minus(chordOnTime).lt(tupletLen)) {
                return true
            }
        }
    } else {
        if (chordOnTime.gt(tupletOnTime) && chordOnTime.lt(tupletOnTime.plus(tupletLen))) {
            return true
        }
        if (chordOnTime.ge(tupletOnTime.plus(tupletLen))) {
            return false
        }

        for (const note of notes) {
            if (note.offTime.lt(tupletOnTime.plus(tupletLen))) {
                return true
            }
        }
    }
    return false
}

export function isTupletUseless(
    voice: number,
    onTime: ReducedFraction,
    len: ReducedFraction,
    maxChordLength: ReducedFraction,
    chords: ChordMap): boolean {
    let haveIntersectionWithChord = false
    const foundChords = findChordsForTimeRange(voice, onTime, onTime.plus(len), chords, maxChordLength)
    for (const chordIt of foundChords) {
        // ok, tuplet contains at least one chord
        // check now does it have notes with len < tuplet.len
        if (hasNonTrivialChord(chordIt.first, chordIt.second.notes, onTime, len)) {
            haveIntersectionWithChord = true
            break
        }
    }

    return !haveIntersectionWithChord
}

export function removeTuplet(
    tupletIt: TupletIt,
    tuplets: TupletMap,
    maxChordLength: ReducedFraction,
    chords: ChordMap): TupletIt {
    // remove references to this tuplet in chords and notes
    let chordIt = chords.lowerBound(tupletIt.second.onTime.plus(tupletIt.second.len))
    if (chordIt !== chords.begin()) {
        chordIt = chordIt.prev()
        while (chordIt.first.plus(maxChordLength).gt(tupletIt.first)) {
            const c = chordIt.second
            if (c.isInTuplet && c.tuplet === tupletIt) {
                c.isInTuplet = false
            }
            for (const note of c.notes) {
                if (note.isInTuplet && note.tuplet === tupletIt) {
                    note.isInTuplet = false
                }
            }
            if (chordIt === chords.begin()) {
                break
            }
            chordIt = chordIt.prev()
        }
    }

    return tuplets.erase(tupletIt)
}

export function removeTupletIfEmpty(
    tupletIt: TupletIt,
    tuplets: TupletMap,
    maxChordLength: ReducedFraction,
    chords: ChordMap): TupletIt {
    let resultIt = tupletIt
    const tuplet = tupletIt.second

    if (isTupletUseless(tuplet.voice, tuplet.onTime, tuplet.len, maxChordLength, chords)) {
        resultIt = removeTuplet(tupletIt, tuplets, maxChordLength, chords)
    }

    return resultIt
}

// tuplets with no chords are removed
// tuplets with single chord with chord.onTime = tuplet.onTime
//    and chord.len = tuplet.len are removed as well

// better to call this function after quantization

export function removeEmptyTuplets(track: MTrack): void {
    const tuplets = track.tuplets
    if (tuplets.empty()) {
        return
    }
    const chords = track.chords
    const maxChordLength = findMaxChordLength(chords)

    for (let tupletIt = tuplets.begin(); tupletIt !== tuplets.end();) {
        const it = removeTupletIfEmpty(tupletIt, tuplets, maxChordLength, chords)
        if (it !== tupletIt) {
            tupletIt = it
            continue
        }
        tupletIt = tupletIt.next()
    }
}

function averagePitch(chords: TupletInfo['chords']): number {
    if (chords.empty()) {
        return -1
    }

    let sumPitch = 0
    let noteCounter = 0
    for (const chord of chords) {
        const midiNotes = chord.second.second.notes
        for (const midiNote of midiNotes) {
            sumPitch += midiNote.pitch
            ++noteCounter
        }
    }

    return Math.round(sumPitch * 1.0 / noteCounter)
}

function sortNotesByPitch(startBarChordIt: ChordIt, endBarChordIt: ChordIt): void {
    for (let it = startBarChordIt; it !== endBarChordIt; it = it.next()) {
        it.second.notes.sort((n1, n2) => n2.pitch - n1.pitch)
    }
}

function sortTupletsByAveragePitch(tuplets: TupletInfo[]): void {
    tuplets.sort((t1, t2) => averagePitch(t2.chords) - averagePitch(t1.chords))
}

export function tupletInterval(tuplet: TupletInfo, basicQuant: ReducedFraction): FractionPair {
    let tupletEnd = tuplet.onTime.plus(tuplet.len)

    for (const chord of tuplet.chords) {
        const offTime = findMaxQuantizedOffTime(chord.second, basicQuant)
        if (offTime.gt(tupletEnd)) {
            tupletEnd = offTime
        }
    }

    return [tuplet.onTime, tupletEnd]
}

export function findTupletIntervals(tuplets: readonly TupletInfo[], basicQuant: ReducedFraction): FractionPair[] {
    const tupletIntervals: FractionPair[] = []
    for (const tuplet of tuplets) {
        tupletIntervals.push(tupletInterval(tuplet, basicQuant))
    }

    return tupletIntervals
}

// find tuplets over which duration lies

export function findTupletsInBarForDuration(
    voice: number,
    barStartTick: ReducedFraction,
    durationOnTime: ReducedFraction,
    durationLen: ReducedFraction,
    tupletEvents: TupletMap): TupletData[] {
    const tupletsData: TupletData[] = []
    if (tupletEvents.empty()) {
        return tupletsData
    }
    let tupletIt = tupletEvents.lowerBound(barStartTick)

    while (tupletIt !== tupletEvents.end()
           && tupletIt.first.lt(durationOnTime.plus(durationLen))) {
        if (tupletIt.second.voice === voice
            && durationOnTime.lt(tupletIt.first.plus(tupletIt.second.len))) {
            // if tuplet and duration intersect each other
            const tupletData = tupletIt.second.clone()
            // convert tuplet onTime to local bar ticks
            tupletData.onTime = tupletData.onTime.minus(barStartTick)
            tupletsData.push(tupletData)
        }
        tupletIt = tupletIt.next()
    }
    return tupletsData
}

export function findTupletsForTimeRange(
    voice: number,
    onTime: ReducedFraction,
    len: ReducedFraction,
    tupletEvents: TupletMap,
    strictComparison: boolean): TupletIt[] {
    const result: TupletIt[] = []

    if (tupletEvents.empty()) {
        return result
    }

    let it = tupletEvents.upperBound(onTime.plus(len))
    if (it === tupletEvents.begin()) {
        return result
    }
    it = it.prev()
    while (true) {
        const tupletData = it.second
        if (tupletData.voice === voice) {
            const interval: FractionPair = [onTime, onTime.plus(len)]
            const tupletInterv: FractionPair = [tupletData.onTime, tupletData.onTime.plus(tupletData.len)]
            if (haveIntersection(interval, tupletInterv, strictComparison)) {
                result.push(it)
            }
        }
        if (it === tupletEvents.begin()) {
            break
        }
        it = it.prev()
    }
    return result
}

export function findTupletContainingTime(
    voice: number,
    time: ReducedFraction,
    tupletEvents: TupletMap,
    strictComparison: boolean): TupletIt {
    const tuplets = findTupletsForTimeRange(voice, time, new ReducedFraction(0, 1), tupletEvents, strictComparison)
    if (tuplets.length === 0) {
        return tupletEvents.end()
    }

    return tuplets[0]
}

function findTupletChords(tuplets: readonly TupletInfo[]): Set<ChordIt> {
    const tupletChords = new Set<ChordIt>()
    for (const tupletInfo of tuplets) {
        for (const tupletChord of tupletInfo.chords) {
            tupletChords.add(tupletChord.second)
        }
    }
    return tupletChords
}

function findNonTupletChords(
    tuplets: readonly TupletInfo[],
    startBarChordIt: ChordIt,
    endBarChordIt: ChordIt): ChordIt[] {
    const tupletChords = findTupletChords(tuplets)
    const nonTuplets: ChordIt[] = []
    for (let it = startBarChordIt; it !== endBarChordIt; it = it.next()) {
        if (!tupletChords.has(it)) {
            nonTuplets.push(it)
        }
    }

    return nonTuplets
}

// split first tuplet chord, that belong to 2 tuplets, into 2 chords

function splitTupletChord(lastMatch: TupletInfo, chords: ChordMap): void {
    const chordEventNode = lastMatch.chords.begin()
    const chordEvent = chordEventNode.second
    const prevChord = chordEvent.second
    const onTime = chordEvent.first
    const newChord = prevChord.clone()
    // erase all notes except the first one
    newChord.notes.splice(1)
    // erase the first note
    prevChord.notes.splice(0, 1)
    chordEventNode.second = chords.insert(onTime, newChord)
}

export function splitFirstTupletChords(tuplets: TupletInfo[], chords: ChordMap): void {
    for (let now = 0; now !== tuplets.length; ++now) {
        let lastMatch = tuplets.length
        const nowChordIt = tuplets[now].chords.begin()
        for (let prev = 0; prev !== now; ++prev) {
            const prevChordIt = tuplets[prev].chords.begin()
            if (tuplets[now].firstChordIndex === 0
                && tuplets[prev].firstChordIndex === 0
                && nowChordIt.second === prevChordIt.second) {
                lastMatch = prev
            }
        }
        if (lastMatch !== tuplets.length) {
            splitTupletChord(tuplets[lastMatch], chords)
        }
    }
}

// first tuplet notes with offTime quantization error,
// that is greater for tuplet quant rather than for regular quant,
// are removed from tuplet, except that was the last note

// if noteLen <= tupletLen
//     remove notes with big offTime quant error;
//     and here is a tuning for clearer tuplet processing:
//         if tuplet has only one (first) chord -
//             we can remove all notes and erase tuplet;
//         if tuplet has multiple chords -
//             we should leave at least one note in the first chord

function minimizeOffTimeError(
    tuplets: TupletInfo[],
    chords: ChordMap,
    nonTuplets: ChordIt[],
    startBarTick: ReducedFraction,
    basicQuant: ReducedFraction): void {
    for (let it = 0; it !== tuplets.length;) {
        const tupletInfo = tuplets[it]
        const firstChord = tupletInfo.chords.begin()
        if (firstChord === tupletInfo.chords.end() || tupletInfo.firstChordIndex !== 0) {
            ++it
            continue
        }
        let onTime = firstChord.second.first
        if (onTime.lt(startBarTick)) {
            onTime = startBarTick
        }
        const midiChord = firstChord.second.second
        const notes = midiChord.notes

        const removedIndexes: number[] = []
        const leavedIndexes: number[] = []
        const tupletNoteLen = tupletInfo.len.div(tupletInfo.tupletNumber)

        for (let i = 0; i !== notes.length; ++i) {
            const note = notes[i]
            if (note.offTime.minus(onTime).le(tupletInfo.len)
                && note.offTime.minus(onTime).gt(tupletNoteLen)) {
                // if note is longer than tuplet note length
                // then it's simpler to move it outside the tuplet
                // if the error is not larger than error inside tuplet
                if ((tupletInfo.chords.size() === 1
                     && notes.length > removedIndexes.length)
                    || (tupletInfo.chords.size() > 1
                        && notes.length > removedIndexes.length + 1)) {
                    const tupletError = findOffTimeTupletQuantError(
                        onTime, note.offTime, tupletInfo.len,
                        tupletLimits(tupletInfo.tupletNumber).ratio, startBarTick)
                    const regularError = findOffTimeQuantError(firstChord.second, note.offTime, basicQuant)

                    if (tupletError.ge(regularError)) {
                        removedIndexes.push(i)
                        continue
                    }
                }
            }
            leavedIndexes.push(i)
        }
        if (removedIndexes.length !== 0) {
            const newTupletChord = midiChord.clone()
            newTupletChord.notes = []
            for (const i of leavedIndexes) {
                newTupletChord.notes.push(notes[i].clone())
            }

            const newNotes: MidiNote[] = []
            for (const i of removedIndexes) {
                newNotes.push(notes[i])
            }
            midiChord.notes = newNotes
            // force add chord to this bar, even if it has barIndex of another bar
            nonTuplets.push(firstChord.second)
            if (newTupletChord.notes.length !== 0) {
                firstChord.second = chords.insert(firstChord.second.first, newTupletChord)
            } else {
                tupletInfo.chords.erase(tupletInfo.chords.begin())
                if (tupletInfo.chords.empty()) {
                    tuplets.splice(it, 1) // remove tuplet without chords
                    continue
                }
            }
        }
        ++it
    }
}

function addChordsBetweenTupletNotes(
    tuplets: TupletInfo[],
    nonTuplets: ChordIt[],
    chords: ChordMap,
    startBarTick: ReducedFraction,
    basicQuant: ReducedFraction): void {
    for (const tuplet of tuplets) {
        for (let it = 0; it < nonTuplets.length;) {
            const chordIt = nonTuplets[it]
            const onTime = chordIt.first
            const tupletInterv: FractionPair = [tuplet.onTime, tuplet.onTime.plus(tuplet.len)]
            const chordInterv = chordInterval(chordIt, chords, basicQuant, startBarTick)
            if (onTime.gt(tuplet.onTime) && haveIntersection(tupletInterv, chordInterv)) {
                const tupletRatio = tupletLimits(tuplet.tupletNumber).ratio

                let tupletError = findOnTimeTupletQuantError(chordIt, tuplet.len, tupletRatio, startBarTick)
                let regularError = findOnTimeQuantError(chordIt, basicQuant)

                const offTime = maxNoteOffTime(chordIt.second.notes)
                if (offTime.lt(tuplet.onTime.plus(tuplet.len))) {
                    tupletError = tupletError.plus(findOffTimeTupletQuantError(
                        onTime, offTime, tuplet.len, tupletRatio, startBarTick))
                    regularError = regularError.plus(findOffTimeQuantError(chordIt, offTime, basicQuant))
                }
                if (tupletError.lt(regularError)) {
                    tuplet.chords.insert(onTime, chordIt)
                    nonTuplets.splice(it, 1)
                    continue
                }
            }
            ++it
        }
    }
}

/** QT_DEBUG check */
export function doTupletsHaveCommonChords(tuplets: readonly TupletInfo[]): boolean {
    if (tuplets.length === 0) {
        return false
    }
    const chordsI = new Set<ChordIt>()
    for (const tuplet of tuplets) {
        for (const chord of tuplet.chords) {
            if (chordsI.has(chord.second)) {
                return true
            }
            chordsI.add(chord.second)
        }
    }
    return false
}

// check - do all tuplets have references from some chords

function checkTupletsForExistence(chords: ChordMap, tupletEvents: TupletMap): boolean {
    // check - do all tuplets have references from some chords
    const tupletMap = new Set<TupletIt>()
    for (const tuplet of tupletEvents) {
        tupletMap.add(tuplet)
    }

    for (const chord of chords) {
        const c = chord.second
        if (c.isInTuplet) {
            if (!tupletMap.has(c.tuplet)) {
                // Chords have references to non-existing tuplets
                return false
            }
        }
        for (const note of c.notes) {
            if (note.isInTuplet) {
                if (!tupletMap.has(note.tuplet)) {
                    // Notes have references to non-existing tuplets
                    return false
                }
            }
        }
    }
    return true
}

// check - do all tuplets have references from some chords

function checkForDanglingTuplets(chords: ChordMap, tupletEvents: TupletMap): boolean {
    const maxChordLength = findMaxChordLength(chords)

    for (let tupletIt = tupletEvents.begin(); tupletIt !== tupletEvents.end(); tupletIt = tupletIt.next()) {
        const tuplet = tupletIt.second
        let hasReference = false
        let chordIt = chords.lowerBound(tuplet.onTime.plus(tuplet.len))

        if (chordIt !== chords.begin()) {
            chordIt = chordIt.prev()
            while (chordIt.first.plus(maxChordLength).gt(tupletIt.first)) {
                const c = chordIt.second
                if (c.isInTuplet && c.tuplet === tupletIt) {
                    hasReference = true
                    break
                }
                for (const note of c.notes) {
                    if (note.isInTuplet && note.tuplet === tupletIt) {
                        hasReference = true
                        break
                    }
                }
                if (hasReference || chordIt === chords.begin()) {
                    break
                }
                chordIt = chordIt.prev()
            }
        }

        if (!hasReference) {
            // Not all tuplets have references in chords - there are dangling tuplets
            return false
        }
    }
    return true
}

/** std::set<std::pair<ReducedFraction, int>> (<onTime, voice>) */
class OnTimeVoiceSet {
    private m_keys = new Set<string>()

    /** returns true if inserted */
    insert(onTime: ReducedFraction, voice: number): boolean {
        const r = onTime.reduced()
        const key = `${r.numerator()}/${r.denominator()}:${voice}`
        if (this.m_keys.has(key)) {
            return false
        }
        this.m_keys.add(key)
        return true
    }

    size(): number { return this.m_keys.size }
}

// check tuplet events for uniqueness

function checkAreTupletsUnique(tupletEvents: TupletMap): boolean {
    const referencedTuplets = new OnTimeVoiceSet() // <onTime, voice>
    for (const tuplet of tupletEvents) {
        const t = tuplet.second
        if (!referencedTuplets.insert(t.onTime, t.voice)) {
            // Not unique tuplets in tupletEvents
            return false
        }
    }
    return true
}

// check is referenced tuplet count equal to tuplet event count

function checkForEqualTupletCount(chords: ChordMap, tupletEvents: TupletMap): boolean {
    const referencedTuplets = new OnTimeVoiceSet() // <onTime, voice>
    for (const chord of chords) {
        if (chord.second.isInTuplet) {
            const tuplet = chord.second.tuplet.second
            referencedTuplets.insert(tuplet.onTime, tuplet.voice)
        }
        for (const note of chord.second.notes) {
            if (note.isInTuplet) {
                const tuplet = note.tuplet.second
                referencedTuplets.insert(tuplet.onTime, tuplet.voice)
            }
        }
    }

    return tupletEvents.size() === referencedTuplets.size()
}

export function areAllTupletsReferenced(chords: ChordMap, tupletEvents: TupletMap): boolean {
    if (!checkAreTupletsUnique(tupletEvents)) {
        return false
    }
    if (!checkTupletsForExistence(chords, tupletEvents)) {
        return false
    }
    if (!checkForDanglingTuplets(chords, tupletEvents)) {
        return false
    }
    if (!checkForEqualTupletCount(chords, tupletEvents)) {
        return false
    }
    return true
}

// this check is not full but often if use invalid iterator for comparison
// it causes crash or something

export function areTupletReferencesValid(chords: ChordMap): boolean {
    for (const chord of chords) {
        const c = chord.second
        if (c.isInTuplet) {
            const tuplet = c.tuplet.second
            if (tuplet.onTime.lt(new ReducedFraction(0, 1))
                || tuplet.len.lt(new ReducedFraction(0, 1))) {
                return false
            }
        }
        for (const note of c.notes) {
            if (note.isInTuplet) {
                const tuplet = note.tuplet.second
                if (tuplet.onTime.lt(new ReducedFraction(0, 1))
                    || tuplet.len.lt(new ReducedFraction(0, 1))) {
                    return false
                }
            }
        }
    }
    return true
}

/** QT_DEBUG check */
export function areTupletNonTupletChordsDistinct(tuplets: readonly TupletInfo[], nonTuplets: readonly ChordIt[]): boolean {
    const chords = new Set<ChordIt>()
    for (const tuplet of tuplets) {
        for (const chord of tuplet.chords) {
            chords.add(chord.second)
        }
    }
    for (const nonTuplet of nonTuplets) {
        if (chords.has(nonTuplet)) {
            return false
        }
    }
    return true
}

export function isTupletRangeOk(chord: ChordPair, tuplets: TupletMap): boolean {
    const c = chord.second
    const foundTuplets = findTupletsForTimeRange(c.voice, chord.first, new ReducedFraction(0, 1), tuplets, false)
    if (c.isInTuplet && foundTuplets.length === 0) {
        // Tuplet chord is actually outside tuplets
        return false
    }
    if (!c.isInTuplet && foundTuplets.length !== 0) {
        // chord can touch the tuplet at the end and doesn't belong to it
        for (const t of foundTuplets) {
            if (chord.first.ne(t.second.onTime.plus(t.second.len))) {
                // Non-tuplet chord is actually inside tuplet
                return false
            }
        }
    }
    for (const note of c.notes) {
        const foundTuplets1 = findTupletsForTimeRange(c.voice, note.offTime, new ReducedFraction(0, 1), tuplets, false)
        if (note.isInTuplet && foundTuplets1.length === 0) {
            // Tuplet note off time is actually outside tuplets
            return false
        }
        if (!note.isInTuplet && foundTuplets1.length !== 0) {
            // note off time can touch the tuplet
            // at the beg/end and doesn't belong to it
            for (const t of foundTuplets1) {
                if (note.offTime.ne(t.second.onTime)
                    && note.offTime.ne(t.second.onTime.plus(t.second.len))) {
                    // Non-tuplet note off time is actually inside tuplet
                    return false
                }
            }
        }
    }
    return true
}

// should be called after quantization

export function areTupletRangesOk(chords: ChordMap, tuplets: TupletMap): boolean {
    for (const chord of chords) {
        if (!isTupletRangeOk(chord, tuplets)) {
            return false
        }
    }
    return true
}

export function areAllTupletsDifferent(tuplets: TupletMap): boolean {
    const tupletsSet = new OnTimeVoiceSet() // <on time, voice>
    for (const tuplet of tuplets) {
        const isAlreadyInSet = !tupletsSet.insert(tuplet.first, tuplet.second.voice)
        if (isAlreadyInSet) {
            return false
        }
    }
    return true
}

function addTupletEvents(tupletEvents: TupletMap, tuplets: readonly TupletInfo[], backTiedTuplets: readonly TiedTuplet[]): void {
    for (let i = 0; i !== tuplets.length; ++i) {
        const tupletInfo = tuplets[i]
        const tupletData = new TupletData(
            tupletInfo.chords.begin().second.second.voice,
            tupletInfo.onTime,
            tupletInfo.len,
            tupletInfo.tupletNumber,
            [])

        const it = tupletEvents.insert(tupletData.onTime, tupletData)
        for (const chord of tupletInfo.chords) {
            const midiChord = chord.second.second
            midiChord.tuplet = it
            midiChord.isInTuplet = true
        }

        for (const tiedTuplet of backTiedTuplets) {
            if (tiedTuplet.tupletId === tupletInfo.id) {
                const midiChord = tiedTuplet.chord.second
                for (const j of tiedTuplet.tiedNoteIndexes) {
                    midiChord.notes[j].tuplet = it
                    midiChord.notes[j].isInTuplet = true
                }
                break
            }
        }

        for (const chord of tupletInfo.chords) {
            const midiChord = chord.second.second
            for (const note of midiChord.notes) {
                if (note.offTime.le(tupletInfo.onTime.plus(tupletInfo.len))) {
                    note.tuplet = it
                    note.isInTuplet = true
                }
            }
        }
    }
}

function markStaccatoTupletNotes(tuplets: TupletInfo[]): void {
    for (const tuplet of tuplets) {
        for (const staccato of tuplet.staccatoChords) {
            const it = tuplet.chords.find(staccato.first)
            if (it !== tuplet.chords.end()) {
                const midiChord = it.second.second
                midiChord.notes[staccato.second].staccato = true
            }
        }
        tuplet.staccatoChords.clear()
    }
}

// if notes with staccato were in tuplets previously - remove staccato

function cleanStaccatoOfNonTuplets(nonTuplets: readonly ChordIt[]): void {
    for (const nonTuplet of nonTuplets) {
        for (const note of nonTuplet.second.notes) {
            if (note.staccato) {
                note.staccato = false
            }
        }
    }
}

// chord on time shouldn't go before previous chord on time or after next chord on time
// this function finds such on time value between previous and next chords

export function findOnTimeBetweenChords(
    chord: ChordPair,
    chords: ChordMap,
    basicQuant: ReducedFraction,
    barStart: ReducedFraction): ReducedFraction {
    let onTime = new ReducedFraction(-1, 1)
    let quant = basicQuant

    const [rangeFirst, rangeSecond] = chords.equalRange(chord.first)
    let chordIt = chords.end()

    for (let it = rangeFirst; it !== rangeSecond; it = it.next()) {
        if (it.second.voice === chord.second.voice) {
            chordIt = it
            break
        }
    }

    if (chordIt === chords.end()) {
        throw new Error('MidiTuplet::findOnTimeBetweenChords: Chord iterator was not found')
    }

    if (chordIt.first.lt(barStart)) {
        return barStart
    }

    // chords with equal voices here can have equal on time values
    // so skip such chords
    const voice = chordIt.second.voice
    while (true) {
        onTime = findMinQuantizedOnTime(chordIt, quant)
        let changed = false

        if (chordIt !== chords.begin()) {
            let it = chordIt.prev()
            while (true) {
                if (it.first.lt(chord.first) && it.second.voice === voice) {
                    const prevChordOnTime = findMinQuantizedOnTime(it, quant)
                    if (onTime.lt(prevChordOnTime)) {
                        quant = quant.div(2)
                        changed = true
                    }
                    break
                }
                if (it === chords.begin() || it.first.lt(chord.first.minus(basicQuant.times(2)))) {
                    break
                }
                it = it.prev()
            }
        }

        if (!changed) {
            for (let it = chordIt.next();
                it !== chords.end() && it.first.lt(chord.first.plus(basicQuant.times(2))); it = it.next()) {
                if (it.first.eq(chord.first) || it.second.voice !== voice) {
                    continue
                }
                const nextChordOnTime = findMinQuantizedOnTime(it, quant)
                if (onTime.gt(nextChordOnTime)) {
                    quant = quant.div(2)
                    changed = true
                }
                break
            }
        }

        if (!changed) {
            break
        }
        // C++ asserts quant >= minAllowedDuration() * 2 before halving
        if (quant.lt(minAllowedDuration())) {
            break
        }
    }

    return onTime
}

function findPrevBarStart(barStart: ReducedFraction, barLen: ReducedFraction): ReducedFraction {
    let prevBarStart = barStart.minus(barLen)
    if (prevBarStart.lt(new ReducedFraction(0, 1))) {
        prevBarStart = new ReducedFraction(0, 1)
    }
    return prevBarStart
}

function setBarIndexesOfNextBarChords(tuplets: TupletInfo[], nonTuplets: ChordIt[], barIndex: number): void {
    for (const tuplet of tuplets) {
        for (const chord of tuplet.chords) {
            if (chord.second.second.barIndex > barIndex) {
                chord.second.second.barIndex = barIndex
            }
        }
    }
    for (const chord of nonTuplets) {
        if (chord.second.barIndex > barIndex) {
            chord.second.barIndex = barIndex
        }
    }
}

// indexes of each new bar should be -1 except possibly chords at the end of prev bar

function findTuplets(
    startBarChordIt: ChordIt,
    endBarChordIt: ChordIt,
    chords: ChordMap,
    basicQuant: ReducedFraction,
    tupletEvents: TupletMap,
    sigmap: TimeSigMap,
    barIndex: number): void {
    if (chords.empty() || startBarChordIt === endBarChordIt) {
        return
    }

    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()
    if (!opers.searchTuplets.value(currentTrack)) {
        return
    }

    const startBarTick = ReducedFraction.fromTicks(sigmap.bar2tick(startBarChordIt.second.barIndex, 0))
    const endBarTick = ReducedFraction.fromTicks(sigmap.bar2tick(startBarChordIt.second.barIndex + 1, 0))

    const barFraction = ReducedFraction.fromFraction(sigmap.timesig(startBarTick.ticks()).timesig())
    const tuplets = detectTuplets(startBarChordIt, endBarChordIt, startBarTick,
                                  barFraction, chords, basicQuant, barIndex)
    if (tuplets.length === 0) {
        return
    }

    filterTuplets(tuplets, basicQuant)
    // later notes will be sorted and their indexes become invalid
    // so assign staccato information to notes now
    if (opers.simplifyDurations.value(currentTrack)) {
        markStaccatoTupletNotes(tuplets)
    }

    const nonTuplets = findNonTupletChords(tuplets, startBarChordIt, endBarChordIt)
    addChordsBetweenTupletNotes(tuplets, nonTuplets, chords, startBarTick, basicQuant)
    sortNotesByPitch(startBarChordIt, endBarChordIt)
    sortTupletsByAveragePitch(tuplets)

    if (tupletVoiceLimit() > 1) {
        splitFirstTupletChords(tuplets, chords)
        minimizeOffTimeError(tuplets, chords, nonTuplets, startBarTick, basicQuant)
    }

    if (opers.simplifyDurations.value(currentTrack)) {
        cleanStaccatoOfNonTuplets(nonTuplets)
    }
    const prevBarStart = findPrevBarStart(startBarTick, endBarTick.minus(startBarTick))
    const backTiedTuplets = findBackTiedTuplets(chords, tuplets, prevBarStart, startBarTick,
                                                basicQuant, startBarChordIt.second.barIndex)
    // backTiedTuplets can be changed here (incompatible are removed)
    assignVoices(tuplets, nonTuplets, backTiedTuplets, chords, basicQuant, startBarTick, barIndex)
    addTupletEvents(tupletEvents, tuplets, backTiedTuplets)
    setBarIndexesOfNextBarChords(tuplets, nonTuplets, barIndex)
}

function setAllTupletOffTimes(tupletEvents: TupletMap, chords: ChordMap, sigmap: TimeSigMap): void {
    for (const chordEvent of chords) {
        const chord = chordEvent.second
        for (const note of chord.notes) {
            if (note.isInTuplet) {
                continue
            }
            const barEnd = ReducedFraction.fromTicks(sigmap.bar2tick(chord.barIndex + 1, 0))
            if (note.offTime.gt(barEnd)) {
                const it = findTupletContainingTime(chord.voice, note.offTime, tupletEvents, true)
                if (it !== tupletEvents.end()) {
                    note.isInTuplet = true
                    note.tuplet = it
                }
            }
        }
    }
}

export function findAllTuplets(
    tuplets: TupletMap,
    chords: ChordMap,
    sigmap: TimeSigMap,
    basicQuant: ReducedFraction): void {
    if (chords.empty()) {
        return
    }
    {
        let startBarIt = chords.begin()
        for (let endBarIt = startBarIt.next(); endBarIt !== chords.end(); endBarIt = endBarIt.next()) {
            const currentBarIndex = startBarIt.second.barIndex
            if (endBarIt.second.barIndex > currentBarIndex) {
                const oldTupletCount = tuplets.size()
                findTuplets(startBarIt, endBarIt, chords, basicQuant, tuplets, sigmap, currentBarIndex)

                if (tuplets.size() > oldTupletCount) { // new tuplets were found
                    // chords at the end of the current bar
                    // may have changed bar index - from next bar to the current bar
                    // because they were included in tuplets
                    const endBarTick = ReducedFraction.fromTicks(sigmap.bar2tick(currentBarIndex + 1, 0))
                    for (let it = endBarIt; it !== chords.end() && it.first.lt(endBarTick); it = it.next()) {
                        if (it.second.barIndex === currentBarIndex) {
                            endBarIt = endBarIt.next()
                        }
                    }
                }

                startBarIt = endBarIt
                if (endBarIt === chords.end()) {
                    break
                }
            }
        }
        // handle the last bar containing chords
        findTuplets(startBarIt, chords.end(), chords, basicQuant, tuplets, sigmap, startBarIt.second.barIndex)
    }
    // check if there are not detected off times inside tuplets
    setAllTupletOffTimes(tuplets, chords, sigmap)
}
