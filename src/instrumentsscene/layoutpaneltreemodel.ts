/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/layoutpaneltreemodel.h/.cpp
 *
 * Framework independent: rows are the tree items themselves (no QModelIndex), the selection model
 * (ItemMultiSelectionModel with Shift as the allowed modifier) is a list of items, and the view is told about
 * changes through `onChanged`. The model is created for one score; the app creates a new one (or calls load())
 * when the score changes (C++: the notifications of INotationParts and the undo stack's changes channel).
 * TODO(port): excerpts (sortParts, parts not in the excerpt), drag and drop (startActiveDrag/endActiveDrag), the
 * warning before removing instruments of a score with parts (there are no excerpts yet).
 */

import type { Part } from '../engraving/dom/part'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { AbstractLayoutPanelTreeItem, type LayoutPanelNotationParts } from './abstractlayoutpaneltreeitem'
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
    private readonly m_score: Score
    private readonly m_parts: LayoutPanelNotationParts | null

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

    /** called after every change of the rows or their state (C++ model signals) */
    onChanged: (() => void) | null = null

    constructor(score: Score, parts: LayoutPanelNotationParts | null = null) {
        this.m_score = score
        this.m_parts = parts
        this.load()
    }

    score(): Score { return this.m_score }
    rootItem(): RootTreeItem | null { return this.m_rootItem }

    private changed(): void {
        this.onChanged?.()
    }

    /** C++ shouldShowSystemObjectLayers: only in the master score (there are no excerpts here) */
    private shouldShowSystemObjectLayers(): boolean {
        return true
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

        this.m_rootItem = new RootTreeItem(this.m_score, this.m_parts)

        const masterParts = this.m_score.parts()

        const showSystemObjectLayers = this.shouldShowSystemObjectLayers()
        const systemObjectStaves = this.m_score.systemObjectStavesWithTopStaff()
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

        const selectedElements = this.m_score.selection().elements()
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
            this.m_parts?.addSystemObjects([staff.id()])
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

    removeRows(row: number, count: number, parent: AbstractLayoutPanelTreeItem | null): boolean {
        if (!this.m_isRemovingAvailable || !this.m_rootItem) {
            return false
        }
        const parentItem = parent ?? this.m_rootItem
        // TODO(port): warnAboutRemovingInstrumentsIfNecessary (only with excerpts)

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

        sourceParentItem.moveChildren(sourceFirstRow, count, destinationParentItem, destinationRow, true)

        this.updateSystemObjectLayers()
        this.updateRearrangementAvailability()
        this.changed()
        return true
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
        if (!this.m_rootItem) {
            this.m_isAddingSystemMarkingsAvailable = false
            return
        }
        const systemLayerCount = this.m_rootItem.childItems().filter(i => i.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER).length
        this.m_isAddingSystemMarkingsAvailable = systemLayerCount < 0.5 * this.m_rootItem.childCount()
    }

    // ---- building ----

    private buildMasterPartItem(masterPart: Part): AbstractLayoutPanelTreeItem {
        const partItem = new PartTreeItem(this.m_score, this.m_parts)
        partItem.init(masterPart)

        for (const staff of masterPart.staves()) {
            partItem.appendChild(this.buildMasterStaffItem(staff))
        }

        partItem.appendChild(this.buildAddStaffControlItem(partItem.id()))
        return partItem
    }

    private buildMasterStaffItem(masterStaff: Staff): AbstractLayoutPanelTreeItem {
        const result = new StaffTreeItem(this.m_score, this.m_parts)
        result.init(masterStaff)
        return result
    }

    private buildSystemObjectsLayerItem(masterStaff: Staff, systemObjects: SystemObjectGroups): AbstractLayoutPanelTreeItem {
        const result = new SystemObjectsLayerTreeItem(this.m_score, this.m_parts)
        result.init(masterStaff, systemObjects)
        return result
    }

    private buildAddStaffControlItem(partId: string): AbstractLayoutPanelTreeItem {
        const result = new StaffControlTreeItem(this.m_score, this.m_parts)
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

        const newSystemObjectStaves = [...this.m_score.systemObjectStavesWithTopStaff()]
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

        const systemObjects = collectSystemObjectGroups(this.m_score.systemObjectStavesWithTopStaff())

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
        const systemObjectStaves = this.m_score.systemObjectStavesWithTopStaff()

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
