/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the editing and note input actions of src/notationscene/internal/notationactioncontroller.cpp (the action
 * codes of MuseScore's notationuiactions.cpp with their handlers and enabled conditions) and of the checked states of
 * src/notationscene/qml/MuseScore/NotationScene/noteinputbarmodel.cpp (NoteInputBarModel::updateState).
 *
 * The C++ controller registers its handlers in the ActionsDispatcher; here dispatch(code) runs them.
 *
 * TODO(port): playback (seek and play), text/lyrics/grip editing and nudging, tablature (string selection, TAB pad
 * notes), tuplets, slurs, articulations, the other note input methods than by note name and by duration, copy/paste,
 * the dialogs.
 */

import { DurationType, StaffGroup, VoiceAssignment, type voice_idx_t } from '../engraving/types/types'
import { InputState, NoteEntryMethod } from '../engraving/dom/input'
import { Pid } from '../engraving/dom/property'
import { AccidentalType } from '../engraving/dom/accidentaldata'
import { UpDownMode } from '../engraving/dom/mscore'
import { Pad } from '../engraving/dom/score'
import { BracketsType, NoteAddingMode, NoteName } from '../notation/notationtypes'
import { MoveDirection, MoveSelectionType, type NotationInteraction } from '../notation/internal/notationinteraction'
import type { NotationNoteInput } from '../notation/internal/notationnoteinput'
import type { Score } from '../engraving/dom/score'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { ChordRest } from '../engraving/dom/chordrest'

interface ActionEntry {
    run: () => void
    enabled?: () => boolean
}

const UNDO_ACTION_CODE = 'action://notation/undo'
const REDO_ACTION_CODE = 'action://notation/redo'

/** NotationUiActions::actionDurationType */
const DURATION_ACTIONS: ReadonlyMap<string, DurationType> = new Map([
    ['note-longa', DurationType.V_LONG],
    ['note-breve', DurationType.V_BREVE],
    ['pad-note-1', DurationType.V_WHOLE],
    ['pad-note-2', DurationType.V_HALF],
    ['pad-note-4', DurationType.V_QUARTER],
    ['pad-note-8', DurationType.V_EIGHTH],
    ['pad-note-16', DurationType.V_16TH],
    ['pad-note-32', DurationType.V_32ND],
    ['pad-note-64', DurationType.V_64TH],
    ['pad-note-128', DurationType.V_128TH],
    ['pad-note-256', DurationType.V_256TH],
    ['pad-note-512', DurationType.V_512TH],
    ['pad-note-1024', DurationType.V_1024TH],
])

const PAD_NOTE_ACTIONS: readonly [string, Pad][] = [
    ['note-longa', Pad.NOTE00],
    ['note-breve', Pad.NOTE0],
    ['pad-note-1', Pad.NOTE1],
    ['pad-note-2', Pad.NOTE2],
    ['pad-note-4', Pad.NOTE4],
    ['pad-note-8', Pad.NOTE8],
    ['pad-note-16', Pad.NOTE16],
    ['pad-note-32', Pad.NOTE32],
    ['pad-note-64', Pad.NOTE64],
    ['pad-note-128', Pad.NOTE128],
    ['pad-note-256', Pad.NOTE256],
    ['pad-note-512', Pad.NOTE512],
    ['pad-note-1024', Pad.NOTE1024],
    ['pad-dot', Pad.DOT],
    ['pad-dot2', Pad.DOT2],
    ['pad-dot3', Pad.DOT3],
    ['pad-dot4', Pad.DOT4],
    ['pad-rest', Pad.REST],
]

/** NotationUiActions::actionDotCount */
const DOT_ACTIONS: ReadonlyMap<string, number> = new Map([['pad-dot', 1], ['pad-dot2', 2], ['pad-dot3', 3], ['pad-dot4', 4]])

/** NotationUiActions::actionAccidentalType */
const ACCIDENTAL_ACTIONS: ReadonlyMap<string, AccidentalType> = new Map([
    ['flat2', AccidentalType.FLAT2],
    ['flat', AccidentalType.FLAT],
    ['nat', AccidentalType.NATURAL],
    ['sharp', AccidentalType.SHARP],
    ['sharp2', AccidentalType.SHARP2],
])

/** NotationUiActions::actionVoice */
const VOICE_ACTIONS: ReadonlyMap<string, voice_idx_t> = new Map([['voice-1', 0], ['voice-2', 1], ['voice-3', 2], ['voice-4', 3]])

/** NoteInputBarModel NOTE_INPUT_METHOD_ACTIONS (the methods with a port of their note input) */
const NOTE_INPUT_METHOD_ACTIONS: ReadonlyMap<string, NoteEntryMethod> = new Map([
    ['note-input-by-note-name', NoteEntryMethod.BY_NOTE_NAME],
    ['note-input-by-duration', NoteEntryMethod.BY_DURATION],
])

const NOTE_NAMES: readonly [string, NoteName][] = [
    ['c', NoteName.C], ['d', NoteName.D], ['e', NoteName.E], ['f', NoteName.F], ['g', NoteName.G], ['a', NoteName.A],
    ['b', NoteName.B],
]

let s_actionCodes: string[] | null = null

export class NotationActionController {
    private m_interaction: NotationInteraction
    private m_actions = new Map<string, ActionEntry>()

    /** C++ NotationConfiguration::defaultNoteInputMethod() */
    defaultNoteInputMethod = NoteEntryMethod.BY_NOTE_NAME

    constructor(interaction: NotationInteraction) {
        this.m_interaction = interaction
        this.init()
    }

    private init(): void {
        //! NOTE For historical reasons, the name of the action does not match what needs to be done
        this.registerAction('action://notation/cancel', () => this.resetState())

        this.registerAction('note-input', () => this.toggleNoteInput(), () => this.startNoteInputAllowed())
        for (const [code, method] of NOTE_INPUT_METHOD_ACTIONS) {
            this.registerAction(code, () => this.toggleNoteInputMethod(method), () => this.startNoteInputAllowed())
        }

        for (const [code, pad] of PAD_NOTE_ACTIONS) {
            this.registerAction(code, () => this.padNote(pad))
        }

        for (const [n, name] of NOTE_NAMES) {
            this.registerNoteAction(`note-${n}`, name, NoteAddingMode.NextChord)
            this.registerNoteAction(`chord-${n}`, name, NoteAddingMode.CurrentChord)
            this.registerNoteAction(`insert-${n}`, name, NoteAddingMode.InsertChord)
        }

        for (const [code, type] of ACCIDENTAL_ACTIONS) {
            this.registerAction(code, () => this.toggleAccidental(type))
            this.registerAction(`${code}-post`, () => this.interaction().changeAccidental(type))
        }

        this.registerAction('rest', () => this.interaction().putRestToSelection())

        this.registerAction('toggle-visible', () => this.interaction().toggleVisible(), () => this.isToggleVisibleAllowed())

        this.registerAction('notation-move-right', () => this.move(MoveDirection.Right, false))
        this.registerAction('notation-move-left', () => this.move(MoveDirection.Left, false))
        this.registerAction('notation-move-right-quickly', () => this.move(MoveDirection.Right, true), () => this.measureNavigationAvailable())
        this.registerAction('notation-move-left-quickly', () => this.move(MoveDirection.Left, true), () => this.measureNavigationAvailable())
        this.registerAction('pitch-up', () => this.move(MoveDirection.Up, false))
        this.registerAction('pitch-down', () => this.move(MoveDirection.Down, false))
        this.registerAction('pitch-up-octave', () => this.move(MoveDirection.Up, true))
        this.registerAction('pitch-down-octave', () => this.move(MoveDirection.Down, true))
        this.registerAction('up-chord', () => this.moveWithinChord(MoveDirection.Up), () => this.hasSelection())
        this.registerAction('down-chord', () => this.moveWithinChord(MoveDirection.Down), () => this.hasSelection())
        this.registerAction('top-chord', () => this.interaction().selectTopOrBottomOfChord(MoveDirection.Up), () => this.hasSelection())
        this.registerAction('bottom-chord', () => this.interaction().selectTopOrBottomOfChord(MoveDirection.Down), () => this.hasSelection())

        this.registerAction('double-duration', () => this.doubleNoteInputDuration())
        this.registerAction('half-duration', () => this.halveNoteInputDuration())
        this.registerAction('inc-duration-dotted', () => this.interaction().increaseDecreaseDuration(-1, true))
        this.registerAction('dec-duration-dotted', () => this.interaction().increaseDecreaseDuration(1, true))

        this.registerAction('action://notation/delete', () => this.interaction().deleteSelection(), () => this.hasSelection())

        this.registerAction('flip', () => this.interaction().flipSelection(), () => this.hasSelection())
        this.registerAction('tie', () => this.addTie())
        this.registerAction('chord-tie', () => this.chordTie())

        this.registerAction(UNDO_ACTION_CODE, () => this.interaction().undo(), () => this.canUndo())
        this.registerAction(REDO_ACTION_CODE, () => this.interaction().redo(), () => this.canRedo())

        this.registerAction('notation-select-all', () => this.interaction().selectAll())
        this.registerAction('first-element', () => this.interaction().selectFirstElement(false))
        this.registerAction('last-element', () => this.interaction().selectLastElement())

        this.registerAction('pitch-up-diatonic', () => this.movePitchDiatonic(MoveDirection.Up))
        this.registerAction('pitch-down-diatonic', () => this.movePitchDiatonic(MoveDirection.Down))

        for (const [code, voice] of VOICE_ACTIONS) {
            this.registerAction(code, () => this.changeVoice(voice))
        }

        this.registerAction('add-brackets', () => this.interaction().addBracketsToSelection(BracketsType.Brackets))
        this.registerAction('add-parentheses', () => this.interaction().addBracketsToSelection(BracketsType.Parentheses))
        this.registerAction('add-braces', () => this.interaction().addBracketsToSelection(BracketsType.Braces))
    }

    /** the action codes of the controller (independent of a score: the handlers are only registered) */
    static actionCodes(): string[] {
        s_actionCodes ??= new NotationActionController(null as unknown as NotationInteraction).actionCodes()
        return s_actionCodes
    }

    /** the actions that have a checked state (the buttons of the note input toolbar, NoteInputBarModel) */
    static isCheckableAction(code: string): boolean {
        return code === 'note-input' || NOTE_INPUT_METHOD_ACTIONS.has(code) || DOT_ACTIONS.has(code) || DURATION_ACTIONS.has(code)
            || ACCIDENTAL_ACTIONS.has(code) || VOICE_ACTIONS.has(code) || code === 'tie' || code === 'pad-rest'
    }

    interaction(): NotationInteraction { return this.m_interaction }
    private noteInput(): NotationNoteInput { return this.m_interaction.noteInput() }
    private score(): Score { return this.m_interaction.score() }

    /** the action codes this controller handles */
    actionCodes(): string[] { return [...this.m_actions.keys()] }

    isActionAvailable(code: string): boolean { return this.m_actions.has(code) }

    /** C++ canReceiveAction(): the action is registered and enabled */
    canReceiveAction(code: string): boolean {
        if (!this.m_actions.has(code)) {
            return false
        }

        if (code === UNDO_ACTION_CODE) {
            return this.canUndo()
        }

        if (code === REDO_ACTION_CODE) {
            return this.canRedo()
        }

        // Actions other than undo and redo can only be handled when the current
        // notation contains at least one part.
        if (!this.score().parts().length) {
            return false
        }

        return this.m_actions.get(code)!.enabled?.() ?? true
    }

    /** runs the action if it can be received; returns true if it ran */
    dispatch(code: string): boolean {
        if (!this.canReceiveAction(code)) {
            return false
        }
        this.m_actions.get(code)!.run()
        return true
    }

    // ---------------------------------------------------------------------------------
    // the handlers
    // ---------------------------------------------------------------------------------

    private resetState(): void {
        // TODO(port): playback reset
        if (this.noteInput().isNoteInputMode()) {
            this.toggleNoteInput()
            return
        }

        // TODO(port): grip and text editing (endEditElement)
        if (!this.score().selection().isNone()) {
            this.interaction().clearSelection()
        }
    }

    private toggleNoteInput(): void {
        const noteInput = this.noteInput()
        if (noteInput.isNoteInputMode()) {
            noteInput.endNoteInput()
            return
        }

        // If the Braille panel or Note Input toolbar has focus, stay there.
        noteInput.startNoteInput(this.defaultNoteInputMethod, /*focusNotation*/ false)
    }

    private toggleNoteInputMethod(method: NoteEntryMethod): void {
        const noteInput = this.noteInput()
        if (!noteInput.isNoteInputMode()) {
            noteInput.startNoteInput(method)
        } else if (noteInput.usingNoteInputMethod(method)) {
            this.toggleNoteInput()
        } else {
            noteInput.setNoteInputMethod(method)
        }
    }

    private handleNoteAction(note: NoteName, addingMode: NoteAddingMode): void {
        this.startNoteInput()

        const addFlag = addingMode === NoteAddingMode.CurrentChord
        const params = this.score().resolveNoteInputParams(note, addFlag)
        if (!params) {
            // C++: LOGE() << "Could not resolve note input params"
            return
        }

        const noteInput = this.noteInput()

        if (addingMode === NoteAddingMode.NextChord) {
            if (noteInput.usingNoteInputMethod(NoteEntryMethod.BY_DURATION)) {
                noteInput.setRestMode(false)
                noteInput.setInputNote(params)
                // TODO(port): play preview notes
                return
            }
        }

        noteInput.addNote(params, addingMode)
        // TODO(port): seekAndPlaySelectedElement()
    }

    private padNote(pad: Pad): void {
        const interaction = this.interaction()
        const noteInput = this.noteInput()

        if (this.score().selection().isNone()) {
            if (!noteInput.isNoteInputMode() && !this.startNoteInputAllowed()) {
                return
            }

            this.startNoteInput()
        }

        if (pad >= Pad.DOT && pad <= Pad.DOT4) {
            if (!noteInput.isNoteInputMode() || !noteInput.addAccidentalDotsArticulationsToNextNoteEntered) {
                interaction.toggleDotsForSelection(pad)
                return
            }
        }

        noteInput.padNote(pad)
    }

    private toggleAccidental(type: AccidentalType): void {
        const interaction = this.interaction()
        const noteInput = this.noteInput()

        if (this.score().selection().isNone()) {
            if (!noteInput.isNoteInputMode() && !this.startNoteInputAllowed()) {
                return
            }

            this.startNoteInput()
        }

        if (noteInput.isNoteInputMode() && noteInput.addAccidentalDotsArticulationsToNextNoteEntered) {
            noteInput.setAccidental(type)
        } else {
            interaction.toggleAccidentalForSelection(type)
        }
    }

    private doubleNoteInputDuration(): void {
        if (this.noteInput().isNoteInputMode()) {
            this.noteInput().doubleNoteInputDuration()
        } else {
            this.interaction().increaseDecreaseDuration(-1, false)
        }
    }

    private halveNoteInputDuration(): void {
        if (this.noteInput().isNoteInputMode()) {
            this.noteInput().halveNoteInputDuration()
        } else {
            this.interaction().increaseDecreaseDuration(1, false)
        }
    }

    private move(direction: MoveDirection, quickly: boolean): void {
        const interaction = this.interaction()

        const previousSelectionExists = !!this.score().selection().currentCR()
        if (this.score().selection().isNone() && previousSelectionExists) {
            // Try to restore the previous selection...
            interaction.moveSelection(direction, MoveSelectionType.EngravingItem)
            return
        }

        const noteInput = this.noteInput()

        switch (direction) {
        case MoveDirection.Up:
        case MoveDirection.Down:
            // TODO(port): lyrics (moveLyrics), nudge text and articulations, grips
            if (noteInput.isNoteInputMode() && noteInput.usingNoteInputMethod(NoteEntryMethod.BY_DURATION)) {
                this.moveInputNotes(direction === MoveDirection.Up, quickly ? UpDownMode.OCTAVE : UpDownMode.DIATONIC)
                return
            } else if (noteInput.isNoteInputMode() && noteInput.state().staffGroup() === StaffGroup.TAB) {
                if (quickly) {
                    interaction.movePitch(direction, UpDownMode.OCTAVE)
                }
                interaction.moveSelection(direction, MoveSelectionType.String)
                return
            } else if (this.score().selection().isNone()) {
                interaction.selectFirstElement(false)
            } else {
                interaction.movePitch(direction, quickly ? UpDownMode.OCTAVE : UpDownMode.CHROMATIC)
            }
            break
        case MoveDirection.Right:
        case MoveDirection.Left:
            // TODO(port): playback (seek beat), text navigation, nudge text, grips
            if (this.score().selection().isNone()) {
                interaction.selectFirstElement(false)
            }
            interaction.moveSelection(direction, quickly ? MoveSelectionType.Measure : MoveSelectionType.Chord)
            break
        case MoveDirection.Undefined:
            break
        }
    }

    private moveInputNotes(up: boolean, mode: UpDownMode): void {
        this.noteInput().setRestMode(false)
        this.noteInput().moveInputNotes(up, mode)
    }

    private movePitchDiatonic(direction: MoveDirection): void {
        const noteInput = this.noteInput()
        if (noteInput.isNoteInputMode() && noteInput.usingNoteInputMethod(NoteEntryMethod.BY_DURATION)) {
            this.moveInputNotes(direction === MoveDirection.Up, UpDownMode.DIATONIC)
            return
        }

        this.interaction().movePitch(direction, UpDownMode.DIATONIC)
    }

    private moveWithinChord(direction: MoveDirection): void {
        this.interaction().moveChordNoteSelection(direction)
    }

    private changeVoice(voiceIndex: voice_idx_t): void {
        const interaction = this.interaction()
        const noteInput = this.noteInput()

        if (this.score().selection().isNone()) {
            if (!noteInput.isNoteInputMode() && !this.startNoteInputAllowed()) {
                return
            }

            this.startNoteInput()
        }

        noteInput.setCurrentVoice(voiceIndex)

        if (!noteInput.isNoteInputMode()) {
            interaction.changeSelectedElementsVoice(voiceIndex)
        }
    }

    private addTie(): void {
        const noteInput = this.noteInput()
        if (noteInput.isNoteInputMode()) {
            noteInput.addTie()
        } else {
            this.interaction().addTieToSelection()
        }
    }

    private chordTie(): void {
        const noteInput = this.noteInput()
        if (noteInput.isNoteInputMode()) {
            noteInput.addTie() // C++ NotationNoteInput::addTie() is also used for chord-tie in note input
        } else {
            this.interaction().addTiedNoteToChord()
        }
    }

    // ---------------------------------------------------------------------------------
    // enabled conditions
    // ---------------------------------------------------------------------------------

    /** C++ also requires the notation (or the note input toolbar) to have the focus */
    startNoteInputAllowed(): boolean {
        return !this.isEditingElement()
    }

    private startNoteInput(): void {
        this.noteInput().startNoteInput(this.defaultNoteInputMethod)
    }

    isNoteInputMode(): boolean { return this.noteInput().isNoteInputMode() }
    hasSelection(): boolean { return !this.score().selection().isNone() }
    canUndo(): boolean { return this.interaction().undoStack().canUndo() }
    canRedo(): boolean { return this.interaction().undoStack().canRedo() }

    /** TODO(port): element, grip and text editing; drag */
    private isEditingElement(): boolean { return false }

    private isToggleVisibleAllowed(): boolean {
        return true // TODO(port): !isTextEditingStarted()
    }

    private measureNavigationAvailable(): boolean {
        return true // TODO(port): isNotEditingElement() || textNavigationAvailable()
    }

    private noteInputActionAllowed(): boolean {
        if (!this.isNoteInputMode() && !this.startNoteInputAllowed()) {
            return false
        }

        return !this.isTablatureStaff()
    }

    private isTablatureStaff(): boolean {
        return this.score().inputState().staffGroup() === StaffGroup.TAB
    }

    // ---------------------------------------------------------------------------------
    // checked states (NoteInputBarModel::updateState)
    // ---------------------------------------------------------------------------------

    isActionChecked(code: string): boolean {
        if (!this.score().parts().length) { // C++ isInputAllowed()
            return false
        }

        const is = this.score().inputState()

        if (code === 'note-input') {
            return this.isNoteInputMode()
        }

        const method = NOTE_INPUT_METHOD_ACTIONS.get(code)
        if (method !== undefined) {
            return this.isNoteInputMode() && is.noteEntryMethod() === method
        }

        const dots = DOT_ACTIONS.get(code)
        if (dots !== undefined) {
            return is.duration().dots() === dots
        }

        const durationType = DURATION_ACTIONS.get(code)
        if (durationType !== undefined) {
            return this.resolveCurrentDurationType() === durationType
        }

        const accidentalType = ACCIDENTAL_ACTIONS.get(code)
        if (accidentalType !== undefined) {
            return is.accidentalType() === accidentalType
        }

        const voice = VOICE_ACTIONS.get(code)
        if (voice !== undefined) {
            return this.resolveCurrentVoiceIndex() === voice
        }

        switch (code) {
        case 'tie': {
            const tiedNotes = this.score().cmdTieNoteList(this.score().selection(), false)
            let checked = tiedNotes.length > 0
            for (const note of tiedNotes) {
                if (!note.tieFor() || note.laissezVib()) {
                    checked = false
                    break
                }
            }
            return checked
        }
        case 'pad-rest':
            return this.resolveRestSelected()
        default:
            return false
        }
    }

    private resolveCurrentVoiceIndex(): number {
        const INVALID_VOICE = -1

        if (this.isNoteInputMode()) {
            return this.score().inputState().voice()
        }

        const selection = this.score().selection()
        if (selection.isNone()) {
            return INVALID_VOICE
        }

        const selectedElements = selection.elements()
        if (!selectedElements.length) {
            return INVALID_VOICE
        }

        let voice = INVALID_VOICE
        for (const element of selectedElements) {
            if (element.hasVoiceAssignmentProperties()) {
                const voiceAssignment = element.getProperty(Pid.VOICE_ASSIGNMENT)
                if (voiceAssignment === VoiceAssignment.ALL_VOICE_IN_INSTRUMENT || voiceAssignment === VoiceAssignment.ALL_VOICE_IN_STAFF) {
                    return INVALID_VOICE
                }
            }
            const elementVoice = element.voice()
            if (elementVoice !== voice && voice !== INVALID_VOICE) {
                return INVALID_VOICE
            }

            voice = element.voice()
        }

        return voice
    }

    private resolveRestSelected(): boolean {
        if (this.isNoteInputMode()) {
            return this.score().inputState().rest()
        }

        const selection = this.score().selection()
        if (selection.isNone() || selection.isRange()) {
            return false
        }

        return selection.elements().every(e => e.isRest())
    }

    private resolveCurrentDurationType(): DurationType {
        const INVALID_DURATION_TYPE = DurationType.V_INVALID

        if (this.isNoteInputMode()) {
            return this.score().inputState().duration().type()
        }

        const selection = this.score().selection()
        if (selection.isNone() || selection.isRange()) {
            return INVALID_DURATION_TYPE
        }

        const selectedElements = selection.elements()
        if (!selectedElements.length) {
            return INVALID_DURATION_TYPE
        }

        let result = INVALID_DURATION_TYPE
        let isFirstElement = true
        for (const element of selectedElements) {
            const chordRest = elementToChordRest(element)
            if (!chordRest) {
                continue
            }

            if (isFirstElement) {
                result = chordRest.durationType().type()
                isFirstElement = false
            } else if (result !== chordRest.durationType().type()) {
                return INVALID_DURATION_TYPE
            }
        }

        return result
    }

    private registerAction(code: string, run: () => void, enabled?: () => boolean): void {
        this.m_actions.set(code, { run, enabled })
    }

    private registerNoteAction(code: string, noteName: NoteName, addingMode: NoteAddingMode): void {
        this.registerAction(code, () => this.handleNoteAction(noteName, addingMode), () => this.noteInputActionAllowed())
    }
}

/** NoteInputBarModel::elementToChordRest */
function elementToChordRest(element: EngravingItem | null): ChordRest | null {
    return InputState.chordRest(element)
}

