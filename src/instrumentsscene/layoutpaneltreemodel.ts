/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/layoutpaneltreemodel.h/.cpp
 *
 * Framework independent: rows are the tree items themselves (no QModelIndex), the selection model
 * (ItemMultiSelectionModel with Shift as the allowed modifier) is a list of items, and the view is told about
 * changes through `onChanged`. The model is created for one notation (the master score or a part score); the app
 * creates a new one (or calls load()) when the score changes (C++: the notifications of INotationParts and the undo
 * stack's changes channel). The warning before removing instruments (warnAboutRemovingInstrumentsIfNecessary, a
 * synchronous message box in C++) is asked by the app before it calls removeSelectedRows/removeRows.
 * Drag and drop: startActiveDrag(), moveRows() while dragging (only the rows move), endActiveDrag() applies the last
 * move to the score.
 */

import type { Part } from '../engraving/dom/part'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { mtrc } from '../framework/global/translation'
import {
    AbstractLayoutPanelTreeItem, MoveParams, type LayoutPanelNotation, type LayoutPanelNotationParts,
} from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'
import { collectSystemObjectGroups, type SystemObjectGroups } from './layoutpanelutils'
import { PartTreeItem } from './parttreeitem'
import { RootTreeItem } from './roottreeitem'
import { StaffControlTreeItem } from './staffcontroltreeitem'
import { StaffTreeItem } from './stafftreeitem'
import { SystemObjectsLayerTreeItem } from './systemobjectslayertreeitem'

export interface SelectModifiers {
    shift?: boolean
    ctrl?: boolean
}

export class LayoutPanelTreeModel {
    private m_rootItem: RootTreeItem | null = null
    private readonly m_masterNotation: LayoutPanelNotation
    private readonly m_notation: LayoutPanelNotation

    /** the selected rows in selection order (C++ m_selectionModel->selectedIndexes()) */
    private m_selection: AbstractLayoutPanelTreeItem[] = []

    private m_isMovingUpAvailable = false
    private m_isMovingDownAvailable = false
    private m_isRemovingAvailable = false
    private m_isAddingSystemMarkingsAvailable = false
    private m_selectedItemsType = LayoutPanelItemType.UNDEFINED
    private m_layoutPanelVisible = true
    private m_shouldUpdateSystemObjectLayers = false
    private m_systemStaffToSelect = ''

    private m_dragInProgress = false
    private m_dragSourceParentItem: AbstractLayoutPanelTreeItem | null = null
    private m_activeDragMoveParams = new MoveParams()

    /** called after every change of the rows or their state (C++ model signals) */
    onChanged: (() => void) | null = null

    /**
     * `score`: the current notation (the master score or a part score) with its commands, `masterParts`: the commands
     * of the master score (the same as `parts` for the master score)
     */
    constructor(score: Score, parts: LayoutPanelNotationParts | null = null, masterParts: LayoutPanelNotationParts | null = parts) {
        this.m_notation = { score, parts }
        this.m_masterNotation = score.isMaster() ? this.m_notation : { score: score.masterScore(), parts: masterParts }
        this.load()
    }

    score(): Score { return this.m_notation.score }
    masterScore(): Score { return this.m_masterNotation.score }
    rootItem(): RootTreeItem | null { return this.m_rootItem }

    isMasterScore(): boolean {
        return this.score().isMaster()
    }

    private changed(): void {
        this.onChanged?.()
    }

    private shouldShowSystemObjectLayers(): boolean {
        // Only show system object staves in master score
        // TODO: extend system object staves logic to parts
        return this.isMasterScore()
    }

    clear(): void {
        this.deleteItems()
        this.changed()
    }

    private deleteItems(): void {
        this.m_selection = []
        this.m_rootItem = null
    }

