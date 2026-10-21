/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the parts of src/engraving/editing/edit.cpp that creating a new score needs (plus
 * MasterScore::insertMeasure of masterscore.cpp and Measure::adjustToLen of measure.cpp, which use the same
 * editing functions). The C++ functions are methods of Score/MasterScore/Measure; here they are added to these
 * classes by this module (module augmentation), so it must be imported before they are used.
 *
 * The changes go through the undo stack (Score.undo(), editing/undo.ts) like in C++; outside of a command
 * (createScore) they are applied directly. Linked staves/excerpts are not ported, so the "linked" loops only handle
 * the element itself.
 */

import { Fraction } from '../types/fraction'
import {
    AccidentalRole, BeamMode, BracketType, DirectionV, DurationType, ElementType, KeyMode, Key,
    PlacementV, TextStyleType, VOICES, VoiceAssignment, nidx, staff2track, track2staff, track2voice,
    type DirectionH, type staff_idx_t, type track_idx_t, type voice_idx_t,
} from '../types/types'
import { Sid } from '../style/styledef'
import { Factory } from '../dom/factory'
import { Pid, PropertyFlags } from '../dom/property'
import { Score } from '../dom/score'
import { MasterScore } from '../dom/masterscore'
import { Measure, MeasureNumberMode } from '../dom/measure'
import { SegmentType, type Segment } from '../dom/segment'
import { KeySigEvent, type KeyList } from '../dom/key'
import { TDuration, toDurationList, toRhythmicDurationList } from '../dom/durationtype'
import { Transpose } from './transpose'
import { Interval } from '../dom/interval'
import { ChangeMeasureLen, InsertMeasures, InsertTime } from './editmeasures'
import { AddElement, ChangeElement, ChangeParent, RemoveElement } from './addremoveelement'
import { ChangeProperty } from './editproperty'
import { ChangeStyleValues } from './editstyle'
import { ChangeFretting, ChangePitch } from './editnote'
import { ChangeSpannerElements } from './editspanner'
import { ChangeChordStaffMove } from './editchord'
import { ExchangeVoice } from './editvoicing'
import { InsertPart, RemovePart } from './editpart'
import { InsertStaff, RemoveStaff } from './editstaff'
import { AddBracket, RemoveBracket } from './editbrackets'
import { searchTemplate } from '../dom/instrtemplate'
import type { Bracket } from '../dom/bracket'
import { scoreDummy } from '../compat/dummyelement'
import { MScore, MsError } from '../dom/mscore'
import { InputState, NoteEntryMethod, NoteVal } from '../dom/input'
import { NoteType } from '../dom/chordrest'
import { AccidentalType } from '../dom/accidentaldata'
import { Accidental } from '../dom/accidental'
import { PropertyPropagation } from '../dom/engravingobject'
import { SelectType } from '../dom/select'
import { nextChordRest } from '../dom/chord'
import { tpc2alter } from '../dom/pitchspelling'
import {
    allowRemoveWhenRemovingStaves, collectElementsAnchoredToChordRest, collectElementsAnchoredToNote, noteAnchoredSpannerIsInRange, searchTieNote,
} from '../dom/utils'
import { propertyValueEquals } from '../types/propertyvalue'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import type { PointF } from '../../framework/draw/types/geometry'
import type { DurationElement } from '../dom/durationelement'
import type { Beam } from '../dom/beam'
import type { LayoutBreak } from '../dom/layoutbreak'
import { ArticulationAnchor, type Articulation } from '../dom/articulation'
import type { Ornament } from '../dom/ornament'
import type { TremoloTwoChord } from '../dom/tremolotwochord'
import type { SlurTieSegment } from '../dom/slurtie'
import type { TrillSegment } from '../dom/trill'
import type { FretDiagram } from '../dom/fret'
import type { EngravingItem } from '../dom/engravingitem'
import type { MeasureBase } from '../dom/measurebase'
import type { ChordRest } from '../dom/chordrest'
import type { Rest } from '../dom/rest'
import type { Part } from '../dom/part'
import type { Staff } from '../dom/staff'
import type { TimeSig } from '../dom/timesig'
import type { KeySig } from '../dom/keysig'
import { Text } from '../dom/text'
import type { TextBase } from '../dom/textbase'
import type { Spanner, SpannerSegment } from '../dom/spanner'
import type { Chord } from '../dom/chord'
import type { Note } from '../dom/note'
import type { Tuplet } from '../dom/tuplet'
import type { Tie } from '../dom/tie'
import type { Selection } from '../dom/select'
import type { SelectionFilter } from '../dom/selectionfilter'
import type { EngravingObject } from '../dom/engravingobject'
import type { PropertyValue } from '../types/propertyvalue'
import type { SymId } from '../types/symid'

/** C++ Score::InsertMeasureOptions */
export class InsertMeasureOptions {
    createEmptyMeasures = false
    moveSignaturesClef = true
    needDeselectAll = true
    cloneBoxToAllParts = true
    moveStaffTypeChanges = true
    ignoreBarLines = false
}

declare module '../dom/score' {
    interface Score {
        doUndoAddElement(element: EngravingItem): void
        undoAddElement(element: EngravingItem, addToLinkedStaves?: boolean, ctrlModifier?: boolean, elementToRelink?: EngravingItem | null): void
        doUndoRemoveElement(element: EngravingItem): void
        undoRemoveElement(element: EngravingItem | null, removeLinked?: boolean): void
        undoRemovePart(part: Part, partIdx?: number): void
        undoInsertPart(part: Part, targetPartIndex: number): void
        undoRemoveStaff(staff: Staff): void
        undoInsertStaff(staff: Staff, ridx: staff_idx_t, createRests?: boolean): void
        undoAddBracket(staff: Staff, level: number, type: BracketType, span: number): void
        undoRemoveBracket(b: Bracket): void
        undoInsertTime(tick: Fraction, len: Fraction): void
        undoAddCR(cr: ChordRest, measure: Measure, tick: Fraction): void
        insertMeasure(type: ElementType, beforeMeasure?: MeasureBase | null, options?: InsertMeasureOptions): MeasureBase | null
        insertBox(type: ElementType, beforeMeasure: MeasureBase | null, options?: InsertMeasureOptions): MeasureBase | null
        restoreInitialKeySigAndTimeSig(): void
        cmdAddTimeSig(fm: Measure, staffIdx: staff_idx_t, ts: TimeSig, local: boolean): void
        undoChangeKeySig(ostaff: Staff, tick: Fraction, key: KeySigEvent): void
        addText(type: TextStyleType, destinationElement?: EngravingItem | null): TextBase | null
        clearSystemLocks(): void
        adjustKeySigs(sidx: staff_idx_t, eidx: staff_idx_t, km: KeyList): void

        // ---- edit.cpp functions used by the editing commands (being ported) ----
        getSelectedNote(): Note | null
        getSelectedChordRest(): ChordRest | null
        getSelectedChordRests(): Set<ChordRest>
        /** C++ addRest(const Fraction& tick, ...) and addRest(Segment*, ...) */
        addRest(tickOrSegment: Fraction | Segment, track: track_idx_t, d: TDuration, tuplet: Tuplet | null): Rest
        addChord(tick: Fraction, d: TDuration, oc: Chord, genTie: boolean, tuplet: Tuplet | null): Chord | null
        addClone(cr: ChordRest, tick: Fraction, d: TDuration): ChordRest
        setRest(tick: Fraction, track: track_idx_t, l: Fraction, useDots: boolean, tuplet: Tuplet | null, useFullMeasureRest?: boolean): Rest | null
        setRests(tick: Fraction, track: track_idx_t, l: Fraction, useDots: boolean, tuplet: Tuplet | null, useFullMeasureRest?: boolean): Rest[]
        addNote(chord: Chord, noteVal: NoteVal, forceAccidental?: boolean, articulationIds?: ReadonlySet<SymId>, externalInputState?: InputState | null): Note
        addNoteToTiedChord(chord: Chord, noteVal: NoteVal, forceAccidental?: boolean, articulationIds?: ReadonlySet<SymId>): Note | null
        searchNote(tick: Fraction, track: track_idx_t): ChordRest | null
        regroupNotesAndRests(startTick: Fraction, endTick: Fraction, track: track_idx_t): void
        cmdTieNoteList(selection: Selection, noteEntryMode: boolean): Note[]
        cmdAddTie(addToChord?: boolean): void
        cmdToggleTie(): Tie | null
        cmdToggleLaissezVib(): void
        cmdFlip(): void
        deleteItem(el: EngravingItem | null): void
        deleteRange(segStart: Segment, segEnd: Segment | null, trackStart: track_idx_t, trackEnd: track_idx_t, filter: SelectionFilter,
            selectionContainsMultiNoteChords?: boolean): ChordRest[]
        deleteRangeAtTrack(crsToSelect: ChordRest[], track: track_idx_t, startSeg: Segment | null, endTick: Fraction,
            currentTuplet: Tuplet | null, filter: SelectionFilter, selectionContainsMultiNoteChords: boolean): void
        deleteOrShortenOutSpannersFromRange(t1: Fraction, t2: Fraction, track1: track_idx_t, track2: track_idx_t, filter: SelectionFilter): void
        deleteSlursFromRange(t1: Fraction, t2: Fraction, trackStart: track_idx_t, trackEnd: track_idx_t, filter: SelectionFilter): void
        deleteAnnotationsFromRange(s1: Segment | null, s2: Segment | null, track1: track_idx_t, track2: track_idx_t,
            filter: SelectionFilter): void
        cmdDeleteTuplet(tuplet: Tuplet, replaceWithRest: boolean): void
        cmdDeleteSelection(): void
        cmdEnterRest(d: TDuration): void
        enterRest(d: TDuration, externalInputState?: InputState | null): void
        removeChordRest(cr: ChordRest, clearSegment: boolean): void
        nextInputPos(cr: ChordRest | null, doSelect: boolean): void
        undoChangeVisible(item: EngravingItem, visible: boolean): void
        undoChangePitch(note: Note, pitch: number, tpc1: number, tpc2: number): void
        undoChangeFretting(note: Note, pitch: number, string: number, fret: number, tpc1: number, tpc2: number): void
        undoChangeParent(element: EngravingItem | null, parent: EngravingItem | null, staffIdx: staff_idx_t): void
        undoChangeTpc(note: Note, tpc: number): void
        undoChangeChordRestLen(cr: ChordRest, d: TDuration): void
        undoChangeElement(oldElement: EngravingItem, newElement: EngravingItem): void
        undoChangeUserMirror(n: Note, d: DirectionH): void
        undoChangeSpannerElements(spanner: Spanner, startElement: EngravingItem | null, endElement: EngravingItem | null): void
        undoChangeStyleVal(idx: Sid, v: PropertyValue): void
        undoChangeStyleValues(values: Map<Sid, PropertyValue>): void
        /** C++ undoPropertyChanged(EngravingObject*, Pid, const PropertyValue&, PropertyFlags) */
        undoPropertyChanged(e: EngravingObject, t: Pid, st: PropertyValue, ps?: PropertyFlags): void
        /** C++ bool undoPropertyChanged(EngravingItem*, Pid, const PropertyValue&, PropertyFlags) (renamed: no overloads in TS) */
        undoPropertyChangedItem(item: EngravingItem, propId: Pid, propValue: PropertyValue, propFlags?: PropertyFlags): boolean
        cmdExchangeVoice(s: voice_idx_t, d: voice_idx_t): void
        undoExchangeVoice(measure: Measure, srcVoice: voice_idx_t, dstVoice: voice_idx_t, srcStaff: staff_idx_t, dstStaff: staff_idx_t): void

        // ---- score.cpp ----
        cmdRemovePart(part: Part | null): void
        cmdRemoveStaff(staffIdx: staff_idx_t): void
        adjustBracketsDel(sidx: number, eidx: number): void
        adjustBracketsIns(sidx: number, eidx: number): void
        updateBracesAndBarlines(part: Part, newIndex: number): void
        remapBracketsAndBarlines(): void
        changeSelectedElementsVoice(voice: voice_idx_t): void
        canReselectItem(item: EngravingItem | null): boolean
    }
}

declare module '../dom/masterscore' {
    interface MasterScore {
        /** C++ MasterScore::insertMeasure(MeasureBase*, const InsertMeasureOptions&) (renamed: no overloads in TS) */
        insertMeasureInMaster(beforeMeasure?: MeasureBase | null, options?: InsertMeasureOptions): Measure | null
    }
}

declare module '../dom/measure' {
    interface Measure {
        adjustToLen(nf: Fraction, appendRestsIfNecessary?: boolean): void
    }
}

Score.prototype.doUndoAddElement = function (this: Score, element: EngravingItem): void {
    if (element.generated()) {
        this.addElement(element)
    } else {
        this.undo(new AddElement(element))
    }
}

Score.prototype.doUndoRemoveElement = function (this: Score, element: EngravingItem): void {
    if (element.generated()) {
        this.removeElement(element)
    } else {
        this.undo(new RemoveElement(element))
    }
}

/** C++ isSystemTextLine() of textlinebase.h */
function isSystemTextLine(element: EngravingItem | null): boolean {
    return !!element && element.isTextLineBase() && element.systemFlag()
}

/**
 * TODO(port): linked staves and excerpts: Staff::staffList() only has the staff itself, so the element is only added
 * to its own staff (and system objects to the system object staves of this score); the C++ code for the clones in
 * the other linked staves (articulations, segment annotations, spanners, ties, tremolos, ...) is not ported.
 */
Score.prototype.undoAddElement = function (this: Score, element: EngravingItem, addToLinkedStaves = true,
    ctrlModifier = false, elementToRelink: EngravingItem | null = null): void {
    const ostaff = element.staff()
    const et = element.type()

    //
    // some elements are replicated for all parts regardless of
    // linking:
    //

    const isSystemLine = isSystemTextLine(element)

    if ((et === ElementType.REHEARSAL_MARK)
        || (et === ElementType.SYSTEM_TEXT)
        || (et === ElementType.TRIPLET_FEEL)
        || (et === ElementType.JUMP)
        || (et === ElementType.MARKER)
        || (et === ElementType.TEMPO_TEXT)
        || (et === ElementType.PLAY_COUNT_TEXT)
        || isSystemLine
    ) {
        let staffList: (Staff | null)[] = []

        if (!addToLinkedStaves) {
            staffList.push(element.staff())
        } else if (ctrlModifier && isSystemLine) {
            staffList = [...ostaff!.staffList()]
            element.setSystemFlag(false)
        } else {
            for (const s of [this as Score]) { // TODO(port): scoreList() (excerpts)
                staffList.push(s.staff(0)) // system objects always appear on the top staff
                for (const staff of s.systemObjectStaves()) {
                    if (staff.idx() === nidx) {
                        continue
                    }
                    staffList.push(staff)
                }
            }
        }

        if (elementToRelink) {
            staffList = staffList.filter(st => st !== ostaff)
        }

        let originalAdded = false
        for (const staff of staffList) {
            if (!staff) {
                continue
            }

            const score = staff.score()
            const staffIdx = staff.idx()
            const ntrack = staffIdx * VOICES
            let ne: EngravingItem

            if (ostaff && staff.score() === ostaff.score() && staff === staffList[0] && !originalAdded) {
                // add the element itself to the first system object staff in the score
                ne = element
                originalAdded = true
            } else {
                // add linked clones to the other staves
                ne = element.linkedClone()
                ne.setScore(score)
                ne.setSelected(false)
                ne.setTrack(staffIdx * VOICES + element.voice())
            }

            if (isSystemLine) {
                const nsp = ne as unknown as Spanner
                const sp = element as unknown as Spanner
                const diff = sp.track2() - sp.track()
                nsp.setTrack2(nsp.track() + diff)
                nsp.computeStartElement()
                nsp.computeEndElement()
                this.doUndoAddElement(nsp)
            } else if (et === ElementType.MARKER || et === ElementType.JUMP) {
                const om = element.explicitParent() as unknown as Measure
                const m = score.tick2measure(om.tick())!
                ne.setTrack(ntrack)
                ne.setParent(m)
                this.doUndoAddElement(ne)
            } else if (et === ElementType.MEASURE_NUMBER) {
                (element.explicitParent() as unknown as Measure).undoChangeProperty(Pid.MEASURE_NUMBER_MODE, MeasureNumberMode.SHOW)
            } else if (et === ElementType.PLAY_COUNT_TEXT) {
                const segment = element.explicitParent() as unknown as Segment
                const tick = segment.tick()
                const m = score.tick2measure(tick.minus(Fraction.eps()))!
                const seg = m.undoGetSegment(SegmentType.EndBarLine, tick)
                ne.setTrack(ntrack)
                ne.setParent(seg)
                this.doUndoAddElement(ne)
            } else {
                const segment = element.explicitParent() as unknown as Segment
                const tick = segment.tick()
                const m = score.tick2measure(tick)!
                const seg = m.undoGetSegment(SegmentType.ChordRest, tick)
                ne.setTrack(ntrack)
                ne.setParent(seg)
                this.doUndoAddElement(ne)
            }
        }

        return
    }

    if (et === ElementType.FINGERING
        || (et === ElementType.IMAGE && !element.explicitParent()!.isSegment())
        || (et === ElementType.SYMBOL && !element.explicitParent()!.isSegment())
        || et === ElementType.NOTE
        || et === ElementType.TEXT
        || et === ElementType.GLISSANDO
        || et === ElementType.GUITAR_BEND
        || et === ElementType.NOTELINE
        || et === ElementType.BEND
        || (et === ElementType.CHORD && (element as unknown as Chord).isGrace())
        || et === ElementType.LAISSEZ_VIB
        || et === ElementType.PARTIAL_TIE
        || et === ElementType.PARENTHESIS
    ) {
        // TODO(port): add linked clones to the linked parents (parent->links())
        this.doUndoAddElement(element)
        return
    }

    // TODO(port): section breaks in linked frames/excerpts (LAYOUT_BREAK of type SECTION)

    // the remaining element types are added to the linked staves (C++: ostaff->staffList()); here this is only
    // the staff itself, so the element is added as it is
    this.doUndoAddElement(element)
    element.styleChanged()
}

/** removeLinked: also remove the linked elements */
Score.prototype.undoRemoveElement = function (this: Score, element: EngravingItem | null, removeLinked = true): void {
    if (!element) {
        return
    }
    const segments: Segment[] = []
    for (const ee of element.linkList()) {
        const e = ee as EngravingItem
        if (e === element || removeLinked) {
            this.doUndoRemoveElement(e)

            if (e.explicitParent() && e.explicitParent()!.isSegment()) {
                const s = e.explicitParent() as unknown as Segment
                if (!segments.includes(s)) {
                    segments.push(s)
                }
            }
            if (e.explicitParent() && e.explicitParent()!.isSystem()) {
                e.setParent(null) // systems will be regenerated upon redo, so detach
            }
        }
    }

    // TODO(port): measure repeats (undoChangeMeasureRepeatCount)

    for (const s of segments) {
        if (s.empty()) {
            if (s.header() || s.trailer()) { // probably more segment types (system header)
                s.setEnabled(false)
            } else {
                this.doUndoRemoveElement(s)
            }
        }
    }
}

Score.prototype.undoRemovePart = function (this: Score, part: Part, partIdx: number = nidx): void {
    this.undo(new RemovePart(part, partIdx))
}

Score.prototype.undoInsertPart = function (this: Score, part: Part, targetPartIndex: number): void {
    this.undo(new InsertPart(part, targetPartIndex))
}

/** idx - index of staff in part */
Score.prototype.undoRemoveStaff = function (this: Score, staff: Staff): void {
    const staffIndex = staff.idx()

    const spannersToRemove: Spanner[] = []

    for (const spanner of this.spanner()) {
        if (allowRemoveWhenRemovingStaves(spanner, staffIndex)) {
            spannersToRemove.push(spanner)
        }
    }

    for (const spanner of this.unmanagedSpanners()) {
        if (allowRemoveWhenRemovingStaves(spanner, staffIndex)) {
            spannersToRemove.push(spanner)
        }
    }

    for (const spanner of spannersToRemove) {
        spanner.undoUnlink()
        this.doUndoRemoveElement(spanner)
    }

    //
    //    adjust measures
    //
    for (let m = staff.score().firstMeasure(); m; m = m.nextMeasure()) {
        m.cmdRemoveStaves(staffIndex, staffIndex + 1)
        if (m.hasMMRest()) {
            m.mmRest()!.cmdRemoveStaves(staffIndex, staffIndex + 1)
        }
    }

    staff.undoUnlink()

    this.undo(new RemoveStaff(staff))
}

