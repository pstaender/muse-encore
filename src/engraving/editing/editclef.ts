/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editclef.h/.cpp
 */

import { SegmentType, type Segment } from '../dom/segment'
import { VOICES, type ClefType, type track_idx_t } from '../types/types'
import type { Clef } from '../dom/clef'
import type { Chord } from '../dom/chord'
import type { EngravingObject } from '../dom/engravingobject'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

/** compute line position of noteheads after clef change */
function updateNoteLines(segment: Segment, track: track_idx_t): void {
    const staff = segment.score().staff(Math.trunc(track / VOICES))!
    if (staff.isDrumStaff(segment.tick()) || staff.isTabStaff(segment.tick())) {
        return
    }
    for (let s = segment.next1(); s; s = s.next1()) {
        if ((s.segmentType() & (SegmentType.Clef | SegmentType.HeaderClef)) && s.element(track) && !s.element(track)!.generated()) {
            break
        }
        if (!s.isChordRestType()) {
            continue
        }
        for (let t = track; t < track + VOICES; ++t) {
            const e = s.element(t)
            if (e && e.isChord()) {
                const chord = e as unknown as Chord
                for (const n of chord.notes()) {
                    n.updateLine()
                }
                chord.sortNotes()
                for (const gc of chord.graceNotes()) {
                    for (const gn of gc.notes()) {
                        gn.updateLine()
                    }
                    gc.sortNotes()
                }
            }
        }
    }
}

export class ChangeClefType extends UndoCommand {
    private clef: Clef
    private concertClef: ClefType
    private transposingClef: ClefType

    constructor(c: Clef, cl: ClefType, tc: ClefType) {
        super()
        this.clef = c
        this.concertClef = cl
        this.transposingClef = tc
    }

    override type(): CommandType { return CommandType.ChangeClefType }
    override name(): string { return 'ChangeClef' }
    override objectItems(): EngravingObject[] { return [this.clef] }

    protected override flip(_ed: EditData | null): void {
        const ocl = this.clef.concertClef()
        const otc = this.clef.transposingClef()

        this.clef.setConcertClef(this.concertClef)
        this.clef.setTransposingClef(this.transposingClef)

        this.clef.staff()!.setClef(this.clef)
        const segment = this.clef.segment()!
        updateNoteLines(segment, this.clef.track())
        this.clef.triggerLayoutAll() // TODO: reduce layout to clef range

        this.concertClef = ocl
        this.transposingClef = otc
    }
}
