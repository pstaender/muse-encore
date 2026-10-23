/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_beat.h/.cpp (namespace MidiBeat)
 */

import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { Constants } from '../../../../engraving/types/constants'
import { StdMap, type MapNode, type StdSet } from '../../../../framework/global/stdmap'
import { beatTrack, Event, type EventList } from '../../thirdparty/beatroot/beattracker'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import { type ChordMap, type ChordPair, type MidiNote, minAllowedDuration, newChordMap } from './importmidi_chord'
import {
    type TrackMap, fractionDenominatorToUserValue, fractionNumeratorToUserValue, userTimeSigToFraction,
} from './importmidi_inner'
import { beatLength, metricDivisionsOfBar, metricLevelsOfBar } from './importmidi_meter'
import { quantizeValue } from './importmidi_quant'
import { time2Tick } from './importmidi_tempo'
import { HumanBeatData, midiImportOperations } from './importmidi_operations'

export function beatsInBar(barFraction: ReducedFraction): number {
    const beatLen = beatLength(barFraction)
    const div = barFraction.div(beatLen)
    return Math.trunc(div.numerator() / div.denominator())
}

export function findChordSalience1(chord: ChordPair, ticksPerSec: number): number {
    let duration = new ReducedFraction(0, 1)
    let pitch = 2147483647
    let velocity = 0

    for (const note of chord.second.notes) {
        if (note.offTime.minus(chord.first).gt(duration)) {
            duration = note.offTime.minus(chord.first)
        }
        if (note.pitch < pitch) {
            pitch = note.pitch
        }
        velocity += note.velo
    }
    const durationInSeconds = duration.ticks() / ticksPerSec

    const c4 = 84
    const pmin = 48
    const pmax = 72

    if (pitch < pmin) {
        pitch = pmin
    } else if (pitch > pmax) {
        pitch = pmax
    }

    if (velocity <= 0) {
        velocity = 1
    }

    return durationInSeconds * (c4 - pitch) * Math.log(velocity)
}

export function findChordSalience2(chord: ChordPair, _ticksPerSec: number): number {
    let velocity = 0
    for (const note of chord.second.notes) {
        velocity += note.velo
    }
    if (velocity <= 0) {
        velocity = 1
    }

    return velocity
}

export function prepareChordEvents(chords: ChordMap, findChordSalience: (chord: ChordPair, ticksPerSec: number) => number,
                                   ticksPerSec: number): EventList {
    const events: EventList = []
    let minSalience = Number.MAX_VALUE
    for (const chord of chords) {
        const e = new Event()
        e.time = chord.first.ticks() / ticksPerSec
        e.salience = findChordSalience(chord, ticksPerSec)
        if (e.salience < minSalience) {
            minSalience = e.salience
        }
        events.push(e)
    }
    // all saliences should be non-negative
    if (minSalience < 0) {
        for (const e of events) {
            e.salience -= minSalience
        }
    }

    return events
}

export function findLastChordTick(chords: ChordMap): ReducedFraction {
    let lastOffTime = new ReducedFraction(0, 1)
    for (const chord of chords) {
        for (const note of chord.second.notes) {
            if (note.offTime.gt(lastOffTime)) {
                lastOffTime = note.offTime
            }
        }
    }
    return lastOffTime
}

// first beat time can be larger than first chord onTime
// so insert additional beats at the beginning to cover all chords
// (C++ int& addedBeatCount: returns its new value)

export function addFirstBeats(beatSet: StdSet<ReducedFraction>, firstTick: ReducedFraction, beatsInBar: number,
                              addedBeatCount: number): number {
    if (beatSet.empty()) {
        return addedBeatCount
    }

    addedBeatCount = 0
    let firstBeat = beatSet.begin().first
    if (firstTick.lt(firstBeat)) {
        if (beatSet.size() > 1) {
            const beatLen = beatSet.begin().next().first.minus(firstBeat)
            do {
                firstBeat = firstBeat.minus(beatLen)
                beatSet.insert(firstBeat)
                ++addedBeatCount
            } while (firstBeat.gt(firstTick) || addedBeatCount % beatsInBar)
        }
    }
    return addedBeatCount
}

