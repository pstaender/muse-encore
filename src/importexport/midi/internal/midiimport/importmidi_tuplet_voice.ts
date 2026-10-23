/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tuplet_voice.h/.cpp (namespace MidiTuplet)
 *
 * Chord addresses (std::pair<const ReducedFraction, MidiChord>*) are the chord iterators (ChordIt nodes); the sets
 * of chord addresses are JS Sets (C++ orders them by address; they are only used for lookups or in an order
 * independent way). std::list<TiedTuplet> and std::list<ChordIt> are arrays (list iterators are indexes).
 */

import { StdMap, StdSet } from '../../../../framework/global/stdmap'
import {
    type ChordIt, type ChordMap, type ChordPair, type MidiChord, type MidiNote, chordAveragePitch, minNoteLen,
} from './importmidi_chord'
import type { ReducedFraction } from './importmidi_fraction'
import { type FractionPair, type TupletInfo, haveIntersection } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'
import {
    findMaxQuantizedOffTime, findMaxQuantizedTupletOffTime, findQuantizedNoteOffTime, findQuantizedTupletChordOnTime,
    findQuantizedTupletNoteOffTime, quantForLen,
} from './importmidi_quant'
import { findOnTimeBetweenChords, tupletFromId, tupletInterval, tupletLimits } from './importmidi_tuplet'
import { toIntVoiceCount, voiceLimit } from './importmidi_voice'

export interface TiedTuplet {
    tupletId: number
    voice: number
    chord: ChordIt // chord the tuplet is tied with
    tiedNoteIndexes: number[] // indexes of tied notes of that chord
}

/** std::map<int, std::vector<std::pair<ReducedFraction, ReducedFraction>>> (<voice, intervals>) */
type VoiceIntervals = StdMap<number, FractionPair[]>

/** C++ map[voice] (creates an empty vector) */
function at(m: VoiceIntervals, voice: number): FractionPair[] {
    return m.getOrInsert(voice, () => [])
}

function qRound(d: number): number {
    return d >= 0.0 ? Math.trunc(d + 0.5) : Math.trunc(d - 0.5)
}

export function tupletVoiceLimit(): number {
    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()
    const allowedVoices = toIntVoiceCount(opers.maxVoiceCount.value(currentTrack))

    // for multiple voices: one voice is reserved for non-tuplet chords
    return (allowedVoices === 1) ? 1 : allowedVoices - 1
}

export function chordInterval(chord: ChordPair, chords: ChordMap, basicQuant: ReducedFraction,
                              barStart: ReducedFraction): FractionPair {
    const onTime = findOnTimeBetweenChords(chord, chords, basicQuant, barStart)
    let offTime = findMaxQuantizedOffTime(chord, basicQuant)
    if (offTime.lt(onTime)) {
        offTime = onTime
    }
    if (offTime.eq(onTime)) {
        offTime = offTime.plus(quantForLen(minNoteLen(chord), basicQuant))
    }

    return [onTime, offTime]
}

function findTupletWithChord(midiChord: MidiChord, tuplets: readonly TupletInfo[]): number {
    for (let i = 0; i !== tuplets.length; ++i) {
        for (const chord of tuplets[i].chords) {
            if (chord.second.second === midiChord) {
                return i
            }
        }
    }
    return -1
}

export function backTiedInterval(tiedTuplet: TiedTuplet, tuplets: readonly TupletInfo[], chords: ChordMap,
                                 basicQuant: ReducedFraction, barStart: ReducedFraction): FractionPair {
    const tuplet = tupletFromId(tiedTuplet.tupletId, tuplets)
    const end = tupletInterval(tuplet, basicQuant)[1]
    const midiChord = tiedTuplet.chord.second

    const tupletIndex = findTupletWithChord(midiChord, tuplets)
    const beg = (tupletIndex !== -1)
        ? tupletInterval(tuplets[tupletIndex], basicQuant)[0]
        : chordInterval(tiedTuplet.chord, chords, basicQuant, barStart)[0]

    return [beg, end]
}

function setTupletVoice(tupletChords: StdMap<ReducedFraction, ChordIt>, voice: number): void {
    for (const tupletChord of tupletChords) {
        const midiChord = tupletChord.second.second
        midiChord.voice = voice
    }
}