    load(): void {
        this.deleteItems()

        this.m_rootItem = new RootTreeItem(this.m_masterNotation, this.m_notation)

        const masterParts = [...this.masterScore().parts()]
        const excerptParts = this.score().parts()
        // For master score we should use score's order, for others - custom
        if (!this.isMasterScore()) {
            LayoutPanelTreeModel.sortParts(masterParts, excerptParts)
        }

        const showSystemObjectLayers = this.shouldShowSystemObjectLayers()
        const systemObjectStaves = this.masterScore().systemObjectStavesWithTopStaff()
        let systemObjects = new Map<Staff, SystemObjectGroups>()
        if (showSystemObjectLayers) {
            systemObjects = collectSystemObjectGroups(systemObjectStaves)
        }

        for (const part of masterParts) {
            if (showSystemObjectLayers) {
                for (const staff of part.staves()) {
                    if (!staff.hasSystemObjectsBelowBottomStaff() && systemObjectStaves.includes(staff)) {
                        this.m_rootItem.appendChild(this.buildSystemObjectsLayerItem(staff, systemObjects.get(staff) ?? []))
                    }
                }
            }

            this.m_rootItem.appendChild(this.buildMasterPartItem(part))

            if (showSystemObjectLayers) {
                for (const staff of part.staves()) {
                    if (staff.hasSystemObjectsBelowBottomStaff()) {
                        this.m_rootItem.appendChild(this.buildSystemObjectsLayerItem(staff, systemObjects.get(staff) ?? []))
                    }
                }
            }
        }

        this.selectionChanged()
        this.updateIsAddingSystemMarkingsAvailable()
        this.changed()
    }

    /** the master parts in the order of the excerpt's parts (the parts not in the excerpt at the end) */
    private static sortParts(parts: Part[], referenceParts: readonly Part[]): void {
        const referenceIdOrder = referenceParts.map(p => p.id())
        const index = (part: Part): number => {
            const i = referenceIdOrder.indexOf(part.id())
            return i === -1 ? referenceIdOrder.length : i
        }
        // stable (Array.prototype.sort is stable like std::stable_sort)
        parts.sort((a, b) => index(a) - index(b))
    }

    setLayoutPanelVisible(visible: boolean): void {
        if (this.m_layoutPanelVisible === visible) {
            return
        }
        this.m_layoutPanelVisible = visible
        if (visible) {
            this.updateSelectedRows()
        }
    }

    /** the selection of the score changed (C++ interaction()->selectionChanged()): the parts of the selected elements */
    updateSelectedRows(): void {
        if (!this.m_layoutPanelVisible || !this.m_rootItem) {
            return
        }

        this.setSelection([])

        const selectedElements = this.score().selection().elements()
        const selectedPartIds: string[] = []
        for (const element of selectedElements) {
            const part = element.part()
            if (part) {
                selectedPartIds.push(part.id())
            }
        }

        const items: AbstractLayoutPanelTreeItem[] = []
        for (const id of selectedPartIds) {
            const item = this.m_rootItem.childAtId(id, LayoutPanelItemType.PART)
            if (item && !items.includes(item)) {
                items.push(item)
            }
        }
        this.setSelection(items)
    }

    /** the score changed (C++ onScoreChanged with the undo stack's changes): titles and visibility */
    onScoreChanged(): void {
        if (!this.m_rootItem) {
            return
        }
        for (const item of this.m_rootItem.childItems()) {
            item.onScoreChanged()
        }
        this.changed()
    }

    // ---- the selection model (ItemMultiSelectionModel, allowed modifier: Shift) ----

    selectedItems(): readonly AbstractLayoutPanelTreeItem[] { return this.m_selection }

    /** ItemMultiSelectionModel::select */
    selectRow(item: AbstractLayoutPanelTreeItem, modifiers: SelectModifiers = {}): void {
        // only Shift is allowed here (setAllowedModifiers(Qt::ShiftModifier)); Ctrl+Shift counts as Ctrl
        const shift = !!modifiers.shift && !modifiers.ctrl
        let start = item
        if (shift && this.m_selection.length) {
            start = this.m_selection[this.m_selection.length - 1]
        }

        if (!shift) {
            this.setSelection([item])
            return
        }

        const next = [...this.m_selection]
        const parent = item.parentItem()
        if (parent && start.parentItem() === parent) {
            const from = Math.min(start.row(), item.row())
            const to = Math.max(start.row(), item.row())
            for (let row = from; row <= to; ++row) {
                const it = parent.childAtRow(row)!
                if (!next.includes(it)) {
                    next.push(it)
                }
            }
        }
        this.setSelection(next)
    }

    clearSelection(): void {
        this.setSelection([])
    }

