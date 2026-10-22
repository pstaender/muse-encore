/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The score changes the panels request (applying a palette cell, changing a property in the Properties panel,
 * the instrument commands of the Layout panel). All of them go through this module, so the panels do not depend on
 * how editing is implemented: the undo stack and the editing commands are ported separately.
 * The Layout panel commands go through the library's NotationParts port (undoable; they return true if the score
 * changed). TODO(port): "Add linked staff" (canAddLinkedStaff() is false).
 */
import {
    applyInspectorChanges as libApplyInspectorChanges, applyPaletteElement as libApplyPaletteElement, hasSelection,
    type InspectorChange, type MasterScore, type PaletteElement,
} from '../../src/index'
import * as lib from '../../src/index'
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

export function canEditParts(score: MasterScore | null): boolean {
    return !!score
}

/** "Add linked staff" (INotationParts::appendLinkedStaff) is not ported (Excerpt::cloneStaff) */
export function canAddLinkedStaff(_score: MasterScore | null): boolean {
    return false
}

/** INotationParts::setPartVisible */
export function setPartVisible(score: MasterScore, partId: string, visible: boolean): boolean {
    return lib.setPartVisible(score, partId, visible)
}

/** INotationParts::setStaffVisible (staff id: the library's Staff id, as in the layout panel's rows) */
export function setStaffVisible(score: MasterScore, staffId: string, visible: boolean): boolean {
    return lib.setStaffVisible(score, staffId, visible)
}

/** INotationParts::removeParts */
export function removeParts(score: MasterScore, partIds: readonly string[]): boolean {
    return lib.removeParts(score, partIds)
}

/** INotationParts::removeStaves */
export function removeStaves(score: MasterScore, staffIds: readonly string[]): boolean {
    return lib.removeStaves(score, staffIds)
}

/** INotationParts::moveParts: the parts are moved before (or after) the destination part */
export function moveParts(score: MasterScore, partIds: readonly string[], destinationPartId: string, after: boolean): boolean {
    return lib.moveParts(score, partIds, destinationPartId, after)
}

/** INotationParts::moveStaves: the staves are moved before (or after) the destination staff */
export function moveStaves(score: MasterScore, staffIds: readonly string[], destinationStaffId: string, after: boolean): boolean {
    return lib.moveStaves(score, staffIds, destinationStaffId, after)
}

/** INotationParts::appendStaff / appendLinkedStaff ("Add staff", "Add linked staff") */
export function addStaff(score: MasterScore, partId: string, linked: boolean): boolean {
    if (linked) {
        return false // TODO(port): NotationParts::appendLinkedStaff (Excerpt::cloneStaff)
    }
    return lib.appendStaff(score, partId)
}

/** INotationParts::addSystemObjects (Add > System markings: the staves get a copy of the top system markings) */
export function addSystemObjects(score: MasterScore, staffIds: readonly string[]): boolean {
    return lib.addSystemObjects(score, staffIds)
}

/** INotationParts::removeSystemObjects */
export function removeSystemObjects(score: MasterScore, staffIds: readonly string[]): boolean {
    return lib.removeSystemObjects(score, staffIds)
}

/** INotationParts::moveSystemObjects (a system markings layer moved to another staff) */
export function moveSystemObjects(score: MasterScore, sourceStaffId: string, destinationStaffId: string): boolean {
    return lib.moveSystemObjects(score, sourceStaffId, destinationStaffId)
}

/** INotationParts::moveSystemObjectLayerBelowBottomStaff / moveSystemObjectLayerAboveBottomStaff */
export function moveSystemObjectLayerBottomStaff(score: MasterScore, below: boolean): boolean {
    return lib.moveSystemObjectLayerBottomStaff(score, below)
}

/** INotationParts::setScoreOrder (the panel's context menu "Instrument ordering"; id of orders.xml or "custom") */
export function setScoreOrder(score: MasterScore, orderId: string): boolean {
    return lib.setScoreOrder(score, orderId)
}

/** "Replace instrument" (INotationParts::replaceInstrument): the part gets the instrument of the template */
export function replacePartInstrument(score: MasterScore, partId: string, templateId: string): boolean {
    return lib.replacePartInstrument(score, partId, templateId)
}

/** INotationParts::setParts with the result of the instruments dialog (instrument template ids appended) */
export function addInstruments(score: MasterScore, instrumentIds: readonly string[]): boolean {
    return lib.addInstruments(score, instrumentIds)
}
