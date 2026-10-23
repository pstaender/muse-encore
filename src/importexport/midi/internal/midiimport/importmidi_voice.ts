/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_voice.h/.cpp (namespace MidiVoice)
 *
 * C++ reference parameters: splitChordToVoice returns [splitDone, chordIt] (the C++ iterator argument is updated);
 * splitTuplet gets the chord or note whose `tuplet` and `isInTuplet` are updated (C++ references to both).
 */

import { StdMap, StdMultimap } from '../../../../framework/global/stdmap'
import { VOICES } from '../../../../engraving/types/types'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import {
    type ChordIt, type ChordMap, MidiChord, type MidiNote, chordAveragePitch, findChordsForTimeRange, findMaxChordLength,
    maxNoteOffTime, sortNotesByLength,
} from './importmidi_chord'
import {
    type TupletIt, type TupletMap, findTupletsForTimeRange, findTupletsInBarForDuration, hasNonTrivialChord,
    isTupletUseless, removeTuplet,
} from './importmidi_tuplet'
import { type TrackMap, durationCount, findBarStart } from './importmidi_inner'
import { DurationType, toDurationList } from './importmidi_meter'
import { CurrentTrackSetter, midiImportOperations } from './importmidi_operations'
import { VoiceCount } from './importmidi_operation'

const INT_MAX = 2147483647
const u32 = (v: number): number => v >>> 0

/** std::multimap<ReducedFraction, std::multimap<ReducedFraction, TupletData>::iterator> */
export type InsertedTupletMap = StdMultimap<ReducedFraction, TupletIt>

// no more than VOICES

export function toIntVoiceCount(value: VoiceCount): number {
    switch (value) {
    case VoiceCount.V_1:
        return 1
    case VoiceCount.V_2:
        return 2
    case VoiceCount.V_3:
        return 3
    case VoiceCount.V_4:
        return 4
    }
    return VOICES
}

export function voiceLimit(): number {
    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()
    const allowedVoiceCount = toIntVoiceCount(opers.maxVoiceCount.value(currentTrack))
    return allowedVoiceCount
}

export function areVoicesSame(chords: ChordMap): boolean {
    for (const chord of chords) {
        const c = chord.second
        if (c.isInTuplet && c.tuplet.second.voice !== c.voice) {
            return false
        }
        for (const note of c.notes) {
            if (note.isInTuplet && note.tuplet.second.voice !== c.voice) {
                return false
            }
        }
    }
    return true
}

function allNotesHaveEqualLength(notes: readonly MidiNote[]): boolean {
    const offTime = notes[0].offTime
    for (let i = 1; i !== notes.length; ++i) {
        if (notes[i].offTime.ne(offTime)) {
            return false
        }
    }
    return true
}

function findDurationCountInGroup(
    chordOnTime: ReducedFraction,
    notes: readonly MidiNote[],
    voice: number,
    groupOfIndexes: readonly number[],
    sigmap: TimeSigMap,
    tuplets: TupletMap,
): number {
    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()
    const useDots = opers.useDots.value(currentTrack)

    let count = 0
    let onTime = chordOnTime
    let onTimeBarStart = findBarStart(onTime, sigmap)
    let onTimeBarFraction = ReducedFraction.fromFraction(sigmap.timesig(onTimeBarStart.ticks()).timesig())

    for (const i of groupOfIndexes) {
        const offTime = notes[i].offTime
        if (offTime.eq(onTime)) {
            continue
        }
        const offTimeBarStart = findBarStart(offTime, sigmap)

        if (offTimeBarStart.ne(onTimeBarStart)) {
            const offTimeBarFraction = ReducedFraction.fromFraction(sigmap.timesig(offTimeBarStart.ticks()).timesig())

            const tupletsForDuration = findTupletsInBarForDuration(
                voice, onTimeBarStart, onTime, offTimeBarStart.minus(onTime), tuplets)

            // additional durations on measure boundary
            const durations = toDurationList(
                onTime.minus(onTimeBarStart), offTimeBarStart.minus(onTimeBarStart),
                offTimeBarFraction, tupletsForDuration, DurationType.NOTE,
                useDots, false)

            // C++ int += double: truncated
            count = Math.trunc(count + durationCount(durations))

            onTime = offTimeBarStart
            onTimeBarStart = offTimeBarStart
            onTimeBarFraction = offTimeBarFraction
        }

        const tupletsForDuration = findTupletsInBarForDuration(
            voice, onTimeBarStart, onTime, offTime.minus(onTime), tuplets)

        const durations = toDurationList(
            onTime.minus(onTimeBarStart), offTime.minus(onTimeBarStart), onTimeBarFraction,
            tupletsForDuration, DurationType.NOTE, useDots, false)

        count = Math.trunc(count + durationCount(durations))

        onTime = offTime
    }
    return count
}

