/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/inspector/internal/elementrepositoryservice.h/.cpp: the selected elements and the elements the
 * inspector models work on (e.g. the chords, stems and beams of selected notes, the spanners of line segments).
 */

import type { Beam } from '../../engraving/dom/beam'
import type { Bracket } from '../../engraving/dom/bracket'
import type { Chord } from '../../engraving/dom/chord'
import type { EngravingItem } from '../../engraving/dom/engravingitem'
import type { LayoutBreak } from '../../engraving/dom/layoutbreak'
import type { Score } from '../../engraving/dom/score'
import { SelState } from '../../engraving/dom/select'
import type { SpannerSegment } from '../../engraving/dom/spanner'
import type { TextLineBaseSegment } from '../../engraving/dom/textlinebase'
import type { Trill, TrillSegment } from '../../engraving/dom/trill'
import { ElementType, LayoutBreakType } from '../../engraving/types/types'
import type { IElementRepositoryService } from '../abstractinspectormodel'
import { TEXT_ELEMENT_TYPES } from '../types/texttypes'

const LINE_TYPE_TO_SEGMENT_TYPE = new Map<ElementType, ElementType>([
    [ElementType.GLISSANDO, ElementType.GLISSANDO_SEGMENT],
    [ElementType.VIBRATO, ElementType.VIBRATO_SEGMENT],
    [ElementType.PEDAL, ElementType.PEDAL_SEGMENT],
    [ElementType.HAIRPIN, ElementType.HAIRPIN_SEGMENT],
    [ElementType.VOLTA, ElementType.VOLTA_SEGMENT],
    [ElementType.LET_RING, ElementType.LET_RING_SEGMENT],
    [ElementType.PALM_MUTE, ElementType.PALM_MUTE_SEGMENT],
    [ElementType.OTTAVA, ElementType.OTTAVA_SEGMENT],
    [ElementType.TEXTLINE, ElementType.TEXTLINE_SEGMENT],
    [ElementType.TEXTLINE_BASE, ElementType.TEXTLINE_SEGMENT],
    [ElementType.NOTELINE, ElementType.NOTELINE_SEGMENT],
    [ElementType.SLUR, ElementType.SLUR_SEGMENT],
    [ElementType.HAMMER_ON_PULL_OFF, ElementType.HAMMER_ON_PULL_OFF_SEGMENT],
    [ElementType.TIE, ElementType.TIE_SEGMENT],
    [ElementType.LAISSEZ_VIB, ElementType.LAISSEZ_VIB_SEGMENT],
    [ElementType.PARTIAL_TIE, ElementType.PARTIAL_TIE_SEGMENT],
    [ElementType.GRADUAL_TEMPO_CHANGE, ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT],
    [ElementType.LYRICSLINE, ElementType.LYRICSLINE_SEGMENT],
    [ElementType.PARTIAL_LYRICSLINE, ElementType.PARTIAL_LYRICSLINE_SEGMENT],
])

/** a list without duplicates in insertion order (QSet -> QList in C++, whose order is unspecified) */
function unique<T>(list: T[]): T[] {
    return [...new Set(list)]
}

export class ElementRepositoryService implements IElementRepositoryService {
    private m_rawElementList: EngravingItem[] = []
    private m_exposedElementList: EngravingItem[] = []
    private m_selectionState = SelState.NONE
    private m_score: Score | null = null

    score(): Score | null {
        return this.m_score
    }

    setScore(score: Score | null): void {
        this.m_score = score
    }

    needUpdateElementList(newRawElementList: readonly EngravingItem[], selectionState: SelState): boolean {
        return this.m_selectionState !== selectionState || this.m_rawElementList.length !== newRawElementList.length
            || this.m_rawElementList.some((e, i) => e !== newRawElementList[i])
    }

    updateElementList(newRawElementList: readonly EngravingItem[], selectionState: SelState): boolean {
        if (!this.needUpdateElementList(newRawElementList, selectionState)) {
            return false
        }
        this.m_exposedElementList = this.exposeRawElements(newRawElementList)
        this.m_rawElementList = [...newRawElementList]
        this.m_selectionState = selectionState
        return true
    }

    isRangeSelection(): boolean {
        return this.m_selectionState === SelState.RANGE
    }

    findElementsByType(elementType: ElementType, filter?: (e: EngravingItem) => boolean): EngravingItem[] {
        const list = this.findElementsByTypeUnfiltered(elementType)
        return filter ? list.filter(filter) : list
    }

    private findElementsByTypeUnfiltered(elementType: ElementType): EngravingItem[] {
        switch (elementType) {
        case ElementType.CHORD: return this.findChords()
        case ElementType.NOTE: return this.findNotes()
        case ElementType.NOTEHEAD: return this.findNoteHeads()
        case ElementType.STEM: return this.findStems()
        case ElementType.HOOK: return this.findHooks()
        case ElementType.BEAM: return this.findBeams()
        case ElementType.STAFF: return this.findStaffs()
        // page and line breaks are of type LAYOUT_BREAK too, but they don't appear in the inspector for now
        case ElementType.LAYOUT_BREAK: return this.findSectionBreaks()
        case ElementType.TEXT: return this.findTexts()
        case ElementType.BRACKET: return this.findBrackets()
        case ElementType.REST: return this.findRests()
        case ElementType.ORNAMENT: return this.findOrnaments()
        case ElementType.LYRICS: return this.findLyrics()
        default:
            if (LINE_TYPE_TO_SEGMENT_TYPE.has(elementType) || elementType === ElementType.WHAMMY_BAR) {
                return this.findLines(elementType)
            }
            return this.m_exposedElementList.filter(e => e.type() === elementType)
        }
    }

