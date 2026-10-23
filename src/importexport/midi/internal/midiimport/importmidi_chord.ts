/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_chord.h/.cpp (namespace MChord)
 *
 * MidiNote and MidiChord are C++ value types: copies (`MidiChord c = it->second`) are clone() here.
 * std::multimap<ReducedFraction, MidiChord> is ChordMap (StdMultimap: its nodes are the C++ iterators).
 */

import { MapNode, StdMap, StdMultimap } from '../../../../framework/global/stdmap'
import type { Tie } from '../../../../engraving/dom/tie'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import type { TupletIt } from './importmidi_tuplet'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { Constants } from '../../../../engraving/types/constants'
import { GM1Program } from '../midishared/generalmidi'
import { MTrack, haveIntersection, type TrackMap } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'
import { findQuantizedChordOnTime } from './importmidi_quant'
import { removeEmptyTuplets } from './importmidi_tuplet'

export class MidiNote {
    pitch = 0
    velo = 0
    offTime = new ReducedFraction()
    tie: Tie | null = null
    staccato = false
    isInTuplet = false
    // for offTime quantization
    tuplet: TupletIt = null as unknown as TupletIt // C++ uninitialized iterator
    // for notation simplification - final quant value
    offTimeQuant = new ReducedFraction(-1, 1) // invalid by default
    // to assign lyrics
    origOnTime = new ReducedFraction()

    /** C++ copy */
    clone(): MidiNote {
        const n = new MidiNote()
        n.pitch = this.pitch
        n.velo = this.velo
        n.offTime = this.offTime
        n.tie = this.tie
        n.staccato = this.staccato
        n.isInTuplet = this.isInTuplet
        n.tuplet = this.tuplet
        n.offTimeQuant = this.offTimeQuant
        n.origOnTime = this.origOnTime
        return n
    }
}

export class MidiChord {
    voice = 0
    notes: MidiNote[] = []
    isInTuplet = false
    barIndex = -1
    // for onTime quantization
    tuplet: TupletIt = null as unknown as TupletIt // C++ uninitialized iterator

    isStaccato(): boolean {
        for (const note of this.notes) {
            if (note.staccato) {
                return true
            }
        }
        return false
    }

    /** C++ copy (the notes are copied) */
    clone(): MidiChord {
        const c = new MidiChord()
        c.voice = this.voice
        c.notes = this.notes.map(n => n.clone())
        c.isInTuplet = this.isInTuplet
        c.barIndex = this.barIndex
        c.tuplet = this.tuplet
        return c
    }
}

/** std::multimap<ReducedFraction, MidiChord> */
export type ChordMap = StdMultimap<ReducedFraction, MidiChord>
/** std::multimap<ReducedFraction, MidiChord>::iterator */
export type ChordIt = MapNode<ReducedFraction, MidiChord>
/** const std::pair<const ReducedFraction, MidiChord>& (a ChordIt or a temporary pair) */
export interface ChordPair {
    readonly first: ReducedFraction
    second: MidiChord
}

export function newChordMap(): ChordMap {
    return new StdMultimap<ReducedFraction, MidiChord>(compareReducedFractions)
}

/** a C++ copy of a chord map (the chords are copied) */
export function copyChordMap(chords: ChordMap): ChordMap {
    return chords.copy(c => c.clone())
}

// ---- MChord functions (importmidi_chord.cpp) below ----

const grandStaffPrograms: readonly GM1Program[] = [
    GM1Program.AcousticGrandPiano, GM1Program.BrightAcousticPiano,
    GM1Program.ElectricGrandPiano, GM1Program.HonkyTonkPiano,
    GM1Program.ElectricPiano1, GM1Program.ElectricPiano2,
    GM1Program.Harpsichord, GM1Program.Clavi,

    GM1Program.Celesta, GM1Program.MusicBox,
    GM1Program.Vibraphone, GM1Program.Marimba,
    GM1Program.Xylophone, GM1Program.Dulcimer,

    GM1Program.DrawbarOrgan, GM1Program.PercussiveOrgan,
    GM1Program.RockOrgan, GM1Program.ChurchOrgan,
    GM1Program.ReedOrgan, GM1Program.Accordion,
    GM1Program.TangoAccordion,

    GM1Program.OrchestralHarp,

    GM1Program.SynthStrings1, GM1Program.SynthStrings2,
    GM1Program.SynthVoice,

    GM1Program.SynthBrass1, GM1Program.SynthBrass2,

    GM1Program.Lead1Square, GM1Program.Lead2Sawtooth,
    GM1Program.Lead3Calliope, GM1Program.Lead4Chiff,
    GM1Program.Lead5Charang, GM1Program.Lead6Voice,
    GM1Program.Lead7Fifths, GM1Program.Lead8BassAndLead,

    GM1Program.Pad1NewAge, GM1Program.Pad2Warm,
    GM1Program.Pad3Polysynth, GM1Program.Pad4Choir,
    GM1Program.Pad5Bowed, GM1Program.Pad6Metallic,
    GM1Program.Pad7Halo, GM1Program.Pad8Sweep,

    GM1Program.FX1Rain, GM1Program.FX2Soundtrack,
    GM1Program.FX3Crystal, GM1Program.FX4Atmosphere,
    GM1Program.FX5Brightness, GM1Program.FX6Goblins,
    GM1Program.FX7Echoes, GM1Program.FX8SciFi,
]

