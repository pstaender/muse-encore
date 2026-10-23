/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/benddataprocessor.h/.cpp
 */

import { scoreDummy } from '../../../../engraving/compat/dummyelement'
import type { Chord } from '../../../../engraving/dom/chord'
import { NoteType } from '../../../../engraving/dom/chordrest'
import { TDuration } from '../../../../engraving/dom/durationtype'
import { Factory } from '../../../../engraving/dom/factory'
import { DisplayFretOption, type Note } from '../../../../engraving/dom/note'
import type { Score } from '../../../../engraving/dom/score'
import { Constants } from '../../../../engraving/types/constants'
import { BeamMode, ElementType, GuitarBendType, ParenthesesMode } from '../../../../engraving/types/types'
import { getLocatedChord } from '../utils'
import type { BendDataContext } from './benddatacontext'
import type { grace_bend_data_map_t } from './guitarbendimporttypes'
import { BendDataProcessorSplitChord } from './splitchord/benddataprocessorsplitchord'

export class BendDataProcessor {
    private m_score: Score
    private m_bendDataProcessorSplitChord: BendDataProcessorSplitChord | null = null

    constructor(score: Score) {
        this.m_score = score
    }

    processBends(bendDataCtx: BendDataContext): void {
        createPreBends(bendDataCtx, this.m_score)
        createSlightBends(bendDataCtx, this.m_score)
        createGraceAfterBends(bendDataCtx, this.m_score)
        createTiedNotesBends(bendDataCtx, this.m_score)

        if (bendDataCtx.splitChordCtx) {
            this.m_bendDataProcessorSplitChord = new BendDataProcessorSplitChord(this.m_score)
            this.m_bendDataProcessorSplitChord.processBends(bendDataCtx.splitChordCtx)
        }
    }
}

function createSlightBends(bendDataCtx: BendDataContext, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.slightBendData) {
        for (const [tick, tickInfo] of trackInfo.entries()) {
            const chord = getLocatedChord(score, tick, track)!
            for (let noteIndex = 0; noteIndex < chord.notes().length; noteIndex++) {
                const noteBendData = tickInfo.get(noteIndex)
                if (!noteBendData) {
                    continue
                }

                const note = chord.notes()[noteIndex]
                const bend = chord.score().addGuitarBend(GuitarBendType.SLIGHT_BEND, note)
                if (!bend) {
                    console.error(`bend wasn't created for track ${chord.track()}, tick ${chord.tick().ticks()}`)
                    continue
                }

                bend.setStartTimeFactor(noteBendData.startFactor)
                bend.setEndTimeFactor(noteBendData.endFactor)
            }
        }
    }
}

