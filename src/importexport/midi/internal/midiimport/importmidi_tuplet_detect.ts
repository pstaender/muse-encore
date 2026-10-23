/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tuplet_detect.h/.cpp (namespace MidiTuplet)
 */

import { StdMultimap } from '../../../../framework/global/stdmap'
import { ReducedFraction } from './importmidi_fraction'
import type { ChordIt, ChordMap } from './importmidi_chord'
import { findFirstChordInRange } from './importmidi_chord'
import { TupletInfo } from './importmidi_inner'
import { beatLength, divisionsOfBarForTuplets, isCompound } from './importmidi_meter'
import {
    findOnTimeQuantError, findQuantForRange, findQuantizedTupletChordOnTime, findQuantizedTupletNoteOffTime,
} from './importmidi_quant'
import { midiImportOperations } from './importmidi_operations'
import { tupletLimits } from './importmidi_tuplet'

export function isTupletAllowed(tupletInfo: TupletInfo): boolean {
    {
        // special check for duplets and triplets
        const nums = [2, 3]
        // for duplet: if note first and single - only 1/2*tupletLen duration is allowed
        // for triplet: if note first and single - only 1/3*tupletLen duration is allowed
        for (const num of nums) {
            if (tupletInfo.tupletNumber === num
                && tupletInfo.chords.size() === 1
                && tupletInfo.firstChordIndex === 0) {
                const chordEventIt = tupletInfo.chords.begin().second
                const tupletNoteLen = tupletInfo.len.div(num)
                for (const note of chordEventIt.second.notes) {
                    if (note.offTime.minus(chordEventIt.first).minus(tupletNoteLen).absValue()
                        .gt(tupletNoteLen.div(2))) {
                        return false
                    }
                }
            }
        }
    }
    // for all tuplets
    const opers = midiImportOperations.data().trackOpers
    const minAllowedNoteCount = (opers.isHumanPerformance.value())
        ? tupletLimits(tupletInfo.tupletNumber).minNoteCountHuman
        : tupletLimits(tupletInfo.tupletNumber).minNoteCount
    if (tupletInfo.chords.size() < minAllowedNoteCount) {
        return false
    }
    // allow duplets and quadruplets with error == regular error
    // because tuplet notation is simpler in that case
    if (tupletInfo.tupletNumber === 2 || tupletInfo.tupletNumber === 4) {
        if (tupletInfo.tupletSumError.gt(tupletInfo.regularSumError)) {
            return false
        }
    } else {
        if (tupletInfo.tupletSumError.ge(tupletInfo.regularSumError)) {
            return false
        }
    }
    // at least one note has to have len >= (half tuplet note len)
    const tupletNoteLen = tupletInfo.len.div(tupletInfo.tupletNumber)
    for (const tupletChord of tupletInfo.chords) {
        for (const note of tupletChord.second.second.notes) {
            if (note.offTime.minus(tupletChord.first).ge(tupletNoteLen.div(2))) {
                return true
            }
        }
    }
    return false
}

export function findTupletNumbers(divLen: ReducedFraction, barFraction: ReducedFraction): number[] {
    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()
    const tupletNumbers: number[] = []

    if (isCompound(barFraction) && divLen.eq(beatLength(barFraction))) {
        if (opers.search2plets.value(currentTrack)) {
            tupletNumbers.push(2)
        }
        if (opers.search4plets.value(currentTrack)) {
            tupletNumbers.push(4)
        }
    } else {
        if (opers.search3plets.value(currentTrack)) {
            tupletNumbers.push(3)
        }
        if (opers.search5plets.value(currentTrack)) {
            tupletNumbers.push(5)
        }
        if (opers.search7plets.value(currentTrack)) {
            tupletNumbers.push(7)
        }
        if (opers.search9plets.value(currentTrack)) {
            tupletNumbers.push(9)
        }
    }

    return tupletNumbers
}

// find sum length of gaps between successive chords
// less is better

export function findSumLengthOfRests(tupletInfo: TupletInfo, startBarTick: ReducedFraction): ReducedFraction {
    let beg = tupletInfo.onTime
    const tupletEndTime = tupletInfo.onTime.plus(tupletInfo.len)
    const tupletNoteLen = tupletInfo.len.div(tupletInfo.tupletNumber)
    let sumLen = new ReducedFraction(0, 1)

    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()

    for (const chord of tupletInfo.chords) {
        const staccatoIt = (opers.simplifyDurations.value(currentTrack))
            ? tupletInfo.staccatoChords.find(chord.first)
            : tupletInfo.staccatoChords.end()

        const midiChord = chord.second.second
        const chordOnTime = (chord.second.first.lt(startBarTick))
            ? startBarTick
            : findQuantizedTupletChordOnTime(chord.second, tupletInfo.len,
                                             tupletLimits(tupletInfo.tupletNumber).ratio, startBarTick)
        if (beg.lt(chordOnTime)) {
            sumLen = sumLen.plus(chordOnTime.minus(beg))
        }
        let maxOffTime = new ReducedFraction(0, 1)
        for (let i = 0; i !== midiChord.notes.length; ++i) {
            let noteOffTime = midiChord.notes[i].offTime
            if (staccatoIt !== tupletInfo.staccatoChords.end() && i === staccatoIt.second) {
                noteOffTime = chordOnTime.plus(tupletNoteLen)
            }
            if (noteOffTime.gt(maxOffTime)) {
                maxOffTime = noteOffTime
            }
        }
        beg = findQuantizedTupletNoteOffTime(chord.first, maxOffTime, tupletInfo.len,
                                             tupletLimits(tupletInfo.tupletNumber).ratio, startBarTick)[0]
        if (beg.ge(tupletEndTime)) {
            break
        }
    }
    if (beg.lt(tupletEndTime)) {
        sumLen = sumLen.plus(tupletEndTime.minus(beg))
    }
    return sumLen
}