export function isGrandStaffProgram(program: GM1Program): boolean {
    return grandStaffPrograms.includes(program)
}

/**
 * findFirstChordInRange(chords, startRangeTick, endRangeTick) and the template
 * findFirstChordInRange(startRangeTick, endRangeTick, startChordIt, endChordIt)
 */
export function findFirstChordInRange(chords: ChordMap, startRangeTick: ReducedFraction, endRangeTick: ReducedFraction): ChordIt
export function findFirstChordInRange<K, V>(startRangeTick: ReducedFraction, endRangeTick: ReducedFraction,
                                            startChordIt: MapNode<K, V>, endChordIt: MapNode<K, V>): MapNode<K, V>
export function findFirstChordInRange(a: ChordMap | ReducedFraction, b: ReducedFraction, c: unknown,
                                      d?: unknown): unknown {
    if (a instanceof ReducedFraction) {
        const startRangeTick = a
        const endRangeTick = b
        const endChordIt = d as MapNode<ReducedFraction, unknown>
        let it = c as MapNode<ReducedFraction, unknown>
        for (; it !== endChordIt; it = it.next()) {
            if (it.first.ge(startRangeTick)) {
                if (it.first.ge(endRangeTick)) {
                    it = endChordIt
                }
                break
            }
        }
        return it
    }
    const chords = a
    const endRangeTick = c as ReducedFraction
    let iter = chords.lowerBound(b)
    if (iter !== chords.end() && iter.first.ge(endRangeTick)) {
        iter = chords.end()
    }
    return iter
}

export function findEndChordInRange<K, V>(endRangeTick: ReducedFraction, startChordIt: MapNode<K, V>,
                                          endChordIt: MapNode<K, V>): MapNode<K, V> {
    let it = startChordIt
    for (; it !== endChordIt; it = it.next()) {
        if ((it.first as unknown as ReducedFraction).ge(endRangeTick)) {
            break
        }
    }
    return it
}

const s_minDuration = ReducedFraction.fromTicks(Constants.DIVISION).div(32)

export function minAllowedDuration(): ReducedFraction {
    return s_minDuration
}

export function minNoteOffTime(notes: readonly MidiNote[]): ReducedFraction {
    if (notes.length === 0) {
        return new ReducedFraction(0, 1)
    }
    let minOffTime = notes[0].offTime
    for (let i = 1; i < notes.length; ++i) {
        if (notes[i].offTime.lt(minOffTime)) {
            minOffTime = notes[i].offTime
        }
    }
    return minOffTime
}

export function maxNoteOffTime(notes: readonly MidiNote[]): ReducedFraction {
    let maxOffTime = new ReducedFraction(0, 1)
    for (const note of notes) {
        if (note.offTime.gt(maxOffTime)) {
            maxOffTime = note.offTime
        }
    }
    return maxOffTime
}

export function minNoteLen(chord: ChordPair): ReducedFraction {
    const minOffTime = minNoteOffTime(chord.second.notes)
    return minOffTime.minus(chord.first)
}

export function maxNoteLen(chord: ChordPair): ReducedFraction {
    const maxOffTime = maxNoteOffTime(chord.second.notes)
    return maxOffTime.minus(chord.first)
}

/** C++ removeOverlappingNotes(QList<MidiNote>&) (in place) */
function removeOverlappingNotesOfChord(notes: MidiNote[]): void {
    const tempNotes: MidiNote[] = notes.slice()

    for (let i1 = 0; i1 < tempNotes.length; ++i1) {
        const note1 = tempNotes[i1]
        for (let i2 = i1 + 1; i2 < tempNotes.length;) {
            if (tempNotes[i2].pitch === note1.pitch) {
                // overlapping notes found
                if (tempNotes[i2].offTime.gt(note1.offTime)) { // set max len before erase
                    note1.offTime = tempNotes[i2].offTime
                }
                tempNotes.splice(i2, 1)
                continue
            }
            ++i2
        }
    }
    notes.length = 0
    notes.push(...tempNotes)
}