function setTupletVoices(tuplets: TupletInfo[], pendingTuplets: StdSet<number>, tupletIntervals: VoiceIntervals,
                         basicQuant: ReducedFraction): void {
    const limit = tupletVoiceLimit()
    let voice = 0
    while (!pendingTuplets.empty() && voice < limit) {
        for (let it = pendingTuplets.begin(); it !== pendingTuplets.end();) {
            const tuplet = tupletFromId(it.first, tuplets)
            const interval = tupletInterval(tuplet, basicQuant)
            if (!haveIntersection(interval, at(tupletIntervals, voice))) {
                setTupletVoice(tuplet.chords, voice)
                at(tupletIntervals, voice).push(interval)
                it = pendingTuplets.erase(it)
                continue
            }
            it = it.next()
        }
        ++voice
    }
}

function findPitchDist(notes: readonly MidiNote[], tuplets: readonly TupletInfo[],
                       voice: number): number {
    let pitchDist = 2147483647 // bad value - only for the last choice
    if (tuplets.length === 0) {
        return pitchDist
    }

    let tupletPitch = 0
    for (const tuplet of tuplets) {
        if (tuplet.chords.begin().second.second.voice !== voice) {
            continue
        }
        let counter = 0
        for (const chord of tuplet.chords) {
            const c = chord.second.second
            tupletPitch += chordAveragePitch(c.notes)
            ++counter
        }
        tupletPitch = qRound(tupletPitch * 1.0 / counter)
        break
    }

    if (tupletPitch === 0) {
        return pitchDist
    }

    const chordPitch = chordAveragePitch(notes)
    pitchDist = Math.abs(chordPitch - tupletPitch)

    return pitchDist
}

function setNonTupletVoices(pendingNonTuplets: Set<ChordIt>, tupletIntervals: VoiceIntervals,
                            tuplets: readonly TupletInfo[], chords: ChordMap, basicQuant: ReducedFraction,
                            barStart: ReducedFraction): void {
    const limit = voiceLimit()
    while (pendingNonTuplets.size > 0) {
        const chord = pendingNonTuplets.values().next().value as ChordIt
        const interval = chordInterval(chord, chords, basicQuant, barStart)
        // pick the voice such that the average pitch difference
        // between the non-tuplet chord and tuplets with this voice
        // is the smallest
        let bestVoice = -1
        let minPitchDist = -1
        for (let voice = 0; voice < limit; ++voice) {
            const fit = tupletIntervals.find(voice)
            if (fit === tupletIntervals.end() || !haveIntersection(interval, fit.second)) {
                const pitchDist = findPitchDist(chord.second.notes, tuplets, voice)
                if (minPitchDist === -1 || pitchDist < minPitchDist) {
                    minPitchDist = pitchDist
                    bestVoice = voice
                }
            }
        }

        chord.second.voice = bestVoice
        pendingNonTuplets.delete(chord)
        // don't insert chord interval here
    }
}

// back tied tuplets are not checked here

export function haveOverlappingVoices(nonTuplets: readonly ChordIt[], tuplets: readonly TupletInfo[],
                                      backTiedTuplets: readonly TiedTuplet[], chords: ChordMap,
                                      basicQuant: ReducedFraction, barStart: ReducedFraction): boolean {
    // <voice, intervals>
    const intervals: VoiceIntervals = new StdMap<number, FractionPair[]>()

    for (const tuplet of tuplets) {
        const voice = tuplet.chords.begin().second.second.voice
        const interval: FractionPair = [tuplet.onTime, tuplet.onTime.plus(tuplet.len)]
        if (haveIntersection(interval, at(intervals, voice))) {
            return true
        } else {
            at(intervals, voice).push(interval)
        }
    }

    for (const chord of nonTuplets) {
        const voice = chord.second.voice
        const interval = chordInterval(chord, chords, basicQuant, barStart)
        if (haveIntersection(interval, at(intervals, voice))) {
            let flag = false
            // if chord is tied then it can intersect tuplet
            for (const tiedTuplet of backTiedTuplets) {
                if (tiedTuplet.chord === chord
                    && (tiedTuplet.voice === -1 || tiedTuplet.voice === voice)) {
                    flag = true
                    break
                }
            }
            if (!flag) {
                return true
            }
        }
    }

    return false
}

