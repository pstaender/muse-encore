/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/notationinteraction.h/.cpp: hit testing, select, keyboard navigation of the
 * selection, the editing commands (startEdit/apply around the Score commands), undo/redo, and of
 * notationselectionrange.cpp.
 *
 * TODO(port): drag, grips, text editing, showItem (the UI scrolls to selectionBounds()),
 * the hit element context, playback, moveElementSelection (next/prev-element: Score::nextElement/prevElement),
 * moveStringSelection.
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { DirectionV, DurationType, ElementType, VOICES, nidx, type staff_idx_t, type track_idx_t, type voice_idx_t } from '../../engraving/types/types'
import type { Rest } from '../../engraving/dom/rest'
import { Pad } from '../../engraving/dom/score'
import { NoteEntryMethod } from '../../engraving/dom/input'
import { AccidentalType } from '../../engraving/dom/accidentaldata'
import { Pid, PropertyFlags, propertyUserName } from '../../engraving/dom/property'
import type { UpDownMode } from '../../engraving/dom/mscore'
import type { TDuration } from '../../engraving/dom/durationtype'
import type { PropertyValue } from '../../engraving/types/propertyvalue'
import '../../engraving/editing/edit'
import '../../engraving/dom/noteentry'
import { SelState, SelectType } from '../../engraving/dom/select'
import { SegmentType } from '../../engraving/dom/segment'
import { nextChordRest, prevChordRest, type Chord } from '../../engraving/dom/chord'
import '../../engraving/dom/navigate'
import '../../engraving/editing/cmd'
import { ScoreRangeUtilities } from '../utilities/scorerangeutilities'
import { BracketsType } from '../notationtypes'
import { NotationUndoStack, Notification } from './notationundostack'
import { NotationNoteInput } from './notationnoteinput'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { EngravingConfiguration } from '../../engraving/internal/engravingconfiguration'
import { Brush, BrushStyle, Pen, PenStyle } from '../../framework/draw/types/drawtypes'
import { PainterPath } from '../../framework/draw/types/painterpath'
import type { Painter } from '../../framework/draw/painter'
import type { Score } from '../../engraving/dom/score'
import type { EngravingItem } from '../../engraving/dom/engravingitem'
import type { Page } from '../../engraving/dom/page'
import type { Measure } from '../../engraving/dom/measure'
import type { Staff } from '../../engraving/dom/staff'
import type { Segment } from '../../engraving/dom/segment'
import type { ChordRest } from '../../engraving/dom/chordrest'
import type { Note } from '../../engraving/dom/note'
import type { NoteDot } from '../../engraving/dom/notedot'
import type { KeySig } from '../../engraving/dom/keysig'
import type { TimeSig } from '../../engraving/dom/timesig'
// (imports of the palette section)
import { staff2track } from '../../engraving/types/types'
import { Factory } from '../../engraving/dom/factory'
import { filterTargetElements } from '../../engraving/dom/utils'
import { scoreDummy } from '../../engraving/compat/dummyelement'
import { EditData, KeyboardModifier } from '../../engraving/editing/editdata'
import type { Selection } from '../../engraving/dom/select'
import type { LayoutBreak } from '../../engraving/dom/layoutbreak'
import type { Spanner } from '../../engraving/dom/spanner'
import type { Hairpin } from '../../engraving/dom/hairpin'
import type { Clef } from '../../engraving/dom/clef'
// (imports of the note input section)
import { Fraction } from '../../engraving/types/fraction'
import { Constants } from '../../engraving/types/constants'
import { NoteHeadGroup, type BeamMode } from '../../engraving/types/types'
import { Sid } from '../../engraving/style/styledef'
import { Note as NoteInputNote } from '../../engraving/dom/note'
import { Tuplet } from '../../engraving/dom/tuplet'
import { TDuration as TDurationValue } from '../../engraving/dom/durationtype'
import { MScore as NoteInputMScore, MsError as NoteInputMsError } from '../../engraving/dom/mscore'
import { ScoreRenderer } from '../../engraving/rendering/score/scorerenderer'
import { NoteType as GraceNoteType } from '../../engraving/dom/chordrest'
import { isNotesIntervalValid, type TupletOptions } from '../notationtypes'
import type { ShadowNote } from '../../engraving/dom/shadownote'
import type { Slur } from '../../engraving/dom/slur'
import type { OttavaType } from '../../engraving/dom/ottava'
import type { HairpinType } from '../../engraving/dom/hairpin'
import type { Position } from '../../engraving/dom/score'
import type { SymId } from '../../engraving/types/symid'
import { ArticulationsUpdateMode, flipArticulations, splitArticulations } from '../../engraving/dom/articulation'
import { PlacementV } from '../../engraving/types/types'

/** C++ NotationInteraction::ShadowNoteParams */
interface ShadowNoteParams {
    duration: TDuration
    accidentalType: AccidentalType
    articulationIds: ReadonlySet<SymId>
    position: Position
}

export enum MoveDirection {
    Undefined, Left, Right, Up, Down,
}

export enum MoveSelectionType {
    Undefined, EngravingItem, Chord, Measure, Track, Frame, System, String,
}

export enum ExpandSelectionMode {
    BeginSystem, EndSystem, BeginScore, EndScore,
}

export interface HitMeasureData {
    measure: Measure | null
    staff: Staff | null
}

/** C++ activeCr() */
function activeCr(score: Score): ChordRest | null {
    let cr = score.selection().activeCR()
    if (!cr) {
        cr = score.selection().lastChordRest()
        if (!cr && score.noteEntryMode()) {
            cr = score.inputState().cr()
        }
    }
    return cr
}

export class NotationInteraction {
    private m_score: Score
    private m_notationChanged = new Notification()
    private m_selectionChanged = new Notification()
    private m_noteInputStateChanged = new Notification()
    private m_undoStack: NotationUndoStack
    private m_noteInput: NotationNoteInput

    constructor(score: Score) {
        this.m_score = score
        this.m_undoStack = new NotationUndoStack(() => this.m_score, this.m_notationChanged)
        this.m_noteInput = new NotationNoteInput(() => this.m_score, this, this.m_undoStack)

        this.m_noteInput.stateChanged().onNotify(() => {
            if (!this.m_noteInput.isNoteInputMode()) {
                this.hideShadowNote()
            }
        })

        this.m_undoStack.stackChanged().onNotify(() => {
            this.notifyAboutSelectionChangedIfNeed()
            this.notifyAboutNoteInputStateChanged()
        })
    }

    score(): Score { return this.m_score }
    noteInput(): NotationNoteInput { return this.m_noteInput }
    undoStack(): NotationUndoStack { return this.m_undoStack }

    /** C++ INotation::notationChanged(): the score changed (relayout done), the view must be repainted */
    notationChanged(): Notification { return this.m_notationChanged }
    selectionChanged(): Notification { return this.m_selectionChanged }
    noteInputStateChanged(): Notification { return this.m_noteInputStateChanged }

    /** returns true (C++ sends selectionChanged) if the score's selection changed since the last notification */
    notifyAboutSelectionChangedIfNeed(): boolean {
        if (!this.score().selectionChanged()) {
            return false
        }

        this.score().setSelectionChanged(false)
        this.m_selectionChanged.notify()
        return true
    }

    notifyAboutNotationChanged(): void {
        this.m_notationChanged.notify()
    }

    notifyAboutNoteInputStateChanged(): void {
        this.m_noteInputStateChanged.notify()
    }

    // ---------------------------------------------------------------------------------
    // editing frame (every command: startEdit(), the Score command, apply())
    // ---------------------------------------------------------------------------------

    startEdit(actionName: TranslatableString = new TranslatableString()): void {
        this.m_undoStack.prepareChanges(actionName)
    }

    apply(): void {
        this.m_undoStack.commitChanges()
        this.notifyAboutNotationChanged()
    }

    rollback(): void {
        this.m_undoStack.rollbackChanges()
    }

    undo(): void {
        this.m_undoStack.undo()
    }

    redo(): void {
        this.m_undoStack.redo()
    }

    /** C++ showItem(): the view scrolls to the item; here the UI scrolls to selectionBounds() after a command */
    showItem(_el: EngravingItem | null): void {}

    /** C++ checkAndShowError(): shows MScore's last error (MScoreErrorsController); TODO(port): error messages */
    checkAndShowError(): void {}