// count of resulting durations in music notation

function findDurationCount(
    notes: readonly MidiNote[],
    voice: number,
    splitPoint: number,
    chordOnTime: ReducedFraction,
    sigmap: TimeSigMap,
    tuplets: TupletMap,
): number {
    const lowGroup: number[] = []
    const highGroup: number[] = []

    for (let i = 0; i !== splitPoint; ++i) {
        lowGroup.push(i)
    }
    for (let i = splitPoint; i !== notes.length; ++i) {
        highGroup.push(i)
    }

    lowGroup.sort((i1, i2) => notes[i1].offTime.compare(notes[i2].offTime))
    highGroup.sort((i1, i2) => notes[i1].offTime.compare(notes[i2].offTime))

    return findDurationCountInGroup(chordOnTime, notes, voice, lowGroup, sigmap, tuplets)
        + findDurationCountInGroup(chordOnTime, notes, voice, highGroup, sigmap, tuplets)
}

function findOptimalSplitPoint(chordIt: ChordIt, sigmap: TimeSigMap, tuplets: TupletMap, chords: ChordMap): number {
    const notes = chordIt.second.notes

    let optSplit = -1

    if (!allNotesHaveEqualLength(notes)) {
        let minNoteCount = INT_MAX

        for (let splitPoint = 1; splitPoint !== notes.length; ++splitPoint) {
            // optimization: don't split notes with equal durations
            if (notes[splitPoint - 1].offTime.eq(notes[splitPoint].offTime)) {
                continue
            }
            const noteCount = findDurationCount(notes, chordIt.second.voice, splitPoint,
                                                chordIt.first, sigmap, tuplets)
            if (noteCount < minNoteCount) {
                minNoteCount = noteCount
                optSplit = splitPoint
            }
        }
    } else {
        const offTime = notes[0].offTime
        for (let it = chordIt.next(); it !== chords.end(); it = it.next()) {
            if (it.first.ge(offTime)) {
                break
            }
            if (it.second.voice !== chordIt.second.voice) {
                continue
            }
            if (it.first.lt(offTime)) {
                optSplit = 0
                break
            }
        }
    }

    return optSplit
}

// which part of chord notes, sorted by length - low note indexes or high note indexes
// - should be moved to another voice

enum MovedVoiceGroup {
    LOW,
    HIGH,
}

interface VoiceSplit {
    group: MovedVoiceGroup
    voice: number
}

function findInsertedTuplet(onTime: ReducedFraction, voice: number, insertedTuplets: InsertedTupletMap) {
    const [first, last] = insertedTuplets.equalRange(onTime)
    for (let it = first; it !== last; it = it.next()) {
        if (it.second.second.voice === voice) {
            return it
        }
    }
    return insertedTuplets.end()
}

// if new chord intersected with tuplet that already was inserted
// due to some previous chord separation - then it is not an intersection:
// the new chord belongs to this tuplet

