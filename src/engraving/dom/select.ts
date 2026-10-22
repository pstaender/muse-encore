/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/select.h/.cpp (and SelectType of mscore.h)
 *
 * TODO(port): lock reasons are
 * kept but not checked by callers (no editing yet). There is no refresh rectangle tracking (Score::addRefresh):
 * the UI repaints the selection bounds.
 */

import { Fraction } from '../types/fraction'
import { Sid } from '../style/styledef'
import { INVALID_STRING_INDEX, NoteHeadGroup, VOICES, nidx, staff2track, type staff_idx_t, type track_idx_t, type voice_idx_t } from '../types/types'
import { TDuration } from './durationtype'
import { NoteType } from './chordrest'
import { Tpc } from './pitchspelling'
import { collectElementsAnchoredToChordRest, collectElementsAnchoredToNote, noteAnchoredSpannerIsInRange } from './utils'
import type { Score } from './score'
import type { EngravingItem } from './engravingitem'
import { SegmentType, type Segment } from './segment'
import type { ChordRest } from './chordrest'
import type { Chord } from './chord'
import type { Note } from './note'
import type { Rest } from './rest'
import type { Measure } from './measure'
import type { MeasureBase } from './measurebase'
import type { System } from './system'
import type { Tuplet } from './tuplet'
import type { Spanner, SpannerSegment } from './spanner'
import type { GuitarBend } from './guitarbend'
import type { FretDiagram } from './fret'
import type { SelectionFilter } from './selectionfilter'
import { ElementType } from '../types/types'
import { MScore, MsError, mimeStaffListFormat, mimeSymbolFormat, mimeSymbolListFormat } from './mscore'
import { RWRegister } from '../rw/rwregister'
import type { XmlWriter } from '../rw/xmlwriter'
import type { Lyrics } from './lyrics'
import type { Fermata } from './fermata'
import type { Breath } from './breath'
import type { StaffTextBase } from './stafftextbase'
import type { Expression } from './expression'
import type { Dynamic } from './dynamic'
import type { TremoloTwoChord } from './tremolotwochord'

/** C++ SelectType (mscore.h) */
export class ElementPattern {
    el: EngravingItem[] = []
    type = 0
    subtype = 0
    staffStart: staff_idx_t = 0
    staffEnd: staff_idx_t = 0 // exclusive
    voice: voice_idx_t = 0
    subtypeValid = false
    durationTicks = new Fraction(-1, 1)
    beat = new Fraction(0, 0)
    measure: Measure | null = null
    system: System | null = null
}

export class NotePattern extends ElementPattern {
    declare el: Note[]
    pitch = -1
    string = INVALID_STRING_INDEX
    tpc: number = Tpc.TPC_INVALID
    notehead = NoteHeadGroup.HEAD_INVALID
    durationType = new TDuration()
    noteType = NoteType.INVALID // C++ type (hides ElementPattern::type)
}

export enum SelectType {
    SINGLE, RANGE, ADD, REPLACE,
}

export enum SelState {
    NONE,     // nothing is selected
    LIST,     // disjoint selection
    RANGE,    // adjacent selection, a range in one or more staves is selected
}

/**
 * For SelState::LIST state only visible elements can be selected (no Chord element etc.).
 */
export class Selection {
    private m_score: Score
    private m_state = SelState.NONE
    private m_el: EngravingItem[] = [] // valid in mode SelState::LIST

    private m_staffStart: staff_idx_t = 0 // valid if selState is SelState::RANGE
    private m_staffEnd: staff_idx_t = 0
    private m_startSegment: Segment | null = null
    private m_endSegment: Segment | null = null // next segment after selection

    // Will be actually selected on updateSelectedElements() call. Used by setRangeTicks() to restore proper selection
    // after command end in case some changes are expected to segments' structure (e.g. MMRests reconstruction).
    private m_plannedTick1 = new Fraction(-1, 1)
    private m_plannedTick2 = new Fraction(-1, 1)

    private m_activeSegment: Segment | null = null
    private m_activeTrack: track_idx_t = 0

    private m_currentTick = new Fraction(-1, 1) // tracks the most recent selection
    private m_currentTrack: track_idx_t = 0

    private m_rangeContainsMultiNoteChords = false // cached - calculating this isn't free

    private m_lockReason = ''

    constructor(s: Score) {
        this.m_score = s
    }

    score(): Score { return this.m_score }
    state(): SelState { return this.m_state }
    isNone(): boolean { return this.m_state === SelState.NONE }
    isRange(): boolean { return this.m_state === SelState.RANGE }
    isList(): boolean { return this.m_state === SelState.LIST }

    //! NOTE If locked, the selected items should not be changed.
    lock(reason: string): void { this.m_lockReason = reason }
    unlock(_reason: string): void { this.m_lockReason = '' }
    isLocked(): boolean { return this.m_lockReason.length > 0 }
    lockReason(): string { return this.m_lockReason }

    elements(): readonly EngravingItem[] { return this.m_el }

    elementsSelected(types: readonly ElementType[]): boolean {
        for (const element of this.m_el) {
            if (types.includes(element.type())) {
                return true
            }
        }

        return false
    }
    /** C++ elements(ElementType) */
    elementsOfType(type: number): EngravingItem[] { return this.m_el.filter(e => e.type() === type) }

    isSingle(): boolean { return this.m_state === SelState.LIST && this.m_el.length === 1 }

    startSegment(): Segment | null { return this.m_startSegment }
    endSegment(): Segment | null { return this.m_endSegment }
    setStartSegment(s: Segment | null): void { this.m_startSegment = s }
    setEndSegment(s: Segment | null): void { this.m_endSegment = s }
    activeSegment(): Segment | null { return this.m_activeSegment }
    setActiveSegment(s: Segment | null): void { this.m_activeSegment = s }
    staffStart(): staff_idx_t { return this.m_staffStart }
    staffEnd(): staff_idx_t { return this.m_staffEnd }
    activeTrack(): track_idx_t { return this.m_activeTrack }
    setStaffStart(v: staff_idx_t): void { this.m_staffStart = v }
    setStaffEnd(v: staff_idx_t): void { this.m_staffEnd = v }
    setActiveTrack(v: track_idx_t): void { this.m_activeTrack = v }

    private selectionFilter(): SelectionFilter { return this.m_score.selectionFilter() }
    private canSelect(e: EngravingItem): boolean { return this.selectionFilter().canSelect(e) }
    private canSelectVoice(track: track_idx_t): boolean { return this.selectionFilter().canSelectVoice(track) }
    private canSelectNoteIdx(noteIdx: number, totalNotesInChord: number, rangeContainsMultiNoteChords: boolean): boolean {
        return this.selectionFilter().canSelectNoteIdx(noteIdx, totalNotesInChord, rangeContainsMultiNoteChords)
    }

