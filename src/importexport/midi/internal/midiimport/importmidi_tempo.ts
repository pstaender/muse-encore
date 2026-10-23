/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tempo.h/.cpp (namespace MidiTempo)
 * The preference io/midi/roundTempo is read from midiImportConfiguration() (midiconfiguration.ts).
 */

import type { Score } from '../../../../engraving/dom/score'
import { TempoText } from '../../../../engraving/dom/tempotext'
import { Fraction } from '../../../../engraving/types/fraction'
import { Constants } from '../../../../engraving/types/constants'
import { ME_META, META_TEMPO } from '../../../../engraving/compat/midi/midicoreevent'
import { ReducedFraction, toMuseScoreTicks } from './importmidi_fraction'
import type { TrackMap } from './importmidi_inner'
import { midiImportOperations } from './importmidi_operations'
import { removeEvery2ndBeat } from './importmidi_beat'
import { midiImportConfiguration } from '../midiconfiguration'


/** qRound for positive and negative values (rounds half away from zero) */
function qRound(d: number): number {
    return d >= 0.0 ? Math.trunc(d + 0.5) : Math.trunc(d - 0.5)
}

export function time2Tick(time: number, ticksPerSec: number): ReducedFraction {
    return ReducedFraction.fromTicks(Math.trunc(ticksPerSec * time))
}

// tempo in beats per second

export function findBasicTempo(tracks: TrackMap, isHumanPerformance: boolean): number {
    for (const track of tracks) {
        // don't read tempo from tempo track for human performed files
        // because very often the tempo in such track is completely erroneous
        if (isHumanPerformance && track.second.chords.empty()) {
            continue
        }
        for (const ie of track.second.mtrack!.events()) {
            const e = ie.event
            if (e.type() === ME_META && e.metaType() === META_TEMPO) {
                const data = e.edata()
                const tempo = (data[2] + (data[1] << 8) + (data[0] << 16)) >>> 0
                return 1000000.0 / tempo
            }
        }
    }

    return 2 // default beats per second = 120 beats per minute
}

function setTempoToScore(score: Score, tick: number, beatsPerSecond: number, roundTempo: boolean): void {
    if (score.tempomap().has(tick)) {
        return
    }
    // don't repeat tempo, always set only tempo for tick 0
    if (tick > 0 && score.tempo(Fraction.fromTicks(tick)) === beatsPerSecond) {
        return
    }

    score.setTempo(Fraction.fromTicks(tick), beatsPerSecond)

    const data = midiImportOperations.data()
    if (data.trackOpers.showTempoText.value()) {
        const tempoInBpm = roundTempo ? qRound(beatsPerSecond * 60.0) : (beatsPerSecond * 60.0)

        const measure = score.tick2measure(Fraction.fromTicks(tick))
        if (!measure) {
            return
        }

        const segment = measure.getChordRestOrTimeTickSegment(Fraction.fromTicks(tick))

        const tempoText = new TempoText(segment) // Factory::createTempoText
        tempoText.setTempo(beatsPerSecond)
        tempoText.setXmlText(`<sym>metNoteQuarterUp</sym> = ${tempoInBpm}`)
        tempoText.setTrack(0)
        segment.add(tempoText)
        data.hasTempoText = true // to show tempo text column in the MIDI import panel
    }
}

function roundToBpm(beatsPerSecond: number): number {
    return qRound(beatsPerSecond * 60.0) / 60.0
}

function applyAllTempoEvents(tracks: TrackMap, score: Score, roundTempo: boolean): void {
    for (const track of tracks) {
        if (track.second.isDivisionInTps) { // ticks per second
            const ticksPerBeat = Constants.DIVISION
            const beatsPerSecond = roundTempo
                ? roundToBpm(track.second.division / ticksPerBeat)
                : (track.second.division / ticksPerBeat)
            setTempoToScore(score, 0, beatsPerSecond, roundTempo)
        } else { // beats per second
            for (const ie of track.second.mtrack!.events()) {
                const e = ie.event
                if (e.type() === ME_META && e.metaType() === META_TEMPO) {
                    const tick = toMuseScoreTicks(ie.tick, track.second.division, false)
                    const data = e.edata()
                    const tempo = (data[2] + (data[1] << 8) + (data[0] << 16)) >>> 0
                    const beatsPerSecond = roundTempo
                        ? roundToBpm(1000000.0 / tempo)
                        : (1000000.0 / tempo)
                    setTempoToScore(score, tick.ticks(), beatsPerSecond, roundTempo)
                }
            }
        }
    }
}

export function setTempo(tracks: TrackMap, score: Score): void {
    const roundTempo = midiImportConfiguration().roundTempo()

    score.tempomap().clear()
    const midiData = midiImportOperations.data()
    const beats = midiData.humanBeatData.beatSet.copy() // copy

    if (beats.empty()) {
        // it's most likely not a human performance;
        // we find all tempo events and set tempo changes to score
        applyAllTempoEvents(tracks, score, roundTempo)
    } else { // calculate and set tempo from adjusted beat locations
        if (midiData.trackOpers.measureCount2xLess.value()) {
            removeEvery2ndBeat(beats)
        }

        let averageTempoFactor = 0.0
        let counter = 0
        let it = beats.begin()
        let beatStart = it.first
        const newBeatLen = ReducedFraction.fromTicks(Constants.DIVISION)

        for (it = it.next(); it !== beats.end(); it = it.next()) {
            const beatEnd = it.first
            averageTempoFactor += newBeatLen.div(beatEnd.minus(beatStart)).toDouble()
            ++counter
            beatStart = beatEnd
        }
        averageTempoFactor /= counter

        const basicTempo = findBasicTempo(tracks, true)
        const tempo = roundTempo ? roundToBpm(basicTempo * averageTempoFactor)
            : (basicTempo * averageTempoFactor)

        score.tempomap().clear() // use only one tempo marking for all score
        setTempoToScore(score, 0, tempo, roundTempo)
    }

    if (score.tempomap().empty()) {
        score.tempomap().setTempo(0, 2.0) // default tempo
    }
}
