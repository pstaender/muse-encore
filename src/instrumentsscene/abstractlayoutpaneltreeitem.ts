/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/abstractlayoutpaneltreeitem.h/.cpp
 *
 * The items hold the master notation and the current notation (a part score or the master score itself), each a score
 * with its `LayoutPanelNotationParts` (the part of INotationParts the items use), which the app provides; Qt's property change signals are replaced by `onIsVisibleChanged` (the only one with a side effect).
 */

import type { Part } from '../engraving/dom/part'
import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import { LayoutPanelItemType } from './layoutpanelitemtype'

/** INotationParts::InsertMode */
export enum InsertMode {
    Before,
    After,
}

/** the score changes of INotationParts the layout panel uses */
export interface LayoutPanelNotationParts {
    setPartVisible(partId: string, visible: boolean): void
    setStaffVisible(staffId: string, visible: boolean): void
    removeParts(partIds: readonly string[]): void
    removeStaves(staffIds: readonly string[]): void
    moveParts(sourcePartIds: readonly string[], destinationPartId: string, mode: InsertMode): void
    moveStaves(sourceStaffIds: readonly string[], destinationStaffId: string, mode: InsertMode): void
    /** StaffControlTreeItem::appendNewItem: a new staff (with the instrument's clef) appended to the part */
    appendStaff(partId: string): void
    /** INotationParts::insertPart: a clone of a master part (Part::clone) inserted into an excerpt */
    insertPart(part: Part, index: number): void
    /** INotationParts::replacePart ("Reset all formatting" of a part in an excerpt) */
    replacePart(partId: string, newPart: Part): void
    addSystemObjects(staffIds: readonly string[]): void
    removeSystemObjects(staffIds: readonly string[]): void
    moveSystemObjects(sourceStaffId: string, destinationStaffId: string): void
    moveSystemObjectLayerBelowBottomStaff(): void
    moveSystemObjectLayerAboveBottomStaff(): void
}

/** a notation of the layout panel: the score and its commands (null: read-only) */
export interface LayoutPanelNotation {
    score: Score
    parts: LayoutPanelNotationParts | null
}

/** INotationParts::part(id) */
export function partById(score: Score, id: string): Part | null {
    return score.parts().find(p => p.id() === id) ?? null
}

/** INotationParts::staff(id) */
export function staffById(score: Score, id: string): Staff | null {
    return score.staves().find(s => s.id() === id) ?? null
}

export class MoveParams {
    objectIdListToMove: string[] = []
    destinationObjectId = ''
    objectsType: LayoutPanelItemType = LayoutPanelItemType.UNDEFINED
    insertMode: InsertMode = InsertMode.Before
    moveSysObjBelowBottomStaff = false
    moveSysObjAboveBottomStaff = false

    isValid(): boolean {
        return this.objectIdListToMove.length > 0 && (this.destinationObjectId !== '' || this.moveSysObjBelowBottomStaff)
            && this.objectsType !== LayoutPanelItemType.UNDEFINED
    }
}

export abstract class AbstractLayoutPanelTreeItem {
    private m_children: AbstractLayoutPanelTreeItem[] = []
    private m_parent: AbstractLayoutPanelTreeItem | null = null

    private m_id = ''
    private m_title = ''
    private readonly m_type: LayoutPanelItemType
    private m_isVisible = false
    private m_isExpandable = false
    private m_isRemovable = false
    private m_isSelectable = false
    private m_isSelected = false
    private m_settingsAvailable = false
    private m_settingsEnabled = false

    private readonly m_masterNotation: LayoutPanelNotation
    private readonly m_notation: LayoutPanelNotation

    constructor(type: LayoutPanelItemType, masterNotation: LayoutPanelNotation, notation: LayoutPanelNotation) {
        this.m_type = type
        this.m_masterNotation = masterNotation
        this.m_notation = notation
    }

    id(): string { return this.m_id }
    title(): string { return this.m_title }
    type(): LayoutPanelItemType { return this.m_type }
    isVisible(): boolean { return this.m_isVisible }
    isSelectable(): boolean { return this.m_isSelectable }
    isSelected(): boolean { return this.m_isSelected }
    isExpandable(): boolean { return this.m_isExpandable }
    settingsAvailable(): boolean { return this.m_settingsAvailable }
    settingsEnabled(): boolean { return this.m_settingsEnabled }
    isRemovable(): boolean { return this.m_isRemovable }

    canAcceptDrop(item: AbstractLayoutPanelTreeItem): boolean {
        return item.m_parent === this.m_parent && item.m_type === this.m_type
    }

    appendNewItem(): void {
    }

