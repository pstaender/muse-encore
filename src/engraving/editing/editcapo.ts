/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editcapo.h/.cpp
 */

import { Fraction } from '../types/fraction'
import { CapoParams, CapoTransposeMode, GuitarBendType, VOICES } from '../types/types'
import { GuitarBend } from '../dom/guitarbend'
import type { Chord } from '../dom/chord'
import type { Measure } from '../dom/measure'
import type { Note } from '../dom/note'
import type { Staff } from '../dom/staff'
import type { StringData } from '../dom/stringdata'

function setsEqual(a: Set<number>, b: Set<number>): boolean {
    if (a.size !== b.size) {
        return false
    }
    for (const v of a) {
        if (!b.has(v)) {
            return false
        }
    }
    return true
}

interface UpdateCtx {
    staff: Staff
    stringData: StringData | null
    params: CapoParams
    noteOffset: number
    updateIgnoredStrings: boolean
    possibleFretConflict: boolean
}

export class EditCapo {
    static updateNotationForCapoChange(oldParams: CapoParams, newParams: CapoParams, staff: Staff, startTick: number,
                                       endTick: number): void {
        const ctx: UpdateCtx = {
            staff,
            params: newParams,
            // These two have to be set in applyCapoTranspose for every chord!
            stringData: null,
            possibleFretConflict: false,
            noteOffset: 0,
            updateIgnoredStrings: false,
        }

        const score = staff.score()
        const layoutEndTick = endTick !== -1 ? Fraction.fromTicks(endTick) : Fraction.max()
        score.setLayout(layoutEndTick, staff.idx())

        const modeChanged = oldParams.transposeMode !== newParams.transposeMode
        const fretChanged = oldParams.fretPosition !== newParams.fretPosition
        const stringsChanged = !setsEqual(oldParams.ignoredStrings, newParams.ignoredStrings)
        const activeChanged = oldParams.active !== newParams.active

        if (modeChanged) {
            EditCapo.handleModeChange(oldParams, newParams, startTick, endTick, ctx)
            return
        }
        if (fretChanged) {
            EditCapo.handleFretChange(oldParams, newParams, startTick, endTick, ctx)
            return
        }
        if (stringsChanged) {
            EditCapo.handleStringChanged(newParams, startTick, endTick, ctx)
            return
        }
        if (activeChanged) {
            EditCapo.handleActiveChanged(newParams, startTick, endTick, ctx)
            return
        }
    }

    private static applyCapoTranspose(startTick: number, endTick: number, ctx: UpdateCtx): void {
        const staffIdx = ctx.staff.idx()
        const startTrack = staffIdx * VOICES
        const endTrack = startTrack + VOICES

        for (let mb = ctx.staff.score().measures().first(); mb; mb = mb.next()) {
            if (!mb.isMeasure()) {
                continue
            }
            for (let seg = (mb as Measure).first(); seg; seg = seg.next()) {
                if (!seg.isChordRestType()) {
                    continue
                }
                for (let track = startTrack; track < endTrack; ++track) {
                    const e = seg.element(track)
                    if (!e || !e.isChord()) {
                        continue
                    }
                    if (e.tick().ticks() < startTick || (-1 !== endTick && e.tick().ticks() >= endTick)) {
                        continue
                    }

                    const chord = e as Chord
                    chord.sortNotes()
                    ctx.stringData = chord.part()!.stringData(chord.tick(), staffIdx)
                    // Prefer not change strings for intervals and chords
                    ctx.possibleFretConflict = chord.notes().length > 1 || chord.notes().some(n => n.fret() < ctx.params.fretPosition)

                    for (const note of chord.notes()) {
                        if (ctx.updateIgnoredStrings) {
                            EditCapo.updateString(note, ctx)
                        } else {
                            EditCapo.update(note, ctx)
                        }
                        const bend = note.bendFor()
                        if (bend) {
                            if (GuitarBendType.BEND === bend.bendType()) {
                                const startNote = bend.startNote()!
                                const endNote = bend.endNote()!
                                const stringData = ctx.stringData
                                const startString = startNote.string()
                                const startFret = stringData.fretForStaff(startNote.pitch(), startString, startNote.staff(), startNote.tick())
                                if (startFret !== startNote.fret()) {
                                    startNote.setFret(startFret)
                                }

                                if (endNote.fret() !== startFret) {
                                    endNote.setString(startString)
                                    endNote.setFret(startFret)
                                }
                                GuitarBend.fixNotesFrettingForStandardBend(bend.startNote()!, bend.endNote()!)
                            }
                        }
                    }

                    for (const g of chord.graceNotes()) {
                        for (const n of g.notes()) {
                            if (ctx.updateIgnoredStrings) {
                                EditCapo.updateString(n, ctx)
                            } else {
                                EditCapo.update(n, ctx)
                            }
                        }
                    }
                }
            }
        }
    }

