/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the selection part of the mouse handling of
 * src/notationscene/qml/MuseScore/NotationScene/notationviewinputcontroller.cpp (mousePressEvent and
 * mouseReleaseEvent of a left click without dragging) and the selection key actions of
 * src/notationscene/internal/notationactioncontroller.cpp.
 *
 * TODO(port): dragging (elements, ranges, canvas, lasso), grips, text editing, playback (seek and
 * play), context menu, double/triple click, Alt+click paste.
 */

import { nidx, type staff_idx_t } from '../engraving/types/types'
import { SelectType } from '../engraving/dom/select'
import { ExpandSelectionMode, MoveDirection, MoveSelectionType, NotationInteraction } from '../notation/internal/notationinteraction'
import type { PointF } from '../framework/draw/types/geometry'
import type { EngravingItem } from '../engraving/dom/engravingitem'

export interface KeyboardModifiers {
    shift: boolean
    ctrl: boolean
    alt: boolean
}

export class NotationViewInputController {
    private m_interaction: NotationInteraction

    constructor(interaction: NotationInteraction) {
        this.m_interaction = interaction
    }

    viewInteraction(): NotationInteraction { return this.m_interaction }

    /**
     * a left click (mouse press and release at the same position) at logicPos (canvas coordinates);
     * hitWidth: C++ configuration()->selectionProximity() * 0.5 / currentScaling()
     */
    leftClick(logicPos: PointF, hitWidth: number, modifiers: { shift: boolean; ctrl: boolean }): void {
        const interaction = this.viewInteraction()

        // mousePressEvent
        const hitElement = interaction.hitElement(logicPos, hitWidth)
        const hitStaff = interaction.hitStaff(logicPos)
        const hitStaffIndex = hitStaff ? hitStaff.idx() : nidx

        // note enter mode
        if (interaction.noteInput().isNoteInputMode()) {
            this.handleClickInNoteInputMode(logicPos, modifiers)
            return
        }

        let shouldSelectOnLeftClickRelease = false

        // Drag outgoing: range (the press only starts a possible drag of the range)
        let consumed = false
        if (!hitElement || hitElement.isMeasure()) {
            const selection = interaction.score().selection()
            if (selection.isRange() && interaction.rangeContainsPoint(logicPos)) {
                consumed = true
            }
        }

        if (!consumed) {
            // mousePress_considerSelect
            shouldSelectOnLeftClickRelease = this.mousePressConsiderSelect(logicPos, hitWidth, hitElement, hitStaffIndex, modifiers)
        }

        // mouseReleaseEvent
        if (!modifiers.ctrl && !modifiers.shift) {
            if (!hitElement) {
                interaction.clearSelection()
            }
        }

        // handleLeftClickRelease
        if (!modifiers.ctrl && !modifiers.shift && hitElement && shouldSelectOnLeftClickRelease) {
            interaction.select([hitElement], SelectType.SINGLE, hitStaffIndex)
        }
    }

    /** returns m_shouldSelectOnLeftClickRelease */
    private mousePressConsiderSelect(logicClickPos: PointF, hitWidth: number, hitElement: EngravingItem | null,
        hitStaff: staff_idx_t, modifiers: { shift: boolean; ctrl: boolean }): boolean {
        if (!hitElement) {
            return false
        }

        const interaction = this.viewInteraction()

        if (modifiers.ctrl) {
            const overlappingHitElements = interaction.hitElements(logicClickPos, hitWidth)
            if (overlappingHitElements.length > 1) {
                this.cycleOverlappingHitElements(overlappingHitElements, hitStaff)
                return false
            }
        }

        let selectType = SelectType.SINGLE
        if (modifiers.shift) {
            selectType = SelectType.RANGE
        } else if (modifiers.ctrl) {
            selectType = SelectType.ADD
        } else {
            const selection = interaction.score().selection()

            if (selection.isRange()
                && (interaction.rangeContainsItem(hitElement, hitStaff) || interaction.rangeContainsPoint(logicClickPos))) {
                return true
            } else if (hitElement.selected()) {
                return selection.elements().length > 1
            }
        }

        interaction.select([hitElement], selectType, hitStaff, modifiers.ctrl && !modifiers.shift)
        return false
    }

    private cycleOverlappingHitElements(hitElements: readonly EngravingItem[], hitStaffIndex: staff_idx_t): void {
        const numHitElements = hitElements.length
        let currTop = numHitElements - 1
        let e: EngravingItem | null = hitElements[currTop]
        const selectedAtPosition = new Set<EngravingItem>()
        let found = false

        // e is the topmost element in stacking order,
        // but we want to replace it with "first non-measure element after a selected element"
        // (if such an element exists)
        for (let i = 0; i <= numHitElements; ++i) {
            if (found) {
                e = hitElements[currTop]
                if (!e.isMeasure()) {
                    break
                }
            } else if (hitElements[currTop].selected()) {
                found = true
                selectedAtPosition.add(hitElements[currTop])
                e = null
            }
            currTop = (currTop + 1) % numHitElements
        }

        if (e && !e.selected()) {
            for (const selectedElem of selectedAtPosition) {
                selectedElem.score().deselect(selectedElem)
            }
            this.viewInteraction().select([e], SelectType.ADD, hitStaffIndex, true)
        }
    }