// remove overlapping notes with the same pitch

/** removeOverlappingNotes(tracks) and the overload for the notes of a chord (QList<MidiNote>&) */
export function removeOverlappingNotes(tracks: TrackMap | MidiNote[]): void {
    if (Array.isArray(tracks)) {
        removeOverlappingNotesOfChord(tracks)
        return
    }
    for (const track of tracks) {
        const chords = track.second.chords
        if (chords.empty()) {
            continue
        }
        for (let i1 = chords.begin(); i1 !== chords.end();) {
            const onTime1 = i1.first
            const chord1 = i1.second
            removeOverlappingNotesOfChord(chord1.notes)

            for (let n1 = 0; n1 < chord1.notes.length;) {
                const note1 = chord1.notes[n1]

                for (let i2 = i1.next(); i2 !== chords.end(); i2 = i2.next()) {
                    const onTime2 = i2.first
                    if (onTime2.ge(note1.offTime)) {
                        break
                    }
                    const chord2 = i2.second
                    if (chord1.voice !== chord2.voice) {
                        continue
                    }
                    let found = false
                    for (const note2 of chord2.notes) {
                        if (note2.pitch !== note1.pitch) {
                            continue
                        }
                        // overlapping notes found
                        note1.offTime = onTime2
                        if (!note1.isInTuplet && chord2.isInTuplet) {
                            if (note1.offTime.gt(chord2.tuplet.second.onTime)) {
                                note1.isInTuplet = true
                                note1.tuplet = chord2.tuplet
                            }
                        } else if (note1.isInTuplet && !chord2.isInTuplet) {
                            note1.isInTuplet = false
                        }
                        // C++: i2 = std::prev(chords.end()); break; (ends the chord loop)
                        found = true
                        break
                    }
                    if (found) {
                        break
                    }
                }
                if (note1.offTime.minus(onTime1).lt(minAllowedDuration())) {
                    chord1.notes.splice(n1, 1)
                    continue
                }
                ++n1
            }
            if (chord1.notes.length === 0) {
                i1 = chords.erase(i1)
                continue
            }
            i1 = i1.next()
        }

        removeEmptyTuplets(track.second)
    }
}

// check for equal on time values with the same voice that is invalid
export function areOnTimeValuesDifferent(chords: ChordMap): boolean {
    const onTimeVoices = new StdMap<ReducedFraction, number>(compareReducedFractions)
    for (const chordEvent of chords) {
        const it = onTimeVoices.find(chordEvent.first)
        if (it === onTimeVoices.end()) {
            onTimeVoices.insert(chordEvent.first, chordEvent.second.voice)
        } else if (chordEvent.second.voice === it.second) {
            return false
        }
    }
    return true
}

export function areNotesLongEnough(chords: ChordMap): boolean {
    for (const chord of chords) {
        if (minNoteLen(chord).lt(minAllowedDuration())) {
            return false
        }
    }
    return true
}

export function areBarIndexesSuccessive(chords: ChordMap): boolean {
    let barIndex = 0
    for (const chord of chords) {
        const c = chord.second
        if (c.barIndex < 0) {
            return false
        }
        if (c.barIndex < barIndex) {
            return false
        }
        barIndex = c.barIndex
    }
    return true
}

/** isLastTickValid(lastTick, chords) and isLastTickValid(lastTick, tracks) */
export function isLastTickValid(lastTick: ReducedFraction, chordsOrTracks: ChordMap | TrackMap): boolean {
    for (const node of chordsOrTracks as StdMultimap<unknown, MidiChord | MTrack>) {
        const v = node.second
        if (v instanceof MTrack) {
            if (!isLastTickValid(lastTick, v.chords)) {
                return false
            }
        } else if (maxNoteOffTime(v.notes).gt(lastTick)) {
            return false
        }
    }
    return true
}

export function areBarIndexesSet(chords: ChordMap): boolean {
    for (const chord of chords) {
        if (chord.second.barIndex === -1) {
            return false
        }
    }
    return true
}

function hasNotesWithEqualPitch(chord1: MidiChord, chord2: MidiChord): boolean {
    const notes1 = new Set<number>()
    for (const note of chord1.notes) {
        notes1.add(note.pitch)
    }
    for (const note of chord2.notes) {
        if (notes1.has(note.pitch)) {
            return true
        }
    }
    return false
}

// based on quickthresh algorithm
//
// http://www.cycling74.com/docs/max5/refpages/max-ref/quickthresh.html
// (link date 9 July 2013)
//
// here are default values for audio, in milliseconds
// for midi there will be another values, in ticks

