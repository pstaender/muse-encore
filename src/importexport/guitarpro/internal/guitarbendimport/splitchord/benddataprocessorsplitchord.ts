/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/splitchord/benddataprocessorsplitchord.h/.cpp
 * (only used with SPLIT_CHORD_DURATIONS, which MuseScore does not define)
 */

import { scoreDummy } from '../../../../../engraving/compat/dummyelement'
import type { Chord } from '../../../../../engraving/dom/chord'
import { TDuration } from '../../../../../engraving/dom/durationtype'
import { Factory } from '../../../../../engraving/dom/factory'
import type { Note } from '../../../../../engraving/dom/note'
import type { Score } from '../../../../../engraving/dom/score'
import { SegmentType } from '../../../../../engraving/dom/segment'
import type { Tie } from '../../../../../engraving/dom/tie'
import { Fraction } from '../../../../../engraving/types/fraction'
import { ElementType, GuitarBendType } from '../../../../../engraving/types/types'
import type { BendDataContextSplitChord } from './benddatacontextsplitchord'

export class BendDataProcessorSplitChord {
    private m_score: Score

    constructor(score: Score) {
        this.m_score = score
    }

    processBends(bendDataCtx: BendDataContextSplitChord): void {
        createSplitDurationBends(bendDataCtx, this.m_score)
        removeReduntantChords(bendDataCtx, this.m_score)
    }
}

function createSplitDurationBends(bendDataCtx: BendDataContextSplitChord, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.bendChordDurations) {
        for (const [mainTick, chordsDurations] of [...trackInfo].sort((a, b) => a[0] - b[0])) {
            if (!chordsDurations.length) {
                console.error(`bend import error : no chord duration data for track ${track}, tick ${mainTick}`)
                continue
            }

            const mainTickFr = Fraction.fromTicks(mainTick)
            const mainChordMeasure = score.tick2measure(mainTickFr)

            if (!mainChordMeasure) {
                console.error(`bend import error : no valid measure for track ${track}, tick ${mainTick}`)
                return
            }

            const mainChord = mainChordMeasure.findChord(mainTickFr, track)
            if (!mainChord) {
                console.error(`bend import error : no valid chord for track ${track}, tick ${mainTick}`)
                return
            }

            const newMainChordDuration = chordsDurations[0]
            mainChord.setTicks(newMainChordDuration)
            mainChord.setDurationType(new TDuration(newMainChordDuration))
            let currentTick = mainChord.tick().plus(mainChord.ticks())
            let currentActualTick = mainChord.endTick()
            createSplitDurationBendsForChord(bendDataCtx, mainChord)

            const tuplet = mainChord.tuplet()
            for (let i = 1; i < chordsDurations.length; i++) {
                const currentMeasure = score.tick2measure(currentTick)
                if (!currentMeasure) {
                    console.error(`bend import error : no valid measure for track ${track}, tick ${currentTick.ticks()}`)
                    return
                }

                let curSegment = currentMeasure.findSegment(SegmentType.ChordRest, currentActualTick)
                let currentChord: Chord | null = null
                const currentChordDuration = chordsDurations[i]
                const actualDuration = tuplet ? currentChordDuration.div(tuplet.ratio()) : currentChordDuration

                if (curSegment) {
                    currentChord = currentMeasure.findChord(currentTick, track)
                    if (!currentChord) {
                        console.error(`bend import error : no valid chord for track ${track}, tick ${currentTick.ticks()}`)
                        return
                    }

                    currentChord.setTicks(currentChordDuration)
                    currentChord.setDurationType(currentChordDuration)
                } else {
                    curSegment = currentMeasure.getSegment(SegmentType.ChordRest, currentActualTick)
                    currentChord = Factory.createItem(ElementType.CHORD, scoreDummy(score).segment()) as unknown as Chord
                    currentChord.setTrack(track)
                    currentChord.setTicks(currentChordDuration)
                    currentChord.setDurationType(currentChordDuration)
                    if (tuplet) {
                        tuplet.add(currentChord)
                    }

                    curSegment.add(currentChord)

                    for (const note of mainChord.notes()) {
                        const newChordNote = Factory.createItem(ElementType.NOTE, currentChord) as unknown as Note
                        newChordNote.setTrack(track)
                        currentChord.add(newChordNote)
                        newChordNote.setPitch(note.pitch())
                        newChordNote.setTpcFromPitch()
                    }
                }

                createSplitDurationBendsForChord(bendDataCtx, currentChord)
                currentTick = currentTick.plus(currentChordDuration)
                currentActualTick = currentActualTick.plus(actualDuration)
            }
        }
    }
}