    /** selects the given rows (the app restores the selection after reloading the model) */
    selectItems(items: readonly AbstractLayoutPanelTreeItem[]): void {
        this.setSelection(items.filter(i => i.isSelectable()))
    }

    private setSelection(items: AbstractLayoutPanelTreeItem[]): void {
        const deselected = this.m_selection.filter(i => !items.includes(i))
        const selected = items.filter(i => !this.m_selection.includes(i))
        this.m_selection = items
        if (!deselected.length && !selected.length) {
            return
        }
        // C++ ItemMultiSelectionModel::selectionChanged
        this.setItemsSelected(deselected, false)
        this.setItemsSelected(selected, true)
        this.selectionChanged()
        this.changed()
    }

    private selectionChanged(): void {
        this.updateRearrangementAvailability()
        this.updateRemovingAvailability()
        this.updateSelectedItemsType()
        this.updateIsAddingSystemMarkingsAvailable()
    }

    private setItemsSelected(items: readonly AbstractLayoutPanelTreeItem[], selected: boolean): void {
        for (const item of items) {
            if (!item.isSelectable()) {
                continue
            }
            item.setIsSelected(selected)
        }
    }

    private sortedSelection(): AbstractLayoutPanelTreeItem[] {
        return [...this.m_selection].sort((f, s) => f.row() - s.row())
    }

    // ---- commands ----

    addSystemMarkings(): void {
        const staff = this.resolveNewSystemObjectStaff()
        if (staff) {
            this.m_systemStaffToSelect = staff.id()
            this.m_masterNotation.parts?.addSystemObjects([staff.id()])
            this.m_shouldUpdateSystemObjectLayers = true
            this.updateSystemObjectLayers()
        }
    }

    moveSelectedRowsUp(): void {
        if (!this.m_isMovingUpAvailable) {
            return
        }
        const selected = this.sortedSelection()
        if (!selected.length) {
            return
        }
        const first = selected[0]
        this.moveRows(first.parentItem(), first.row(), selected.length, first.parentItem(), first.row() - 1)
    }

    moveSelectedRowsDown(): void {
        if (!this.m_isMovingDownAvailable) {
            return
        }
        const selected = this.sortedSelection()
        if (!selected.length) {
            return
        }
        const first = selected[0]
        const last = selected[selected.length - 1]
        this.moveRows(first.parentItem(), first.row(), selected.length, first.parentItem(), last.row() + 1)
    }

    removeSelectedRows(): void {
        if (!this.m_isRemovingAvailable) {
            return
        }
        const selected = this.sortedSelection()
        if (!selected.length) {
            return
        }
        this.removeRows(selected[0].row(), selected.length, selected[0].parentItem())
    }

    /**
     * C++ needWarnOnRemoveRows + warnAboutRemovingInstrumentsIfNecessary for removeSelectedRows: the texts of the warning
     * (buttons No/Yes) the user has to confirm before the rows are removed, or null
     */
    removeWarning(): { text: string; detail: string } | null {
        const selected = this.sortedSelection()
        if (!this.m_isRemovingAvailable || !selected.length || !this.m_rootItem) {
            return null
        }
        const parentItem = selected[0].parentItem() ?? this.m_rootItem
        if (parentItem !== this.m_rootItem || !this.needWarnOnRemoveRows(selected[0].row(), selected.length)) {
            return null
        }
        // Only warn if excerpts are existent
        if (!this.masterScore().masterScore().excerpts().length) {
            return null
        }
        const count = selected.length
        return {
            text: mtrc('layoutpanel', 'Are you sure you want to delete the selected instrument(s)?', '', count),
            detail: mtrc('layoutpanel', 'This will remove the instrument(s) from the full score and all part scores.', '', count),
        }
    }

    private needWarnOnRemoveRows(row: number, count: number): boolean {
        for (let i = row + count - 1; i >= row; --i) {
            if (this.m_rootItem!.childType(i) !== LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
                return true
            }
        }
        return false
    }

