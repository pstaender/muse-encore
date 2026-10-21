/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/undo.h/.cpp
 *
 * The undo system requires calling startCmd() when starting a GUI command and calling endCmd() when ending the
 * command. All changes to a score in response to a GUI command must be undoable/redoable by executing a sequence of
 * low-level undo operations. This sequence is built by the code handling the command, by calling one or more
 * Score.undo(cmd) between startCmd() and endCmd().
 *
 * There are no destructors: cleanup() is kept (it only releases references here, the garbage collector deletes).
 */

import { Fraction } from '../types/fraction'
import { ElementType, nidx, type staff_idx_t } from '../types/types'
import { TranslatableString } from '../../framework/global/types/translatablestring'
import type { Pid } from '../dom/property'
import type { Sid } from '../style/styledef'
import type { EngravingObject } from '../dom/engravingobject'
import type { EngravingItem } from '../dom/engravingitem'
import type { Score } from '../dom/score'
import type { Selection } from '../dom/select'
import type { InputState } from '../dom/input'
import type { Chord } from '../dom/chord'
import type { Note } from '../dom/note'
import type { EditData } from './editdata'

export enum CommandType {
    Unknown = -1,

    // Parts
    InsertPart,
    RemovePart,
    AddPartToExcerpt,
    SetSoloist,
    ChangePart,

    // Staves
    InsertStaff,
    RemoveStaff,
    AddSystemObjectStaff,
    RemoveSystemObjectStaff,
    SortStaves,
    ChangeStaff,
    ChangeStaffType,

    // MStaves
    InsertMStaff,
    RemoveMStaff,
    InsertStaves,
    RemoveStaves,
    ChangeMStaffProperties,
    ChangeMStaffHideIfEmpty,

    // Instruments
    ChangeInstrumentShort,
    ChangeInstrumentLong,
    ChangeInstrument,
    ChangeDrumset,

    // Measures
    RemoveMeasures,
    InsertMeasures,
    ChangeMeasureLen,
    ChangeMMRest,
    ChangeMeasureRepeatCount,

    // Elements
    AddElement,
    RemoveElement,
    Unlink,
    Link,
    ChangeElement,
    ChangeParent,

    // Notes
    ChangePitch,
    ChangeFretting,
    ChangeVelocity,

    // ChordRest
    ChangeChordStaffMove,
    SwapCR,
    AddNoteParenthesesInfo,
    RemoveNoteParenthesesInfo,
    RemoveSingleNoteParentheses,

    // Brackets
    RemoveBracket,
    AddBracket,

    // Fret
    FretDataChange,
    FretDot,
    FretMarker,
    FretBarre,
    FretClear,
    AddFretDiagramToFretBox,
    RemoveFretDiagramFromFretBox,

    // Harmony
    TransposeHarmony,

    // KeySig
    ChangeKeySig,

    // Clef
    ChangeClefType,

    // Tremolo
    MoveTremolo,

    // Spanners
    ChangeSpannerElements,
    InsertTimeUnmanagedSpanner,
    ChangeStartEndSpanner,

    // Ties
    ChangeTieEndPointActive,

    // Style
    ChangeStyle,
    ChangeStyleValues,

    // Property
    ChangeProperty,

    // Voices
    ExchangeVoice,
    CloneVoice,

    // Excerpts
    AddExcerpt,
    RemoveExcerpt,
    SwapExcerpt,
    ChangeExcerptTitle,

    // Meta info
    ChangeMetaInfo,

    // Text
    TextEdit,

    // Other
    InsertTime,
    ChangeScoreOrder,
}

