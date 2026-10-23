/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_lrhand.h/.cpp (namespace LRHand)
 */

import type { MapNode } from '../../../../framework/global/stdmap'
import type { GM1Program } from '../midishared/generalmidi'
import { ReducedFraction } from './importmidi_fraction'
import {
    type ChordIt, type ChordMap, type MidiNote, isGrandStaffProgram, maxNoteOffTime, newChordMap, sortNotesByPitch,
} from './importmidi_chord'
import type { MTrack, TrackMap } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'

const INT_MAX = 2147483647

export function needToSplit(chords: ChordMap, midiProgram: GM1Program, isDrumTrack: boolean): boolean {
    if (isDrumTrack || !isGrandStaffProgram(midiProgram)) {
        return false
    }

    const octave = 12
    for (const chord of chords) {
        const c = chord.second
        let minPitch = INT_MAX
        let maxPitch = 0
        for (const note of c.notes) {
            if (note.pitch < minPitch) {
                minPitch = note.pitch
            }
            if (note.pitch > maxPitch) {
                maxPitch = note.pitch
            }
        }
        if (maxPitch - minPitch > octave) {
            return true
        }
    }

    return false
}

class SplitTry {
    penalty = 0
    // split point - note index, such that: LOW part = [0, split point)
    // and HIGH part = [split point, size)
    // if split point = size then the chord is assigned to the left hand
    prevSplitPoint = -1
}

interface ChordSplitData {
    chord: ChordIt
    possibleSplits: SplitTry[] // each index corresponds to the same note index
}

function findLastSplitPoint(splits: readonly ChordSplitData[]): number {
    let splitPoint = -1
    let minPenalty = INT_MAX
    const possibleSplits = splits[splits.length - 1].possibleSplits

    for (let i = 0; i !== possibleSplits.length; ++i) {
        if (possibleSplits[i].penalty < minPenalty) {
            minPenalty = possibleSplits[i].penalty
            splitPoint = i
        }
    }

    return splitPoint
}

// backward dynamic programming step - collect optimal voice separations

function splitChords(splits: readonly ChordSplitData[], leftHandChords: ChordMap, chords: ChordMap): void {
    let splitPoint = findLastSplitPoint(splits)

    for (let pos = splits.length - 1; ; --pos) {
        const oldChord = splits[pos].chord.second
        const newChord = oldChord.clone()

        if (splitPoint > 0 && splitPoint < oldChord.notes.length) {
            const oldNotes = oldChord.notes

            oldChord.notes = []
            for (let i = splitPoint; i !== oldNotes.length; ++i) {
                oldChord.notes.push(oldNotes[i])
            }

            newChord.notes = []
            for (let i = 0; i !== splitPoint; ++i) {
                newChord.notes.push(oldNotes[i].clone())
            }

            leftHandChords.insert(splits[pos].chord.first, newChord)
        } else if (splitPoint === oldChord.notes.length) {
            leftHandChords.insert(splits[pos].chord.first, newChord)
            chords.erase(splits[pos].chord)
        }

        if (pos === 0) {
            break
        }
        splitPoint = splits[pos].possibleSplits[splitPoint].prevSplitPoint
    }
}

function findPitchWidthPenalty(notes: readonly MidiNote[], splitPoint: number): number {
    const octave = 12
    const maxPitchWidth = octave + 2
    let penalty = 0

    if (splitPoint > 0) {
        const lowPitchWidth = Math.abs(notes[0].pitch - notes[splitPoint - 1].pitch)
        if (lowPitchWidth <= octave) {
            penalty += 0
        } else if (lowPitchWidth <= maxPitchWidth) {
            penalty += 20
        } else {
            penalty += 100
        }
    }

    if (splitPoint < notes.length) {
        const highPitchWidth = Math.abs(notes[splitPoint].pitch - notes[notes.length - 1].pitch)
        if (highPitchWidth <= octave) {
            penalty += 0
        } else if (highPitchWidth <= maxPitchWidth) {
            penalty += 20
        } else {
            penalty += 100
        }
    }

    return penalty
}