    /** a left click in note input mode puts a note (Shift: replace, Ctrl: insert); TODO(port): right click removes */
    private handleClickInNoteInputMode(logicPos: PointF, modifiers: { shift: boolean; ctrl: boolean }): void {
        // C++ dispatches "put-note" (NotationActionController::putNote)
        this.viewInteraction().noteInput().putNote(logicPos, modifiers.shift, modifiers.ctrl)
    }

    /**
     * the selection key actions of MuseScore's notation view without note input (shortcuts.xml); key like
     * KeyboardEvent.key. Returns true if the key is one of these actions.
     */
    keyAction(key: string, mods: KeyboardModifiers): boolean {
        const interaction = this.viewInteraction()
        const { shift, ctrl, alt } = mods

        switch (key) {
        case 'Escape':
            if (shift || ctrl || alt) {
                return false
            }
            // notation-escape (NotationActionController::resetState)
            if (!interaction.score().selection().isNone()) {
                interaction.clearSelection()
            }
            return true
        case 'a':
        case 'A':
            if (ctrl && !shift && !alt) {
                interaction.selectAll() // notation-select-all
                return true
            }
            return false
        case 'ArrowLeft':
        case 'ArrowRight': {
            const d = key === 'ArrowLeft' ? MoveDirection.Left : MoveDirection.Right
            if (shift && !alt) {
                // select-next/prev-chord, Ctrl: select-next/prev-measure
                interaction.addToSelection(d, ctrl ? MoveSelectionType.Measure : MoveSelectionType.Chord)
                return true
            }
            if (alt && !shift && !ctrl) {
                // next-element/prev-element
                interaction.moveSelection(d, MoveSelectionType.EngravingItem)
                return true
            }
            if (!shift && !alt) {
                // notation-move-right/left, Ctrl: notation-move-right/left-quickly
                this.move(d, ctrl)
                return true
            }
            return false
        }
        case 'ArrowUp':
        case 'ArrowDown': {
            const d = key === 'ArrowUp' ? MoveDirection.Up : MoveDirection.Down
            if (shift && !ctrl && !alt) {
                interaction.addToSelection(d, MoveSelectionType.Track) // select-staff-above/below
                return true
            }
            if (alt && !shift && !ctrl) {
                interaction.moveChordNoteSelection(d) // up-chord/down-chord
                return true
            }
            if (alt && ctrl && !shift) {
                interaction.selectTopOrBottomOfChord(d) // top-chord/bottom-chord
                return true
            }
            if (!shift && !alt && !ctrl && interaction.score().selection().isNone()) {
                // pitch-up/down without a selection (NotationActionController::move)
                return this.move(d, false)
            }
            // TODO(port): pitch-up/down (+ctrl: octave), alt+shift: diatonic, ctrl+shift: move-up/down (editing)
            return false
        }
        case 'Home':
        case 'End': {
            const begin = key === 'Home'
            if (shift) {
                // select-begin/end-line, Ctrl: select-begin/end-score
                interaction.expandSelection(ctrl
                    ? (begin ? ExpandSelectionMode.BeginScore : ExpandSelectionMode.EndScore)
                    : (begin ? ExpandSelectionMode.BeginSystem : ExpandSelectionMode.EndSystem))
                return true
            }
            if (ctrl && !alt) {
                // first-element/last-element
                if (begin) {
                    interaction.selectFirstElement(false)
                } else {
                    interaction.selectLastElement()
                }
                return true
            }
            return false
        }
        default:
            return false
        }
    }

    /** NotationActionController::move (without playback, text and grip editing, note input) */
    private move(direction: MoveDirection, quickly: boolean): boolean {
        const interaction = this.viewInteraction()

        const previousSelectionExists = !!interaction.score().selection().currentCR()
        if (interaction.score().selection().isNone() && previousSelectionExists) {
            // Try to restore the previous selection...
            interaction.moveSelection(direction, MoveSelectionType.EngravingItem)
            return true
        }

        switch (direction) {
        case MoveDirection.Up:
        case MoveDirection.Down:
            if (interaction.score().selection().isNone()) {
                interaction.selectFirstElement(false)
                return true
            }
            // TODO(port): lyrics, nudge, movePitch
            return false
        case MoveDirection.Right:
        case MoveDirection.Left: {
            // TODO(port): nudge text elements, grips
            if (interaction.score().selection().isNone()) {
                interaction.selectFirstElement(false)
            }
            interaction.moveSelection(direction, quickly ? MoveSelectionType.Measure : MoveSelectionType.Chord)
            return true
        }
        default:
            return false
        }
    }
}