const COMMAND_TYPE_INVERSION = new Map<CommandType, CommandType>([
    [CommandType.AddElement, CommandType.RemoveElement],
    [CommandType.RemoveElement, CommandType.AddElement],

    [CommandType.AddBracket, CommandType.RemoveBracket],
    [CommandType.RemoveBracket, CommandType.AddBracket],

    [CommandType.AddExcerpt, CommandType.RemoveExcerpt],
    [CommandType.RemoveExcerpt, CommandType.AddExcerpt],

    [CommandType.AddSystemObjectStaff, CommandType.RemoveSystemObjectStaff],
    [CommandType.RemoveSystemObjectStaff, CommandType.AddSystemObjectStaff],

    [CommandType.InsertMeasures, CommandType.RemoveMeasures],
    [CommandType.RemoveMeasures, CommandType.InsertMeasures],

    [CommandType.InsertStaff, CommandType.RemoveStaff],
    [CommandType.RemoveStaff, CommandType.InsertStaff],

    [CommandType.InsertPart, CommandType.RemovePart],
    [CommandType.RemovePart, CommandType.InsertPart],

    [CommandType.Link, CommandType.Unlink],
    [CommandType.Unlink, CommandType.Link],

    [CommandType.AddNoteParenthesesInfo, CommandType.RemoveNoteParenthesesInfo],
    [CommandType.RemoveNoteParenthesesInfo, CommandType.AddNoteParenthesesInfo],
])

export function compoundObjects(object: EngravingObject): EngravingObject[] {
    const objects: EngravingObject[] = []

    if (object.isChord()) {
        const chord = object as unknown as Chord
        for (const note of chord.notes()) {
            for (const compoundNote of note.compoundNotes()) {
                objects.push(compoundNote)
            }
        }
    } else if (object.isNote()) {
        const note = object as unknown as Note
        for (const compoundNote of note.compoundNotes()) {
            objects.push(compoundNote)
        }
    } else if (object.isFretDiagram()) {
        const harmony = (object as unknown as { harmony(): EngravingObject | null }).harmony()
        if (harmony) {
            objects.push(harmony)
        }
    }

    objects.push(object)

    return objects
}

/** C++ updateStaffTextCache(): capo and swing are playback data (not ported) */
export function updateStaffTextCache(_text: EngravingItem, _score: Score): void {
    // TODO(port): Score::updateCapo(), Score::updateSwing() (playback)
}

export enum UndoCommandFilter {
    TextEdit,
    AddElement,
    AddElementLinked,
    Link,
    RemoveElement,
    RemoveElementLinked,
    ChangePropertyLinked,
}

export class UndoCommand {
    static readonly Filter = UndoCommandFilter

    private m_childCommands: UndoCommand[] = []

    undo(ed: EditData | null): void {
        for (let i = this.m_childCommands.length - 1; i >= 0; --i) {
            this.m_childCommands[i].undo(ed)
        }
        this.flip(ed)
    }

    redo(ed: EditData | null): void {
        for (const c of this.m_childCommands) {
            c.redo(ed)
        }
        this.flip(ed)
    }

    appendChild(cmd: UndoCommand): void { this.m_childCommands.push(cmd) }
    removeChild(): UndoCommand | undefined { return this.m_childCommands.pop() }
    childCount(): number { return this.m_childCommands.length }

    unwind(): void {
        while (this.m_childCommands.length) {
            const c = this.m_childCommands.pop()!
            c.undo(null)
        }
    }

    commands(): readonly UndoCommand[] { return this.m_childCommands }
    objectItems(): EngravingObject[] { return [] }

    cleanup(undo: boolean): void {
        for (const c of this.m_childCommands) {
            c.cleanup(undo)
        }
    }

    name(): string { return 'UndoCommand' }
    type(): CommandType { return CommandType.Unknown }

    isFiltered(_f: UndoCommandFilter, _target: EngravingItem): boolean { return false }

    hasFilteredChildren(f: UndoCommandFilter, target: EngravingItem): boolean {
        return this.m_childCommands.some(cmd => cmd.isFiltered(f, target))
    }

    hasUnfilteredChildren(filters: readonly UndoCommandFilter[], target: EngravingItem): boolean {
        return this.m_childCommands.some(cmd => !filters.some(f => cmd.isFiltered(f, target)))
    }

    filterChildren(f: UndoCommandFilter, target: EngravingItem): void {
        this.m_childCommands = this.m_childCommands.filter(cmd => !cmd.isFiltered(f, target))
    }

    protected flip(_ed: EditData | null): void {}

    /**
     * Append children of other into this UndoCommand. Ownership over child commands of other is transferred to
     * this UndoCommand.
     */
    protected appendChildren(other: UndoCommand): void {
        this.m_childCommands.push(...other.m_childCommands)
        other.m_childCommands = []
    }
}