// all notes received in the left inlet within this time period are collected into a chord
// threshTime = 40 ms

// if there are any incoming values within this amount of time
// at the end of the base thresh time,
// the threshold is extended to allow more notes to be added to the chord
// fudgeTime = 10 ms

// this is an extension value of the base thresh time, which is used if notes arrive
// in the object's inlet in the "fudge" time zone
// threshExtTime = 20 ms

//     chord                             |<--fudge time-->|
// ------x-------------------------------|----------------|---------------------|------
//       |<-----------------thresh time------------------>|<--thresh ext time-->|
//
/** collectChords(tracks, ...) and collectChords(track, ...) */
export function collectChords(tracks: TrackMap | MTrack, humanTolCoeff: ReducedFraction,
                              nonHumanTolCoeff: ReducedFraction): void {
    if (!(tracks instanceof MTrack)) {
        for (const track of tracks) {
            collectChords(track.second, humanTolCoeff, nonHumanTolCoeff)
        }
        return
    }
    const track = tracks
    const chords = track.chords
    if (chords.empty()) {
        return
    }

    const opers = midiImportOperations.data().trackOpers
    const minAllowedDur = minAllowedDuration()

    const threshTime = (opers.isHumanPerformance.value())
        ? minAllowedDur.times(humanTolCoeff)
        : minAllowedDur.times(nonHumanTolCoeff)
    const fudgeTime = threshTime.div(4)
    const threshExtTime = threshTime.div(2)

    // invalidate
    let currentChordStart = new ReducedFraction(-1, 1)
    let curThreshTime = new ReducedFraction(-1, 1)
    // if note onTime goes after max chord offTime
    // then this is not a chord but arpeggio
    let maxOffTime = new ReducedFraction(-1, 1)
    const setToNegative = (): void => {
        currentChordStart = new ReducedFraction(-1, 1)
        curThreshTime = new ReducedFraction(-1, 1)
        maxOffTime = new ReducedFraction(-1, 1)
    }

    for (let it = chords.begin(); it !== chords.end();) {
        if (it.second.isInTuplet) {
            setToNegative()
            it = it.next()
            continue
        }

        const maxNoteOffTimeValue = maxNoteOffTime(it.second.notes)
        if (it.first.lt(currentChordStart.plus(curThreshTime))) {
            if (it.first.le(maxOffTime.minus(minAllowedDur))) {
                // add current note to the previous chord
                const chordAddTo = it.prev()
                if (it.second.voice !== chordAddTo.second.voice) {
                    setToNegative()
                    it = it.next()
                    continue
                }

                if (!hasNotesWithEqualPitch(chordAddTo.second, it.second)) {
                    for (const note of it.second.notes) {
                        chordAddTo.second.notes.push(note)
                    }
                    if (maxNoteOffTimeValue.gt(maxOffTime)) {
                        maxOffTime = maxNoteOffTimeValue
                    }
                }
                if (it.first.ge(currentChordStart.plus(curThreshTime).minus(fudgeTime))
                    && curThreshTime.eq(threshTime)) {
                    curThreshTime = curThreshTime.plus(threshExtTime)
                }

                it = chords.erase(it)
                continue
            }
        }

        currentChordStart = it.first
        maxOffTime = maxNoteOffTimeValue
        curThreshTime = threshTime
        it = it.next()
    }
}

export function sortNotesByPitch(chords: ChordMap): void {
    for (const chordEvent of chords) {
        // in each chord sort notes by pitches
        chordEvent.second.notes.sort((note1, note2) => note1.pitch - note2.pitch)
    }
}

export function sortNotesByLength(chords: ChordMap): void {
    for (const chordEvent of chords) {
        // in each chord sort notes by lengths
        chordEvent.second.notes.sort((note1, note2) => note1.offTime.compare(note2.offTime))
    }
}

// find notes of each chord that have different durations
// and separate them into different chords
// so all notes inside every chord will have equal lengths

export function splitUnequalChords(tracks: TrackMap): void {
    for (const track of tracks) {
        const newChordEvents: [ReducedFraction, MidiChord][] = []
        const chords = track.second.chords
        if (chords.empty()) {
            continue
        }
        sortNotesByLength(chords)
        for (const chordEvent of chords) {
            const chord = chordEvent.second
            const notes = chord.notes
            let offTime = new ReducedFraction()
            for (let it = 0; it < notes.length;) {
                if (it === 0) {
                    offTime = notes[it].offTime
                } else {
                    const newOffTime = notes[it].offTime
                    if (newOffTime.ne(offTime)) {
                        const newChord = chord.clone()
                        newChord.notes = []
                        for (let j = it; j > 0; --j) {
                            newChord.notes.push(notes[j - 1].clone())
                        }
                        newChordEvents.push([chordEvent.first, newChord])
                        notes.splice(0, it)
                        it = 0
                        continue
                    }
                }
                ++it
            }
        }
        for (const event of newChordEvents) {
            chords.insert(event[0], event[1])
        }
    }
}