    // =================================================================================================================
    //   note input: the shadow note, slurs, tuplets, lines, grace notes, beams, intervals (section of the note input
    //   port; notationinteraction.cpp)
    // =================================================================================================================

    private m_shadowNoteChanged = new Notification()

    shadowNote(): ShadowNote {
        return this.score().shadowNote()
    }

    /** returns true if the shadow note is shown (C++ sends shadowNoteChanged(visible)) */
    showShadowNoteForPosition(pos: PointF): boolean {
        const inputState = this.score().inputState()
        const shadowNote = this.score().shadowNote()

        const position = this.score().getPosition(pos, inputState.voice())
        if (!position) {
            shadowNote.setVisible(false)
            this.m_shadowNoteChanged.notify()
            return false
        }

        const params: ShadowNoteParams = {
            duration: inputState.duration(),
            accidentalType: inputState.accidentalType(),
            articulationIds: inputState.articulationIds(),
            position,
        }

        const show = this.doShowShadowNote(shadowNote, params)
        this.m_shadowNoteChanged.notify()
        return show
    }

    private doShowShadowNote(shadowNote: ShadowNote, params: ShadowNoteParams): boolean {
        const position = params.position

        const inputState = this.score().inputState()
        const staff = this.score().staff(position.staffIdx)!

        let segment = position.segment!
        let segmentSkylineTopY = 0
        let segmentSkylineBottomY = 0

        const shadowNoteActualSegment = position.segment!.prev1enabled()
        if (shadowNoteActualSegment) {
            segment = shadowNoteActualSegment
            segmentSkylineTopY = shadowNoteActualSegment.elementsTopOffsetFromSkyline(position.staffIdx)
            segmentSkylineBottomY = shadowNoteActualSegment.elementsBottomOffsetFromSkyline(position.staffIdx)
        }

        const tick = segment.tick()
        const mag = staff.staffMag(tick)

        const instr = staff.part().instrument(tick)

        // in any empty measure, pos will be right next to barline
        // so pad this by barNoteDistance
        const relX = position.pos.x() - position.segment!.measure().canvasPos().x()
        position.pos.setX(position.pos.x() - Math.min(relX - this.score().style().styleMM(Sid.barNoteDistance) * mag, 0.0))

        let noteheadGroup = NoteHeadGroup.HEAD_NORMAL
        const noteHead = params.duration.headType()

        const line = position.line
        let voice = 0
        let drumNotePitch = -1

        if (instr.useDrumset()) {
            const ds = instr.drumset()!

            const noteInputPitch = inputState.drumNote()

            if (ds.isValid(noteInputPitch) && ds.line(noteInputPitch) === line) {
                noteheadGroup = ds.noteHead(noteInputPitch)
                voice = ds.voice(noteInputPitch)
                drumNotePitch = noteInputPitch
            } else {
                const pitch = ds.defaultPitchForLine(line)
                if (ds.isValid(pitch)) {
                    noteheadGroup = ds.noteHead(pitch)
                    voice = ds.voice(pitch)
                    drumNotePitch = pitch
                }
                if (drumNotePitch < 0) {
                    shadowNote.setVisible(false)
                    return false
                }
            }
        } else {
            voice = inputState.voice()
        }

        shadowNote.setVisible(true)
        shadowNote.mutldata().setMag(mag)
        shadowNote.setTick(tick)
        shadowNote.setStaffIdx(position.staffIdx)
        shadowNote.setVoice(voice)
        shadowNote.setLineIndex(line)

        // C++: configuration()->noteInputPreviewColor() (default: the selection color, so the highlight color is used)
        shadowNote.setColor(EngravingConfiguration.highlightSelectionColor(voice))

        let symNotehead: SymId

        if (inputState.rest()) {
            const rest = Factory.createItem(ElementType.REST, scoreDummy(this.score()).segment()) as unknown as Rest
            rest.setDurationType(params.duration)
            rest.setTicks(params.duration.fraction())
            symNotehead = rest.getSymbol(params.duration.type(), 0, staff.lines(position.segment!.tick()))
            shadowNote.setState(symNotehead, params.duration, true, segmentSkylineTopY, segmentSkylineBottomY)
        } else {
            if (noteheadGroup === NoteHeadGroup.HEAD_CUSTOM) {
                symNotehead = instr.drumset()!.noteHeads(drumNotePitch, noteHead)
            } else {
                symNotehead = NoteInputNote.noteHeadSym(0, noteheadGroup, noteHead)
            }

            shadowNote.setState(symNotehead, params.duration, false, segmentSkylineTopY, segmentSkylineBottomY,
                params.accidentalType, params.articulationIds)
        }

        ScoreRenderer.layoutItem(shadowNote)

        shadowNote.setPos(position.pos)

        return true
    }

    hideShadowNote(): void {
        this.score().shadowNote().setVisible(false)
        this.m_shadowNoteChanged.notify()
    }

    /** in canvas coordinates; empty if there is no visible shadow note */
    shadowNoteRect(): RectF {
        const note = this.score().shadowNote()
        if (!note.visible() || !note.isValid()) {
            return new RectF()
        }

        const rect = note.canvasBoundingRect()

        let penWidth = note.style().styleMM(Sid.stemWidth)
        if (note.ledgerLinesVisible()) {
            const w = note.style().styleMM(Sid.ledgerLineWidth)
            penWidth = Math.max(penWidth, w)
        }

        penWidth *= note.mag()
        return rect.adjusted(-penWidth, -penWidth, penWidth, penWidth)
    }

    shadowNoteChanged(): Notification { return this.m_shadowNoteChanged }

    addSlurToSelection(): void {
        if (this.score().selection().isNone()) {
            return
        }

        // Calls `startEdit` internally
        this.doAddSlur()
    }

    /** NOTE Copied from ScoreView::cmdAddSlur */
    doAddSlur(slurTemplate: Slur | null = null): void {
        this.startEdit(new TranslatableString('undoableAction', 'Add slur'))

        let firstChordRest: ChordRest | null = null
        let secondChordRest: ChordRest | null = null
        const sel = this.score().selection()
        const el = sel.uniqueElements()

        if (sel.isRange()) {
            const startTrack = staff2track(sel.staffStart())
            const endTrack = staff2track(sel.staffEnd())
            for (let track = startTrack; track < endTrack; ++track) {
                firstChordRest = null
                secondChordRest = null
                for (let e of el) {
                    if (e.track() !== track) {
                        continue
                    }
                    if (e.isNote()) {
                        e = (e as unknown as Note).chord()
                    }
                    if (!e.isChord()) {
                        continue
                    }
                    const cr = e as unknown as ChordRest
                    if (!firstChordRest || firstChordRest.tick().gt(cr.tick())) {
                        firstChordRest = cr
                    }
                    if (!secondChordRest || secondChordRest.tick().lt(cr.tick())) {
                        secondChordRest = cr
                    }
                }

                const firstCrTrill = !!firstChordRest && firstChordRest.isChord() && (firstChordRest as unknown as Chord).isTrillCueNote()
                const secondCrTrill = !!secondChordRest && secondChordRest.isChord() && (secondChordRest as unknown as Chord).isTrillCueNote()

                if (firstChordRest && (firstChordRest !== secondChordRest) && !(firstCrTrill || secondCrTrill)) {
                    this.doAddSlurBetween(firstChordRest, secondChordRest, slurTemplate)
                }
            }
        } else if (sel.isSingle()) {
            const element = sel.element()!
            if (element.isNote() && !(element as unknown as Note).isTrillCueNote()) {
                this.doAddSlurBetween((element as unknown as Note).chord(), null, slurTemplate)
            }
            // TODO(port): hammer-on/pull-off templates on a selected slur segment
        } else {
            let firstItem: EngravingItem | null = null
            let secondItem: EngravingItem | null = null
            for (let e of el) {
                if (e.isNote()) {
                    e = (e as unknown as Note).chord()
                }

                const meas = e.findMeasure()
                const header = !!meas && meas.header() && e.tick().eq(meas.tick())

                if (!e.isChord() && !e.isBarLine() && !header) {
                    continue
                }

                if (!firstItem || e.isBefore(firstItem)) {
                    firstItem = e
                }
                if (!secondItem || secondItem.isBefore(e)) {
                    secondItem = e
                }
            }

            if (firstChordRest === secondItem && (!firstItem || firstItem.isChordRest())) {
                // TODO(port): ChordRestNavigateOptions disableOverRepeats
                secondItem = nextChordRest(firstItem as unknown as ChordRest | null)
            }

            const firstCrTrill = !!firstItem && firstItem.isChord() && (firstItem as unknown as Chord).isTrillCueNote()
            const secondCrTrill = !!secondItem && secondItem.isChord() && (secondItem as unknown as Chord).isTrillCueNote()

            if (firstItem && secondItem && (firstItem.isChordRest() || secondItem.isChordRest()) && !(firstCrTrill || secondCrTrill)) {
                this.doAddSlurBetween(firstItem, secondItem, slurTemplate)
            }
        }

        this.apply()
    }

