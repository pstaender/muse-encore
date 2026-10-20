/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/selectionfilter.h/.cpp
 *
 * TODO(port): the filter types (voices, notes in chord, element types) and setFiltered; this is the default
 * filter of a score, which lets everything be selected.
 */

import type { Fraction } from '../types/fraction'
import type { track_idx_t } from '../types/types'
import type { EngravingItem } from './engravingitem'
import type { Tuplet } from './tuplet'
import type { Chord } from './chord'

export class SelectionFilter {
    private m_includeSingleNotes = true

    includeSingleNotes(): boolean { return this.m_includeSingleNotes }
    setIncludeSingleNotes(include: boolean): void { this.m_includeSingleNotes = include }

    /** all element types are filtered (= selectable) by default */
    canSelect(_e: EngravingItem): boolean {
        return true
    }

    canSelectNoteIdx(_noteIdx: number, totalNotesInChord: number, selectionContainsMultiNoteChords: boolean): boolean {
        if (totalNotesInChord === 1) {
            //! NOTE: Always include single notes when the selection consists solely of single notes...
            return this.m_includeSingleNotes || !selectionContainsMultiNoteChords
        }
        return true
    }

    canSelectTuplet(tuplet: Tuplet, selectionRangeStart: Fraction, selectionRangeEnd: Fraction,
        selectionContainsMultiNoteChords: boolean): boolean {
        // Tuplets are selectable if all of their contained elements are selectable...
        for (const element of tuplet.elements()) {
            if (element.tick().lt(selectionRangeStart) || element.tick().ge(selectionRangeEnd)) {
                return false
            }
            if (element.isChord()) {
                const notes = (element as unknown as Chord).notes()
                for (let noteIdx = 0; noteIdx < notes.length; ++noteIdx) {
                    if (!this.canSelectNoteIdx(noteIdx, notes.length, selectionContainsMultiNoteChords)) {
                        return false
                    }
                }
            } else if (element.isRest()) {
                if (!this.canSelect(element)) {
                    return false
                }
            } else if (element.isTuplet()) {
                if (!this.canSelectTuplet(element as unknown as Tuplet, selectionRangeStart, selectionRangeEnd,
                    selectionContainsMultiNoteChords)) {
                    return false
                }
            }
        }
        return true
    }

    canSelectVoice(_track: track_idx_t): boolean {
        return true
    }
}
