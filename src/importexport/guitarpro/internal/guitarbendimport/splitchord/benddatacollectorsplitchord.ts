/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/splitchord/benddatacollectorsplitchord.h/.cpp
 * (only used with SPLIT_CHORD_DURATIONS, which MuseScore does not define)
 */

import type { Chord } from '../../../../../engraving/dom/chord'
import type { Note } from '../../../../../engraving/dom/note'
import { Fraction } from '../../../../../engraving/types/fraction'
import { PitchValue, type PitchValues } from '../../../../../engraving/types/pitchvalue'
import type { track_idx_t } from '../../../../../engraving/types/types'
import { BendInfoConverter } from '../bendinfoconverter'
import { BendChordData, BendNoteData, FractionMap, FractionSet, mapAt, type ImportedBendInfo } from '../guitarbendimporttypes'
import { BendChordDurationSplitter } from './bendchorddurationsplitter'
import { BendDataContextSplitChord } from './benddatacontextsplitchord'

export class BendDataCollectorSplitChord {
    private m_bendInfoForNote = new Map<track_idx_t, FractionMap<Map<Note, ImportedBendInfo>>>()

    storeBendData(note: Note, pitchValues: PitchValues): void {
        if (pitchValues.length) {
            mapAt(this.m_bendInfoForNote, note.track(), () => new FractionMap<Map<Note, ImportedBendInfo>>())
                .at(note.tick(), () => new Map()).set(note, BendInfoConverter.fillBendInfo(note, pitchValues))
        }
    }

    collectBendDataContext(): BendDataContextSplitChord {
        const bendDataCtx = new BendDataContextSplitChord()

        this.fillBendsDurations(bendDataCtx)
        this.fillBendData(bendDataCtx)

        return bendDataCtx
    }

    private fillBendData(bendDataCtx: BendDataContextSplitChord): void {
        for (const [, trackInfo] of this.m_bendInfoForNote) {
            for (const [, tickInfo] of trackInfo.entries()) {
                for (const [note, dataByNote] of tickInfo) {
                    const chord = note.chord()
                    const idx = chord.notes().indexOf(note)
                    fillBendDataForNote(bendDataCtx, dataByNote, idx)
                }
            }
        }
    }

    private fillBendsDurations(bendDataCtx: BendDataContextSplitChord): void {
        const tiedNotesAfterBend = new Map<track_idx_t, FractionMap<Chord[]>>()
        for (const [track, trackInfo] of this.m_bendInfoForNote) {
            for (const [mainTick, tickInfo] of trackInfo.entries()) {
                // now using the top note of chord to fill durations
                let currentNote: Note | null = tickInfo.keys().next().value!
                const currentTickTiedChords = mapAt(tiedNotesAfterBend, track, () => new FractionMap<Chord[]>()).at(mainTick, () => [])
                currentTickTiedChords.push(currentNote.chord())
                let tieFor = currentNote.tieFor()

                let deleteLastTiedChord = true
                while (tieFor) {
                    currentNote = tieFor.endNote()

                    if (!currentNote) {
                        console.error('invalid tie encountered while importing guitar bend')
                        break
                    }

                    if (trackInfo.has(currentNote.tick())) {
                        deleteLastTiedChord = false
                        mapAt(bendDataCtx.chordTicksForTieBack, track, () => new FractionSet()).insert(currentNote.tick())
                        break
                    }

                    currentTickTiedChords.push(currentNote.chord())
                    tieFor = currentNote.tieFor()
                }

                for (let i = 1; i < currentTickTiedChords.length; i++) {
                    if (i !== currentTickTiedChords.length - 1 || deleteLastTiedChord) {
                        mapAt(bendDataCtx.reduntantChordTicks, track, () => new FractionSet()).insert(currentTickTiedChords[i].tick())
                    }
                }
            }
        }

        const isPowerOfTwo = (n: number): boolean => n > 0 && (n & (n - 1)) === 0

        for (const [track, trackInfo] of tiedNotesAfterBend) {
            const importedInfoForTrack = this.m_bendInfoForNote.get(track)!
            for (const [mainTick, chords] of trackInfo.entries()) {
                const importedInfoForTick = importedInfoForTrack.get(mainTick)!
                const lastChord = chords[chords.length - 1]
                let totalDuration = lastChord.endTick().minus(mainTick)
                const tuplet = lastChord.tuplet()
                if (tuplet) {
                    totalDuration = totalDuration.times(tuplet.ratio())
                }

                totalDuration = totalDuration.reduced()
                if (!(!totalDuration.negative() && isPowerOfTwo(totalDuration.denominator()))) {
                    console.error(`bend import error: duration is wrong for track ${track}, tick ${mainTick.toString()}(${
                        totalDuration.numerator()} / ${totalDuration.denominator()})`)
                    continue
                }

                if (importedInfoForTick.size) {
                    fillChordDurationsFromBendDiagram(bendDataCtx, totalDuration, importedInfoForTick.values().next().value!)
                }
            }
        }

        for (const [track, trackInfo] of bendDataCtx.bendChordDurations) {
            const reduntant = bendDataCtx.reduntantChordTicks.get(track)
            if (!reduntant) {
                continue
            }

            for (const [mainTick, durations] of [...trackInfo].sort((a, b) => a[0] - b[0])) {
                let currentTick = Fraction.fromTicks(mainTick)
                reduntant.erase(currentTick)

                for (const duration of durations) {
                    currentTick = currentTick.plus(duration)
                    reduntant.erase(currentTick)
                }
            }
        }
    }
}

