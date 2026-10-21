/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the selection part of src/notation/internal/notationinteraction.h/.cpp (hit testing, select, keyboard
 * navigation of the selection) and of notationselectionrange.cpp.
 *
 * TODO(port): editing (drag, grips, text editing, drop), note input, showItem (the UI scrolls to selectionBounds()),
 * the hit element context, playback, moveElementSelection (next/prev-element: Score::nextElement/prevElement),
 * moveStringSelection.
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { ElementType, VOICES, nidx, type staff_idx_t, type track_idx_t } from '../../engraving/types/types'
import { SelState, SelectType } from '../../engraving/dom/select'
import { SegmentType } from '../../engraving/dom/segment'
import { nextChordRest, prevChordRest, type Chord } from '../../engraving/dom/chord'
import '../../engraving/dom/navigate'
import '../../engraving/editing/cmd'
import { ScoreRangeUtilities } from '../utilities/scorerangeutilities'
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

    /** TODO(port): the shadow note (note input preview at the mouse position) */
    hideShadowNote(): void {}

    /** C++ checkAndShowError(): shows MScore's last error (MScoreErrorsController); TODO(port): error messages */
    checkAndShowError(): void {}

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