    removeRows(row: number, count: number, parent: AbstractLayoutPanelTreeItem | null): boolean {
        if (!this.m_isRemovingAvailable || !this.m_rootItem) {
            return false
        }
        const parentItem = parent ?? this.m_rootItem
        // C++: if (parentItem == m_rootItem && needWarnOnRemoveRows(row, count)) warnAboutRemovingInstrumentsIfNecessary(count):
        // asked by the app before (removeWarning)

        const removed = parentItem.childItems().slice(row, row + count)
        this.m_selection = this.m_selection.filter(i => !removed.includes(i))
        parentItem.removeChildren(row, count, true)
        this.selectionChanged()

        this.updateSystemObjectLayers()
        this.changed()
        return true
    }

    moveRows(sourceParent: AbstractLayoutPanelTreeItem | null, sourceRow: number, count: number,
        destinationParent: AbstractLayoutPanelTreeItem | null, destinationChild: number): boolean {
        const sourceParentItem = sourceParent ?? this.m_rootItem
        const destinationParentItem = destinationParent ?? this.m_rootItem

        const sourceFirstRow = sourceRow
        const sourceLastRow = sourceRow + count - 1

        if (sourceRow < 0 || count <= 0 || destinationChild < 0) {
            return false
        }
        if (sourceRow === destinationChild) {
            return false
        }

        const destinationRow = (sourceLastRow > destinationChild) ? destinationChild : destinationChild + 1

        if (!sourceParentItem || !destinationParentItem) {
            return false
        }

        const maxRow = sourceParentItem.childCount() - 1
        if (sourceLastRow > maxRow || destinationRow > maxRow + 1) {
            return false
        }
        if (sourceFirstRow >= sourceParentItem.childCount()) {
            return false
        }

        if (this.m_dragInProgress) {
            const params = sourceParentItem.buildMoveParams(sourceRow, count, destinationParentItem, destinationRow)
            if (!params.isValid()) {
                return false
            }

            this.m_dragSourceParentItem = sourceParentItem
            this.m_activeDragMoveParams = params
        }

        sourceParentItem.moveChildren(sourceFirstRow, count, destinationParentItem, destinationRow, !this.m_dragInProgress)

        if (!this.m_dragInProgress) {
            this.updateSystemObjectLayers()
        }

        this.updateRearrangementAvailability()
        this.changed()
        return true
    }

    startActiveDrag(): void {
        this.m_dragInProgress = true
    }

    isDragInProgress(): boolean {
        return this.m_dragInProgress
    }

    /** the drop: the score gets the last move of the drag (the app reloads the model after the change of the score) */
    endActiveDrag(): void {
        if (this.m_dragSourceParentItem) {
            this.m_dragSourceParentItem.moveChildrenOnScore(this.m_activeDragMoveParams)
        }

        this.m_dragSourceParentItem = null
        this.m_activeDragMoveParams = new MoveParams()
        this.m_dragInProgress = false

        this.updateSystemObjectLayers()
        this.changed()
    }

    changeVisibilityOfSelectedRows(visible: boolean): void {
        for (const item of [...this.m_selection]) {
            this.changeVisibility(item, visible)
        }
    }

    changeVisibility(item: AbstractLayoutPanelTreeItem, visible: boolean): void {
        item.setIsVisible(visible)
        this.changed()
    }

    // ---- state ----

    isMovingUpAvailable(): boolean { return this.m_isMovingUpAvailable }
    isMovingDownAvailable(): boolean { return this.m_isMovingDownAvailable }
    isRemovingAvailable(): boolean { return this.m_isRemovingAvailable }
    isAddingAvailable(): boolean { return true }
    isAddingSystemMarkingsAvailable(): boolean { return this.m_isAddingSystemMarkingsAvailable }
    isEmpty(): boolean { return this.m_rootItem ? this.m_rootItem.isEmpty() : true }
    selectedItemsType(): LayoutPanelItemType { return this.m_selectedItemsType }

    private updateRearrangementAvailability(): void {
        const selected = this.sortedSelection()
        if (!selected.length) {
            this.m_isMovingUpAvailable = false
            this.m_isMovingDownAvailable = false
            return
        }

        let isRearrangementAvailable = true
        let prevItemType = LayoutPanelItemType.UNDEFINED
        for (let i = 1; i < selected.length; ++i) {
            isRearrangementAvailable = selected[i].row() - selected[i - 1].row() <= 1
            if (isRearrangementAvailable) {
                if (prevItemType !== LayoutPanelItemType.UNDEFINED) {
                    isRearrangementAvailable = selected[i].type() === prevItemType
                }
                prevItemType = selected[i].type()
            }
            if (!isRearrangementAvailable) {
                this.m_isMovingUpAvailable = false
                this.m_isMovingDownAvailable = false
                return
            }
        }

        this.updateMovingUpAvailability(isRearrangementAvailable, selected[0])
        this.updateMovingDownAvailability(isRearrangementAvailable, selected[selected.length - 1])
    }

