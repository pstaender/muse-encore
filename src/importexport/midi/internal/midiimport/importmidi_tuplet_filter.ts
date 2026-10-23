/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tuplet_filter.h/.cpp (namespace MidiTuplet)
 *
 * Chord addresses (std::pair<const ReducedFraction, MidiChord>*) are the chord iterators (ChordIt nodes).
 * std::sort is unstable in C++, the JS sort is stable (the order of equal tuplets may differ).
 */

import { StdMap, StdSet } from '../../../../framework/global/stdmap'
import type { ChordIt } from './importmidi_chord'
import type { ReducedFraction } from './importmidi_fraction'
import { ReducedFraction as RF } from './importmidi_fraction'
import { type FractionPair, TupletInfo, haveIntersection } from './importmidi_inner'
import { findOnTimeQuantError } from './importmidi_quant'
import { findTupletIntervals, tupletInterval, tupletLimits } from './importmidi_tuplet'
import { tupletVoiceLimit } from './importmidi_tuplet_voice'

export function isMoreTupletVoicesAllowed(voicesInUse: number, availableVoices: number): boolean {
    return !(voicesInUse >= availableVoices || voicesInUse >= tupletVoiceLimit())
}

class TupletErrorResult {
    constructor(private readonly tupletAverageError = 0.0,
                private readonly relativeUsedChordPlaces = 0.0,
                private readonly sumLengthOfRests: ReducedFraction = new RF(0, 1),
                private readonly voiceCount = 0,
                private readonly tupletCount = 0) {}

    isInitialized(): boolean { return this.tupletCount !== 0 }

    /** operator< */
    lt(er: TupletErrorResult): boolean {
        let value = TupletErrorResult.div(this.tupletAverageError, er.tupletAverageError)
            - TupletErrorResult.div(this.relativeUsedChordPlaces, er.relativeUsedChordPlaces)
            + TupletErrorResult.div(this.sumLengthOfRests.numerator() * 1.0 / this.sumLengthOfRests.denominator(),
                                    er.sumLengthOfRests.numerator() * 1.0 / er.sumLengthOfRests.denominator())
        if (value === 0) {
            value = TupletErrorResult.div(this.voiceCount, er.voiceCount)
                + TupletErrorResult.div(this.tupletCount, er.tupletCount)
        }
        return value < 0
    }

    private static div(val1: number, val2: number): number {
        if (val1 === val2) {
            return 0
        }
        return (val1 - val2) / Math.max(val1, val2)
    }
}

function haveCommonChords(i: number, j: number, tuplets: readonly TupletInfo[]): boolean {
    if (tuplets.length === 0) {
        return false
    }
    const usedChords = new Set<ChordIt>()
    for (const chord of tuplets[i].chords) {
        usedChords.add(chord.second)
    }
    for (const chord of tuplets[j].chords) {
        if (usedChords.has(chord.second)) {
            return true
        }
    }
    return false
}

// remove overlapping tuplets with the same tuplet number
// when tuplet with bigger length contains the same notes

function removeUselessTuplets(tuplets: TupletInfo[]): void {
    tuplets.sort((t1, t2) => {
        if (t1.tupletNumber !== t2.tupletNumber) {
            return t1.tupletNumber - t2.tupletNumber
        }
        return t1.len.compare(t2.len)
    })

    let beg = 0
    while (beg < tuplets.length) {
        let end = beg + 1
        while (tuplets.length > end && tuplets[end].tupletNumber === tuplets[beg].tupletNumber) {
            ++end
        }
        for (let i = beg; i < end - 1; ++i) {
            const t1 = tuplets[i]
            for (let j = i + 1; j < end; ++j) {
                const t2 = tuplets[j]
                if (t1.onTime.ge(t2.onTime) && t1.onTime.plus(t1.len).le(t2.onTime.plus(t2.len))) {
                    // check onTimes
                    if (t2.chords.last().first.lt(t1.onTime.plus(t1.len))
                        && t2.chords.begin().first.ge(t1.onTime)) {
                        // remove larger tuplet
                        tuplets.splice(j, 1)
                        --j
                        --end
                    }
                }
            }
        }
        beg = end
    }
}