export function findMinDuration(onTime: ReducedFraction, midiChords: readonly MidiChord[],
                                length: ReducedFraction): ReducedFraction {
    let len = length
    for (const chord of midiChords) {
        for (const note of chord.notes) {
            if ((note.offTime.minus(onTime).lt(len))
                && (note.offTime.minus(onTime).ne(new ReducedFraction(0, 1)))) {
                len = note.offTime.minus(onTime)
            }
        }
    }
    return len
}

export function mergeChordsWithEqualOnTimeAndVoice(tracks: TrackMap): void {
    for (const track of tracks) {
        const chords = track.second.chords
        if (chords.empty()) {
            continue
        }
        // the key is pair<onTime, voice>
        const onTimes = new StdMap<[ReducedFraction, number], ChordIt>((a, b) => {
            const c = a[0].compare(b[0])
            return c !== 0 ? c : a[1] - b[1]
        })

        for (let it = chords.begin(); it !== chords.end();) {
            const onTime = it.first
            const voice = it.second.voice
            const fit = onTimes.find([onTime, voice])
            if (fit === onTimes.end()) {
                onTimes.insert([onTime, voice], it)
            } else {
                const oldNotes = fit.second.second.notes
                const newNotes = it.second.notes
                oldNotes.push(...newNotes)
                it = chords.erase(it)
                continue
            }
            it = it.next()
        }
    }
}

/** chordAveragePitch(notes, beg, end) and chordAveragePitch(notes) */
export function chordAveragePitch(notes: readonly MidiNote[], beg = 0, end = notes.length): number {
    let sum = 0
    for (let i = beg; i !== end; ++i) {
        sum += notes[i].pitch
    }
    return qRound(sum * 1.0 / (end - beg))
}

/** Qt qRound (half away from zero) */
function qRound(d: number): number {
    return d >= 0.0 ? Math.trunc(d + 0.5) : Math.trunc(d - 0.5)
}

// it's an optimization function: we can don't check chords
// with (on time + max chord len) < given time moment
// because chord cannot be longer than found max length

export function findMaxChordLength(chords: ChordMap): ReducedFraction {
    let maxChordLength = new ReducedFraction()

    for (const chord of chords) {
        const offTime = maxNoteOffTime(chord.second.notes)
        if (offTime.minus(chord.first).gt(maxChordLength)) {
            maxChordLength = offTime.minus(chord.first)
        }
    }
    return maxChordLength
}

export function findChordsForTimeRange(voice: number, onTime: ReducedFraction, offTime: ReducedFraction,
                                       chords: ChordMap, maxChordLength: ReducedFraction): ChordIt[] {
    const result: ChordIt[] = []

    if (chords.empty()) {
        return result
    }

    let it = chords.lowerBound(offTime)
    if (it === chords.begin()) {
        return result
    }
    it = it.prev()

    while (it.first.plus(maxChordLength).gt(onTime)) {
        const chord = it.second
        if (chord.voice === voice) {
            const chordInterval: [ReducedFraction, ReducedFraction] = [it.first, maxNoteOffTime(chord.notes)]
            const durationInterval: [ReducedFraction, ReducedFraction] = [onTime, offTime]

            if (haveIntersection(chordInterval, durationInterval)) {
                result.push(it)
            }
        }
        if (it === chords.begin()) {
            break
        }
        it = it.prev()
    }

    return result
}

export function setBarIndexes(chords: ChordMap, basicQuant: ReducedFraction, lastTick: ReducedFraction,
                              sigmap: TimeSigMap): void {
    if (chords.empty()) {
        return
    }
    let it = chords.begin()
    for (let barIndex = 0; ; ++barIndex) { // iterate over all measures by indexes
        const endBarTick = ReducedFraction.fromTicks(sigmap.bar2tick(barIndex + 1, 0))
        if (endBarTick.le(it.first)) {
            continue
        }
        for (; it !== chords.end(); it = it.next()) {
            const onTime = findQuantizedChordOnTime(it, basicQuant)
            if (onTime.lt(endBarTick)) {
                it.second.barIndex = barIndex
                continue
            }
            break
        }
        if (it === chords.end() || endBarTick.gt(lastTick)) {
            break
        }
    }
}