/** ridx - index of staff in part */
Score.prototype.undoInsertStaff = function (this: Score, staff: Staff, ridx: staff_idx_t, createRests = true): void {
    this.undo(new InsertStaff(staff, ridx))
    const idx = this.staffIdxOfPart(staff.part()) + ridx
    for (let m = this.firstMeasure(); m; m = m.nextMeasure()) {
        m.cmdAddStaves(idx, idx + 1, createRests)
        if (m.hasMMRest()) {
            m.mmRest()!.cmdAddStaves(idx, idx + 1, false)
        }
    }
    // when newly adding an instrument,
    // this was already set when we created the staff
    // we don't have any better info at this point
    // and it doesn't work to adjust bracket & barlines until all staves are added
    // TODO: adjust brackets only when appropriate
    //adjustBracketsIns(idx, idx+1);
}

Score.prototype.undoRemoveBracket = function (this: Score, b: Bracket): void {
    this.undo(new RemoveBracket(b.staff()!, b.column(), b.bracketType(), b.span()))
}

// ---- score.cpp: the part and staff functions that create undo commands ----

Score.prototype.cmdRemovePart = function (this: Score, part: Part | null): void {
    if (!part) {
        return
    }

    const sidx = this.staffIdxOfPart(part)
    const n = part.nstaves()

    for (let i = 0; i < n; ++i) {
        this.cmdRemoveStaff(sidx)
    }

    this.undoRemovePart(part, this.parts().indexOf(part))
}

Score.prototype.cmdRemoveStaff = function (this: Score, staffIdx: staff_idx_t): void {
    const s = this.staff(staffIdx)!
    this.adjustBracketsDel(staffIdx, staffIdx + 1)

    this.undoRemoveStaff(s)
}

Score.prototype.adjustBracketsDel = function (this: Score, sidx: number, eidx: number): void {
    if (!(sidx < eidx && eidx <= this.nstaves())) {
        return
    }

    const staves = this.staves()
    for (let staffIdx = 0; staffIdx < eidx; ++staffIdx) {
        const staff = staves[staffIdx]
        for (const bi of [...staff.brackets()]) {
            const span = bi.bracketSpan()
            if ((span === 0) || ((staffIdx + span) <= sidx)) {
                continue
            }
            const startsOutsideDeletedRange = staffIdx < sidx
            const endsOutsideDeletedRange = (staffIdx + span) >= eidx
            if (startsOutsideDeletedRange && endsOutsideDeletedRange) {
                // Shorten the bracket by the number of staves deleted
                bi.undoChangeProperty(Pid.BRACKET_SPAN, span - (eidx - sidx))
            } else if (startsOutsideDeletedRange) {
                // Shorten the bracket by the number of staves deleted that were spanned by it
                bi.undoChangeProperty(Pid.BRACKET_SPAN, sidx - staffIdx)
            } else if (endsOutsideDeletedRange) {
                if (eidx < staves.length) {
                    // Move the bracket past the end of the deleted range,
                    // and shorten it by the number of staves deleted that were spanned by it.
                    // That is, add a new bracket; the old one will be removed when removing the staves.

                    this.undoAddBracket(staves[eidx], bi.column(), bi.bracketType(), span - (eidx - staffIdx))
                }
            }
        }
    }
}

Score.prototype.adjustBracketsIns = function (this: Score, sidx: number, eidx: number): void {
    const staves = this.staves()
    for (let staffIdx = 0; staffIdx < staves.length; ++staffIdx) {
        const staff = staves[staffIdx]
        for (const bi of staff.brackets()) {
            const span = bi.bracketSpan()
            if ((span === 0) || ((staffIdx + span) < sidx) || (staffIdx > eidx)) {
                continue
            }
            if ((sidx >= staffIdx) && (eidx <= (staffIdx + span))) {
                bi.undoChangeProperty(Pid.BRACKET_SPAN, span + (eidx - sidx))
            }
        }
    }
}

Score.prototype.updateBracesAndBarlines = function (this: Score, part: Part, newIndex: number): void {
    let noBracesFound = true
    for (let indexInPart = 0; indexInPart < part.nstaves(); ++indexInPart) {
        const indexInScore = part.staves()[indexInPart].idx()
        for (const bi of this.staff(indexInScore)!.brackets()) {
            noBracesFound = false
            if (bi.bracketType() === BracketType.BRACE) {
                if ((indexInPart <= newIndex) && (newIndex <= bi.bracketSpan())) {
                    bi.undoChangeProperty(Pid.BRACKET_SPAN, bi.bracketSpan() + 1)
                }
            }
        }
    }

    const updateBracketSpan = (modIndex: number, refIndex: number): void => {
        const modStaff = this.staff(part.staves()[modIndex].idx())!
        const refStaff = this.staff(part.staves()[refIndex].idx())!
        modStaff.undoChangeProperty(Pid.STAFF_BARLINE_SPAN, refStaff.getProperty(Pid.STAFF_BARLINE_SPAN))
    }

    if (newIndex >= 2) {
        updateBracketSpan(newIndex - 1, newIndex - 2)
    }

    if (part.nstaves() === 2) {
        const tp = searchTemplate(part.instrument().id())
        if (tp) {
            const firstStaffBarLineSpan = tp.barlineSpan[0]
            if (firstStaffBarLineSpan) {
                this.staff(part.staff(0)!.idx())!.undoChangeProperty(Pid.STAFF_BARLINE_SPAN, firstStaffBarLineSpan)
            }
            if (noBracesFound && (tp.bracket[0] !== BracketType.NO_BRACKET)) {
                this.undoAddBracket(part.staves()[0], 0, tp.bracket[0], part.nstaves())
            }
        }
    } else {
        updateBracketSpan(newIndex, newIndex - 1)
    }
}

/**
 * Reconstructs brackets and barlines based on how they are in the masterScore. Must be called after creating an
 * excerpt or adding new parts to it.
 * TODO(port): excerpt scores (the master score has nothing to do)
 */
Score.prototype.remapBracketsAndBarlines = function (this: Score): void {
    if (this.isMaster()) {
        return
    }
    throw new Error('TODO(port): Score::remapBracketsAndBarlines for excerpts')
}

Score.prototype.undoAddBracket = function (this: Score, staff: Staff, level: number, type: BracketType, span: number): void {
    const startStaffIdx = staff.idx()
    const totStaves = this.nstaves()

    // Make sure this brackets won't overlap with others sharing same column.
    // If overlaps are found, move the other brackets outwards (i.e. increase column).
    for (let staffIdx = startStaffIdx; staffIdx < startStaffIdx + span && staffIdx < totStaves; ++staffIdx) {
        const brackets = this.staves()[staffIdx].brackets()

        for (let i = brackets.length - 1; i >= level; --i) {
            if (i >= brackets.length) {
                // This might theoretically happen when a lot of brackets get cleaned up
                // after changing the column of the first bracket we see
                continue
            }

            if (brackets[i].bracketType() === BracketType.NO_BRACKET) {
                continue
            }

            brackets[i].undoChangeProperty(Pid.BRACKET_COLUMN, brackets[i].column() + 1)
        }
    }

    this.undo(new AddBracket(staff, level, type, span))
}

/** acts on the linked scores as well (TODO(port): linked scores) */
Score.prototype.undoInsertTime = function (this: Score, tick: Fraction, len: Fraction): void {
    if (len.isZero()) {
        return
    }

    const spannersToAdjust: Spanner[] = []
    for (const s of this.spanner()) {
        if (s.tick2().lt(tick)) {
            continue
        }
        let append = false
        if (len.gt(new Fraction(0, 1))) {
            if (tick.gt(s.tick()) && tick.lt(s.tick2())) {
                append = true
            } else if (tick.le(s.tick())) {
                append = true
            }
        } else {
            // TODO(port): removing time
            throw new Error('TODO(port): Score::undoInsertTime with negative length')
        }
        if (append) {
            spannersToAdjust.push(s)
        }
    }
    for (const s of spannersToAdjust) {
        if (tick.eq(s.tick()) && s.isVolta()) {
            s.undoChangeProperty(Pid.SPANNER_TICKS, s.ticks().plus(len))
        } else if (tick.gt(s.tick()) && tick.lt(s.tick2())) {
            //
            //  case a:
            //  +----spanner--------+
            //    +---add---
            //
            s.undoChangeProperty(Pid.SPANNER_TICKS, s.ticks().plus(len))
        } else if (tick.le(s.tick())) {
            //
            //  case b:
            //       +----spanner--------
            //  +---add---
            // and
            //            +----spanner--------
            //  +---add---+
            const startElement = s.startElement()
            const endElement = s.endElement()
            s.setStartElement(null) // undoChangeSpannerElements
            s.setEndElement(null)
            s.undoChangeProperty(Pid.SPANNER_TICK, s.tick().plus(len))
            s.setStartElement(startElement)
            s.setEndElement(endElement)
        }
    }

    // TODO(port): insert time in linked scores (undo(new InsertTime(...)) is done by the callers here)
}

Score.prototype.undoAddCR = function (this: Score, cr: ChordRest, measure: Measure, tick: Fraction): void {
    // TODO(port): lyrics, linked staves, tuplets
    const ostaff = cr.staff()!
    const strack = cr.track()

    const segmentType = SegmentType.ChordRest

    for (const staff of ostaff.staffList()) {
        const linkedTrack: track_idx_t = strack // ostaff->getLinkedTrackInStaff(staff, strack)

        if (linkedTrack === nidx || linkedTrack < staff.part().startTrack() || linkedTrack >= staff.part().endTrack()) {
            continue
        }

        const score = staff.score()
        const m = score === this ? measure : score.tick2measure(tick)
        if (!m) {
            break
        }
        const seg = m.undoGetSegment(segmentType, tick)

        const newcr = staff === ostaff ? cr : cr.linkedClone() as ChordRest
        newcr.setScore(score)

        newcr.setTrack(linkedTrack)
        newcr.setParent(seg)

        if (newcr.isRest() && (newcr as Rest).isGap() && !(newcr.track() % VOICES)) {
            (newcr as Rest).setGap(false)
        }

        this.doUndoAddElement(newcr)
    }
}

/**
 * if inserting Measure, act on master score (and add to all linked scores);
 * if inserting Box, add to local score only
 */
Score.prototype.insertMeasure = function (this: Score, type: ElementType, beforeMeasure: MeasureBase | null = null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): MeasureBase | null {
    let localInsertMeasureBase: MeasureBase | null = null
    if (type === ElementType.MEASURE) {
        const masterInsertMeasure = this.masterScore().insertMeasureInMaster(beforeMeasure, options)
        if (masterInsertMeasure) {
            localInsertMeasureBase = this.tick2measureBase(masterInsertMeasure.tick())
        }
    } else {
        localInsertMeasureBase = this.insertBox(type, beforeMeasure, options)
    }

    // TODO(port): deselectAll()

    return localInsertMeasureBase
}

Score.prototype.insertBox = function (this: Score, type: ElementType, beforeMeasure: MeasureBase | null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): MeasureBase | null {
    const isFrame = type === ElementType.FBOX || type === ElementType.HBOX || type === ElementType.TBOX || type === ElementType.VBOX

    if (!isFrame) {
        return null
    }

    let tick: Fraction
    const isTitleFrame = type === ElementType.VBOX && !!beforeMeasure && beforeMeasure === beforeMeasure.score().first()
    if (beforeMeasure) {
        if (beforeMeasure.isMeasure()) {
            const m = beforeMeasure as Measure
            if (m.isMMRest()) {
                beforeMeasure = m.mmRestFirst()
            }
            // TODO(port): measure repeat groups (MsError::CANNOT_SPLIT_MEASURE_REPEAT)
        } else {
            beforeMeasure = beforeMeasure.top() // don't try to insert in front of nested frame
        }
        tick = beforeMeasure!.tick()
    } else {
        tick = this.last() ? this.last()!.endTick() : new Fraction(0, 1)
    }

    const newMeasureBase = Factory.createItem(type, this.dummySystem()) as MeasureBase
    newMeasureBase.setTick(tick)
    newMeasureBase.setNext(beforeMeasure)
    newMeasureBase.setPrev(beforeMeasure ? beforeMeasure.prev() : this.last())
    newMeasureBase.setSizeIsSpatiumDependent(!isTitleFrame)

    // TODO(port): FBox::init()

    new InsertMeasures(newMeasureBase, newMeasureBase).redo() // TODO(port): undo

    if (options.cloneBoxToAllParts) {
        // TODO(port): newMeasureBase->manageExclusionFromParts(false) (excerpts)
    }

    return newMeasureBase
}

Score.prototype.restoreInitialKeySigAndTimeSig = function (this: Score): void {
    const concertPitch = this.style().styleB(Sid.concertPitch)
    const startTick = new Fraction(0, 1)

    const firstMeas = this.firstMeasure()!
    for (const staff of this.staves()) {
        const concertKey = Key.C
        let transposedKey = concertKey
        const part = staff.part()
        const instrument = part.instrument()
        const transpose = -instrument.transpose().chromatic
        if (!concertPitch) {
            transposedKey = Transpose.transposeKey(transposedKey, Interval.fromChromatic(transpose), part.preferSharpFlat())
        }

        const keySegment = firstMeas.undoGetSegment(SegmentType.KeySig, startTick)

        const keySigEvent = new KeySigEvent()
        keySigEvent.setConcertKey(concertKey)
        keySigEvent.setKey(transposedKey)
        // use atonal KS for drums
        if (instrument.useDrumset()) {
            keySigEvent.setCustom(true)
            keySigEvent.setMode(KeyMode.NONE)
        }

        const newKeySig = Factory.createItem(ElementType.KEYSIG, keySegment) as KeySig
        newKeySig.setTrack(staff.idx() * VOICES)
        keySegment.add(newKeySig)
        newKeySig.setKeySigEvent(keySigEvent)
        this.undoAddElement(newKeySig)

        staff.setKey(new Fraction(0, 1), keySigEvent)

        const timeSegment = firstMeas.undoGetSegment(SegmentType.TimeSig, startTick)
        const newTimeSig = Factory.createItem(ElementType.TIMESIG, timeSegment) as TimeSig
        newTimeSig.setTrack(staff.idx() * VOICES)
        newTimeSig.setSig(new Fraction(4, 4))
        timeSegment.add(newTimeSig)
        this.undoAddElement(newTimeSig)
    }

    firstMeas.setTimesig(new Fraction(4, 4))
    firstMeas.setTicks(new Fraction(4, 4))
}

Score.prototype.cmdAddTimeSig = function (this: Score, fm: Measure, staffIdx: staff_idx_t, ts: TimeSig, local: boolean): void {
    // TODO(port): deselectAll()

    if (fm.isMMRest()) {
        fm = fm.mmRestFirst()!
    }

    const ns = ts.sig()
    const tick = fm.tick()
    if (local) {
        const stretch = ns.div(fm.timesig()).reduced()
        ts.setStretch(stretch)
    }

    const track = staffIdx * VOICES
    let seg = fm.findSegment(SegmentType.TimeSig, tick)
    let ots = seg ? seg.element(track) as TimeSig | null : null

    // Check same tick at end of previous measure
    if (!ots) {
        const prevMeasure = fm.prevMeasure()
        seg = prevMeasure ? prevMeasure.findSegmentR(SegmentType.TimeSig, prevMeasure.ticks()) : seg
        ots = seg ? seg.element(track) as TimeSig | null : null
    }

    if (ots && ots.equals(ts)) {
        //
        //  ignore if there is already a timesig
        //  with same values
        //
        return
    }

    seg = fm.undoGetSegment(SegmentType.TimeSig, tick)

    const getStaffIdxRange = (score: Score): [staff_idx_t, staff_idx_t] => {
        if (local) {
            // TODO(port): linked staves in other scores
            return [staffIdx, staffIdx + 1]
        }
        return [0, score.nstaves()]
    }

    if (ots && ots.sig().eq(ns) && ots.stretch().eq(ts.stretch())) {
        //
        // the measure duration does not change,
        // so its ok to just update the time signatures
        //
        const nts = this.staff(staffIdx)!.nextTimeSig(tick.plus(Fraction.eps()))
        const lmTick = nts ? nts.segment().tick() : new Fraction(-1, 1)
        for (const score of [this]) { // TODO(port): scoreList()
            const mf = score.tick2measure(tick)
            const lm = !lmTick.eq(new Fraction(-1, 1)) ? score.tick2measure(lmTick) : null
            for (let m = mf; m && m !== lm; m = m.nextMeasure()) {
                const changeActual = m.ticks().eq(m.timesig())
                m.undoChangeProperty(Pid.TIMESIG_NOMINAL, ns)
                if (changeActual) {
                    m.undoChangeProperty(Pid.TIMESIG_ACTUAL, ns)
                }
            }
            const [first, end] = getStaffIdxRange(score)
            for (let si = first; si < end; ++si) {
                const nsig = seg.element(si * VOICES) as TimeSig | null
                if (!nsig) {
                    continue
                }
                nsig.undoChangeProperty(Pid.SHOW_COURTESY, ts.showCourtesySig())
                nsig.undoChangeProperty(Pid.TIMESIG, ts.sig())
                nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                nsig.undoChangeProperty(Pid.NUMERATOR_STRING, ts.numeratorString())
                nsig.undoChangeProperty(Pid.DENOMINATOR_STRING, ts.denominatorString())
                nsig.undoChangeProperty(Pid.TIMESIG_STRETCH, ts.stretch())
                nsig.undoChangeProperty(Pid.GROUP_NODES, ts.groups().nodes())
                // TODO(port): nsig->setSelected(false); nsig->setDropTarget(false)
            }
        }
    } else {
        const mScore = this.masterScore()
        let mf: Measure | null = mScore.tick2measure(tick)

        //
        // rewrite all measures up to the next time signature
        //
        if (mf === mScore.firstMeasure() && mf!.nextMeasure() && !mf!.ticks().eq(mf!.timesig())) {
            // handle upbeat
            mf!.undoChangeProperty(Pid.TIMESIG_NOMINAL, ns)
            const m = mf!.nextMeasure()!
            const s = m.findSegment(SegmentType.TimeSig, m.tick())
            mf = s ? null : mf!.nextMeasure()
        } else {
            if (this.sigmap().timesig(seg.tick().ticks()).nominal().identical(ns)) {
                // no change to global time signature,
                // but we need to rewrite any staves with local time signatures
                for (let i = 0; i < this.nstaves(); ++i) {
                    const its = this.staff(i)!.timeSig(tick)
                    if (its && its.isLocal()) {
                        // TODO(port): MasterScore::rewriteMeasures
                        throw new Error('TODO(port): Score::rewriteMeasures (local time signatures)')
                    }
                }
                mf = null
            }
        }

        // try to rewrite the measures first
        // we will only add time signatures if this succeeds
        // this means, however, that the rewrite cannot depend on the time signatures being in place
        if (mf) {
            const [first, end] = getStaffIdxRange(mScore)
            if (end !== first) {
                // TODO(port): MasterScore::rewriteMeasures (copy/paste of the measure contents)
                throw new Error('TODO(port): Score::rewriteMeasures')
            }
        }
        // add the time signatures
        for (const score of [this]) { // TODO(port): scoreList(), links to the master time signatures
            const nfm = score.tick2measure(tick)!
            seg = nfm.undoGetSegment(SegmentType.TimeSig, nfm.tick())
            const [first, end] = getStaffIdxRange(score)
            for (let si = first; si < end; ++si) {
                // TODO(port): if (fm->isMeasureRepeatGroup(si)) deleteItem(fm->measureRepeatElement(si))
                let nsig = seg.element(si * VOICES) as TimeSig | null
                if (!nsig) {
                    nsig = ts.clone() as TimeSig // Factory::copyTimeSig
                    nsig.setScore(score)
                    nsig.setTrack(si * VOICES)
                    nsig.setParent(seg)
                    nsig.styleChanged()
                    this.undoAddElement(nsig)
                } else {
                    nsig.undoChangeProperty(Pid.SHOW_COURTESY, ts.showCourtesySig())
                    nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                    nsig.undoChangeProperty(Pid.TIMESIG, ts.sig())
                    nsig.undoChangeProperty(Pid.NUMERATOR_STRING, ts.numeratorString())
                    nsig.undoChangeProperty(Pid.DENOMINATOR_STRING, ts.denominatorString())

                    // HACK do it twice to accommodate undo
                    nsig.undoChangeProperty(Pid.TIMESIG_TYPE, ts.timeSigType())
                    nsig.undoChangeProperty(Pid.TIMESIG_STRETCH, ts.stretch())
                    nsig.undoChangeProperty(Pid.GROUP_NODES, ts.groups().nodes())
                }
            }
        }
    }
}

