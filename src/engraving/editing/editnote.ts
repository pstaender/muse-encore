/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editnote.h/.cpp
 *
 * TODO(port): ChangeNoteEventList, ChangeNoteEvent, ChangeChordPlayEventType (playback)
 */

import type { EngravingObject } from '../dom/engravingobject'
import type { Note } from '../dom/note'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class ChangePitch extends UndoCommand {
    private note: Note
    private pitch: number
    private tpc1: number
    private tpc2: number

    constructor(note: Note, pitch: number, tpc1: number, tpc2: number) {
        super()
        this.note = note
        this.pitch = pitch
        this.tpc1 = tpc1
        this.tpc2 = tpc2
    }

    override type(): CommandType { return CommandType.ChangePitch }
    override name(): string { return 'ChangePitch' }
    override objectItems(): EngravingObject[] { return [this.note] }

    protected override flip(_ed: EditData | null): void {
        const fPitch = this.note.pitch()
        const fTpc1 = this.note.tpc1()
        const fTpc2 = this.note.tpc2()
        // do not change unless necessary
        if (fPitch === this.pitch && fTpc1 === this.tpc1 && fTpc2 === this.tpc2) {
            return
        }

        this.note.setPitch(this.pitch, this.tpc1, this.tpc2)
        this.pitch = fPitch
        this.tpc1 = fTpc1
        this.tpc2 = fTpc2

        this.note.triggerLayout()
    }
}

/**
 * To use with tablatures to force a specific note fretting;
 * Pitch, string and fret must be changed all together; otherwise,
 * if they are not consistent among themselves, the refretting algorithm may re-assign
 * fret and string numbers for (potentially) all the notes of all the chords of a segment.
 */
export class ChangeFretting extends UndoCommand {
    private note: Note
    private pitch: number
    private string: number
    private fret: number
    private tpc1: number
    private tpc2: number

    constructor(note: Note, pitch: number, string: number, fret: number, tpc1: number, tpc2: number) {
        super()
        this.note = note
        this.pitch = pitch
        this.string = string
        this.fret = fret
        this.tpc1 = tpc1
        this.tpc2 = tpc2
    }

    override type(): CommandType { return CommandType.ChangeFretting }
    override name(): string { return 'ChangeFretting' }
    override objectItems(): EngravingObject[] { return [this.note] }

    protected override flip(_ed: EditData | null): void {
        const fPitch = this.note.pitch()
        const fString = this.note.string()
        const fFret = this.note.fret()
        const fTpc1 = this.note.tpc1()
        const fTpc2 = this.note.tpc2()
        // do not change unless necessary
        if (fPitch === this.pitch && fString === this.string && fFret === this.fret && fTpc1 === this.tpc1 && fTpc2 === this.tpc2) {
            return
        }

        this.note.setPitch(this.pitch, this.tpc1, this.tpc2)
        this.note.setString(this.string)
        this.note.setFret(this.fret)
        this.pitch = fPitch
        this.string = fString
        this.fret = fFret
        this.tpc1 = fTpc1
        this.tpc2 = fTpc2
        this.note.triggerLayout()
    }
}

export class ChangeVelocity extends UndoCommand {
    constructor(private note: Note, private userVelocity: number) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeVelocity }
    override name(): string { return 'ChangeVelocity' }
    override objectItems(): EngravingObject[] { return [this.note] }

    protected override flip(_ed: EditData | null): void {
        const v = this.note.userVelocity()
        this.note.setUserVelocity(this.userVelocity)
        this.userVelocity = v
    }
}