function createPreBends(bendDataCtx: BendDataContext, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.prebendData) {
        for (const [tick, tickInfo] of trackInfo.entries()) {
            const chord = getLocatedChord(score, tick, track)!
            for (let noteIndex = 0; noteIndex < chord.notes().length; noteIndex++) {
                const noteBendData = tickInfo.get(noteIndex)
                if (!noteBendData) {
                    continue
                }

                const note = chord.notes()[noteIndex]
                // NOTE: addGuitarBend will create grace note and transpose it down. We need the pitch of current note instead to properly fret the note.
                note.transposeDiatonic(1, true, false)
                const bend = chord.score().addGuitarBend(GuitarBendType.PRE_BEND, note)
                if (!bend) {
                    console.error(`prebend wasn't created for track ${chord.track()}, tick ${chord.tick().ticks()}`)
                    continue
                }

                // NOTE: returning pitch.
                note.transposeDiatonic(-1, true, false)
                bend.setStartTimeFactor(noteBendData.startFactor)
                bend.setEndTimeFactor(noteBendData.endFactor)

                const pitch = Math.trunc(noteBendData.quarterTones / 2)
                note.setPitch(note.pitch() + pitch)
                note.setTpcFromPitch()
                const quarterOff = noteBendData.quarterTones % 2
                bend.setEndNotePitch(note.pitch(), quarterOff)
                const startNote = bend.startNote()
                if (!startNote) {
                    return
                }

                startNote.setPitch(note.pitch() - pitch)
                startNote.setTpcFromPitch()
                if (note.displayFret() === DisplayFretOption.Hide) {
                    startNote.setDisplayFret(DisplayFretOption.Hide)
                }

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
    }
}

function createGraceChords(chord: Chord, bendInfo: grace_bend_data_map_t): Chord[] {
    const graceChords: Chord[] = []

    let maxGraceAmount = 0
    for (let noteIndex = 0; noteIndex < chord.notes().length; noteIndex++) {
        const graceData = bendInfo.get(noteIndex)
        if (!graceData) {
            continue
        }

        maxGraceAmount = Math.max(maxGraceAmount, graceData.data.length)
    }

    const score = chord.score()

    for (let i = 0; i < maxGraceAmount; i++) {
        const graceChord = Factory.createItem(ElementType.CHORD, scoreDummy(score).segment()) as unknown as Chord
        graceChord.setTrack(chord.track())
        graceChord.setNoteType(NoteType.GRACE8_AFTER)
        graceChord.setNoStem(true)
        graceChord.setBeamMode(BeamMode.NONE)

        const dur = new TDuration()
        dur.setVal(Math.trunc(Constants.DIVISION / 2))
        graceChord.setDurationType(dur)
        graceChord.setTicks(dur.fraction())
        chord.add(graceChord)

        graceChords.push(graceChord)
    }

    return graceChords
}

function createGraceAfterBends(bendDataCtx: BendDataContext, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.graceAfterBendData) {
        for (const [tick, tickInfo] of trackInfo.entries()) {
            const chord = getLocatedChord(score, tick, track)!
            const graceChords = createGraceChords(chord, tickInfo)
            for (let noteIndex = 0; noteIndex < chord.notes().length; noteIndex++) {
                const graceData = tickInfo.get(noteIndex)
                if (!graceData) {
                    continue
                }

                const mainNote = chord.notes()[noteIndex]

                const graceVectorData = graceData.data
                const lastGraceData = graceData.lastNoteData
                const shouldMoveTie = lastGraceData.shouldMoveTie

                let currentNote: Note = mainNote
                for (let graceIndex = 0; graceIndex < graceVectorData.length; graceIndex++) {
                    const noteData = graceVectorData[graceIndex]
                    const graceChord = graceChords[graceIndex]

                    const graceNote = Factory.createItem(ElementType.NOTE, graceChord) as unknown as Note
                    graceNote.setPitch(currentNote.pitch() + Math.trunc(noteData.quarterTones / 2))
                    graceNote.setTpcFromPitch()
                    graceChord.add(graceNote)

                    const bend = score.addGuitarBend(GuitarBendType.BEND, currentNote, graceNote)
                    if (!bend) {
                        console.error(`grace-after bend wasn't created for track ${graceChord.track()}, tick ${graceChord.tick().ticks()}`)
                        break
                    }

                    const quarterOff = noteData.quarterTones % 2
                    bend.setEndNotePitch(bend.startNoteOfChain()!.pitch() + Math.trunc(noteData.quarterTones / 2), quarterOff)
                    bend.setStartTimeFactor(noteData.startFactor)
                    bend.setEndTimeFactor(noteData.endFactor)

                    currentNote = graceNote
                }

                let gi = 0
                for (const c of mainNote.chord().graceNotes()) {
                    c.setGraceIndex(gi++)
                }

                if (shouldMoveTie) {
                    const tieFor = mainNote.tieFor()
                    if (tieFor && tieFor.endNote()) {
                        const tiedNote = tieFor.endNote()!
                        mainNote.remove(tieFor)
                        const bend = score.addGuitarBend(GuitarBendType.BEND, currentNote, tiedNote)
                        bend!.setEndTimeFactor(lastGraceData.endFactor)
                    }
                }
            }
        }
    }
}

function createTiedNotesBends(bendDataCtx: BendDataContext, score: Score): void {
    for (const [track, trackInfo] of bendDataCtx.tiedNotesBendsData) {
        for (const [tick, tickInfo] of trackInfo.entries()) {
            const chord = getLocatedChord(score, tick, track)
            if (!chord) {
                continue
            }

            for (let noteIndex = 0; noteIndex < chord.notes().length; noteIndex++) {
                const noteInfo = tickInfo.get(noteIndex)
                if (!noteInfo) {
                    continue
                }

                const startNote = chord.notes()[noteIndex]
                const endNote = startNote.tieFor() ? startNote.tieFor()!.endNote() : null
                if (!endNote) {
                    console.error(`bend import error: not found tied note for track ${track}, tick ${tick.ticks()}`)
                    continue
                }

                const bend = score.addGuitarBend(GuitarBendType.BEND, startNote, endNote)
                if (!bend) {
                    console.error(`bend wasn't created for track ${chord.track()}, tick ${chord.tick().ticks()}`)
                    continue
                }

                const quarterOff = noteInfo.quarterTones % 2
                bend.setEndNotePitch(bend.startNoteOfChain()!.pitch() + Math.trunc(noteInfo.quarterTones / 2), quarterOff)
                bend.setStartTimeFactor(noteInfo.startFactor)
                bend.setEndTimeFactor(noteInfo.endFactor)
                endNote.setParenthesesMode(ParenthesesMode.BOTH)

                let tie = startNote.tieFor()
                if (tie) {
                    startNote.remove(tie)
                }

                tie = endNote.tieFor()
                while (tie) {
                    const nextNote = tie.endNote()
                    if (!nextNote) {
                        console.error(`bend import error: not found tied note for track ${track}, tick ${tick.ticks()}`)
                        break
                    }

                    nextNote.setPitch(endNote.pitch())
                    nextNote.setTpcFromPitch()
                    nextNote.setParenthesesMode(ParenthesesMode.BOTH)
                    tie = nextNote.tieFor()
                }
            }
        }
    }
}