Score.prototype.undoChangeKeySig = function (this: Score, ostaff: Staff, tick: Fraction, key: KeySigEvent): void {
    for (const staff of ostaff.staffList()) {
        if (staff.isDrumStaff(tick)) {
            continue
        }

        const score = staff.score()
        const measure = score.tick2measure(tick)
        if (!measure) {
            continue
        }
        const s = measure.undoGetSegment(SegmentType.KeySig, tick)

        const staffIdx = staff.idx()
        const track = staffIdx * VOICES
        const ks = s.element(track) as KeySig | null

        const interval = staff.part().instrument(tick).transpose().clone()
        const nkey = key.clone()
        const concertPitch = score.style().styleB(Sid.concertPitch)

        if (interval.chromatic && !concertPitch && !nkey.isAtonal()) {
            interval.flip()
            nkey.setKey(Transpose.transposeKey(key.concertKey(), interval, staff.part().preferSharpFlat()))
            interval.flip()
        }

        // TODO(port): updateInstrumentChangeTranspositions(key, staff, tick)
        if (ks) {
            ks.undoChangeProperty(Pid.GENERATED, false)
            // TODO(port): undo (ChangeKeySig::flip with evtInStaff = true)
            const segment = ks.segment()!
            ks.setKeySigEvent(nkey)
            ks.setShowCourtesy(ks.showCourtesy())
            ks.staff()!.setKey(segment.tick(), nkey) // replace
            segment.setEnabled(true)
            segment.setHeader(false)
        } else {
            const nks = Factory.createItem(ElementType.KEYSIG, s) as KeySig
            nks.setParent(s)
            nks.setTrack(track)
            nks.setKeySigEvent(nkey)
            this.doUndoAddElement(nks)
            // TODO(port): links between the key signatures of linked staves
        }
        // TODO(port): Transpose::transpositionChanged if the staff transposition changed (transposes existing notes)
    }
}

Score.prototype.addText = function (this: Score, type: TextStyleType, destinationElement: EngravingItem | null = null): TextBase | null {
    let textBox: TextBase | null = null

    switch (type) {
    case TextStyleType.TITLE:
    case TextStyleType.SUBTITLE:
    case TextStyleType.COMPOSER:
    case TextStyleType.LYRICIST:
    case TextStyleType.INSTRUMENT_EXCERPT: {
        let frame: MeasureBase | null = null

        if (destinationElement && destinationElement.isVBox()) {
            frame = destinationElement as unknown as MeasureBase
        } else {
            frame = this.first()
            if (!frame || !frame.isBox()) {
                frame = this.insertBox(ElementType.VBOX, frame)
            }
        }

        textBox = new Text(frame, type) // Factory::createText(frame, type)
        textBox.setParent(frame)
        this.undoAddElement(textBox)
        break
    }
    case TextStyleType.FRAME: {
        if (!destinationElement) {
            break
        }
        textBox = new Text(destinationElement, type)
        textBox.setParent(destinationElement)
        this.undoAddElement(textBox)
        break
    }
    default:
        // TODO(port): rehearsal marks, staff/system texts, dynamics, expressions, ... (they need a chord/rest)
        break
    }

    return textBox
}

/** (score.cpp) */
Score.prototype.adjustKeySigs = function (this: Score, sidx: staff_idx_t, eidx: staff_idx_t, km: KeyList): void {
    for (let staffIdx = sidx; staffIdx < eidx; ++staffIdx) {
        const staff = this.staves()[staffIdx]
        for (const [t, ke] of km.entries()) {
            const tick = Fraction.fromTicks(t)
            const measure = this.tick2measure(tick)
            if (!measure) {
                continue
            }
            if (staff.isDrumStaff(tick)) {
                continue
            }
            const key = ke.clone()
            const v = staff.part().instrument(tick).transpose().clone()
            if (!v.isZero() && !this.style().styleB(Sid.concertPitch) && !key.isAtonal()) {
                v.flip()
                key.setKey(Transpose.transposeKey(key.concertKey(), v, staff.part().preferSharpFlat()))
            }
            staff.setKey(tick, key)

            const s = measure.getSegment(SegmentType.KeySig, tick)
            const keysig = Factory.createItem(ElementType.KEYSIG, s) as KeySig
            keysig.setParent(s)
            keysig.setTrack(staffIdx * VOICES)
            keysig.setKeySigEvent(key)
            this.doUndoAddElement(keysig)
        }
    }
}

Score.prototype.clearSystemLocks = function (this: Score): void {
    this.systemLocks().clear()
}

/**
 * Create a new MeasureBase of Measure type and insert before measure. If measure is zero, append new MeasureBase.
 * TODO(port): inserting before existing measures (moving clefs, key and time signatures, barlines, repeats)
 */
MasterScore.prototype.insertMeasureInMaster = function (this: MasterScore, beforeMeasure: MeasureBase | null = null,
    options: InsertMeasureOptions = new InsertMeasureOptions()): Measure | null {
    let tick: Fraction
    if (beforeMeasure) {
        // TODO(port): mm rests, measure repeat groups and the moved elements below
        throw new Error('TODO(port): MasterScore::insertMeasure before a measure')
    } else {
        tick = this.last() ? this.last()!.endTick() : new Fraction(0, 1)
    }

    const isBeginning = tick.isZero()

    // Use nominal time signature of current or previous measure, depending on whether
    // the time sig from `beforeMeasure` will be moved to the newly created measure
    const currentTimeSig = this.sigmap().timesig(tick).nominal() // (prevMeasure()->tick() when inserting before a measure)

    let masterMeasure: Measure | null = null
    let ticks = new Fraction(0, 1)

    for (const score of [this as Score]) { // TODO(port): scoreList() (excerpts)
        const actualBeforeMeasure: MeasureBase | null = null

        const newMeasure = Factory.createItem(ElementType.MEASURE, score.dummySystem()) as Measure
        newMeasure.setTick(tick)

        newMeasure.setNext(actualBeforeMeasure)
        newMeasure.setPrev(score.last())

        newMeasure.setTimesig(currentTimeSig)
        newMeasure.setTicks(currentTimeSig)

        new InsertMeasures(newMeasure, newMeasure, options.moveStaffTypeChanges).redo() // TODO(port): undo

        ticks = newMeasure.ticks()
        const measureInsert: Measure | null = null // insert before

        if (score.isMaster()) {
            masterMeasure = newMeasure
        }

        const pm = newMeasure.prevMeasure()

        if (!measureInsert && tick.eq(new Fraction(0, 1))) {
            // If inserting measure into an empty score, restore default C key signature
            // and 4/4 time signature
            score.restoreInitialKeySigAndTimeSig()
        }

        if (pm && !options.moveSignaturesClef && !options.ignoreBarLines) {
            // TODO(port): move the end barlines of the previous measure (only when inserting before a measure)
        }
    }

    this.undoInsertTime(tick, ticks)

    if (masterMeasure && !options.createEmptyMeasures) {
        //
        // fill measure with rest
        // undoAddCR adds rest to linked staves as well
        for (let staffIdx = 0; staffIdx < this.nstaves(); ++staffIdx) {
            const track = staffIdx * VOICES
            const rest = Factory.createItem(ElementType.REST, this) as Rest // parent: dummy segment
            rest.setDurationType(new TDuration(DurationType.V_MEASURE))
            const timeStretch = this.staff(staffIdx)!.timeStretch(masterMeasure.tick())
            rest.setTicks(masterMeasure.ticks().times(timeStretch))
            rest.setTrack(track)
            this.undoAddCR(rest, masterMeasure, tick)
        }
    }

    // TODO(port): deselectAll()

    return masterMeasure
}

Measure.prototype.adjustToLen = function (this: Measure, nf: Fraction, _appendRestsIfNecessary = true): void {
    const ol = this.ticks()
    const nl = nf
    const diff = nl.minus(ol)

    let startTick = this.endTick()
    if (diff.lt(new Fraction(0, 1))) {
        startTick = startTick.plus(diff)
    }

    this.score().undoInsertTime(startTick, diff)

    for (const s of [this.score()]) { // TODO(port): scoreList()
        new InsertTime(s, startTick, diff).redo() // TODO(port): undo
        const m = s.tick2measure(this.tick())!
        new ChangeMeasureLen(m, nf).redo() // TODO(port): undo
        if (nl.gt(ol)) {
            // move EndBarLine, TimeSigAnnounce, KeySigAnnounce
            for (let seg = m.first(); seg; seg = seg.next()) {
                if (seg.segmentType() & (SegmentType.EndBarLine | SegmentType.CourtesyTimeSigType | SegmentType.CourtesyKeySigType)) {
                    seg.setRtick(nl)
                }
            }
        }
    }
    const s = this.score().masterScore()
    const m = s.tick2measure(this.tick())!
    const sl = s.uniqueStaves()

    for (const staffIdx of sl) {
        let rests = 0
        let chords = 0
        let rest: Rest | null = null
        for (let segment = m.first(); segment; segment = segment.next()) {
            const strack = staffIdx * VOICES
            const etrack = strack + VOICES
            for (let track = strack; track < etrack; ++track) {
                const e = segment.element(track)
                if (e) {
                    if (e.isRest()) {
                        ++rests
                        rest = e as Rest
                    } else if (e.isChord()) {
                        ++chords
                    }
                }
            }
        }
        const stretch = s.staff(staffIdx)!.timeStretch(this.tick())
        // if just a single rest
        if (rests === 1 && chords === 0) {
            // if measure value didn't change, stick to whole measure rest
            if (this.timesig().eq(nf)) {
                rest!.undoChangeProperty(Pid.DURATION, nf.times(stretch))
                rest!.undoChangeProperty(Pid.DURATION_TYPE_WITH_DOTS, new TDuration(DurationType.V_MEASURE).typeWithDots())
            } else { // if measure value did change, represent with rests actual measure value
                // convert the measure duration in a list of values (no dots for rests)
                const durList = toRhythmicDurationList(nf.times(stretch), /*isRest=*/ true, /*rtickStart=*/ new Fraction(0, 1),
                    /*nominal=*/ this.score().sigmap().timesig(this.tick().ticks()).nominal(), /*measure=*/ this, /*maxDots=*/ 0, stretch)
                if (durList.length === 0) {
                    continue
                }
                // set the existing rest to the first value of the duration list
                const firstDur = durList[0]
                rest!.undoChangeProperty(Pid.DURATION, firstDur.isMeasure() ? this.ticks() : firstDur.fraction())
                rest!.undoChangeProperty(Pid.DURATION_TYPE_WITH_DOTS, durList[0].typeWithDots())

                // add rests for any other duration list value
                let tickOffset = this.tick().plus(rest!.actualTicks())
                for (let i = 1; i < durList.length; i++) {
                    const newRest = Factory.createItem(ElementType.REST, s) as Rest // parent: dummy segment
                    const dur = durList[i]
                    newRest.setDurationType(dur)
                    newRest.setTicks(dur.isMeasure() ? this.ticks() : dur.fraction())
                    newRest.setTrack(rest!.track())
                    this.score().undoAddCR(newRest, this, tickOffset)
                    tickOffset = tickOffset.plus(newRest.actualTicks())
                }
            }
            continue
        }

        // TODO(port): measures with notes or several rests (removing/appending chords and rests)
        throw new Error('TODO(port): Measure::adjustToLen of a measure with notes')
    }
    // TODO(port): remove slurs when shortening, update the selection
}

// =====================================================================================================================
//   edit.cpp functions of the editing commands (selection helpers, adding chords/rests/notes, ties, flip,
//   deletion, visibility, undo helpers) and Score::changeSelectedElementsVoice / canReselectItem of score.cpp
// =====================================================================================================================

Score.prototype.getSelectedNote = function (this: Score): Note | null {
    const el = this.selection().element()
    if (el && el.isNote()) {
        return el as unknown as Note
    }
    MScore.setError(MsError.NO_NOTE_SELECTED)
    return null
}

/** C++ chordOrRest() of edit.cpp */
function chordOrRest(el: EngravingItem | null): ChordRest | null {
    if (el) {
        if (el.isNote()) {
            return (el as unknown as Note).chord()
        } else if (el.isRestFamily() || el.isChord()) {
            return el as unknown as ChordRest
        }
    }
    return null
}

Score.prototype.getSelectedChordRest = function (this: Score): ChordRest | null {
    const cr = chordOrRest(this.selection().element())
    if (!cr) {
        MScore.setError(MsError.NO_NOTE_REST_SELECTED)
    }

    return cr
}

Score.prototype.getSelectedChordRests = function (this: Score): Set<ChordRest> {
    const set = new Set<ChordRest>()
    for (let e of this.selection().elements()) {
        if (e.isNote()) {
            e = e.parentItem()!
        }
        if (e.isChordRest()) {
            set.add(e as unknown as ChordRest)
        }
    }
    return set
}

/**
 * create one Rest at tick (C++ addRest(const Fraction& tick, ...)) or in the segment (addRest(Segment*, ...)) with
 * duration d; create segment if necessary
 */
Score.prototype.addRest = function (this: Score, tickOrSegment: Fraction | Segment, track: track_idx_t, d: TDuration,
    tuplet: Tuplet | null): Rest {
    if (tickOrSegment instanceof Fraction) {
        const tick = tickOrSegment
        const measure = this.tick2measure(tick)!
        const rest = Factory.createItem(ElementType.REST, scoreDummy(this).segment()) as Rest
        rest.setDurationType(d)
        if (d.type() === DurationType.V_MEASURE) {
            rest.setTicks(measure.stretchedLen(this.staff(track2staff(track))!))
        } else {
            rest.setTicks(d.fraction())
        }
        rest.setTrack(track)
        rest.setTuplet(tuplet)
        this.undoAddCR(rest, measure, tick)
        return rest
    }

    const s = tickOrSegment
    const rest = Factory.createItem(ElementType.REST, s) as Rest
    rest.setDurationType(d)
    if (d.type() === DurationType.V_MEASURE) {
        rest.setTicks(s.measure().stretchedLen(this.staff(Math.trunc(track / VOICES))!))
    } else {
        rest.setTicks(d.fraction())
    }
    rest.setTrack(track)
    rest.setParent(s)
    rest.setTuplet(tuplet)
    this.undoAddCR(rest, this.tick2measure(s.tick())!, s.tick())
    return rest
}

/**
 * Create one Chord at tick with duration d
 * - create segment if necessary.
 * - Use chord "oc" as prototype;
 * - if "genTie" then tie to chord "oc"
 */
Score.prototype.addChord = function (this: Score, tick: Fraction, d: TDuration, oc: Chord, genTie: boolean,
    tuplet: Tuplet | null): Chord | null {
    const measure = this.tick2measure(tick)
    if (!measure || measure.endTick().le(tick)) {
        // C++: LOGD("Score::addChord(): end of score?")
        return null
    }

    const chord = Factory.createItem(ElementType.CHORD, scoreDummy(this).segment()) as Chord
    chord.setTuplet(tuplet)
    chord.setTrack(oc.track())
    chord.setDurationType(d)
    chord.setTicks(d.fraction())
    chord.setStemDirection(oc.stemDirection())

    for (const n of oc.notes()) {
        const nn = Factory.createItem(ElementType.NOTE, chord) as Note
        nn.setPitch(n.pitch())
        nn.setTpc1(n.tpc1())
        nn.setTpc2(n.tpc2())
        chord.add(nn)
    }
    this.undoAddCR(chord, measure, tick)

    //
    // now as both chords are in place
    // (have segments as parent) we can add ties:
    //
    if (genTie) {
        const n = oc.notes().length
        for (let i = 0; i < n; ++i) {
            const n1 = oc.notes()[i]
            const n2 = chord.notes()[i]
            const tie = Factory.createItem(ElementType.TIE, scoreDummy(this)) as Tie
            tie.setStartNote(n1)
            tie.setEndNote(n2)
            tie.setTick(tie.startNote()!.tick())
            tie.setTick2(tie.endNote()!.tick())
            tie.setTrack(n1.track())
            this.undoAddElement(tie)
        }
    }

    return chord
}

Score.prototype.addClone = function (this: Score, cr: ChordRest, tick: Fraction, d: TDuration): ChordRest {
    // TODO(port): change a MeasureRepeat into a Rest (Factory::copyRest + hack_toRestType)
    const newcr = cr.clone() as ChordRest
    newcr.mutldata().setPosX(0.0)
    newcr.setDurationType(d)
    newcr.setTicks(d.isMeasure() ? cr.measure().stretchedLen(cr.staff()!) : d.fraction())
    newcr.setTuplet(cr.tuplet())
    newcr.setSelected(false)
    if (newcr.isChord()) {
        const chord = newcr as unknown as Chord
        for (const g of [...chord.graceNotes()]) {
            chord.remove(g) // C++ removeAllGraceNotes()
        }
    }

    this.undoAddCR(newcr, cr.measure(), tick)
    return newcr
}

/** sets rests and returns the first one; "l" is in local (stretched) time */
Score.prototype.setRest = function (this: Score, tick: Fraction, track: track_idx_t, l: Fraction, useDots: boolean,
    tuplet: Tuplet | null, useFullMeasureRest = true): Rest | null {
    const rests = this.setRests(tick, track, l, useDots, tuplet, useFullMeasureRest)
    return rests.length ? rests[0] : null
}

/** create one or more rests to fill "l"; "l" is in local (stretched) time */
Score.prototype.setRests = function (this: Score, tick_: Fraction, track: track_idx_t, l_: Fraction, useDots: boolean,
    tuplet: Tuplet | null, useFullMeasureRest = true): Rest[] {
    let l = l_
    let tick = tick_
    let measure: Measure | null = this.tick2measure(tick)
    const rests: Rest[] = []
    const staff = this.staff(Math.trunc(track / VOICES))!

    while (!l.isZero() && measure) {
        //
        // divide into measures
        //
        let f: Fraction
        if (tuplet) {
            f = tuplet.baseLen().fraction().times(new Fraction(tuplet.ratio().numerator(), 1))
            for (const de of tuplet.elements()) {
                if (de.tick().ge(tick)) {
                    break
                }
                f = f.minus(de.ticks())
            }
            //
            // restrict to tuplet len
            //
            if (f.lt(l)) {
                l = f
            }
        } else {
            if (measure.tick().lt(tick)) {
                f = measure.endTick().minus(tick)
            } else {
                f = measure.ticks()
            }
            f = f.times(staff.timeStretch(tick))
        }

        if (f.gt(l)) {
            f = l
        }

        // Don't fill a full measure with rests on a non-zero voice, *unless* it has links in voice zero
        const fullMeasure = tick.eq(measure.tick()) && f.eq(measure.stretchedLen(staff))
        const emptyNonZeroVoice = track2voice(track) !== 0 && !measure.hasVoice(track)
        // TODO(port): staff->trackHasLinksInVoiceZero(track) (linked staves)
        if (emptyNonZeroVoice && fullMeasure) {
            l = l.minus(f)
            measure = measure.nextMeasure()
            if (!measure) {
                break
            }
            tick = measure.tick()
            continue
        }

        if (measure.timesig().eq(measure.ticks()) // not in pickup measure
            && fullMeasure
            && !tuplet
            && useFullMeasureRest) {
            const rest = this.addRest(tick, track, new TDuration(DurationType.V_MEASURE), tuplet)
            tick = tick.plus(rest.actualTicks())
            rests.push(rest)
        } else {
            //
            // compute list of durations which will fit l
            //
            let dList: TDuration[]
            if (tuplet || f.isZero()) {
                dList = toDurationList(l, useDots)
                dList.reverse()
            } else {
                const timeStretch = staff.timeStretch(tick)
                dList = toRhythmicDurationList(f, true, tick.minus(measure.tick()).times(timeStretch),
                    this.sigmap().timesig(tick).nominal(), measure, useDots ? 1 : 0, timeStretch)
            }
            if (dList.length === 0) {
                return rests
            }

            for (const d of dList) {
                const rest = this.addRest(tick, track, d, tuplet)
                // If we're filling an empty non-zero voice make these gaps
                rest.setGap(emptyNonZeroVoice && !fullMeasure)
                rests.push(rest)
                tick = tick.plus(rest.actualTicks())
            }
        }
        l = l.minus(f)

        measure = measure.nextMeasure()
        if (!measure) {
            break
        }
        tick = measure.tick()
    }
    return rests
}

