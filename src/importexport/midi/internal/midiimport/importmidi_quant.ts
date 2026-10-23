/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_quant.h/.cpp (namespace Quantize)
 */

import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { Constants } from '../../../../engraving/types/constants'
import { StdSet } from '../../../../framework/global/stdmap'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import {
    type ChordIt, type ChordMap, type ChordPair, type MidiChord, type MidiNote, collectChords, maxNoteLen,
    minAllowedDuration, minNoteLen, newChordMap,
} from './importmidi_chord'
import { MTrack, type TrackMap, newTrackMap } from './importmidi_inner'
import { beatLength, divisionInfo, levelOfTick } from './importmidi_meter'
import { type TupletData, tupletLimits } from './importmidi_tuplet'
import { findBeatLocations } from './importmidi_beat'
import { findBasicTempo } from './importmidi_tempo'
import { midiImportOperations } from './importmidi_operations'
import { midiImportConfiguration } from '../midiconfiguration'
import { QuantValue, VoiceCount } from './importmidi_operation'

/** C++ qMin(a, b): (a < b) ? a : b */
function qMin(a: ReducedFraction, b: ReducedFraction): ReducedFraction {
    return a.lt(b) ? a : b
}

export function quantValueToFraction(quantValue: QuantValue): ReducedFraction {
    const division = ReducedFraction.fromTicks(Constants.DIVISION)
    let fraction = new ReducedFraction()

    switch (quantValue) {
    case QuantValue.Q_4:
        fraction = division
        break
    case QuantValue.Q_8:
        fraction = division.div(2)
        break
    case QuantValue.Q_16:
        fraction = division.div(4)
        break
    case QuantValue.Q_32:
        fraction = division.div(8)
        break
    case QuantValue.Q_64:
        fraction = division.div(16)
        break
    case QuantValue.Q_128:
        fraction = division.div(32)
        break
    case QuantValue.Q_256:
        fraction = division.div(64)
        break
    case QuantValue.Q_512:
        fraction = division.div(128)
        break
    case QuantValue.Q_1024:
        fraction = division.div(256)
        break
    default:
        break
    }

    return fraction
}

export function fractionToQuantValue(fraction: ReducedFraction): QuantValue {
    const division = ReducedFraction.fromTicks(Constants.DIVISION)
    let quantValue = QuantValue.Q_4

    if (fraction.eq(division)) {
        quantValue = QuantValue.Q_4
    } else if (fraction.eq(division.div(2))) {
        quantValue = QuantValue.Q_8
    } else if (fraction.eq(division.div(4))) {
        quantValue = QuantValue.Q_16
    } else if (fraction.eq(division.div(8))) {
        quantValue = QuantValue.Q_32
    } else if (fraction.eq(division.div(16))) {
        quantValue = QuantValue.Q_64
    } else if (fraction.eq(division.div(32))) {
        quantValue = QuantValue.Q_128
    } else if (fraction.eq(division.div(64))) {
        quantValue = QuantValue.Q_256
    } else if (fraction.eq(division.div(128))) {
        quantValue = QuantValue.Q_512
    } else if (fraction.eq(division.div(256))) {
        quantValue = QuantValue.Q_1024
    } else {
        quantValue = QuantValue.Q_INVALID
    }

    return quantValue
}

export function defaultQuantValueFromPreferences(): QuantValue {
    const ticks = midiImportConfiguration().midiShortestNote()
    const fraction = ReducedFraction.fromTicks(ticks)
    let quantValue = fractionToQuantValue(fraction)
    if (quantValue === QuantValue.Q_INVALID) {
        // Unknown shortestNote value in preferences, defaulting to 16th.
        quantValue = QuantValue.Q_16
    }
    return quantValue
}

/** [beg, end) of a chord map */
export function shortestQuantizedNoteInRange(beg: ChordIt, end: ChordIt): ReducedFraction {
    const division = ReducedFraction.fromTicks(Constants.DIVISION)
    let minDuration = division
    for (let it = beg; it !== end; it = it.next()) {
        for (const note of it.second.notes) {
            if (note.offTime.minus(it.first).lt(minDuration)) {
                minDuration = note.offTime.minus(it.first)
            }
        }
    }
    const minAllowed = minAllowedDuration()
    let shortest = division
    for (; shortest.gt(minAllowed); shortest = shortest.div(2)) {
        if (shortest.le(minDuration)) {
            break
        }
    }
    return shortest
}

export function reduceQuantIfDottedNote(noteLen: ReducedFraction, raster: ReducedFraction): ReducedFraction {
    let newRaster = raster
    const div = noteLen.div(raster)
    const ratio = div.toDouble()
    if (ratio > 1.45 && ratio < 1.55) { // 1.5: dotted note that is larger than quantization value
        newRaster = newRaster.div(2) // reduce quantization error for dotted notes
    }
    return newRaster
}