export function findLongestUncommonGroup(tuplets: readonly TupletInfo[], basicQuant: ReducedFraction): StdSet<number> {
    interface TInfo {
        onTime: ReducedFraction
        offTime: ReducedFraction
        index: number
    }

    const info: TInfo[] = []
    for (let i = 0; i !== tuplets.length; ++i) {
        const tuplet = tuplets[i]
        const interval = tupletInterval(tuplet, basicQuant)
        info.push({ onTime: interval[0], offTime: interval[1], index: i })
    }

    info.sort((a, b) => {
        if (a.offTime.lt(b.offTime)) {
            return -1
        } else if (a.offTime.gt(b.offTime)) {
            return 1
        }
        // onTime > other.onTime first
        return b.onTime.compare(a.onTime)
    })
    // std::unique: equal offTime
    for (let i = 1; i < info.length;) {
        if (info[i].offTime.eq(info[i - 1].offTime)) {
            info.splice(i, 1)
        } else {
            ++i
        }
    }

    // check for overlapping tuplets
    // and check for rare case: because of tol when detecting tuplets
    // non-overlapping tuplets can have common chords

    const indexes = new StdSet<number>()
    let lastSelected = 0
    for (let i = 0; i !== info.length; ++i) {
        if (i > 0 && info[i].onTime.lt(info[lastSelected].offTime)) {
            continue
        }
        if (haveCommonChords(info[lastSelected].index, info[i].index, tuplets)) {
            continue
        }
        lastSelected = i
        indexes.insert(info[i].index)
    }

    return indexes
}

interface TupletCommon {
    // indexes of tuplets that have common chords with the tuplet with tupletIndex
    commonIndexes: StdSet<number>
}

function areInCommons(t1: TupletInfo, t2: TupletInfo): boolean {
    for (let it1 = t1.chords.begin(); it1 !== t1.chords.end(); it1 = it1.next()) {
        for (let it2 = t2.chords.begin(); it2 !== t2.chords.end(); it2 = it2.next()) {
            if (it1.second !== it2.second) {
                continue
            }
            if (t1.firstChordIndex !== 0 || t2.firstChordIndex !== 0
                || it1 !== t1.chords.begin() || it2 !== t2.chords.begin()
                || !isMoreTupletVoicesAllowed(1, it1.second.second.notes.length)) {
                return true
            }
        }
    }
    return false
}

function findTupletCommons(tuplets: readonly TupletInfo[]): TupletCommon[] {
    const tupletCommons: TupletCommon[] = []
    for (let i = 0; i < tuplets.length; ++i) {
        tupletCommons.push({ commonIndexes: new StdSet<number>() })
    }

    for (let i = 0; i < tuplets.length - 1; ++i) {
        for (let j = i + 1; j !== tuplets.length; ++j) {
            if (areInCommons(tuplets[i], tuplets[j])) {
                tupletCommons[i].commonIndexes.insert(j)
            }
        }
    }
    return tupletCommons
}

function isInCommonIndexes(indexToCheck: number, selectedTuplets: readonly number[],
                           tupletCommons: readonly TupletCommon[]): boolean {
    for (let i = 0; i !== selectedTuplets.length; ++i) {
        const tupletIndex = selectedTuplets[i]

        if (indexToCheck > tupletIndex) {
            const indexes = tupletCommons[tupletIndex].commonIndexes
            if (indexes.contains(indexToCheck)) {
                return true
            }
        } else {
            const indexes = tupletCommons[indexToCheck].commonIndexes
            if (indexes.contains(tupletIndex)) {
                return true
            }
        }
    }
    return false
}