/** addNote from NoteVal */
Score.prototype.addNote = function (this: Score, chord: Chord, noteVal: NoteVal, forceAccidental = false,
    articulationIds: ReadonlySet<SymId> = new Set(), externalInputState: InputState | null = null): Note {
    const is = externalInputState ?? this.inputState()

    const note = Factory.createItem(ElementType.NOTE, chord) as Note
    note.setParent(chord)
    note.setTrack(chord.track())
    note.setNval(noteVal)
    this.undoAddElement(note)
    if (forceAccidental) {
        const tpc = this.style().styleB(Sid.concertPitch) ? noteVal.tpc1 : noteVal.tpc2
        const alter = tpc2alter(tpc)
        const at = Accidental.value2subtype(alter)
        const a = Factory.createItem(ElementType.ACCIDENTAL, note) as Accidental
        a.setAccidentalType(at)
        a.setRole(AccidentalRole.USER)
        a.setParent(note)
        this.undoAddElement(a)
    }

    if (articulationIds.size) {
        chord.updateArticulations(articulationIds)
    }

    // TODO(port): setPlayNote(true), setPlayChord(true) (playback)

    if (externalInputState) {
        is.setTrack(note.track())
        is.setLastSegment(is.segment())
        is.setSegment(note.chord().segment())
    } else {
        this.select(note, SelectType.SINGLE, 0)
    }

    if (!chord.staff()!.isTabStaff(chord.tick())) {
        const entryMethod = is.noteEntryMethod()
        if (entryMethod !== NoteEntryMethod.REPITCH && entryMethod !== NoteEntryMethod.REALTIME_AUTO
            && entryMethod !== NoteEntryMethod.REALTIME_MANUAL) {
            is.moveToNextInputPos()
        }
    }
    return note
}

Score.prototype.addNoteToTiedChord = function (this: Score, chord: Chord, noteVal: NoteVal, forceAccidental = false,
    articulationIds: ReadonlySet<SymId> = new Set()): Note | null {
    if (chord.notes().length === 0) {
        return null
    }
    let referenceNote = chord.notes()[0]

    while (true) {
        // don't add note if it is already part of tied notes previously
        if (referenceNote.chord().findNote(noteVal.pitch)) {
            return null
        }
        if (!referenceNote.tieBack() || referenceNote.incomingPartialTie()) {
            break
        }
        referenceNote = referenceNote.tieBack()!.startNote()!
    }

    let tie: Tie | null = null
    let newNote: Note | null = null

    while (referenceNote.tieFor()) {
        chord = referenceNote.chord()
        newNote = this.addNote(chord, noteVal, forceAccidental, articulationIds)
        if (!newNote) {
            return null
        }
        if (tie) {
            tie.setEndNote(newNote)
            tie.setTick2(newNote.tick())
            newNote.setTieBack(tie)
            this.undoAddElement(tie)
        }

        tie = Factory.createItem(ElementType.TIE, newNote) as Tie
        tie.setStartNote(newNote)
        tie.setTick(newNote.tick())
        tie.setTrack(newNote.track())
        newNote.setTieFor(tie)

        if (!referenceNote.tieFor()!.endNote()) {
            break
        }

        referenceNote = referenceNote.tieFor()!.endNote()!
    }

    chord = referenceNote.chord()
    newNote = this.addNote(chord, noteVal, forceAccidental, articulationIds)

    if (!newNote) {
        return null
    }

    if (tie) {
        tie.setEndNote(newNote)
        tie.setTick2(newNote.tick())
        newNote.setTieBack(tie)
        this.undoAddElement(tie)
    }

    this.connectTies()

    return newNote
}

Score.prototype.searchNote = function (this: Score, tick: Fraction, track: track_idx_t): ChordRest | null {
    let ipe: ChordRest | null = null
    const st = SegmentType.ChordRest
    // C++ firstSegment(st)
    const fm = this.firstMeasure()
    let first = fm ? fm.first() : null
    if (first && !(first.segmentType() & st)) {
        first = first.next1(st)
    }
    for (let segment = first; segment; segment = segment.next1(st)) {
        const cr = segment.cr(track)
        if (!cr) {
            continue
        }
        if (cr.tick().eq(tick)) {
            return cr
        }
        if (cr.tick().gt(tick)) {
            return ipe ?? cr
        }
        ipe = cr
    }
    return null
}

/**
 * combine consecutive rests into fewer rests of longer duration, combine tied notes/chords into fewer notes of longer
 * duration. Only operates on one voice - protects manual layout adjustment, etc.
 * TODO(port): Score::regroupNotesAndRests (not ported yet)
 */
Score.prototype.regroupNotesAndRests = function (this: Score, _startTick: Fraction, _endTick: Fraction, _track: track_idx_t): void {
}

Score.prototype.cmdTieNoteList = function (this: Score, selection: Selection, noteEntryMode: boolean): Note[] {
    const el = selection.element()
    const n = InputState.note(el)
    if (n) {
        if (noteEntryMode) {
            return [...n.chord().notes()]
        } else {
            return [n]
        }
    } else {
        const cr = InputState.chordRest(el)
        if (cr && cr.isChord()) {
            return [...(cr as Chord).notes()]
        }
    }
    return selection.noteList()
}

function createAndAddTie(startNote: Note, endNote: Note | null): Tie | null {
    const score = startNote.score()
    const tie = Factory.createItem(endNote ? ElementType.TIE : ElementType.PARTIAL_TIE, startNote) as Tie
    tie.setStartNote(startNote)
    tie.setTrack(startNote.track())
    tie.setTick(startNote.chord().segment().tick())
    if (endNote) {
        if (endNote.tieBack()) {
            score.undoRemoveElement(endNote.tieBack())
        }
        tie.setEndNote(endNote)
        tie.setTicks(endNote.chord().segment().tick().minus(startNote.chord().segment().tick()))
    }
    score.undoAddElement(tie)

    // TODO(port): tie->addTiesToJumpPoints(); remove a partial tie without jump points (repeats)

    return tie
}

Score.prototype.cmdAddTie = function (this: Score, addToChord = false): void {
    const noteList = this.cmdTieNoteList(this.selection(), this.noteEntryMode())
    if (noteList.length === 0) {
        // C++: LOGD("no notes selected")
        return
    }

    noteList.sort((a, b) => a.track() - b.track())
    let track = noteList[0].track()

    const toSelect: EngravingItem[] = []

    this.startCmd(new TranslatableString('undoableAction', 'Add tie'))
    let lastAddedChord: Chord | null = null
    const is = this.inputState()

    for (let note of noteList) {
        if (note.tieFor()) {
            if (addToChord) {
                continue
            } else {
                this.undoRemoveElement(note.tieFor())
            }
        }

        let cr: ChordRest | null = null
        const c = note.chord()
        const staffMove = c.staffMove()

        // set cursor at position after note
        if (c.isGraceBefore()) {
            // tie grace note before to main note
            cr = c.explicitParent() as unknown as Chord
            addToChord = true
        } else {
            is.setTrack(note.chord().track())
            is.setSegment(note.chord().segment())
            is.moveToNextInputPos()
            is.setLastSegment(is.segment())

            if (!is.cr()) {
                this.expandVoice()
            }
            cr = is.cr()
        }
        if (!cr) {
            break
        }

        let addFlag = lastAddedChord !== null
        if (c.track() !== track) {
            addFlag = false
            track = c.track()
        }
        // try to re-use existing note or chord
        let n: Note | null = null
        if (addToChord && cr.isChord()) {
            const chord = cr as Chord
            const nn = chord.findNote(note.pitch())
            if (nn && nn.tpc() === note.tpc()) {
                n = nn // re-use note
            } else {
                addFlag = true // re-use chord
            }
        }

        // if no note to re-use, create one
        const nval = note.noteVal()
        if (!n) {
            n = this.addPitch(nval, addFlag)
            if (n && staffMove !== 0) {
                this.undo(new ChangeChordStaffMove(n.chord(), staffMove))
            }
        } else {
            this.select(n)
        }

        if (n) {
            if (!lastAddedChord) {
                lastAddedChord = n.chord()
            }
            // n is not necessarily next note if duration span over measure
            let nnote = searchTieNote(note)
            while (nnote) {
                // DEBUG: if duration spans over measure
                // this does not set line for intermediate notes
                // tpc was set correctly already
                createAndAddTie(note, nnote)

                if (!addFlag || nnote.chord().tick().ge(lastAddedChord.tick()) || nnote.chord().isGrace()) {
                    break
                } else {
                    note = nnote
                    is.setLastSegment(is.segment())
                    nnote = this.addPitch(nval, true)
                }
            }
            if (staffMove !== 0) {
                for (const tiedNote of n.tiedNotes()) {
                    this.undo(new ChangeChordStaffMove(tiedNote.chord(), staffMove))
                }
            }
        }
        if (n) {
            toSelect.push(n)
        }
    }
    if (lastAddedChord) {
        this.nextInputPos(lastAddedChord, false)
    }
    for (const e of toSelect) {
        if (this.canReselectItem(e)) {
            this.select(e, SelectType.ADD)
        }
    }
    this.endCmd()
}

Score.prototype.cmdToggleTie = function (this: Score): Tie | null {
    const noteList: (Note | null)[] = this.cmdTieNoteList(this.selection(), this.noteEntryMode())

    if (noteList.length === 0) {
        // C++: LOGD("no notes selected")
        return null
    }

    const tieNoteList: (Note | null)[] = new Array(noteList.length).fill(null)
    let singleTick = true
    let someHaveExistingNextNoteToTieTo = false
    let allHaveExistingNextNoteToTieTo = true
    for (let i = 0; i < noteList.length; ++i) {
        const n = noteList[i]!
        if (!n.chord().tick().eq(noteList[0]!.tick())) {
            singleTick = false
        }
        if (n.tieFor()) {
            tieNoteList[i] = null
        } else {
            const tieNote = searchTieNote(n)
            tieNoteList[i] = tieNote
            if (tieNote || n.chord().hasFollowingJumpItem()) {
                someHaveExistingNextNoteToTieTo = true
            } else {
                allHaveExistingNextNoteToTieTo = false
            }
        }
    }

    const shouldTieListSelection = noteList.length >= 2 && !singleTick

    if (singleTick /* i.e. all notes are in the same tick */ && !allHaveExistingNextNoteToTieTo) {
        this.cmdAddTie()
        return null
    }

    const actionName = someHaveExistingNextNoteToTieTo
        ? new TranslatableString('undoableAction', 'Add tie')
        : new TranslatableString('undoableAction', 'Remove tie')

    this.startCmd(actionName)

    let tie: Tie | null = null

    for (let i = 0; i < noteList.length; ++i) {
        const note = noteList[i]
        const tieToNote = tieNoteList[i]

        if (!note) {
            continue
        }

        // Tie to adjacent unselected note
        if (someHaveExistingNextNoteToTieTo && tieToNote) {
            const startNote = note.tick().le(tieToNote.tick()) ? note : tieToNote
            const endNote = startNote === tieToNote ? note : tieToNote
            tie = createAndAddTie(startNote, endNote)
            continue
        }

        const oldTie = note.tieFor()
        const chord = note.chord()
        if (oldTie) {
            // Toggle existing tie off
            // TODO(port): oldTie->undoRemoveTiesFromJumpPoints() (repeats)
            this.undoRemoveElement(oldTie)
            continue
        }

        if (chord.hasFollowingJumpItem()) {
            // Create partial tie
            tie = createAndAddTie(note, null)
            continue
        }

        if (!shouldTieListSelection || i > noteList.length - 2) {
            continue
        }

        // Tie to next appropriate note in selection
        let note2: Note | null = null

        for (let j = i + 1; j < noteList.length; ++j) {
            const candidateNote = noteList[j]
            if (!candidateNote) {
                continue
            }
            const samePart = note.part() === candidateNote.part()
            const samePitch = note.pitch() === candidateNote.pitch()
            const sameUnisonIdx = note.unisonIndex() === candidateNote.unisonIndex()
            const diffTick = !note.tick().eq(candidateNote.tick())
            if (samePart && samePitch && sameUnisonIdx && diffTick) {
                note2 = candidateNote
                noteList[j] = null
                break
            }
        }

        if (!note2) {
            continue
        }

        const startNote = note.tick().le(note2.tick()) ? note : note2
        const endNote = startNote === note2 ? note : note2

        tie = createAndAddTie(startNote, endNote)
    }

    this.endCmd()

    return tie
}

Score.prototype.cmdToggleLaissezVib = function (this: Score): void {
    const noteList = this.selection().noteList()

    if (noteList.length === 0) {
        // C++: LOGD("no notes selected")
        return
    }

    this.startCmd(new TranslatableString('undoableAction', 'Toggle laissez vibrer'))

    for (const note of noteList) {
        const lv = note.laissezVib()
        if (lv) {
            this.undoRemoveElement(lv)
        } else if (note.tieFor()) {
            continue
        } else {
            const lvTie = Factory.createItem(ElementType.LAISSEZ_VIB, note)!
            lvTie.setParent(note)
            this.undoAddElement(lvTie)
        }
    }

    this.endCmd()
}

Score.prototype.cmdFlip = function (this: Score): void {
    const el = [...this.selection().elements()]
    if (el.length === 0) {
        MScore.setError(MsError.NO_FLIPPABLE_SELECTED)
        return
    }

    const alreadyFlippedElements = new Set<EngravingItem>()
    const flipOnce = (element: EngravingItem, flipFunction: () => void): void => {
        if (!alreadyFlippedElements.has(element)) {
            alreadyFlippedElements.add(element)
            flipFunction()
        }
    }

    for (let e of el) {
        if (e.hasVoiceAssignmentProperties()) {
            const item = e
            flipOnce(item, () => {
                const curPlacement = item.getProperty(Pid.PLACEMENT) as PlacementV
                item.undoChangeProperty(Pid.DIRECTION, curPlacement === PlacementV.ABOVE ? DirectionV.DOWN : DirectionV.UP)
            })
        } else if (e.isNote() || e.isStem() || e.isHook()) {
            const chord = (e as unknown as { chord(): Chord }).chord()
            if (!chord) {
                continue
            }

            if (chord.beam()) {
                if (!this.selection().isRange()) {
                    e = chord.beam()!
                } else {
                    continue
                }
            } else if (chord.tremoloTwoChord()) {
                if (!this.selection().isRange()) {
                    e = chord.tremoloTwoChord()!
                } else {
                    continue
                }
            } else {
                flipOnce(chord, () => {
                    const dir = chord.up() ? DirectionV.DOWN : DirectionV.UP
                    chord.undoChangeProperty(Pid.STEM_DIRECTION, dir)
                })
            }
        }

        if (e.isBeam()) {
            const beam = e as unknown as Beam
            flipOnce(beam, () => {
                if (beam.cross()) {
                    const newCrossStaffMove = beam.crossStaffMove() + 1
                    if (beam.acceptCrossStaffMove(newCrossStaffMove)) {
                        beam.undoChangeProperty(Pid.BEAM_CROSS_STAFF_MOVE, newCrossStaffMove)
                    } else {
                        beam.undoChangeProperty(Pid.BEAM_CROSS_STAFF_MOVE, beam.minCRMove() - beam.defaultCrossStaffIdx())
                    }
                } else {
                    const dir = beam.up() ? DirectionV.DOWN : DirectionV.UP
                    beam.undoChangeProperty(Pid.STEM_DIRECTION, dir)
                }
            })
        } else if (e.isType(ElementType.TREMOLO_TWOCHORD)) {
            const tremolo = e as unknown as TremoloTwoChord
            flipOnce(tremolo, () => {
                const dir = tremolo.up() ? DirectionV.DOWN : DirectionV.UP
                tremolo.undoChangeProperty(Pid.STEM_DIRECTION, dir)
            })
        } else if (e.isSlurTieSegment()) {
            const slurTie = (e as unknown as SlurTieSegment).slurTie()
            flipOnce(slurTie, () => {
                const dir = slurTie.up() ? DirectionV.DOWN : DirectionV.UP
                slurTie.undoChangeProperty(Pid.SLUR_DIRECTION, dir)
            })
        } else if (e.isArticulationFamily()) {
            const artic = e as unknown as Articulation
            flipOnce(artic, () => {
                let articAnchor = artic.anchor()
                switch (articAnchor) {
                case ArticulationAnchor.TOP:
                    articAnchor = ArticulationAnchor.BOTTOM
                    break
                case ArticulationAnchor.BOTTOM:
                    articAnchor = ArticulationAnchor.TOP
                    break
                case ArticulationAnchor.AUTO:
                    articAnchor = artic.up() ? ArticulationAnchor.BOTTOM : ArticulationAnchor.TOP
                    break
                }
                let pf = artic.propertyFlags(Pid.ARTICULATION_ANCHOR)
                if (pf === PropertyFlags.STYLED) {
                    pf = PropertyFlags.UNSTYLED
                }
                artic.undoChangeProperty(Pid.ARTICULATION_ANCHOR, articAnchor, pf)
            })
        } else if (e.isTuplet()) {
            const tuplet = e as unknown as Tuplet
            flipOnce(tuplet, () => {
                const dir = tuplet.isUp() ? DirectionV.DOWN : DirectionV.UP
                tuplet.undoChangeProperty(Pid.DIRECTION, dir, PropertyFlags.UNSTYLED)
            })
        } else if (e.isNoteDot() && e.explicitParent()!.isNote()) {
            const note = e.explicitParent() as unknown as Note
            const d = note.dotIsUp() ? DirectionV.DOWN : DirectionV.UP
            note.undoChangeProperty(Pid.DOT_POSITION, d)
        } else if (e.isChordBracket()) {
            // TODO(port): ChordBracket (BRACKET_HOOK_POS)
        } else if (e.isGuitarBendSegment()) {
            const bend = (e as unknown as SpannerSegment).spanner()!
            flipOnce(bend, () => {
                const direction = (bend.ldata() as unknown as { up?: boolean }).up ? DirectionV.DOWN : DirectionV.UP
                bend.undoChangeProperty(Pid.DIRECTION, direction)
            })
        } else if (e.isTrillSegment()) {
            const ornament = (e as unknown as TrillSegment).trill().ornament()
            if (!ornament) {
                continue
            }

            flipOnce(ornament, () => {
                let articAnchor = ornament.getProperty(Pid.ARTICULATION_ANCHOR) as ArticulationAnchor

                switch (articAnchor) {
                case ArticulationAnchor.TOP:
                    articAnchor = ArticulationAnchor.BOTTOM
                    break
                case ArticulationAnchor.BOTTOM:
                    articAnchor = ArticulationAnchor.TOP
                    break
                case ArticulationAnchor.AUTO:
                    articAnchor = ornament.up() ? ArticulationAnchor.BOTTOM : ArticulationAnchor.TOP
                    break
                }
                let pf = ornament.propertyFlags(Pid.ARTICULATION_ANCHOR)
                if (pf === PropertyFlags.STYLED) {
                    pf = PropertyFlags.UNSTYLED
                }
                ornament.undoChangeProperty(Pid.ARTICULATION_ANCHOR, articAnchor, pf)
            })
        } else if (e.isStaffText()
                   || e.isSystemText()
                   || e.isTempoText()
                   || e.isTripletFeel()
                   || e.isJump()
                   || e.isMarker()
                   || e.isRehearsalMark()
                   || e.isMeasureNumber()
                   || e.isInstrumentChange()
                   || e.isPlayTechAnnotation()
                   || e.isCapo()
                   || e.isStringTunings()
                   || e.isSticking()
                   || e.isFingering()
                   || e.isHarmony()
                   || e.isFretDiagram()
                   || e.isHarpPedalDiagram()
                   || e.isOttava()
                   || e.isOttavaSegment()
                   || e.isTextLine()
                   || e.isTextLineSegment()
                   || e.isLetRing()
                   || e.isLetRingSegment()
                   || e.isVibrato()
                   || e.isVibratoSegment()
                   || e.isPalmMute()
                   || e.isPalmMuteSegment()
                   || e.isWhammyBar()
                   || e.isWhammyBarSegment()
                   || e.isRasgueado()
                   || e.isRasgueadoSegment()
                   || e.isHarmonicMark()
                   || e.isHarmonicMarkSegment()
                   || e.isGradualTempoChange()
                   || e.isGradualTempoChangeSegment()
                   || e.isPedal()
                   || e.isPedalSegment()
                   || e.isLyrics()
                   || e.isBreath()
                   || e.isFermata()
                   || e.isHammerOnPullOffText()) {
            e.undoChangeProperty(Pid.AUTOPLACE, true)
            // TODO: undoChangeProperty() should probably do this directly
            // see https://musescore.org/en/node/281432
            const ee = (e.propertyDelegate(Pid.PLACEMENT) as EngravingItem | null) ?? e

            flipOnce(ee, () => {
                // getProperty() delegates call from spannerSegment to Spanner
                let p = ee.getProperty(Pid.PLACEMENT) as PlacementV
                p = (p === PlacementV.ABOVE) ? PlacementV.BELOW : PlacementV.ABOVE
                let pf = ee.propertyFlags(Pid.PLACEMENT)
                if (pf === PropertyFlags.STYLED) {
                    pf = PropertyFlags.UNSTYLED
                }
                const oldDefaultY = (ee.propertyDefault(Pid.OFFSET) as PointF).y()
                ee.undoChangeProperty(Pid.PLACEMENT, p, pf)
                // flip and rebase user offset to new default now that placement has changed
                const newDefaultY = (ee.propertyDefault(Pid.OFFSET) as PointF).y()
                if (ee.isSpanner()) {
                    const spanner = ee as unknown as Spanner
                    for (const ss of spanner.spannerSegments()) {
                        if (!ss.isStyled(Pid.OFFSET)) {
                            const off = (ss.getProperty(Pid.OFFSET) as PointF).clone()
                            const oldY = off.y() - oldDefaultY
                            off.setY(newDefaultY - oldY)
                            ss.undoChangeProperty(Pid.OFFSET, off)
                            ss.setOffsetChanged(false)
                        }
                    }
                } else if (!ee.isStyled(Pid.OFFSET)) {
                    const off = (ee.getProperty(Pid.OFFSET) as PointF).clone()
                    const oldY = off.y() - oldDefaultY
                    off.setY(newDefaultY - oldY)
                    ee.undoChangeProperty(Pid.OFFSET, off)
                    ee.setOffsetChanged(false)
                }
            })
        }
    }
}

