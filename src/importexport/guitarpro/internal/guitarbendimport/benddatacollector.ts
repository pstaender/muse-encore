/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/benddatacollector.h/.cpp
 */

import type { Note } from '../../../../engraving/dom/note'
import type { Score } from '../../../../engraving/dom/score'
import type { PitchValues } from '../../../../engraving/types/pitchvalue'
import type { track_idx_t } from '../../../../engraving/types/types'
import { getLocatedChord } from '../utils'
import { BendDataContext, SPLIT_CHORD_DURATIONS } from './benddatacontext'
import { BendInfoConverter } from './bendinfoconverter'
import {
    BendNoteData, BendType, ChordImportedBendData, ConnectionToNextNoteType, FractionMap, GraceNotesImportInfo, ImportedBendInfo,
    LastGraceNoteData, mapAt, type tied_chords_bend_data_chunk_t,
} from './guitarbendimporttypes'
import { BendDataCollectorSplitChord } from './splitchord/benddatacollectorsplitchord'

/** muse::indexOf: muse::nidx (the largest size_t) if not found */
function indexOf<T>(v: readonly T[], item: T): number {
    const i = v.indexOf(item)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

export class BendDataCollector {
    private m_score: Score
    private m_bendInfoForNote = new Map<track_idx_t, FractionMap<Map<Note, ImportedBendInfo>>>()

    private m_regroupedDataByTiedChords = new Map<track_idx_t, FractionMap<tied_chords_bend_data_chunk_t>>()

    private m_bendDataCollectorSplitChord: BendDataCollectorSplitChord | null = null

    constructor(score: Score) {
        this.m_score = score
    }

    storeBendData(note: Note, pitchValues: PitchValues): void {
        if (SPLIT_CHORD_DURATIONS) {
            if (!this.m_bendDataCollectorSplitChord) {
                this.m_bendDataCollectorSplitChord = new BendDataCollectorSplitChord()
            }

            this.m_bendDataCollectorSplitChord.storeBendData(note, pitchValues)
        } else if (pitchValues.length) {
            const trackInfo = mapAt(this.m_bendInfoForNote, note.track(), () => new FractionMap<Map<Note, ImportedBendInfo>>())
            trackInfo.at(note.tick(), () => new Map()).set(note, BendInfoConverter.fillBendInfo(note, pitchValues))
        }
    }

    collectBendDataContext(): BendDataContext {
        const bendDataCtx = new BendDataContext()

        if (SPLIT_CHORD_DURATIONS) {
            bendDataCtx.splitChordCtx = this.m_bendDataCollectorSplitChord!.collectBendDataContext()
        } else {
            this.regroupBendDataByTiedChords()
            this.fillBendDataContext(bendDataCtx)
        }

        return bendDataCtx
    }

    // converts m_bendInfoForNote to m_regroupedData, leaves m_bendInfoForNote empty
    // m_bendInfoForNote is needed to store separate bend data for each note, while m_regroupedData stores in format, comfortoble for import
    private regroupBendDataByTiedChords(): void {
        for (const [track, trackInfo] of this.m_bendInfoForNote) {
            for (const [mainTick, tickInfo] of trackInfo.entries()) {
                const mainChord = getLocatedChord(this.m_score, mainTick, track)
                const chunk = mapAt(this.m_regroupedDataByTiedChords, track, () => new FractionMap<tied_chords_bend_data_chunk_t>())
                    .at(mainTick, () => new FractionMap<ChordImportedBendData>())
                {
                    const infoForFirstChord = chunk.at(mainTick, () => new ChordImportedBendData())
                    infoForFirstChord.chord = mainChord

                    for (const note of [...tickInfo.keys()]) {
                        infoForFirstChord.dataByNote.set(note, mapAt(tickInfo, note, () => new ImportedBendInfo()).move())
                    }
                }

                // filling the tied notes
                for (const note of [...tickInfo.keys()]) {
                    let currentNote: Note | null = note
                    let tieFor = currentNote.tieFor()
                    while (tieFor) {
                        currentNote = tieFor.endNote()

                        if (!currentNote) {
                            console.error('invalid tie encountered while importing guitar bend')
                            break
                        }

                        const infoAtTick = trackInfo.get(currentNote.tick())
                        if (infoAtTick && infoAtTick.has(currentNote)) {
                            const noteInfo = infoAtTick.get(currentNote)!
                            if (noteInfo.type === BendType.PREBEND) {
                                noteInfo.type = BendType.HOLD
                                // rewriting first note's info about should it connect to next or not
                                const firstChordData = this.m_regroupedDataByTiedChords.get(track)!.get(mainTick)!.first()![1]
                                const noteIndex = Math.min(indexOf(currentNote.chord().notes(), currentNote),
                                    firstChordData.chord!.notes().length - 1)
                                mapAt(firstChordData.dataByNote, firstChordData.chord!.notes()[noteIndex], () => new ImportedBendInfo())
                                    .connectionType = ConnectionToNextNoteType.MAIN_NOTE_CONNECTS
                            } else {
                                break
                            }
                        }

                        const currentChord = currentNote.chord()
                        const infoForCurrentChord = chunk.at(currentChord.tick(), () => new ChordImportedBendData())

                        infoForCurrentChord.chord = currentChord
                        infoForCurrentChord.dataByNote.set(currentNote, mapAt(tickInfo, currentNote, () => new ImportedBendInfo()).move())

                        tieFor = currentNote.tieFor()
                    }
                }
            }
        }

        this.m_bendInfoForNote.clear()
    }

    private fillBendDataContext(bendDataCtx: BendDataContext): void {
        for (const [, trackInfo] of this.m_regroupedDataByTiedChords) {
            for (const [, chunk] of trackInfo.entries()) {
                const tiedBendNotesAmount = chunk.size

                const firstChordData = chunk.first()![1]
                const firstChord = firstChordData.chord!

                for (let noteIdx = 0; noteIdx < firstChord.notes().length; noteIdx++) {
                    const mainNote = firstChord.notes()[noteIdx]
                    const dataForFirstNote = firstChordData.dataByNote.get(mainNote)
                    if (dataForFirstNote) {
                        if (tiedBendNotesAmount >= dataForFirstNote.segments.length && tiedBendNotesAmount > 1) {
                            this.moveSegmentsToTiedNotes(chunk, dataForFirstNote, noteIdx)
                        } else if (mainNote.tieFor()) {
                            // last grace note should connect to next tied note instead of original note of chord
                            const lastChordData = chunk.last()![1]
                            const noteIndex = Math.min(indexOf(mainNote.chord().notes(), mainNote),
                                lastChordData.chord!.notes().length - 1)
                            mapAt(lastChordData.dataByNote, lastChordData.chord!.notes()[noteIndex], () => new ImportedBendInfo())
                                .connectionType = dataForFirstNote.segments.length > 1
                                    ? ConnectionToNextNoteType.LAST_GRACE_CONNECTS : ConnectionToNextNoteType.MAIN_NOTE_CONNECTS
                        }
                    }
                }

                const chunkSize = chunk.size
                for (const [, chordInfo] of chunk.entries()) {
                    const notesVec = chordInfo.chord!.notes()
                    const notesData = chordInfo.dataByNote
                    for (let i = 0; i < notesVec.length; ++i) {
                        const n = notesVec[i]
                        const it = notesData.get(n)
                        if (it) {
                            fillBendDataForNote(bendDataCtx, it, i, chunkSize === 1)
                        }
                    }
                }
            }
        }
    }

    // if first chord in chunk has more segments than tied notes, move segments forward to other notes
    private moveSegmentsToTiedNotes(dataChunk: tied_chords_bend_data_chunk_t, dataForFirstNote: ImportedBendInfo, noteIdx: number): void {
        dataForFirstNote.connectionType = ConnectionToNextNoteType.MAIN_NOTE_CONNECTS
        const segmentsSize = dataForFirstNote.segments.length
        let newSegmentsSize = segmentsSize
        const note = dataForFirstNote.note!
        const diff = dataChunk.size - segmentsSize

        if (!(dataChunk.size >= segmentsSize)) {
            return
        }

        const chunkEntries = dataChunk.entries()
        let dataChunkIt = 0

        for (let i = 1; newSegmentsSize > 1; i++, newSegmentsSize--) {
            const chordExists = i < dataChunk.size
            dataChunkIt++
            const nextChordData = chunkEntries[dataChunkIt]?.[1]

            const noteExists = chordExists && noteIdx < nextChordData.chord!.notes().length
            const nextNote = noteExists ? nextChordData.chord!.notes()[noteIdx] : null
            const dataExists = noteExists && nextChordData.dataByNote.has(nextNote!)

            if (!dataExists) {
                console.error(`bend import error: bends data for tied notes is wrong for track ${note.track()}, tick ${note.tick().ticks()}`)
                return
            }

            const dataForNextNote = nextChordData.dataByNote.get(nextNote!)!
            const moved = dataForFirstNote.segments[i]
            dataForFirstNote.segments[i] = moved.clone() // C++ std::move leaves a valid (equal for trivially copyable) object
            dataForNextNote.segments.push(moved)
            dataForNextNote.connectionType = ConnectionToNextNoteType.MAIN_NOTE_CONNECTS
            dataForNextNote.note = nextNote
        }

        if (newSegmentsSize < segmentsSize) {
            dataForFirstNote.segments.length = newSegmentsSize
        }

        // in that case last note should be grace-after
        if (diff === 0) {
            const nextChordData = dataChunk.last()![1]
            for (const lastChordNote of nextChordData.chord!.notes()) {
                const d = nextChordData.dataByNote.get(lastChordNote)
                if (d) {
                    d.connectionType = ConnectionToNextNoteType.NONE
                }
            }
        }
    }
}

function fillBendDataForNote(bendDataCtx: BendDataContext, importedInfo: ImportedBendInfo, noteIndexInChord: number,
    isBendSingle: boolean): void {
    const note = importedInfo.note
    if (!note) {
        return
    }

    if (importedInfo.type === BendType.SLIGHT_BEND && isBendSingle) {
        // even though it's slight bend (1/4), we import it as normal bend, if it's followed by other bend (or hold)
        fillSlightBendData(bendDataCtx, importedInfo, noteIndexInChord)
        return
    }

    if (importedInfo.type === BendType.PREBEND) {
        fillPrebendData(bendDataCtx, importedInfo, noteIndexInChord)
    }

    fillNormalBendData(bendDataCtx, importedInfo)
}

function fillSlightBendData(bendDataCtx: BendDataContext, importedInfo: ImportedBendInfo, noteIndexInChord: number): void {
    const note = importedInfo.note!
    const chord = note.chord()
    const tick = chord.tick()

    const slightBendChordData = mapAt(bendDataCtx.slightBendData, note.track(), () => new FractionMap()).at(tick, () => new Map())
    const slightBendNoteData = new BendNoteData()
    slightBendNoteData.quarterTones = 1

    const seg = importedInfo.segments[0]

    const distanceToBendStart = importedInfo.timeOffsetFromStart
    const bendLength = seg.middleTime - seg.startTime
    const currentSegmentLength = seg.endTime - seg.startTime + distanceToBendStart

    slightBendNoteData.startFactor = distanceToBendStart / currentSegmentLength
    slightBendNoteData.endFactor = (distanceToBendStart + bendLength) / currentSegmentLength

    slightBendChordData.set(noteIndexInChord, slightBendNoteData)
}

function fillPrebendData(bendDataCtx: BendDataContext, importedInfo: ImportedBendInfo, noteIndexInChord: number): void {
    const note = importedInfo.note!
    const tick = note.tick()
    const prebendChordData = mapAt(bendDataCtx.prebendData, note.track(), () => new FractionMap()).at(tick, () => new Map())

    const prebendNoteData = new BendNoteData()
    prebendNoteData.quarterTones = Math.trunc(importedInfo.pitchOffsetFromStart / 25)

    prebendChordData.set(noteIndexInChord, prebendNoteData)
}

function fillNormalBendData(bendDataCtx: BendDataContext, importedInfo: ImportedBendInfo): void {
    if (!importedInfo.segments.length) {
        return
    }

    const note = importedInfo.note!
    const chord = note.chord()
    const track = chord.track()
    const tick = chord.tick()

    for (let i = 0; i < importedInfo.segments.length; i++) {
        const seg = importedInfo.segments[i]
        const offsetFromStart = (i === 0) ? importedInfo.timeOffsetFromStart : 0

        const data = new BendNoteData()
        data.quarterTones = Math.trunc(seg.endPitch / 25)

        const distanceToBendStart = offsetFromStart
        const bendLength = seg.middleTime - seg.startTime
        const currentSegmentLength = seg.endTime - seg.startTime + offsetFromStart

        data.startFactor = distanceToBendStart / currentSegmentLength
        data.endFactor = (distanceToBendStart + bendLength) / currentSegmentLength
        const noteIdx = indexOf(note.chord().notes(), note)

        if (importedInfo.connectionType === ConnectionToNextNoteType.MAIN_NOTE_CONNECTS) {
            mapAt(bendDataCtx.tiedNotesBendsData, track, () => new FractionMap()).at(tick, () => new Map()).set(noteIdx, data)
        } else if (importedInfo.connectionType === ConnectionToNextNoteType.LAST_GRACE_CONNECTS && i === importedInfo.segments.length - 1) {
            const lastNoteData = new LastGraceNoteData()
            lastNoteData.shouldMoveTie = true
            lastNoteData.endFactor = data.endFactor
            mapAt(mapAt(bendDataCtx.graceAfterBendData, track, () => new FractionMap()).at(tick, () => new Map()), noteIdx,
                () => new GraceNotesImportInfo()).lastNoteData = lastNoteData
        } else {
            mapAt(mapAt(bendDataCtx.graceAfterBendData, track, () => new FractionMap()).at(tick, () => new Map()), noteIdx,
                () => new GraceNotesImportInfo()).data.push(data)
        }
    }
}
