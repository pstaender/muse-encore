/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_simplify.h/.cpp (namespace Simplify)
 */

import { Constants } from '../../../../engraving/types/constants'
import { DurationType } from '../../../../engraving/types/types'
import type { TDuration } from '../../../../engraving/dom/durationtype'
import type { TimeSigMap } from '../../../../engraving/dom/sig'
import { ReducedFraction } from './importmidi_fraction'
import type { ChordIt, ChordMap, MidiNote } from './importmidi_chord'
import type { TupletMap } from './importmidi_tuplet'
import { findTupletsInBarForDuration, removeEmptyTuplets } from './importmidi_tuplet'
import { type TrackMap, durationCount, findBarStart } from './importmidi_inner'
import { DurationType as MeterDurationType, beatLength, toDurationList } from './importmidi_meter'
import { quantizeToLarge } from './importmidi_quant'
import { CurrentTrackSetter, midiImportOperations } from './importmidi_operations'

function hasComplexBeamedDurations(list: readonly [ReducedFraction, TDuration][]): boolean {
    for (const d of list) {
        const t = d[1].type()
        if (t === DurationType.V_16TH
            || t === DurationType.V_32ND
            || t === DurationType.V_64TH
            || t === DurationType.V_128TH
            || t === DurationType.V_256TH
            || t === DurationType.V_512TH
            || t === DurationType.V_1024TH) {
            return true
        }
    }
    return false
}

function lengthenNote(
    note: MidiNote,
    voice: number,
    noteOnTime: ReducedFraction,
    durationStart: ReducedFraction,
    endTime: ReducedFraction,
    barStart: ReducedFraction,
    barFraction: ReducedFraction,
    tuplets: TupletMap,
    isDrumTrack: boolean,
): void {
    if (endTime.le(note.offTime)) {
        return
    }

    const opers = midiImportOperations.data().trackOpers
    const currentTrack = midiImportOperations.currentTrack()

    const useDots = opers.useDots.value(currentTrack)
    const tupletsForDuration = findTupletsInBarForDuration(
        voice, barStart, note.offTime, endTime.minus(note.offTime), tuplets)

    const origNoteDurations = toDurationList(
        durationStart.minus(barStart), note.offTime.minus(barStart), barFraction,
        tupletsForDuration, MeterDurationType.NOTE, useDots, false)

    const origRestDurations = toDurationList(
        note.offTime.minus(barStart), endTime.minus(barStart), barFraction,
        tupletsForDuration, MeterDurationType.REST, useDots, false)

    // double - because can be + 0.5 for dots
    let minNoteDurationCount = durationCount(origNoteDurations)
    let minRestDurationCount = durationCount(origRestDurations)

    let bestOffTime = new ReducedFraction(-1, 1)

    for (let offTime = note.offTime.plus(note.offTimeQuant);
        offTime.le(endTime); offTime = offTime.plus(note.offTimeQuant)) {
        let noteDurationCount = 0
        let restDurationCount = 0

        const noteDurations = toDurationList(
            durationStart.minus(barStart), offTime.minus(barStart), barFraction,
            tupletsForDuration, MeterDurationType.NOTE, useDots, false)

        noteDurationCount += durationCount(noteDurations)

        if (offTime.lt(endTime)) {
            const restDurations = toDurationList(
                offTime.minus(barStart), endTime.minus(barStart), barFraction,
                tupletsForDuration, MeterDurationType.REST, useDots, false)

            restDurationCount += durationCount(restDurations)
        }

        if (noteDurationCount + restDurationCount
            < minNoteDurationCount + minRestDurationCount) {
            if (opers.isHumanPerformance.value()
                || isDrumTrack
                || noteDurationCount <= 1.5) {
                minNoteDurationCount = noteDurationCount
                minRestDurationCount = restDurationCount
                bestOffTime = offTime
            }
        }
    }

    if (bestOffTime.eq(new ReducedFraction(-1, 1))) {
        return
    }

    // check for staccato:
    //    don't apply staccato if note is tied
    //    (case noteOnTime != durationStart - another bar, for example)

    let hasLossOfAccuracy = false
    if (!isDrumTrack) {
        const addedPart = bestOffTime.minus(note.offTime).div(bestOffTime.minus(durationStart)).toDouble()
        const STACCATO_TOL = 0.3

        if (addedPart >= STACCATO_TOL) {
            if (noteOnTime.eq(durationStart) && minNoteDurationCount <= 1.5) {
                note.staccato = true
            } else {
                hasLossOfAccuracy = true
            }
        }
    }

    // if the difference is only in one note/rest and there is some loss of accuracy -
    // discard change because it silently reduces duration accuracy
    // without significant improvement of readability

    if (!isDrumTrack
        && !opers.isHumanPerformance.value()
        && hasLossOfAccuracy
        && (origNoteDurations.length + origRestDurations.length)
        - (minNoteDurationCount + minRestDurationCount) <= 1
        && !hasComplexBeamedDurations(origNoteDurations)
        && !hasComplexBeamedDurations(origRestDurations)) {
        return
    }

    note.offTime = bestOffTime
}