function hasIntersectionWithTuplets(
    voice: number,
    onTime: ReducedFraction,
    offTime: ReducedFraction,
    tuplets: TupletMap,
    insertedTuplets: InsertedTupletMap,
    tupletOnTime: ReducedFraction,
): boolean {
    const foundTuplets = findTupletsForTimeRange(voice, onTime, offTime.minus(onTime), tuplets, true)
    for (const tupletIt of foundTuplets) {
        const ins = findInsertedTuplet(tupletIt.first, voice, insertedTuplets)
        const belongsToInserted = (ins !== insertedTuplets.end() && ins.first.eq(tupletOnTime))
        if (!belongsToInserted) {
            return true
        }
    }

    return false
}

function addGroupSplits(
    splits: VoiceSplit[],
    maxChordLength: ReducedFraction,
    chords: ChordMap,
    tuplets: TupletMap,
    insertedTuplets: InsertedTupletMap,
    tupletOnTime: ReducedFraction,
    onTime: ReducedFraction,
    groupOffTime: ReducedFraction,
    origVoice: number,
    groupType: MovedVoiceGroup,
    maxOccupiedVoice: number,
): void {
    const limit = voiceLimit()
    let splitAdded = false

    for (let voice = 0; voice !== limit; ++voice) {
        if (voice === origVoice) {
            continue
        }
        if (voice > maxOccupiedVoice && splitAdded) {
            break
        }
        if (hasIntersectionWithTuplets(voice, onTime, groupOffTime, tuplets, insertedTuplets, tupletOnTime)) {
            continue
        }
        const foundChords = findChordsForTimeRange(voice, onTime, groupOffTime, chords, maxChordLength)
        if (foundChords.length !== 0) {
            continue
        }

        splitAdded = true
        splits.push({ group: groupType, voice })
    }
}

function maximizeOffTime(note: MidiNote, offTime: ReducedFraction): ReducedFraction {
    let result = offTime
    if (note.offTime.gt(offTime)) {
        result = note.offTime
    }
    if (note.isInTuplet) {
        const tuplet = note.tuplet.second
        if (tuplet.onTime.plus(tuplet.len).gt(result)) {
            result = tuplet.onTime.plus(tuplet.len)
        }
    }
    return result
}

function findPossibleVoiceSplits(
    origVoice: number,
    chordIt: ChordIt,
    splitPoint: number,
    chords: ChordMap,
    tuplets: TupletMap,
    insertedTuplets: InsertedTupletMap,
    maxOccupiedVoice: number,
): VoiceSplit[] {
    const splits: VoiceSplit[] = []

    let onTime = chordIt.first
    let lowGroupOffTime = new ReducedFraction(0, 1)
    let highGroupOffTime = new ReducedFraction(0, 1)

    const notes = chordIt.second.notes
    for (let i = 0; i !== splitPoint; ++i) {
        lowGroupOffTime = maximizeOffTime(notes[i], lowGroupOffTime)
    }
    for (let i = splitPoint; i !== notes.length; ++i) {
        highGroupOffTime = maximizeOffTime(notes[i], highGroupOffTime)
    }

    let tupletOnTime = new ReducedFraction(-1, 1)
    if (chordIt.second.isInTuplet) {
        const tuplet = chordIt.second.tuplet.second
        tupletOnTime = tuplet.onTime
        if (tuplet.onTime.lt(onTime)) {
            onTime = tuplet.onTime
        }
        if (tuplet.onTime.plus(tuplet.len).gt(lowGroupOffTime)) {
            lowGroupOffTime = tuplet.onTime.plus(tuplet.len)
        }
        if (tuplet.onTime.plus(tuplet.len).gt(highGroupOffTime)) {
            highGroupOffTime = tuplet.onTime.plus(tuplet.len)
        }
    }

    const maxChordLength = findMaxChordLength(chords)

    if (splitPoint > 0) {
        addGroupSplits(splits, maxChordLength, chords, tuplets, insertedTuplets,
                       tupletOnTime, onTime, lowGroupOffTime, origVoice,
                       MovedVoiceGroup.LOW, maxOccupiedVoice)
    }
    if (splitPoint < notes.length) {
        addGroupSplits(splits, maxChordLength, chords, tuplets, insertedTuplets,
                       tupletOnTime, onTime, highGroupOffTime, origVoice,
                       MovedVoiceGroup.HIGH, maxOccupiedVoice)
    }

    return splits
}