    buildMoveParams(_sourceRow: number, _count: number, _destinationParent: AbstractLayoutPanelTreeItem, _destinationRow: number): MoveParams {
        return new MoveParams()
    }

    moveChildren(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem, destinationRow: number,
        _updateNotation: boolean): void {
        const childrenToMove: AbstractLayoutPanelTreeItem[] = []
        for (let i = sourceRow; i < sourceRow + count; ++i) {
            childrenToMove.push(this.childAtRow(i)!)
        }

        let destinationRow_ = destinationRow
        for (const child of childrenToMove) {
            destinationParent.insertChild(child, destinationRow_)
            destinationRow_++
        }

        let childToRemoveIndex = sourceRow
        if (sourceRow > destinationRow && destinationParent === this) {
            childToRemoveIndex = sourceRow + count
        }

        AbstractLayoutPanelTreeItem.prototype.removeChildren.call(this, childToRemoveIndex, count)
    }

    moveChildrenOnScore(_params: MoveParams): void {
    }

    removeChildren(row: number, count = 1, _deleteChild = false): void {
        this.m_children.splice(row, count)
    }

    /** C++ onScoreChanged(ScoreChanges): the items re-read their state from the score */
    onScoreChanged(): void {
    }

    parentItem(): AbstractLayoutPanelTreeItem | null { return this.m_parent }
    setParentItem(parent: AbstractLayoutPanelTreeItem | null): void { this.m_parent = parent }

    childAtId(id: string, type: LayoutPanelItemType): AbstractLayoutPanelTreeItem | null {
        return this.m_children.find(item => item.m_id === id && item.m_type === type) ?? null
    }

    childAtRow(row: number): AbstractLayoutPanelTreeItem | null {
        return row >= 0 && row < this.m_children.length ? this.m_children[row] : null
    }

    childItems(): readonly AbstractLayoutPanelTreeItem[] { return this.m_children }

    childType(row: number): LayoutPanelItemType {
        return this.childAtRow(row)?.type() ?? LayoutPanelItemType.UNDEFINED
    }

    appendChild(child: AbstractLayoutPanelTreeItem | null): void {
        if (!child) {
            return
        }
        child.setParentItem(this)
        this.m_children.push(child)
        if (this.isSelected()) {
            child.setIsSelected(true)
        }
    }

    insertChild(child: AbstractLayoutPanelTreeItem | null, beforeRow: number): void {
        if (!child) {
            return
        }
        child.setParentItem(this)
        this.m_children.splice(beforeRow, 0, child)
        if (this.isSelected()) {
            child.setIsSelected(true)
        }
    }

    isEmpty(): boolean { return this.m_children.length === 0 }
    childCount(): number { return this.m_children.length }

    row(): number {
        return this.m_parent ? this.m_parent.m_children.indexOf(this) : 0
    }

    setTitle(title: string): void { this.m_title = title }

    setIsVisible(isVisible: boolean, setChildren = true): void {
        if (this.m_isVisible === isVisible) {
            return
        }
        this.m_isVisible = isVisible
        this.onIsVisibleChanged(isVisible)
        if (setChildren) {
            for (const child of this.m_children) {
                child.setIsVisible(isVisible)
            }
        }
    }

    /** C++ isVisibleChanged signal */
    protected onIsVisibleChanged(_isVisible: boolean): void {
    }

    setId(id: string): void { this.m_id = id }

    setIsExpandable(expandable: boolean): void { this.m_isExpandable = expandable }

    setSettingsAvailable(available: boolean): void {
        this.m_settingsAvailable = available
        if (!available) {
            this.setSettingsEnabled(false)
        }
    }

    setSettingsEnabled(enabled: boolean): void { this.m_settingsEnabled = enabled }
    setIsRemovable(removable: boolean): void { this.m_isRemovable = removable }
    setIsSelectable(selectable: boolean): void { this.m_isSelectable = selectable }

    setIsSelected(selected: boolean): void {
        if (this.m_isSelected === selected) {
            return
        }
        for (const child of this.m_children) {
            child.setIsSelected(selected)
        }
        this.m_isSelected = selected
    }

    masterNotation(): LayoutPanelNotation { return this.m_masterNotation }
    notation(): LayoutPanelNotation { return this.m_notation }

    /** the score of notation() */
    score(): Score { return this.m_notation.score }
    /** the score of masterNotation() */
    masterScore(): Score { return this.m_masterNotation.score }

    /** C++ notation()->parts() for changes; null if the score cannot be changed */
    notationParts(): LayoutPanelNotationParts | null { return this.m_notation.parts }
    /** C++ masterNotation()->parts() */
    masterNotationParts(): LayoutPanelNotationParts | null { return this.m_masterNotation.parts }
}
