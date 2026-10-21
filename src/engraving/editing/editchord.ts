/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editchord.h/.cpp (EditChord: only what is needed when loading, no undo, no linked chords;
 * the undo commands ChangeChordStaffMove and SwapCR)
 *
 * TODO(port): EditChord::removeChordParentheses and the parenthesis undo commands, ChangeSpanArpeggio
 */

import { DirectionH, ElementType } from '../types/types'
import { Factory } from '../dom/factory'
import { NoteParenthesisInfo, type Chord } from '../dom/chord'
import type { Note } from '../dom/note'
import type { Parenthesis } from '../dom/parenthesis'
import type { ChordRest } from '../dom/chordrest'
import type { EngravingObject } from '../dom/engravingobject'
import type { TremoloTwoChord } from '../dom/tremolotwochord'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class EditChord {
    static addChordParentheses(chord: Chord, notes: Note[], _addToLinked = true, generated = false): void {
        if (notes.length === 0) {
            return
        }
        EditChord.undoAddParenthesesToNotes(chord, notes, generated)
    }

    private static undoAddParenthesesToNotes(chord: Chord, notes: Note[], generated: boolean): void {
        const track = chord.track()
        const leftParen = Factory.createItem(ElementType.PARENTHESIS, chord) as Parenthesis
        leftParen.setParent(chord)
        leftParen.setTrack(track)
        leftParen.setDirection(DirectionH.LEFT)
        leftParen.setGenerated(generated)
        const rightParen = Factory.createItem(ElementType.PARENTHESIS, chord) as Parenthesis
        rightParen.setParent(chord)
        rightParen.setTrack(track)
        rightParen.setDirection(DirectionH.RIGHT)
        rightParen.setGenerated(generated)

        // TODO(port): linked chords
        chord.addNoteParenthesisInfo(new NoteParenthesisInfo(leftParen, rightParen, notes))
    }
}

export class ChangeChordStaffMove extends UndoCommand {
    constructor(private chordRest: ChordRest, private staffMove: number) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeChordStaffMove }
    override name(): string { return 'ChangeChordStaffMove' }
    override objectItems(): EngravingObject[] { return [this.chordRest] }

    protected override flip(_ed: EditData | null): void {
        const v = this.chordRest.staffMove()
        const oldStaff = this.chordRest.vStaffIdx()

        this.chordRest.setStaffMove(this.staffMove)
        this.chordRest.checkStaffMoveValidity()
        this.chordRest.triggerLayout()
        if (this.chordRest.vStaffIdx() === oldStaff) {
            return
        }

        for (const e of this.chordRest.linkList()) {
            const cr = e as unknown as ChordRest
            if (cr === this.chordRest) {
                continue
            }
            cr.setStaffMove(this.staffMove)
            cr.checkStaffMoveValidity()
            cr.triggerLayout()
        }
        this.staffMove = v
    }
}

export class SwapCR extends UndoCommand {
    constructor(private cr1: ChordRest, private cr2: ChordRest) {
        super()
    }

    override type(): CommandType { return CommandType.SwapCR }
    override name(): string { return 'SwapCR' }
    override objectItems(): EngravingObject[] { return [this.cr1, this.cr2] }

    protected override flip(_ed: EditData | null): void {
        const s1 = this.cr1.segment()
        const s2 = this.cr2.segment()
        const track = this.cr1.track()

        if (this.cr1.isChord() && this.cr2.isChord() && (this.cr1 as Chord).tremoloTwoChord()
            && ((this.cr1 as Chord).tremoloTwoChord() === (this.cr2 as Chord).tremoloTwoChord())) {
            const t = (this.cr1 as Chord).tremoloTwoChord() as TremoloTwoChord
            const c1 = t.chord1()
            const c2 = t.chord2()
            t.setParent(c2)
            t.setChords(c2, c1)
        }

        const cr = s1.element(track)
        s1.setElement(track, s2.element(track))
        s2.setElement(track, cr)
        this.cr1.score().setLayout(s1.tick(), this.cr1.staffIdx(), this.cr1)
        this.cr1.score().setLayout(s2.tick(), this.cr1.staffIdx(), this.cr1)
    }
}