function eraseBackTiedTupletById(tupletId: number, backTiedTuplets: TiedTuplet[]): void {
    for (let i = 0; i < backTiedTuplets.length; ++i) {
        if (backTiedTuplets[i].tupletId === tupletId) {
            backTiedTuplets.splice(i, 1)
            break
        }
    }
}

// for the case when voice limit = 1

export function excludeExtraVoiceTuplets(tuplets: TupletInfo[], nonTuplets: ChordIt[], backTiedTuplets: TiedTuplet[],
                                         chords: ChordMap, basicQuant: ReducedFraction, barStart: ReducedFraction,
                                         barIndex: number): boolean {
    let sz = tuplets.length
    if (sz === 0) {
        return false
    }

    let newNonTuplets: ChordIt[] = []
    let addedCount = nonTuplets.length
    while (addedCount > 0) {
        // nonTuplets.splice(nonTuplets.begin(), newNonTuplets)
        nonTuplets.unshift(...newNonTuplets)
        newNonTuplets = []
        // remove tuplets that are overlapped with non-tuplets
        for (let i = 0; i < sz;) {
            const interval = tupletInterval(tuplets[i], basicQuant)
            let shift = false
            let counter = 0
            for (const nonTuplet of nonTuplets) {
                ++counter
                if (counter > addedCount) {
                    break
                }
                if (haveIntersection(interval, chordInterval(nonTuplet, chords, basicQuant, barStart))) {
                    let isTied = false
                    for (const tiedTuplet of backTiedTuplets) {
                        if (tiedTuplet.tupletId === tuplets[i].id && tiedTuplet.chord === nonTuplet) {
                            isTied = true
                            break
                        }
                    }
                    if (!isTied) {
                        for (const chord of tuplets[i].chords) {
                            if (chord.second.second.barIndex === barIndex) {
                                newNonTuplets.push(chord.second)
                            }
                        }
                        eraseBackTiedTupletById(tuplets[i].id, backTiedTuplets)
                        --sz
                        if (i < sz) {
                            shift = true
                            tuplets[i] = tuplets[sz]
                        }
                        break
                    }
                }
            }
            if (shift) {
                continue
            }
            ++i
        }
        addedCount = newNonTuplets.length
    }
    const excluded = (sz !== tuplets.length)
    tuplets.length = sz

    return excluded
}

function removeUnusedTuplets(tuplets: TupletInfo[], nonTuplets: ChordIt[], pendingTuplets: StdSet<number>,
                             backTiedTuplets: TiedTuplet[], pendingNonTuplets: Set<ChordIt>, barIndex: number): void {
    if (pendingTuplets.empty()) {
        return
    }

    const newTuplets: TupletInfo[] = []
    for (let i = 0; i !== tuplets.length; ++i) {
        if (!pendingTuplets.contains(tuplets[i].id)) {
            newTuplets.push(tuplets[i])
        } else {
            eraseBackTiedTupletById(tuplets[i].id, backTiedTuplets)
            for (const chord of tuplets[i].chords) {
                if (chord.second.second.barIndex === barIndex) {
                    nonTuplets.push(chord.second)
                    pendingNonTuplets.add(chord.second)
                }
            }
        }
    }
    pendingTuplets.clear()
    tuplets.length = 0
    tuplets.push(...newTuplets)
}

function findPendingTuplets(tuplets: readonly TupletInfo[]): StdSet<number> {
    const pendingTuplets = new StdSet<number>() // tuplet indexes
    for (let i = 0; i !== tuplets.length; ++i) {
        pendingTuplets.insert(tuplets[i].id)
    }
    return pendingTuplets
}

function findPendingNonTuplets(nonTuplets: readonly ChordIt[]): Set<ChordIt> {
    const pendingNonTuplets = new Set<ChordIt>()
    for (const c of nonTuplets) {
        pendingNonTuplets.add(c)
    }
    return pendingNonTuplets
}

/**
 * C++ eraseBackTiedTuplet(iterator, list, tuplet): erases the tied tuplets of the chords of the tuplet and the
 * element at index `it`; returns the index of the element after it
 */
