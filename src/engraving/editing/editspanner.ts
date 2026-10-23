/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/editspanner.h/.cpp
 */

import { SpannerAnchor, type Spanner } from '../dom/spanner'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Note } from '../dom/note'
import type { Tie } from '../dom/tie'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class ChangeSpannerElements extends UndoCommand {
    constructor(private spanner: Spanner, private startElement: EngravingItem | null, private endElement: EngravingItem | null) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeSpannerElements }
    override name(): string { return 'ChangeSpannerElements' }
    override objectItems(): EngravingObject[] { return [this.spanner] }

    protected override flip(_ed: EditData | null): void {
        const spanner = this.spanner
        const oldStartElement = spanner.startElement()
        const oldEndElement = spanner.endElement()
        const isPartialSpanner = spanner.isPartialTie() || spanner.isLaissezVib()
        if (spanner.anchor() === SpannerAnchor.NOTE) {
            // be sure new spanner elements are of the right type
            if (!isPartialSpanner && (!this.startElement || !this.startElement.isNote() || !this.endElement
                || !this.endElement.isNote())) {
                return
            }
            const oldStartNote = oldStartElement as unknown as Note | null
            const oldEndNote = oldEndElement as unknown as Note | null
            const newStartNote = this.startElement as unknown as Note | null
            const newEndNote = this.endElement as unknown as Note | null
            // update spanner's start and end notes
            if ((newStartNote && newEndNote) || (isPartialSpanner && (newStartNote || newEndNote))) {
                spanner.setNoteSpan(newStartNote, newEndNote)
                if (spanner.isTie()) {
                    const tie = spanner as unknown as Tie
                    if (oldStartNote && newStartNote) {
                        oldStartNote.setTieFor(null)
                        newStartNote.setTieFor(tie)
                    }
                    if (oldEndNote && newEndNote) {
                        oldEndNote.setTieBack(null)
                        newEndNote.setTieBack(tie)
                    }
                } else {
                    oldStartNote!.removeSpannerFor(spanner)
                    oldEndNote!.removeSpannerBack(spanner)
                    newStartNote!.addSpannerFor(spanner)
                    newEndNote!.addSpannerBack(spanner)
                    // TODO(port): glissando -> oldEndNote->chord()->updateEndsNoteAnchoredLine()
                }
            }
        } else {
            spanner.setStartElement(this.startElement)
            spanner.setEndElement(this.endElement)
        }
        this.startElement = oldStartElement
        this.endElement = oldEndElement
        spanner.triggerLayout()
    }
}

export class ChangeStartEndSpanner extends UndoCommand {
    constructor(private spanner: Spanner, private start: EngravingItem | null, private end: EngravingItem | null) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeStartEndSpanner }
    override name(): string { return 'ChangeStartEndSpanner' }
    override objectItems(): EngravingObject[] { return [this.spanner] }

    protected override flip(_ed: EditData | null): void {
        const s = this.spanner.startElement()
        const e = this.spanner.endElement()
        this.spanner.setStartElement(this.start)
        this.spanner.setEndElement(this.end)
        this.start = s
        this.end = e
    }
}
