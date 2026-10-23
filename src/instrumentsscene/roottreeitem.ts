/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/instrumentsscene/qml/MuseScore/InstrumentsScene/internal/roottreeitem.h/.cpp
 */

import type { Score } from '../engraving/dom/score'
import type { Staff } from '../engraving/dom/staff'
import {
    AbstractLayoutPanelTreeItem, InsertMode, MoveParams, partById, staffById, type LayoutPanelNotation,
} from './abstractlayoutpaneltreeitem'
import { LayoutPanelItemType } from './layoutpanelitemtype'
import type { PartTreeItem } from './parttreeitem'
import type { SystemObjectsLayerTreeItem } from './systemobjectslayertreeitem'

function isIndexInRange(index: number, start: number, end: number): boolean {
    return start <= index && index < end
}

export class RootTreeItem extends AbstractLayoutPanelTreeItem {
    constructor(masterNotation: LayoutPanelNotation, notation: LayoutPanelNotation) {
        super(LayoutPanelItemType.ROOT, masterNotation, notation)
    }

    override buildMoveParams(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem, destinationRow: number): MoveParams {
        // User is explicitly moving a system objects layer
        if (this.childType(sourceRow) === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            return this.buildSystemObjectsMoveParams(sourceRow, 1, destinationRow) // only 1 layer can be moved at a time
        }

        // User is going to place parts after a system objects layer
        // Update the system objects position on the score if the resulting parts order remains the same
        if (!this.partsOrderWillBeChanged(sourceRow, count, destinationRow)) {
            const newRow = sourceRow > destinationRow ? destinationRow : destinationRow - 1
            if (this.childType(newRow) === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
                return this.buildSystemObjectsMoveParams(sourceRow, count, newRow)
            }
        }

        return this.buildPartsMoveParams(sourceRow, count, destinationParent, destinationRow)
    }

    override moveChildren(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem, destinationRow: number,
        updateNotation: boolean): void {
        if (updateNotation) {
            this.moveChildrenOnScore(this.buildMoveParams(sourceRow, count, destinationParent, destinationRow))
        }
        super.moveChildren(sourceRow, count, destinationParent, destinationRow, updateNotation)
    }

    override moveChildrenOnScore(params: MoveParams): void {
        const parts = this.notationParts()
        if (!parts) {
            return
        }

        if (params.objectsType === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER && !params.destinationObjectId) {
            if (params.moveSysObjBelowBottomStaff) {
                parts.moveSystemObjectLayerBelowBottomStaff()
            } else {
                parts.removeSystemObjects(params.objectIdListToMove)
            }
            return
        }

        if (!params.isValid()) {
            return
        }

        if (params.objectsType === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            const systemObjectsLayerItem = this.childAtId(params.objectIdListToMove[0],
                LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) as SystemObjectsLayerTreeItem | null
            const dstStaff = staffById(this.score(), params.destinationObjectId)
            if (systemObjectsLayerItem && dstStaff && systemObjectsLayerItem.staff() !== dstStaff) {
                parts.moveSystemObjects(systemObjectsLayerItem.staff()!.id(), dstStaff.id())
                systemObjectsLayerItem.setStaff(dstStaff)
            }

            if (params.moveSysObjBelowBottomStaff) {
                parts.moveSystemObjectLayerBelowBottomStaff()
            } else if (params.moveSysObjAboveBottomStaff) {
                parts.moveSystemObjectLayerAboveBottomStaff()
            }
        } else {
            parts.moveParts(params.objectIdListToMove, params.destinationObjectId, params.insertMode)
        }
    }

    override removeChildren(row: number, count = 1, deleteChild = false): void {
        const partIds: string[] = []
        const stavesIds: string[] = []

        for (let i = row; i < row + count; ++i) {
            const child = this.childAtRow(i)!
            if (child.type() === LayoutPanelItemType.PART) {
                partIds.push(child.id())
            } else if (child.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
                stavesIds.push(child.id())
            }
        }

        if (deleteChild) {
            this.masterNotationParts()?.removeParts(partIds)
            this.masterNotationParts()?.removeSystemObjects(stavesIds)
        }

        super.removeChildren(row, count, deleteChild)
    }

    private partsOrderWillBeChanged(sourceRow: number, count: number, destinationRow: number): boolean {
        if (sourceRow > destinationRow) {
            for (let i = sourceRow - 1; i >= destinationRow; --i) {
                if (this.childType(i) === LayoutPanelItemType.PART) {
                    return true
                }
            }
        } else {
            for (let i = sourceRow + count; i < destinationRow; ++i) {
                if (this.childType(i) === LayoutPanelItemType.PART) {
                    return true
                }
            }
        }
        return false
    }