// last beat time can be smaller than the last chord onTime
// so insert additional beats at the end to cover all chords
// (C++ int& addedBeatCount: returns its new value)

export function addLastBeats(beatSet: StdSet<ReducedFraction>, lastTick: ReducedFraction, beatsInBar: number,
                             addedBeatCount: number): number {
    if (beatSet.empty()) {
        return addedBeatCount
    }

    addedBeatCount = 0
    // theoretically it's possible that every chord have off time
    // at the end of the piece - so check all chords for max off time
    let lastBeat = beatSet.end().prev().first
    if (lastTick.gt(lastBeat)) {
        if (beatSet.size() > 1) {
            const beatLen = lastBeat.minus(beatSet.end().prev(2).first)
            do {
                lastBeat = lastBeat.plus(beatLen)
                beatSet.insert(lastBeat)
                ++addedBeatCount
            } while (lastBeat.lt(lastTick) || addedBeatCount % beatsInBar)
        }
    }
    return addedBeatCount
}

export function prepareHumanBeatData(beatTimes: readonly number[], chords: ChordMap, ticksPerSec: number,
                                     beatsInBar: number): HumanBeatData {
    const beatData = new HumanBeatData()
    if (chords.empty()) {
        return beatData
    }

    for (const beatTime of beatTimes) {
        beatData.beatSet.insert(time2Tick(beatTime, ticksPerSec))
    }

    beatData.firstChordTick = chords.begin().first
    beatData.lastChordTick = findLastChordTick(chords)

    beatData.addedFirstBeats = addFirstBeats(beatData.beatSet, beatData.firstChordTick,
                                             beatsInBar, beatData.addedFirstBeats)
    beatData.addedLastBeats = addLastBeats(beatData.beatSet, beatData.lastChordTick,
                                           beatsInBar, beatData.addedLastBeats)

    return beatData
}

export function findMatchRank(beatSet: StdSet<ReducedFraction>, events: EventList, levels: readonly number[],
                              beatsInBar: number, ticksPerSec: number): number {
    const saliences = new StdMap<ReducedFraction, number>(compareReducedFractions)
    for (const e of events) {
        saliences.insert(time2Tick(e.time, ticksPerSec), e.salience)
    }
    let beatsOfBar: ReducedFraction[] = []
    let matchFrac = 0
    let matchCount = 0
    let beatCount = 0

    for (const beat of beatSet) {
        beatsOfBar.push(beat)
        ++beatCount
        if (beatCount === beatsInBar) {
            beatCount = 0
            let relationCount = 0
            let relationMatches = 0
            for (let i = 0; i !== beatsOfBar.length - 1; ++i) {
                const s1 = saliences.find(beatsOfBar[i])
                for (let j = i + 1; j !== beatsOfBar.length; ++j) {
                    ++relationCount // before s1 search check
                    if (s1 === saliences.end()) {
                        continue
                    }
                    const s2 = saliences.find(beatsOfBar[j])
                    if (s2 === saliences.end()) {
                        continue
                    }
                    if ((s1.second < s2.second) === (levels[i] < levels[j])) {
                        ++relationMatches
                    }
                }
            }
            if (relationCount) {
                matchFrac += relationMatches * 1.0 / relationCount
                ++matchCount
            }
            beatsOfBar = []
        }
    }
    if (matchCount) {
        matchFrac /= matchCount
    }

    return matchFrac
}

export function removeEvery2ndBeat(beatSet: StdSet<ReducedFraction>): void {
    let it = beatSet.begin()
    while (it !== beatSet.end() && it.next() !== beatSet.end()) {
        it = beatSet.erase(it.next())
    }
    if (it === beatSet.end()) {
        // insert additional beat at the end to cover all chords
        const beatLen = it.prev().first.minus(it.prev(2).first)
        beatSet.insert(it.prev().first.plus(beatLen))
    }
}