Score.prototype.deleteItem = function (this: Score, el: EngravingItem | null): void {
    if (!el) {
        return
    }

    if (el.generated()) {
        switch (el.type()) {
        // These types can be removed, even if generated
        case ElementType.BAR_LINE:
        case ElementType.BRACKET:
        case ElementType.CLEF:
        case ElementType.INSTRUMENT_NAME:
        case ElementType.KEYSIG:
        case ElementType.MEASURE_NUMBER:
        case ElementType.SYSTEM_LOCK_INDICATOR:
        case ElementType.HAMMER_ON_PULL_OFF_TEXT:
        case ElementType.PLAY_COUNT_TEXT:
        case ElementType.LYRICSLINE_SEGMENT:
            break
        // All other types cannot be removed if generated
        default:
            return
        }
    }

    let type = el.type()
    if (type === ElementType.NOTE) {
        const chord = el.explicitParent() as unknown as Chord
        if (chord.notes().length > 1) {
            this.undoRemoveElement(el)
            this.select(chord.downNote(), SelectType.SINGLE, 0)
            return
        }
        // else fall through
        el = chord
        type = ElementType.CHORD
    }

    switch (type) {
    case ElementType.INSTRUMENT_NAME:
        // TODO(port): ChangeInstrumentLong / ChangeInstrumentShort
        break

    case ElementType.TIMESIG:
        // TODO(port): cmdRemoveTimeSig (needs rewriteMeasures)
        break

    case ElementType.KEYSIG: {
        let k: KeySig | null = el as unknown as KeySig
        let m = k.measure()!
        if (m.isMMRest()) {
            m = m.mmRestFirst()!
            const s = m.findSegment(SegmentType.KeySig, k.tick())
            if (s) {
                k = s.element(k.track()) as unknown as KeySig | null
            }
            if (!k || k.generated()) {
                return
            }
        }
        // TODO(port): instrument change key signatures (KeySigEvent::setForInstrumentChange, transposition),
        // updateInstrumentChangeTranspositions
        this.undoRemoveElement(k)
        break
    }

    case ElementType.CHORD: {
        const chord = el as unknown as Chord
        this.removeChordRest(chord, false)

        // replace with rest
        if (chord.noteType() === NoteType.NORMAL) {
            const rest = Factory.createItem(ElementType.REST, scoreDummy(this).segment()) as Rest
            rest.setDurationType(chord.durationType())
            rest.setTicks(chord.ticks())

            rest.setTrack(el.track())
            rest.setParent(chord.explicitParent())

            const segment = chord.segment()
            this.undoAddCR(rest, segment.measure(), segment.tick())

            const tuplet = chord.tuplet()
            if (tuplet) {
                const tl = tuplet.linkList()
                for (const e of rest.linkList()) {
                    const de = e as unknown as DurationElement
                    for (const ee of tl) {
                        const t = ee as unknown as Tuplet
                        if (t.score() === de.score() && t.track() === de.track()) {
                            de.setTuplet(t)
                            t.add(de as unknown as EngravingItem)
                            break
                        }
                    }
                }
            }
            //select(rest, SelectType::SINGLE, 0);
        } else {
            // remove segment if empty
            const seg = chord.segment()
            if (seg.empty()) {
                this.undoRemoveElement(seg)
            }
        }
        break
    }

    case ElementType.MEASURE_REPEAT:
        // TODO(port): measure repeats (undoChangeMeasureRepeatCount, undoSetNoBreak)
        break

    case ElementType.MMREST:
    case ElementType.REST: {
        //
        // only allow for voices != 0
        //    e.g. voice 0 rests cannot be removed
        //
        const rest = el as unknown as Rest
        if (rest.tuplet() && rest.tuplet()!.elements().length === 0) {
            this.undoRemoveElement(rest.tuplet())
        }
        if ((el.voice() !== 0) && !rest.tuplet()) {
            rest.undoChangeProperty(Pid.GAP, true)
            rest.undoChangeProperty(Pid.BEAM_MODE, BeamMode.AUTO)
            for (const r of el.linkList()) {
                const rr = r as unknown as Rest
                if (rr.track() % VOICES) {
                    rr.undoChangeProperty(Pid.GAP, true)
                }
            }

            // delete them really when only gap rests are in the actual measure.
            const m = rest.measure()
            const track = el.track()
            // TODO(port): staff->trackHasLinksInVoiceZero(track) (linked staves)
            if (m.isOnlyDeletedRests(track)) {
                const st = SegmentType.ChordRest
                for (let s = m.first(st); s; s = s.next(st)) {
                    const del = s.element(track)
                    if (s.segmentType() !== st || !del) {
                        continue
                    }
                    if ((del as unknown as Rest).isGap()) {
                        this.undoRemoveElement(del)
                    }
                }
                this.checkSpanner(m.tick(), m.endTick())
            } else {
                // check if the other rest could be combined
                const s = rest.segment()

                const rests: Rest[] = []
                // find previous segment with cr in this track
                let pe: EngravingItem | null = null
                for (let ps = s.prev(SegmentType.ChordRest); ps; ps = ps.prev(SegmentType.ChordRest)) {
                    const elm = ps.element(track)
                    if (elm && elm.isRest() && (elm as unknown as Rest).isGap()) {
                        pe = el
                        rests.push(elm as unknown as Rest)
                    } else if (elm) {
                        break
                    }
                }
                // find next segment with cr in this track
                let ns: Segment | null
                let ne: EngravingItem | null = null
                for (ns = s.next(SegmentType.ChordRest); ns; ns = ns.next(SegmentType.ChordRest)) {
                    const elm = ns.element(track)
                    if (elm && elm.isRest() && (elm as unknown as Rest).isGap()) {
                        ne = elm
                        rests.push(elm as unknown as Rest)
                    } else if (elm) {
                        break
                    }
                }

                const stick = pe ? pe.tick() : s.tick()
                let ticks: Fraction

                if (ne) {
                    ticks = ne.tick().minus(stick).plus((ne as unknown as Rest).actualTicks())
                } else if (ns) {
                    ticks = ns.tick().minus(stick)
                } else {
                    ticks = m.endTick().minus(stick)
                }

                if (!ticks.eq(m.ticks()) && !ticks.eq(s.ticks())) {
                    this.undoRemoveElement(rest)
                    for (const r of rests) {
                        this.undoRemoveElement(r)
                    }

                    const f = ticks.times(el.staff()!.timeStretch(el.tick()))

                    const dList = toDurationList(f, true)
                    if (dList.length === 0) {
                        break
                    }

                    let curTick = stick
                    for (const d of dList) {
                        const rr = Factory.createItem(ElementType.REST, scoreDummy(this).segment()) as Rest
                        rr.setTicks(d.fraction())
                        rr.setDurationType(d)
                        rr.setTrack(track)
                        rr.setGap(true)
                        this.undoAddCR(rr, m, curTick)
                        curTick = curTick.plus(rr.actualTicks())
                    }
                }
            }
            // Set input position
            // TODO If deleted element is last of a sequence, use prev?
            if (this.noteEntryMode()) {
                this.move('prev-chord')
            }
        }
        break
    }

    case ElementType.ACCIDENTAL:
        if (el.explicitParent()!.isNote()) {
            this.changeNoteAccidental(el.explicitParent() as unknown as Note, AccidentalType.NONE)
        } else {
            this.undoRemoveElement(el)
        }
        break

    case ElementType.BAR_LINE: {
        const bl = el as unknown as BarLine
        const s = bl.segment()!
        const m = s.measure()
        if (s.isBeginBarLineType() || s.isBarLineType()) {
            this.undoRemoveElement(el)
        } else {
            if (bl.barLineType() === BarLineType.START_REPEAT) {
                const m2 = m.isMMRest() ? m.mmRestFirst()! : m
                for (const lscore of [this as Score]) { // TODO(port): scoreList()
                    const lmeasure = lscore.tick2measure(m2.tick())
                    if (lmeasure) {
                        lmeasure.undoChangeProperty(Pid.REPEAT_START, false)
                        lmeasure.undoChangeProperty(Pid.REPEAT_COUNT, 2)
                    }
                }
                if (!bl.generated()) {
                    this.undoRemoveElement(el)
                }
            } else if (bl.barLineType() === BarLineType.END_REPEAT) {
                const m2 = m.isMMRest() ? m.mmRestLast()! : m
                for (const lscore of [this as Score]) { // TODO(port): scoreList()
                    const lmeasure = lscore.tick2measure(m2.tick())
                    if (lmeasure) {
                        lmeasure.undoChangeProperty(Pid.REPEAT_END, false)
                        lmeasure.undoChangeProperty(Pid.REPEAT_COUNT, 2)
                    }
                }
                if (!bl.generated()) {
                    this.undoRemoveElement(el)
                }
            } else {
                bl.undoChangeProperty(Pid.BARLINE_TYPE, BarLineType.NORMAL)
            }
        }
        break
    }

    case ElementType.TUPLET:
        this.cmdDeleteTuplet(el as unknown as Tuplet, true)
        break

    case ElementType.MEASURE:
        // TODO(port): undoRemoveMeasures, undoInsertTime with negative length
        break

    case ElementType.BRACKET:
        // TODO(port): undoRemoveBracket
        break

    case ElementType.LAYOUT_BREAK: {
        this.undoRemoveElement(el)
        const lb = el as unknown as LayoutBreak
        const mb = lb.measure()
        let m = mb && mb.isMeasure() ? mb as Measure : null
        if (m && m.isMMRest()) {
            // propagate to original measure
            m = m.mmRestLast()!
            for (const e of m.el()) {
                if (e.isLayoutBreak() && (e as unknown as LayoutBreak).layoutBreakType() === lb.layoutBreakType()) {
                    this.undoRemoveElement(e)
                    break
                }
            }
        }
        break
    }

    case ElementType.CLEF: {
        let clef = el as unknown as Clef
        let m = clef.measure()!
        if (m.isMMRest()) {
            // propagate to original measure
            m = m.mmRestLast()!
            const s = m.findSegment(SegmentType.Clef, clef.segment()!.tick())
            if (s && s.element(clef.track())) {
                const c = s.element(clef.track())!
                this.undoRemoveElement(c)
            }
        } else {
            if (clef.generated()) {
                // find the real clef if this is a cautionary one
                if (m && m.prevMeasure()) {
                    const tick = m.tick()
                    m = m.prevMeasure()!
                    const s = m.findSegment(SegmentType.Clef, tick)
                    if (s && s.element(clef.track())) {
                        clef = s.element(clef.track()) as unknown as Clef
                    }
                }
            }
            this.undoRemoveElement(clef)
        }
        break
    }

    case ElementType.MEASURE_NUMBER: {
        const mea = el.explicitParent() as unknown as Measure
        switch (mea.measureNumberMode()) {
        // If the user tries to remove an automatically generated measure number,
        // we should force the measure not to show any measure number
        case MeasureNumberMode.AUTO:
            mea.undoChangeProperty(Pid.MEASURE_NUMBER_MODE, MeasureNumberMode.HIDE)
            break

        // If the user tries to remove a measure number that he added manually,
        // then we should set the MeasureNumberMode to AUTO only if will not show if set to auto.
        // If after setting the MeasureNumberMode to AUTO, the measure number still shows,
        // We need to force the measure to hide its measure number.
        case MeasureNumberMode.SHOW:
            if (mea.showMeasureNumberInAutoMode()) {
                mea.undoChangeProperty(Pid.MEASURE_NUMBER_MODE, MeasureNumberMode.HIDE)
            } else {
                mea.undoChangeProperty(Pid.MEASURE_NUMBER_MODE, MeasureNumberMode.AUTO)
            }
            break
        case MeasureNumberMode.HIDE:
            break
        }
        break
    }

    case ElementType.REHEARSAL_MARK:
    case ElementType.TEMPO_TEXT: {
        const s = el.explicitParent() as unknown as Segment
        let m = s.measure()
        if (m.isMMRest()) {
            // propagate to original measure/element
            m = m.mmRestFirst()!
            const ns = m.findSegment(SegmentType.ChordRest, s.tick())
            const annotations = ns ? [...ns.annotations()] : [] // make a copy since we alter the list
            for (const e of annotations) {
                if (e.type() === el.type() && e.track() === el.track()) {
                    this.undoRemoveElement(e)
                    break
                }
            }
        } else {
            this.undoRemoveElement(el)
        }
        break
    }

    case ElementType.LYRICSLINE_SEGMENT:
        // TODO(port): lyrics lines (LyricsLine::lyrics, LYRIC_TICKS, SYLLABIC)
        this.undoRemoveElement((el as unknown as SpannerSegment).spanner())
        break

    case ElementType.OTTAVA_SEGMENT:
    case ElementType.HAIRPIN_SEGMENT:
    case ElementType.TRILL_SEGMENT:
    case ElementType.VIBRATO_SEGMENT:
    case ElementType.TEXTLINE_SEGMENT:
    case ElementType.VOLTA_SEGMENT:
    case ElementType.SLUR_SEGMENT:
    case ElementType.TIE_SEGMENT:
    case ElementType.LAISSEZ_VIB_SEGMENT:
    case ElementType.PARTIAL_TIE_SEGMENT:
    case ElementType.PARTIAL_LYRICSLINE_SEGMENT:
    case ElementType.PEDAL_SEGMENT:
    case ElementType.GLISSANDO_SEGMENT:
    case ElementType.NOTELINE_SEGMENT:
    case ElementType.LET_RING_SEGMENT:
    case ElementType.GRADUAL_TEMPO_CHANGE_SEGMENT:
    case ElementType.PALM_MUTE_SEGMENT:
    case ElementType.WHAMMY_BAR_SEGMENT:
    case ElementType.RASGUEADO_SEGMENT:
    case ElementType.HARMONIC_MARK_SEGMENT:
    case ElementType.PICK_SCRAPE_SEGMENT:
    case ElementType.GUITAR_BEND_SEGMENT:
    case ElementType.HAMMER_ON_PULL_OFF_SEGMENT: {
        const sp = (el as unknown as SpannerSegment).spanner()!
        // TODO(port): tie jump points (undoRemoveTiesFromJumpPoints, updateStartTieOnRemoval)
        this.undoRemoveElement(sp)
        // TODO(port): guitar bends (PRE_BEND/PRE_DIVE: delete the start note)
        break
    }

    case ElementType.TAPPING_HALF_SLUR_SEGMENT:
    case ElementType.HAMMER_ON_PULL_OFF_TEXT:
        // TODO(port): tapping, hammer-on/pull-off texts (undoRemoveHopoText)
        break

    case ElementType.STEM_SLASH: // cannot delete this elements
    case ElementType.HOOK:
    case ElementType.GUITAR_BEND_TEXT:
    case ElementType.GUITAR_BEND_HOLD_SEGMENT:
        // C++: LOGD("cannot remove %s", el->typeName())
        break

    case ElementType.TEXT:
        if ((el.explicitParent() && el.explicitParent()!.isTBox()) || el.isTBox()) {
            el.undoChangeProperty(Pid.TEXT, '')
        } else {
            this.undoRemoveElement(el)
        }
        break

    case ElementType.PLAY_COUNT_TEXT:
        // TODO(port): PlayCountText (barline()->undoChangeProperty(Pid::PLAY_COUNT_TEXT_SETTING, HIDE))
        break

    case ElementType.INSTRUMENT_CHANGE:
        // TODO(port): instrument changes (key signatures, clefs, Transpose::transpositionChanged)
        this.undoRemoveElement(el)
        break

    case ElementType.MARKER: {
        const m = el.explicitParent() as unknown as Measure
        if (m.isMMRest()) {
            // find corresponding marker in underlying measure
            let found = false
            // the marker may be in the first measure...
            for (const e of m.mmRestFirst()!.el()) {
                if (e.isMarker() && e.subtype() === el.subtype()) {
                    this.undoRemoveElement(e)
                    found = true
                    break
                }
            }
            if (!found) {
                // ...or it may be in the last measure
                for (const e of m.mmRestLast()!.el()) {
                    if (e.isMarker() && e.subtype() === el.subtype()) {
                        this.undoRemoveElement(e)
                        break
                    }
                }
            }
        }
        // whether m is an mmrest or not, we still need to remove el
        this.undoRemoveElement(el)
        break
    }

    case ElementType.JUMP: {
        const m = el.explicitParent() as unknown as Measure
        if (m.isMMRest()) {
            // find corresponding jump in underlying measure
            for (const e of m.mmRestLast()!.el()) {
                if (e.isJump() && e.subtype() === el.subtype()) {
                    this.undoRemoveElement(e)
                    break
                }
            }
        }
        // whether m is an mmrest or not, we still need to remove el
        this.undoRemoveElement(el)
        break
    }

    case ElementType.SYSTEM_LOCK_INDICATOR:
        // TODO(port): EditSystemLocks::undoRemoveSystemLock
        break

    case ElementType.PARENTHESIS:
        if (el.parent() && el.parent()!.isChord()) {
            // TODO(port): EditChord::removeChordParentheses (parentheses of a note group)
            break
        }
        this.undoRemoveElement(el)
        break

    default:
        this.undoRemoveElement(el)
        break
    }
}

