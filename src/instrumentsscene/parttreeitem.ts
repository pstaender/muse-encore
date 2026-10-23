/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/parttreeitem.h/.cpp
 * replaceInstrument and the question of resetAllFormatting are the app's (the instrument settings popup).
 */

import type { Part } from '../engraving/dom/part'
import type { Score } from '../engraving/dom/score'
import {
    AbstractLayoutPanelTreeItem, InsertMode, MoveParams, partById, type LayoutPanelNotation,
} from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'

/** C++ Instrument::nameAsPlainText() + String::simplified() */
export function partTitle(part: Part): string {
    const name = part.instrument().longNames()[0]?.toPlainText() ?? ''
    return name.replace(/\s+/g, ' ').trim()
}

export class PartTreeItem extends AbstractLayoutPanelTreeItem {
    private m_part: Part | null = null
    private m_partExists = false
    private m_ignoreVisibilityChange = true

    constructor(masterNotation: LayoutPanelNotation, notation: LayoutPanelNotation) {
        super(LayoutPanelItemType.PART, masterNotation, notation)
        this.setIsSelectable(true)
    }

    init(masterPart: Part): void {
        let part = partById(this.score(), masterPart.id())
        this.m_partExists = part !== null
        const visible = this.m_partExists && part!.show()

        if (!part) {
            part = masterPart
        }

        this.setId(part.id())
        this.setTitle(partTitle(part))
        this.setIsVisible(visible)
        this.setSettingsAvailable(this.m_partExists)
        this.setSettingsEnabled(this.m_partExists)
        this.setIsExpandable(this.m_partExists)
        this.setIsRemovable(this.m_partExists)

        this.m_part = part
        this.m_ignoreVisibilityChange = false
    }

    part(): Part | null { return this.m_part }

    override onScoreChanged(): void {
        if (!this.m_part) {
            return
        }
        this.setTitle(partTitle(this.m_part))
        this.m_ignoreVisibilityChange = true
        this.setIsVisible(this.m_partExists && this.m_part.show())
        this.m_ignoreVisibilityChange = false
    }

    /** C++ listenVisibilityChanged */
    protected override onIsVisibleChanged(isVisible: boolean): void {
        if (this.m_ignoreVisibilityChange) {
            return
        }
        const parts = this.notationParts()
        if (!parts) {
            return
        }
        if (partById(this.score(), this.id())) {
            parts.setPartVisible(this.id(), isVisible)
        } else if (isVisible) {
            this.createAndAddPart(this.id())
        }
    }

    private createAndAddPart(masterPartId: string): void {
        const masterPart = partById(this.masterScore(), masterPartId)
        if (!masterPart) {
            return
        }

        const index = this.resolveNewPartIndex(masterPartId)

        this.notationParts()?.insertPart(masterPart.clone(), index)
    }

    private resolveNewPartIndex(partId: string): number {
        const parent = this.parentItem()
        if (!parent) {
            return 0
        }

        let partFound = false
        let firstVisiblePartId = ''

        for (const item of parent.childItems()) {
            if (item.id() === partId) {
                partFound = true
                continue
            }

            if (!partFound) {
                continue
            }

            if (item.isVisible()) {
                firstVisiblePartId = item.id()
                break
            }
        }

        const parts = this.score().parts()

        for (let i = 0; i < parts.length; ++i) {
            if (parts[i].id() === firstVisiblePartId) {
                return i
            }
        }

        return parts.length
    }

    /** PartTreeItem::resetAllFormatting after the user confirmed the question (the app asks) */
    resetAllFormatting(): void {
        const masterPart = partById(this.masterScore(), this.id())
        if (!masterPart) {
            return
        }
        this.notationParts()?.replacePart(this.id(), masterPart.clone())
    }

    override buildMoveParams(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem, destinationRow: number): MoveParams {
        const moveParams = new MoveParams()
        const stavesIds: string[] = []
        for (let i = sourceRow; i < sourceRow + count; ++i) {
            stavesIds.push(this.childAtRow(i)!.id())
        }
        moveParams.objectIdListToMove = stavesIds

        let destinationRowLast = destinationRow
        let moveMode = InsertMode.Before

        // exclude the control item
        if (destinationRow === destinationParent.childCount() - 1) {
            destinationRowLast = destinationRow - 1
            moveMode = InsertMode.After
        }

        const destinationStaffItem = destinationParent.childAtRow(destinationRowLast)
        moveParams.destinationObjectId = destinationStaffItem?.id() ?? ''
        moveParams.insertMode = moveMode
        moveParams.objectsType = LayoutPanelItemType.STAFF

        return moveParams
    }

    override moveChildren(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem, destinationRow: number,
        updateNotation: boolean): void {
        if (updateNotation) {
            this.moveChildrenOnScore(this.buildMoveParams(sourceRow, count, destinationParent, destinationRow))
        }
        super.moveChildren(sourceRow, count, destinationParent, destinationRow, updateNotation)
    }

    override moveChildrenOnScore(params: MoveParams): void {
        this.notationParts()?.moveStaves(params.objectIdListToMove, params.destinationObjectId, params.insertMode)
    }

    override removeChildren(row: number, count = 1, deleteChild = false): void {
        const stavesIds: string[] = []
        for (let i = row; i < row + count; ++i) {
            stavesIds.push(this.childAtRow(i)!.id())
        }

        // Remove the children first, then remove the staves
        // so we don't try to remove them twice when notified by removeStaves()
        super.removeChildren(row, count, deleteChild)

        if (deleteChild) {
            this.masterNotationParts()?.removeStaves(stavesIds)
        }
    }

    override canAcceptDrop(item: AbstractLayoutPanelTreeItem): boolean {
        if (item.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            return true
        }
        return super.canAcceptDrop(item)
    }

    instrumentId(): string {
        return this.m_part?.instrumentId() ?? ''
    }
}