function isOctave(notes: readonly MidiNote[], beg: number, end: number): boolean {
    const octave = 12
    return end - beg === 2 && notes[end - 1].pitch - notes[beg].pitch === octave
}

function findSimilarityPenalty(notes: readonly MidiNote[], prevNotes: readonly MidiNote[],
                               splitPoint: number, prevSplitPoint: number): number {
    let penalty = 0
    // check for octaves and accompaniment
    if (splitPoint > 0 && prevSplitPoint > 0) {
        const isLowOctave = isOctave(notes, 0, splitPoint)
        const isPrevLowOctave = isOctave(prevNotes, 0, prevSplitPoint)

        if (isLowOctave && isPrevLowOctave) { // octaves
            penalty -= 12
        } else if (splitPoint > 1 && prevSplitPoint > 1) { // accompaniment
            penalty -= 5
        }
    }
    if (splitPoint < notes.length && prevSplitPoint < prevNotes.length) {
        const isHighOctave = isOctave(notes, splitPoint, notes.length)
        const isPrevHighOctave = isOctave(prevNotes, prevSplitPoint, prevNotes.length)

        if (isHighOctave && isPrevHighOctave) {
            penalty -= 12
        } else if (notes.length - splitPoint > 1 && prevNotes.length - prevSplitPoint > 1) {
            penalty -= 5
        }
    }
    // check for one-note melody
    if (splitPoint - 0 === 1 && prevSplitPoint - 0 === 1) {
        penalty -= 12
    }
    if (notes.length - splitPoint === 1 && prevNotes.length - prevSplitPoint === 1) {
        penalty -= 12
    }

    return penalty
}

function areOffTimesEqual(notes: readonly MidiNote[], beg: number, end: number): boolean {
    let areEqual = true
    const firstOffTime = notes[beg].offTime
    for (let i = beg + 1; i < end; ++i) {
        if (notes[i].offTime.ne(firstOffTime)) {
            areEqual = false
            break
        }
    }
    return areEqual
}

function findDurationPenalty(notes: readonly MidiNote[], splitPoint: number): number {
    let penalty = 0
    if (splitPoint > 0 && areOffTimesEqual(notes, 0, splitPoint)) {
        penalty -= 10
    }
    if (splitPoint < notes.length && areOffTimesEqual(notes, splitPoint, notes.length)) {
        penalty -= 10
    }
    return penalty
}

function findNoteCountPenalty(notes: readonly MidiNote[], splitPoint: number): number {
    const leftHandCount = splitPoint
    const rightHandCount = notes.length - splitPoint
    if (rightHandCount > 0 && leftHandCount > 0 && leftHandCount < rightHandCount) {
        return 5
    }
    if (rightHandCount === 0 && leftHandCount > 1) {
        return 10
    }
    return 0
}

function findIntersectionPenalty(
    currentOnTime: ReducedFraction,
    prevPos: number,
    prevSplitPoint: number,
    maxChordLen: ReducedFraction,
    splits: readonly ChordSplitData[],
    hasLowNotes: boolean,
    hasHighNotes: boolean,
): number {
    let penalty = 0
    let pos = prevPos
    let splitPoint = prevSplitPoint

    while (splits[pos].chord.first.plus(maxChordLen).gt(currentOnTime)) {
        const chord = splits[pos].chord.second

        if (hasLowNotes) {
            let maxOffTime = new ReducedFraction()
            for (let i = 0; i !== splitPoint; ++i) {
                if (chord.notes[i].offTime.gt(maxOffTime)) {
                    maxOffTime = chord.notes[i].offTime
                }
            }
            if (maxOffTime.gt(currentOnTime)) {
                penalty += 10
            }
        }
        if (hasHighNotes) {
            let maxOffTime = new ReducedFraction()
            for (let i = splitPoint; i !== chord.notes.length; ++i) {
                if (chord.notes[i].offTime.gt(maxOffTime)) {
                    maxOffTime = chord.notes[i].offTime
                }
            }
            if (maxOffTime.gt(currentOnTime)) {
                penalty += 10
            }
        }

        if (pos === 0) {
            break
        }
        const splitTry = splits[pos].possibleSplits[splitPoint]
        splitPoint = splitTry.prevSplitPoint
        --pos
    }

    return penalty
}

