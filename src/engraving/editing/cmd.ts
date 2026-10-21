/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/cmd.cpp: the command frame (Score::startCmd, endCmd, undoRedo, update), the
 * selection commands (Score::move, Score::selectMove) and the editing commands of cmd.cpp. They are added to Score
 * by this module (module augmentation), so it must be imported before they are used. CmdState is in cmdstate.ts.
 *
 * TODO(port): setPlayNote, the commands next/prev-system, next/prev-frame, next/prev-section, top-staff and
 * empty-trailing-measure.
 */

import { ElementType } from '../types/types'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import { MScore, MsError } from '../dom/mscore'
import type { EditData } from './editdata'
import type { DirectionV, track_idx_t } from '../types/types'
import type { Fraction } from '../types/fraction'
import type { SymId } from '../types/symid'
import type { InputState, NoteVal } from '../dom/input'
import type { TDuration } from '../dom/durationtype'
import type { Tuplet } from '../dom/tuplet'
import type { AccidentalType } from '../dom/accidentaldata'
import type { UpDownMode } from '../dom/mscore'
import type { NoteInputParams } from '../dom/score'
import { Score } from '../dom/score'
import { SelectType } from '../dom/select'
import { SegmentType } from '../dom/segment'
import { nextChordRest, prevChordRest, type Chord } from '../dom/chord'
import '../dom/navigate'
import type { EngravingItem } from '../dom/engravingitem'
import type { ChordRest } from '../dom/chordrest'
import type { Note } from '../dom/note'
import type { Rest } from '../dom/rest'
import type { Box } from '../dom/box'
import type { Segment } from '../dom/segment'

declare module '../dom/score' {
    interface Score {
        /** Start a GUI command by clearing the redraw area and starting a user-visible undo. */
        startCmd(actionName?: TranslatableString): void
        /** End a GUI command by (if not rollback) ending a user-visible undo and (always) updating the redraw area. */
        endCmd(rollback?: boolean, layoutAllParts?: boolean): void
        undoRedo(undo: boolean, ed?: EditData | null): void
        /** layout & update */
        update(resetCmdState?: boolean, layoutAllParts?: boolean): void

        /** move current selection */
        move(cmd: string): EngravingItem | null
        selectMove(cmd: string): EngravingItem | null

        // ---- the editing commands of cmd.cpp ----
        setNoteRest(segment: Segment, track: track_idx_t, nval: NoteVal, sd: Fraction, stemDirection?: DirectionV,
            forceAccidental?: boolean, articulationIds?: ReadonlySet<SymId>, rhythmic?: boolean,
            externalInputState?: InputState | null): Segment | null
        /** C++ changeCRlen(ChordRest*, const TDuration&) and changeCRlen(ChordRest*, const Fraction&, bool) */
        changeCRlen(cr: ChordRest, d: TDuration | Fraction, fillWithRest?: boolean): void
        createCRSequence(f: Fraction, cr: ChordRest, tick: Fraction): void
        makeGap(segment: Segment, track: track_idx_t, sd: Fraction, tuplet: Tuplet | null, keepChord?: boolean): Fraction
        makeGapVoice(seg: Segment, track: track_idx_t, len: Fraction, tick: Fraction): boolean
        splitGapToMeasureBoundaries(cr: ChordRest, gap: Fraction): Fraction[]
        upDown(up: boolean, mode: UpDownMode): void
        upDownDelta(pitchDelta: number): void
        toggleAccidental(at: AccidentalType): void
        applyAccidentalToInputNotes(accidentalType: AccidentalType): void
        changeAccidental(idx: AccidentalType): void
        /** C++ changeAccidental(Note*, AccidentalType) (renamed: no overloads in TS) */
        changeNoteAccidental(note: Note, accidental: AccidentalType): void
        resolveNoteInputParams(noteIdx: number, addFlag: boolean): NoteInputParams | null
        /** C++ cmdAddPitch(const NoteInputParams&, bool, bool) and cmdAddPitch(int note, bool, bool) */
        cmdAddPitch(params: NoteInputParams | number, addFlag: boolean, insert: boolean): void
        cmdIncDecDuration(nSteps: number, stepDotted?: boolean): void
        cmdToggleVisible(): void
        cmdSetVisible(): void
        cmdUnsetVisible(): void
        cmdPitchUp(): void
        cmdPitchDown(): void
        cmdPitchUpOctave(): void
        cmdPitchDownOctave(): void
        addInterval(val: number, nl: readonly Note[]): void
        expandVoice(s?: Segment, track?: track_idx_t): void

    }
}