// ---------------------------------------------------------
//   UndoMacro
//    A root element for undo macro which is stored
//    directly in UndoStack
// ---------------------------------------------------------

export class SelectionInfo {
    elements: EngravingItem[] = []
    tickStart = new Fraction(0, 1)
    tickEnd = new Fraction(0, 1)
    staffStart: staff_idx_t = nidx
    staffEnd: staff_idx_t = nidx

    isValid(): boolean { return this.elements.length > 0 || this.staffStart !== nidx }

    clone(): SelectionInfo {
        const c = new SelectionInfo()
        c.elements = [...this.elements]
        c.tickStart = this.tickStart
        c.tickEnd = this.tickEnd
        c.staffStart = this.staffStart
        c.staffEnd = this.staffEnd
        return c
    }
}

export interface ChangesInfo {
    changedObjectTypes: Set<ElementType>
    changedObjects: Map<EngravingObject, Set<CommandType>>
    changedStyleIdSet: Set<Sid>
    changedPropertyIdSet: Set<Pid>
    isTextEditing: boolean
}

export class UndoMacro extends UndoCommand {
    static readonly SelectionInfo = SelectionInfo

    private m_undoInputState: InputState
    private m_redoInputState: InputState
    private m_undoSelectionInfo = new SelectionInfo()
    private m_redoSelectionInfo = new SelectionInfo()
    private m_actionName: TranslatableString
    private m_score: Score

    constructor(s: Score, actionName: TranslatableString) {
        super()
        this.m_undoInputState = s.inputState().clone()
        this.m_redoInputState = s.inputState().clone()
        this.m_actionName = actionName
        this.m_score = s
        UndoMacro.fillSelectionInfo(this.m_undoSelectionInfo, s.selection())
    }

    static canRecordSelectedElement(e: EngravingItem): boolean {
        if (e.generated()) {
            return false
        }

        return e.isNote() || (e.isChordRest() && !e.isChord())
            || (e.isTextBase() && !e.isInstrumentName() && !e.isHammerOnPullOffText())
            || e.isFretDiagram() || e.isSoundFlag()
    }

    private static fillSelectionInfo(info: SelectionInfo, sel: Selection): void {
        info.staffStart = info.staffEnd = nidx
        info.elements = []

        if (sel.isList()) {
            for (const e of sel.elements()) {
                if (UndoMacro.canRecordSelectedElement(e)) {
                    info.elements.push(e)
                } else {
                    // don't remember selection we are unable to restore
                    info.elements = []
                    return
                }
            }
        } else if (sel.isRange()) {
            info.staffStart = sel.staffStart()
            info.staffEnd = sel.staffEnd()
            info.tickStart = sel.tickStart()
            info.tickEnd = sel.tickEnd()
        }
    }

    private static applySelectionInfo(info: SelectionInfo, sel: Selection): void {
        if (info.elements.length) {
            for (const e of info.elements) {
                sel.add(e)
            }
        } else if (info.staffStart !== nidx) {
            sel.setRangeTicks(info.tickStart, info.tickEnd, info.staffStart, info.staffEnd)
        }
    }

    override undo(ed: EditData | null): void {
        this.m_redoInputState = this.m_score.inputState().clone()
        UndoMacro.fillSelectionInfo(this.m_redoSelectionInfo, this.m_score.selection())
        this.m_score.deselectAll()

        // Undo for child commands.
        super.undo(ed)

        this.m_score.setInputState(this.m_undoInputState)
        if (this.m_undoSelectionInfo.isValid()) {
            this.m_score.deselectAll()
            UndoMacro.applySelectionInfo(this.m_undoSelectionInfo, this.m_score.selection())
        }
    }

    override redo(ed: EditData | null): void {
        this.m_undoInputState = this.m_score.inputState().clone()
        UndoMacro.fillSelectionInfo(this.m_undoSelectionInfo, this.m_score.selection())
        this.m_score.deselectAll()

        // Redo for child commands.
        super.redo(ed)

        this.m_score.setInputState(this.m_redoInputState)
        if (this.m_redoSelectionInfo.isValid()) {
            this.m_score.deselectAll()
            UndoMacro.applySelectionInfo(this.m_redoSelectionInfo, this.m_score.selection())
        }
    }