const MAX_PITCH_DIST = 1000

function findPrevPitchDist(chordIt: ChordIt, averagePitch: number, chords: ChordMap, voice: number): number {
    let it = chordIt
    while (it !== chords.begin()) {
        it = it.prev()
        if (it.second.voice === voice) {
            return Math.abs(chordAveragePitch(it.second.notes) - averagePitch)
        }
    }
    return MAX_PITCH_DIST
}

function findNextPitchDist(chordIt: ChordIt, averagePitch: number, chords: ChordMap, voice: number): number {
    let it = (chordIt === chords.end()) ? chordIt : chordIt.next()
    while (it !== chords.end()) {
        if (it.second.voice === voice) {
            return Math.abs(chordAveragePitch(it.second.notes) - averagePitch)
        }
        it = it.next()
    }
    return MAX_PITCH_DIST
}

function findMinPitchDist(averagePitch: number, voice: number, chordIt: ChordIt, chords: ChordMap): number {
    const OCTAVE = 12
    const prevPitchDist = findPrevPitchDist(chordIt, averagePitch, chords, voice)
    const nextPitchDist = findNextPitchDist(chordIt, averagePitch, chords, voice)

    let pitchDist = MAX_PITCH_DIST

    if (prevPitchDist < nextPitchDist && prevPitchDist <= OCTAVE) {
        pitchDist = prevPitchDist
    } else if (nextPitchDist <= prevPitchDist && nextPitchDist <= OCTAVE) {
        pitchDist = nextPitchDist
    }

    return pitchDist
}

function findAverageLowPitch(notes: readonly MidiNote[], splitPoint: number): number {
    let averageLowPitch = 0
    for (let j = 0; j !== splitPoint; ++j) {
        averageLowPitch += notes[j].pitch
    }
    averageLowPitch = Math.round(averageLowPitch * 1.0 / splitPoint)

    return averageLowPitch
}

function findAverageHighPitch(notes: readonly MidiNote[], splitPoint: number): number {
    let averageHighPitch = 0
    for (let j = splitPoint; j !== notes.length; ++j) {
        averageHighPitch += notes[j].pitch
    }
    averageHighPitch = Math.round(averageHighPitch * 1.0 / (notes.length - splitPoint))

    return averageHighPitch
}

function findBestSplit(chordIt: ChordIt, chords: ChordMap, possibleSplits: readonly VoiceSplit[],
                       splitPoint: number): VoiceSplit {
    // to minimize <pitch distance, voice>
    let minError: [number, number] = [INT_MAX, INT_MAX]
    let bestSplit = -1

    for (let i = 0; i !== possibleSplits.length; ++i) {
        const voice = possibleSplits[i].voice
        const notes = chordIt.second.notes
        let totalPitchDist = 0

        if (splitPoint > 0) {
            const averageLowPitch = findAverageLowPitch(notes, splitPoint)
            const lowVoice = (possibleSplits[i].group === MovedVoiceGroup.LOW) ? voice : chordIt.second.voice
            totalPitchDist += findMinPitchDist(averageLowPitch, lowVoice, chordIt, chords)
        }

        if (splitPoint < notes.length) {
            const averageHighPitch = findAverageHighPitch(notes, splitPoint)
            const highVoice = (possibleSplits[i].group === MovedVoiceGroup.HIGH) ? voice : chordIt.second.voice
            totalPitchDist += findMinPitchDist(averageHighPitch, highVoice, chordIt, chords)
        }

        const error: [number, number] = [totalPitchDist, voice]

        if (error[0] < minError[0] || (error[0] === minError[0] && error[1] < minError[1])) {
            minError = error
            bestSplit = i
        }
    }

    return possibleSplits[bestSplit]
}