    tickStart(): Fraction {
        switch (this.m_state) {
        case SelState.RANGE:
            return this.m_startSegment ? this.m_startSegment.tick() : new Fraction(-1, 1)
        case SelState.LIST: {
            const cr = this.firstChordRest()
            return cr ? cr.tick() : new Fraction(-1, 1)
        }
        default:
            return new Fraction(-1, 1)
        }
    }

    tickEnd(): Fraction {
        switch (this.m_state) {
        case SelState.RANGE: {
            if (this.m_endSegment) {
                return this.m_endSegment.tick()
            } else { // endsegment == 0 if end of score
                const m = this.m_score.lastMeasure()!
                return m.endTick()
            }
        }
        case SelState.LIST: {
            const cr = this.lastChordRest()
            return cr ? cr.segment().tick() : new Fraction(-1, 1)
        }
        default:
            return new Fraction(-1, 1)
        }
    }

    isStartActive(): boolean {
        return !!this.activeSegment() && this.activeSegment()!.tick().eq(this.tickStart())
    }

    isEndActive(): boolean {
        return !!this.activeSegment() && this.activeSegment()!.tick().eq(this.tickEnd())
    }

    element(): EngravingItem | null {
        return (this.state() !== SelState.RANGE && this.m_el.length === 1) ? this.m_el[0] : null
    }

    cr(): ChordRest | null {
        let e = this.element()
        if (!e) {
            return null
        }
        if (e.isNote()) {
            e = e.parentItem()
        }
        if (e && e.isChordRest()) {
            return e as unknown as ChordRest
        }
        return null
    }

    currentCR(): ChordRest | null {
        // no selection yet - start at very beginning, not first cr
        if (this.m_currentTick.eq(new Fraction(-1, 1))) {
            return null
        }
        const s = this.score().tick2rightSegment(this.m_currentTick, true)
        if (!s) {
            return null
        }
        let track = this.m_currentTrack
        // staff may have been removed - start at top
        if (track >= this.score().ntracks()) {
            track = 0
        }
        const e = s.element(track)
        return e && e.isChordRest() ? e as unknown as ChordRest : null
    }

    activeCR(): ChordRest | null {
        if (this.m_state !== SelState.RANGE || !this.m_activeSegment) {
            return null
        }
        if (this.m_activeSegment === this.m_startSegment) {
            return this.firstChordRest(this.m_activeTrack)
        } else {
            return this.lastChordRest(this.m_activeTrack)
        }
    }

    private firstChordRestInRange(preferredTrack: track_idx_t = nidx): ChordRest | null {
        if (!this.isRange()) {
            return null
        }

        let firstCRSegment: Segment | null = null

        for (let currSeg = this.m_startSegment; currSeg && currSeg !== this.m_endSegment; currSeg = currSeg.next1MM()) {
            if (!currSeg.enabled() || !currSeg.isChordRestType()) {
                continue
            }
            if (preferredTrack === nidx) {
                // no track specified, use the first CR segment we find...
                firstCRSegment = currSeg
                break
            }
            const e = currSeg.element(preferredTrack)
            if (e && e.isChordRest()) {
                return e as unknown as ChordRest
            }
        }

        if (!firstCRSegment) {
            return null
        }

        for (let track = staff2track(this.staffStart()); track < staff2track(this.staffEnd()); ++track) {
            const e = firstCRSegment.element(track)
            if (e && e.isChordRest()) {
                return e as unknown as ChordRest
            }
        }
        return null
    }

    private lastChordRestInRange(preferredTrack: track_idx_t = nidx): ChordRest | null {
        if (!this.isRange()) {
            return null
        }

        let lastCRSegment: Segment | null = null

        const lastMeasureMM = this.m_score.lastMeasureMM()
        const lastSegInScore = lastMeasureMM ? lastMeasureMM.last() : null
        let currSeg = this.m_endSegment ? this.m_endSegment.prev1MM() : lastSegInScore
        while (currSeg) {
            if (!currSeg.enabled() || !currSeg.isChordRestType()) {
                currSeg = currSeg.prev1MM()
                continue
            }
            if (preferredTrack === nidx) {
                // no track specified, use the first CR segment we find...
                lastCRSegment = currSeg
                break
            }
            const e = currSeg.element(preferredTrack)
            if (e && e.isChordRest()) {
                return e as unknown as ChordRest
            }
            currSeg = currSeg.prev1MM()
            if (currSeg === this.m_startSegment!.prev1MM()) {
                break
            }
        }

        if (!lastCRSegment) {
            return null
        }

        for (let track = staff2track(this.staffStart()); track < staff2track(this.staffEnd()); ++track) {
            const e = lastCRSegment.element(track)
            if (e && e.isChordRest()) {
                return e as unknown as ChordRest
            }
        }

        return null
    }

    firstChordRest(track: track_idx_t = nidx): ChordRest | null {
        if (this.isRange()) {
            return this.firstChordRestInRange(track)
        }
        if (this.m_el.length === 1) {
            const el = this.m_el[0]
            if (el.isNote()) {
                return el.explicitParent() as unknown as ChordRest
            } else if (el.isChordRest()) {
                return el as unknown as ChordRest
            }
            return null
        }
        let cr: ChordRest | null = null
        for (let el of this.m_el) {
            if (el.isNote()) {
                el = el.parentItem()!
            }
            if (el.isChordRest()) {
                if (track !== nidx && el.track() !== track) {
                    continue
                }
                if (cr) {
                    if ((el as unknown as ChordRest).tick().lt(cr.tick())) {
                        cr = el as unknown as ChordRest
                    }
                } else {
                    cr = el as unknown as ChordRest
                }
            }
        }
        return cr
    }

    lastChordRest(track: track_idx_t = nidx): ChordRest | null {
        if (this.isRange()) {
            return this.lastChordRestInRange(track)
        }
        if (this.m_el.length === 1) {
            const el = this.m_el[0]
            if (el) {
                if (el.isNote()) {
                    return el.explicitParent() as unknown as ChordRest
                } else if (el.isChordRest()) {
                    return el as unknown as ChordRest
                }
            }
            return null
        }
        let cr: ChordRest | null = null
        for (let el of this.m_el) {
            if (el.isNote()) {
                el = (el as unknown as Note).chord()
            }
            if (el.isChordRest() && (el as unknown as ChordRest).segment().isChordRestType()) {
                if (track !== nidx && el.track() !== track) {
                    continue
                }
                if (cr) {
                    if ((el as unknown as ChordRest).tick().ge(cr.tick())) {
                        cr = el as unknown as ChordRest
                    }
                } else {
                    cr = el as unknown as ChordRest
                }
            }
        }
        return cr
    }