interface Error {
    tupletError: ReducedFraction
    tupletRegularDiff: ReducedFraction
}

function compareErrors(a: Error, e: Error): number {
    // C++ Error::operator<
    const less = (x: Error, y: Error): boolean => {
        if (x.tupletError.lt(y.tupletError)) {
            return true
        }
        if (x.tupletError.gt(y.tupletError)) {
            return false
        }
        return x.tupletRegularDiff.lt(y.tupletRegularDiff)
    }
    return less(a, e) ? -1 : less(e, a) ? 1 : 0
}

interface Candidate {
    posIndex: number
    chord: ChordIt
    regularError: ReducedFraction
}

export function findTupletApproximation(
    tupletLen: ReducedFraction,
    tupletNumber: number,
    basicQuant: ReducedFraction,
    startTupletTime: ReducedFraction,
    startChordIt: ChordIt,
    endChordIt: ChordIt): TupletInfo {
    const tupletInfo = new TupletInfo()
    tupletInfo.tupletNumber = tupletNumber
    tupletInfo.onTime = startTupletTime
    tupletInfo.len = tupletLen
    const tupletNoteLen = tupletLen.div(tupletNumber)

    const chordCandidates = new StdMultimap<Error, Candidate>(compareErrors)

    for (let posIndex = 0; posIndex !== tupletNumber; ++posIndex) {
        const tupletNotePos = startTupletTime.plus(tupletNoteLen.times(posIndex))
        for (let it = startChordIt; it !== endChordIt; it = it.next()) {
            if (it.first.lt(tupletNotePos.minus(tupletNoteLen.div(2)))) {
                continue
            }
            if (it.first.gt(tupletNotePos.plus(tupletNoteLen.div(2)))) {
                break
            }

            const tupletError = it.first.minus(tupletNotePos).absValue()
            const regularError = findOnTimeQuantError(it, basicQuant)
            const diff = tupletError.minus(regularError)
            chordCandidates.insert({ tupletError, tupletRegularDiff: diff }, { posIndex, chord: it, regularError })
        }
    }

    const usedChords = new Set<ChordIt>()
    const usedPosIndexes = new Set<number>()
    let diffSum = new ReducedFraction()
    let firstChordIndex = 0

    for (const candidate of chordCandidates) {
        if (diffSum.plus(candidate.first.tupletRegularDiff).gt(new ReducedFraction(0, 1))) {
            break
        }
        const c = candidate.second
        if (usedPosIndexes.has(c.posIndex)) {
            continue
        }
        if (usedChords.has(c.chord)) {
            continue
        }

        usedChords.add(c.chord)
        usedPosIndexes.add(c.posIndex)
        diffSum = diffSum.plus(candidate.first.tupletRegularDiff)
        tupletInfo.chords.insert(c.chord.first, c.chord)
        tupletInfo.tupletSumError = tupletInfo.tupletSumError.plus(candidate.first.tupletError)
        tupletInfo.regularSumError = tupletInfo.regularSumError.plus(c.regularError)
        // if chord was inserted to the beginning - remember its pos index
        if (c.chord.first.eq(tupletInfo.chords.begin().first)) {
            firstChordIndex = c.posIndex
        }
    }

    tupletInfo.firstChordIndex = firstChordIndex

    return tupletInfo
}

// detect staccato notes; later sum length of rests of this notes
// will be reduced by enlarging the length of notes to the tuplet note length

function detectStaccato(tuplet: TupletInfo): void {
    if (tuplet.chords.size() >= tupletLimits(tuplet.tupletNumber).minNoteCountStaccato) {
        const tupletNoteLen = tuplet.len.div(tuplet.tupletNumber)
        for (const chord of tuplet.chords) {
            const midiChord = chord.second.second
            for (let i = 0; i !== midiChord.notes.length; ++i) {
                if (midiChord.notes[i].offTime.minus(chord.first).lt(tupletNoteLen.div(2))) {
                    // later if chord have one or more notes
                    // with staccato -> entire chord is staccato

                    // don't mark note as staccato here, only remember it
                    // because different tuplets may contain this note,
                    // it will be resolved after tuplet filtering
                    tuplet.staccatoChords.insert(chord.first, i)
                }
            }
        }
    }
}