    empty(): boolean { return this.childCount() === 0 }

    append(other: UndoMacro): void {
        this.appendChildren(other)
        if (this.m_score === other.m_score) {
            this.m_redoInputState = other.m_redoInputState
            this.m_redoSelectionInfo = other.m_redoSelectionInfo
        }
    }

    undoInputState(): InputState { return this.m_undoInputState }
    redoInputState(): InputState { return this.m_redoInputState }
    undoSelectionInfo(): SelectionInfo { return this.m_undoSelectionInfo }
    redoSelectionInfo(): SelectionInfo { return this.m_redoSelectionInfo }

    excludeElementFromSelectionInfo(element: EngravingItem): void {
        if (this.m_undoSelectionInfo.isValid()) {
            this.m_undoSelectionInfo.elements = this.m_undoSelectionInfo.elements.filter(e => e !== element)
        }
        if (this.m_redoSelectionInfo.isValid()) {
            this.m_redoSelectionInfo.elements = this.m_redoSelectionInfo.elements.filter(e => e !== element)
        }
    }

    changesInfo(undo = false): ChangesInfo {
        const result: ChangesInfo = {
            changedObjectTypes: new Set(),
            changedObjects: new Map(),
            changedStyleIdSet: new Set(),
            changedPropertyIdSet: new Set(),
            isTextEditing: false,
        }

        for (const command of this.commands()) {
            let type = command.type()

            if (type === CommandType.ChangeProperty) {
                result.changedPropertyIdSet.add((command as unknown as { getId(): Pid }).getId())
            } else if (type === CommandType.ChangeStyleValues || type === CommandType.ChangeStyle) {
                for (const sid of (command as unknown as { changedIds(): Iterable<Sid> }).changedIds()) {
                    result.changedStyleIdSet.add(sid)
                }
            } else if (type === CommandType.TextEdit) {
                // TextEditUndoCommand (textedit.ts)
                result.isTextEditing ||= (command as unknown as { cursor(): { editing(): boolean } }).cursor().editing()
            }

            if (undo) {
                type = COMMAND_TYPE_INVERSION.get(type) ?? type
            }

            for (const object of command.objectItems()) {
                if (!object) {
                    continue
                }
                result.changedObjectTypes.add(object.type())
                let s = result.changedObjects.get(object)
                if (!s) {
                    s = new Set()
                    result.changedObjects.set(object, s)
                }
                s.add(type)
            }
        }

        return result
    }

    actionName(): TranslatableString { return this.m_actionName }

    override name(): string { return 'UndoMacro' }
}

// ---------------------------------------------------------
//   UndoStack
// ---------------------------------------------------------

export class UndoStack {
    private m_activeCommand: UndoMacro | null = null
    private m_macroList: UndoMacro[] = []
    private m_stateList: number[] = []
    private m_nextState = 0
    private m_cleanState = 0
    private m_currentIndex = 0
    private m_isLocked = false

    constructor() {
        this.m_stateList.push(this.m_cleanState)
        this.m_nextState = 1
    }

    isLocked(): boolean { return this.m_isLocked }
    setLocked(locked: boolean): void { this.m_isLocked = locked }

    hasActiveCommand(): boolean { return this.m_activeCommand !== null }

    beginMacro(score: Score, actionName: TranslatableString = new TranslatableString()): void {
        if (this.m_isLocked) {
            return
        }

        if (this.m_activeCommand) {
            // C++: LOGW("already active")
            return
        }
        this.m_activeCommand = new UndoMacro(score, actionName)
    }

    endMacro(rollback: boolean): void {
        if (this.m_isLocked) {
            return
        }

        if (!this.m_activeCommand) {
            // C++: LOGW("not active")
            return
        }
        if (!rollback) {
            // remove redo stack
            while (this.m_macroList.length > this.m_currentIndex) {
                const cmd = this.m_macroList.pop()!
                this.m_stateList.pop()
                cmd.cleanup(false) // delete elements for which UndoCommand() holds ownership
            }
            this.m_macroList.push(this.m_activeCommand)
            this.m_stateList.push(this.m_nextState++)
            ++this.m_currentIndex
        }
        this.m_activeCommand = null
    }