// we can use ReducedFraction for time signature (bar fraction)
// because it reduces itself only if numerator or denominator
// is greater than some big number (see ReducedFraction class definition)

export function findTimeSignatures(timeSigFromMidiFile: ReducedFraction): ReducedFraction[] {
    let fractions = [new ReducedFraction(4, 4), new ReducedFraction(3, 4)]
    let match = false
    for (const f of fractions) {
        if (f.isIdenticalTo(timeSigFromMidiFile)) {
            match = true
            break
        }
    }
    if (!match) { // some special time sig in MIDI file - use only it
        fractions = [timeSigFromMidiFile]
    }
    return fractions
}

export function setTimeSig(sigmap: TimeSigMap, timeSig: ReducedFraction): void {
    sigmap.clear()
    sigmap.addSig(0, timeSig.fraction())
}

export function findBeatLocations(allChords: ChordMap, sigmap: TimeSigMap, ticksPerSec: number): void {
    const MIN_BEAT_COUNT = 8
    const barFractions = findTimeSignatures(ReducedFraction.fromFraction(sigmap.timesig(0).timesig()))
    const salienceFuncs = [findChordSalience1, findChordSalience2]

    // <match rank, beat data, comparator>: std::map<double, ..., std::greater<double>> -
    // the first result with the greatest rank
    let bestRank = 0
    let bestBeatData: HumanBeatData | null = null

    for (const func of salienceFuncs) {
        const events = prepareChordEvents(allChords, func, ticksPerSec)
        const beatTimes = beatTrack(events)
        if (beatTimes.length <= MIN_BEAT_COUNT) {
            continue
        }

        for (const barFraction of barFractions) {
            const beatLen = beatLength(barFraction)
            const div = barFraction.div(beatLen)
            const beatsInBar = Math.trunc(div.numerator() / div.denominator())

            const divsInfo = [metricDivisionsOfBar(barFraction)]
            const levels = metricLevelsOfBar(barFraction, divsInfo, beatLen)

            // beat set - first case
            const beatData = prepareHumanBeatData(beatTimes, allChords, ticksPerSec, beatsInBar)
            beatData.timeSig = barFraction
            const matchRank = findMatchRank(beatData.beatSet, events, levels, beatsInBar, ticksPerSec)
            // std::map::insert does not replace an equal key
            if (bestBeatData === null || matchRank > bestRank) {
                bestRank = matchRank
                bestBeatData = beatData
            }
        }
    }

    const data = midiImportOperations.data()
    if (bestBeatData !== null) {
        const beatData = bestBeatData
        setTimeSig(sigmap, beatData.timeSig)
        data.humanBeatData = beatData
        data.trackOpers.measureCount2xLess.setDefaultValue(beatData.measureCount2xLess)
        data.trackOpers.timeSigNumerator.setDefaultValue(fractionNumeratorToUserValue(beatData.timeSig.numerator()))
        data.trackOpers.timeSigDenominator.setDefaultValue(
            fractionDenominatorToUserValue(beatData.timeSig.denominator()))
    } else {
        const currentTimeSig = ReducedFraction.fromFraction(sigmap.timesig(0).timesig())
        data.trackOpers.timeSigNumerator.setDefaultValue(fractionNumeratorToUserValue(currentTimeSig.numerator()))
        data.trackOpers.timeSigDenominator.setDefaultValue(
            fractionDenominatorToUserValue(currentTimeSig.denominator()))
    }
}

export function scaleOffTimes(notes: MidiNote[], beats: StdSet<ReducedFraction>,
                              onTimeBeatEndIt: MapNode<ReducedFraction, undefined>,
                              newOnTimeBeatStart: ReducedFraction, newBeatLen: ReducedFraction): void {
    for (const note of notes) {
        let beatCount = 0 // beat count between note on time and off time

        let bStart = onTimeBeatEndIt.prev().first
        for (let bit = onTimeBeatEndIt; bit !== beats.end(); bit = bit.next()) {
            const bEnd = bit.first

            if (note.offTime.ge(bStart) && note.offTime.lt(bEnd)) {
                const scale = newBeatLen.div(bEnd.minus(bStart))
                let newOffTimeInBeat = note.offTime.minus(bStart).times(scale)
                newOffTimeInBeat = quantizeValue(newOffTimeInBeat, minAllowedDuration())
                const desiredBeatStart = newOnTimeBeatStart.plus(newBeatLen.times(beatCount))
                note.offTime = desiredBeatStart.plus(newOffTimeInBeat)
                break
            }

            bStart = bEnd
            ++beatCount
        }
    }
}

