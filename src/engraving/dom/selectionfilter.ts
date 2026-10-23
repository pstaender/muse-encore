/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/selectionfilter.h/.cpp
 *
 * TODO(port): the voices and notes in chord filter types (and the UI of the selection filter); the element types
 * filter is ported (paste uses it).
 */

import type { Fraction } from '../types/fraction'
import { ElementType, type track_idx_t } from '../types/types'
import type { EngravingItem } from './engravingitem'
import type { Tuplet } from './tuplet'
import type { Chord } from './chord'

const NUM_ELEMENTS_SELECTION_FILTER_TYPES = 20
export enum ElementsSelectionFilterTypes {
    NONE = 0,
    DYNAMIC = 1 << 0,
    HAIRPIN = 1 << 1,
    FINGERING = 1 << 2,
    LYRICS = 1 << 3,
    CHORD_SYMBOL = 1 << 4,
    OTHER_TEXT = 1 << 5,
    ARTICULATION = 1 << 6,
    ORNAMENT = 1 << 7,
    SLUR = 1 << 8,
    TIE = 1 << 9,
    FIGURED_BASS = 1 << 10,
    OTTAVA = 1 << 11,
    PEDAL_LINE = 1 << 12,
    OTHER_LINE = 1 << 13,
    ARPEGGIO = 1 << 14,
    GLISSANDO = 1 << 15,
    FRET_DIAGRAM = 1 << 16,
    BREATH = 1 << 17,
    TREMOLO = 1 << 18,
    GRACE_NOTE = 1 << 19,
    ALL = ~(~0 << NUM_ELEMENTS_SELECTION_FILTER_TYPES),
}

interface FilterParams {
    otherFilter: number
    noneMask: number
    allMask: number
}

function isFilteredImpl(currentFilter: number, params: FilterParams): boolean {
    if (params.otherFilter === params.noneMask || params.otherFilter === params.allMask) {
        return currentFilter === params.otherFilter
    }
    return (currentFilter & params.otherFilter) !== 0
}

export class SelectionFilter {
    private m_includeSingleNotes = true
    private m_filteredElementsTypes: number = ElementsSelectionFilterTypes.ALL

    /** C++ isFiltered(ElementsSelectionFilterTypes) (voices and notes in chord: TODO(port)) */
    isFiltered(type: ElementsSelectionFilterTypes): boolean {
        return isFilteredImpl(this.m_filteredElementsTypes,
            { otherFilter: type, noneMask: ElementsSelectionFilterTypes.NONE, allMask: ElementsSelectionFilterTypes.ALL })
    }

    setFiltered(type: ElementsSelectionFilterTypes, filtered: boolean): void {
        let otherFilter: number = type
        if (otherFilter === ElementsSelectionFilterTypes.NONE) {
            otherFilter = ElementsSelectionFilterTypes.ALL
            filtered = !filtered
        }
        this.m_filteredElementsTypes = filtered ? (this.m_filteredElementsTypes | otherFilter) : (this.m_filteredElementsTypes & ~otherFilter)
    }

    includeSingleNotes(): boolean { return this.m_includeSingleNotes }
    setIncludeSingleNotes(include: boolean): void { this.m_includeSingleNotes = include }

    /** the element types are filtered (= selectable) by default */
    canSelect(e: EngravingItem): boolean {
        switch (e.type()) {
        case ElementType.DYNAMIC:
            return this.isFiltered(ElementsSelectionFilterTypes.DYNAMIC)
        case ElementType.HAIRPIN:
        case ElementType.HAIRPIN_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.HAIRPIN)
        case ElementType.ARTICULATION:
        case ElementType.TAPPING:
        case ElementType.VIBRATO:
        case ElementType.VIBRATO_SEGMENT:
        case ElementType.FERMATA:
            return this.isFiltered(ElementsSelectionFilterTypes.ARTICULATION)
        case ElementType.ORNAMENT:
        case ElementType.TRILL:
        case ElementType.TRILL_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.ORNAMENT)
        case ElementType.LYRICS:
        case ElementType.LYRICSLINE:
        case ElementType.LYRICSLINE_SEGMENT:
        case ElementType.PARTIAL_LYRICSLINE:
        case ElementType.PARTIAL_LYRICSLINE_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.LYRICS)
        case ElementType.FINGERING:
            return this.isFiltered(ElementsSelectionFilterTypes.FINGERING)
        case ElementType.HARMONY:
            return this.isFiltered(ElementsSelectionFilterTypes.CHORD_SYMBOL)
        case ElementType.SLUR:
        case ElementType.SLUR_SEGMENT:
        case ElementType.HAMMER_ON_PULL_OFF:
        case ElementType.HAMMER_ON_PULL_OFF_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.SLUR)
        case ElementType.TIE:
        case ElementType.TIE_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.TIE)
        case ElementType.FIGURED_BASS:
            return this.isFiltered(ElementsSelectionFilterTypes.FIGURED_BASS)
        case ElementType.OTTAVA:
        case ElementType.OTTAVA_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.OTTAVA)
        case ElementType.PEDAL:
        case ElementType.PEDAL_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.PEDAL_LINE)
        case ElementType.ARPEGGIO:
        case ElementType.CHORD_BRACKET:
            return this.isFiltered(ElementsSelectionFilterTypes.ARPEGGIO)
        case ElementType.GLISSANDO:
        case ElementType.GLISSANDO_SEGMENT:
            return this.isFiltered(ElementsSelectionFilterTypes.GLISSANDO)
        case ElementType.FRET_DIAGRAM:
            return this.isFiltered(ElementsSelectionFilterTypes.FRET_DIAGRAM)
        case ElementType.BREATH:
            return this.isFiltered(ElementsSelectionFilterTypes.BREATH)
        case ElementType.TREMOLO_SINGLECHORD:
        case ElementType.TREMOLO_TWOCHORD:
            return this.isFiltered(ElementsSelectionFilterTypes.TREMOLO)
        default: break
        }

        // Special cases...
        if (e.isTextBase()) {
            return this.isFiltered(ElementsSelectionFilterTypes.OTHER_TEXT)
        }

        if (e.isSLine() || e.isSLineSegment()) { // NoteLine, Volta
            return this.isFiltered(ElementsSelectionFilterTypes.OTHER_LINE)
        }

        if (e.isChord() && (e as unknown as Chord).isGrace()) {
            return this.isFiltered(ElementsSelectionFilterTypes.GRACE_NOTE)
        }

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