export function quantizeValue(value: ReducedFraction, quant: ReducedFraction): ReducedFraction {
    const valueReduced = value.reduced()
    const rasterReduced = quant.reduced()
    let valNum = valueReduced.numerator() * rasterReduced.denominator()
    const rastNum = rasterReduced.numerator() * valueReduced.denominator()
    const commonDen = valueReduced.denominator() * rasterReduced.denominator()
    valNum = Math.trunc((valNum + Math.trunc(rastNum / 2)) / rastNum) * rastNum
    return new ReducedFraction(valNum, commonDen).reduced()
}

export function quantForLen(noteLen: ReducedFraction, basicQuant: ReducedFraction): ReducedFraction {
    let quant = basicQuant
    while (quant.gt(noteLen) && quant.ge(minAllowedDuration().times(2))) {
        quant = quant.div(2)
    }

    if (quant.ge(minAllowedDuration().times(2))) {
        quant = reduceQuantIfDottedNote(noteLen, quant)
    }

    return quant
}

export function quantForTuplet(tupletLen: ReducedFraction, tupletRatio: ReducedFraction): ReducedFraction {
    const quant = tupletLen.div(tupletRatio.numerator())

    if (quant.ge(minAllowedDuration().times(2))) {
        return quant.div(2)
    }

    return quant
}

export function findMinQuant(chord: ChordPair, basicQuant: ReducedFraction): ReducedFraction {
    let minQuant = new ReducedFraction(-1, 1)
    for (const note of chord.second.notes) {
        const quant = quantForLen(note.offTime.minus(chord.first), basicQuant)
        if (minQuant.eq(new ReducedFraction(-1, 1)) || quant.lt(minQuant)) {
            minQuant = quant
        }
    }
    return minQuant
}

export function findQuantizedTupletChordOnTime(chord: ChordPair, tupletLen: ReducedFraction,
                                               tupletRatio: ReducedFraction, rangeStart: ReducedFraction): ReducedFraction {
    if (chord.first.le(rangeStart)) {
        return rangeStart
    }
    const quant = quantForTuplet(tupletLen, tupletRatio)
    return rangeStart.plus(quantizeValue(chord.first.minus(rangeStart), quant))
}

export function findQuantizedChordOnTime(chord: ChordPair, basicQuant: ReducedFraction): ReducedFraction {
    const quant = findMinQuant(chord, basicQuant)
    return quantizeValue(chord.first, quant)
}

export function findQuantizedTupletNoteOffTime(onTime: ReducedFraction, offTime: ReducedFraction,
                                               tupletLen: ReducedFraction, tupletRatio: ReducedFraction,
                                               rangeStart: ReducedFraction): [ReducedFraction, ReducedFraction] {
    if (offTime.le(rangeStart)) {
        return [rangeStart, tupletLen]
    }

    let qOffTime: ReducedFraction
    let quant = quantForTuplet(tupletLen, tupletRatio)

    while (true) {
        qOffTime = rangeStart.plus(quantizeValue(offTime.minus(rangeStart), quant))
        if (qOffTime.le(onTime)) {
            if (quant.ge(minAllowedDuration().times(2))) {
                quant = quant.div(2)
                continue
            }
            qOffTime = onTime.plus(quant)
        }
        break
    }
    return [qOffTime, quant]
}

export function findQuantizedNoteOffTime(chord: ChordPair, offTime: ReducedFraction,
                                         basicQuant: ReducedFraction): [ReducedFraction, ReducedFraction] {
    let qOffTime: ReducedFraction
    let quant = quantForLen(offTime.minus(chord.first), basicQuant)

    while (true) {
        qOffTime = quantizeValue(offTime, quant)
        if (qOffTime.le(chord.first)) {
            if (quant.ge(minAllowedDuration().times(2))) {
                quant = quant.div(2)
                continue
            }
            qOffTime = chord.first.plus(quant)
        }
        break
    }
    return [qOffTime, quant]
}

export function findMinQuantizedOnTime(chord: ChordPair, basicQuant: ReducedFraction): ReducedFraction {
    let minOnTime = new ReducedFraction(-1, 1)
    for (const note of chord.second.notes) {
        const quant = quantForLen(note.offTime.minus(chord.first), basicQuant)
        const onTime = quantizeValue(chord.first, quant)
        if (minOnTime.eq(new ReducedFraction(-1, 1)) || onTime.lt(minOnTime)) {
            minOnTime = onTime
        }
    }
    return minOnTime
}

export function findMaxQuantizedTupletOffTime(chord: ChordPair, tupletLen: ReducedFraction,
                                              tupletRatio: ReducedFraction, rangeStart: ReducedFraction): ReducedFraction {
    let maxOffTime = new ReducedFraction(0, 1)
    for (const note of chord.second.notes) {
        if (note.offTime.le(rangeStart)) {
            continue
        }
        const offTime = findQuantizedTupletNoteOffTime(chord.first, note.offTime, tupletLen, tupletRatio,
                                                       rangeStart)[0]
        if (offTime.gt(maxOffTime)) {
            maxOffTime = offTime
        }
    }
    return maxOffTime
}