    findMeasure(): Measure | null {
        let m: Measure | null = null
        if (this.m_el.length > 0) {
            const el = this.m_el[0]
            m = el.findMeasure()
        }
        return m
    }

    startMeasureBase(): MeasureBase | null {
        const selectionElement = this.element()
        if (selectionElement) {
            if (selectionElement.isHBox()) {
                return selectionElement as unknown as MeasureBase
            }
            const mb = selectionElement.findMeasureBase()
            if (mb) {
                return mb
            }
        }

        if (this.tickStart().negative()) { // Tick is not set
            return null
        }

        const mmrests = this.m_score.style().styleB(Sid.createMultiMeasureRests)
        const refTick = this.tickStart()

        return mmrests ? this.m_score.tick2measureMM(refTick) : this.m_score.tick2measure(refTick)
    }

    endMeasureBase(): MeasureBase | null {
        const selectionElement = this.element()
        if (selectionElement) {
            if (selectionElement.isHBox()) {
                return selectionElement as unknown as MeasureBase
            }
            const mb = selectionElement.findMeasureBase()
            if (mb) {
                return mb
            }
        }

        if (this.tickEnd().negative()) { // Tick is not set
            return null
        }

        const mmrests = this.m_score.style().styleB(Sid.createMultiMeasureRests)
        const refTick = this.tickEnd().minus(Fraction.eps())

        return mmrests ? this.m_score.tick2measureMM(refTick) : this.m_score.tick2measure(refTick)
    }

    selectedSystems(): System[] {
        // TODO(port): system lock indicators
        const startMB = this.startMeasureBase()
        const endMB = this.endMeasureBase()
        if (!startMB || !endMB) {
            return []
        }

        const mmrests = this.score().style().styleB(Sid.createMultiMeasureRests)
        const systems: System[] = []
        for (let mb: MeasureBase | null = startMB; mb && mb.isBeforeOrEqual(endMB); mb = mmrests ? mb.nextMM() : mb.next()) {
            const sys = mb.system()
            if ((mb.isMeasure() || mb.isHBox()) && sys && (systems.length === 0 || sys !== systems[systems.length - 1])) {
                systems.push(sys)
            }
        }

        return systems
    }

    deselectAll(): void {
        // C++: if (m_state == SelState::RANGE) m_score->setUpdateAll();
        this.clear()
        this.updateState()
    }

    clear(): void {
        if (this.isLocked()) {
            return
        }

        for (const e of this.m_el) {
            e.setSelected(false)
            if (e.isSpanner()) { // TODO: only visible elements should be selectable?
                for (const s of (e as unknown as Spanner).spannerSegments()) {
                    s.setSelected(false)
                }
            }
        }
        this.m_el = []
        this.m_startSegment = null
        this.m_endSegment = null
        this.m_activeSegment = null
        this.m_staffStart = 0
        this.m_staffEnd = 0
        this.m_activeTrack = 0
        this.setState(SelState.NONE)
    }

    remove(el: EngravingItem): void {
        const i = this.m_el.indexOf(el)
        if (i >= 0) {
            this.m_el.splice(i, 1)
        }
        el.setSelected(false)
        if (i >= 0) {
            this.updateState()
        }
    }

    add(el: EngravingItem): void {
        if (this.isLocked()) {
            return
        }
        this.m_el.push(el)
        this.update()
    }

    private appendFiltered(e: EngravingItem): void {
        if (this.isLocked()) {
            return
        }
        if (this.canSelectVoice(e.voice()) && this.canSelect(e)) {
            this.m_el.push(e)
        }
    }

    private appendFilteredSet(elems: Set<EngravingItem>): void {
        if (this.isLocked()) {
            return
        }

        for (const elem of elems) {
            if (elem.isSpannerSegment()) {
                // Append whole spanners instead of spanner segments
                continue
            }

            // Special handling for bends...
            if (elem.isGuitarBend()) {
                this.appendGuitarBend(elem as unknown as GuitarBend)
                continue
            }

            // Special handling for spanners...
            if (elem.isSpanner() && !elem.isPartialTie() && !elem.isLaissezVib()) {
                const spanner = elem as unknown as Spanner
                if (!noteAnchoredSpannerIsInRange(spanner, this.tickStart(), this.tickEnd())) {
                    continue
                }
                for (const spannerSeg of spanner.spannerSegments()) {
                    this.appendFiltered(spannerSeg)
                }
                continue
            }

            // Special handling for grace notes...
            if (elem.isChord() && (elem as unknown as Chord).isGrace()) {
                this.appendChordRest(elem as unknown as ChordRest)
                continue
            }

            this.appendFiltered(elem)
        }
    }

    private appendChordRest(cr: ChordRest): void {
        if (this.isLocked()) {
            return
        }

        if (!this.canSelectVoice(cr.voice())) {
            return
        }

        const crAnchored = collectElementsAnchoredToChordRest(cr)
        this.appendFilteredSet(crAnchored)

        if (cr.isRestFamily()) {
            this.appendFiltered(cr)
            const r = cr as unknown as Rest
            for (let i = 0; i < r.dots(); ++i) {
                const dot = r.dot(i)
                if (dot) {
                    this.appendFiltered(dot)
                }
            }
            return
        }

        if (!cr.isChord()) {
            return
        }

        const chord = cr as unknown as Chord

        const totalNotesInChord = chord.notes().length
        const isSingleNote = totalNotesInChord === 1

        let totalAppendedNotes = 0
        for (let noteIdx = 0; noteIdx < totalNotesInChord; ++noteIdx) {
            const note = chord.notes()[noteIdx]

            const noteAnchored = collectElementsAnchoredToNote(note, true, false)
            this.appendFilteredSet(noteAnchored)

            if (chord.isGrace() && !this.canSelect(chord)) {
                continue
            }

            //! Hack Explainer: see C++ (single note chords are always appended here; whether they should be
            //! omitted is decided in updateSelectedElements)
            if (!isSingleNote && !this.canSelectNoteIdx(noteIdx, totalNotesInChord, true)) {
                continue
            }

            this.m_el.push(note)
            ++totalAppendedNotes

            if (note.accidental()) {
                this.m_el.push(note.accidental()!)
            }
            for (const el of note.el()) {
                if (el.isFingering()) {
                    // Slight hack (already handled, see collectElementsAnchoredToNote)...
                    continue
                }
                this.m_el.push(el)
            }
            for (const dot of note.dots()) {
                this.m_el.push(dot)
            }
        }

        //! NOTE: Beams, stems, etc should only be added if all notes in chord are selected...
        if (totalAppendedNotes < totalNotesInChord) {
            return
        }
        const beam = chord.beam()
        if (beam && !this.m_el.includes(beam)) {
            this.m_el.push(beam)
        }
        if (chord.stem()) {
            this.m_el.push(chord.stem()!)
        }
        if (chord.hook()) {
            this.m_el.push(chord.hook()!)
        }
        if (chord.stemSlash()) {
            this.m_el.push(chord.stemSlash()!)
        }
    }