Score.prototype.startCmd = function (this: Score, actionName: TranslatableString = new TranslatableString()): void {
    if (this.undoStack().isLocked()) {
        return
    }

    if (this.undoStack().hasActiveCommand()) {
        // C++: LOGD("Score::startCmd(): cmd already active")
        return
    }

    MScore.setError(MsError.MS_NO_ERROR)

    this.cmdState().reset()

    // Start collecting low-level undo operations for a
    // user-visible undo action.
    this.undoStack().beginMacro(this, actionName)
}

Score.prototype.undoRedo = function (this: Score, undo: boolean, ed: EditData | null = null): void {
    // TODO(port): readOnly()

    //! NOTE: the order of operations is very important here
    //! 1. for the undo operation, the list of changed elements is available before undo()
    //! 2. for the redo operation, the list of changed elements will be available after redo()
    this.cmdState().reset()
    if (undo) {
        this.undoStack().undo(ed)
    } else {
        this.undoStack().redo(ed)
    }
    // TODO(port): partial layout: the port lays out the whole score after undo/redo (the C++ commands' flip()
    // trigger the layout of the changed range)
    this.setLayoutAll()

    this.update(false)
    this.masterScore().setPlaylistDirty() // TODO: flag all individual operations
    this.updateSelection()

    // TODO(port): changesChannel().send(buildScoreChanges(...)) (the UI relayouts/repaints everything)
}

Score.prototype.endCmd = function (this: Score, rollback = false, layoutAllParts = false): void {
    if (this.undoStack().isLocked()) {
        return
    }

    if (!this.undoStack().hasActiveCommand()) {
        // C++: LOGW() << "no command active"
        this.update()
        return
    }

    if (MScore.errorValue() !== MsError.MS_NO_ERROR && !MScore.errorIsWarning()) {
        rollback = true
    }

    if (rollback) {
        this.undoStack().activeCommand()!.unwind()
    }

    // TODO(port): partial layout: a command that changed something lays out the whole score
    if (!this.undoStack().activeCommand()!.empty()) {
        this.setLayoutAll()
    }

    this.update(false, layoutAllParts)

    const isCurrentCommandEmpty = this.undoStack().activeCommand()!.empty() // nothing to undo?
    this.undoStack().endMacro(isCurrentCommandEmpty)

    if (this.dirty()) {
        this.masterScore().setPlaylistDirty() // TODO: flag individual operations
    }

    this.cmdState().reset()

    // TODO(port): changesChannel().send(changes)
}

Score.prototype.update = function (this: Score, resetCmdState = true, _layoutAllParts = false): void {
    if (this.updatesLocked()) {
        return
    }

    const ms = this.masterScore()
    const cs = ms.cmdState()
    // TODO(port): deletePostponed(), scoreList() (excerpts)
    if (cs.layoutRange()) {
        ms.doLayoutRange(cs.startTick(), cs.endTick())
    }

    if (this.needSetUpTempoMap()) {
        this.setUpTempoMap()
        this.setNeedSetUpTempoMap(false)
    }

    // C++: the views are updated (MuseScoreView::updateAll / dataChanged); the port's UI repaints after a command
    if (resetCmdState) {
        cs.reset()
    }

    const sel = this.selection()
    if (sel.isRange() && !sel.isLocked()) {
        sel.updateSelectedElements()
    }
}