export function findMaxQuantizedOffTime(chord: ChordPair, basicQuant: ReducedFraction): ReducedFraction {
    let maxOffTime = new ReducedFraction(0, 1)
    for (const note of chord.second.notes) {
        const offTime = findQuantizedNoteOffTime(chord, note.offTime, basicQuant)[0]
        if (offTime.gt(maxOffTime)) {
            maxOffTime = offTime
        }
    }
    return maxOffTime
}

export function findOnTimeTupletQuantError(chord: ChordPair, tupletLen: ReducedFraction, tupletRatio: ReducedFraction,
                                           rangeStart: ReducedFraction): ReducedFraction {
    const qOnTime = findQuantizedTupletChordOnTime(chord, tupletLen, tupletRatio, rangeStart)
    return chord.first.minus(qOnTime).absValue()
}

export function findOnTimeQuantError(chord: ChordPair, basicQuant: ReducedFraction): ReducedFraction {
    const qOnTime = findQuantizedChordOnTime(chord, basicQuant)
    return chord.first.minus(qOnTime).absValue()
}

export function findOffTimeTupletQuantError(onTime: ReducedFraction, offTime: ReducedFraction,
                                            tupletLen: ReducedFraction, tupletRatio: ReducedFraction,
                                            rangeStart: ReducedFraction): ReducedFraction {
    const qOffTime = findQuantizedTupletNoteOffTime(onTime, offTime, tupletLen, tupletRatio, rangeStart)[0]
    return offTime.minus(qOffTime).absValue()
}

export function findOffTimeQuantError(chord: ChordPair, offTime: ReducedFraction,
                                      basicQuant: ReducedFraction): ReducedFraction {
    const qOffTime = findQuantizedNoteOffTime(chord, offTime, basicQuant)[0]
    return offTime.minus(qOffTime).absValue()
}

/** [beg, end) of a chord map */
export function findQuantForRange(beg: ChordIt, end: ChordIt, basicQuant: ReducedFraction): ReducedFraction {
    const shortestLen = shortestQuantizedNoteInRange(beg, end)
    return quantForLen(shortestLen, basicQuant)
}

//--------------------------------------------------------------------------------------------

export function isHumanPerformance(chords: ChordMap, sigmap: TimeSigMap): boolean {
    if (chords.empty()) {
        return false
    }

    const basicQuant = ReducedFraction.fromTicks(Constants.DIVISION).div(4) // 1/16
    let matches = 0
    let count = 0

    const usedOnTimes = new StdSet<ReducedFraction>(compareReducedFractions)

    for (const chord of chords) {
        const quant = qMin(basicQuant, quantForLen(maxNoteLen(chord), basicQuant))
        const onTime = quantizeValue(chord.first, quant)
        const [barIndex] = sigmap.tickValues(onTime.ticks())

        const barStart = ReducedFraction.fromTicks(sigmap.bar2tick(barIndex, 0))
        const barFraction = ReducedFraction.fromFraction(sigmap.timesig(barStart.ticks()).timesig())
        const beatLen = beatLength(barFraction)

        if (onTime.minus(barStart).div(beatLen).reduced().denominator() === 1
            && !usedOnTimes.contains(onTime)) {
            usedOnTimes.insert(onTime)
            ++count
            const diff = onTime.minus(chord.first).absValue()
            if (diff.lt(minAllowedDuration())) {
                ++matches
            }
        }
    }

    const TOL = 0.6
    const matched = matches * 1.0 / count

    return matched < TOL
}

export function getTrackWithAllChords(tracks: TrackMap): TrackMap {
    const singleTrack = newTrackMap()
    singleTrack.insert(0, new MTrack())
    const allChords = singleTrack.begin().second.chords
    for (const track of tracks) {
        const t = track.second
        for (const chord of t.chords) {
            allChords.insert(chord.first, chord.second.clone())
        }
    }
    return singleTrack
}

export function setIfHumanPerformance(tracks: TrackMap, sigmap: TimeSigMap): void {
    const allChordsTrack = getTrackWithAllChords(tracks)
    collectChords(allChordsTrack, new ReducedFraction(2, 1), new ReducedFraction(1, 2))
    const track = allChordsTrack.begin().second
    const allChords = track.chords
    if (allChords.empty()) {
        return
    }
    const isHuman = isHumanPerformance(allChords, sigmap)
    const opers = midiImportOperations.data().trackOpers
    if (opers.isHumanPerformance.canRedefineDefaultLater()) {
        opers.isHumanPerformance.setDefaultValue(isHuman)
    }

    if (isHuman) {
        if (opers.quantValue.canRedefineDefaultLater()) {
            opers.quantValue.setDefaultValue(QuantValue.Q_8)
        }
        if (opers.maxVoiceCount.canRedefineDefaultLater()) {
            opers.maxVoiceCount.setDefaultValue(VoiceCount.V_2)
        }
        const ticksPerSec = findBasicTempo(tracks, true) * Constants.DIVISION
        findBeatLocations(allChords, sigmap, ticksPerSec) // and set time sig
    }
}