/** C++ insertNewTuplet(iterator& tuplet, ...): returns the new value of tuplet */
function insertNewTuplet(
    tuplet: TupletIt,
    tupletOnTime: ReducedFraction,
    newVoice: number,
    chords: ChordMap,
    tuplets: TupletMap,
    insertedTuplets: InsertedTupletMap,
): TupletIt {
    const newTuplet = tuplet.second.clone()
    newTuplet.voice = newVoice
    tuplet = tuplets.insert(tupletOnTime, newTuplet)
    insertedTuplets.insert(tupletOnTime, tuplet)
    // maybe impossible due to intersection check but check anyway:
    // if there is a non-tuplet chord with on time = tuplet on time
    // then add that chord to the new tuplet
    const [first, last] = chords.equalRange(tupletOnTime)
    for (let it = first; it !== last; it = it.next()) {
        const chord = it.second
        if (chord.voice === newVoice && !chord.isInTuplet) {
            chord.isInTuplet = true
            chord.tuplet = tuplet
            break
        }
    }
    return tuplet
}

function canSplitTuplet(
    tuplet: TupletIt,
    newVoice: number,
    chordOnTime: ReducedFraction,
    notes: readonly MidiNote[],
    insertedTuplets: InsertedTupletMap,
    chords: ChordMap,
    maxChordLength: ReducedFraction,
): boolean {
    const tupletOnTime = tuplet.first
    const t = tuplet.second
    const insertedTuplet = findInsertedTuplet(tupletOnTime, newVoice, insertedTuplets)

    let needInsertTuplet = false
    if (insertedTuplet === insertedTuplets.end()
        && hasNonTrivialChord(chordOnTime, notes, t.onTime, t.len)) {
        needInsertTuplet = true
    }

    const needDeleteOldTuplet = isTupletUseless(t.voice, tupletOnTime, t.len, maxChordLength, chords)
    // insert new tuplet only if old tuplet should be deleted
    // because parallel equal tuplets with different voices aren't pretty
    if (needInsertTuplet && !needDeleteOldTuplet) {
        // need to amend chord split - need but cannot insert tuplet,
        // in that case no changes should be done earlier in this function!
        return false
    }

    return true
}

/** holder: the chord or note whose `tuplet` and `isInTuplet` are the C++ reference arguments */
function splitTuplet(
    holder: { tuplet: TupletIt, isInTuplet: boolean },
    newVoice: number,
    chordOnTime: ReducedFraction,
    notes: readonly MidiNote[],
    insertedTuplets: InsertedTupletMap,
    chords: ChordMap,
    tuplets: TupletMap,
    maxChordLength: ReducedFraction,
    allowParallelTuplets: boolean,
    isThisAChord: boolean,
): void {
    const oldTuplet = holder.tuplet
    const tupletOnTime = holder.tuplet.first
    const insertedTuplet = findInsertedTuplet(tupletOnTime, newVoice, insertedTuplets)

    let needInsertTuplet = false

    if (insertedTuplet === insertedTuplets.end()) {
        const t = holder.tuplet.second
        if (hasNonTrivialChord(chordOnTime, notes, t.onTime, t.len)) {
            needInsertTuplet = true
        } else {
            holder.isInTuplet = false
        }
    } else {
        holder.tuplet = insertedTuplet.second
    }

    const t = oldTuplet.second
    const needDeleteOldTuplet = isTupletUseless(t.voice, t.onTime, t.len, maxChordLength, chords)
    // insert new tuplet only if old tuplet was erased
    // because parallel equal tuplets with different voices aren't pretty
    const canInsertTuplet = (allowParallelTuplets)
        ? needInsertTuplet : (needInsertTuplet && needDeleteOldTuplet)
    if (canInsertTuplet) {
        holder.tuplet = insertNewTuplet(holder.tuplet, tupletOnTime, newVoice, chords, tuplets, insertedTuplets)
        holder.isInTuplet = true
    }
    if (needDeleteOldTuplet) { // delete after insert, because oldTuplet can be used
        let canRemoveTuplet = true
        if (isThisAChord) {
            // don't remove tuplet if chord notes have the same tuplet,
            // it will be removed on note split
            for (const note of notes) {
                if (note.isInTuplet && note.tuplet === oldTuplet) {
                    canRemoveTuplet = false
                    break
                }
            }
        }
        if (canRemoveTuplet) {
            removeTuplet(oldTuplet, tuplets, maxChordLength, chords)
        }
    }
}