function findTupletError(tupletIndexes: readonly number[], tuplets: readonly TupletInfo[], voiceCount: number,
                         basicQuant: ReducedFraction): TupletErrorResult {
    let sumError = new RF(0, 1)
    let sumLengthOfRests = new RF(0, 1)
    let sumChordCount = 0
    let sumChordPlaces = 0
    const usedChords = new Set<ChordIt>()
    const usedIndexes: boolean[] = new Array<boolean>(tuplets.length).fill(false)

    for (const i of tupletIndexes) {
        const tuplet = tuplets[i]

        sumError = sumError.plus(tuplet.tupletSumError)
        sumLengthOfRests = sumLengthOfRests.plus(tuplet.sumLengthOfRests)
        sumChordCount += tuplet.chords.size()
        sumChordPlaces += tuplet.tupletNumber

        usedIndexes[i] = true
        for (const chord of tuplet.chords) {
            usedChords.add(chord.second)
        }
    }
    // add quant error of all chords excluded from tuplets
    for (let i = 0; i !== tuplets.length; ++i) {
        if (usedIndexes[i]) {
            continue
        }
        const tuplet = tuplets[i]
        for (const chord of tuplet.chords) {
            if (usedChords.has(chord.second)) {
                continue
            }
            sumError = sumError.plus(findOnTimeQuantError(chord.second, basicQuant))
        }
    }

    return new TupletErrorResult(
        sumError.numerator() * 1.0 / (sumError.denominator() * sumChordCount),
        sumChordCount * 1.0 / sumChordPlaces,
        sumLengthOfRests,
        voiceCount,
        tupletIndexes.length)
}

/** std::map<int, std::vector<std::pair<ReducedFraction, ReducedFraction>>> */
type VoiceIntervals = StdMap<number, FractionPair[]>

function findAvailableVoice(tupletIndex: number, tupletIntervals: readonly FractionPair[],
                            voiceIntervals: VoiceIntervals): number {
    let voice = 0
    for (;;) {
        const it = voiceIntervals.find(voice)
        if (it !== voiceIntervals.end() && haveIntersection(tupletIntervals[tupletIndex], it.second)) {
            ++voice
            continue
        }
        break
    }

    return voice
}

function prepareUsedFirstChords(selectedTuplets: readonly number[], tuplets: readonly TupletInfo[]): Map<ChordIt, number> {
    const usedFirstChords = new Map<ChordIt, number>()
    for (const i of selectedTuplets) {
        if (tuplets[i].firstChordIndex !== 0) {
            continue
        }
        const firstChord = tuplets[i].chords.begin()
        const v = usedFirstChords.get(firstChord.second)
        if (v !== undefined) {
            usedFirstChords.set(firstChord.second, v + 1)
        } else {
            usedFirstChords.set(firstChord.second, 1)
        }
    }

    return usedFirstChords
}

function findUnusedIndexes(selectedTuplets: readonly number[]): number[] {
    const unusedIndexes: number[] = []
    let k = 0
    for (let i = 0; i !== selectedTuplets[selectedTuplets.length - 1]; ++i) {
        if (i === selectedTuplets[k]) {
            ++k
            continue
        }
        unusedIndexes.push(i)
    }
    return unusedIndexes
}

function canUseIndex(indexToCheck: number, tuplets: readonly TupletInfo[], tupletIntervals: readonly FractionPair[],
                     voiceIntervals: VoiceIntervals, usedFirstChords: Map<ChordIt, number>): boolean {
    const tuplet = tuplets[indexToCheck]
    // check tuplets for common 1st chord
    if (tuplet.firstChordIndex === 0) {
        const firstChord = tuplet.chords.begin()
        const count = usedFirstChords.get(firstChord.second)
        if (count !== undefined && !isMoreTupletVoicesAllowed(count, firstChord.second.second.notes.length)) {
            return false
        }
    }
    // check tuplets for resulting voice count
    const voice = findAvailableVoice(indexToCheck, tupletIntervals, voiceIntervals)
    const voiceCount = Math.max(voiceIntervals.size(), voice + 1) // index + 1 = count
    if (voiceCount > 1 && tuplet.chords.size() < tupletLimits(tuplet.tupletNumber).minNoteCountAddVoice) {
        return false
    }
    return true
}

/** bestTupletIndexes and minCurrentError are C++ references: the holder object is updated */
interface BestTuplets {
    bestTupletIndexes: number[]
    minCurrentError: TupletErrorResult
}

function tryUpdateBestIndexes(best: BestTuplets, selectedTuplets: readonly number[], tuplets: readonly TupletInfo[],
                              voiceIntervals: VoiceIntervals, basicQuant: ReducedFraction): void {
    const voiceCount = voiceIntervals.size()
    const error = findTupletError(selectedTuplets, tuplets, voiceCount, basicQuant)
    if (!best.minCurrentError.isInitialized() || error.lt(best.minCurrentError)) {
        best.minCurrentError = error
        best.bestTupletIndexes = selectedTuplets.slice()
    }
}