    private updateMovingUpAvailability(isSelectionMovable: boolean, firstSelected: AbstractLayoutPanelTreeItem): void {
        const parentItem = firstSelected.parentItem() ?? this.m_rootItem!

        // can't go above the topmost system objects layer
        let minAllowedRow = 0
        if (parentItem.childType(0) === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            minAllowedRow = 1
        }

        const isRowInBoundaries = firstSelected.row() > minAllowedRow
        this.m_isMovingUpAvailable = isSelectionMovable && isRowInBoundaries
    }

    private updateMovingDownAvailability(isSelectionMovable: boolean, lastSelected: AbstractLayoutPanelTreeItem): void {
        const parentItem = lastSelected.parentItem() ?? this.m_rootItem!

        // exclude the control item
        const hasControlItem = parentItem.type() !== LayoutPanelItemType.ROOT

        const lastSelectedIsSystemObjectLayer = lastSelected.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER
        if (lastSelected.row() === 0 && lastSelectedIsSystemObjectLayer) {
            // Selecting/moving the top system object layer not allowed
            this.m_isMovingDownAvailable = false
            return
        }

        const lastItemRowIndex = parentItem.childCount() - 1 - (hasControlItem ? 1 : 0)
        const isRowInBoundaries = lastSelected.row() < lastItemRowIndex
        this.m_isMovingDownAvailable = isSelectionMovable && isRowInBoundaries
    }

    private updateRemovingAvailability(): void {
        let isRemovingAvailable = this.m_selection.length > 0
        let parent: AbstractLayoutPanelTreeItem | null = null

        for (const item of this.m_selection) {
            isRemovingAvailable = item.isRemovable()

            //! NOTE: all selected items must have the same parent
            if (isRemovingAvailable && parent) {
                if (parent !== item.parentItem()) {
                    isRemovingAvailable = false
                }
            }
            if (!isRemovingAvailable) {
                break
            }
            parent = item.parentItem()
        }

        //! NOTE: the user is allowed to remove all children only for the root item
        if (isRemovingAvailable && parent && parent !== this.m_rootItem) {
            const removableChildCount = parent.childItems().filter(i => i.isRemovable()).length
            isRemovingAvailable = this.m_selection.length < removableChildCount
        }

        this.m_isRemovingAvailable = isRemovingAvailable
    }

    private updateSelectedItemsType(): void {
        this.m_selectedItemsType = this.m_selection[0]?.type() ?? LayoutPanelItemType.UNDEFINED
    }

    private updateIsAddingSystemMarkingsAvailable(): void {
        if (!this.m_rootItem || !this.isAddingAvailable() || !this.isMasterScore()) {
            this.m_isAddingSystemMarkingsAvailable = false
            return
        }
        const systemLayerCount = this.m_rootItem.childItems().filter(i => i.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER).length
        this.m_isAddingSystemMarkingsAvailable = systemLayerCount < 0.5 * this.m_rootItem.childCount()
    }

    // ---- building ----

    private buildMasterPartItem(masterPart: Part): AbstractLayoutPanelTreeItem {
        const partItem = new PartTreeItem(this.m_masterNotation, this.m_notation)
        partItem.init(masterPart)

        for (const staff of masterPart.staves()) {
            partItem.appendChild(this.buildMasterStaffItem(staff))
        }

        partItem.appendChild(this.buildAddStaffControlItem(partItem.id()))
        return partItem
    }

    private buildMasterStaffItem(masterStaff: Staff): AbstractLayoutPanelTreeItem {
        const result = new StaffTreeItem(this.m_masterNotation, this.m_notation)
        result.init(masterStaff)
        return result
    }

    private buildSystemObjectsLayerItem(masterStaff: Staff, systemObjects: SystemObjectGroups): AbstractLayoutPanelTreeItem {
        const result = new SystemObjectsLayerTreeItem(this.m_masterNotation, this.m_notation)
        result.init(masterStaff, systemObjects)
        return result
    }