function findSplits(chords: ChordMap): ChordSplitData[] {
    const splits: ChordSplitData[] = []
    let pos = 0
    let maxChordLen = new ReducedFraction()

    for (let it = chords.begin(); it !== chords.end(); it = it.next()) {
        const notes = it.second.notes
        const len = maxNoteOffTime(notes).minus(it.first)
        if (len.gt(maxChordLen)) {
            maxChordLen = len
        }

        const split: ChordSplitData = { chord: it, possibleSplits: [] }

        for (let splitPoint = 0; splitPoint <= notes.length; ++splitPoint) {
            const splitTry = new SplitTry()
            splitTry.penalty = findPitchWidthPenalty(notes, splitPoint)
                + findDurationPenalty(notes, splitPoint)
                + findNoteCountPenalty(notes, splitPoint)

            if (pos > 0) {
                let bestPrevSplitPoint = -1
                let minPenalty = INT_MAX
                const prevNotes = it.prev().second.notes

                for (let prevSplitPoint = 0; prevSplitPoint <= prevNotes.length; ++prevSplitPoint) {
                    const prevPenalty
                        = splits[pos - 1].possibleSplits[prevSplitPoint].penalty
                        + findSimilarityPenalty(notes, prevNotes, splitPoint, prevSplitPoint)
                        + findIntersectionPenalty(
                            it.first, pos - 1, prevSplitPoint,
                            maxChordLen, splits,
                            splitPoint > 0, splitPoint < notes.length)

                    if (prevPenalty < minPenalty) {
                        minPenalty = prevPenalty
                        bestPrevSplitPoint = prevSplitPoint
                    }
                }

                splitTry.penalty += minPenalty
                splitTry.prevSplitPoint = bestPrevSplitPoint
            }

            split.possibleSplits.push(splitTry)
        }
        splits.push(split)

        ++pos
    }

    return splits
}

/** C++ insertNewLeftHandTrack(tracks, iterator& it, ...): returns the new value of it */
function insertNewLeftHandTrack(tracks: TrackMap, it: MapNode<number, MTrack>,
                                leftHandChords: ChordMap): MapNode<number, MTrack> {
    const leftHandTrack = it.second.clone()
    leftHandTrack.chords = leftHandChords
    return tracks.insert(it.first, leftHandTrack.clone())
}

// maybe todo later: if range of right-hand chords > OCTAVE
// => assign all bottom right-hand chords to another, third track

/** C++ splitStaff(tracks, iterator& it): returns the new value of it */
function splitStaff(tracks: TrackMap, it: MapNode<number, MTrack>): MapNode<number, MTrack> {
    const chords = it.second.chords
    if (chords.empty()) {
        return it
    }
    sortNotesByPitch(chords)
    const splits = findSplits(chords)

    const leftHandChords = newChordMap()
    splitChords(splits, leftHandChords, chords)

    if (!leftHandChords.empty()) {
        it = insertNewLeftHandTrack(tracks, it, leftHandChords)
    }
    return it
}

export function splitIntoLeftRightHands(tracks: TrackMap): void {
    for (let it = tracks.begin(); it !== tracks.end(); it = it.next()) {
        if (it.second.mtrack!.drumTrack() || it.second.chords.empty()) {
            continue
        }
        const opers = midiImportOperations.data().trackOpers
        // iterator 'it' will change after track split to ++it
        // C++11 guarantees that newly inserted item with equal key will go after:
        //    "The relative ordering of elements with equivalent keys is preserved,
        //     and newly inserted elements follow those with equivalent keys
        //     already in the container"
        if (opers.doStaffSplit.value(it.second.indexOfOperation)) {
            it = splitStaff(tracks, it)
        }
    }
}