Score.prototype.move = function (this: Score, cmd: string): EngravingItem | null {
    let cr: ChordRest | null = null
    let box: Box | null = null
    if (this.noteEntryMode()) {
        // if selection exists and is grace note, use it
        // otherwise use chord/rest at input position
        // also use it if we are moving to next chord
        // to catch up with the cursor and not move the selection by 2 positions
        cr = this.selection().cr()
        if (cr && (cr.isGrace() || cmd === 'next-chord' || cmd === 'prev-chord')) {
            // keep it
        } else {
            cr = this.inputState().cr()
        }
    } else if (this.selection().activeCR()) {
        cr = this.selection().activeCR()
    } else {
        cr = this.selection().lastChordRest()
    }

    // no chord/rest found? look for another type of element,
    // but commands [empty-trailing-measure] and [top-staff] don't
    // necessarily need an active selection for appropriate functioning
    if (!cr && cmd !== 'empty-trailing-measure' && cmd !== 'top-staff') {
        if (this.selection().elements().length === 0) {
            return null
        }
        // retrieve last element of section list
        let el: EngravingItem | null = this.selection().elements()[this.selection().elements().length - 1]
        let trg: EngravingItem | null = null

        // get parent of element and process accordingly:
        // trg is the element to select on "next-chord" cmd
        // cr is the ChordRest to move from on other cmd's
        const track = el.track() // keep note of element track
        if (!el.isBox()) {
            el = el.parentItem()
        }
        // element with no parent (eg, a newly-added line) - no way to find context
        if (!el) {
            return null
        }
        switch (el.type()) {
        case ElementType.NOTE: // a note is a valid target
            trg = el
            cr = (el as unknown as Note).chord()
            break
        case ElementType.CHORD: // a chord or a rest are valid targets
        case ElementType.REST:
        case ElementType.MMREST:
            trg = el
            cr = trg as unknown as ChordRest
            break
        case ElementType.SEGMENT: { // from segment go to top chordrest in segment
            let seg: Segment | null = el as unknown as Segment
            // if segment is not chord/rest or grace, move to next chord/rest or grace segment
            if (!seg.isChordRestType()) {
                seg = seg.next1(SegmentType.ChordRest)
                if (!seg) { // if none found, return failure
                    return null
                }
            }
            // segment for sure contains chords/rests,
            const size = seg.elist().length
            // if segment has a chord/rest in original element track, use it
            if (track < size && seg.element(track)) {
                trg = seg.element(track)
                cr = trg as unknown as ChordRest
                break
            }
            // if not, get topmost chord/rest
            for (let i = 0; i < size; i++) {
                if (seg.element(i)) {
                    trg = seg.element(i)
                    cr = trg as unknown as ChordRest
                    break
                }
            }
            break
        }
        case ElementType.HBOX:
        case ElementType.VBOX:
        case ElementType.TBOX:
        case ElementType.FBOX:
            box = el as unknown as Box
            break
        default: // on anything else, return failure
            return null
        }

        // if something found and command is forward, the element found is the destination
        if (trg && cmd === 'next-chord') {
            // if chord, go to topmost note
            if (trg.isChord()) {
                trg = (trg as unknown as Chord).upNote()
            }
            this.select(trg, SelectType.SINGLE, 0)
            return trg
        }
        // if no chordrest and no box (frame) found, do nothing
        if (!cr && !box) {
            return null
        }
        // if some chordrest found, continue with default processing
    }

    let el: EngravingItem | null = null
    const is = this.inputState()
    const ois = this.noteEntryMode() ? is.segment() : null
    const oim = ois ? ois.measure() : null

    if (cmd === 'next-chord' && cr) {
        // note input cursor
        if (this.noteEntryMode()) {
            is.moveToNextInputPos()
        }

        // selection "cursor"
        // find next chordrest, which might be a grace note
        // this may override note input cursor
        el = nextChordRest(cr)

        // Skip gap rests if we're not in note entry mode...
        while (!this.noteEntryMode() && el && el.isRest() && (el as unknown as Rest).isGap()) {
            el = nextChordRest(el as unknown as ChordRest)
        }
        if (el && this.noteEntryMode()) {
            // do not use if not in original or new measure (don't skip measures)
            const m = (el as unknown as ChordRest).measure()
            const nis = is.segment()
            const nim = nis ? nis.measure() : null
            if (m !== oim && m !== nim) {
                el = cr
            } else if (cr && nis === cr.segment()) {
                // do not use if new input segment is current cr
                // this means input cursor just caught up to current selection
                el = cr
            }
        } else if (!el) {
            el = cr
        }
    } else if (cmd === 'prev-chord' && cr) {
        // note input cursor
        if (this.noteEntryMode() && is.segment()) {
            const m = is.segment()!.measure()
            let s = is.segment()!.prev1(SegmentType.ChordRest)
            const track = is.track()
            for (; s; s = s.prev1(SegmentType.ChordRest)) {
                if (s.element(track) || (s.measure() !== m && s.rtick().isZero())) {
                    if (s.element(track)) {
                        if (s.element(track)!.isRest() && (s.element(track) as unknown as Rest).isGap()) {
                            continue
                        }
                    }
                    break
                }
            }
            is.moveInputPos(s as unknown as EngravingItem)
        }

        // selection "cursor"
        // find previous chordrest, which might be a grace note
        // this may override note input cursor
        el = prevChordRest(cr)

        // Skip gap rests if we're not in note entry mode...
        while (!this.noteEntryMode() && el && el.isRest() && (el as unknown as Rest).isGap()) {
            el = prevChordRest(el as unknown as ChordRest)
        }
        if (el && this.noteEntryMode()) {
            // do not use if not in original or new measure (don't skip measures)
            const m = (el as unknown as ChordRest).measure()
            const nis = is.segment()
            const nim = nis ? nis.measure() : null
            if (m !== oim && m !== nim) {
                el = cr
            } else if (cr && nis === cr.segment()) {
                // do not use if new input segment is current cr
                // this means input cursor just caught up to current selection
                el = cr
            }
        } else if (!el) {
            el = cr
        }
    } else if (cmd === 'next-measure') {
        const next = box ? box.nextMeasure() : null
        if (next && next.first()) {
            el = next.first()!.nextChordRest(0, false)
        }
        if (cr) {
            el = this.nextMeasure(cr)
        }
        if (el && this.noteEntryMode()) {
            is.moveInputPos(el)
        }
    } else if (cmd === 'prev-measure') {
        const prev = box ? box.prevMeasure() : null
        if (prev && prev.first()) {
            el = prev.first()!.nextChordRest(0, false)
        }
        if (cr) {
            el = this.prevMeasure(cr)
        }
        if (el && this.noteEntryMode()) {
            is.moveInputPos(el)
        }
    } else if (cmd === 'next-track' && cr) {
        el = this.nextTrack(cr)
        if (this.noteEntryMode()) {
            is.moveInputPos(el)
        }
    } else if (cmd === 'prev-track' && cr) {
        el = this.prevTrack(cr)
        if (this.noteEntryMode()) {
            is.moveInputPos(el)
        }
    }
    // TODO(port): next/prev-system, next/prev-frame, next/prev-section, top-staff, empty-trailing-measure

    if (el) {
        if (el.isChord()) {
            el = (el as unknown as Chord).upNote() // originally downNote
        }
        // TODO(port): setPlayNote(true) (playback)
        if (this.noteEntryMode()) {
            // if cursor moved into a gap, selection cannot follow
            // only select & play el if it was not already selected (does not normally happen)
            if (is.cr() || !el.selected()) {
                this.select(el, SelectType.SINGLE, 0)
            }
            // C++: view->moveCursor() (the view draws the cursor at inputState().segment())
        } else {
            this.select(el, SelectType.SINGLE, 0)
        }
    }
    return el
}