    private buildSystemObjectsMoveParams(sourceRow: number, count: number, destinationRow: number): MoveParams {
        const srcItem = this.childAtRow(sourceRow)
        const dstItem = this.childAtRow(destinationRow)
        if (!srcItem) {
            return new MoveParams()
        }

        let srcStaff: Staff | null = null
        let dstStaff: Staff | null = null

        if (srcItem.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER && destinationRow >= this.childCount()) {
            srcStaff = (srcItem as SystemObjectsLayerTreeItem).staff()!
            const staves = srcStaff.score().staves()
            dstStaff = staves[staves.length - 1]

            const moveParams = new MoveParams()
            moveParams.objectsType = LayoutPanelItemType.SYSTEM_OBJECTS_LAYER
            moveParams.objectIdListToMove.push(srcStaff.id())
            moveParams.destinationObjectId = dstStaff.id()
            moveParams.moveSysObjBelowBottomStaff = true
            return moveParams
        }

        if (!dstItem) {
            return new MoveParams()
        }

        const resolveDstStaff = (item: AbstractLayoutPanelTreeItem | null): Staff | null => {
            if (item) {
                if (item.type() === LayoutPanelItemType.PART) {
                    return (item as PartTreeItem).part()?.staff(0) ?? null
                } else if (item.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
                    return (item as SystemObjectsLayerTreeItem).staff()
                }
            }
            return null
        }

        if (srcItem.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            srcStaff = (srcItem as SystemObjectsLayerTreeItem).staff()
            dstStaff = resolveDstStaff(dstItem)
        } else if (dstItem.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER) {
            srcStaff = (dstItem as SystemObjectsLayerTreeItem).staff()
            if (sourceRow > destinationRow) {
                dstStaff = resolveDstStaff(this.childAtRow(sourceRow + count))
            } else {
                dstStaff = resolveDstStaff(srcItem)
            }
        }

        if (!srcStaff) {
            return new MoveParams()
        }

        const moveParams = new MoveParams()
        moveParams.objectsType = LayoutPanelItemType.SYSTEM_OBJECTS_LAYER
        moveParams.objectIdListToMove.push(srcStaff.id())

        if (dstStaff) {
            moveParams.destinationObjectId = dstStaff.id()
        }

        const moveUp = destinationRow < sourceRow
        const moveDown = destinationRow > sourceRow
        const sourceIsSystemObjectLayer = srcItem.type() === LayoutPanelItemType.SYSTEM_OBJECTS_LAYER
        const sourceIsPartLayer = srcItem.type() === LayoutPanelItemType.PART

        if (srcStaff.hasSystemObjectsBelowBottomStaff()) {
            if ((sourceIsSystemObjectLayer && moveUp) || (sourceIsPartLayer && moveDown)) {
                moveParams.moveSysObjAboveBottomStaff = true
            }
        } else if (sourceIsPartLayer && srcStaff.isLastOfScore() && moveUp) {
            moveParams.moveSysObjBelowBottomStaff = true
        }

        return moveParams
    }

    private buildPartsMoveParams(sourceRow: number, count: number, destinationParent: AbstractLayoutPanelTreeItem,
        destinationRow: number): MoveParams {
        const partIds: string[] = []
        for (let i = sourceRow; i < sourceRow + count; ++i) {
            const partId = this.childAtRow(i)!.id()
            if (partById(this.score(), partId)) {
                partIds.push(partId)
            }
        }

        const moveParams = new MoveParams()
        moveParams.objectsType = LayoutPanelItemType.PART
        moveParams.objectIdListToMove = partIds

        let destinationRow_ = destinationRow
        const childCount = destinationParent.childCount()
        const moveDown = destinationRow > sourceRow
        let moveMode = InsertMode.Before

        let destinationPartItem: AbstractLayoutPanelTreeItem | null = null
        do {
            destinationPartItem = destinationParent.childAtRow(destinationRow_)
            if (destinationPartItem) {
                if (destinationPartItem.type() === LayoutPanelItemType.PART) {
                    if (partById(this.score(), destinationPartItem.id())) {
                        break
                    }
                }
                destinationPartItem = null
            }

            if (moveDown) {
                destinationRow_--
                moveMode = InsertMode.After
            } else {
                destinationRow_++
                moveMode = InsertMode.Before
            }
        } while (isIndexInRange(destinationRow_, 0, childCount) && !isIndexInRange(destinationRow_, sourceRow, sourceRow + count))

        if (destinationPartItem) {
            moveParams.destinationObjectId = destinationPartItem.id()
        }

        moveParams.insertMode = moveMode
        return moveParams
    }
}