    private static update(note: Note, ctx: UpdateCtx): void {
        if (ctx.params.ignoredStrings.has(note.string())) {
            note.setPitch(ctx.stringData!.getPitchForStaff(note.string(), note.fret(), ctx.staff))
        } else {
            const pitch = note.pitch() + ctx.noteOffset
            note.setPitch(pitch)
        }
        note.setTpcFromPitch()
    }

    private static updateString(note: Note, ctx: UpdateCtx): void {
        const pitch = note.pitch()
        const string = note.string()
        const fret = note.fret()
        const sd = ctx.stringData!
        if (CapoTransposeMode.PLAYBACK_ONLY !== ctx.params.transposeMode) {
            if (ctx.params.ignoredStrings.has(note.string())) {
                // Already handled
                if (pitch === sd.getPitch(string, fret, 0)) {
                    return
                }
                if (CapoTransposeMode.STANDARD_ONLY === ctx.params.transposeMode) {
                    note.setPitch(sd.getPitchForStaff(note.string(), note.fret(), ctx.staff))
                }
                note.setTpcFromPitch()
                return
            }
            if (pitch !== sd.getPitch(string, fret, -ctx.params.fretPosition)) {
                if (CapoTransposeMode.STANDARD_ONLY === ctx.params.transposeMode) {
                    note.setPitch(sd.getPitch(note.string(), note.fret(), -ctx.params.fretPosition))
                }
            }
        }
        note.setTpcFromPitch()
    }

    private static handleModeChange(oldParams: CapoParams, newParams: CapoParams, startTick: number, endTick: number,
                                    ctx: UpdateCtx): void {
        switch (oldParams.transposeMode) {
        case CapoTransposeMode.PLAYBACK_ONLY:
            if (newParams.transposeMode === CapoTransposeMode.STANDARD_ONLY) {
                ctx.noteOffset = newParams.fretPosition
            }
            break
        case CapoTransposeMode.STANDARD_ONLY:
            if (newParams.transposeMode === CapoTransposeMode.PLAYBACK_ONLY) {
                ctx.noteOffset = -oldParams.fretPosition
            } else if (newParams.transposeMode === CapoTransposeMode.TAB_ONLY) {
                ctx.noteOffset = -oldParams.fretPosition
            }
            break
        case CapoTransposeMode.TAB_ONLY:
            if (newParams.transposeMode === CapoTransposeMode.STANDARD_ONLY) {
                ctx.noteOffset = newParams.fretPosition
            }
            break
        }
        EditCapo.applyCapoTranspose(startTick, endTick, ctx)
    }

    private static handleFretChange(oldParams: CapoParams, newParams: CapoParams, startTick: number, endTick: number,
                                    ctx: UpdateCtx): void {
        if (CapoTransposeMode.STANDARD_ONLY === newParams.transposeMode) {
            ctx.noteOffset = newParams.fretPosition - oldParams.fretPosition
            EditCapo.applyCapoTranspose(startTick, endTick, ctx)
        }
    }

    private static handleStringChanged(newParams: CapoParams, startTick: number, endTick: number, ctx: UpdateCtx): void {
        ctx.updateIgnoredStrings = true

        switch (newParams.transposeMode) {
        case CapoTransposeMode.STANDARD_ONLY:
            ctx.noteOffset = newParams.fretPosition
            EditCapo.applyCapoTranspose(startTick, endTick, ctx)
            break
        case CapoTransposeMode.TAB_ONLY:
        case CapoTransposeMode.PLAYBACK_ONLY:
            break
        }
    }

    private static handleActiveChanged(newParams: CapoParams, startTick: number, endTick: number, ctx: UpdateCtx): void {
        if (!newParams.active) {
            // Treat as whatever mode to playback-only transition
            switch (newParams.transposeMode) {
            case CapoTransposeMode.STANDARD_ONLY:
                ctx.noteOffset = -newParams.fretPosition
                break
            case CapoTransposeMode.TAB_ONLY:
            case CapoTransposeMode.PLAYBACK_ONLY:
                break
            }
        } else {
            // Otherwise, as playback-only mode to previous one
            switch (newParams.transposeMode) {
            case CapoTransposeMode.STANDARD_ONLY:
                ctx.noteOffset = newParams.fretPosition
                break
            case CapoTransposeMode.TAB_ONLY:
            case CapoTransposeMode.PLAYBACK_ONLY:
                break
            }
        }
        EditCapo.applyCapoTranspose(startTick, endTick, ctx)
    }
}
