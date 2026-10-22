/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationelements.h/.cpp: the elements of the score matching the filter options of
 * "Select similar" and the select dialogs.
 * TODO(port): search() (SearchCommandsParser: the "Go to" search of the notation view)
 */

import { ElementPattern, NotePattern } from '../../engraving/dom/select'
import { Score } from '../../engraving/dom/score'
import { nidx } from '../../engraving/types/types'
import { SegmentType } from '../../engraving/dom/segment'
import { FilterNotesOptions, type FilterElementsOptions } from '../notationtypes'
import type { EngravingItem } from '../../engraving/dom/engravingitem'
import type { Measure } from '../../engraving/dom/measure'
import type { Page } from '../../engraving/dom/page'
import type { RehearsalMark } from '../../engraving/dom/rehearsalmark'
import type { TextBase } from '../../engraving/dom/textbase'

/** C++ -1 (int) of the filter options -> muse::nidx of the patterns */
function toIdx(v: number): number {
    return v < 0 ? nidx : v
}

export class NotationElements {
    constructor(private m_score: Score) {}

    msScore(): Score { return this.m_score }

    elements(elementsOptions: FilterElementsOptions | null = null): EngravingItem[] {
        if (!elementsOptions) {
            return this.allScoreElements()
        }

        // todo: add check for range search

        if (elementsOptions instanceof FilterNotesOptions) {
            return this.filterNotes(elementsOptions)
        }
        return this.filterElements(elementsOptions)
    }

    rehearsalMark(name: string): RehearsalMark | null {
        const qname = name.toLowerCase()

        for (let segment = this.score().firstSegment(SegmentType.ChordRest); segment;
            segment = segment.next1(SegmentType.ChordRest)) {
            for (const element of segment.annotations()) {
                if (!element.isRehearsalMark()) {
                    continue
                }

                const rehearsalMark = element as unknown as RehearsalMark
                const rehearsalMarkName = (rehearsalMark as unknown as TextBase).plainText().toLowerCase()
                if (rehearsalMarkName.startsWith(qname)) {
                    return rehearsalMark
                }
            }
        }

        return null
    }

    measure(measureIndex: number): Measure | null {
        return this.score().crMeasure(measureIndex)
    }

    pages(): Page[] {
        return this.score().pages()
    }

    page(pageIndex: number): Page | null {
        if (pageIndex < 0 || pageIndex >= this.score().pages().length) {
            return null
        }

        return this.score().pages()[pageIndex]
    }

    private allScoreElements(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const page of this.score().pages()) {
            for (const element of page.elements()) {
                result.push(element)
            }
        }

        return result
    }

    private filterElements(elementsOptions: FilterElementsOptions): EngravingItem[] {
        const pattern = this.constructElementPattern(elementsOptions)

        this.score().scanElements(item => Score.collectMatch(pattern, item))

        return [...pattern.el]
    }

    private filterNotes(notesOptions: FilterNotesOptions): EngravingItem[] {
        const pattern = this.constructNotePattern(notesOptions)

        this.score().scanElements(item => Score.collectNoteMatch(pattern, item))

        return [...pattern.el]
    }

    private score(): Score {
        return this.m_score
    }

    private constructElementPattern(elementOptions: FilterElementsOptions): ElementPattern {
        const pattern = new ElementPattern()
        pattern.type = elementOptions.elementType
        pattern.subtype = elementOptions.subtype
        pattern.subtypeValid = elementOptions.bySubtype
        pattern.staffStart = toIdx(elementOptions.staffStart)
        pattern.staffEnd = toIdx(elementOptions.staffEnd)
        pattern.voice = toIdx(elementOptions.voice)
        pattern.system = elementOptions.system
        pattern.durationTicks = elementOptions.durationTicks
        pattern.beat = elementOptions.beat
        pattern.measure = elementOptions.measure

        return pattern
    }

    private constructNotePattern(notesOptions: FilterNotesOptions): NotePattern {
        const pattern = new NotePattern()
        pattern.pitch = notesOptions.pitch
        pattern.string = notesOptions.string
        pattern.tpc = notesOptions.tpc
        pattern.notehead = notesOptions.notehead
        pattern.durationType = notesOptions.durationType
        pattern.durationTicks = notesOptions.durationTicks
        pattern.noteType = notesOptions.noteType
        pattern.staffStart = toIdx(notesOptions.staffStart)
        pattern.staffEnd = toIdx(notesOptions.staffEnd)
        pattern.voice = toIdx(notesOptions.voice)
        pattern.system = notesOptions.system
        pattern.beat = notesOptions.beat
        pattern.measure = notesOptions.measure

        return pattern
    }
}