function createSplitDurationBendsForChord(bendDataCtx: BendDataContextSplitChord, chord: Chord): void {
    const score = chord.score()
    const chordTicks = chord.tick().ticks()

    const currentTrackData = bendDataCtx.bendDataByEndTick.get(chord.track())
    if (!currentTrackData) {
        return
    }

    const bendChordData = currentTrackData.get(chordTicks)
    if (!bendChordData) {
        return
    }

    const startMeasure = score.tick2measure(bendChordData.startTick)
    if (!startMeasure) {
        console.error(`bend import error : no valid measure for track ${chord.track()}, tick ${bendChordData.startTick.ticks()}`)
        return
    }

    const startChord = startMeasure.findChord(bendChordData.startTick, chord.track())
    if (!startChord) {
        console.error(`bend import error : no valid chord for track ${chord.track()}, tick ${bendChordData.startTick.ticks()}`)
        return
    }

    const startChordNotes = [...startChord.notes()]
    const endChordNotes = [...chord.notes()]

    if (startChordNotes.length !== endChordNotes.length) {
        console.error(`bend import error: start and end chord sizes don't match for track ${chord.track()}, tick ${
            bendChordData.startTick.ticks()}`)
        return
    }

    startChordNotes.sort((l, r) => l.pitch() - r.pitch())
    endChordNotes.sort((l, r) => l.pitch() - r.pitch())

    for (let noteIndex = 0; noteIndex < endChordNotes.length; noteIndex++) {
        const startNote = startChordNotes[noteIndex]
        const note = endChordNotes[noteIndex]

        const bendNoteData = bendChordData.noteDataByIdx.get(noteIndex)
        if (!bendNoteData) {
            const tie = Factory.createItem(ElementType.TIE, scoreDummy(score)) as unknown as Tie
            startNote.add(tie)
            tie.setEndNote(note)
            note.setTieBack(tie)
            continue
        }

        const pitch = Math.trunc(bendNoteData.quarterTones / 2)

        if (startChord === chord) {
            console.error(`bend import error : start and end chords are the same for track ${chord.track()}, tick ${
                bendChordData.startTick.ticks()}`)
            return
        }

        const bend = score.addGuitarBend(GuitarBendType.BEND, startNote, note)
        if (!bend) {
            console.error(`bend wasn't created for track ${chord.track()}, tick ${startChord.tick().ticks()}`)
            return
        }

        const quarterOff = bendNoteData.quarterTones % 2
        bend.setEndNotePitch(bend.startNoteOfChain()!.pitch() + pitch, quarterOff)
        bend.setStartTimeFactor(bendNoteData.startFactor)
        bend.setEndTimeFactor(bendNoteData.endFactor)

        const newPitch = note.pitch()
        let tiedNote: Note | null = null

        const tieFor = startNote.tieFor()
        if (tieFor) {
            tiedNote = tieFor.endNote()
            startNote.remove(tieFor)
        }

        while (tiedNote) {
            tiedNote.setPitch(newPitch)
            tiedNote.setTpcFromPitch()
            const tie = tiedNote.tieFor()
            if (!tie) {
                break
            }

            tiedNote = tie.endNote()
        }
    }
}

function removeReduntantChords(bendDataCtx: BendDataContextSplitChord, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.reduntantChordTicks) {
        for (const tick of trackInfo.values()) {
            const currentMeasure = score.tick2measure(tick)
            if (!currentMeasure) {
                console.error(`bend import error : couldn't remove invalid chord, no valid measure for track ${track}, tick ${tick.ticks()}`)
                continue
            }

            const curSegment = currentMeasure.findSegment(SegmentType.ChordRest, tick)
            const currentChord = currentMeasure.findChord(tick, track)

            if (!(curSegment && currentChord)) {
                console.error(`bend import error : couldn't remove invalid chord, segment or chord was null for track ${track}, tick ${
                    tick.ticks()}`)
                continue
            }

            curSegment.remove(currentChord)
        }
    }
}