Score.prototype.deleteOrShortenOutSpannersFromRange = function (this: Score, t1: Fraction, t2: Fraction, track1: track_idx_t,
    track2: track_idx_t, filter: SelectionFilter): void {
    const SPANNER_TYPES_TO_SHORTEN_OUT = new Set([
        ElementType.HAIRPIN,
        ElementType.OTTAVA,
        ElementType.TRILL,
        ElementType.VIBRATO,
    ])

    // undoRemoveElement and undoChangeProperty also handle linked elements, so we need
    // to make sure each linked group is handled only once if multiple elements per linked
    // group are found in the range, for example in the case of linked staves.
    const handledMainElements = new Set<EngravingObject>()

    for (const sp of this.spannerMap().findOverlapping(t1.ticks(), t2.ticks() - 1)) {
        const spStartTick = sp.tick()
        const spEndTick = sp.tick2()
        const trackValid = sp.track() >= track1 && sp.track() < track2
        if (!trackValid || sp.isVolta() || sp.systemFlag()) {
            continue
        }

        const links = sp.links()
        if (links) {
            if (handledMainElements.has(links[0])) {
                // already handled this linked group
                continue
            }
            handledMainElements.add(links[0])
        }

        // Special handling for grace notes...
        const startChord = sp.startChord()
        const startChordIsSelectableGrace = !!startChord && startChord.isGrace() && filter.canSelect(startChord)

        const endChord = sp.endChord()
        const endChordIsSelectableGrace = !!endChord && endChord.isGrace() && filter.canSelect(endChord)

        if (startChordIsSelectableGrace || endChordIsSelectableGrace) {
            this.undoRemoveElement(sp)
            continue
        }

        if (!filter.canSelectVoice(sp.track()) || !filter.canSelect(sp)) {
            continue
        }
        if (spStartTick.ge(t1) && spStartTick.lt(t2)
            && spEndTick.gt(t1) && spEndTick.le(t2)) {
            this.undoRemoveElement(sp)
        } else if (sp.isSlur() && ((spStartTick.ge(t1) && spStartTick.lt(t2))
                                   || (spEndTick.ge(t1) && spEndTick.lt(t2)))) {
            this.undoRemoveElement(sp)
        } else if (SPANNER_TYPES_TO_SHORTEN_OUT.has(sp.type())) {
            const moveStart = spStartTick.ge(t1) && spStartTick.lt(t2)
            const moveEnd = spEndTick.gt(t1) && spEndTick.le(t2)
            if (moveStart) {
                const tickDiff = t2.minus(spStartTick)
                sp.undoChangeProperty(Pid.SPANNER_TICK, t2)
                sp.undoChangeProperty(Pid.SPANNER_TICKS, sp.ticks().minus(tickDiff))
            } else if (moveEnd) {
                const tickDiff = spEndTick.minus(t1)
                sp.undoChangeProperty(Pid.SPANNER_TICKS, sp.ticks().minus(tickDiff))
            }
        }
    }
}

Score.prototype.deleteSlursFromRange = function (this: Score, t1: Fraction, t2: Fraction, trackStart: track_idx_t,
    trackEnd: track_idx_t, filter: SelectionFilter): void {
    for (const sp of this.spannerMap().findOverlapping(t1.ticks(), t2.ticks() - 1)) {
        const spStartTick = sp.tick()
        const spEndTick = sp.tick2()
        if (!sp.isSlur()) {
            continue
        }
        if (!filter.canSelectVoice(sp.track()) || !filter.canSelect(sp)) {
            continue
        }

        if (sp.track() >= trackStart && sp.track() < trackEnd) {
            if ((spStartTick.ge(t1) && spStartTick.lt(t2))
                || (spEndTick.ge(t1) && spEndTick.lt(t2))) {
                this.undoRemoveElement(sp)
            }
        }
    }
}

/** Deletes annotations in the given range that match the given selection filter. */
Score.prototype.deleteAnnotationsFromRange = function (this: Score, s1: Segment | null, s2: Segment | null, track1: track_idx_t,
    track2: track_idx_t, filter: SelectionFilter): void {
    if (!s1) {
        return
    }
    if (s2 && s2.tick().lt(s1.tick())) {
        return
    }

    for (let track = track1; track < track2; ++track) {
        if (!filter.canSelectVoice(track)) {
            continue
        }
        for (let s: Segment | null = s1; s && s !== s2; s = s.next1()) {
            const annotations = [...s.annotations()] // make a copy since we alter the list
            for (const annotation of annotations) {
                // skip if not included in selection (eg, filter)
                if (!filter.canSelect(annotation)) {
                    continue
                }
                if (!annotation.systemFlag() && annotation.track() === track) {
                    this.deleteItem(annotation)
                }
            }
        }
    }
}

Score.prototype.deleteRangeAtTrack = function (this: Score, crsToSelect: ChordRest[], track: track_idx_t, startSeg: Segment | null,
    endTick: Fraction, currentTuplet: Tuplet | null, filter: SelectionFilter, selectionContainsMultiNoteChords: boolean): void {
    while (startSeg && !(startSeg.isChordRestType() && startSeg.cr(track))) {
        // Range should always start at a ChordRest segment - find the next one for this track...
        startSeg = startSeg.next1(SegmentType.ChordRest)
    }

    if (!startSeg) {
        return
    }

    let restStartTick = startSeg.tick()
    let restDuration = new Fraction(0, 1)

    // When we find a deselected DurationElement - write rests up to the start of the deselected element (using the existing values for
    // restStartTick and restDuration), skip the deselected element (move restStartTick forward), and reset restDuration...
    const foundDeselected = (deselectedElement: DurationElement): void => {
        const rests = this.setRests(restStartTick, track, restDuration, /*useDots*/ !currentTuplet, currentTuplet)
        crsToSelect.push(...rests)
        restStartTick = deselectedElement.endTick()
        restDuration = new Fraction(0, 1)
    }

    for (let s: Segment | null = startSeg; s && s.tick().lt(endTick); s = s.next1()) {
        const e = s.element(track)
        if (!e) {
            continue
        }

        if (s.isBreathType()) {
            this.deleteItem(e)
            continue
        }

        if (!s.isChordRestType()) {
            // do not delete TimeSig/KeySig, it doesn't make sense to do it (except on full system)
            if (!s.isTimeTickType() && !s.isTimeSigType() && !s.isKeySigType()
                && !s.isSegType(SegmentType.BarLineType) /*covers all barLine types*/) {
                this.undoRemoveElement(e)
            }
            continue
        }

        if (e.isMeasureRepeat()) {
            // MeasureRepeat has its own special handling, so it is skipped here
            foundDeselected(e as unknown as DurationElement)
            this.deleteItem(e)
            continue
        }

        const cr1 = e as unknown as ChordRest

        // currentTuplet refers to the tuplet that we're currently performing a delete range "inside". It is possible that currentTuplet contains nested
        // tuplets, in which case we should find the "top-most nested tuplet" (nextTuplet) and:
        //      1. If it is selectable, delete it completely using cmdDeleteTuplet (deletes all elements contained in that tuplet)
        //      2. If it is not selectable, call this method recursively "inside" that tuplet (nextTuplet becomes currentTuplet for the recursive call)

        let nextTuplet: Tuplet | null = null
        if (cr1.tuplet() && cr1.tuplet() !== currentTuplet) {
            nextTuplet = cr1.tuplet()
            while (nextTuplet!.tuplet() && nextTuplet!.tuplet() !== currentTuplet) {
                nextTuplet = nextTuplet!.tuplet()
            }
        }

        if (nextTuplet) {
            // The range of nextTuplet will be handled by cmdDeleteTuplet or the recursive call - skip it at this level of recursion...
            let lastInTuplet = nextTuplet.elements()[nextTuplet.elements().length - 1]
            while (lastInTuplet.isTuplet()) {
                const els = (lastInTuplet as unknown as Tuplet).elements()
                lastInTuplet = els[els.length - 1]
            }
            if (!lastInTuplet.isChordRest()) {
                break
            }
            s = (lastInTuplet as unknown as ChordRest).segment()

            if (filter.canSelectTuplet(nextTuplet, cr1.tick(), endTick, selectionContainsMultiNoteChords)) {
                restDuration = restDuration.plus(nextTuplet.ticks())
                this.cmdDeleteTuplet(nextTuplet, /*replaceWithRest*/ false)
            } else {
                const recursionEnd = Fraction.min(nextTuplet.endTick(), endTick)
                this.deleteRangeAtTrack(crsToSelect, track, cr1.segment(), recursionEnd, nextTuplet, filter, selectionContainsMultiNoteChords)
                foundDeselected(nextTuplet)
            }

            if (!s) {
                break
            }

            continue
        }

        for (const elem of collectElementsAnchoredToChordRest(cr1)) {
            if (!elem.isChord()) {
                if (filter.canSelect(elem)) {
                    this.undoRemoveElement(elem)
                }
                continue
            }
            // Special handling for grace notes...
            const chord = elem as unknown as Chord
            if (!chord.isGrace()) {
                continue
            }
            const anchoredToGrace = collectElementsAnchoredToChordRest(chord)
            for (const graceNote of chord.notes()) {
                for (const noteAnchored of collectElementsAnchoredToNote(graceNote, true, false)) {
                    anchoredToGrace.add(noteAnchored)
                }
            }
            for (const graceElem of anchoredToGrace) {
                if (filter.canSelect(graceElem)) {
                    // Delete elements anchored to grace note...
                    this.undoRemoveElement(graceElem)
                }
            }
            if (filter.canSelect(elem)) {
                // Delete grace note itself...
                this.undoRemoveElement(elem)
            }
        }

        if (cr1.isRestFamily()) {
            if (cr1.selected()) {
                restDuration = restDuration.plus(cr1.ticks())
                this.removeChordRest(cr1, true)
            } else {
                foundDeselected(cr1)
            }
            continue
        }

        const chord = cr1 as Chord

        const allNotes = [...chord.notes()]
        const notesToRemove = new Set<Note>()
        for (let noteIdx = 0; noteIdx < allNotes.length; ++noteIdx) {
            const note = allNotes[noteIdx]
            if (filter.canSelectNoteIdx(noteIdx, allNotes.length, selectionContainsMultiNoteChords)) {
                notesToRemove.add(note)
                //! NOTE: Don't need to remove anchored elements - they won't survive the deletion of their parent note...
                continue
            }
            for (const elem of collectElementsAnchoredToNote(note, true, false)) {
                if (!filter.canSelect(elem)) {
                    continue
                }
                if (!elem.isSpanner() || elem.isPartialTie() || elem.isLaissezVib()) {
                    this.undoRemoveElement(elem)
                    continue
                }
                if (noteAnchoredSpannerIsInRange(elem as unknown as Spanner, cr1.tick(), endTick)) {
                    this.undoRemoveElement(elem)
                }
            }
            if (!filter.canSelectNoteIdx(noteIdx, allNotes.length, selectionContainsMultiNoteChords)) {
                continue
            }
            notesToRemove.add(note)
        }

        if (notesToRemove.size === allNotes.length) {
            restDuration = restDuration.plus(cr1.ticks())
            this.removeChordRest(cr1, true)
        } else {
            for (const note of notesToRemove) {
                this.undoRemoveElement(note)
            }
            foundDeselected(cr1)
        }
    }

    const rests = this.setRests(restStartTick, track, restDuration, /*useDots*/ !currentTuplet, currentTuplet)
    crsToSelect.push(...rests)
}

/**
 * Deletes elements in the given range that match the given selection filter.
 * Returns chords/rests inside the selected range that can be used to establish a selection after this
 * deletion operation.
 */
Score.prototype.deleteRange = function (this: Score, s1: Segment, s2: Segment | null, track1: track_idx_t, track2: track_idx_t,
    filter: SelectionFilter, selectionContainsMultiNoteChords = false): ChordRest[] {
    const crsForSelection: ChordRest[] = []

    // delete content from measures underlying mmrests
    if (s1.measure() && s1.measure().isMMRest()) {
        s1 = s1.measure().mmRestFirst()!.first()!
    }
    if (s2 && s2.measure() && s2.measure().isMMRest()) {
        s2 = s2.measure().mmRestLast()!.last()
    }

    const startTick = s1.tick()
    const endTick = s2 ? s2.tick() : this.lastMeasure()!.endTick()

    this.deleteOrShortenOutSpannersFromRange(startTick, endTick, track1, track2, filter)
    this.deleteAnnotationsFromRange(s1, s2, track1, track2, filter)

    for (let track = track1; track < track2; ++track) {
        if (!filter.canSelectVoice(track)) {
            continue
        }
        this.deleteRangeAtTrack(crsForSelection, track, s1, endTick, /*currentTuplet*/ null, filter, selectionContainsMultiNoteChords)
    }

    return crsForSelection
}

Score.prototype.cmdDeleteSelection = function (this: Score): void {
    let crsSelectedAfterDeletion: (ChordRest | null)[] = [] // select something after deleting notes
    let elSelectedAfterDeletion: EngravingItem | null = null

    if (this.selection().isRange()) {
        crsSelectedAfterDeletion = this.deleteRange(this.selection().startSegment()!, this.selection().endSegment(),
            staff2track(this.selection().staffStart()), staff2track(this.selection().staffEnd()),
            this.selectionFilter(), this.selection().rangeContainsMultiNoteChords())
    } else {
        // deleteItem modifies selection().elements() list,
        // so we need a local copy:
        const el = [...this.selection().elements()]

        // keep track of linked elements that are deleted implicitly
        // so we don't try to delete them twice if they are also in selection
        const deletedElements = new Set<EngravingObject>()
        // Similarly, deleting one spanner segment, will delete all of them
        // so we don't try to delete them twice if they are also in selection
        const deletedSpanners = new Set<Spanner>()

        const selectCRAtTickAndTrack = (tick: Fraction, track: track_idx_t): void => {
            const cr = this.findCR(tick, track)
            if (cr) {
                crsSelectedAfterDeletion.push(cr)
            }
        }

        for (const e of el) {
            // these are the linked elements we are about to delete
            const links: readonly EngravingObject[] = e.links() ? [...e.links()!] : []

            // find location of element to select after deleting notes
            // get tick of element itself if that is valid
            // or of spanner or parent if that is more valid
            let tick = new Fraction(-1, 1)
            if (e.isNote()) {
                tick = (e as unknown as Note).chord().tick()
            } else if (e.isRest() || e.isMMRest()) {
                tick = e.tick()
            } else if (e.isMeasureRepeat()) { // may be attached in different measure than it appears
                // TODO(port): MeasureRepeat::firstMeasureOfGroup()
                tick = e.tick()
            } else if (e.isSpannerSegment()) {
                tick = (e as unknown as SpannerSegment).spanner()!.tick()
            } else if (e.isBreath()) {
                // we want the tick of the ChordRest that precedes the breath mark (in the same track)
                for (let s = (e.explicitParent() as unknown as Segment).prev(); s; s = s.prev()) {
                    if (s.isChordRestType() && s.element(e.track())) {
                        tick = s.tick()
                        break
                    }
                }
            } else if (e.isBarLine() && (e as unknown as BarLine).barLineType() !== BarLineType.START_REPEAT) {
                // we want the tick of the ChordRest that precedes the barline (in the same track)
                for (let s = (e as unknown as BarLine).segment()!.prev(); s; s = s.prev()) {
                    if (s.isChordRestType() && s.element(e.track())) {
                        tick = s.tick()
                        break
                    }
                }
            } else if (e.isSoundFlag()) {
                tick = e.tick()
            } else if (e.explicitParent()
                       && (e.explicitParent()!.isSegment() || e.explicitParent()!.isChord() || e.explicitParent()!.isNote()
                           || e.explicitParent()!.isRest())) {
                tick = e.parentItem()!.tick()
            }
            //else tick < 0
            const track = e.track()

            // We should not allow deleting the very first keySig of the piece, because it is
            // logically incorrect and leads to a state of undefined key/transposition.
            // Also instrument change key signatures should be undeletable.
            // The correct action is for the user to set an atonal/custom keySig as needed.
            if (e.isKeySig()) {
                if (e.tick().isZero() || (e as unknown as KeySig).forInstrumentChange()) {
                    MScore.setError(MsError.CANNOT_REMOVE_KEY_SIG)
                    selectCRAtTickAndTrack(tick, track)
                    continue
                }
            }

            // Don't allow deleting the trill cue note
            if (e.isNote() && (e as unknown as Note).isTrillCueNote()) {
                selectCRAtTickAndTrack(tick, track)
                continue
            }

            if (e.isFretDiagram() || e.isHarmony()) {
                const fbox = e.findAncestor(ElementType.FBOX)
                if (fbox) {
                    // We can't delete elements inside fret box, instead we hide them
                    const fretDiagram = e.isFretDiagram() ? e : e.parentItem()
                    if (fretDiagram) {
                        fretDiagram.undoChangeProperty(Pid.VISIBLE, false)
                        continue
                    }
                } else if (e.isFretDiagram()) {
                    const fretDiagram = e as unknown as FretDiagram
                    const harmony = fretDiagram.harmony()
                    if (harmony) {
                        this.undoChangeParent(harmony, fretDiagram.segment()!, track2staff(fretDiagram.track()))
                        elSelectedAfterDeletion = harmony
                    }
                } else if (e.isHarmony()) {
                    if (e.parentItem()!.isFretDiagram()) {
                        elSelectedAfterDeletion = e.parentItem()
                    }
                }
            }

            // delete element if we have not done so already
            if (!deletedElements.has(e)) {
                // do not delete two spanner segments from the same spanner
                if (e.isSpannerSegment()) {
                    const spanner = (e as unknown as SpannerSegment).spanner()!
                    if (deletedSpanners.has(spanner)) {
                        continue
                    } else {
                        for (const se of spanner.linkList()) {
                            deletedSpanners.add(se as unknown as Spanner)
                        }
                    }
                }
                this.deleteItem(e)
            }

            if (!elSelectedAfterDeletion) {
                selectCRAtTickAndTrack(tick, track)
            }

            // add these linked elements to list of already-deleted elements
            for (const se of links) {
                deletedElements.add(se)
            }
        }
    }

    this.deselectAll()
    // make new selection if appropriate
    if (this.noteEntryMode()) {
        if (crsSelectedAfterDeletion.length && crsSelectedAfterDeletion[0]) {
            this.inputState().setSegment(crsSelectedAfterDeletion[0].segment())
        } else {
            crsSelectedAfterDeletion.push(this.inputState().cr())
        }
    }
    if (elSelectedAfterDeletion) {
        this.select(elSelectedAfterDeletion)
    } else if (crsSelectedAfterDeletion.length) {
        const elementsToSelect: EngravingItem[] = []
        for (const cr of crsSelectedAfterDeletion) {
            if (cr) {
                if (cr.isChord()) {
                    elementsToSelect.push((cr as Chord).upNote())
                }
                if (cr.isRest()) {
                    elementsToSelect.push(cr)
                }
            }
        }
        this.select(elementsToSelect, SelectType.ADD, 0)
    }
}

Score.prototype.cmdEnterRest = function (this: Score, d: TDuration): void {
    if (this.inputState().track() === nidx) {
        // C++: LOGD("cmdEnterRest: track invalid")
        return
    }
    this.startCmd(new TranslatableString('undoableAction', 'Enter rest'))
    this.enterRest(d)
    this.endCmd()
}

Score.prototype.enterRest = function (this: Score, d: TDuration, externalInputState: InputState | null = null): void {
    const is = externalInputState ?? this.inputState()

    this.expandVoice(is.segment()!, is.track())

    if (!is.cr()) {
        // C++: LOGD("cannot enter rest here")
        return
    }

    const track = is.track()
    const nval = new NoteVal()
    this.setNoteRest(is.segment()!, track, nval, d.fraction(), DirectionV.AUTO, /* forceAccidental */ false,
        is.articulationIds(), /* rhythmic */ false, externalInputState)
    is.moveToNextInputPos()
    if (!is.noteEntryMode() || is.usingNoteEntryMethod(NoteEntryMethod.BY_NOTE_NAME)) {
        is.setRest(false) // continue with normal note entry
    }
}