function fillBendDataForNote(bendDataCtx: BendDataContextSplitChord, importedInfo: ImportedBendInfo, noteIndexInChord: number): void {
    if (!importedInfo.segments.length) {
        return
    }

    const note = importedInfo.note!
    const chord = note.chord()
    const track = chord.track()

    const chordStartTick = chord.tick()
    const durations = bendDataCtx.bendChordDurations
    let ratio = new Fraction(1, 1)

    const tuplet = chord.tuplet()
    if (tuplet) {
        ratio = tuplet.ratio()
    }

    const trackDurations = durations.get(chord.track())
    if (!trackDurations) {
        console.error(`bend import error : no information about chord duration for track ${track}`)
        return
    }

    const tickDurations = trackDurations.get(chordStartTick.ticks())
    if (!tickDurations) {
        console.error(`bend import error : no information about chord duration for track ${track} tick ${chordStartTick.ticks()}`)
        return
    }

    if (!tickDurations.length) {
        console.error(`bend import error : chord durations are empty for track ${track} tick ${chordStartTick.ticks()}`)
        return
    }

    if (!(tickDurations.length > 1)) {
        console.error('not possible to split durations of chord')
        return
    }

    let currentTick = chordStartTick
    for (let i = 0; i < tickDurations.length - 1; i++) {
        if (i >= importedInfo.segments.length) {
            break
        }

        const tickDuration = tickDurations[i].div(ratio)

        const seg = importedInfo.segments[i]

        const bendChordData = mapAt(mapAt(bendDataCtx.bendDataByEndTick, note.track(), () => new Map<number, BendChordData>()),
            currentTick.plus(tickDuration).ticks(), () => new BendChordData())
        bendChordData.startTick = currentTick
        const bendNoteData = new BendNoteData()
        bendNoteData.quarterTones = Math.trunc(seg.endPitch / 25)
        bendChordData.noteDataByIdx.set(noteIndexInChord, bendNoteData)

        currentTick = currentTick.plus(tickDuration)
    }
}

function getMaxDenominatorForSplit(duration: Fraction): number {
    let denominator = 1

    while (new Fraction(1, denominator * 2).gt(duration)) {
        denominator *= 2
    }

    return denominator * 2
}

function splittedDurations(importedInfo: ImportedBendInfo, totalDuration: Fraction): Fraction[] {
    const bendSegments = importedInfo.segments

    const proportions: Fraction[] = []

    const maxDenominator = getMaxDenominatorForSplit(totalDuration.div(4))

    for (const seg of bendSegments) {
        if (seg.endTime !== seg.startTime) {
            const targetProportion = new Fraction(seg.endTime - seg.startTime, PitchValue.MAX_TIME).reduced()
            proportions.push(targetProportion)
        }
    }

    const proportionsSum = proportions.reduce((acc, f) => acc.plus(f), new Fraction(0, 1))

    if (proportionsSum.lt(new Fraction(1, 1))) {
        const lastProportion = new Fraction(1, 1).minus(proportionsSum)
        proportions.push(lastProportion)
    }

    return BendChordDurationSplitter.findValidNoteSplit(totalDuration, proportions, maxDenominator)
}

function splitBendChordDurations(bendDataCtx: BendDataContextSplitChord, totalDuration: Fraction, importedInfo: ImportedBendInfo): void {
    const chord = importedInfo.note!.chord()
    mapAt(bendDataCtx.bendChordDurations, chord.track(), () => new Map<number, Fraction[]>())
        .set(chord.tick().ticks(), splittedDurations(importedInfo, totalDuration))
}

function fillChordDurationsFromBendDiagram(bendDataCtx: BendDataContextSplitChord, totalDuration: Fraction,
    importedInfo: ImportedBendInfo): void {
    if (!importedInfo.segments.length) {
        return
    }

    const note = importedInfo.note
    if (!note) {
        console.error("couldn't fill chord durations: note is NULL")
        return
    }

    splitBendChordDurations(bendDataCtx, totalDuration, importedInfo)
}
