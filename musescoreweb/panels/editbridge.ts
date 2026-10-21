/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The score changes the panels request (applying a palette cell, changing a property in the Properties panel,
 * the instrument commands of the Layout panel). All of them go through this module, so the panels do not depend on
 * how editing is implemented: the undo stack and the editing commands are ported separately.
 *
 * TODO(port): the Layout panel commands (NotationParts: part/staff visibility, adding, moving and removing parts and
 * staves, system markings, score order) are stubs: they return false and canEditParts() disables their controls.
 */
import {
    applyInspectorChanges as libApplyInspectorChanges, applyPaletteElement as libApplyPaletteElement, hasSelection,
    type InspectorChange, type MasterScore, type PaletteElement,
} from '../../src/index'
import { scoreChanged as viewScoreChanged } from '../scoreview'

/** to be called after a successful change: relayout and repaint of the view, refresh of the panels */
export function scoreChanged(): void {
    viewScoreChanged()
}

// ---------------------------------------------------------------------------------
//   palettes (PaletteCellModel / Palette::applyPaletteElement)
// ---------------------------------------------------------------------------------

/** the palette element can be applied to the score's selection (Palette::applyPaletteElement needs a selection) */
export function canApplyPaletteElement(score: MasterScore | null): boolean {
    return !!score && hasSelection(score)
}

/**
 * Applies a palette cell's element to the selection (Palette::applyPaletteElement with the keyboard modifiers:
 * shift = range/all staves behaviour). `element` is the cell's element as the palette library returns it.
 */
export function applyPaletteElement(score: MasterScore, element: PaletteElement, modifiers: { shift: boolean; ctrl: boolean } = { shift: false, ctrl: false }): boolean {
    return libApplyPaletteElement(score, element, modifiers)
}

// ---------------------------------------------------------------------------------
//   Properties panel (AbstractInspectorModel::onPropertyValueChanged -> EngravingItem::undoChangeProperty)
// ---------------------------------------------------------------------------------

export function canChangeProperties(score: MasterScore | null): boolean {
    return !!score
}

/**
 * Applies the changes the Properties panel computed with the library (inspectorPropertyChanges,
 * inspectorPropertyResets, inspectorArrangeChanges) in one undo command. Returns true if the score changed.
 */
export function applyInspectorChanges(score: MasterScore, changes: readonly InspectorChange[]): boolean {
    return libApplyInspectorChanges(score, changes)
}

// ---------------------------------------------------------------------------------
//   Layout panel (LayoutPanelTreeModel -> INotationParts)
// ---------------------------------------------------------------------------------

export function canEditParts(_score: MasterScore | null): boolean {
    return false // TODO(port): NotationParts commands
}

/** INotationParts::setPartVisible */
export function setPartVisible(_score: MasterScore, _partId: string, _visible: boolean): boolean {
    // TODO(port): NotationParts::setPartVisible
    return false
}

/** INotationParts::setStaffVisible (staff id: the library's Staff id, as in the layout panel's rows) */
export function setStaffVisible(_score: MasterScore, _staffId: string, _visible: boolean): boolean {
    // TODO(port): NotationParts::setStaffVisible
    return false
}

/** INotationParts::removeParts */
export function removeParts(_score: MasterScore, _partIds: readonly string[]): boolean {
    // TODO(port): NotationParts::removeParts
    return false
}

/** INotationParts::removeStaves */
export function removeStaves(_score: MasterScore, _staffIds: readonly string[]): boolean {
    // TODO(port): NotationParts::removeStaves
    return false
}

/** INotationParts::moveParts: the parts are moved before (or after) the destination part */
export function moveParts(_score: MasterScore, _partIds: readonly string[], _destinationPartId: string, _after: boolean): boolean {
    // TODO(port): NotationParts::moveParts
    return false
}

/** INotationParts::moveStaves: the staves are moved before (or after) the destination staff */
export function moveStaves(_score: MasterScore, _staffIds: readonly string[], _destinationStaffId: string, _after: boolean): boolean {
    // TODO(port): NotationParts::moveStaves
    return false
}

/** INotationParts::appendStaff / appendLinkedStaff ("Add staff", "Add linked staff") */
export function addStaff(_score: MasterScore, _partId: string, _linked: boolean): boolean {
    // TODO(port): NotationParts::appendStaff / appendLinkedStaff
    return false
}

/** INotationParts::addSystemObjects (Add > System markings: the staves get a copy of the top system markings) */
export function addSystemObjects(_score: MasterScore, _staffIds: readonly string[]): boolean {
    // TODO(port): NotationParts::addSystemObjects
    return false
}

/** INotationParts::removeSystemObjects */
export function removeSystemObjects(_score: MasterScore, _staffIds: readonly string[]): boolean {
    // TODO(port): NotationParts::removeSystemObjects
    return false
}

/** INotationParts::moveSystemObjects (a system markings layer moved to another staff) */
export function moveSystemObjects(_score: MasterScore, _sourceStaffId: string, _destinationStaffId: string): boolean {
    // TODO(port): NotationParts::moveSystemObjects
    return false
}

/** INotationParts::moveSystemObjectLayerBelowBottomStaff / moveSystemObjectLayerAboveBottomStaff */
export function moveSystemObjectLayerBottomStaff(_score: MasterScore, _below: boolean): boolean {
    // TODO(port): NotationParts::moveSystemObjectLayerBelowBottomStaff / moveSystemObjectLayerAboveBottomStaff
    return false
}

/** INotationParts::setScoreOrder (the panel's context menu "Instrument ordering"; id of orders.xml or "custom") */
export function setScoreOrder(_score: MasterScore, _orderId: string): boolean {
    // TODO(port): NotationParts::setScoreOrder
    return false
}

/** INotationParts::setParts with the result of the instruments dialog (instrument template ids appended) */
export function addInstruments(_score: MasterScore, _instrumentIds: readonly string[]): boolean {
    // TODO(port): NotationParts::setParts / Score::insertPart for new instruments
    return false
}