/** remove chord or rest, remove associated segment if empty, remove beam, remove slurs */
Score.prototype.removeChordRest = function (this: Score, cr: ChordRest, clearSegment: boolean): void {
    const segments = new Set<Segment>()
    for (const e of cr.linkList()) {
        if (cr.isChord()) {
            const startingSpanners = [...(e as unknown as Chord).startingSpanners()]
            for (const spanner of startingSpanners) {
                if (spanner.isTrill() || spanner.isSlur()) {
                    this.doUndoRemoveElement(spanner)
                }
            }
        }
        this.doUndoRemoveElement(e as unknown as EngravingItem)
        if (clearSegment) {
            segments.add(cr.segment())
        }
    }
    for (const s of segments) {
        if (s.empty()) {
            this.doUndoRemoveElement(s)
        }
    }
    if (cr.beam()) {
        const beam = cr.beam()!
        if (beam.generated()) {
            beam.parentItem()?.remove(beam)
        } else {
            this.undoRemoveElement(beam)
        }
    }
}

/** remove tuplet and replace with rest */
Score.prototype.cmdDeleteTuplet = function (this: Score, tuplet: Tuplet, replaceWithRest: boolean): void {
    const elements = [...tuplet.elements()]
    for (const de of elements) {
        if (de.isChordRest()) {
            this.removeChordRest(de as unknown as ChordRest, true)
        } else {
            this.cmdDeleteTuplet(de as unknown as Tuplet, false)
        }
    }
    if (replaceWithRest) {
        this.setRest(tuplet.tick(), tuplet.track(), tuplet.ticks(), true, tuplet.tuplet())
    }
}

Score.prototype.nextInputPos = function (this: Score, cr: ChordRest | null, doSelect: boolean): void {
    if (!cr) {
        return
    }
    let ncr = nextChordRest(cr)
    if (!ncr && (this.inputState().track() % VOICES)) {
        const s = this.tick2segment(cr.endTick(), false, SegmentType.ChordRest)
        ncr = s ? s.element(cr.staffIdx() * VOICES) as unknown as ChordRest | null : null
    }
    if (ncr) {
        this.inputState().setSegment(ncr.segment())
        if (doSelect) {
            this.select(ncr, SelectType.SINGLE, 0)
        }
        // C++: v->moveCursor() for the views
    }
}

Score.prototype.cmdExchangeVoice = function (this: Score, s: voice_idx_t, d: voice_idx_t): void {
    if (!this.selection().isRange()) {
        MScore.setError(MsError.NO_STAFF_SELECTED)
        return
    }
    const t1 = this.selection().tickStart()
    const t2 = this.selection().tickEnd()

    let m1 = this.tick2measure(t1)
    let m2 = this.tick2measure(t2)

    // TODO(port): excerpts (selection().score()->excerpt())

    if (m2 && t2.gt(m2.tick())) {
        m2 = m2.nextMeasure()
    }

    while (m1) {
        this.undoExchangeVoice(m1, s, d, this.selection().staffStart(), this.selection().staffEnd())
        m1 = m1.nextMeasure()
        if (!m1 || (m2 && m1.tick().eq(m2.tick()))) {
            break
        }
    }
}

Score.prototype.undoExchangeVoice = function (this: Score, measure: Measure, srcVoice: voice_idx_t, dstVoice: voice_idx_t,
    srcStaff: staff_idx_t, dstStaff: staff_idx_t): void {
    for (let staffIdx = srcStaff; staffIdx < dstStaff; ++staffIdx) {
        const srcStaffTrack = staffIdx * VOICES
        const srcTrack = srcStaffTrack + srcVoice
        const dstTrack = srcStaffTrack + dstVoice

        //handle score and complete measures first
        this.undo(new ExchangeVoice(measure, srcTrack, dstTrack, staffIdx))

        // TODO(port): linked staves and excerpts (CloneVoice)
    }

    // make sure voice 0 is complete

    if (srcVoice === 0 || dstVoice === 0) {
        for (let staffIdx = srcStaff; staffIdx < dstStaff; ++staffIdx) {
            // check for complete timeline of voice 0
            let ctick = measure.tick()
            const track = staffIdx * VOICES
            for (let s = measure.first(SegmentType.ChordRest); s; s = s.next(SegmentType.ChordRest)) {
                const cr = s.element(track) as unknown as ChordRest | null
                if (!cr) {
                    continue
                }
                if (cr.isRest()) {
                    const r = cr as unknown as Rest
                    if (r.isGap()) {
                        r.undoChangeProperty(Pid.GAP, false)
                    }
                }
                if (ctick.lt(s.tick())) {
                    this.setRest(ctick, track, s.tick().minus(ctick), false, null) // fill gap
                }
                ctick = cr.endTick()
            }
            const etick = measure.endTick()
            if (ctick.lt(etick)) {
                this.setRest(ctick, track, etick.minus(ctick), false, null) // fill gap
            }
        }
    }
}

// ---------------------------------------------------------
//   undo helpers
// ---------------------------------------------------------

/**
 * C++ bool undoPropertyChanged(EngravingItem*, Pid, const PropertyValue&, PropertyFlags): the item's property was
 * already changed to its new value; records the change (propValue: the old value)
 */
Score.prototype.undoPropertyChangedItem = function (this: Score, item: EngravingItem, propId: Pid, propValue: PropertyValue,
    propFlags: PropertyFlags = PropertyFlags.NOSTYLE): boolean {
    let changed = false

    const currentPropValue = item.getProperty(propId)
    const currentPropFlags = item.propertyFlags(propId)

    if (!propertyValueEquals(currentPropValue, propValue) || currentPropFlags !== propFlags) {
        item.setPropertyFlags(propId, propFlags)
        this.undoStack().pushWithoutPerforming(new ChangeProperty(item, propId, propValue, propFlags))
        changed = true
    }

    for (const linkedItem of item.linkListForPropertyPropagation()) {
        if (linkedItem === item) {
            continue
        }
        const propertyPropagate = item.propertyPropagation(linkedItem as EngravingItem, propId)
        switch (propertyPropagate) {
        case PropertyPropagation.PROPAGATE:
            if (!propertyValueEquals(linkedItem.getProperty(propId), currentPropValue)) {
                this.undoStack().pushAndPerform(new ChangeProperty(linkedItem, propId, currentPropValue, propFlags), null)
                changed = true
            }
            break
        case PropertyPropagation.UNLINK:
            // TODO(port): item->unlinkPropertyFromMaster(propId) (excerpts)
            break
        default:
            break
        }
    }

    return changed
}

Score.prototype.undoPropertyChanged = function (this: Score, e: EngravingObject, t: Pid, st: PropertyValue,
    ps: PropertyFlags = PropertyFlags.NOSTYLE): void {
    if (!propertyValueEquals(e.getProperty(t), st)) {
        this.undoStack().pushWithoutPerforming(new ChangeProperty(e, t, st, ps))
    }
}

Score.prototype.undoChangeStyleVal = function (this: Score, idx: Sid, v: PropertyValue): void {
    this.undo(new ChangeStyleValues(this, new Map([[idx, v]])))
}

Score.prototype.undoChangeStyleValues = function (this: Score, values: Map<Sid, PropertyValue>): void {
    this.undo(new ChangeStyleValues(this, values))
}

/** TODO(port): linked elements in parts/excerpts (only the element itself is moved) */
Score.prototype.undoChangeParent = function (this: Score, element: EngravingItem | null, parent: EngravingItem | null,
    staffIdx: staff_idx_t): void {
    if (!element || !parent) {
        return
    }

    if (element.parentItem() === parent && staffIdx === element.staffIdx()) {
        return
    }

    for (const obj of element.linkList()) {
        const item = obj as EngravingItem
        if (item === element) {
            // Master score
            this.undo(new ChangeParent(element, parent, staffIdx))
        }
        // C++: linked items in parts get the corresponding parent, or are removed and recreated
    }
}

Score.prototype.undoChangeElement = function (this: Score, oldElement: EngravingItem | null, newElement: EngravingItem): void {
    if (!oldElement) {
        this.undoAddElement(newElement)
    } else {
        for (const obj of oldElement.linkList()) {
            const item = obj as EngravingItem
            if (item === oldElement) {
                this.undo(new ChangeElement(oldElement, newElement))
            } else {
                if (item.score()) {
                    const newClone = newElement.clone()
                    item.score().undo(new ChangeElement(item, newClone))
                }
            }
        }
    }
}

Score.prototype.undoChangePitch = function (this: Score, note: Note, pitch: number, tpc1: number, tpc2: number): void {
    for (const e of note.linkList()) {
        const n = e as unknown as Note
        this.undoStack().pushAndPerform(new ChangePitch(n, pitch, tpc1, tpc2), null)
    }
}

/**
 * To use with tablatures to force a specific note fretting;
 * Pitch, string and fret must be changed all together; otherwise,
 * if they are not consistent among themselves, the refretting algorithm may re-assign
 * fret and string numbers for (potentially) all the notes of all the chords of a segment.
 */
Score.prototype.undoChangeFretting = function (this: Score, note: Note, pitch: number, string: number, fret: number,
    tpc1: number, tpc2: number): void {
    const l = note.links()
    if (l) {
        for (const e of l) {
            const n = e as unknown as Note
            this.undo(new ChangeFretting(n, pitch, string, fret, tpc1, tpc2))
        }
    } else {
        this.undo(new ChangeFretting(note, pitch, string, fret, tpc1, tpc2))
    }
}

Score.prototype.undoChangeChordRestLen = function (this: Score, cr: ChordRest, d: TDuration): void {
    cr.undoChangeProperty(Pid.DURATION_TYPE_WITH_DOTS, d.typeWithDots())
    cr.undoChangeProperty(Pid.DURATION, d.fraction())
}

Score.prototype.undoChangeSpannerElements = function (this: Score, spanner: Spanner, startElement: EngravingItem | null,
    endElement: EngravingItem | null): void {
    const oldStartElement = spanner.startElement()
    const oldEndElement = spanner.endElement()
    const startDeltaTrack = startElement && oldStartElement ? startElement.track() - oldStartElement.track() : 0
    const endDeltaTrack = endElement && oldEndElement ? endElement.track() - oldEndElement.track() : 0
    // scan all spanners linked to this one
    for (const el of spanner.linkList()) {
        const sp = el as unknown as Spanner
        let newStartElement: EngravingItem | null = null
        let newEndElement: EngravingItem | null = null
        // if not the current spanner, but one linked to it, determine its new start and end elements
        // as modifications 'parallel' to the modifications of the current spanner's start and end elements
        if (sp !== spanner) {
            if (startElement) {
                // determine the track where to expect the 'parallel' start element
                const newTrack = sp.startElement() ? sp.startElement()!.track() + startDeltaTrack : sp.track()
                // look in elements linked to new start element for an element with
                // same score as linked spanner and appropriate track
                for (const ee of startElement.linkList()) {
                    const e = ee as EngravingItem
                    if (e.score() === sp.score() && e.track() === newTrack) {
                        newStartElement = e
                        break
                    }
                }
            }
            // similarly to determine the 'parallel' end element
            if (endElement) {
                const newTrack = sp.endElement() ? sp.endElement()!.track() + endDeltaTrack : sp.track2()
                for (const ee of endElement.linkList()) {
                    const e = ee as EngravingItem
                    if (e.score() === sp.score() && e.track() === newTrack) {
                        newEndElement = e
                        break
                    }
                }
            }
        } else {
            // if current spanner, just use stored start and end elements
            newStartElement = startElement
            newEndElement = endElement
        }
        sp.score().undo(new ChangeSpannerElements(sp, newStartElement, newEndElement))

        // TODO(port): toTie(sp)->updatePossibleJumpPoints() (repeats)
    }
}

Score.prototype.undoChangeUserMirror = function (this: Score, n: Note, d: DirectionH): void {
    n.undoChangeProperty(Pid.MIRROR_HEAD, d)
}

/** TODO-TPC: check */
Score.prototype.undoChangeTpc = function (this: Score, note: Note, v: number): void {
    note.undoChangeProperty(Pid.TPC1, v)
}

// ---------------------------------------------------------
//   visibility
// ---------------------------------------------------------

function chordHasVisibleNote(chord: Chord): boolean {
    for (const note of chord.notes()) {
        if (note.visible()) {
            return true
        }
    }

    return false
}

function undoChangeNoteVisibility(note: Note, visible: boolean): void {
    note.undoChangeProperty(Pid.VISIBLE, visible)

    if (note.bendBack() || note.bendFor()) {
        note.setOverrideBendVisibilityRules(true)
    } else {
        note.setOverrideBendVisibilityRules(false)
    }

    for (const dot of note.dots()) {
        dot.undoChangeProperty(Pid.VISIBLE, visible)
    }

    for (const e of note.el()) {
        e.undoChangeProperty(Pid.VISIBLE, visible)
    }

    if (note.accidental()) {
        note.accidental()!.undoChangeProperty(Pid.VISIBLE, visible)
    }

    const noteChord = note.chord()
    const beam = noteChord.beam()
    const chords: Chord[] = []

    const chordHasVisibleNote_ = visible || chordHasVisibleNote(noteChord)
    let beamHasVisibleNote_ = chordHasVisibleNote_

    if (beam) {
        for (const item of beam.elements()) {
            if (!item.isChord()) {
                continue
            }

            const chord = item as unknown as Chord
            chords.push(chord)

            if (!beamHasVisibleNote_ && chord !== noteChord) {
                beamHasVisibleNote_ = chordHasVisibleNote(chord)
            }
        }
    } else {
        chords.push(noteChord)
    }

    const IGNORED_TYPES = new Set([
        ElementType.NOTE,
        ElementType.LYRICS,
        ElementType.SLUR,
        ElementType.HAMMER_ON_PULL_OFF,
        ElementType.CHORD, // grace notes
        ElementType.LEDGER_LINE, // temporary objects, impossible to change visibility
    ])

    for (const chord of chords) {
        for (const obj of chord.linkList()) {
            const linkedChord = obj as unknown as Chord
            const linkedChordHasVisibleNote = chordHasVisibleNote(linkedChord)
            // C++ getChildren(): the descendants of the chord
            for (const child of linkedChord.childrenItems(true)) {
                const type = child.type()

                if (IGNORED_TYPES.has(type)) {
                    continue
                }

                if (beam) {
                    if (type === ElementType.STEM || type === ElementType.BEAM) {
                        child.undoChangeProperty(Pid.VISIBLE, beamHasVisibleNote_)
                        continue
                    }
                }
                if (child.isOrnament()) {
                    undoChangeOrnamentVisibility(child as unknown as Ornament, visible)
                } else {
                    child.undoChangeProperty(Pid.VISIBLE, linkedChordHasVisibleNote)
                }
            }
        }
    }
}

function undoChangeRestVisibility(rest: Rest, visible: boolean): void {
    rest.undoChangeProperty(Pid.VISIBLE, visible)

    for (const dot of rest.dotList()) {
        dot.undoChangeProperty(Pid.VISIBLE, visible)
    }
}

function undoChangeOrnamentVisibility(ornament: Ornament, visible: boolean): void {
    ornament.undoChangeProperty(Pid.VISIBLE, visible)
    const cueNoteChord = ornament.cueNoteChord()
    if (cueNoteChord) {
        undoChangeNoteVisibility(cueNoteChord.upNote(), visible)
    }
    if (ornament.accidentalAbove()) {
        ornament.accidentalAbove()!.undoChangeProperty(Pid.VISIBLE, visible)
    }
    if (ornament.accidentalBelow()) {
        ornament.accidentalBelow()!.undoChangeProperty(Pid.VISIBLE, visible)
    }
}

Score.prototype.undoChangeVisible = function (this: Score, item: EngravingItem, visible: boolean): void {
    if (item.isNote()) {
        undoChangeNoteVisibility(item as unknown as Note, visible)
    } else if (item.isRest()) {
        undoChangeRestVisibility(item as unknown as Rest, visible)
    } else if (item.isOrnament()) {
        undoChangeOrnamentVisibility(item as unknown as Ornament, visible)
    } else if (item.isTrillSegment()) {
        item.undoChangeProperty(Pid.VISIBLE, visible)
        const orn = (item as unknown as TrillSegment).trill().ornament()
        if (orn) {
            undoChangeOrnamentVisibility(orn, visible)
        }
    } else {
        item.undoChangeProperty(Pid.VISIBLE, visible)
    }
}

// ---------------------------------------------------------
//   score.cpp
// ---------------------------------------------------------

/** C++ Score::canReselectItem (score.cpp) */
Score.prototype.canReselectItem = function (this: Score, item: EngravingItem | null): boolean {
    if (!item || item.selected()) {
        return false
    }

    const seg = item.findAncestor(ElementType.SEGMENT)
    if (seg) {
        return seg.childrenItems(true).includes(item)
    }

    return true
}

/**
 * C++ Score::changeSelectedElementsVoice (score.cpp): moves selected notes into specified voice if possible
 * TODO(port): excerpts (isOperationValid, linked staves with invisible voices), parentheses of note groups, lyrics
 */