function eraseBackTiedTupletAt(it: number, backTiedTuplets: TiedTuplet[], tuplet: TupletInfo): number {
    const itObj = backTiedTuplets[it]
    for (const chord of tuplet.chords) {
        for (let it2 = 0; it2 < backTiedTuplets.length; ++it2) {
            if (chord.second.second === backTiedTuplets[it2].chord.second) {
                backTiedTuplets.splice(it2, 1)
                break
            }
        }
    }

    const idx = backTiedTuplets.indexOf(itObj)
    if (idx < 0) {
        // C++ UB (the iterator itself was erased): continue at the same position
        return Math.min(it, backTiedTuplets.length)
    }
    backTiedTuplets.splice(idx, 1)
    return idx
}

function setVoicesFromPrevBars(backTiedTuplets: TiedTuplet[], tuplets: TupletInfo[], pendingTuplets: StdSet<number>,
                               _pendingNonTuplets: Set<ChordIt>, tupletIntervals: VoiceIntervals,
                               backTupletIntervals: VoiceIntervals, chords: ChordMap, basicQuant: ReducedFraction,
                               barStart: ReducedFraction): void {
    let loopAgain = false
    do {
        // C++ never resets loopAgain (an endless loop once it is set); reset it for each pass
        loopAgain = false
        for (let it = 0; it < backTiedTuplets.length;) {
            const tiedTuplet = backTiedTuplets[it]
            const tuplet = tupletFromId(tiedTuplet.tupletId, tuplets)
            const backInterval: FractionPair = [tuplet.onTime, tuplet.onTime.plus(tuplet.len)]

            if (tiedTuplet.voice === -1) {
                ++it
                continue
            }
            if (haveIntersection(backInterval, at(backTupletIntervals, tiedTuplet.voice))) {
                backTiedTuplets.splice(it, 1)
                continue
            }

            for (const chord of tuplet.chords) {
                for (let it2 = 0; it2 < backTiedTuplets.length; ++it2) {
                    if (it2 === it) {
                        continue
                    }
                    if (chord.second.second === backTiedTuplets[it2].chord.second
                        && backTiedTuplets[it2].voice === -1) {
                        backTiedTuplets[it2].voice = tiedTuplet.voice
                        loopAgain = true
                        break
                    }
                }
            }

            setTupletVoice(tuplet.chords, tiedTuplet.voice)
            at(backTupletIntervals, tiedTuplet.voice).push(backInterval)
            at(tupletIntervals, tiedTuplet.voice).push(backInterval)
            // add to intervals chord from previous bar
            at(tupletIntervals, tiedTuplet.voice).push(chordInterval(tiedTuplet.chord, chords, basicQuant, barStart))
            pendingTuplets.eraseKey(tiedTuplet.tupletId)

            ++it
        }
    } while (loopAgain)
}

function setTiedChordVoice(backTiedTuplets: TiedTuplet[], tuplets: TupletInfo[], pendingTuplets: StdSet<number>,
                           pendingNonTuplets: Set<ChordIt>, tupletIntervals: VoiceIntervals,
                           backTupletIntervals: VoiceIntervals, chords: ChordMap, backTiedIt: number,
                           isNonTupletBackChord: boolean, basicQuant: ReducedFraction, barStart: ReducedFraction): void {
    const tiedTuplet = backTiedTuplets[backTiedIt]

    if (isNonTupletBackChord) {
        // non-tuplet chord tied
        const interval = chordInterval(tiedTuplet.chord, chords, basicQuant, barStart)
        at(backTupletIntervals, tiedTuplet.voice).push(interval)
        tiedTuplet.chord.second.voice = tiedTuplet.voice
        if (tupletVoiceLimit() > 1) {
            at(tupletIntervals, tiedTuplet.voice).push(interval)
        }
        pendingNonTuplets.delete(tiedTuplet.chord)
    } else {
        // tuplet tied
        const i = findTupletWithChord(tiedTuplet.chord.second, tuplets)

        let it2 = backTiedIt + 1
        for (; it2 < backTiedTuplets.length; ++it2) {
            if (backTiedTuplets[it2].tupletId === tuplets[i].id) {
                break
            }
        }
        if (it2 < backTiedTuplets.length) {
            if (backTiedTuplets[it2].voice === -1) {
                backTiedTuplets[it2].voice = tiedTuplet.voice
            }
        } else {
            // set voice of not back-tied tuplet that have tied chord
            setTupletVoice(tuplets[i].chords, tiedTuplet.voice)
            const interval = tupletInterval(tuplets[i], basicQuant)
            at(tupletIntervals, tiedTuplet.voice).push(interval)
            at(backTupletIntervals, tiedTuplet.voice).push(interval)
            pendingTuplets.eraseKey(tuplets[i].id)
        }
    }
}