// this function is needed because if there are additional chords
// that can be in the middle between tuplet chords,
// and tuplet chords are staccato, i.e. have short length,
// then tied staccato chords would be not pretty-looked converted to notation

function haveChordsInTheMiddleBetweenTupletChords(
    startDivChordIt: ChordIt,
    endDivChordIt: ChordIt,
    tuplet: TupletInfo): boolean {
    const tupletChords = new Set<ChordIt>()
    for (const chord of tuplet.chords) {
        tupletChords.add(chord.second)
    }

    const tupletNoteLen = tuplet.len.div(tuplet.tupletNumber)
    for (let it = startDivChordIt; it !== endDivChordIt; it = it.next()) {
        if (tupletChords.has(it)) {
            continue
        }
        for (let i = 0; i !== tuplet.tupletNumber; ++i) {
            const pos = tuplet.onTime.plus(tupletNoteLen.times(i)).plus(tupletNoteLen.div(2))
            if (pos.minus(it.first).absValue().lt(tupletNoteLen.div(2))) {
                return true
            }
        }
    }
    return false
}

function isTupletLenAllowed(
    tupletLen: ReducedFraction,
    tupletNumber: number,
    beg: ChordIt,
    end: ChordIt,
    basicQuant: ReducedFraction): boolean {
    const tupletNoteLen = tupletLen.div(tupletNumber)
    const regularQuant = findQuantForRange(beg, end, basicQuant)
    return tupletNoteLen.ge(regularQuant)
}

// only one chord from the next bar can be used to search tuplets
// and this chord should be the last in the current bar

function isNextBarOwnershipOk(startIt: ChordIt, endIt: ChordIt, chords: ChordMap, barIndex: number): boolean {
    if (endIt === chords.begin() || endIt === startIt) {
        return false
    }
    if (endIt.prev().second.barIndex === barIndex) {
        return true
    }

    let nextBarCounter = 0
    for (let it = endIt.prev(); ; it = it.prev()) {
        if (it.second.barIndex > barIndex) {
            ++nextBarCounter
        }
        if (it === startIt) {
            break
        }
    }
    return nextBarCounter === 1
}

export function detectTuplets(
    startBarChordIt: ChordIt,
    endBarChordIt: ChordIt,
    startBarTick: ReducedFraction,
    barFraction: ReducedFraction,
    chords: ChordMap,
    basicQuant: ReducedFraction,
    barIndex: number): TupletInfo[] {
    const divLengths = divisionsOfBarForTuplets(barFraction)

    const tuplets: TupletInfo[] = []
    let id = 0
    const tol = basicQuant.div(2)

    for (const divLen of divLengths) {
        const tupletNumbers = findTupletNumbers(divLen, barFraction)
        const div = barFraction.div(divLen)
        const divCount = Math.trunc(div.numerator() / div.denominator())

        for (let i = 0; i !== divCount; ++i) {
            const startDivTime = startBarTick.plus(divLen.times(i))
            const endDivTime = startBarTick.plus(divLen.times(i + 1))
            // check which chords can be inside tuplet period
            // [startDivTime - tol, endDivTime]
            const startDivTimeWithTol = ReducedFraction.max(startBarTick, startDivTime.minus(tol))
            const startDivChordIt = findFirstChordInRange(startDivTimeWithTol, endDivTime,
                                                          startBarChordIt, endBarChordIt)
            if (startDivChordIt === endBarChordIt) {
                continue
            }

            // end iterator, as usual, point to the next - invalid chord
            const endDivChordIt = chords.lowerBound(endDivTime)
            if (!isNextBarOwnershipOk(startDivChordIt, endDivChordIt, chords, barIndex)) {
                continue
            }
            // try different tuplets, nested tuplets are not allowed
            // here chords from next bar can be captured
            // if their on time < next bar start
            for (const tupletNumber of tupletNumbers) {
                if (!isTupletLenAllowed(divLen, tupletNumber, startDivChordIt, endDivChordIt, basicQuant)) {
                    continue
                }
                const tupletInfo = findTupletApproximation(divLen, tupletNumber,
                                                           basicQuant, startDivTime, startDivChordIt, endDivChordIt)

                const opers = midiImportOperations.data().trackOpers
                const currentTrack = midiImportOperations.currentTrack()

                if (opers.simplifyDurations.value(currentTrack)) {
                    if (!haveChordsInTheMiddleBetweenTupletChords(startDivChordIt, endDivChordIt, tupletInfo)) {
                        detectStaccato(tupletInfo)
                    }
                }
                tupletInfo.sumLengthOfRests = findSumLengthOfRests(tupletInfo, startBarTick)

                if (!isTupletAllowed(tupletInfo)) {
                    continue
                }
                tupletInfo.id = id++
                tuplets.push(tupletInfo) // tuplet found
            } // next tuplet type
        }
    }

    return tuplets
}