    pushAndPerform(cmd: UndoCommand, ed: EditData | null): void {
        if (!this.m_activeCommand) {
            // this can happen for layout() outside of a command (load)
            cmd.redo(ed)
            return
        }
        this.m_activeCommand.appendChild(cmd)
        cmd.redo(ed)
    }

    pushWithoutPerforming(cmd: UndoCommand): void {
        if (!this.m_activeCommand) {
            return
        }
        this.m_activeCommand.appendChild(cmd)
    }

    pop(): void {
        if (!this.m_activeCommand) {
            return
        }
        const cmd = this.m_activeCommand.removeChild()
        cmd?.undo(null)
    }

    canUndo(): boolean { return this.m_currentIndex > 0 }
    canRedo(): boolean { return this.m_currentIndex < this.m_macroList.length }
    isClean(): boolean { return this.m_cleanState === this.m_stateList[this.m_currentIndex] }
    /** C++ sets the clean state through the project (EngravingProject::setSaved -> MasterScore::setSaved) */
    setClean(): void { this.m_cleanState = this.m_stateList[this.m_currentIndex] }
    /**
     * No state is clean until the next setClean(): C++ keeps this in the project (NotationProject::markAsUnsaved,
     * m_hasNonUndoStackChanges), e.g. for a new score or a restored autosave.
     */
    setUnclean(): void { this.m_cleanState = -1 }

    size(): number { return this.m_macroList.length }
    currentIndex(): number { return this.m_currentIndex }

    activeCommand(): UndoMacro | null { return this.m_activeCommand }

    last(): UndoMacro | null { return this.m_currentIndex > 0 ? this.m_macroList[this.m_currentIndex - 1] : null }
    prev(): UndoMacro | null { return this.m_currentIndex > 1 ? this.m_macroList[this.m_currentIndex - 2] : null }
    next(): UndoMacro | null { return this.canRedo() ? this.m_macroList[this.m_currentIndex] : null }

    /** Returns the command that led to the state with the given `idx`. */
    lastAtIndex(idx: number): UndoMacro | null {
        return idx > 0 && idx - 1 < this.m_macroList.length ? this.m_macroList[idx - 1] : null
    }

    undo(ed: EditData | null): void {
        // Are we currently editing text?
        if (ed && ed.element && ed.element.isTextBase()) {
            const ted = ed.getData(ed.element) as { startUndoIdx?: number } | null // TextEditData (textedit.ts)
            if (ted && ted.startUndoIdx !== undefined && ted.startUndoIdx === this.m_currentIndex) {
                // No edits to undo, so do nothing
                return
            }
        }
        if (this.m_currentIndex) {
            --this.m_currentIndex
            this.m_macroList[this.m_currentIndex].undo(ed)
        }
    }

    redo(ed: EditData | null): void {
        if (this.canRedo()) {
            this.m_macroList[this.m_currentIndex++].redo(ed)
        }
    }

    reopen(): void {
        if (this.m_isLocked) {
            return
        }

        --this.m_currentIndex
        this.m_activeCommand = this.m_macroList.splice(this.m_currentIndex, 1)[0]
        this.m_stateList.splice(this.m_currentIndex, 1)
    }

    mergeCommands(startIdx: number): void {
        if (startIdx >= this.m_macroList.length) {
            return
        }

        const startMacro = this.m_macroList[startIdx]

        for (let idx = startIdx + 1; idx < this.m_currentIndex; ++idx) {
            startMacro.append(this.m_macroList[idx])
        }
        this.remove(startIdx + 1) // TODO: remove from startIdx to curIdx only
    }

    cleanRedoStack(): void { this.remove(this.m_currentIndex) }

    private remove(idx: number): void {
        // remove redo stack
        while (this.m_macroList.length > this.m_currentIndex) {
            const cmd = this.m_macroList.pop()!
            this.m_stateList.pop()
            cmd.cleanup(false) // delete elements for which UndoCommand() holds ownership
        }
        while (this.m_macroList.length > idx) {
            const cmd = this.m_macroList.pop()!
            this.m_stateList.pop()
            cmd.cleanup(true)
        }
        this.m_currentIndex = idx
    }
}