function setVoiceOfConnectedBackTied(backTiedTuplets: TiedTuplet[], tiedTupletVoice: number,
                                     pendingTuplets: StdSet<number>, tuplet: TupletInfo, backTiedIt: number): void {
    for (const chord of tuplet.chords) {
        for (let it2 = backTiedIt + 1; it2 < backTiedTuplets.length; ++it2) {
            if (!pendingTuplets.contains(backTiedTuplets[it2].tupletId)) {
                continue
            }
            if (chord.second.second === backTiedTuplets[it2].chord.second && backTiedTuplets[it2].voice === -1) {
                backTiedTuplets[it2].voice = tiedTupletVoice
                break
            }
        }
    }
}

function findVoiceForBackTied(tiedTupletChord: ChordPair, voiceLimitValue: number, backInterval: FractionPair,
                              backTupletIntervals: VoiceIntervals, chords: ChordMap, isNonTupletBackChord: boolean,
                              basicQuant: ReducedFraction, barStart: ReducedFraction): number {
    let voice = 0
    for (; voice !== voiceLimitValue; ++voice) {
        if (haveIntersection(backInterval, at(backTupletIntervals, voice))
            || (isNonTupletBackChord && haveIntersection(
                chordInterval(tiedTupletChord, chords, basicQuant, barStart),
                at(backTupletIntervals, voice)))) {
            continue
        }
        break
    }

    return voice
}

function findBackTupletIntervals(backTiedTuplets: readonly TiedTuplet[], tuplets: readonly TupletInfo[]): VoiceIntervals {
    const backTupletIntervals: VoiceIntervals = new StdMap<number, FractionPair[]>()
    for (const t of backTiedTuplets) {
        const tuplet = tupletFromId(t.tupletId, tuplets)
        const interval: FractionPair = [tuplet.onTime, tuplet.onTime.plus(tuplet.len)]
        at(backTupletIntervals, t.voice).push(interval)
    }
    return backTupletIntervals
}

function setBackTiedVoices(backTiedTuplets: TiedTuplet[], tuplets: TupletInfo[], pendingTuplets: StdSet<number>,
                           pendingNonTuplets: Set<ChordIt>, tupletIntervals: VoiceIntervals, chords: ChordMap,
                           basicQuant: ReducedFraction, barStart: ReducedFraction): void {
    const backTupletIntervals = findBackTupletIntervals(backTiedTuplets, tuplets)

    // set voices that are already set from one of previous bars
    setVoicesFromPrevBars(backTiedTuplets, tuplets, pendingTuplets, pendingNonTuplets,
                          tupletIntervals, backTupletIntervals, chords, basicQuant, barStart)

    // set yet unset back tied voices
    const limit = tupletVoiceLimit()

    for (let it = 0; it < backTiedTuplets.length;) {
        const tiedTuplet = backTiedTuplets[it]
        if (!pendingTuplets.contains(tiedTuplet.tupletId)) {
            ++it
            continue
        }

        const tuplet = tupletFromId(tiedTuplet.tupletId, tuplets)
        const backInterval: FractionPair = [tuplet.onTime, tuplet.onTime.plus(tuplet.len)]
        const isNonTupletBackChord = pendingNonTuplets.has(tiedTuplet.chord)

        if (tiedTuplet.voice === -1) {
            const voice = findVoiceForBackTied(tiedTuplet.chord, limit, backInterval, backTupletIntervals,
                                               chords, isNonTupletBackChord, basicQuant, barStart)
            if (voice < limit) {
                tiedTuplet.voice = voice
            } else { // no available voices
                it = eraseBackTiedTupletAt(it, backTiedTuplets, tuplet)
                continue
            }
        } else {
            if (haveIntersection(backInterval, at(backTupletIntervals, tiedTuplet.voice))
                || (isNonTupletBackChord
                    && haveIntersection(chordInterval(tiedTuplet.chord, chords, basicQuant, barStart),
                                        at(backTupletIntervals, tiedTuplet.voice)))) {
                it = eraseBackTiedTupletAt(it, backTiedTuplets, tuplet)
                continue
            }
        }

        setVoiceOfConnectedBackTied(backTiedTuplets, tiedTuplet.voice, pendingTuplets, tuplet, it)

        // set voices of tied tuplet chords
        setTupletVoice(tuplet.chords, tiedTuplet.voice)
        at(backTupletIntervals, tiedTuplet.voice).push(backInterval)
        at(tupletIntervals, tiedTuplet.voice).push(tupletInterval(tuplet, basicQuant))
        pendingTuplets.eraseKey(tiedTuplet.tupletId)

        setTiedChordVoice(backTiedTuplets, tuplets, pendingTuplets, pendingNonTuplets, tupletIntervals,
                          backTupletIntervals, chords, it, isNonTupletBackChord, basicQuant, barStart)
        ++it
    }
}