//--------------------------------------------------------------------------------------------

// remove small intersection with the next chord
// (C++ ReducedFraction& offTime: returns its new value)

function preserveLegato(offTime: ReducedFraction, isOffTimeInTuplet: boolean, chordIt: ChordIt, chords: ChordMap,
                        basicQuant: ReducedFraction): ReducedFraction {
    let it = chordIt.next()
    while (it !== chords.end() && it.second.voice !== chordIt.second.voice) {
        it = it.next()
    }
    if (it !== chords.end()) {
        const ioi = it.first.minus(chordIt.first)
        const cross = offTime.minus(it.first)

        if (it.second.isInTuplet && isOffTimeInTuplet) {
            // while we don't split tuplet into voices we don't want to have
            // note intersections smaller than tuplet note length
            const tuplet = it.second.tuplet.second
            const tupletNoteLen = tuplet.len.div(tuplet.tupletNumber)
            if (cross.gt(new ReducedFraction(0, 1)) && cross.lt(tupletNoteLen)) {
                offTime = it.first
            }
        } else if (!it.second.isInTuplet && !isOffTimeInTuplet) {
            if (cross.gt(new ReducedFraction(0, 1)) && cross.lt(ioi.div(2)) && cross.lt(basicQuant.div(2))) {
                offTime = it.first
            }
        }
    }
    return offTime
}

function quantizeOffTimeForTuplet(noteOffTime: ReducedFraction, chordIt: ChordIt, chords: ChordMap,
                                  basicQuant: ReducedFraction, tuplet: TupletData): [ReducedFraction, ReducedFraction] {
    const tupletRatio = tupletLimits(tuplet.tupletNumber).ratio
    const result = findQuantizedTupletNoteOffTime(chordIt.first, noteOffTime, tuplet.len, tupletRatio, tuplet.onTime)
    let offTime = result[0]
    let quant = result[1]

    offTime = preserveLegato(offTime, true, chordIt, chords, basicQuant)

    // verify that offTime is still inside tuplet
    if (offTime.lt(tuplet.onTime)) {
        offTime = tuplet.onTime
        quant = tuplet.len
    } else if (offTime.gt(tuplet.onTime.plus(tuplet.len))) {
        offTime = tuplet.onTime.plus(tuplet.len)
        quant = tuplet.len
    }

    return [offTime, quant]
}

function quantizeOffTimeForNonTuplet(noteOffTime: ReducedFraction, chordIt: ChordIt, chords: ChordMap,
                                     basicQuant: ReducedFraction): [ReducedFraction, ReducedFraction] {
    const chord = chordIt.second
    const result = findQuantizedNoteOffTime(chordIt, noteOffTime, basicQuant)
    let offTime = result[0]
    let quant = result[1]
    offTime = preserveLegato(offTime, false, chordIt, chords, basicQuant)

    // verify that offTime is still outside tuplets
    if (chord.isInTuplet) {
        const tuplet = chord.tuplet.second
        if (offTime.lt(tuplet.onTime.plus(tuplet.len))) {
            offTime = tuplet.onTime.plus(tuplet.len)
            quant = tuplet.len
            return [offTime, quant]
        }
    }
    let next = chordIt.next()
    while (true) {
        if (next === chords.end()) {
            break
        }
        if (!next.second.isInTuplet || next.second.voice !== chord.voice) {
            next = next.next()
            continue
        }
        const isInSameTuplet = chord.isInTuplet && next.second.tuplet === chord.tuplet
        const tuplet = next.second.tuplet.second
        if (isInSameTuplet || tuplet.onTime.plus(tuplet.len).le(offTime)) {
            next = next.next()
            continue
        }

        if (offTime.gt(tuplet.onTime)) {
            offTime = tuplet.onTime
            quant = tuplet.len
        }
        break
    }

    return [offTime, quant]
}

class QuantPos {
    time = new ReducedFraction()
    metricalLevel = 0
    penalty = 0
    prevPos = 0
}

class QuantData {
    chord!: ChordIt
    quant = new ReducedFraction()
    quantForLen = new ReducedFraction()
    chordRangeStart = new ReducedFraction()
    chordRangeEnd = new ReducedFraction()
    // if inter on time interval with previous chord
    // is less than min allowed duration
    // then chord can be merged with previous chord
    canMergeWithPrev = false
    metricalLevelForLen = 0
    positions: QuantPos[] = []
}

export function quantizeToLarge(time: ReducedFraction, quant: ReducedFraction): ReducedFraction {
    const ratio = time.div(quant)
    let quantized = quant.times(Math.trunc(ratio.numerator() / ratio.denominator()))
    if (quantized.lt(time)) {
        quantized = quantized.plus(quant)
    }
    return quantized
}