Score.prototype.selectMove = function (this: Score, cmd: string): EngravingItem | null {
    let cr: ChordRest | null
    if (this.selection().activeCR()) {
        cr = this.selection().activeCR()
    } else {
        cr = this.selection().lastChordRest()
    }
    if (!cr && this.noteEntryMode()) {
        cr = this.inputState().cr()
    }
    if (!cr) {
        return null
    }

    let el: ChordRest | null = null
    // TODO(port): ChordRestNavigateOptions.skipMeasureRepeatRests = false
    if (cmd === 'select-next-chord') {
        el = nextChordRest(cr, true)
    } else if (cmd === 'select-prev-chord') {
        el = prevChordRest(cr, true)
    } else if (cmd === 'select-next-measure') {
        el = this.nextMeasure(cr, true, true)
    } else if (cmd === 'select-prev-measure') {
        el = this.prevMeasure(cr, true)
    } else if (cmd === 'select-begin-line') {
        const measure = cr.segment().measure().system()!.firstMeasure()
        if (!measure) {
            return null
        }
        el = measure.first()!.nextChordRest(cr.track())
    } else if (cmd === 'select-end-line') {
        const measure = cr.segment().measure().system()!.lastMeasure()
        if (!measure) {
            return null
        }
        el = measure.last()!.nextChordRest(cr.track(), true)
    } else if (cmd === 'select-begin-score') {
        const measure = this.firstMeasureMM()
        if (!measure) {
            return null
        }
        el = measure.first()!.nextChordRest(cr.track())
    } else if (cmd === 'select-end-score') {
        const measure = this.lastMeasureMM()
        if (!measure) {
            return null
        }
        el = measure.last()!.nextChordRest(cr.track(), true)
    } else if (cmd === 'select-staff-above') {
        el = this.upStaff(cr)
    } else if (cmd === 'select-staff-below') {
        el = this.downStaff(cr)
    }
    if (el) {
        this.select(el, SelectType.RANGE, el.staffIdx())
    }
    return el
}