    takeAllElements(): EngravingItem[] {
        return this.m_exposedElementList
    }

    private exposeRawElements(rawElementList: readonly EngravingItem[]): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of rawElementList) {
            // instrument names can't survive the layout process
            if (element.type() === ElementType.INSTRUMENT_NAME) {
                continue
            }
            if (element.type() === ElementType.BRACKET) {
                result.push((element as unknown as Bracket).bracketItem() as unknown as EngravingItem)
                continue
            }
            result.push(element)
        }
        return result
    }

    private findChords(): EngravingItem[] {
        const elements: EngravingItem[] = []
        for (const element of this.m_exposedElementList) {
            if (element.type() === ElementType.CHORD) {
                elements.push(element)
                continue
            }
            if (element.type() === ElementType.BEAM) {
                for (const cr of (element as unknown as Beam).elements()) {
                    if (cr.isChord()) {
                        elements.push(cr as unknown as EngravingItem)
                    }
                }
                continue
            }
            const chord = element.findAncestor(ElementType.CHORD)
            if (chord) {
                elements.push(chord)
            }
        }
        return unique(elements)
    }

    private findNotes(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.m_rawElementList) {
            if (element.isNote()) {
                result.push(element)
                continue
            }
            const elementBase = element.elementBase()
            if (elementBase.isChord()) {
                result.push(...(elementBase as unknown as Chord).notes() as unknown as EngravingItem[])
            } else if (elementBase.isBeam()) {
                for (const cr of (elementBase as unknown as Beam).elements()) {
                    if (cr.isChord()) {
                        result.push(...(cr as unknown as Chord).notes() as unknown as EngravingItem[])
                    }
                }
            }
        }
        return result
    }

    private findNoteHeads(): EngravingItem[] {
        return this.m_rawElementList.filter(e => e.isNote())
    }

    private findStems(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.findChords()) {
            const stem = (element as unknown as Chord).stem()
            if (stem) {
                result.push(stem as unknown as EngravingItem)
            }
        }
        return result
    }

    private findHooks(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.findChords()) {
            const hook = (element as unknown as Chord).hook()
            if (hook) {
                result.push(hook as unknown as EngravingItem)
            }
        }
        return result
    }

    private findBeams(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.findChords()) {
            const beam = element.isChord() ? (element as unknown as Chord).beam() as unknown as EngravingItem | null
                : element.isBeam() ? element : null
            if (beam && !result.includes(beam)) {
                result.push(beam)
            }
        }
        return result
    }

    private findLines(lineType: ElementType): EngravingItem[] {
        const result: EngravingItem[] = []
        const segmentType = lineType === ElementType.WHAMMY_BAR ? ElementType.WHAMMY_BAR_SEGMENT : LINE_TYPE_TO_SEGMENT_TYPE.get(lineType)
        for (const element of this.m_exposedElementList) {
            if (element.type() === segmentType || (lineType === ElementType.TEXTLINE_BASE && element.isTextLineBaseSegment())) {
                const line = (element as unknown as SpannerSegment).spanner()
                if (line) {
                    result.push(line as unknown as EngravingItem)
                }
            } else if (element.type() === lineType) {
                result.push(element)
            }
        }
        return result
    }

    private findStaffs(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.m_exposedElementList) {
            const staff = element.staff()
            if (staff) {
                result.push(staff as unknown as EngravingItem)
            }
        }
        return result
    }

    private findSectionBreaks(): EngravingItem[] {
        return this.m_exposedElementList.filter(e => e.type() === ElementType.LAYOUT_BREAK
            && (e as unknown as LayoutBreak).layoutBreakType() === LayoutBreakType.SECTION)
    }

    private findTextDelegates(element: EngravingItem): EngravingItem[] {
        if (element.isTextLineBaseSegment()) {
            const items: EngravingItem[] = []
            const tl = (element as unknown as TextLineBaseSegment).textLineBase()
            for (const seg of tl.spannerSegments()) {
                const s = seg as unknown as TextLineBaseSegment
                if (s.text()) {
                    items.push(s.text() as unknown as EngravingItem)
                }
                if (s.endText()) {
                    items.push(s.endText() as unknown as EngravingItem)
                }
            }
            return items
        }
        // TODO(port): the play count text of a barline (no PlayCountText yet)
        if (TEXT_ELEMENT_TYPES.includes(element.type())) {
            return [element]
        }
        return []
    }

    private findTexts(): EngravingItem[] {
        return this.m_exposedElementList.flatMap(e => this.findTextDelegates(e))
    }

    private findBrackets(): EngravingItem[] {
        return this.m_exposedElementList.filter(e => e.isBracketItem())
    }

    private findRests(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.m_exposedElementList) {
            if (element.isRest()) {
                result.push(element)
            } else if (element.isBeam()) {
                for (const cr of (element as unknown as Beam).elements()) {
                    if (cr.isRest()) {
                        result.push(cr as unknown as EngravingItem)
                    }
                }
            }
        }
        return result
    }

    private findOrnaments(): EngravingItem[] {
        const result: EngravingItem[] = []
        for (const element of this.m_exposedElementList) {
            if (element.isOrnament()) {
                result.push(element)
            } else if (element.isTrill()) {
                const o = (element as unknown as Trill).ornament()
                if (o) {
                    result.push(o as unknown as EngravingItem)
                }
            } else if (element.isTrillSegment()) {
                const o = (element as unknown as TrillSegment).trill().ornament()
                if (o) {
                    result.push(o as unknown as EngravingItem)
                }
            }
        }
        return result
    }

    private findLyrics(): EngravingItem[] {
        return this.m_exposedElementList.filter(e => e.isLyrics())
    }
}