export function quantizeToSmall(time: ReducedFraction, quant: ReducedFraction): ReducedFraction {
    const ratio = time.div(quant)
    let quantized = quant.times(Math.trunc(ratio.numerator() / ratio.denominator()))
    if (quantized.ge(time)) {
        quantized = quantized.minus(quant)
    }
    return quantized
}

function findMetricalLevels(data: QuantData[], chords: readonly ChordIt[], tupletQuant: ReducedFraction,
                            barStart: ReducedFraction, barFraction: ReducedFraction): void {
    const divsInfo = (tupletQuant.ne(new ReducedFraction(-1, 1)))
        ? divisionInfo(barFraction, [chords[0].second.tuplet.second])
        : divisionInfo(barFraction, [])

    for (const d of data) {
        for (let t = d.chordRangeStart; t.le(d.chordRangeEnd); t = t.plus(d.quant)) {
            const p = new QuantPos()
            p.time = t
            p.metricalLevel = levelOfTick(t.minus(barStart), divsInfo)
            d.positions.push(p)
        }

        let minLevel = 2147483647
        while (true) {
            for (let t = d.chordRangeStart; t.le(d.chordRangeEnd); t = t.plus(d.quant)) {
                if (t.minus(barStart).div(d.quantForLen).reduced().denominator() !== 1) {
                    continue
                }
                const level = levelOfTick(t.minus(barStart), divsInfo)
                if (level < minLevel) {
                    minLevel = level
                }
            }
            if (minLevel === 2147483647) {
                d.quantForLen = d.quantForLen.div(2)
                continue
            }
            break
        }
        d.metricalLevelForLen = minLevel
    }
}

function findChordRangeEnds(data: QuantData[], _rangeStart: ReducedFraction, rangeEnd: ReducedFraction,
                            barStart: ReducedFraction, beatLen: ReducedFraction): void {
    for (let i = data.length - 1; i >= 0; --i) {
        const d = data[i]
        d.chordRangeEnd = barStart.plus(quantizeToSmall(rangeEnd.minus(barStart), d.quant))

        if (d.chord.first.plus(beatLen).lt(rangeEnd)) {
            d.chordRangeEnd = barStart.plus(quantizeToSmall(d.chord.first.plus(beatLen).minus(barStart), d.quant))
        }
        if (i !== data.length - 1) {
            const prev = data[i + 1] // next in terms of time
            if (prev.chordRangeEnd.lt(d.chordRangeEnd)) {
                d.chordRangeEnd = barStart.plus(quantizeToSmall(prev.chordRangeEnd.minus(barStart), d.quant))
            }
            if (!prev.canMergeWithPrev && d.chordRangeEnd.eq(prev.chordRangeEnd)) {
                d.chordRangeEnd = d.chordRangeEnd.minus(d.quant)
            }
        }
        if (d.chordRangeEnd.lt(d.chordRangeStart)) {
            d.chordRangeEnd = d.chordRangeStart
        }
    }
}

function findChordRangeStarts(data: QuantData[], rangeStart: ReducedFraction, rangeEnd: ReducedFraction,
                              barStart: ReducedFraction, beatLen: ReducedFraction): void {
    for (let i = 0; i < data.length; ++i) {
        const d = data[i]
        while (true) {
            d.chordRangeStart = barStart.plus(quantizeToLarge(rangeStart.minus(barStart), d.quant))

            if (d.chord.first.minus(beatLen).gt(rangeStart)) {
                d.chordRangeStart = barStart.plus(quantizeToLarge(d.chord.first.minus(beatLen).minus(barStart),
                                                                  d.quant))
            }

            if (i !== 0) {
                const prev = data[i - 1]
                if (prev.chordRangeStart.gt(d.chordRangeStart)) {
                    d.chordRangeStart = barStart.plus(quantizeToLarge(prev.chordRangeStart.minus(barStart), d.quant))
                }
                if (!d.canMergeWithPrev && d.chordRangeStart.eq(prev.chordRangeStart)) {
                    d.chordRangeStart = d.chordRangeStart.plus(d.quant)
                }
            }

            if (d.chordRangeStart.ge(rangeEnd)) {
                if (d.quant.ge(minAllowedDuration().times(2))) {
                    d.quant = d.quant.div(2)
                } else {
                    d.canMergeWithPrev = true
                }
                continue
            }
            break
        }
    }
}