    /** C++ doAddSlur(EngravingItem* firstItem, EngravingItem* secondItem, const Slur* slurTemplate) */
    private doAddSlurBetween(firstItem: EngravingItem, secondItem: EngravingItem | null, slurTemplate: Slur | null): void {
        const meas = firstItem ? firstItem.findMeasure() : null
        const header = !!meas && meas.header() && firstItem.tick().eq(meas.tick()) && !firstItem.isChordRest()

        if (firstItem && secondItem
            && ((firstItem.isBarLine() !== secondItem.isBarLine()) || (header && secondItem.isChordRest()))) {
            // TODO(port): partial slurs (incoming/outgoing over a repeat bar line: undoSetIncoming/undoSetOutgoing)
            return
        }

        const firstChordRest = firstItem as unknown as ChordRest
        const secondChordRest = secondItem as unknown as ChordRest | null

        let slur = firstChordRest.slur(secondChordRest)
        if (!slur || slur.slurDirection() !== DirectionV.AUTO) {
            slur = this.score().addSlur(firstChordRest, secondChordRest, slurTemplate)
        }
        // TODO(port): replacing an existing slur with a hammer-on/pull-off

        if (this.m_noteInput.isNoteInputMode()) {
            this.m_noteInput.addSlur(slur)
        } else if (!secondItem) {
            const segment = slur.frontSegment()
            this.select([segment], SelectType.SINGLE)
            // TODO(port): startEditGrip(segment, Grip::END)
        }
    }

