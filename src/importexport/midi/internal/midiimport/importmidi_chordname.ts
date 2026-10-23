/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_chordname.h/.cpp (namespace MidiChordName)
 */

// From XF Format Specifications V 2.01 (January 13, 1999, YAMAHA CORPORATION)

import { StdSet, type StdMultimap } from '../../../../framework/global/stdmap'
import { ME_META, META_SPECIFIC } from '../../../../engraving/compat/midi/midicoreevent'
import { Harmony } from '../../../../engraving/dom/harmony'
import { SegmentType } from '../../../../engraving/dom/segment'
import { VOICES } from '../../../../engraving/types/types'
import type { MidiEvent } from '../midishared/midievent'
import { ReducedFraction, compareReducedFractions } from './importmidi_fraction'
import type { MidiNote } from './importmidi_chord'
import type { MTrack, TrackMap } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'

function readFirstHalf(byte: number): number {
    return (byte >> 4) & 0xf
}

function readSecondHalf(byte: number): number {
    return byte & 0xf
}

function readChordRoot(byte: number): string {
    const inversions = ['bbb', 'bb', 'b', '', '#', '##', '###']
    const notes = ['', 'C', 'D', 'E', 'F', 'G', 'A', 'B']

    let chordRoot = ''

    const noteIndex = readSecondHalf(byte)
    if (noteIndex < notes.length) {
        chordRoot += notes[noteIndex]
    }

    const inversionIndex = readFirstHalf(byte)
    if (inversionIndex < inversions.length) {
        chordRoot += inversions[inversionIndex]
    }

    return chordRoot
}

const chordTypes: readonly string[] = [
    '', // Maj
    '6', // Maj6
    'Maj7',
    'Maj7#11', // Maj7(#11)
    'Maj9', // Maj(9)
    'Maj9', // Maj7(9)
    '6(9)', // Maj6(9)
    'aug',
    'm', // min
    'm6', // min6
    'm7', // min7
    'm7b5', // min7b5
    'm9', // min(9)
    'm9', // min7(9)
    'm7(11)', // min7(11)
    'mMaj7', // minMaj7
    'mMaj9', // minMaj7(9)
    'dim',
    'dim7',
    '7', // 7th
    '7sus4',
    '7b5',
    '9', // 7(9)
    '7#11', // 7(#11)
    '7(13)',
    '7b9', // 7(b9)
    '7b13', // 7(b13)
    '7#9', // 7(#9)
    'Maj7#5', // Maj7aug
    '7#5', // 7aug
    '', // 1+8
    '5', // 1+5
    'sus4',
    'sus2', // 1+2+5
    'N.C.', // cc
]

function readChordType(chordTypeIndex: number): string {
    if (chordTypeIndex < chordTypes.length) {
        return chordTypes[chordTypeIndex]
    }
    return ''
}

export function readChordName(e: MidiEvent): string {
    if (e.type() !== ME_META || e.metaType() !== META_SPECIFIC) {
        return ''
    }
    if (e.len() < 4) {
        return ''
    }

    const data = e.edata()
    if (data[0] !== 0x43 || data[1] !== 0x7B || data[2] !== 0x01) {
        return ''
    }

    let chordName = ''

    if (e.len() >= 4) {
        chordName += readChordRoot(data[3])
    }
    if (e.len() >= 5) {
        chordName += readChordType(data[4])
    }

    if (e.len() >= 6) {
        const chordRoot = readChordRoot(data[5])
        if (chordRoot.length > 0) {
            let chordType = ''
            if (e.len() >= 7) {
                chordType = readChordType(data[6])
            }
            if (chordRoot + chordType === chordName) {
                chordName += '/' + chordRoot
            } else {
                chordName += '/' + chordRoot + chordType
            }
        }
    }

    return chordName
}

function findChordName(notes: readonly MidiNote[], chordNames: StdMultimap<ReducedFraction, string>): string {
    for (const note of notes) {
        const [first, second] = chordNames.equalRange(note.origOnTime)
        if (second === first) {
            continue
        }
        // found chord names (usually only one)
        let chordName = ''
        for (let it = first; it !== second; it = it.next()) {
            if (it !== first) {
                chordName += '\n' + it.second
            } else {
                chordName += it.second
            }
        }
        return chordName
    }
    return ''
}

export function findChordNames(tracks: TrackMap): void {
    const data = midiImportOperations.data()

    for (const track of tracks) {
        for (const event of track.second.mtrack!.events()) {
            const e = event.event
            const chordName = readChordName(e)
            if (chordName.length > 0) {
                const time = ReducedFraction.fromTicks(event.tick)
                data.chordNames.insert(time, chordName)
            }
        }
    }
}

// all notes should be already placed to the score

export function setChordNames(tracks: MTrack[]): void {
    const data = midiImportOperations.data()
    if (data.chordNames.empty() || !data.trackOpers.showChordNames.value()) {
        return
    }

    // chords here can have on time very different from the original one
    // before quantization, so we look for original on times
    // that are stored in notes
    const usedTimes = new StdSet<ReducedFraction>(compareReducedFractions) // don't use one tick for chord name twice

    for (const track of tracks) {
        for (const chord of track.chords) {
            if (usedTimes.contains(chord.first)) {
                continue
            }

            const c = chord.second
            const chordName = findChordName(c.notes, data.chordNames)

            if (chordName.length === 0) {
                continue
            }

            const staff = track.staff!
            const score = staff.score()
            const onTime = chord.first
            usedTimes.insert(onTime)

            const measure = score.tick2measure(onTime.fraction())!
            const seg = measure.getSegment(SegmentType.ChordRest, onTime.fraction())
            const t = staff.idx() * VOICES

            const h = new Harmony(seg) // Factory::createHarmony(seg)
            h.setHarmony(chordName)
            h.setTrack(t)
            seg.add(h)
        }
    }
}