function findMappedTupletChords(tuplets: readonly TupletInfo[]): Map<ChordIt, number> {
    // <chord address, tupletIndex>
    const tupletChords = new Map<ChordIt, number>()
    for (let i = 0; i !== tuplets.length; ++i) {
        for (const tupletChord of tuplets[i].chords) {
            const tupletIt = tupletChord.second
            if (!tupletChords.has(tupletIt)) {
                tupletChords.set(tupletIt, i)
            }
        }
    }
    return tupletChords
}

function areTupletsIntersect(t1: TupletInfo, t2: TupletInfo): boolean {
    const onTime1 = t1.onTime
    const endTime1 = onTime1.plus(t1.len)
    const onTime2 = t2.onTime
    const endTime2 = onTime1.plus(t2.len) // sic (C++)
    return endTime1.gt(onTime2) && onTime1.lt(endTime2)
}

// result: tied notes indexes

function findTiedNotes(tuplet: TupletInfo, chordIt: ChordIt, chords: ChordMap, startBarTick: ReducedFraction,
                       basicQuant: ReducedFraction): number[] {
    const tiedNotes: number[] = []
    const tupletRatio = tupletLimits(tuplet.tupletNumber).ratio
    const firstTupletChordOnTime = findQuantizedTupletChordOnTime(
        tuplet.chords.begin().second, tuplet.len, tupletRatio, startBarTick)

    const maxChordOffTime = findMaxQuantizedTupletOffTime(chordIt, tuplet.len, tupletRatio, startBarTick)

    if (maxChordOffTime.gt(firstTupletChordOnTime)) {
        return tiedNotes
    }

    const onTime = findOnTimeBetweenChords(chordIt, chords, basicQuant, startBarTick)
    if (onTime.ge(tuplet.onTime)) {
        return tiedNotes
    }

    for (let i = 0; i !== chordIt.second.notes.length; ++i) {
        const note = chordIt.second.notes[i]

        const offTimeInTuplet = findQuantizedTupletNoteOffTime(
            chordIt.first, note.offTime, tuplet.len, tupletRatio, startBarTick)[0]

        if (offTimeInTuplet.lt(startBarTick) || offTimeInTuplet.le(tuplet.onTime)) {
            continue
        }

        const regularOffTime = findQuantizedNoteOffTime(chordIt, note.offTime, basicQuant)[0]
        const regularError = note.offTime.minus(regularOffTime).absValue()
        const tupletError = note.offTime.minus(offTimeInTuplet).absValue()
        if (tupletError.gt(regularError)) {
            continue
        }

        tiedNotes.push(i)
    }

    return tiedNotes
}

// prepare tied tuplets - pairs of tuplet and chord back-tied to it
// voices of back-tied chords from previous bar are set explicitly
// other voices = -1
// tied tuplets with voice != -1 don't intersect each other
// tuplets can be tied only to one chord or tuplet (no 'branches')