    addOttavaToSelection(type: OttavaType): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add ottava'))
        this.score().cmdAddOttava(type)
        this.apply()
    }

    addHairpinsToSelection(type: HairpinType): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add hairpin'))
        const hairpins = this.score().addHairpins(type)
        this.apply()

        if (!this.noteInput().isNoteInputMode() && hairpins.length === 1) {
            const segment = hairpins[0].frontSegment()
            if (segment) {
                this.select([segment], SelectType.SINGLE)
            }
            // TODO(port): startEditGrip(segment, Grip::END)
        }
    }

    canAddTupletToSelectedChordRests(): boolean {
        for (const chordRest of this.score().getSelectedChordRests()) {
            if (chordRest.isGrace() || (chordRest.isChord() && (chordRest as unknown as Chord).isTrillCueNote())) {
                continue
            }

            if (chordRest.durationType().lt(new TDurationValue(DurationType.V_512TH))
                && !chordRest.durationType().equals(new TDurationValue(DurationType.V_MEASURE))) {
                return false
            }
        }

        return true
    }

    addTupletToSelectedChordRests(options: TupletOptions): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add tuplet'))

        for (const chordRest of this.score().getSelectedChordRests()) {
            if (!chordRest.isGrace() && !(chordRest.isChord() && (chordRest as unknown as Chord).isTrillCueNote())) {
                let ratio = options.ratio
                if (options.autoBaseLen) {
                    ratio = new Fraction(ratio.numerator(), Tuplet.computeTupletDenominator(ratio.numerator(), chordRest.ticks()))
                }
                this.score().addTuplet(chordRest, ratio, options.numberType, options.bracketType)
            }
        }

        this.apply()
    }

    addBeamToSelectedChordRests(mode: BeamMode): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Set beam type'))
        this.score().cmdSetBeamMode(mode)
        this.apply()
    }

    addGraceNotesToSelectedNotes(type: GraceNoteType): void {
        if (this.score().selection().isNone()) {
            return
        }

        let denominator = 1

        switch (type) {
        case GraceNoteType.GRACE4:
        case GraceNoteType.INVALID:
        case GraceNoteType.NORMAL:
            denominator = 1
            break
        case GraceNoteType.ACCIACCATURA:
        case GraceNoteType.APPOGGIATURA:
        case GraceNoteType.GRACE8_AFTER:
            denominator = 2
            break
        case GraceNoteType.GRACE16:
        case GraceNoteType.GRACE16_AFTER:
            denominator = 4
            break
        case GraceNoteType.GRACE32:
        case GraceNoteType.GRACE32_AFTER:
            denominator = 8
            break
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add grace note'))
        this.score().cmdAddGrace(type, Constants.DIVISION / denominator)
        this.apply()
    }

    addIntervalToSelectedNotes(interval: number): void {
        if (!isNotesIntervalValid(interval)) {
            return
        }

        let notes: Note[] = []

        const score = this.score()
        if (score.selection().isRange()) {
            const hasMultiNoteChords = score.selection().rangeContainsMultiNoteChords()
            for (const chordRest of score.getSelectedChordRests()) {
                if (!chordRest.isChord()) {
                    continue
                }
                const chord = chordRest as unknown as Chord
                const nl = chord.notes()
                if (interval > 0) {
                    for (let noteIdx = nl.length; noteIdx > 0; --noteIdx) {
                        if (score.selectionFilter().canSelectNoteIdx(noteIdx - 1, nl.length, hasMultiNoteChords)) {
                            notes.push(nl[noteIdx - 1])
                            break
                        }
                    }
                } else {
                    for (let noteIdx = 0; noteIdx < nl.length; ++noteIdx) {
                        if (score.selectionFilter().canSelectNoteIdx(noteIdx, nl.length, hasMultiNoteChords)) {
                            notes.push(nl[noteIdx])
                            break
                        }
                    }
                }
            }
        } else {
            notes = score.selection().noteList()
        }

        if (!notes.length) {
            NoteInputMScore.setError(NoteInputMsError.NO_NOTE_SELECTED)
            this.checkAndShowError()
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Add interval'))
        score.addInterval(interval, notes)
        this.apply()
    }

    addLaissezVibToSelection(): void {
        // Calls `startEdit` internally
        this.score().cmdToggleLaissezVib()

        this.notifyAboutNotationChanged()
    }

    /** C++ toggleArticulation(SymId): the palette's toggle of an articulation (bowing actions) */
    toggleArticulation(symId: SymId): void {
        this.startEdit(new TranslatableString('undoableAction', 'Toggle articulation'))
        this.score().toggleArticulation(symId)
        this.apply()
    }

    toggleArticulationForSelection(articulationSymbolId: SymId): void {
        if (this.score().selection().isNone()) {
            return
        }

        const notes = this.score().selection().noteList()
        if (!notes.length) {
            // no notes, but maybe they have an articulation selected. we should use that chord
            const e = this.score().selection().element()
            if (e && e.isArticulationFamily()) {
                const c = e.explicitParent() as unknown as Chord | null
                if (c) {
                    notes.unshift(...c.notes())
                }
            }
        }

        const updateMode = this.notesHaveActiculation(notes, articulationSymbolId)
            ? ArticulationsUpdateMode.Remove : ArticulationsUpdateMode.Insert

        const chords = new Set<Chord>()
        for (const note of notes) {
            if (note.isTrillCueNote()) {
                return
            }
            chords.add(note.chord())
        }

        this.startEdit(new TranslatableString('undoableAction', 'Toggle articulation'))
        for (const chord of chords) {
            chord.updateArticulations(new Set([articulationSymbolId]), updateMode)
        }
        this.apply()
    }

    private notesHaveActiculation(notes: readonly Note[], articulationSymbolId: SymId): boolean {
        for (const note of notes) {
            const chord = note.chord()

            let chordArticulations = chord.articulationSymbolIds()
            chordArticulations = flipArticulations(chordArticulations, PlacementV.ABOVE)
            chordArticulations = splitArticulations(chordArticulations)

            if (!chordArticulations.has(articulationSymbolId)) {
                return false
            }
        }

        return true
    }

    // =================================================================================================================
    //   (end of the note input section)
    // =================================================================================================================

    // ---------------------------------------------------------------------------------
    // editing commands
    // ---------------------------------------------------------------------------------

    /** C++ execute(&Score::f, ..., actionName) */
    private execute(f: () => void, actionName: TranslatableString): void {
        this.startEdit(actionName)
        f()
        this.apply()
    }

    addBracketsToSelection(type: BracketsType): void {
        if (this.score().selection().isNone()) {
            return
        }

        switch (type) {
        case BracketsType.Brackets:
            this.startEdit(new TranslatableString('undoableAction', 'Add brackets'))
            this.score().cmdAddBracket()
            this.apply()
            break
        case BracketsType.Braces:
            this.startEdit(new TranslatableString('undoableAction', 'Add braces'))
            this.score().cmdAddBraces()
            this.apply()
            break
        case BracketsType.Parentheses:
            this.startEdit(new TranslatableString('undoableAction', 'Add parentheses'))
            this.score().cmdToggleParentheses()
            this.apply()
            break
        }
    }

    toggleVisible(): void {
        this.startEdit(new TranslatableString('undoableAction', 'Toggle visible'))
        this.score().cmdToggleVisible()
        this.apply()
    }

    movePitch(d: MoveDirection, mode: UpDownMode): void {
        if (d !== MoveDirection.Up && d !== MoveDirection.Down) {
            return
        }

        const el = this.score().selection().element()
        if (el && el.isRest()) {
            this.startEdit(new TranslatableString('undoableAction', 'Change vertical position'))
            this.score().cmdMoveRest(el as unknown as Rest, d === MoveDirection.Up ? DirectionV.UP : DirectionV.DOWN)
        } else {
            this.startEdit(new TranslatableString('undoableAction', 'Change pitch'))
            this.score().upDown(d === MoveDirection.Up, mode)
        }

        this.apply()
    }

    deleteSelection(): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Delete'))
        // TODO(port): text editing (deleteSelectedText), element/grip editing
        this.score().cmdDeleteSelection()

        this.checkAndShowError()
        this.apply()
    }

    flipSelection(): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Flip direction'))
        this.score().cmdFlip()
        this.apply()
    }

    addTieToSelection(): void {
        // Calls `startEdit` internally
        this.score().cmdToggleTie()

        // TODO(port): select and edit a new tie with jump points (repeats)
        this.notifyAboutNotationChanged()
    }

    addTiedNoteToChord(): void {
        // Calls `startEdit` internally
        this.score().cmdAddTie(true)

        this.notifyAboutNotationChanged()
    }

    putRestToSelection(): void {
        const is = this.score().inputState()
        if (!is.duration().isValid() || is.duration().isZero() || is.duration().isMeasure()) {
            is.setDuration(DurationType.V_QUARTER)
        }

        if (!this.m_noteInput.isNoteInputMode()) {
            this.m_noteInput.startNoteInput(NoteEntryMethod.BY_NOTE_NAME) // C++ configuration()->defaultNoteInputMethod()
        }

        if (is.usingNoteEntryMethod(NoteEntryMethod.BY_DURATION) || is.usingNoteEntryMethod(NoteEntryMethod.RHYTHM)) {
            this.m_noteInput.padNote(Pad.REST)
        } else if (is.usingNoteEntryMethod(NoteEntryMethod.REPITCH)) {
            const cr = is.cr()
            if (cr) {
                const duration = cr.durationType()
                if (duration.isValid() && !duration.isZero()) {
                    if (duration.isMeasure()) {
                        is.moveToNextInputPos()
                    } else {
                        this.putRest(duration)
                    }
                }
            }
        } else {
            this.putRest(is.duration())
        }
    }

    putRest(duration: TDuration): void {
        if (this.score().selection().isNone()) {
            return
        }

        // Calls `startEdit` internally
        this.score().cmdEnterRest(duration)

        this.notifyAboutNotationChanged()
    }

    toggleAccidentalForSelection(type: AccidentalType): void {
        if (this.score().selection().isNone()) {
            return
        }

        let accidentalAlreadyAdded = false
        for (const item of this.score().selection().elements()) {
            if (!item.isNote()) {
                continue
            }

            if ((item as unknown as Note).accidentalType() !== type) {
                accidentalAlreadyAdded = false
                break
            }

            accidentalAlreadyAdded = true
        }

        this.startEdit(new TranslatableString('undoableAction', 'Toggle accidental'))

        if (accidentalAlreadyAdded) {
            this.score().changeAccidental(AccidentalType.NONE)
        } else {
            this.score().changeAccidental(type)
        }

        this.apply()
    }

    changeAccidental(accidental: AccidentalType): void {
        this.execute(() => this.score().changeAccidental(accidental), new TranslatableString('undoableAction', 'Add accidental'))
    }

    toggleDotsForSelection(dots: Pad): void {
        if (dots < Pad.DOT || dots > Pad.DOT4) {
            return
        }

        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Toggle augmentation dots'))
        this.score().padToggle(dots, true /*toggleForSelectionOnly*/)
        this.apply()
    }

    increaseDecreaseDuration(steps: number, stepByDots: boolean): void {
        if (this.score().selection().isNone()) {
            return
        }

        this.startEdit(steps > 0 // negative: increase, positive: decrease
            ? new TranslatableString('undoableAction', 'Decrease duration')
            : new TranslatableString('undoableAction', 'Increase duration'))
        this.score().cmdIncDecDuration(steps, stepByDots)
        this.apply()
    }

    changeSelectedElementsVoice(voiceIndex: voice_idx_t): void {
        if (this.score().selection().isNone()) {
            return
        }

        if (voiceIndex >= VOICES) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Change voice'))
        this.score().changeSelectedElementsVoice(voiceIndex)
        this.apply()
    }

    /**
     * C++ AbstractInspectorModel::setPropertyValue: sets the property of the items (a styled property becomes
     * unstyled) as one undoable command "Edit <property>". The value is in element units.
     */
    changeProperty(items: readonly EngravingItem[], pid: Pid, value: PropertyValue): void {
        if (!items.length) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Edit %1').arg(propertyUserName(pid)))

        for (const item of items) {
            let ps = item.propertyFlags(pid)

            if (ps === PropertyFlags.STYLED) {
                ps = PropertyFlags.UNSTYLED
            }

            item.undoChangeProperty(pid, value, ps)
        }

        this.apply()
    }

    /** C++ AbstractInspectorModel::resetPropertyValue */
    resetProperty(items: readonly EngravingItem[], pid: Pid): void {
        if (!items.length) {
            return
        }

        this.startEdit(new TranslatableString('undoableAction', 'Reset %1').arg(propertyUserName(pid)))

        for (const item of items) {
            item.undoResetProperty(pid)
        }

        this.apply()
    }

    // ---------------------------------------------------------------------------------
    // hit testing (positions in canvas coordinates)
    // ---------------------------------------------------------------------------------

    point2page(p: PointF, useNearestPage = false): Page | null {
        if (this.score().linearMode()) {
            return this.score().pages().length ? this.score().pages()[0] : null
        }

        let shortestDistance = Number.MAX_VALUE
        let nearestPage: Page | null = null
        for (const page of this.score().pages()) {
            const pageRect = page.ldata().bbox().translated(page.pos())
            if (pageRect.contains(p)) {
                return page
            } else if (useNearestPage) {
                const d = rectDistanceTo(pageRect, p)
                if (d < shortestDistance) {
                    shortestDistance = d
                    nearestPage = page
                }
            }
        }
        return nearestPage
    }

    elementsAt(p: PointF): EngravingItem[] {
        const page = this.point2page(p)
        if (!page) {
            return []
        }

        const el = page.itemsAt(p.minus(page.pos()))
        if (el.length === 0) {
            return []
        }

        sortByElementIsLess(el)

        return el
    }

    elementAt(p: PointF): EngravingItem | null {
        const el = this.elementsAt(p)
        return el.length === 0 || el[el.length - 1].isPage() ? null : el[el.length - 1]
    }

    hitElement(pos: PointF, width: number): EngravingItem | null {
        const elements = this.hitElements(pos, width)
        if (elements.length === 0) {
            return null
        }
        return elements[elements.length - 1]
    }

    hitStaff(pos: PointF): Staff | null {
        return this.hitMeasure(pos).staff
    }

    hitElements(pos: PointF, width: number): EngravingItem[] {
        const page = this.point2page(pos)
        if (!page) {
            return []
        }

        const hitElements: EngravingItem[] = []

        const posOnPage = pos.minus(page.pos())

        // TODO(port): text editing (the edited element is preferred)

        const hitRect = new RectF(posOnPage.x() - width, posOnPage.y() - width, 3.0 * width, 3.0 * width)

        const potentiallyHitElements = page.items(hitRect)

        const canHitElement = (element: EngravingItem): boolean => {
            if (!element.selectable() || element.isPage()) {
                return false
            }

            // TODO(port): sound flags (SoundFlag::shouldHide)
            if (!element.isInteractionAvailable()) {
                return false
            }

            return true
        }

        for (const element of potentiallyHitElements) {
            if (!canHitElement(element)) {
                continue
            }

            if (element.hitShapeContains(posOnPage)) {
                hitElements.push(element)
            }
        }

        if (hitElements.length === 0 || (hitElements.length === 1 && hitElements[0].isMeasure())) {
            //
            // if no relevant element hit, look nearby
            //
            for (const element of potentiallyHitElements) {
                if (!canHitElement(element)) {
                    continue
                }

                if (element.hitShapeIntersects(hitRect)) {
                    hitElements.push(element)
                }
            }
        }

        if (hitElements.length) {
            sortByElementIsLess(hitElements)
        } else {
            const measure = this.hitMeasure(pos).measure
            if (measure) {
                hitElements.push(measure)
            }
        }

        return hitElements
    }

    hitMeasure(pos: PointF): HitMeasureData {
        const res = this.score().pos2measure(pos)

        const result: HitMeasureData = { measure: null, staff: null }
        if (res && res.measure.staffLines(res.staffIdx).canvasHitShape().contains(pos)) {
            result.measure = res.measure
            result.staff = this.score().staff(res.staffIdx)
        }

        return result
    }

    static elementIsLess(e1: EngravingItem, e2: EngravingItem): boolean {
        if (e1.selectable() && !e2.selectable()) {
            return false
        }
        if (!e1.selectable() && e2.selectable()) {
            return true
        }
        if (e1.isNote() && (e2.isStem() || e2.isHook())) {
            return false
        }
        if (e2.isNote() && (e1.isStem() || e1.isHook())) {
            return true
        }
        if (e1.isStem() && e2.isHook()) {
            return false
        }
        if (e2.isStem() && e1.isHook()) {
            return true
        }
        if (e1.isText() && e2.isBox()) {
            return false
        }
        if (e1.isBox() && e2.isText()) {
            return true
        }
        if (e1.isImage() && e2.isBox()) {
            return false
        }
        if (e1.isBox() && e2.isImage()) {
            return true
        }
        if ((e1.isHarmony() || e1.isFretDiagram()) && e2.isFBox()) {
            return false
        }
        if (e1.isFBox() && (e2.isHarmony() || e2.isFretDiagram())) {
            return true
        }
        if (e1.z() === e2.z()) {
            // same stacking order, prefer non-hidden elements
            if (e1.type() === e2.type()) {
                if (e1.isNoteDot()) {
                    const n1 = e1 as unknown as NoteDot
                    const n2 = e2 as unknown as NoteDot
                    if (n1.note() && n1.note()!.hidden()) {
                        return false
                    } else if (n2.note() && n2.note()!.hidden()) {
                        return true
                    }
                } else if (e1.isNote()) {
                    const n1 = e1 as unknown as Note
                    const n2 = e2 as unknown as Note
                    if (n1.hidden()) {
                        return false
                    } else if (n2.hidden()) {
                        return true
                    }
                }
            }
            // different types, or same type but nothing hidden - use track
            return e1.track() < e2.track()
        }

        // default case, use stacking order
        return e1.z() < e2.z()
    }

    // ---------------------------------------------------------------------------------
    // selection
    // ---------------------------------------------------------------------------------

    /**
     * controlModifier: C++ checks QGuiApplication::keyboardModifiers() == Qt::ControlModifier in doSelect (ctrl+click
     * on a selected element deselects it)
     */
    select(elements: readonly EngravingItem[], type: SelectType, staffIndex: staff_idx_t = 0, controlModifier = false): boolean {
        const selection = this.score().selection()
        const oldSelectedElements = [...selection.elements()]
        const oldSelectionState = selection.state()

        const oldStartTick = selection.tickStart()
        const oldEndTick = selection.tickEnd()

        const oldStartStaff = selection.staffStart()
        const oldEndStaff = selection.staffEnd()

        this.doSelect(elements, type, staffIndex, controlModifier)

        let rangeChanged = false
        if (selection.isRange()) {
            const ticksChanged = !oldStartTick.eq(selection.tickStart()) || !oldEndTick.eq(selection.tickEnd())
            const stavesChanged = oldStartStaff !== selection.staffStart() || oldEndStaff !== selection.staffEnd()
            rangeChanged = ticksChanged || stavesChanged
        }

        const elementsChanged = oldSelectedElements.length !== selection.elements().length
            || oldSelectedElements.some((e, i) => e !== selection.elements()[i])
        if (rangeChanged || oldSelectionState !== selection.state() || elementsChanged) {
            return this.notifyAboutSelectionChangedIfNeed()
        } else {
            this.score().setSelectionChanged(false)
        }
        return false
    }

    private doSelect(elements: readonly EngravingItem[], type: SelectType, staffIndex: staff_idx_t, controlModifier: boolean): void {
        // TODO(port): end text/element editing

        if (elements.length === 1 && type === SelectType.ADD && controlModifier) {
            if (this.score().selection().isRange()) {
                this.score().selection().setState(SelState.LIST)
            }

            if (elements[0].selected()) {
                this.score().deselect(elements[0])
                return
            }
        }

        if (type === SelectType.REPLACE) {
            this.score().deselectAll()
            type = SelectType.ADD
        }

        if (type === SelectType.SINGLE && elements.length === 1) {
            const element = elements[0]
            let segment: Segment | null = null

            if (element.isKeySig()) {
                segment = (element as unknown as KeySig).segment()
            } else if (element.isTimeSig()) {
                segment = (element as unknown as TimeSig).segment()
            }

            if (segment) {
                this.selectElementsWithSameTypeOnSegment(element.type(), segment)
                return
            }
        }

        this.score().select(elements, type, staffIndex)
    }

    private selectElementsWithSameTypeOnSegment(elementType: ElementType, segment: Segment): void {
        this.score().deselectAll()

        const elementsToSelect: EngravingItem[] = []

        for (let track: track_idx_t = 0; track < this.score().ntracks(); track += VOICES) {
            const element = segment.element(track)
            if (element && element.type() === elementType) {
                elementsToSelect.push(element)
            }
        }

        this.score().select(elementsToSelect, SelectType.ADD)
    }

    selectAll(): boolean {
        // TODO(port): text editing (select all text)
        this.score().cmdSelectAll()

        return this.notifyAboutSelectionChangedIfNeed()
    }

    selectFirstElement(frame = true): boolean {
        const element = this.score().firstElement(frame)
        if (element) {
            return this.select([element], SelectType.SINGLE, element.staffIdx())
        }
        return false
    }

    selectLastElement(): boolean {
        const element = this.score().lastElement()
        if (element) {
            return this.select([element], SelectType.SINGLE, element.staffIdx())
        }
        return false
    }

    clearSelection(): boolean {
        // TODO(port): end element editing, drag
        if (this.score().selection().isNone()) {
            return false
        }

        this.score().deselectAll()

        return this.notifyAboutSelectionChangedIfNeed()
    }

    /** Left/Right of the notation view (Score::move: next/prev-chord, measure, track) */
    moveSelection(d: MoveDirection, type: MoveSelectionType): boolean {
        if (type === MoveSelectionType.EngravingItem) {
            return this.moveElementSelection(d)
        }

        if (type === MoveSelectionType.String) {
            // TODO(port): moveStringSelection
            return false
        }

        const typeToString = (t: MoveSelectionType): string => {
            switch (t) {
            case MoveSelectionType.Chord: return 'chord'
            case MoveSelectionType.Measure: return 'measure'
            case MoveSelectionType.Track: return 'track'
            case MoveSelectionType.Frame: return 'frame'
            case MoveSelectionType.System: return 'system'
            default: return ''
            }
        }

        let cmd = ''
        if (d === MoveDirection.Left) {
            cmd = 'prev-'
        } else if (d === MoveDirection.Right) {
            cmd = 'next-'
        }

        cmd += typeToString(type)

        this.score().move(cmd)

        return this.notifyAboutSelectionChangedIfNeed()
    }

    /** Alt+Left/Right (next-element/prev-element) */
    moveElementSelection(d: MoveDirection): boolean {
        let el = this.score().selection().element()
        if (!el && this.score().selection().elements().length) {
            el = this.score().selection().elements()[this.score().selection().elements().length - 1]
        }

        // TODO(port): text editing (navigateToNearText), horizontal layouts (skip VBoxes)
        const isLeftDirection = MoveDirection.Left === d

        let toEl: EngravingItem | null = null

        if (el) {
            // TODO(port): Score::prevElement() / nextElement()
            return false
        } else {
            // Nothing currently selected (e.g. because user pressed Esc or clicked on
            // an empty region of the page). Try to restore previous selection.
            const cr = this.score().selection().currentCR()
            if (cr) {
                el = cr.isChord() ? (cr as unknown as Chord).upNote() : cr
            }
            if (el) {
                toEl = el // Restoring previous selection.
            } else {
                toEl = isLeftDirection ? this.score().lastElement() : this.score().firstElement()
            }
        }

        if (!toEl) {
            return false
        }

        return this.select([toEl], SelectType.REPLACE)
    }

    /** shift+arrows: extend the range */
    addToSelection(d: MoveDirection, type: MoveSelectionType): boolean {
        const cr = activeCr(this.score())
        if (!cr) {
            return false
        }
        let el: ChordRest | null = null
        switch (type) {
        case MoveSelectionType.Chord: {
            // ChordRestNavigateOptions.skipGrace = true
            if (d === MoveDirection.Right) {
                el = nextChordRest(cr, true)
            } else {
                el = prevChordRest(cr, true)
            }
            break
        }
        case MoveSelectionType.Measure:
            if (d === MoveDirection.Right) {
                el = this.score().nextMeasure(cr, true, true)
            } else {
                el = this.score().prevMeasure(cr, true)
            }
            break
        case MoveSelectionType.Track:
            if (d === MoveDirection.Up) {
                el = this.score().upStaff(cr)
            } else {
                el = this.score().downStaff(cr)
            }
            break
        default:
            break
        }

        if (el) {
            return this.select([el], SelectType.RANGE, el.staffIdx())
        }
        return false
    }

    expandSelection(mode: ExpandSelectionMode): boolean {
        const cr = activeCr(this.score())
        if (!cr) {
            return false
        }
        let el: ChordRest | null = null
        switch (mode) {
        case ExpandSelectionMode.BeginSystem: {
            const measure = cr.segment().measure().system()!.firstMeasure()
            if (measure) {
                el = measure.first()!.nextChordRest(cr.track())
            }
            break
        }
        case ExpandSelectionMode.EndSystem: {
            const measure = cr.segment().measure().system()!.lastMeasure()
            if (measure) {
                el = measure.last()!.nextChordRest(cr.track(), true)
            }
            break
        }
        case ExpandSelectionMode.BeginScore: {
            const measure = this.score().firstMeasureMM()
            if (measure) {
                el = measure.first()!.nextChordRest(cr.track())
            }
            break
        }
        case ExpandSelectionMode.EndScore: {
            const measure = this.score().lastMeasureMM()
            if (measure) {
                el = measure.last()!.nextChordRest(cr.track(), true)
            }
            break
        }
        }

        if (el) {
            return this.select([el], SelectType.RANGE, el.staffIdx())
        }
        return false
    }

    /** Alt+Up/Down (up-chord/down-chord) */
    moveChordNoteSelection(d: MoveDirection): boolean {
        const current = this.score().selection().element()
        if (!current || !(current.isNote() || current.isRest())) {
            return false
        }

        const chordElem = d === MoveDirection.Up ? this.score().upAlt(current) : this.score().downAlt(current)

        if (!chordElem || chordElem === current) {
            return false
        }

        return this.select([chordElem], SelectType.SINGLE, chordElem.staffIdx())
    }

    /** Ctrl+Alt+Up/Down (top-chord/bottom-chord) */
    selectTopOrBottomOfChord(d: MoveDirection): boolean {
        const current = this.score().selection().element()
        if (!current || !current.isNote()) {
            return false
        }

        const note = current as unknown as Note
        const target = d === MoveDirection.Up ? this.score().upAltCtrl(note) : this.score().downAltCtrl(note)

        if (target === current) {
            return false
        }

        return this.select([target], SelectType.SINGLE)
    }

    /**
     * C++ drawSelectionRange (painted by the notation view after the score). The painter draws in canvas coordinates;
     * scaling: device pixels per canvas unit (C++ currentScaling(painter)).
     */
    drawSelectionRange(painter: Painter, scaling: number): void {
        const selection = this.score().selection()
        if (!selection.isRange()) {
            return
        }

        painter.setBrush(BrushStyle.NoBrush)

        const selectionColor = EngravingConfiguration.selectionColor()
        let penWidth = 3.0 / scaling
        const minPenWidth = 0.20 * selection.startSegment()!.measure().spatium() // measureRange().startMeasure
        penWidth = Math.max(penWidth, minPenWidth)

        const pen = new Pen(selectionColor, penWidth, PenStyle.SolidLine)
        painter.setPen(pen)

        const rangeArea = this.rangeBoundingArea()
        for (const rect of rangeArea) {
            const path = new PainterPath()
            path.addRoundedRect(rect, 4, 4)

            const fillColor = selectionColor.clone()
            fillColor.setAlpha(10)
            painter.fillPath(path, new Brush(fillColor))
            painter.drawPath(path)
        }
    }

    // ---------------------------------------------------------------------------------
    // NotationSelectionRange
    // ---------------------------------------------------------------------------------

    /** the rectangles of a range selection (canvas coordinates), C++ NotationSelectionRange::boundingArea */
    rangeBoundingArea(): RectF[] {
        const selection = this.score().selection()
        if (!selection.isRange()) {
            return []
        }
        return ScoreRangeUtilities.boundingArea(this.score(), this.rangeStartSegment(), this.rangeEndSegment(),
            selection.staffStart(), selection.staffEnd())
    }

    rangeContainsPoint(point: PointF): boolean {
        return this.rangeBoundingArea().some(area => area.contains(point))
    }

    /** When `item` is a Measure, use `staffIdx` to query whether a specific staff is contained in the selection. */
    rangeContainsItem(item: EngravingItem, staffIdx: staff_idx_t): boolean {
        const selection = this.score().selection()
        const itemTick = item.tick()
        const selectionStartTick = selection.tickStart()
        const selectionEndTick = selection.tickEnd()

        if (itemTick.lt(selectionStartTick) || itemTick.ge(selectionEndTick)) {
            return false
        }

        if (item.isMeasure()) {
            if (staffIdx !== nidx) {
                return selection.staffStart() <= staffIdx && staffIdx < selection.staffEnd()
            }

            return true
        }

        const itemTrack = item.track()
        const selectionStartTrack = VOICES * selection.staffStart()
        const selectionEndTrack = VOICES * (selection.staffEnd() - 1) + VOICES

        return itemTrack >= selectionStartTrack && itemTrack < selectionEndTrack
    }

    private rangeStartSegment(): Segment | null {
        let startSegment = this.score().selection().startSegment()

        if (!startSegment) {
            return null
        }

        if (!startSegment.enabled()) {
            startSegment = startSegment.next1MMenabled()
            if (!startSegment) {
                return null
            }
        }

        if (!startSegment.measure().system()) {
            const mmr = startSegment.measure().coveringMMRestOrThis()
            if (!mmr || mmr.system()) {
                return null
            }
            startSegment = mmr.first(SegmentType.ChordRest)
        }

        return startSegment
    }

    private rangeEndSegment(): Segment | null {
        let endSegment = this.score().selection().endSegment()

        if (endSegment && !endSegment.enabled()) {
            endSegment = endSegment.next1MMenabled()
        }

        if (!endSegment) {
            endSegment = this.score().lastSegmentMM()
        }

        return endSegment
    }

    // =================================================================================================================
    //   palette elements and drop (applyPaletteElement, applyPaletteElementToList/Range, drop): filled by the palette
    //   drop port; the other editing methods go above this section
    // =================================================================================================================

    /**
     * Applies a palette element to the selection (C++ Palette::applyPaletteElement). modifiers: KeyboardModifier
     * flags (editing/editdata.ts), e.g. Control to apply a key/time signature to one staff only, Shift to add a
     * drum note to the chord. Returns false if there is no selection.
     */
    applyPaletteElement(element: EngravingItem, modifiers = 0): boolean {
        const score = this.score()

        // make a copy of selection state before applying the operation
        if (score.selection().isNone()) {
            return false
        }
        const sel = paletteSelection(score.selection())

        this.startEdit(new TranslatableString('undoableAction', 'Apply palette element: %1').arg(element.typeUserName().translated()))

        try {
            if (sel.isList()) {
                this.applyPaletteElementToList(element, score, sel, modifiers)
            } else if (sel.isRange()) {
                this.applyPaletteElementToRange(element, score, sel, modifiers)
            }
        } catch (err) {
            // the port throws for not ported parts (e.g. rewriting measures for a new time signature)
            this.rollback()
            throw err
        }

        score.setSelectionChanged(true)
        this.apply()
        this.notifyAboutSelectionChangedIfNeed()

        this.checkAndShowError()

        return true
    }

    private applyPaletteElementToList(element: EngravingItem, score: Score, sel: PaletteSelection, modifiers: number): void {

        const cr1 = sel.firstChordRest()
        const cr2 = sel.lastChordRest()
        let addSingle = false // add a single line only
        if (cr1 && cr2 === cr1) {
            // one chordrest selected, ok to add line
            addSingle = true
        } else if (sel.elements().length === 2 && cr1 && cr2 && cr1 !== cr2) {
            // two chordrests selected
            // must be on same staff in order to add line, except for slur
            if (element.isSlur() || cr1.staffIdx() === cr2.staffIdx()) {
                addSingle = true
            }
        }

        // TODO(port): drum notes from the drumset palette in note input (isEntryDrumStaff() && element->isChord()),
        // action icons (system lock, parentheses), glissandos/bends between two notes (applyLineNoteToNote)

        if (element.isLayoutBreak()) {
            score.cmdToggleLayoutBreak((element as unknown as LayoutBreak).layoutBreakType())
            return
        }

        if (element.isSlur()) {
            this.doAddSlur(element as unknown as Slur)
            return
        }

        if (element.isSLine() && !element.isGlissando() && !element.isGuitarBend() && addSingle) {
            const startSegment = cr1!.segment()
            let endSegment: Segment | null
            if (element.type() === ElementType.PEDAL && cr2 !== cr1) {
                endSegment = cr2!.segment().nextCR(cr2!.track())
            } else {
                // Ensure that list-selection results in the same endSegment as range selection
                endSegment = cr2!.nextSegmentAfterCR(SegmentType.ChordRest | SegmentType.EndBarLine | SegmentType.Clef)
            }
            const spanner = element.clone() as unknown as Spanner
            spanner.setScore(score)
            spanner.styleChanged()
            if (spanner.isHairpin()) {
                score.addHairpin(spanner as unknown as Hairpin, cr1!, cr2)
                // TODO(port): select the front segment and start editing it
            } else {
                const firstStaffOnly = isSystemTextLine(element) && !(modifiers & KeyboardModifier.ControlModifier)
                const targetStaff = firstStaffOnly ? 0 : cr1!.staffIdx()
                score.cmdAddSpanner(spanner, targetStaff, startSegment, endSegment, (modifiers & KeyboardModifier.ControlModifier) !== 0)
            }
            // TODO(port): setInitialTrackAndVoiceAssignment (voice assignment of spanners)
            return
        }

        if (element.isArticulationFamily() && sel.elements().length === 1) {
            // understand adding an articulation to another articulation as adding it to the chord it's attached to
            const e = sel.elements()[0]
            if (e.isArticulationFamily()) {
                const p = e.explicitParent()
                if (p && p.isChord()) {
                    this.applyDropPaletteElement(score, (p as unknown as Chord).notes()[0], element, modifiers)
                }
            } else {
                this.applyDropPaletteElement(score, e, element, modifiers)
            }
            return
        }

        if ((element.isClef() || element.isTimeSig() || element.isKeySig()) && score.noteEntryMode()) {
            // in note input mode place clef / time sig / key sig before cursor
            let e: EngravingItem | null = score.inputState().cr()
            if (!e) {
                e = sel.elements()[0]
            } else if (e.isChord()) {
                e = (e as unknown as Chord).notes()[0]
            }
            this.applyDropPaletteElement(score, e, element, modifiers)
            return
        }

        const { elements: targetElements } = filterTargetElements(sel, element)

        for (const target of targetElements) {
            this.applyDropPaletteElement(score, target, element, modifiers)
        }
    }

    private applyPaletteElementToRange(element: EngravingItem, score: Score, sel: PaletteSelection, modifiers: number): void {
        const elementType = element.type()

        const { elements: targetElements, unique: isMeasureAnchoredElement } = filterTargetElements(sel, element)
        if (isMeasureAnchoredElement) {
            if (elementType === ElementType.BAR_LINE) {
                // In a range selection, add barlines to all selected measures
                for (const target of targetElements) {
                    this.applyDropPaletteElement(score, target.findMeasure(), element, modifiers, target.track())
                }
            } else {
                for (const target of targetElements) {
                    this.applyDropPaletteElement(score, target, element, modifiers)
                }
            }
            return
        }

        if (elementType === ElementType.LAYOUT_BREAK) {
            score.cmdToggleLayoutBreak((element as unknown as LayoutBreak).layoutBreakType())
            return
        }

        if (element.isClef() || element.isKeySig() || element.isTimeSig()) {
            const m1 = sel.startSegment()!.measure()
            let m2: Measure | null = sel.endSegment() ? sel.endSegment()!.measure() : null
            if (m2 === m1 && sel.startSegment()!.rtick().isZero()) {
                m2 = null // don't restore original if one full measure selected
            } else if (m2) {
                m2 = m2.nextMeasureMM()
            }
            // Clefs always apply to every selected staff, key and time signatures only when added locally
            const applyToEachStaff = element.isClef() || (modifiers & KeyboardModifier.ControlModifier) !== 0
            const staffIdx1 = sel.staffStart()
            const staffIdx2 = applyToEachStaff ? sel.staffEnd() : staffIdx1 + 1
            for (let i = staffIdx1; i < staffIdx2; ++i) {
                // For clefs, use mid-measure changes if appropriate
                // Mid-measure key signature changes are done via list selections
                let e1: EngravingItem | null = null
                let e2: EngravingItem | null = null
                if (element.isClef()) {
                    if (sel.startSegment()!.isChordRestType() && sel.startSegment()!.rtick().isNotZero()) {
                        const cr = sel.startSegment()!.nextChordRest(staff2track(i))
                        e1 = cr && cr.isChord() ? (cr as unknown as Chord).upNote() : cr
                    }
                    if (sel.endSegment() && sel.endSegment()!.segmentType() === SegmentType.ChordRest) {
                        const cr = sel.endSegment()!.nextChordRest(staff2track(i))
                        e2 = cr && cr.isChord() ? (cr as unknown as Chord).upNote() : cr
                    }
                }
                // restore clef/keysig/timesig that was in effect at end of selection
                if (m2 || e2) {
                    const staff = score.staff(i)!
                    const tick2 = sel.endSegment()!.tick()
                    let oelement: EngravingItem | null = null
                    switch (elementType) {
                    case ElementType.CLEF: {
                        const oclef = Factory.createItem(ElementType.CLEF, scoreDummy(score)) as Clef
                        oclef.setClefType(staff.clef(tick2))
                        oelement = oclef
                        break
                    }
                    case ElementType.KEYSIG: {
                        const okeysig = Factory.createItem(ElementType.KEYSIG, scoreDummy(score)) as KeySig
                        okeysig.setKeySigEvent(staff.keySigEvent(tick2))
                        const ck = okeysig.concertKey()
                        okeysig.setKey(ck)
                        oelement = okeysig
                        break
                    }
                    case ElementType.TIMESIG: {
                        const otimesig = Factory.createItem(ElementType.TIMESIG, scoreDummy(score)) as TimeSig
                        otimesig.setFrom(staff.timeSig(tick2)!)
                        oelement = otimesig
                        break
                    }
                    default:
                        break
                    }
                    if (oelement) {
                        if (e2) {
                            this.applyDropPaletteElement(score, e2, oelement, modifiers)
                        } else {
                            this.applyDropPaletteElement(score, m2, oelement, modifiers, staff2track(i))
                        }
                    }
                }
                // apply new clef/keysig/timesig
                if (e1) {
                    this.applyDropPaletteElement(score, e1, element, modifiers)
                } else {
                    this.applyDropPaletteElement(score, m1, element, modifiers, staff2track(i))
                }
            }
            return
        }

        if (element.isSlur()) {
            this.doAddSlur(element as unknown as Slur)
            return
        }

        if (element.isSLine() && elementType !== ElementType.GLISSANDO) {
            const startSegment = sel.startSegment()!
            const endSegment = sel.endSegment()
            const firstStaffOnly = isSystemTextLine(element) && !(modifiers & KeyboardModifier.ControlModifier)
            const startStaff = firstStaffOnly ? 0 : sel.staffStart()
            const endStaff = firstStaffOnly ? 1 : sel.staffEnd()
            for (let i = startStaff; i < endStaff; ++i) {
                const spanner = element.clone() as unknown as Spanner
                spanner.setScore(score)
                spanner.styleChanged()
                score.cmdAddSpanner(spanner, i, startSegment, endSegment, (modifiers & KeyboardModifier.ControlModifier) !== 0)
                // TODO(port): setInitialTrackAndVoiceAssignment
                this.selectAndStartEditIfNeeded(spanner)
            }
            return
        }

        if (element.isTextBase() && !element.isFingering() && !element.isSticking()) {
            const firstSegment = sel.startSegment()!
            const firstStaffIndex = sel.staffStart()
            const lastStaffIndex = sel.staffEnd()

            // A text should only be added at the start of the selection
            // There shouldn't be a text at each element
            if (element.systemFlag()) {
                this.applyDropPaletteElement(score, firstSegment.firstElementForNavigation(0), element, modifiers)
            } else {
                for (let staff = firstStaffIndex; staff < lastStaffIndex; staff++) {
                    this.applyDropPaletteElement(score, firstSegment.firstElementForNavigation(staff), element, modifiers)
                }
            }
            return
        }

        // TODO(port): action icons (system lock, parentheses, bends)

        const track1 = staff2track(sel.staffStart())
        const track2 = staff2track(sel.staffEnd())
        const startSegment = sel.startSegment()
        const endSegment = sel.endSegment() // keep it, it could change during the loop

        const rangeContainsMultiNoteChords = sel.rangeContainsMultiNoteChords()

        const applyDropPaletteElementToChord = (chord: Chord): void => {
            const notes = [...chord.notes()]
            const totalNotesInChord = notes.length
            for (let noteIdx = 0; noteIdx < totalNotesInChord; ++noteIdx) {
                const note = notes[noteIdx]
                if (!note || !score.selectionFilter().canSelectNoteIdx(noteIdx, totalNotesInChord, rangeContainsMultiNoteChords)) {
                    continue
                }
                this.applyDropPaletteElement(score, note, element, modifiers)
                if (!element.isAccidental() && !element.isNoteHead() && !element.isGlissando() && !element.isChordLine()) {
                    // Only need to apply to one note...
                    break
                }
            }
        }

        for (let s: Segment | null = startSegment; s && s !== endSegment; s = s.next1()) {
            for (let track = track1; track < track2; ++track) {
                const e = s.element(track)
                if (!e || !score.selectionFilter().canSelect(e) || !score.selectionFilter().canSelectVoice(track)) {
                    continue
                }
                if (!e.isChord()) {
                    // do not apply articulation or fermata to barline in a range selection
                    if (!e.isBarLine() || !element.isArticulationOrFermata()) {
                        this.applyDropPaletteElement(score, e, element, modifiers)
                    }
                    continue
                }

                applyDropPaletteElementToChord(e as unknown as Chord)
            }
            if (!element.placeMultiple()) {
                break
            }
        }
    }

    /** C++ applyDropPaletteElement (Palette applyDrop) */
    private applyDropPaletteElement(score: Score, target: EngravingItem | null, e: EngravingItem, modifiers: number,
        track: track_idx_t = nidx): void {
        if (!target) {
            return
        }

        // TODO(port): the EditData of text editing
        const dropData = new EditData()

        dropData.modifiers = modifiers
        dropData.dropElement = e
        dropData.track = (track === nidx) ? target.track() : track

        if (target.acceptDrop(dropData)) {
            // use same code path as drag&drop
            // TODO(port): C++ copies the element through its mime data (write + read); the port clones it
            const dropElement = e.clone()
            dropElement.setScore(score)
            dropElement.setParent(scoreDummy(score))
            dropElement.setSelected(false)
            dropElement.styleChanged() // update to local style
            dropData.dropElement = dropElement

            const el = target.drop(dropData)

            // TODO(port): instrument changes (selectInstrument), voice assignment (setInitialTrackAndVoiceAssignment),
            // fretboard diagrams (doFinishAddFretboardDiagram)

            if (el && !score.inputState().noteEntryMode()) {
                this.selectAndStartEditIfNeeded(el)
            }

            dropData.dropElement = null
        }
    }

    /** TODO(port): starting the edit of elements that need it (needStartEditingAfterSelecting: texts, lines) */
    private selectAndStartEditIfNeeded(element: EngravingItem): void {
        if (element.isSpanner() && (element as unknown as Spanner).spannerSegments().length) {
            element = (element as unknown as Spanner).spannerSegments()[0]
        }

        this.select([element], SelectType.SINGLE)
    }

}