    private appendTupletHierarchy(innermostTuplet: Tuplet): void {
        if (!this.canSelectVoice(innermostTuplet.voice()) || this.m_el.includes(innermostTuplet)) {
            return
        }

        //! NOTE: Not hugely efficient since canSelectTuplet will recursively check all contained tuplets...
        if (!this.selectionFilter().canSelectTuplet(innermostTuplet, this.tickStart(), this.tickEnd(),
            this.rangeContainsMultiNoteChords())) {
            return
        }

        this.m_el.push(innermostTuplet)

        // Recursively append upwards/outwards
        const outerTuplet = innermostTuplet.tuplet()
        if (outerTuplet) {
            this.appendTupletHierarchy(outerTuplet)
        }
    }

    private appendGuitarBend(guitarBend: GuitarBend | null): void {
        if (!guitarBend || !this.canSelectVoice(guitarBend.voice())) {
            return
        }

        this.m_el.push(guitarBend)

        const hold = guitarBend.holdLine()
        if (hold) {
            if (hold.tick2().lt(this.tickEnd())) {
                this.m_el.push(hold)
            }
        }

        const bendSeg = guitarBend.spannerSegments().length ? guitarBend.frontSegment() : null
        if (bendSeg && bendSeg.isGuitarBendSegment()) {
            const bendText = (bendSeg as unknown as { bendText(): EngravingItem | null }).bendText()
            if (bendText) {
                this.m_el.push(bendText)
            }
        }
    }

    updateSelectedElements(): void {
        if (this.isLocked()) {
            return
        }
        if (this.m_state !== SelState.RANGE) {
            this.m_rangeContainsMultiNoteChords = false
            this.update()
            return
        }
        if (this.m_state === SelState.RANGE && !this.m_plannedTick1.eq(new Fraction(-1, 1))
            && !this.m_plannedTick2.eq(new Fraction(-1, 1))) {
            const staffStart = this.m_staffStart
            const staffEnd = this.m_staffEnd

            this.deselectAll()

            const s1 = this.m_score.tick2segmentMM(this.m_plannedTick1)
            let s2 = this.m_score.tick2segmentMM(this.m_plannedTick2, /* first */ true /* HACK */)
            if (s2 && s2.measure().isMMRest()) {
                s2 = s2.prev1MM() // HACK
            }
            // These hacks are needed to prevent https://musescore.org/node/173381.
            // This should exclude any segments belonging to MM-rest range from the selection.
            if (s1 && s2 && s1.tick().plus(s1.ticks()).gt(s2.tick())) {
                // can happen with MM rests as tick2measure returns only the first segment for them.
                this.m_plannedTick1 = new Fraction(-1, 1)
                this.m_plannedTick2 = new Fraction(-1, 1)
                return
            }

            if (s2 && s2 === s2.measure().first()) {
                // we want the last segment of the previous measure (unless it's part of a MMrest)
                const prevMeasure = s2.measure().prevMeasure()
                if (!(prevMeasure && prevMeasure !== prevMeasure.coveringMMRestOrThis())) {
                    s2 = s2.prev1()
                }
            }

            this.setRange(s1, s2, staffStart, staffEnd)

            this.m_plannedTick1 = new Fraction(-1, 1)
            this.m_plannedTick2 = new Fraction(-1, 1)
        }

        for (const e of this.m_el) {
            e.setSelected(false)
        }
        this.m_el = []

        // assert:
        const staves = this.m_score.nstaves()
        if (this.m_staffStart === nidx || this.m_staffStart >= staves || this.m_staffEnd === nidx || this.m_staffEnd > staves
            || this.m_staffStart >= this.m_staffEnd) {
            this.m_staffStart = 0
            this.m_staffEnd = 0
        }
        const startTrack = this.m_staffStart * VOICES
        const endTrack = this.m_staffEnd * VOICES

        //! NOTE: See appendChord/appendChordRest - we should include single notes if the selection consists solely of
        //! single notes, even if the "include single notes" filter flag is false...
        const singleNoteChords: Chord[] = []
        let totalChordsFound = 0

        //! NOTE: We also need to delay the appending of tuplets. We should only display tuplets as selected
        //! if all of their contained elements are selected...
        const innerTuplets = new Set<Tuplet>()

        for (let st = startTrack; st < endTrack; ++st) {
            for (let s = this.m_startSegment; s && s !== this.m_endSegment; s = s.next1MM()) {
                if (!s.enabled() || s.isEndBarLineType()) { // do not select end bar line
                    continue
                }
                for (const e of s.annotations()) {
                    if (e.track() !== st) {
                        continue
                    }
                    if (e.isFretDiagram()) {
                        const harm = (e as unknown as FretDiagram).harmony()
                        if (harm) {
                            this.appendFiltered(harm)
                        }
                    }
                    this.appendFiltered(e)
                }
                const e = s.element(st)
                if (!e || e.generated() || e.isTimeSig() || e.isKeySig()) {
                    continue
                }

                if (!e.isChordRest()) {
                    this.appendFiltered(e)
                    continue
                }

                const cr = e as unknown as ChordRest
                const tuplet = cr.tuplet()
                if (tuplet) {
                    innerTuplets.add(tuplet)
                }

                if (!cr.isChord()) {
                    this.appendChordRest(cr)
                    continue
                }

                const chord = cr as unknown as Chord
                const notes = chord.notes()
                if (notes.length === 1) {
                    singleNoteChords.push(chord)
                } else {
                    this.appendChordRest(chord)
                }
                ++totalChordsFound
            }
        }

        this.m_rangeContainsMultiNoteChords = totalChordsFound > singleNoteChords.length

        for (const singleNoteChord of singleNoteChords) {
            if (!this.m_rangeContainsMultiNoteChords || this.selectionFilter().includeSingleNotes()) {
                this.appendChordRest(singleNoteChord)
            } else {
                // Include elements anchored to the note even if the note itself isn't included...
                const note = singleNoteChord.notes()[0]
                this.appendFilteredSet(collectElementsAnchoredToNote(note, true, false))
                this.appendFilteredSet(collectElementsAnchoredToChordRest(singleNoteChord))
            }
        }

        for (const tuplet of innerTuplets) {
            this.appendTupletHierarchy(tuplet)
        }

        const rangeStart = this.tickStart()
        const rangeEnd = this.tickEnd()

        //! NOTE: Ties are NOT handled in here - these are note anchored and handled in appendChordRest...
        for (const sp of this.m_score.spanner()) {
            // ignore spanners belonging to other tracks
            if (sp.track() < startTrack || sp.track() >= endTrack) {
                continue
            }

            const startAndEndCalculated = !!sp.startElement() && !!sp.endElement()
            if (!startAndEndCalculated || !this.canSelectVoice(sp.track()) || sp.isVolta()) {
                continue
            }

            //! NOTE: isZeroLengthAtStart covers an edge case that may occur if sp spans from a grace note to its
            //! parent note or vice versa (sp->tick == sp->tick2 == rangeStart: include the spanner)
            const overlapsSelectionRange = rangeStart.lt(sp.tick2()) && rangeEnd.gt(sp.tick())
            const isZeroLengthAtStart = sp.tick().eq(sp.tick2()) && sp.tick().eq(rangeStart)
            if (!overlapsSelectionRange && !isZeroLengthAtStart) {
                continue
            }

            for (const seg of sp.spannerSegments()) {
                this.appendFiltered(seg)
            }
        }
        this.update()
        this.m_score.setSelectionChanged(true)
    }