    private buildAddStaffControlItem(partId: string): AbstractLayoutPanelTreeItem {
        const result = new StaffControlTreeItem(this.m_masterNotation, this.m_notation)
        result.init(partId)
        return result
    }

    private updateSystemObjectLayers(): void {
        if (!this.m_rootItem || !this.m_shouldUpdateSystemObjectLayers) {
            return
        }
        if (!this.shouldShowSystemObjectLayers()) {
            return
        }

        this.m_shouldUpdateSystemObjectLayers = false

        const newSystemObjectStaves = [...this.masterScore().systemObjectStavesWithTopStaff()]
        const children = [...this.m_rootItem.childItems()]

        // Remove old system object layers
        const partItems: PartTreeItem[] = []
        const existingSystemObjectLayers: SystemObjectsLayerTreeItem[] = []

        for (const item of children) {
            if (item.type() !== LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
                if (item.type() === LayoutPanelItemType.PART) {
                    partItems.push(item as PartTreeItem)
                }
                continue
            }

            const layerItem = item as SystemObjectsLayerTreeItem
            const idx = newSystemObjectStaves.indexOf(layerItem.staff()!)
            if (idx >= 0) {
                newSystemObjectStaves.splice(idx, 1)
                existingSystemObjectLayers.push(layerItem)
                continue
            }

            this.m_rootItem.removeChildren(layerItem.row(), 1, false)
        }

        const systemObjects = collectSystemObjectGroups(this.masterScore().systemObjectStavesWithTopStaff())

        // Update position of existing layers if changed
        for (const layerItem of existingSystemObjectLayers) {
            const partItem = this.findPartItemByStaff(layerItem.staff()!)
            if (!partItem) {
                continue
            }

            const partRow = partItem.row()
            const layerRow = layerItem.row()
            const correctLayerRow = layerItem.staff()!.hasSystemObjectsBelowBottomStaff() ? partRow + 1 : partRow - 1

            if (layerRow !== correctLayerRow) {
                this.m_rootItem.moveChildren(layerRow, 1, this.m_rootItem, partRow, false /*updateNotation*/)
            }

            layerItem.setSystemObjects(systemObjects.get(layerItem.staff()!) ?? [])
        }

        // Create new system object layers
        for (const staff of newSystemObjectStaves) {
            for (const partItem of partItems) {
                if (staff.part() !== partItem.part()) {
                    continue
                }

                const newItem = this.buildSystemObjectsLayerItem(staff, systemObjects.get(staff) ?? [])
                const row = staff.hasSystemObjectsBelowBottomStaff() ? partItem.row() + 1 : partItem.row()
                this.m_rootItem.insertChild(newItem, row)

                if (row !== 0 && this.m_systemStaffToSelect === staff.id()) {
                    this.selectRow(newItem)
                    this.m_systemStaffToSelect = ''
                }
                break
            }
        }

        this.updateIsAddingSystemMarkingsAvailable()
    }

    private findPartItemByStaff(staff: Staff): PartTreeItem | null {
        for (const item of this.m_rootItem?.childItems() ?? []) {
            if (item.type() !== LayoutPanelItemType.PART) {
                continue
            }
            const partItem = item as PartTreeItem
            if (partItem.part()?.staves().includes(staff)) {
                return partItem
            }
        }
        return null
    }

    private resolveNewSystemObjectStaff(): Staff | null {
        const systemObjectStaves = this.masterScore().systemObjectStavesWithTopStaff()

        const resolveStaff = (item: AbstractLayoutPanelTreeItem): Staff | null => {
            if (item.type() !== LayoutPanelItemType.PART) {
                return null
            }
            const part = (item as PartTreeItem).part()
            if (!part) {
                return null
            }
            for (const staff of part.staves()) {
                if (systemObjectStaves.includes(staff)) {
                    return null
                }
            }
            return part.staff(0)
        }

        for (const item of this.m_selection) {
            const staff = resolveStaff(item)
            if (staff) {
                return staff
            }
        }
        for (const item of this.m_rootItem?.childItems() ?? []) {
            const staff = resolveStaff(item)
            if (staff) {
                return staff
            }
        }
        return null
    }
}