export function adjustChordsToBeats(tracks: TrackMap): void {
    const opers = midiImportOperations
    const beats = opers.data().humanBeatData.beatSet.copy() // copy
    if (beats.empty()) {
        return
    }

    if (opers.data().trackOpers.isHumanPerformance.value()) {
        if (opers.data().trackOpers.measureCount2xLess.value()) {
            removeEvery2ndBeat(beats)
        }

        const newBeatLen = ReducedFraction.fromTicks(Constants.DIVISION)

        for (let trackIt = tracks.begin(); trackIt !== tracks.end(); trackIt = trackIt.next()) {
            const chords = trackIt.second.chords
            if (chords.empty()) {
                continue
            }
            // do chord alignment according to recognized beats
            const newChords = newChordMap()
            let chordIt = chords.begin()
            let it = beats.begin()
            let beatStart = it.first
            let newBeatStart = new ReducedFraction(0, 1)

            for (it = it.next(); it !== beats.end(); it = it.next()) {
                const beatEnd = it.first

                const scale = newBeatLen.div(beatEnd.minus(beatStart))

                for (; chordIt !== chords.end() && chordIt.first.lt(beatEnd); chordIt = chordIt.next()) {
                    let newOnTimeInBeat = chordIt.first.minus(beatStart).times(scale)
                    // quantize to prevent ReducedFraction overflow
                    newOnTimeInBeat = quantizeValue(newOnTimeInBeat, minAllowedDuration())
                    scaleOffTimes(chordIt.second.notes, beats, it, newBeatStart, newBeatLen)
                    const newOnTime = newBeatStart.plus(newOnTimeInBeat)
                    for (const note of chordIt.second.notes) {
                        if (note.offTime.minus(newOnTime).lt(minAllowedDuration())) {
                            note.offTime = newOnTime.plus(minAllowedDuration())
                        }
                    }
                    newChords.insert(newOnTime, chordIt.second.clone())
                }

                if (chordIt === chords.end()) {
                    break
                }

                beatStart = beatEnd
                newBeatStart = newBeatStart.plus(newBeatLen)
            }

            trackIt.second.chords = newChords // std::swap
        }
    }
}

export function updateFirstLastBeats(beatData: HumanBeatData, timeSig: ReducedFraction): void {
    for (let i = 0; i !== beatData.addedFirstBeats; ++i) {
        beatData.beatSet.erase(beatData.beatSet.begin())
    }
    for (let i = 0; i !== beatData.addedLastBeats; ++i) {
        beatData.beatSet.erase(beatData.beatSet.end().prev())
    }

    const beatsInBarValue = beatsInBar(timeSig)

    beatData.addedFirstBeats = addFirstBeats(beatData.beatSet, beatData.firstChordTick,
                                             beatsInBarValue, beatData.addedFirstBeats)
    beatData.addedLastBeats = addLastBeats(beatData.beatSet, beatData.lastChordTick,
                                           beatsInBarValue, beatData.addedLastBeats)
}

export function setTimeSignature(sigmap: TimeSigMap): void {
    const data = midiImportOperations.data()
    const beats = data.humanBeatData.beatSet
    if (beats.empty()) {
        return // don't set time sig for non-human performed MIDI files
    }
    const timeSig = userTimeSigToFraction(data.trackOpers.timeSigNumerator.value(),
                                          data.trackOpers.timeSigDenominator.value())
    setTimeSig(sigmap, timeSig)
    updateFirstLastBeats(data.humanBeatData, timeSig)
}