    noteList(selTrack: track_idx_t = nidx): Note[] {
        const nl: Note[] = []

        if (this.m_state === SelState.LIST) {
            for (const e of this.m_el) {
                if (e.isNote()) {
                    nl.push(e as unknown as Note)
                }
            }
        } else if (this.m_state === SelState.RANGE) {
            for (let staffIdx = this.staffStart(); staffIdx < this.staffEnd(); ++staffIdx) {
                const startTrack = staffIdx * VOICES
                const endTrack = startTrack + VOICES
                for (let seg = this.m_startSegment; seg && seg !== this.m_endSegment; seg = seg.next1()) {
                    if (!(seg.segmentType() & SegmentType.ChordRest)) {
                        continue
                    }
                    for (let track = startTrack; track < endTrack; ++track) {
                        if (!this.canSelectVoice(track)) {
                            continue
                        }
                        const e = seg.element(track)
                        if (!e || !e.isChord() || (selTrack !== nidx && selTrack !== track)) {
                            continue
                        }
                        const c = e as unknown as Chord
                        const notes = c.notes()
                        for (let noteIdx = 0; noteIdx < notes.length; ++noteIdx) {
                            const note = notes[noteIdx]
                            if (this.canSelectNoteIdx(noteIdx, notes.length, this.rangeContainsMultiNoteChords())) {
                                nl.push(note)
                            }
                        }
                        for (const g of c.graceNotes()) {
                            nl.push(...g.notes())
                        }
                    }
                }
            }
        }
        return nl
    }

    /** the selected elements; if some are linked, only one of the linked elements is in the list */
    /** C++ measureRange(Measure**, Measure**): null if not a range selection */
    measureRange(): { m1: Measure; m2: Measure | null } | null {
        if (!this.isRange()) {
            return null
        }
        const m1 = this.startSegment()!.measure()
        const s2 = this.endSegment()
        let m2: Measure | null = s2 ? s2.measure() : this.score().lastMeasure()
        if (m1 === m2) {
            return { m1, m2 }
        }
        // if selection extends to last segment of a measure,
        // then endSegment() will point to next measure
        // this won't normally happen because end barlines are excluded from range selection
        // but just in case, detect this and back up one measure
        if (m2 && s2 && m2.tick().eq(s2.tick())) {
            m2 = m2.prevMeasure()
        }
        return { m1, m2 }
    }

    uniqueElements(): EngravingItem[] {
        const l: EngravingItem[] = []

        for (const e of this.elements()) {
            const alreadyThere = l.some(ee => (ee.links() && ee.links()!.includes(e)) || e === ee)
            if (!alreadyThere) {
                l.push(e)
            }
        }
        return l
    }

    /** the selected notes; if some notes are linked, only one of the linked notes is in the list */
    uniqueNotes(track: track_idx_t = nidx, tied = false): Note[] {
        const l: Note[] = []

        const addNote = (note: Note): void => {
            const alreadyThere = l.some(n => (n.links() && n.links()!.includes(note)) || n === note)
            if (!alreadyThere) {
                l.push(note)
            }
        }

        for (const nn of this.noteList(track)) {
            if (!tied) {
                addNote(nn)
                continue
            }

            for (const note of nn.tiedNotes()) {
                addNote(note)
            }
        }
        return l
    }

    rangeContainsMultiNoteChords(): boolean {
        if (this.m_state !== SelState.RANGE) {
            return false
        }
        return this.m_rangeContainsMultiNoteChords
    }

    setRange(startSegment: Segment | null, endSegment: Segment | null, staffStart: staff_idx_t, staffEnd: staff_idx_t): void {
        this.m_startSegment = startSegment
        this.m_endSegment = endSegment
        this.m_activeSegment = endSegment
        this.m_staffStart = staffStart
        this.m_staffEnd = staffEnd
        this.m_activeTrack = staff2track(staffStart)

        if (this.m_state === SelState.RANGE) {
            this.m_score.setSelectionChanged(true)
        } else {
            this.setState(SelState.RANGE)
        }
    }

    /**
     * sets the range to be selected on next updateSelectedElements() call. Can be used if some segment structure
     * changes are expected (e.g. if creating MM rests is pending).
     */
    setRangeTicks(tick1: Fraction, tick2: Fraction, staffStart: staff_idx_t, staffEnd: staff_idx_t): void {
        this.m_plannedTick1 = tick1
        this.m_plannedTick2 = tick2
        this.m_startSegment = this.m_endSegment = this.m_activeSegment = null
        this.m_staffStart = staffStart
        this.m_staffEnd = staffEnd
        this.m_activeTrack = staff2track(staffStart)

        if (this.m_state === SelState.RANGE) {
            this.m_score.setSelectionChanged(true)
        } else {
            this.setState(SelState.RANGE)
        }
    }