Score.prototype.changeSelectedElementsVoice = function (this: Score, voice: voice_idx_t): void {
    const newElements: EngravingItem[] = []
    const oel = [...this.selection().elements()] // make copy
    for (let e of oel) {
        if (e.isNote()) {
            const note = e as unknown as Note
            const chord = note.chord()

            // move grace notes with main chord only
            if (chord.isGrace() || chord.isTrillCueNote()) {
                continue
            }

            if (chord.voice() === voice) {
                continue
            }

            const score: Score = this
            const s = chord.segment()
            const m = s.measure()
            const notes = chord.notes().length
            const dstTrack = chord.staffIdx() * VOICES + voice
            const dstCR = s.element(dstTrack) as unknown as ChordRest | null
            let dstChord: Chord | null = null

            // set up destination chord

            if (dstCR && dstCR.globalTicks().eq(chord.globalTicks())) {
                // existing chord/rest in destination with correct duration
                //   this case allows for tuplets, unlike the more general case below
                if (dstCR.isChord()) {
                    // can simply move note in
                    dstChord = dstCR as Chord
                } else {
                    // replace rest with chord, then move note in
                    dstChord = Factory.createItem(ElementType.CHORD, s) as Chord
                    dstChord.setTrack(dstTrack)
                    dstChord.setDurationType(chord.durationType())
                    dstChord.setTicks(chord.ticks())
                    dstChord.setTuplet(dstCR.tuplet())
                    dstChord.setParent(s)
                    score.undoRemoveElement(dstCR)
                }
            } else if (!chord.tuplet()) {
                // rests or gap in destination
                //   insert new chord if the rests / gap are long enough
                //   then move note in
                let hasIncompatibleTuplet = false
                let cBefore: Chord | null = null
                let cAfterStart: Chord | null = null
                for (let s2 = m.first(SegmentType.ChordRest); s2; s2 = s2.next(SegmentType.ChordRest)) {
                    const cr2 = s2.element(dstTrack) as unknown as ChordRest | null
                    if (!cr2) {
                        continue
                    }
                    const topTuplet = cr2.topTuplet()
                    if (topTuplet) {
                        if (topTuplet.tick().lt(s.tick()) && topTuplet.endTick().gt(s.tick())) {
                            hasIncompatibleTuplet = true
                            break
                        }
                        if (topTuplet.tick().lt(chord.endTick()) && topTuplet.endTick().gt(chord.endTick())) {
                            hasIncompatibleTuplet = true
                            break
                        }
                    }
                    if (!cr2.isChord()) {
                        continue
                    }
                    if (s2.tick().lt(s.tick())) {
                        cBefore = cr2 as Chord
                    }
                    if (s2.tick().ge(s.tick())) {
                        cAfterStart = cr2 as Chord
                    }
                    if (s2.tick().ge(chord.endTick())) {
                        break
                    }
                }
                if (hasIncompatibleTuplet) {
                    continue
                }
                if (cBefore && cBefore.endTick().gt(s.tick())) {
                    // previous chord overlaps
                    continue
                }
                if (cAfterStart && cAfterStart.tick().lt(chord.endTick())) {
                    // next chord overlaps
                    continue
                }
                // big enough gap found
                dstChord = Factory.createItem(ElementType.CHORD, s) as Chord
                dstChord.setTrack(dstTrack)
                dstChord.setDurationType(chord.durationType())
                dstChord.setTicks(chord.ticks())
                dstChord.setParent(s)
                // makeGapVoice will not back-fill an empty voice
                if (voice && !dstCR) {
                    score.expandVoice(s, /*m->first(SegmentType::ChordRest,*/ dstTrack)
                }
                score.makeGapVoice(s, dstTrack, chord.ticks(), s.tick())
            }

            if (!dstChord) {
                continue
            }

            // move note to destination chord

            // create & add new note
            const newNote = note.clone() as Note // C++ Factory::copyNote(*note)
            newNote.setSelected(false)
            newNote.setParent(dstChord)
            score.undoAddElement(newNote)
            newElements.push(newNote)
            // add new chord if one was created
            if (dstChord !== (dstCR as unknown)) {
                score.undoAddCR(dstChord, m, s.tick())
            }
            for (const linked of note.linkList()) {
                const linkedNote = linked as unknown as Note
                const linkedNewNote = linked === note ? newNote : newNote.findLinkedInStaff(linkedNote.staff()!) as unknown as Note
                // reconnect the tie to this note, if any
                let tie = linkedNote.tieBack()
                if (tie) {
                    const startNote = tie.isPartialTie() && !tie.isOutgoing() ? null : tie.startNote()
                    score.undoChangeSpannerElements(tie, startNote, linkedNewNote)
                }
                // reconnect the tie from this note, if any
                tie = linkedNote.tieFor()
                if (tie) {
                    score.undoChangeSpannerElements(tie, linkedNewNote, tie.endNote())
                }

                // Reconnect note anchored spanners
                for (const spanner of [...linkedNote.spannerBack()]) {
                    score.undoChangeSpannerElements(spanner, spanner.startElement(), linkedNewNote)
                }

                for (const spanner of [...linkedNote.spannerFor()]) {
                    score.undoChangeSpannerElements(spanner, linkedNewNote, spanner.endElement())
                }
            }

            // TODO(port): move parentheses of note groups to the new chord (EditChord::removeChordParentheses)

            // remove original note
            if (notes > 1) {
                score.undoRemoveElement(note)
            } else if (notes === 1) {
                // take care of slurs
                const currentTick = chord.tick().ticks()
                for (const spanner of score.spannerMap().findOverlapping(currentTick, currentTick + 1)) {
                    if (!spanner.isSlur()) {
                        continue
                    }
                    const slur = spanner
                    if (slur.startElement() === (chord as unknown) && slur.endElement() === (chord as unknown)) {
                        score.undoChangeSpannerElements(slur, dstChord, dstChord)
                        slur.undoChangeProperty(Pid.VOICE, voice)
                    } else if (slur.startElement() === (chord as unknown)) {
                        score.undoChangeSpannerElements(slur, dstChord, slur.endElement())
                    } else if (slur.endElement() === (chord as unknown)) {
                        score.undoChangeSpannerElements(slur, slur.startElement(), dstChord)
                    }
                }
                // move articulations
                for (const artic of [...chord.articulations()]) {
                    if (dstChord.hasArticulation(artic)) {
                        continue
                    }
                    score.undoChangeParent(artic, dstChord, dstChord.staffIdx())
                }
                // create rest to leave behind
                const r = Factory.createItem(ElementType.REST, s) as Rest
                r.setTrack(chord.track())
                r.setDurationType(chord.durationType())
                r.setTicks(chord.ticks())
                r.setTuplet(chord.tuplet())
                r.setParent(s)
                // if there were grace notes, move them
                while (chord.graceNotes().length) {
                    const gc = chord.graceNotes()[0]
                    const ngc = gc.clone() as Chord // C++ Factory::copyChord(*gc)
                    score.undoRemoveElement(gc)
                    ngc.setParent(dstChord)
                    ngc.setTrack(dstChord.track())
                    score.undoAddElement(ngc)
                }
                // remove chord, replace with rest
                score.undoRemoveElement(chord)
                score.undoAddCR(r, m, s.tick())
            }

            // TODO(port): move lyrics (Factory::copyLyrics)
        } else if (e.hasVoiceAssignmentProperties()) {
            if (e.isSpannerSegment()) {
                e = (e as unknown as SpannerSegment).spanner()!
            }

            e.undoChangeProperty(Pid.VOICE, voice)
            e.undoChangeProperty(Pid.VOICE_ASSIGNMENT, VoiceAssignment.CURRENT_VOICE_ONLY)
            newElements.push(e)
        }
    }

    if (newElements.length) {
        this.selection().clear()
        this.select(newElements, SelectType.ADD, nidx)
    }

    this.setLayoutAll()
}

// =====================================================================================================================
//   edit.cpp functions for drop / palette elements (undoChangeClef, undoChangeBarLineType, ...): this section is
//   filled by the palette drop port; the editing commands go above it
// =====================================================================================================================

// (imports of this section; ES imports are hoisted)
import { BarLineType, ClefType } from '../types/types'
import { PropertyFlags as DropPropertyFlags } from '../dom/property'
import { CHORD_REST_OR_TIME_TICK_TYPE } from '../dom/segment'
import { ClefInfo } from '../dom/clefinfo'
import { MScore as DropMScore, MsError as DropMsError } from '../dom/mscore'
import { ChangeClefType } from './editclef'
import { ChangeProperty as DropChangeProperty } from './editproperty'
import { Link, Unlink } from './addremoveelement'
import type { Clef } from '../dom/clef'
import type { BarLine } from '../dom/barline'
import type { Hairpin } from '../dom/hairpin'

declare module '../dom/score' {
    interface Score {
        undoChangeClef(ostaff: Staff, e: EngravingItem, ct: ClefType, forInstrumentChange?: boolean, clefToRelink?: Clef | null): void
        undoChangeBarLineType(bl: BarLine, barType: BarLineType, allStaves: boolean, replace?: boolean): void
        /** TODO(port): play count texts (PlayCountText is not ported): does nothing */
        undoUpdatePlayCountText(m: Measure | null): void
        /** C++ addHairpin(Hairpin*, ChordRest*, ChordRest*) */
        addHairpin(hairpin: Hairpin, cr1: ChordRest, cr2: ChordRest | null): void
    }
}

Score.prototype.undoChangeClef = function (this: Score, ostaff: Staff, e: EngravingItem, ct: ClefType,
    forInstrumentChange = false, clefToRelink: Clef | null = null): void {
    let moveClef = false
    let st = SegmentType.Clef
    if (e.isMeasure()) {
        if ((e as unknown as Measure).prevMeasure()) {
            moveClef = true
        } else {
            st = SegmentType.HeaderClef
        }
    } else if (e.isClef()) {
        const clef = e as unknown as Clef
        if (clef.segment().isHeaderClefType()) {
            if (clef.measure().prevMeasure()) {
                moveClef = true
            } else {
                st = SegmentType.HeaderClef
            }
        } else if (clef.rtick().eq(clef.measure().ticks())) {
            moveClef = true
        }
    } else if (e.rtick().isZero()) {
        const curMeasure = e.findMeasure()
        const prevMeasure = curMeasure ? curMeasure.prevMeasure() : null
        if (prevMeasure && !prevMeasure.sectionBreak()) {
            moveClef = true
        }
    }

    const concertPitch = this.style().styleB(Sid.concertPitch)
    let gclef: Clef | null = null
    const tick = e.tick()
    const rtick = e.rtick()
    const isSmall = (st === SegmentType.Clef)
    for (const staff of ostaff.staffList()) {
        if (clefToRelink && ostaff === staff) {
            continue
        }

        const score = staff.score()
        let measure = score.tick2measure(tick)

        if (!measure) {
            continue
        }

        let rt: Fraction
        if (moveClef) { // if at start of measure and there is a previous measure
            measure = measure.prevMeasure()!
            rt = measure.ticks()
        } else {
            rt = rtick
        }
        const destSeg = measure.undoGetSegmentR(st, rt)

        const staffIdx = staff.idx()
        const track = staffIdx * VOICES
        let clef = destSeg.element(track) as Clef | null

        const staffType = staff.staffType(e.tick())
        const staffGroup = staffType.group()
        if (ClefInfo.staffGroup(ct) !== staffGroup && !forInstrumentChange) {
            continue
        }

        if (clef) {
            //
            // for transposing instruments, differentiate
            // clef type for concertPitch
            //
            const i = staff.part().instrument(tick)
            let cp: ClefType
            let tp: ClefType
            if (i.transpose().isZero()) {
                cp = ct
                tp = ct
            } else if (concertPitch) {
                cp = ct
                tp = clef.transposingClef()
            } else {
                cp = clef.concertClef()
                tp = ct
            }
            clef.setGenerated(false)
            score.undo(new ChangeClefType(clef, cp, tp))
            const oClef = clef.otherClef()
            if (oClef && !oClef.generated()) {
                score.undo(new ChangeClefType(oClef, cp, tp))
            }
            // change the clef in the mmRest if any
            if (measure.hasMMRest()) {
                const mmMeasure = measure.mmRest()!
                const mmDestSeg = mmMeasure.findSegment(SegmentType.Clef, tick)
                if (mmDestSeg) {
                    const mmClef = mmDestSeg.element(clef.track()) as Clef | null
                    if (mmClef) {
                        score.undo(new ChangeClefType(mmClef, cp, tp))
                    }
                }
            }
        } else {
            if (gclef) {
                clef = gclef.linkedClone() as Clef
                clef.setScore(score)
            } else {
                clef = Factory.createItem(ElementType.CLEF, destSeg) as Clef // C++: parent score->dummy()->segment()
                clef.setClefType(ct)
                gclef = clef
            }
            clef.setTrack(track)
            clef.setParent(destSeg)
            clef.setIsHeader(st === SegmentType.HeaderClef)
            score.doUndoAddElement(clef)
        }
        if (forInstrumentChange) {
            clef.setForInstrumentChange(true)
        }
        clef.setSmall(isSmall)

        if (clefToRelink) {
            if (!clef.links()) {
                clef.linkTo(clefToRelink)
            } else if (!clef.isLinked(clefToRelink)) {
                clefToRelink.linkTo(clef)
            }
        }
    }
}

Score.prototype.undoUpdatePlayCountText = function (this: Score, _m: Measure | null): void {
    // TODO(port): PlayCountText (Sid::repeatPlayCountShow)
}

Score.prototype.undoChangeBarLineType = function (this: Score, bl: BarLine, barType: BarLineType, allStaves: boolean,
    replace = true): void {
    if (barType === bl.barLineType()) {
        return
    }

    let m = bl.measure()
    if (!m) {
        return
    }

    let keepStartRepeat = false

    if (barType === BarLineType.START_REPEAT && bl.segment().segmentType() !== SegmentType.BeginBarLine) {
        m = m.nextMeasure()
        if (!m) { // we were in last measure
            return
        }
    } else if (bl.barLineType() === BarLineType.START_REPEAT) {
        if (m.system() && m.isFirstInSystem()) {
            if (barType !== BarLineType.END_REPEAT) {
                for (const lscore of [this as Score]) { // TODO(port): scoreList()
                    const lmeasure = lscore.tick2measure(m.tick())
                    if (lmeasure) {
                        lmeasure.undoChangeProperty(Pid.REPEAT_START, false)
                    }
                }
            }
            return
        }

        m = m.prevMeasureMM()
        if (!m) {
            return
        }

        const ebl = m.endBarLine()
        if (!ebl) {
            return
        }
        bl = ebl

        if (barType === BarLineType.END_REPEAT) {
            keepStartRepeat = true
        }
    }

    // when setting barline type on mmrest, set for underlying measure (and linked staves)
    // createMMRest will then set for the mmrest directly
    let m2: Measure | null = m.isMMRest() ? m.mmRestLast() : m

    switch (barType) {
    case BarLineType.END:
    case BarLineType.NORMAL:
    case BarLineType.DOUBLE:
    case BarLineType.BROKEN:
    case BarLineType.DOTTED:
    case BarLineType.REVERSE_END:
    case BarLineType.HEAVY:
    case BarLineType.DOUBLE_HEAVY: {
        const nextMM = m.nextMeasureMM()
        if (nextMM && nextMM.system() && nextMM.isFirstInSystem()) {
            keepStartRepeat = true
        }

        let segment = bl.segment()
        const segmentType = segment.segmentType()

        if (segmentType === SegmentType.EndBarLine) {
            let generated = false
            if (bl.barLineType() === barType) {
                generated = bl.generated() // no change: keep current status
            } else if (!bl.generated() && (barType === BarLineType.NORMAL)) {
                generated = true // currently non-generated, changing to normal: assume generated
            }
            if (allStaves) {
                // use all staves of master score; we will take care of parts in loop through linked staves below
                const mScore = bl.masterScore()
                if (mScore.style().styleB(Sid.createMultiMeasureRests)) {
                    m2 = mScore.tick2measureMM(m2!.tick())
                    if (!m2) {
                        return
                    }
                    segment = m2.undoGetSegment(segment.segmentType(), segment.tick())
                    m2 = m2.isMMRest() ? m2.mmRestLast() : m2
                    if (!m2) {
                        return
                    }
                } else {
                    m2 = mScore.tick2measure(m2!.tick())
                    if (!m2) {
                        return
                    }
                    segment = m2.undoGetSegment(segment.segmentType(), segment.tick())
                }
            }
            const elist: readonly (EngravingItem | null)[] = allStaves ? [...segment.elist()] : [bl]
            for (const e of elist) {
                if (!e || !e.staff() || !e.isBarLine()) {
                    continue
                }

                // handle linked staves/parts:
                // barlines themselves are not necessarily linked,
                // so use staffList to find linked staves
                const sbl = e as unknown as BarLine
                for (const lstaff of sbl.staff()!.staffList()) {
                    const lscore = lstaff.score()
                    const ltrack = lstaff.idx() * VOICES

                    // handle mmrests:
                    // set the barline on the underlying measure
                    // this will copied to the mmrest during layout, in createMMRest
                    const lmeasure = lscore.tick2measure(m2!.tick())
                    if (!lmeasure) {
                        continue
                    }

                    lmeasure.undoChangeProperty(Pid.REPEAT_END, false)

                    const nextMeasure = lmeasure.nextMeasure()
                    if (nextMeasure && !keepStartRepeat) {
                        nextMeasure.undoChangeProperty(Pid.REPEAT_START, false)
                    }
                    const lsegment = lmeasure.undoGetSegmentR(SegmentType.EndBarLine, lmeasure.ticks())
                    let lbl = lsegment.element(ltrack) as BarLine | null
                    if (!lbl) {
                        lbl = Factory.createItem(ElementType.BAR_LINE, lsegment) as BarLine
                        lbl.setParent(lsegment)
                        lbl.setTrack(ltrack)
                        lbl.setSpanStaff(lstaff.barLineSpan())
                        lbl.setSpanFrom(lstaff.barLineFrom())
                        lbl.setSpanTo(lstaff.barLineTo())
                        lbl.setBarLineType(barType)
                        lbl.setGenerated(generated)
                        lscore.addElement(lbl)
                        if (!generated) {
                            lbl.linkTo(sbl)
                        }
                    } else {
                        lscore.undo(new DropChangeProperty(lbl, Pid.GENERATED, generated, DropPropertyFlags.NOSTYLE))
                        lscore.undo(new DropChangeProperty(lbl, Pid.BARLINE_TYPE, barType, DropPropertyFlags.NOSTYLE))
                        // set generated flag before and after so it sticks on type change and also works on undo/redo
                        lscore.undo(new DropChangeProperty(lbl, Pid.GENERATED, generated, DropPropertyFlags.NOSTYLE))
                        if (lbl !== sbl && !generated && !lbl.links()) {
                            lscore.undo(new Link(lbl, sbl))
                        } else if (lbl !== sbl && generated && lbl.isLinked(sbl)) {
                            lscore.undo(new Unlink(lbl))
                            // TODO(port): remove an additional link on the covering mmRest (findLinkedInScore)
                        }
                    }
                }
            }
        } else if (segmentType === SegmentType.BeginBarLine) {
            for (const lscore of [m2!.score()]) { // TODO(port): scoreList()
                const lmeasure = lscore.tick2measure(m2!.tick())!
                const segment1 = lmeasure.undoGetSegmentR(SegmentType.BeginBarLine, new Fraction(0, 1))
                for (const e of segment1.elist()) {
                    if (e) {
                        lscore.undo(new DropChangeProperty(e, Pid.GENERATED, false, DropPropertyFlags.NOSTYLE))
                        lscore.undo(new DropChangeProperty(e, Pid.BARLINE_TYPE, barType, DropPropertyFlags.NOSTYLE))
                        // set generated flag before and after so it sticks on type change and also works on undo/redo
                        lscore.undo(new DropChangeProperty(e, Pid.GENERATED, false, DropPropertyFlags.NOSTYLE))
                    }
                }
            }
        }
        break
    }
    case BarLineType.START_REPEAT: {
        for (let staffIdx = 0; staffIdx < m2!.score().nstaves(); ++staffIdx) {
            if (m2!.isMeasureRepeatGroupWithPrevM(staffIdx)) {
                DropMScore.setError(DropMsError.CANNOT_SPLIT_MEASURE_REPEAT)
                return
            }
        }
        for (const lscore of [m2!.score()]) { // TODO(port): scoreList()
            let lmeasure = lscore.tick2measure(m2!.tick())
            if (lmeasure) {
                lmeasure.undoChangeProperty(Pid.REPEAT_START, true)
                lmeasure = lmeasure.prevMeasure()
                if (lmeasure && replace) {
                    lmeasure.undoChangeProperty(Pid.REPEAT_END, false)
                }
            }
        }
        break
    }
    case BarLineType.END_REPEAT: {
        for (let staffIdx = 0; staffIdx < m2!.score().nstaves(); ++staffIdx) {
            if (m2!.isMeasureRepeatGroupWithNextM(staffIdx)) {
                DropMScore.setError(DropMsError.CANNOT_SPLIT_MEASURE_REPEAT)
                return
            }
        }
        for (const lscore of [m2!.score()]) { // TODO(port): scoreList()
            let lmeasure = lscore.tick2measure(m2!.tick())
            if (lmeasure) {
                lmeasure.undoChangeProperty(Pid.REPEAT_END, true)
                lmeasure = lmeasure.nextMeasure()
                if (lmeasure && replace) {
                    lmeasure.undoChangeProperty(Pid.REPEAT_START, false)
                }
            }
        }
        break
    }
    case BarLineType.END_START_REPEAT: {
        for (let staffIdx = 0; staffIdx < m2!.score().nstaves(); ++staffIdx) {
            if (m2!.isMeasureRepeatGroupWithNextM(staffIdx)) {
                DropMScore.setError(DropMsError.CANNOT_SPLIT_MEASURE_REPEAT)
                return
            }
        }
        for (const lscore of [m2!.score()]) { // TODO(port): scoreList()
            let lmeasure = lscore.tick2measure(m2!.tick())
            if (lmeasure) {
                lmeasure.undoChangeProperty(Pid.REPEAT_END, true)
                lmeasure = lmeasure.nextMeasure()
                if (lmeasure) {
                    lmeasure.undoChangeProperty(Pid.REPEAT_START, true)
                }
            }
        }
        break
    }
    default:
        break
    }

    this.undoUpdatePlayCountText(m)
}

Score.prototype.addHairpin = function (this: Score, hairpin: Hairpin, cr1: ChordRest, cr2: ChordRest | null): void {
    const track = cr1.track()
    const startTick = cr1.tick()

    let endTick = startTick
    if (this.selection().isRange()) {
        endTick = this.selection().tickEnd()
    } else {
        if (cr2 && cr2 !== cr1) {
            endTick = cr2.endTick()
        } else {
            endTick = cr1.isChord() ? (cr1 as unknown as Chord).endTickIncludingTied() : cr1.endTick()
        }
        const startSegment = cr2 ? cr2.segment() : cr1.segment()
        for (let segment: Segment | null = startSegment; segment && segment.tick().lt(endTick);
            segment = segment.next1(CHORD_REST_OR_TIME_TICK_TYPE)) {
            if (segment === startSegment) {
                continue
            }
            if (segment.findAnnotation(ElementType.DYNAMIC, track, track)) {
                endTick = segment.tick()
                break
            }
        }
    }

    hairpin.setTrack(track)
    hairpin.setTrack2(track)
    hairpin.setTick(startTick)
    hairpin.setTick2(endTick)

    this.undoAddElement(hairpin)
}