function prepareVoiceIntervals(selectedTuplets: readonly number[], tupletIntervals: readonly FractionPair[]): VoiceIntervals {
    // <voice, intervals>
    const voiceIntervals: VoiceIntervals = new StdMap<number, FractionPair[]>()
    for (const i of selectedTuplets) {
        const voice = findAvailableVoice(i, tupletIntervals, voiceIntervals)
        voiceIntervals.getOrInsert(voice, () => []).push(tupletIntervals[i])
    }
    return voiceIntervals
}

class ValidTuplets {
    private indexes_: [number, number][] = [] // pair<prev, next>
    private first_ = 0

    constructor(tupletsSize: number) {
        for (let i = 0; i !== tupletsSize; ++i) {
            this.indexes_.push([i - 1, i + 1])
        }
    }

    first(): number {
        return this.first_
    }

    isValid(index: number): boolean {
        return index >= this.first_ && index < this.indexes_.length
    }

    next(index: number): number {
        return this.indexes_[index][1]
    }

    empty(): boolean {
        return this.first_ >= this.indexes_.length
    }

    exclude(index: number): number {
        if (index < this.first_) {
            return index
        }
        const prev = this.indexes_[index][0]
        const next = this.indexes_[index][1]
        this.indexes_[index] = [-1, this.indexes_.length]
        if (prev >= this.first_) {
            this.indexes_[prev] = [this.indexes_[prev][0], next]
        }
        if (next < this.indexes_.length) {
            this.indexes_[next] = [prev, this.indexes_[next][1]]
        }
        if (index === this.first_) {
            this.first_ = next
        }
        return next
    }

    save(): [number, number][] {
        const indexes: [number, number][] = []
        for (let i = this.first_; i < this.indexes_.length; ++i) {
            indexes.push([this.indexes_[i][0], this.indexes_[i][1]])
        }
        return indexes
    }

    restore(indexes: readonly [number, number][]): void {
        this.first_ = this.indexes_.length - indexes.length
        for (let i = 0; i < indexes.length; ++i) {
            this.indexes_[i + this.first_] = [indexes[i][0], indexes[i][1]]
        }
    }
}

function findNextTuplet(selectedTuplets: number[], validTuplets: ValidTuplets, best: BestTuplets,
                        tupletCommons: readonly TupletCommon[], tuplets: readonly TupletInfo[],
                        tupletIntervals: readonly FractionPair[], commonsSize: number,
                        basicQuant: ReducedFraction): void {
    while (!validTuplets.empty()) {
        const index = validTuplets.first()

        const isCommonGroupBegins = (selectedTuplets.length === 0 && index === commonsSize)
        if (isCommonGroupBegins) { // first level
            for (let i = index; i < tuplets.length; ++i) {
                selectedTuplets.push(i)
            }
        } else {
            selectedTuplets.push(index)
        }

        const voiceIntervals = prepareVoiceIntervals(selectedTuplets, tupletIntervals)
        const usedFirstChords = prepareUsedFirstChords(selectedTuplets, tuplets)

        if (isCommonGroupBegins) {
            let canAddMoreIndexes = false
            for (let i = 0; i !== commonsSize; ++i) {
                if (!isInCommonIndexes(i, selectedTuplets, tupletCommons)
                    && canUseIndex(i, tuplets, tupletIntervals, voiceIntervals, usedFirstChords)) {
                    canAddMoreIndexes = true
                    break
                }
            }
            if (!canAddMoreIndexes) {
                tryUpdateBestIndexes(best, selectedTuplets, tuplets, voiceIntervals, basicQuant)
            }
            return
        }

        validTuplets.exclude(index)
        const savedTuplets = validTuplets.save()
        // check tuplets for compatibility
        if (!validTuplets.empty()) {
            for (const i of tupletCommons[index].commonIndexes) {
                validTuplets.exclude(i)
                if (validTuplets.empty()) {
                    break
                }
            }
        }
        for (let i = validTuplets.first(); validTuplets.isValid(i);) {
            if (!canUseIndex(i, tuplets, tupletIntervals, voiceIntervals, usedFirstChords)) {
                i = validTuplets.exclude(i)
                continue
            }
            i = validTuplets.next(i)
        }
        if (validTuplets.empty()) {
            const unusedIndexes = findUnusedIndexes(selectedTuplets)
            let canAddMoreIndexes = false
            for (const i of unusedIndexes) {
                if (!isInCommonIndexes(i, selectedTuplets, tupletCommons)
                    && canUseIndex(i, tuplets, tupletIntervals, voiceIntervals, usedFirstChords)) {
                    canAddMoreIndexes = true
                    break
                }
            }
            if (!canAddMoreIndexes) {
                tryUpdateBestIndexes(best, selectedTuplets, tuplets, voiceIntervals, basicQuant)
            }
        } else {
            findNextTuplet(selectedTuplets, validTuplets, best, tupletCommons, tuplets, tupletIntervals,
                           commonsSize, basicQuant)
        }

        selectedTuplets.pop()
        validTuplets.restore(savedTuplets)
    }
}