    /** Set select flag for all Elements in select list. */
    update(): void {
        for (const e of this.m_el) {
            e.setSelected(true) // also tells accessibility that e has focus
        }
        // C++ selects the top selected note of activeCR() again for the accessibility focus (no accessibility here)
        this.updateState()
    }

    /** update selection and input state */
    updateState(): void {
        const totalStaves = this.m_score.nstaves()

        //! NOTE: m_startSegment being non-null and m_endSegment being null is a valid case. It means we've selected the
        //! last segment of the final measure...
        const rangeSegsInvalid = !this.m_startSegment
            || (!!this.m_endSegment && this.m_endSegment.tick().le(this.m_startSegment.tick()))
        const rangeStavesInvalid = this.m_staffStart === nidx || this.m_staffStart >= totalStaves
            || this.m_staffEnd === nidx || this.m_staffEnd > totalStaves
            || this.m_staffStart >= this.m_staffEnd
        const rangeIsValid = this.isRange() && !rangeSegsInvalid && !rangeStavesInvalid

        //! NOTE: Range can be valid even if no elements are selectable in that range...
        if (this.m_el.length === 0 && !rangeIsValid) {
            this.setState(SelState.NONE)
        } else if (this.m_state === SelState.NONE) {
            this.setState(SelState.LIST)
        }

        const e = this.element()
        if (!e) {
            return
        }

        if (e.isSpannerSegment()) {
            this.m_currentTick = (e as unknown as SpannerSegment).spanner()!.tick()
        } else {
            this.m_currentTick = e.tick()
        }
        // ignore system elements (e.g., frames)
        if (e.track() !== nidx) {
            this.m_currentTrack = e.track()
        }
    }

    setState(s: SelState): void {
        if (this.m_state === s) {
            return
        }

        this.m_state = s
        this.m_score.setSelectionChanged(true)
    }

    /** Extends the range selection to contain the given chord rest. */
    extendRangeSelectionCR(cr: ChordRest): void {
        this.extendRangeSelection(cr.segment(), cr.nextSegmentAfterCR(SegmentType.ChordRest | SegmentType.EndBarLine | SegmentType.Clef), cr.staffIdx(), cr.tick(), cr.tick())
    }

    /**
     * Extends the range selection to contain the given segment. SegAfter should represent the segment that is after
     * seg. Tick and etick represent the start and end tick of an element. Useful when extending by a chord rest.
     */
    extendRangeSelection(seg: Segment | null, segAfter: Segment | null, staffIdx: staff_idx_t, tick: Fraction, etick: Fraction): void {
        let activeSegmentIsStart = false
        const activeStaff = Math.trunc(this.m_activeTrack / VOICES)

        if (staffIdx < this.m_staffStart) {
            this.m_staffStart = staffIdx
        } else if (staffIdx >= this.m_staffEnd) {
            this.m_staffEnd = staffIdx + 1
        } else if (this.m_staffEnd - this.m_staffStart > 1) { // at least 2 staff selected
            if (staffIdx === this.m_staffStart + 1 && activeStaff === this.m_staffStart) { // going down
                this.m_staffStart = staffIdx
            } else if (staffIdx === this.m_staffEnd - 2 && activeStaff === this.m_staffEnd - 1) { // going up
                this.m_staffEnd = staffIdx + 1
            }
        }

        if (tick.lt(this.tickStart())) {
            this.m_startSegment = seg
            activeSegmentIsStart = true
        } else if (etick.gt(this.tickEnd())) {
            this.m_endSegment = segAfter
        } else {
            if (this.m_activeSegment === this.m_startSegment) {
                this.m_startSegment = seg
                activeSegmentIsStart = true
            } else {
                this.m_endSegment = segAfter
            }
        }
        this.m_activeSegment = activeSegmentIsStart ? this.m_startSegment : this.m_endSegment
        this.m_score.setSelectionChanged(true)
    }

    // =================================================================================================================
    //   copy (mime data, canCopy): Selection::mimeType, mimeData, staffMimeData, symbolListMimeData, canCopy
    // =================================================================================================================

    mimeType(): string {
        switch (this.m_state) {
        case SelState.LIST:
            return this.isSingle() ? mimeSymbolFormat : mimeSymbolListFormat
        case SelState.RANGE:
            return mimeStaffListFormat
        case SelState.NONE:
        default:
            break
        }
        return ''
    }

    mimeData(): string {
        let a = ''
        switch (this.m_state) {
        case SelState.LIST:
            if (this.isSingle()) {
                a = this.element()!.mimeData()
            } else {
                a = this.symbolListMimeData()
            }
            break
        case SelState.NONE:
            break
        case SelState.RANGE:
            a = this.staffMimeData()
            break
        }
        return a
    }

    staffMimeData(): string {
        const xml: XmlWriter = RWRegister.writer().createXmlWriter()

        xml.startDocument()

        const filter = this.selectionFilter()
        const curTick = { v: new Fraction(0, 1) }

        const ticks = this.tickEnd().minus(this.tickStart())
        const staves = this.staffEnd() - this.staffStart()

        const staffListAttributes: [string, string | number][] = [
            ['version', MSC_VERSION_STR],
            ['tick', this.tickStart().toString()],
            ['len', ticks.toString()],
            ['staff', this.staffStart()],
            ['staves', staves],
        ]

        // Note: canCopy() ensures that the whole selection has a single time stretch ratio.
        const timeStretch = this.m_score.staff(this.staffStart())!.timeStretch(this.tickStart())
        if (!timeStretch.eq(new Fraction(1, 1))) {
            staffListAttributes.push(['timeStretch', timeStretch.toString()])
        }

        xml.startElement('StaffList', staffListAttributes)

        const seg1 = this.m_startSegment!
        const seg2 = this.m_endSegment

        for (let staffIdx = this.staffStart(); staffIdx < this.staffEnd(); ++staffIdx) {
            const startTrack = staffIdx * VOICES
            const endTrack = startTrack + VOICES

            xml.startElement('Staff', [['id', staffIdx]])

            const staff = this.m_score.staff(staffIdx)!
            const part = staff.part()!
            const interval = part.instrument(seg1.tick())!.transpose()
            if (interval.chromatic) {
                xml.tag('transposeChromatic', interval.chromatic)
            }
            if (interval.diatonic) {
                xml.tag('transposeDiatonic', interval.diatonic)
            }
            xml.startElement('voiceOffset')
            for (let voice = 0; voice < VOICES; voice++) {
                if (hasElementInTrack(seg1, seg2, startTrack + voice) && filter.canSelectVoice(voice)) {
                    const offset = firstElementInTrack(seg1, seg2, startTrack + voice).minus(this.tickStart())
                    xml.tag('voice', [['id', voice]], offset.ticks())
                }
            }
            xml.endElement() // </voiceOffset>

            RWRegister.writer().writeSegments(xml, filter, startTrack, endTrack, seg1, seg2, false, false, curTick)
            xml.endElement()
        }

        xml.endElement()
        xml.flush()
        return xml.text()
    }