/** a copy of the selection state (C++ copies the Selection in applyPaletteElement: the drops change the selection) */
export interface PaletteSelection {
    isList(): boolean
    isRange(): boolean
    elements(): readonly EngravingItem[]
    startSegment(): Segment | null
    endSegment(): Segment | null
    staffStart(): staff_idx_t
    staffEnd(): staff_idx_t
    firstChordRest(): ChordRest | null
    lastChordRest(): ChordRest | null
    rangeContainsMultiNoteChords(): boolean
}

function paletteSelection(sel: Selection): PaletteSelection {
    const isList = sel.isList()
    const isRange = sel.isRange()
    const elements = [...sel.elements()]
    const startSegment = sel.startSegment()
    const endSegment = sel.endSegment()
    const staffStart = sel.staffStart()
    const staffEnd = sel.staffEnd()
    const firstChordRest = sel.firstChordRest()
    const lastChordRest = sel.lastChordRest()
    const multiNoteChords = sel.rangeContainsMultiNoteChords()
    return {
        isList: () => isList,
        isRange: () => isRange,
        elements: () => elements,
        startSegment: () => startSegment,
        endSegment: () => endSegment,
        staffStart: () => staffStart,
        staffEnd: () => staffEnd,
        firstChordRest: () => firstChordRest,
        lastChordRest: () => lastChordRest,
        rangeContainsMultiNoteChords: () => multiNoteChords,
    }
}

/** C++ isSystemTextLine() of textlinebase.h */
function isSystemTextLine(element: EngravingItem | null): boolean {
    return !!element && element.isTextLineBase() && element.systemFlag()
}

/** std::sort(..., NotationInteraction::elementIsLess) */
function sortByElementIsLess(el: EngravingItem[]): void {
    el.sort((a, b) => NotationInteraction.elementIsLess(a, b) ? -1 : NotationInteraction.elementIsLess(b, a) ? 1 : 0)
}

/** RectF::distanceTo (muse geometry) */
function rectDistanceTo(r: RectF, p: PointF): number {
    const dx = Math.max(r.left() - p.x(), 0, p.x() - r.right())
    const dy = Math.max(r.top() - p.y(), 0, p.y() - r.bottom())
    return Math.sqrt(dx * dx + dy * dy)
}