function moveUncommonTupletsToEnd(tuplets: TupletInfo[], uncommons: StdSet<number>): void {
    let swapWith = tuplets.length - 1
    for (let i = swapWith; i >= 0; --i) {
        const it = uncommons.find(i)
        if (it !== uncommons.end()) {
            if (i !== swapWith) {
                const tmp = tuplets[i]
                tuplets[i] = tuplets[swapWith]
                tuplets[swapWith] = tmp
            }
            --swapWith
            uncommons.erase(it)
        }
    }
}

function findBestTuplets(tupletCommons: readonly TupletCommon[], tuplets: readonly TupletInfo[], commonsSize: number,
                         basicQuant: ReducedFraction): number[] {
    const best: BestTuplets = { bestTupletIndexes: [], minCurrentError: new TupletErrorResult() }
    const selectedTuplets: number[] = []
    const tupletIntervals = findTupletIntervals(tuplets, basicQuant)

    const validTuplets = new ValidTuplets(tuplets.length)

    findNextTuplet(selectedTuplets, validTuplets, best, tupletCommons, tuplets, tupletIntervals, commonsSize,
                   basicQuant)

    return best.bestTupletIndexes
}

function removeExtraTuplets(tuplets: TupletInfo[]): void {
    const MAX_TUPLETS = 17 // found empirically

    if (tuplets.length <= MAX_TUPLETS) {
        return
    }

    // std::map<TupletErrorResult, size_t>: equivalent errors are inserted once
    const errors = new StdMap<TupletErrorResult, number>((a, b) => (a.lt(b) ? -1 : b.lt(a) ? 1 : 0))
    for (let i = 0; i !== tuplets.length; ++i) {
        const tupletError = new TupletErrorResult(
            tuplets[i].tupletSumError.numerator() * 1.0
            / (tuplets[i].tupletSumError.denominator() * tuplets[i].chords.size()),
            tuplets[i].chords.size() * 1.0 / tuplets[i].tupletNumber,
            tuplets[i].sumLengthOfRests,
            1,
            1)
        errors.insert(tupletError, i)
    }
    const newTuplets: TupletInfo[] = []
    let count = 0
    for (const e of errors) {
        ++count
        newTuplets.push(tuplets[e.second])
        if (count === MAX_TUPLETS) {
            break
        }
    }

    tuplets.length = 0
    tuplets.push(...newTuplets)
}

// first chord in tuplet may belong to other tuplet at the same time
// in the case if there are enough notes in this first chord
// to be split into different voices

export function filterTuplets(tuplets: TupletInfo[], basicQuant: ReducedFraction): void {
    if (tuplets.length === 0) {
        return
    }
    removeUselessTuplets(tuplets)
    removeExtraTuplets(tuplets)

    const uncommons = findLongestUncommonGroup(tuplets, basicQuant)
    let commonsSize = tuplets.length
    if (uncommons.size() > 1) {
        commonsSize -= uncommons.size()
        moveUncommonTupletsToEnd(tuplets, uncommons)
    }
    const tupletCommons = findTupletCommons(tuplets)

    const bestIndexes = findBestTuplets(tupletCommons, tuplets, commonsSize, basicQuant)
    const newTuplets: TupletInfo[] = []
    for (const i of bestIndexes) {
        newTuplets.push(tuplets[i])
    }

    tuplets.length = 0
    tuplets.push(...newTuplets)
}