function updateChordTuplets(
    chord: MidiChord,
    onTime: ReducedFraction,
    insertedTuplets: InsertedTupletMap,
    chords: ChordMap,
    tuplets: TupletMap,
    maxChordLength: ReducedFraction,
    allowParallelTuplets: boolean,
): boolean {
    if (!allowParallelTuplets) {
        let canDoSplit = true
        if (chord.isInTuplet && !canSplitTuplet(chord.tuplet, chord.voice, onTime,
                                                chord.notes, insertedTuplets, chords,
                                                maxChordLength)) {
            canDoSplit = false
        }
        if (canDoSplit) {
            for (const note of chord.notes) {
                if (note.isInTuplet && !canSplitTuplet(note.tuplet, chord.voice, onTime,
                                                       [note.clone()], insertedTuplets, chords,
                                                       maxChordLength)) {
                    canDoSplit = false
                    break
                }
            }
        }
        if (!canDoSplit) {
            return false
        }
    }

    if (chord.isInTuplet) {
        splitTuplet(chord, chord.voice, onTime,
                    chord.notes,
                    insertedTuplets, chords,
                    tuplets, maxChordLength, allowParallelTuplets, true)
    }
    for (const note of chord.notes) {
        if (note.isInTuplet) {
            splitTuplet(note, chord.voice, onTime,
                        [note.clone()],
                        insertedTuplets, chords,
                        tuplets, maxChordLength, allowParallelTuplets, false)
        }
    }

    return true
}

function findMaxOccupiedVoiceInBar(chordIt: ChordIt, chords: ChordMap): number {
    const barIndex = u32(chordIt.second.barIndex)
    let maxVoice = 0
    // look forward
    for (let it = chordIt; it !== chords.end(); it = it.next()) {
        const chord = it.second
        if (u32(chord.barIndex) > u32(barIndex + 1)) {
            break
        }
        if (u32(chord.barIndex) === barIndex && chord.voice > maxVoice) {
            maxVoice = chord.voice
        }
    }
    // look backward
    for (let it = chordIt; ;) {
        const chord = it.second
        if (u32(u32(chord.barIndex) + 1) < barIndex) {
            break
        }
        if (u32(chord.barIndex) === barIndex && chord.voice > maxVoice) {
            maxVoice = chord.voice
        }
        if (it === chords.begin()) {
            break
        }
        it = it.prev()
    }

    return maxVoice
}

/**
 * C++ splitChordToVoice(iterator& chordIt, ...): returns [splitDone, chordIt] (the new value of the iterator: the
 * inserted chord if the chord was split)
 */
