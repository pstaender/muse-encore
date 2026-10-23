/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editchord.h/.cpp (EditChord: the chord parentheses of notes; the undo commands
 * ChangeChordStaffMove, SwapCR, AddNoteParenthesisInfo, RemoveNoteParenthesisInfo, RemoveSingleNoteParentheses)
 *
 * TODO(port): ChangeSpanArpeggio
 */

import { DirectionH, ElementType } from '../types/types'
import { Factory } from '../dom/factory'
import { NoteParenthesisInfo, type Chord } from '../dom/chord'
import { noteParenthesesHooks, type Note } from '../dom/note'
import type { Parenthesis } from '../dom/parenthesis'
import type { ChordRest } from '../dom/chordrest'
import type { EngravingObject } from '../dom/engravingobject'
import type { TremoloTwoChord } from '../dom/tremolotwochord'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class EditChord {
    static addChordParentheses(chord: Chord, notes: Note[], addToLinked = true, generated = false): void {
        if (notes.length === 0) {
            return
        }
        EditChord.undoAddParenthesesToNotes(chord, notes, addToLinked, generated)
    }

    static removeChordParentheses(chord: Chord, notes: Note[], addToLinked = true, generated = false): void {
        if (notes.length === 0) {
            return
        }
        // Split based on parentheses group
        const notesByGroup = new Map<NoteParenthesisInfo, Note[]>()

        for (const n of notes) {
            const noteParenInfo = chord.findNoteParenthesisInfo(n)
            if (!noteParenInfo) {
                continue
            }

            const group = notesByGroup.get(noteParenInfo)
            if (!group) {
                notesByGroup.set(noteParenInfo, [n])
                continue
            }

            group.push(n)
        }

        // C++ iterates the std::map (ordered by pointer) in reverse; the groups are independent of each other
        for (const [parenInfo, groupNotes] of [...notesByGroup].reverse()) {
            if (parenInfo.notes().length === groupNotes.length) {
                // All notes marked for paren removal, clear parentheses group
                EditChord.undoClearParenthesisGroup(chord, [...parenInfo.notes()], parenInfo.leftParen(), parenInfo.rightParen(), addToLinked)
                continue
            }

            // Only some notes marked for removal. Remove from lowest note up. This keeps the paren group splitting logic safe
            for (const note of groupNotes) {
                // Remove paren from single note and create new paren group for all notes below
                const curParenInfo = note.parenthesisInfo()!
                const notesList = [...curParenInfo.notes()]
                const leftParen = curParenInfo.leftParen()
                const rightParen = curParenInfo.rightParen()
                const notePos = notesList.indexOf(note)

                if (notePos >= 0 && notePos + 1 !== notesList.length && notePos !== 0) {
                    // Create new group
                    const newNoteGroup = notesList.slice(notePos + 1)

                    for (const noteToRemove of newNoteGroup) {
                        if (curParenInfo.notes().length === 1) {
                            EditChord.undoClearParenthesisGroup(chord, [noteToRemove], leftParen, rightParen, addToLinked)
                        } else {
                            EditChord.undoRemoveParenthesesFromNote(chord, noteToRemove, leftParen, addToLinked)
                        }
                    }

                    EditChord.undoAddParenthesesToNotes(chord, newNoteGroup, addToLinked, generated)
                }
                if (curParenInfo.notes().length === 1) {
                    EditChord.undoClearParenthesisGroup(chord, [note], leftParen, rightParen, addToLinked)
                } else {
                    EditChord.undoRemoveParenthesesFromNote(chord, note, leftParen, addToLinked)
                }
            }
        }
    }

    private static undoAddParenthesesToNotes(chord: Chord, notes: Note[], addToLinked = true, generated = false): void {
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

        if (!addToLinked) {
            EditChord.doAddNoteParentheses(chord, notes, leftParen, rightParen)
            return
        }

        for (const linkedObject of chord.linkList()) {
            if (linkedObject === chord) {
                EditChord.doAddNoteParentheses(chord, notes, leftParen, rightParen)
                continue
            }

            const linkedChord = linkedObject as Chord
            const linkedScore = linkedChord.score()
            const linkedStaff = linkedChord.staff()!
            const linkedParenLeft = leftParen.linkedClone() as Parenthesis
            linkedParenLeft.setScore(linkedScore)
            linkedParenLeft.setParent(linkedChord)
            linkedParenLeft.setTrack(linkedChord.track())
            const linkedParenRight = rightParen.linkedClone() as Parenthesis
            linkedParenRight.setScore(linkedScore)
            linkedParenRight.setParent(linkedChord)
            linkedParenRight.setTrack(linkedChord.track())

            const linkedNotes: Note[] = []
            for (const note of notes) {
                linkedNotes.push(note.findLinkedInStaff(linkedStaff) as Note)
            }

            EditChord.doAddNoteParentheses(linkedChord, linkedNotes, linkedParenLeft, linkedParenRight)
        }
    }

    private static undoRemoveParenthesesFromNote(chord: Chord, note: Note, leftParen: Parenthesis, removeFromLinked = true): void {
        if (!removeFromLinked) {
            EditChord.doRemoveSingleNoteParenthesis(chord, note, leftParen)
            return
        }

        for (const linkedObject of chord.linkList()) {
            if (linkedObject === chord) {
                EditChord.doRemoveSingleNoteParenthesis(chord, note, leftParen)
                continue
            }

            const linkedChord = linkedObject as Chord
            const linkedStaff = linkedChord.staff()!
            const linkedLeftParen = leftParen.findLinkedInStaff(linkedStaff) as Parenthesis | null
            if (!linkedLeftParen) {
                continue
            }
            const linkedNote = note.findLinkedInStaff(linkedStaff) as Note

            const noteParenInfo = linkedChord.findNoteParenthesisInfo(linkedNote)
            if (noteParenInfo) {
                EditChord.doRemoveSingleNoteParenthesis(linkedChord, linkedNote, linkedLeftParen)
            }
        }
    }

    private static undoClearParenthesisGroup(chord: Chord, _notes: Note[], leftParen: Parenthesis, rightParen: Parenthesis,
        removeFromLinked = true): void {
        if (!removeFromLinked) {
            EditChord.doRemoveAllNoteParentheses(chord, leftParen)
            return
        }

        for (const linkedObject of chord.linkList()) {
            if (linkedObject === chord) {
                EditChord.doRemoveAllNoteParentheses(chord, leftParen)
                continue
            }

            const linkedChord = linkedObject as Chord
            const linkedStaff = linkedChord.staff()!
            const linkedLeftParen = leftParen.findLinkedInStaff(linkedStaff) as Parenthesis | null
            const linkedRightParen = rightParen.findLinkedInStaff(linkedStaff) as Parenthesis | null

            if (!linkedLeftParen && !linkedRightParen) {
                continue
            }

            // C++ passes linkedLeftParen even if only the right one was found
            EditChord.doRemoveAllNoteParentheses(linkedChord, linkedLeftParen ?? linkedRightParen!)
        }
    }

    private static doAddNoteParentheses(chord: Chord, notes: Note[], leftParen: Parenthesis, rightParen: Parenthesis): void {
        const parenInfo = new NoteParenthesisInfo(leftParen, rightParen, notes)
        if (leftParen.generated()) {
            chord.addNoteParenthesisInfo(parenInfo)
        } else {
            chord.score().undo(new AddNoteParenthesisInfo(chord, parenInfo))
        }
    }

    private static doRemoveSingleNoteParenthesis(chord: Chord, note: Note, leftParen: Parenthesis): void {
        if (leftParen.generated()) {
            chord.removeNoteFromParenthesisInfo(note, leftParen)

            chord.triggerLayout()
        } else {
            chord.score().undo(new RemoveSingleNoteParentheses(chord, note, leftParen))
        }
    }

    private static doRemoveAllNoteParentheses(chord: Chord, leftParen: Parenthesis): void {
        const noteParenInfo = chord.findNoteParenthesisInfo(leftParen)
        if (leftParen.generated()) {
            chord.removeNoteParenthesisInfo(noteParenInfo)

            chord.triggerLayout()
        } else if (noteParenInfo) {
            chord.score().undo(new RemoveNoteParenthesisInfo(chord, noteParenInfo))
        }
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

export class AddNoteParenthesisInfo extends UndoCommand {
    constructor(private m_chord: Chord, private m_noteParenInfo: NoteParenthesisInfo) {
        super()
    }

    override type(): CommandType { return CommandType.AddNoteParenthesesInfo }
    override name(): string { return 'AddNoteParenthesesInfo' }

    override redo(_ed: EditData | null): void {
        this.m_chord.addNoteParenthesisInfo(this.m_noteParenInfo)

        this.m_chord.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.m_chord.removeNoteParenthesisInfo(this.m_noteParenInfo)

        this.m_chord.triggerLayout()
    }
}

export class RemoveNoteParenthesisInfo extends UndoCommand {
    constructor(private m_chord: Chord, private m_noteParenInfo: NoteParenthesisInfo) {
        super()
    }

    override type(): CommandType { return CommandType.RemoveNoteParenthesesInfo }
    override name(): string { return 'RemoveNoteParenthesesInfo' }

    override redo(_ed: EditData | null): void {
        this.m_chord.removeNoteParenthesisInfo(this.m_noteParenInfo)

        this.m_chord.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.m_chord.addNoteParenthesisInfo(this.m_noteParenInfo)

        this.m_chord.triggerLayout()
    }
}

export class RemoveSingleNoteParentheses extends UndoCommand {
    constructor(private m_chord: Chord, private m_note: Note, private m_paren: Parenthesis) {
        super()
    }

    override type(): CommandType { return CommandType.RemoveSingleNoteParentheses }
    override name(): string { return 'RemoveSingleNoteParentheses' }
    override objectItems(): EngravingObject[] { return [this.m_chord, this.m_paren] }

    override redo(_ed: EditData | null): void {
        this.m_chord.removeNoteFromParenthesisInfo(this.m_note, this.m_paren)

        this.m_chord.triggerLayout()
    }

    override undo(_ed: EditData | null): void {
        this.m_chord.addNoteToParenthesisInfo(this.m_note, this.m_paren)

        this.m_chord.triggerLayout()
    }
}

noteParenthesesHooks.addChordParentheses = (chord, notes, addToLinked, generated) =>
    EditChord.addChordParentheses(chord, notes, addToLinked, generated)
noteParenthesesHooks.removeChordParentheses = (chord, notes, addToLinked, generated) =>
    EditChord.removeChordParentheses(chord, notes, addToLinked, generated)