    symbolListMimeData(): string {
        interface MapData {
            e: EngravingItem
            s: Segment
        }

        const xml: XmlWriter = RWRegister.writer().createXmlWriter()

        xml.startDocument()

        let topTrack = 1000000
        let bottomTrack = 0
        let firstSeg: Segment | null = null
        let firstTick = new Fraction(0x7FFFFFFF, 1)
        let seg: Segment | null = null
        // C++ std::multimap<int64_t, MapData> keyed by (track << 32) + tick: equal keys keep their insertion order
        const map: { track: track_idx_t; tick: number; data: MapData }[] = []

        // scan selection element list, inserting relevant elements in a tick-sorted map
        for (let e of this.m_el) {
            switch (e.type()) {
            case ElementType.ARTICULATION:
            case ElementType.ORNAMENT:
            case ElementType.TAPPING:
            case ElementType.ARPEGGIO:
            case ElementType.CHORD_BRACKET:
            case ElementType.TREMOLO_SINGLECHORD: {
                // ignore articulations not attached to chords/rest or segment
                if (!e.explicitParent()!.isChordRest()) {
                    continue
                }
                const cr = e.explicitParent() as unknown as ChordRest
                seg = cr.segment()
                break
            }
            case ElementType.FERMATA:
                seg = (e as unknown as Fermata).segment()
                break
            case ElementType.BREATH:
                seg = (e as unknown as Breath).segment()
                break
            case ElementType.PLAYTECH_ANNOTATION:
            case ElementType.CAPO:
            case ElementType.STRING_TUNINGS:
            case ElementType.STAFF_TEXT:
                seg = (e as unknown as StaffTextBase).segment()
                break
            case ElementType.EXPRESSION:
                seg = (e as unknown as Expression).segment()
                break
            case ElementType.STICKING:
            case ElementType.FIGURED_BASS:
            case ElementType.HARP_DIAGRAM:
                // C++ toSticking(e)->segment() etc.: the parent segment
                seg = e.explicitParent() as unknown as Segment
                break
            case ElementType.LYRICS:
                seg = (e as unknown as Lyrics).segment()
                break
            case ElementType.DYNAMIC:
                seg = (e as unknown as Dynamic).segment()
                break
            case ElementType.HARMONY:
            case ElementType.FRET_DIAGRAM:
                // ignore chord symbols or fret diagrams not attached to segment
                if (e.explicitParent()!.isSegment()) {
                    seg = e.explicitParent() as unknown as Segment
                    break
                }
                continue
            case ElementType.SLUR_SEGMENT:
            case ElementType.HAIRPIN_SEGMENT:
            case ElementType.OTTAVA_SEGMENT:
            case ElementType.TRILL_SEGMENT:
            case ElementType.LET_RING_SEGMENT:
            case ElementType.VIBRATO_SEGMENT:
            case ElementType.PALM_MUTE_SEGMENT:
            case ElementType.WHAMMY_BAR_SEGMENT:
            case ElementType.RASGUEADO_SEGMENT:
            case ElementType.HARMONIC_MARK_SEGMENT:
            case ElementType.PICK_SCRAPE_SEGMENT:
            case ElementType.TEXTLINE_SEGMENT:
            case ElementType.PEDAL_SEGMENT:
                e = (e as unknown as SpannerSegment).spanner()!
                seg = (e as unknown as Spanner).startSegment()
                break
            case ElementType.SLUR:
            case ElementType.HAMMER_ON_PULL_OFF:
            case ElementType.HAIRPIN:
            case ElementType.OTTAVA:
            case ElementType.TRILL:
            case ElementType.LET_RING:
            case ElementType.VIBRATO:
            case ElementType.PALM_MUTE:
            case ElementType.WHAMMY_BAR:
            case ElementType.RASGUEADO:
            case ElementType.HARMONIC_MARK:
            case ElementType.PICK_SCRAPE:
            case ElementType.TEXTLINE:
            case ElementType.PEDAL:
                seg = (e as unknown as Spanner).startSegment()
                break
            default:
                // Elements of other types are ignored. To allow copying them,
                // add support for them here and in `Score::pasteSymbols`.
                continue
            }
            const track = e.track()
            if (track < topTrack) {
                topTrack = track
            }
            if (track > bottomTrack) {
                bottomTrack = track
            }
            if (seg!.tick().lt(firstTick)) {
                firstSeg = seg
                firstTick = seg!.tick()
            }
            const entry = { track, tick: seg!.tick().ticks(), data: { e, s: seg! } }
            let pos = map.length
            while (pos > 0 && (map[pos - 1].track > track || (map[pos - 1].track === track && map[pos - 1].tick > entry.tick))) {
                --pos
            }
            map.splice(pos, 0, entry)
        }

        xml.startElement('SymbolList', [['version', MSC_VERSION_STR], ['fromtrack', topTrack], ['totrack', bottomTrack]])

        // scan the map, outputting elements each with a relative <track> tag on track change,
        // a relative tick and the number of CR segments to skip
        let currTrack: track_idx_t = nidx
        for (const iter of map) {
            const track = iter.track
            if (currTrack !== track) {
                xml.tag('trackOffset', track - topTrack)
                currTrack = track
                seg = firstSeg
            }
            xml.tag('tickOffset', iter.tick - firstTick.ticks())
            let numSegs = 0
            // with figured bass, we need to look for the proper segment
            // not only according to ChordRest elements, but also annotations
            if (iter.data.e.isFiguredBass()) {
                let done = false
                for (; seg; seg = seg.next1()) {
                    if (seg.isChordRestType()) {
                        // if no ChordRest in right track, look in annotations
                        if (seg.element(currTrack) === null) {
                            for (const el of seg.annotations()) {
                                // do annotations include our element?
                                if (el === iter.data.e) {
                                    done = true
                                    break
                                }
                                // do annotations include any f.b.?
                                if (el.isFiguredBass() && el.track() === track) {
                                    numSegs++ //yes: it counts as a step
                                    break
                                }
                            }
                            if (done) {
                                break
                            }
                            continue // segment is not relevant: no ChordRest nor f.b.
                        } else {
                            if (iter.data.s === seg) {
                                break
                            }
                        }
                        numSegs++
                    }
                }
            } else {
                while (seg && iter.data.s !== seg) {
                    seg = seg.nextCR(currTrack)
                    numSegs++
                }
            }
            xml.tag('segDelta', numSegs)
            RWRegister.writer().writeItem(iter.data.e, xml)
        }

        xml.endElement()
        xml.flush()
        return xml.text()
    }

