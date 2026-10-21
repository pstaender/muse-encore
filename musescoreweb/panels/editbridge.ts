/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The score changes the panels request (applying a palette cell, changing a property in the Properties panel,
 * the instrument commands of the Layout panel). All of them go through this module, so the panels do not depend on
 * how editing is implemented: the undo stack and the editing commands are ported separately.
 *
 * TODO(port): every function here is a stub until the library provides the editing commands (undo stack,
 * Score::cmdAddPaletteElement / applyPaletteElement, EngravingItem::undoChangeProperty, the NotationParts commands).
 * A stub returns false (nothing changed) and the UI disables the controls for which `canEdit*()` is false.
 */
import type { MasterScore } from '../../src/index'
import { scoreContentChanged } from '../scoreview'

/** true once the library can change scores (then the stubs below are replaced by the real calls) */
export const EDITING_AVAILABLE = false

/** to be called after a successful change: relayout and repaint of the view, refresh of the panels */
export function scoreChanged(): void {
    // TODO(port): relayout (the editing port will provide the score update after a command, like
    // NotationInteraction's notifyAboutNotationChanged); for now the view only repaints
    scoreContentChanged()
}

// ---------------------------------------------------------------------------------
//   palettes (PaletteCellModel / Palette::applyPaletteElement)
// ---------------------------------------------------------------------------------

/** the palette element can be applied to the score's selection (Palette::applyPaletteElement needs a selection) */
export function canApplyPaletteElement(score: MasterScore | null): boolean {
    return EDITING_AVAILABLE && !!score
}

/**
 * Applies a palette cell's element to the selection (Palette::applyPaletteElement with the keyboard modifiers:
 * shift = range/all staves behaviour). `element` is the cell's element as the palette library returns it.
 */
export function applyPaletteElement(_score: MasterScore, _element: unknown, _modifiers: { shift: boolean; ctrl: boolean } = { shift: false, ctrl: false }): boolean {
    // TODO(port): applyPaletteElement(score, element) of the library (editing port)
    return false
}

// ---------------------------------------------------------------------------------
//   Properties panel (AbstractInspectorModel::onPropertyValueChanged -> EngravingItem::undoChangeProperty)
// ---------------------------------------------------------------------------------

export function canChangeProperties(score: MasterScore | null): boolean {
    return EDITING_AVAILABLE && !!score
}

/**
 * Sets a property (Pid number) of all selected elements of the property's element types; value as the library's
 * property value (number, boolean, string, or the library's value types). Returns true if something changed.
 */
export function changeSelectionProperty(_score: MasterScore, _pid: number, _value: unknown): boolean {
    // TODO(port): changeSelectionProperty(score, pid, value) of the library (undoChangeProperty in one undo command)
    return false
}

/** "Reset" of a property: back to its style value or default (EngravingItem::undoResetProperty) */
export function resetSelectionProperty(_score: MasterScore, _pid: number): boolean {
    // TODO(port): resetSelectionProperty(score, pid) of the library
    return false
}

// ---------------------------------------------------------------------------------
//   Layout panel (LayoutPanelTreeModel -> INotationParts)
// ---------------------------------------------------------------------------------

export function canEditParts(score: MasterScore | null): boolean {
    return EDITING_AVAILABLE && !!score
}

/** INotationParts::setPartVisible */
export function setPartVisible(_score: MasterScore, _partId: string, _visible: boolean): boolean {
    // TODO(port): NotationParts::setPartVisible
    return false
}

/** INotationParts::setStaffVisible */
export function setStaffVisible(_score: MasterScore, _staffIndex: number, _visible: boolean): boolean {
    // TODO(port): NotationParts::setStaffVisible
    return false
}

/** INotationParts::removeParts */
export function removeParts(_score: MasterScore, _partIds: readonly string[]): boolean {
    // TODO(port): NotationParts::removeParts
    return false
}

/** INotationParts::removeStaves */
export function removeStaves(_score: MasterScore, _staffIndices: readonly number[]): boolean {
    // TODO(port): NotationParts::removeStaves
    return false
}

/** INotationParts::moveParts: the parts are moved before (or after) the destination part */
export function moveParts(_score: MasterScore, _partIds: readonly string[], _destinationPartId: string, _after: boolean): boolean {
    // TODO(port): NotationParts::moveParts
    return false
}

/** INotationParts::appendStaff / appendLinkedStaff ("Add staff", "Add linked staff") */
export function addStaff(_score: MasterScore, _partId: string, _linked: boolean): boolean {
    // TODO(port): NotationParts::appendStaff / appendLinkedStaff
    return false
}

/** INotationParts::setParts with the result of the instruments dialog (instrument template ids appended) */
export function addInstruments(_score: MasterScore, _instrumentIds: readonly string[]): boolean {
    // TODO(port): NotationParts::setParts / Score::insertPart for new instruments
    return false
}