function findQuants(data: QuantData[], chords: readonly ChordIt[], rangeStart: ReducedFraction,
                    rangeEnd: ReducedFraction, basicQuant: ReducedFraction, tupletQuant: ReducedFraction,
                    barFraction: ReducedFraction): void {
    for (let i = 0; i < chords.length; ++i) {
        const chordIt = chords[i]
        const d = new QuantData()
        d.chord = chordIt
        let len = minNoteLen(chordIt)
        if (rangeEnd.minus(rangeStart).lt(len)) {
            len = rangeEnd.minus(rangeStart)
        }
        if (i !== 0) {
            const prevChordIt = chords[i - 1]
            if (chordIt.first.minus(prevChordIt.first).lt(len)) {
                len = chordIt.first.minus(prevChordIt.first)
            }
            if (len.lt(minAllowedDuration())) {
                d.canMergeWithPrev = true
            }
        }
        if (tupletQuant.ne(new ReducedFraction(-1, 1))) {
            const tuplet = chords[0].second.tuplet.second
            d.quant = tupletQuant
            d.quantForLen = tuplet.len.div(tuplet.tupletNumber)
        } else {
            d.quant = quantForLen(len, basicQuant)
            let maxQuant = basicQuant
            while (maxQuant.lt(barFraction)) {
                maxQuant = maxQuant.times(2)
            }
            d.quantForLen = quantForLen(qMin(minNoteLen(chordIt), rangeEnd.minus(rangeStart)), maxQuant)
        }

        data.push(d)
    }
}

function findTupletQuant(chords: readonly ChordIt[]): ReducedFraction {
    let tupletQuant = new ReducedFraction(-1, 1)
    if (chords[0].second.isInTuplet) {
        const tuplet = chords[0].second.tuplet.second
        const tupletRatio = tupletLimits(tuplet.tupletNumber).ratio
        tupletQuant = quantForTuplet(tuplet.len, tupletRatio)
    }

    return tupletQuant
}

function findQuantData(chords: readonly ChordIt[], rangeStart: ReducedFraction, rangeEnd: ReducedFraction,
                       basicQuant: ReducedFraction, barStart: ReducedFraction, barFraction: ReducedFraction): QuantData[] {
    const data: QuantData[] = []
    const tupletQuant = findTupletQuant(chords)
    const beatLen = beatLength(barFraction)

    findQuants(data, chords, rangeStart, rangeEnd, basicQuant, tupletQuant, barFraction)
    findChordRangeStarts(data, rangeStart, rangeEnd, barStart, beatLen)
    findChordRangeEnds(data, rangeStart, rangeEnd, barStart, beatLen)
    findMetricalLevels(data, chords, tupletQuant, barStart, barFraction)

    return data
}

class QuantInfo {
    onTime = new ReducedFraction()
    penalty = 0.0
    chord!: ChordIt
}

function findLastChordPosition(quantData: QuantData[]): number {
    let posIndex = -1
    let minPenalty = Number.MAX_VALUE
    const lastPositions = quantData[quantData.length - 1].positions
    for (let i = 0; i !== lastPositions.length; ++i) {
        if (lastPositions[i].penalty < minPenalty) {
            minPenalty = lastPositions[i].penalty
            posIndex = i
        }
    }

    return posIndex
}

function applyDynamicProgramming(quantData: QuantData[]): void {
    const opers = midiImportOperations.data().trackOpers
    const isHuman = opers.isHumanPerformance.value()
    const MERGE_PENALTY_COEFF = 5.0

    for (let chordIndex = 0; chordIndex !== quantData.length; ++chordIndex) {
        const d = quantData[chordIndex]
        for (let pos = 0; pos !== d.positions.length; ++pos) {
            const p = d.positions[pos]

            const timePenalty = d.chord.first.minus(p.time).absValue().toDouble()
            const levelDiff = Math.abs(d.metricalLevelForLen - p.metricalLevel)

            if (isHuman) {
                if (p.metricalLevel <= d.metricalLevelForLen) {
                    p.penalty = timePenalty + levelDiff * d.quantForLen.toDouble()
                } else {
                    p.penalty = timePenalty / (1 + levelDiff)
                }
            } else {
                if (p.metricalLevel <= d.metricalLevelForLen) {
                    p.penalty = timePenalty * (1 + levelDiff)
                } else {
                    p.penalty = timePenalty
                }
            }

            if (chordIndex === 0) {
                continue
            }

            const dPrev = quantData[chordIndex - 1]
            let minPenalty = Number.MAX_VALUE
            let minPos = -1

            for (let posPrev = 0; posPrev !== dPrev.positions.length; ++posPrev) {
                const pPrev = dPrev.positions[posPrev]
                if (pPrev.time.gt(p.time)) {
                    continue
                }

                let penalty = pPrev.penalty
                if (pPrev.time.eq(p.time)) {
                    if (!d.canMergeWithPrev) {
                        continue
                    }
                    penalty += d.quant.toDouble() * MERGE_PENALTY_COEFF
                }

                if (penalty < minPenalty) {
                    minPenalty = penalty
                    minPos = posPrev
                }
            }

            p.penalty += minPenalty
            p.prevPos = minPos
        }
    }
}

/** C++ std::map<const std::pair<const ReducedFraction, MidiChord>*, QuantInfo> */
type FoundOnTimes = Map<ChordIt, QuantInfo>