    /**
     * return false if range selection intersects a tuplet or a tremolo, or a local time signature, or only part of a
     * measure repeat group
     */
    canCopy(): boolean {
        if (this.m_state !== SelState.RANGE) {
            return true
        }

        const endTick = this.m_endSegment ? this.m_endSegment.tick() : this.m_score.lastSegment()!.tick()
        let timeStretch = new Fraction(1, 0)

        for (let staffIdx = this.m_staffStart; staffIdx !== this.m_staffEnd; ++staffIdx) {
            for (let voice = 0; voice < VOICES; ++voice) {
                const track = staffIdx * VOICES + voice
                if (!this.canSelectVoice(track)) {
                    continue
                }

                // check first cr in track within selection
                const check = this.m_startSegment!.nextChordRest(track)
                if (check && check.tick().lt(endTick)) {
                    const err = checkStartForPartialCopy(check)
                    if (err !== MsError.MS_NO_ERROR) {
                        MScore.setError(err)
                        return false
                    }
                }

                if (!this.m_endSegment) {
                    continue
                }

                // find last segment in the selection.
                // Note that _endSegment is the first segment after the selection

                let endSegmentSelection: Segment = this.m_startSegment!
                while (endSegmentSelection.nextCR(track)
                       && (endSegmentSelection.nextCR(track)!.tick().lt(this.m_endSegment.tick()))) {
                    endSegmentSelection = endSegmentSelection.nextCR(track)!
                }

                const err = checkEndForPartialCopy(endSegmentSelection.element(track), endTick)
                if (err !== MsError.MS_NO_ERROR) {
                    MScore.setError(err)
                    return false
                }
            }

            // Check that all selected measures have the same time stretch - allows copy/paste within a local time signature,
            // but don't yet support it between differing local time signatures.
            for (let m: Measure | null = this.m_startSegment!.measure(); m && m.tick().lt(endTick); m = m.nextMeasure()) {
                const mTimeStretch = this.m_score.staff(staffIdx)!.timeStretch(m.tick())
                if (!timeStretch.isValid()) {
                    timeStretch = mTimeStretch
                } else if (!timeStretch.eq(mTimeStretch)) {
                    return false
                }
            }

            // check if selection starts or ends partway through measure repeat group
            const firstCR = this.firstChordRest()
            const lastCR = this.lastChordRest()
            if ((firstCR && firstCR.measure()!.isMeasureRepeatGroupWithPrevM(staffIdx))
                || (lastCR && lastCR.measure()!.isMeasureRepeatGroupWithNextM(staffIdx))) {
                return false
            }
        }
        return true
    }
}

/** Constants::MSC_VERSION_STR (C++ writes "2.00" in test mode) */
const MSC_VERSION_STR = '4.70'

function hasElementInTrack(startSeg: Segment, endSeg: Segment | null, track: track_idx_t): boolean {
    for (let seg: Segment | null = startSeg; seg && seg !== endSeg; seg = seg.next1MM()) {
        if (!seg.enabled()) {
            continue
        }
        if (seg.element(track)) {
            return true
        }
    }
    return false
}

function firstElementInTrack(startSeg: Segment, endSeg: Segment | null, track: track_idx_t): Fraction {
    for (let seg: Segment | null = startSeg; seg && seg !== endSeg; seg = seg.next1MM()) {
        if (!seg.enabled()) {
            continue
        }
        if (seg.element(track)) {
            return seg.tick()
        }
    }
    return new Fraction(-1, 1)
}

/**
 * return no error if element is NOT a tuplet or is start of a tuplet/tremolo, return error if element is part of a
 * tuplet/tremolo, but not the start
 */
function checkStartForPartialCopy(e: EngravingItem | null): MsError {
    if (!e || !e.isChordRest()) {
        return MsError.MS_NO_ERROR
    }

    const cr = e as unknown as ChordRest
    if (cr.tuplet()) {
        // check that complete tuplet is selected, all the way up to top level
        let tuplet: Tuplet | null = cr.tuplet()
        while (tuplet) {
            if (tuplet.elements()[0] !== e) {
                return MsError.SOURCE_PARTIAL_TUPLET
            }
            e = tuplet as unknown as EngravingItem
            tuplet = tuplet.tuplet()
        }
    }

    if (cr.isChord()) {
        const chord = cr as unknown as Chord
        const ttc: TremoloTwoChord | null = chord.tremoloTwoChord()
        if (ttc && ttc.chord2() === chord) {
            return MsError.SOURCE_PARTIAL_TREMOLO
        }
    }

    return MsError.MS_NO_ERROR
}

/**
 * return no error if element is NOT a tuplet or is end of a tuplet/tremolo, return error if element is part of a
 * tuplet/tremolo, but not the end
 */
function checkEndForPartialCopy(e: EngravingItem | null, endTick: Fraction): MsError {
    if (!e || !e.isChordRest()) {
        return MsError.MS_NO_ERROR
    }

    const cr = e as unknown as ChordRest
    if (cr.tuplet()) {
        // check that complete tuplet is selected, all the way up to top level
        let tuplet: Tuplet | null = cr.tuplet()
        while (tuplet) {
            const els = tuplet.elements()
            if (els[els.length - 1] !== e) {
                return MsError.SOURCE_PARTIAL_TUPLET
            }
            e = tuplet as unknown as EngravingItem
            tuplet = tuplet.tuplet()
        }
        // also check that the selection extends to the end of the top-level tuplet
        tuplet = e as unknown as Tuplet
        if (tuplet.endTick().gt(endTick)) {
            return MsError.SOURCE_PARTIAL_TUPLET
        }
    }

    if (cr.isChord()) {
        const chord = cr as unknown as Chord
        const ttc: TremoloTwoChord | null = chord.tremoloTwoChord()
        if (ttc && ttc.chord1() === chord) {
            return MsError.SOURCE_PARTIAL_TREMOLO
        }
    }

    return MsError.MS_NO_ERROR
}