export function splitChordToVoice(
    chordIt: ChordIt,
    notesToMove: ReadonlySet<number>,
    newVoice: number,
    chords: ChordMap,
    tuplets: TupletMap,
    insertedTuplets: InsertedTupletMap,
    maxChordLength: ReducedFraction,
    allowParallelTuplets = false,
): [boolean, ChordIt] {
    if (notesToMove.size === 0) {
        return [false, chordIt]
    }

    let splitDone = true
    const onTime = chordIt.first
    const chord = chordIt.second
    const notes = chord.notes
    if (notesToMove.size === notes.length) {
        // don't split chord, just move it to another voice
        const oldVoice = chord.voice // remember for possible undo
        chord.voice = newVoice

        const success = updateChordTuplets(chord, onTime, insertedTuplets,
                                           chords, tuplets, maxChordLength,
                                           allowParallelTuplets)
        if (!success) {
            splitDone = false
            chord.voice = oldVoice // rollback
        }
    } else { // split chord
        const newChord: MidiChord = chord.clone()
        newChord.notes = []
        newChord.voice = newVoice
        const updatedOldNotes: MidiNote[] = []

        for (let i = 0; i !== notes.length; ++i) {
            if (notesToMove.has(i)) {
                newChord.notes.push(notes[i].clone())
            } else {
                updatedOldNotes.push(notes[i])
            }
        }

        const rememberedNotes = notes // to undo split if necessary
        // update notes before tuplet update because there will be check
        // for empty tuplets
        chord.notes = updatedOldNotes

        const success = updateChordTuplets(newChord, onTime, insertedTuplets,
                                           chords, tuplets, maxChordLength,
                                           allowParallelTuplets)
        if (success) {
            chordIt = chords.insert(onTime, newChord)
        } else {
            chord.notes = rememberedNotes // rollback
            splitDone = false
        }
    }
    return [splitDone, chordIt]
}

function findNotesToMove(notes: readonly MidiNote[], splitPoint: number, splitGroup: MovedVoiceGroup): Set<number> {
    const notesToMove = new Set<number>()
    if (splitPoint === 0 || splitPoint === notes.length) {
        // don't split chord, just move it to another voice
        for (let i = 0; i !== notes.length; ++i) {
            notesToMove.add(i)
        }
    } else {
        switch (splitGroup) {
        case MovedVoiceGroup.LOW:
            for (let i = 0; i !== splitPoint; ++i) {
                notesToMove.add(i)
            }
            break
        case MovedVoiceGroup.HIGH:
            for (let i = splitPoint; i !== notes.length; ++i) {
                notesToMove.add(i)
            }
            break
        }
    }
    return notesToMove
}

function doVoiceSeparation(chords: ChordMap, sigmap: TimeSigMap, tuplets: TupletMap): boolean {
    sortNotesByLength(chords)
    const insertedTuplets: InsertedTupletMap = new StdMultimap<ReducedFraction, TupletIt>(compareReducedFractions)
    const maxChordLength = findMaxChordLength(chords)

    let changed = false
    const maxOccupiedVoices = new StdMap<number, number>() // <bar index, max occupied voice>

    for (let it = chords.begin(); it !== chords.end(); it = it.next()) {
        const chord = it.second
        const notes = chord.notes

        const splitPoint = findOptimalSplitPoint(it, sigmap, tuplets, chords)
        if (splitPoint === -1) {
            continue
        }

        let maxVoiceIt = maxOccupiedVoices.find(chord.barIndex)
        if (maxVoiceIt === maxOccupiedVoices.end()) {
            const maxVoice = findMaxOccupiedVoiceInBar(it, chords)
            maxVoiceIt = maxOccupiedVoices.insert(chord.barIndex, maxVoice)[0]
        }
        const possibleSplits = findPossibleVoiceSplits(
            chord.voice, it, splitPoint, chords,
            tuplets, insertedTuplets, maxVoiceIt.second)
        if (possibleSplits.length === 0) {
            continue
        }

        const bestSplit = findBestSplit(it, chords, possibleSplits, splitPoint)
        changed = true

        const notesToMove = findNotesToMove(notes, splitPoint, bestSplit.group)
        const [splitDone, newIt] = splitChordToVoice(
            it, notesToMove, bestSplit.voice, chords, tuplets,
            insertedTuplets, maxChordLength)
        it = newIt
        if (splitDone && bestSplit.voice > maxVoiceIt.second) {
            maxVoiceIt.second = bestSplit.voice
        }
    }
    return changed
}