function quantizeOnTimesInRange(chords: readonly ChordIt[], foundOnTimes: FoundOnTimes, rangeStart: ReducedFraction,
                                rangeEnd: ReducedFraction, basicQuant: ReducedFraction, barStart: ReducedFraction,
                                barFraction: ReducedFraction): void {
    const quantData = findQuantData(chords, rangeStart, rangeEnd, basicQuant, barStart, barFraction)
    applyDynamicProgramming(quantData)

    // backward dynamic programming step - collect optimal chord positions
    let posIndex = findLastChordPosition(quantData)

    for (let chordIndex = quantData.length - 1; ; --chordIndex) {
        const p = quantData[chordIndex].positions[posIndex]
        const onTime = p.time
        const chordIt = chords[chordIndex]

        const found = foundOnTimes.get(chordIt)
        if (found === undefined) {
            const info = new QuantInfo()
            info.chord = chordIt
            info.onTime = onTime
            info.penalty = p.penalty
            foundOnTimes.set(chordIt, info)
        } else if (p.penalty < found.penalty) {
            found.onTime = onTime
            found.penalty = p.penalty
        }

        if (chordIndex === 0) {
            break
        }
        posIndex = p.prevPos
    }
}

// input chords - sorted by onTime value

export function applyTupletStaccato(chords: ChordMap): void {
    for (let chordIt = chords.begin(); chordIt !== chords.end(); chordIt = chordIt.next()) {
        for (const note of chordIt.second.notes) {
            if (note.isInTuplet && note.staccato) {
                const tuplet = note.tuplet.second
                // decrease tuplet error by enlarging staccato notes:
                // make note.len = tuplet note length
                const tupletNoteLen = tuplet.len.div(tuplet.tupletNumber)
                note.offTime = chordIt.first.plus(tupletNoteLen)
            }
        }
    }
}

function quantizeOffTimes(quantizedChords: ChordMap, basicQuant: ReducedFraction): void {
    for (let chordIt = quantizedChords.begin(); chordIt !== quantizedChords.end(); chordIt = chordIt.next()) {
        const chord = chordIt.second
        // quantize off times
        for (const note of chord.notes) {
            // check if note is not in tuplet anymore
            if (note.isInTuplet) {
                if (chordIt.first.ge(note.tuplet.first.plus(note.tuplet.second.len))) {
                    note.isInTuplet = false
                }
            }

            const result = (note.isInTuplet)
                ? quantizeOffTimeForTuplet(note.offTime, chordIt, quantizedChords, basicQuant, note.tuplet.second)
                : quantizeOffTimeForNonTuplet(note.offTime, chordIt, quantizedChords, basicQuant)
            note.offTime = result[0]
            note.offTimeQuant = result[1]
        }
    }
}

/** (C++ std::deque chordsToQuant: an array, push_front = unshift) */
function addChordsFromPrevRange(chordsToQuant: ChordIt[], chords: ChordMap, currentlyInTuplet: boolean,
                                currentBarIndex: number, voice: number, barStart: ReducedFraction,
                                rangeStart: ReducedFraction, basicQuant: ReducedFraction): void {
    if (currentlyInTuplet) {
        return
    }

    let it = chordsToQuant[0]
    if (it === chords.begin()) {
        return
    }
    it = it.prev()

    if (rangeStart.eq(barStart)) { // new bar
        while (it.second.barIndex >= currentBarIndex - 1) {
            if (it.second.voice === voice && it.second.barIndex === currentBarIndex) {
                chordsToQuant.unshift(it)
            }
            if (it === chords.begin()) {
                break
            }
            it = it.prev()
        }
    } else {
        const tol = basicQuant.div(2)
        while (it.first.gt(rangeStart.minus(tol))) {
            if (it.second.voice === voice && !it.second.isInTuplet) {
                chordsToQuant.unshift(it)
            }
            if (it === chords.begin()) {
                break
            }
            it = it.prev()
        }
    }
}

