/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_drum.h/.cpp (namespace MidiDrum)
 */

import { StdMap } from '../../../../framework/global/stdmap'
import { smDrumset } from '../../../../engraving/dom/drumset'
import type { Staff } from '../../../../engraving/dom/staff'
import { BracketType } from '../../../../engraving/types/types'
import type { ChordIt, ChordMap, MidiNote } from './importmidi_chord'
import type { MTrack, TrackMap } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'

export function haveNonZeroVoices(chords: ChordMap): boolean {
    for (const chordEvent of chords) {
        if (chordEvent.second.voice !== 0) {
            return false
        }
    }
    return true
}

/** C++ splitChord(iterator& chordIt, ...): returns the new value of chordIt */
function splitChord(chordIt: ChordIt, notesToMove: Set<number>, chords: ChordMap): ChordIt {
    const chord = chordIt.second
    const notes = chord.notes

    if (notesToMove.size === notes.length) { // just move chord to another voice
        chord.voice = 1
    } else { // split chord
        const newChord = chord.clone()
        newChord.notes = []
        newChord.voice = 1
        const updatedOldNotes: MidiNote[] = []

        for (let i = 0; i !== notes.length; ++i) {
            if (notesToMove.has(i)) {
                newChord.notes.push(notes[i].clone())
            } else {
                updatedOldNotes.push(notes[i])
            }
        }
        chord.notes = updatedOldNotes

        chordIt = chords.insert(chordIt.first, newChord)
    }
    return chordIt
}

export function splitDrumVoices(tracks: TrackMap): void {
    for (const track of tracks) {
        const mtrack = track.second
        const chords = mtrack.chords
        if (chords.empty()) {
            continue
        }
        const drumset = mtrack.mtrack!.drumTrack() ? smDrumset() : null
        if (!drumset) {
            continue
        }
        // all chords of drum track should have voice == 0
        // because allowedVoices == V_1 (see MidiImportOperations)
        // also, all chords should have different onTime values
        for (let chordIt = chords.begin(); chordIt !== chords.end(); chordIt = chordIt.next()) {
            const notes = chordIt.second.notes
            // search for the drumset pitches with voice = 1
            const notesToMove = new Set<number>()
            for (let i = 0; i !== notes.length; ++i) {
                const pitch = notes[i].pitch
                if (drumset.isValid(pitch) && drumset.voice(pitch) === 1) {
                    notesToMove.add(i)
                }
            }
            if (notesToMove.size === 0) {
                continue
            }

            chordIt = splitChord(chordIt, notesToMove, chords)
        }
    }
}

function getNewTrack(newTracks: StdMap<number, MTrack>, drumTrack: MTrack, pitch: number): MTrack {
    let newTrackIt = newTracks.find(pitch)
    if (newTrackIt === newTracks.end()) {
        newTrackIt = newTracks.insert(pitch, drumTrack.clone())[0]
        const newTrack = newTrackIt.second
        // chords are copied and then cleared -
        // not very efficient way but it's more safe for possible
        // future additions of new fields in MTrack
        newTrack.chords.clear()
        newTrack.name = smDrumset().name(pitch)
    }
    return newTrackIt.second
}

function splitDrumTrack(drumTrack: MTrack): StdMap<number, MTrack> {
    const newTracks = new StdMap<number, MTrack>() // <percussion note pitch, track>
    if (drumTrack.chords.empty()) {
        return newTracks
    }

    for (const chordEvent of drumTrack.chords) {
        const onTime = chordEvent.first
        const chord = chordEvent.second

        for (const note of chord.notes) {
            const newChord = chord.clone()
            newChord.notes = []
            newChord.notes.push(note.clone())
            const newTrack = getNewTrack(newTracks, drumTrack, note.pitch)
            newTrack.chords.insert(onTime, newChord)
        }
    }

    return newTracks
}

export function splitDrumTracks(tracks: TrackMap): void {
    for (let it = tracks.begin(); it !== tracks.end(); it = it.next()) {
        if (!it.second.mtrack!.drumTrack() || it.second.chords.empty()) {
            continue
        }
        const opers = midiImportOperations.data().trackOpers
        if (!opers.doStaffSplit.value(it.second.indexOfOperation)) {
            continue
        }
        const newTracks = splitDrumTrack(it.second)
        const trackIndex = it.first
        it = tracks.erase(it)
        for (let i = newTracks.last(); i !== newTracks.end(); i = i.prev()) {
            it = tracks.insert(trackIndex, i.second.clone())
        }
    }
}

/** C++ setBracket(Staff*& staff, int& counter): returns the new [staff, counter] */
function setBracket(staff: Staff | null, counter: number): [Staff | null, number] {
    if (staff && counter > 1) {
        staff.setBracketType(0, BracketType.NORMAL)
        staff.setBracketSpan(0, counter)
    }
    if (counter) {
        counter = 0
    }
    if (staff) {
        staff = null
    }
    return [staff, counter]
}

export function setStaffBracketForDrums(tracks: MTrack[]): void {
    let counter = 0
    let firstDrumStaff: Staff | null = null
    let opIndex = -1

    for (const track of tracks) {
        if (track.mtrack!.drumTrack()) {
            if (opIndex !== track.indexOfOperation) {
                opIndex = track.indexOfOperation;
                [firstDrumStaff, counter] = setBracket(firstDrumStaff, counter)
                firstDrumStaff = track.staff
            }
            ++counter
        } else {
            [firstDrumStaff, counter] = setBracket(firstDrumStaff, counter)
        }
    }
    setBracket(firstDrumStaff, counter)
}