function findBarIndexForOffTime(offTime: ReducedFraction, sigmap: TimeSigMap): number {
    let [barIndex, beat, tick] = sigmap.tickValues(offTime.ticks())
    if (beat === 0 && tick === 0) {
        --barIndex
    }
    return barIndex
}

function averagePitchOfChords(chords: readonly ChordIt[]): number {
    if (chords.length === 0) {
        return -1
    }

    let sumPitch = 0
    let noteCounter = 0
    for (const chord of chords) {
        const midiNotes = chord.second.notes
        for (const midiNote of midiNotes) {
            sumPitch += midiNote.pitch
            ++noteCounter
        }
    }

    return Math.round(sumPitch * 1.0 / noteCounter)
}

function sortVoicesByPitch(voiceChords: StdMap<number, ChordIt[]>): void {
    // [newVoice] = <average pitch, old voice>
    const pitchVoices: [number, number][] = []
    for (const v of voiceChords) {
        pitchVoices.push([averagePitchOfChords(v.second), v.first])
    }

    pitchVoices.sort((p1, p2) => {
        if (p1[0] !== p2[0]) {
            return p2[0] - p1[0]
        }
        return p1[1] - p2[1]
    })

    for (let newVoice = 0; newVoice !== pitchVoices.length; ++newVoice) {
        const oldVoice = pitchVoices[newVoice][1]
        if (newVoice === oldVoice) {
            continue
        }
        const it = voiceChords.find(oldVoice)

        for (const chord of it.second) {
            const c = chord.second
            c.voice = newVoice
            if (c.isInTuplet) {
                c.tuplet.second.voice = newVoice
            }
            for (const note of c.notes) {
                if (note.isInTuplet) {
                    note.tuplet.second.voice = newVoice
                }
            }
        }
    }
}

function sortVoices(chords: ChordMap, sigmap: TimeSigMap): void {
    // <voice, chords>
    const voiceChords = new StdMap<number, ChordIt[]>()
    let maxBarIndex = 0

    for (let it = chords.begin(); it !== chords.end(); it = it.next()) {
        const chord = it.second

        // some notes: if chord off time belongs to tuplet
        // then this tuplet belongs to the same bar as the chord off time;
        // same is for chord on time

        voiceChords.getOrInsert(chord.voice, () => []).push(it)
        const barIndex = findBarIndexForOffTime(maxNoteOffTime(chord.notes), sigmap)
        if (barIndex > maxBarIndex) {
            maxBarIndex = barIndex
        }

        if (it.next() === chords.end() || it.next().second.barIndex > maxBarIndex) {
            sortVoicesByPitch(voiceChords)
            voiceChords.clear()
        }
    }
}

export function separateVoices(tracks: TrackMap, sigmap: TimeSigMap): boolean {
    const opers = midiImportOperations
    let changed = false

    for (const track of tracks) {
        const mtrack = track.second
        if (mtrack.mtrack!.drumTrack()) {
            continue
        }
        const chords = track.second.chords
        if (chords.empty()) {
            continue
        }
        const userVoiceCount = toIntVoiceCount(
            opers.data().trackOpers.maxVoiceCount.value(mtrack.indexOfOperation))
        // pass current track index through MidiImportOperations
        // for further usage
        const setCurrentTrack = new CurrentTrackSetter(opers, mtrack.indexOfOperation)
        try {
            if (userVoiceCount > 1 && userVoiceCount <= voiceLimit()) {
                if (doVoiceSeparation(mtrack.chords, sigmap, mtrack.tuplets)) {
                    changed = true
                }
                sortVoices(mtrack.chords, sigmap)
            }
        } finally {
            setCurrentTrack.restore()
        }
    }

    return changed
}