// for drum tracks note duration can be arbitrary
// so start with short duration to check different cases,
// to find the most simple one

function shortenDrumNote(note: MidiNote, it: ChordIt, chords: ChordMap): void {
    if (it.second.isInTuplet) { // if note on time is in tuplet -
        // set note off time to be inside that tuplet
        const tuplet = it.second.tuplet.second
        const len = tuplet.len.div(tuplet.tupletNumber)
        const newOffTime = ReducedFraction.min(it.first.plus(len), tuplet.onTime.plus(tuplet.len))
        if (note.offTime.gt(newOffTime)) {
            note.offTime = newOffTime
            note.isInTuplet = true
            note.tuplet = it.second.tuplet
            note.offTimeQuant = len
        }
    } else { // if note on time is outside tuplets -
        // set note off time to be outside all tuplets
        let next = it.next()
        while (next !== chords.end() && next.second.voice !== it.second.voice) {
            next = next.next()
        }
        if (next !== chords.end()) {
            const len = ReducedFraction.fromTicks(Constants.DIVISION).div(8) // 1/32
            let newOffTime = it.first.plus(len)
            if (next.second.isInTuplet) {
                const tuplet = next.second.tuplet.second
                if (tuplet.onTime.lt(newOffTime)) {
                    newOffTime = tuplet.onTime
                }
            }
            if (newOffTime.lt(note.offTime)) {
                note.offTime = newOffTime
                note.isInTuplet = false
                note.offTimeQuant = len
            }
        }
    }
}

function minimizeNumberOfRests(chords: ChordMap, sigmap: TimeSigMap, tuplets: TupletMap, isDrumTrack: boolean): void {
    for (let it = chords.begin(); it !== chords.end(); it = it.next()) {
        for (const note of it.second.notes) {
            if (isDrumTrack) {
                shortenDrumNote(note, it, chords)
            }

            const barStart = findBarStart(note.offTime, sigmap)
            const barFraction = ReducedFraction.fromFraction(sigmap.timesig(barStart.ticks()).timesig())
            let durationStart = it.first.gt(barStart) ? it.first : barStart

            if (it.second.isInTuplet) {
                const tuplet = it.second.tuplet.second
                if (note.offTime.ge(tuplet.onTime.plus(tuplet.len))) {
                    durationStart = tuplet.onTime.plus(tuplet.len)
                }
            }
            let endTime = barStart.eq(note.offTime) ? barStart : barStart.plus(barFraction)
            if (note.isInTuplet) {
                const tuplet = note.tuplet.second
                if (note.offTime.eq(tuplet.onTime.plus(tuplet.len))) {
                    continue
                }
                if (isDrumTrack) {
                    endTime = tuplet.onTime.plus(tuplet.len)
                } else {
                    endTime = barStart.plus(quantizeToLarge(
                        note.offTime.minus(barStart), tuplet.len.div(tuplet.tupletNumber)))
                }
            }

            const beatLen = beatLength(barFraction)
            const beatTime = barStart.plus(quantizeToLarge(note.offTime.minus(barStart), beatLen))
            if (endTime.gt(beatTime)) {
                endTime = beatTime
            }

            let next = it.next()
            while (next !== chords.end()
                   && (next.second.voice !== it.second.voice
                       || next.first.lt(note.offTime))) {
                next = next.next()
            }
            if (next !== chords.end()) {
                if (next.first.lt(endTime)) {
                    endTime = next.first
                }
                if (next.second.isInTuplet && !note.isInTuplet) {
                    const tuplet = next.second.tuplet.second
                    if (tuplet.onTime.lt(endTime)) {
                        endTime = tuplet.onTime
                    }
                }
            }

            lengthenNote(note, it.second.voice, it.first, durationStart, endTime,
                         barStart, barFraction, tuplets, isDrumTrack)
        }
    }
}

function simplifyDurations(tracks: TrackMap, sigmap: TimeSigMap, simplifyDrumTracks: boolean): void {
    const opers = midiImportOperations

    for (const track of tracks) {
        const mtrack = track.second
        if (mtrack.mtrack!.drumTrack() !== simplifyDrumTracks) {
            continue
        }
        const chords = track.second.chords
        if (chords.empty()) {
            continue
        }

        if (opers.data().trackOpers.simplifyDurations.value(mtrack.indexOfOperation)) {
            const setCurrentTrack = new CurrentTrackSetter(opers, mtrack.indexOfOperation)
            try {
                minimizeNumberOfRests(chords, sigmap, mtrack.tuplets, mtrack.mtrack!.drumTrack())
                // empty tuplets may appear after simplification
                removeEmptyTuplets(mtrack)
            } finally {
                setCurrentTrack.restore()
            }
        }
    }
}

export function simplifyDurationsForDrums(tracks: TrackMap, sigmap: TimeSigMap): void {
    simplifyDurations(tracks, sigmap, true)
}

export function simplifyDurationsNotDrums(tracks: TrackMap, sigmap: TimeSigMap): void {
    simplifyDurations(tracks, sigmap, false)
}