function quantizeOnTimes(chords: ChordMap, foundOnTimes: FoundOnTimes, basicQuant: ReducedFraction,
                         sigmap: TimeSigMap): void {
    let maxVoice = 0
    for (let voice = 0; voice <= maxVoice; ++voice) {
        let currentBarIndex = -1
        let rangeStart = new ReducedFraction(-1, 1)
        let rangeEnd = new ReducedFraction(-1, 1)
        let barFraction = new ReducedFraction(-1, 1)
        let barStart = new ReducedFraction(-1, 1)
        let currentlyInTuplet = false
        let chordsToQuant: ChordIt[] = []

        for (let chordIt = chords.begin(); chordIt !== chords.end(); chordIt = chordIt.next()) {
            if (chordIt.second.voice > maxVoice) {
                maxVoice = chordIt.second.voice
            }
            if (chordIt.second.voice !== voice) {
                continue
            }

            if (chordsToQuant.length === 0) {
                rangeStart = rangeEnd
                currentlyInTuplet = chordIt.second.isInTuplet
                if (currentBarIndex !== chordIt.second.barIndex) {
                    currentBarIndex = chordIt.second.barIndex
                    barStart = ReducedFraction.fromTicks(sigmap.bar2tick(currentBarIndex, 0))
                    barFraction = ReducedFraction.fromFraction(sigmap.timesig(barStart.ticks()).timesig())
                    if (!currentlyInTuplet) {
                        rangeStart = barStart
                    }
                }
                if (currentlyInTuplet) {
                    const tuplet = chordIt.second.tuplet.second
                    rangeStart = tuplet.onTime
                    rangeEnd = tuplet.onTime.plus(tuplet.len)
                }
            }

            chordsToQuant.push(chordIt)

            let nextChord = chordIt.next()
            while (nextChord !== chords.end() && nextChord.second.voice !== voice) {
                nextChord = nextChord.next()
            }
            if (nextChord === chords.end()
                || nextChord.second.barIndex !== currentBarIndex
                || nextChord.second.isInTuplet !== currentlyInTuplet
                || (nextChord.second.isInTuplet && currentlyInTuplet
                    && nextChord.second.tuplet !== chordIt.second.tuplet)) {
                if (!currentlyInTuplet) {
                    if (nextChord !== chords.end()) {
                        if (nextChord.second.barIndex !== currentBarIndex) {
                            rangeEnd = ReducedFraction.fromTicks(sigmap.bar2tick(currentBarIndex + 1, 0))
                        } else if (nextChord.second.isInTuplet) {
                            rangeEnd = nextChord.second.tuplet.second.onTime
                        }
                    } else {
                        rangeEnd = ReducedFraction.fromTicks(sigmap.bar2tick(currentBarIndex + 1, 0))
                    }
                }

                addChordsFromPrevRange(chordsToQuant, chords, currentlyInTuplet, currentBarIndex, voice,
                                       barStart, rangeStart, basicQuant)

                quantizeOnTimesInRange(chordsToQuant, foundOnTimes, rangeStart, rangeEnd,
                                       basicQuant, barStart, barFraction)
                chordsToQuant = []
            }
        }
    }
}

// if on time after quantization become >= note off time
// then shift note off time preserving old note length

function moveOffTimes(oldOnTime: ReducedFraction, newOnTime: ReducedFraction, notes: MidiNote[]): void {
    for (const note of notes) {
        if (newOnTime.ge(note.offTime)) {
            note.offTime = note.offTime.plus(newOnTime.minus(oldOnTime))
        }
    }
}

/**
 * C++ iterates foundOnTimes (a map keyed by the addresses of the chord map nodes) in address order; here in the order
 * of the chords in their map (chords)
 */
function findQuantizedChords(foundOnTimes: FoundOnTimes, chords: ChordMap): ChordMap {
    const quantizedChords = newChordMap()
    for (const chordNode of chords) {
        const i = foundOnTimes.get(chordNode)
        if (i === undefined) {
            continue
        }
        const chord: MidiChord = i.chord.second

        let found = quantizedChords.end()
        const [first, second] = quantizedChords.equalRange(i.onTime)
        for (let it = first; it !== second; it = it.next()) {
            if (it.second.voice === chord.voice) {
                found = it
                break
            }
        }
        if (found !== quantizedChords.end()) {
            const fc = found.second
            fc.notes.push(...chord.notes.map(n => n.clone())) // merge chords with equal on times
            moveOffTimes(i.chord.first, i.onTime, fc.notes)
            if (chord.isInTuplet) {
                if (!fc.isInTuplet) {
                    fc.isInTuplet = true
                    fc.tuplet = chord.tuplet
                }
            }
        } else {
            const midiChord = chord.clone() // copy chord
            moveOffTimes(i.chord.first, i.onTime, midiChord.notes)
            quantizedChords.insert(i.onTime, midiChord)
        }
    }

    return quantizedChords
}

function removeUselessTupletReferences(chords: ChordMap): void {
    for (const chord of chords) {
        if (chord.second.isInTuplet) {
            const tuplet = chord.second.tuplet.second
            if (chord.first.ge(tuplet.onTime.plus(tuplet.len))) {
                chord.second.isInTuplet = false
            }
        }
        for (const note of chord.second.notes) {
            if (note.isInTuplet) {
                const tuplet = note.tuplet.second
                if (note.offTime.le(tuplet.onTime)) {
                    note.isInTuplet = false
                }
            }
        }
    }
}

export function quantizeChords(chords: ChordMap, sigmap: TimeSigMap, basicQuant: ReducedFraction): void {
    applyTupletStaccato(chords) // apply staccato for tuplet off times
    const foundOnTimes: FoundOnTimes = new Map()
    quantizeOnTimes(chords, foundOnTimes, basicQuant, sigmap)
    const quantizedChords = findQuantizedChords(foundOnTimes, chords)
    quantizeOffTimes(quantizedChords, basicQuant)
    // std::swap(chords, quantizedChords): the quantized chords replace the ones of the argument
    chords.clear()
    for (const c of quantizedChords) {
        chords.insert(c.first, c.second)
    }

    removeUselessTupletReferences(chords)
}