export function findBackTiedTuplets(chords: ChordMap, tuplets: readonly TupletInfo[], prevBarStart: ReducedFraction,
                                    startBarTick: ReducedFraction, basicQuant: ReducedFraction,
                                    currentBarIndex: number): TiedTuplet[] {
    const tiedTuplets: TiedTuplet[] = []
    // <voice, intervals>
    const backTupletIntervals: VoiceIntervals = new StdMap<number, FractionPair[]>()
    const usedTuplets = new Set<number>()
    const usedChords = new Set<ChordIt>()
    const tupletChords = findMappedTupletChords(tuplets)

    for (let i = 0; i !== tuplets.length; ++i) {
        let chordIt = tuplets[i].chords.begin().second
        while (chordIt !== chords.begin() && chordIt.first.ge(prevBarStart)) {
            chordIt = chordIt.prev()

            const tupletIndexOfChord = tupletChords.get(chordIt)
            const isInTupletOfThisBar = (tupletIndexOfChord !== undefined)
            // don't make back tie to the chord in overlapping tuplet
            if (isInTupletOfThisBar && areTupletsIntersect(tuplets[tupletIndexOfChord], tuplets[i])) {
                continue
            }
            // remember voices of tuplets that have tied chords from previous bar
            // and that chords don't belong to the tuplets of this bar
            const voice = (chordIt.second.barIndex < currentBarIndex) ? chordIt.second.voice : -1
            const interval: FractionPair = [tuplets[i].onTime, tuplets[i].onTime.plus(tuplets[i].len)]
            // if voice is specified and the new interval have intersection
            // with already found back tuplets with the save voice
            // then discard the interval
            if (voice !== -1 && haveIntersection(interval, at(backTupletIntervals, voice))) {
                continue
            }

            const tiedNotes = findTiedNotes(tuplets[i], chordIt, chords, startBarTick, basicQuant)
            if (tiedNotes.length !== 0) {
                // don't tie back twice to the same chord or tuplet
                if (usedChords.has(chordIt)) {
                    continue
                }
                // don't tie back twice to the same tuplet
                const tupletIndex = findTupletWithChord(chordIt.second, tuplets)
                if (usedTuplets.has(tupletIndex)) {
                    continue
                }
                // we can add back-tied tuplet; voice here can be -1
                tiedTuplets.push({ tupletId: tuplets[i].id, voice, chord: chordIt, tiedNoteIndexes: tiedNotes })
                at(backTupletIntervals, voice).push(interval)
                usedChords.add(chordIt)
                usedTuplets.add(tupletIndex)
                break
            }
        }
    }
    return tiedTuplets
}

// chord notes should not be rearranged here
// because note indexes are stored in tied tuplets

export function assignVoices(tuplets: TupletInfo[], nonTuplets: ChordIt[], backTiedTuplets: TiedTuplet[],
                             chords: ChordMap, basicQuant: ReducedFraction, barStart: ReducedFraction,
                             barIndex: number): void {
    const pendingTuplets = findPendingTuplets(tuplets)
    const pendingNonTuplets = findPendingNonTuplets(nonTuplets)

    // <voice, intervals>
    let tupletIntervals: VoiceIntervals = new StdMap<number, FractionPair[]>()

    setBackTiedVoices(backTiedTuplets, tuplets, pendingTuplets, pendingNonTuplets, tupletIntervals, chords,
                      basicQuant, barStart)
    setTupletVoices(tuplets, pendingTuplets, tupletIntervals, basicQuant)
    removeUnusedTuplets(tuplets, nonTuplets, pendingTuplets, backTiedTuplets, pendingNonTuplets, barIndex)

    if (tupletVoiceLimit() === 1) {
        const excluded = excludeExtraVoiceTuplets(tuplets, nonTuplets, backTiedTuplets, chords, basicQuant,
                                                  barStart, barIndex)
        if (excluded) { // to exclude tuplet intervals - rebuild all intervals
            tupletIntervals = new StdMap<number, FractionPair[]>()
            for (const tuplet of tuplets) {
                const voice = tuplet.chords.begin().second.second.voice
                at(tupletIntervals, voice).push(tupletInterval(tuplet, basicQuant))
            }
        }
    }

    setNonTupletVoices(pendingNonTuplets, tupletIntervals, tuplets, chords, basicQuant, barStart)
}
