/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/alignmentlayout.h/.cpp
 *
 * TODO(port): hammer-on/pull-off letters; optical centers of hairpin segments, fret diagrams and harmonies
 */

import { clamp, RealIsEqual } from '../../../framework/global/realfn'
import { AlignV, ElementType } from '../../types/types'
import type { Articulation } from '../../dom/articulation'
import type { FretDiagram } from '../../dom/fret'
import type { Dynamic } from '../../dom/dynamic'
import type { EngravingItem } from '../../dom/engravingitem'
import type { System } from '../../dom/system'
import type { TextBase } from '../../dom/textbase'
import { SystemLayout } from './systemlayout'
import type { HairpinSegment } from '../../dom/hairpin'
import type { Text } from '../../dom/text'
import type { HammerOnPullOff, HammerOnPullOffSegment } from '../../dom/hammeronpulloff'

export class AlignmentLayout {
    static alignHopoLetters(hopo: HammerOnPullOff, system: System): void {
        if (hopo.segmentsEmpty()) {
            return
        }

        const itemsToAlign: EngravingItem[] = []
        for (const seg of hopo.spannerSegments()) {
            if (seg.system() === system) {
                const hopoSegment = seg as HammerOnPullOffSegment
                for (const hopoText of hopoSegment.hopoText()) {
                    itemsToAlign.push(hopoText)
                }
                break
            }
        }

        if (itemsToAlign.length === 0) {
            return
        }

        const above = AlignmentLayout.isAbove(itemsToAlign[0])
        for (const item of itemsToAlign) {
            if (AlignmentLayout.isAbove(item) !== above) {
                return // Don't try to align items split above/below
            }
        }

        // TODO(port): tapping articulations
        AlignmentLayout.alignItemsGroup(itemsToAlign, system)
    }

    static alignItemsGroup(elements: readonly EngravingItem[], system: System): void {
        if (elements.length === 0) {
            return
        }
        let outermostY = AlignmentLayout.yOpticalCenter(elements[0])
        for (const element of elements) {
            const curY = AlignmentLayout.yOpticalCenter(element)
            outermostY = AlignmentLayout.isAbove(element) ? Math.min(outermostY, curY) : Math.max(outermostY, curY)
        }
        for (const element of elements) {
            AlignmentLayout.moveItemToY(element, outermostY, system)
        }
    }

    static alignItemsWithTheirSnappingChain(elements: readonly EngravingItem[], system: System): void {
        const alignedItems = new Set<EngravingItem>()

        let outermostY = 0.0
        let firstItem = true
        const computeOutermostY = (item: EngravingItem): void => {
            const curY = AlignmentLayout.yOpticalCenter(item)
            if (firstItem) {
                outermostY = curY
                firstItem = false
            } else {
                outermostY = item.placeAbove() ? Math.min(outermostY, curY) : Math.max(outermostY, curY)
            }
        }
        const moveElementsToOutermostY = (item: EngravingItem): void => {
            alignedItems.add(item)
            AlignmentLayout.moveItemToY(item, outermostY, system)
        }

        for (const item of elements) {
            if (alignedItems.has(item)) {
                continue
            }
            firstItem = true
            AlignmentLayout.scanConnectedItems(item, system, computeOutermostY)
            AlignmentLayout.scanConnectedItems(item, system, moveElementsToOutermostY)
        }
    }

    static alignStaffCenteredItems(elements: readonly EngravingItem[], system: System): void {
        const vecOfCurrentY: number[] = []
        const collectCurrentYandComputeEdges = (item: EngravingItem): void => {
            vecOfCurrentY.push(AlignmentLayout.yOpticalCenter(item))
        }

        let averageY = 0.0
        const limitAverageYInsideAvailableSpace = (item: EngravingItem): void => {
            const yCur = AlignmentLayout.yOpticalCenter(item)
            const intendedMove = averageY - yCur
            const info = item.ldata().staffCenteringInfo()
            const maxAllowedMove = clamp(intendedMove, -info.availableVertSpaceAbove, info.availableVertSpaceBelow)
            if (!RealIsEqual(maxAllowedMove, intendedMove)) {
                averageY += -intendedMove + maxAllowedMove
            }
        }

        const alignedItems = new Set<EngravingItem>()
        const moveElementsToAverageY = (item: EngravingItem): void => {
            alignedItems.add(item)
            AlignmentLayout.moveItemToY(item, averageY, system)
        }

        for (const item of elements) {
            if (alignedItems.has(item)) {
                continue
            }
            vecOfCurrentY.length = 0
            AlignmentLayout.scanConnectedItems(item, system, collectCurrentYandComputeEdges)
            averageY = vecOfCurrentY.reduce((a, b) => a + b, 0.0) / vecOfCurrentY.length
            AlignmentLayout.scanConnectedItems(item, system, limitAverageYInsideAvailableSpace)
            AlignmentLayout.scanConnectedItems(item, system, moveElementsToAverageY)
        }
    }

    static alignItemsForSystem(elements: readonly EngravingItem[], system: System): void {
        const staffItems = new Map<number, { itemsAbove: EngravingItem[]; itemsBelow: EngravingItem[] }>()
        for (const item of elements) {
            if (item.addToSkyline() && !item.excludeVerticalAlign()) {
                let g = staffItems.get(item.staffIdx())
                if (!g) {
                    g = { itemsAbove: [], itemsBelow: [] }
                    staffItems.set(item.staffIdx(), g)
                }
                (item.placeAbove() ? g.itemsAbove : g.itemsBelow).push(item)
            }
        }
        // std::map iterates in key order
        for (const key of [...staffItems.keys()].sort((a, b) => a - b)) {
            AlignmentLayout.alignItemsGroup(staffItems.get(key)!.itemsAbove, system)
            AlignmentLayout.alignItemsGroup(staffItems.get(key)!.itemsBelow, system)
        }
    }

    private static moveItemToY(item: EngravingItem, y: number, system: System): void {
        const curY = AlignmentLayout.yOpticalCenter(item)
        const yDiff = y - curY
        item.mutldata().moveY(yDiff)
        SystemLayout.updateSkylineForElement(item, system, yDiff)
    }

    private static yOpticalCenter(item: EngravingItem): number {
        let curY = item.pos().y()
        switch (item.type()) {
        case ElementType.DYNAMIC:
        case ElementType.EXPRESSION: {
            // Please keep `Dynamic::gripsPositions` in sync with this calculation
            curY += item.staffOffsetY()
            const text = item as TextBase
            const bboxHeight = item.ldata().bbox().height()
            switch (text.align().vertical) {
            case AlignV.TOP:
                curY += 0.5 * bboxHeight
                break
            case AlignV.VCENTER:
                break
            case AlignV.BOTTOM:
                curY -= 0.5 * bboxHeight
                break
            case AlignV.BASELINE:
                if (item.isDynamic()) {
                    curY -= 0.46 * item.spatium() * (item as Dynamic).symbolScale() // approximated half x-height of dynamic
                } else {
                    curY -= 0.5 * text.fontMetrics().xHeight()
                }
                break
            }
            break
        }
        case ElementType.HAIRPIN_SEGMENT: {
            const hairpinSeg = item as HairpinSegment
            if (hairpinSeg.hairpin().isLineType()) {
                let text: Text | null = hairpinSeg.text()
                if (!text) {
                    text = hairpinSeg.endText()
                }
                if (text) {
                    curY -= 0.5 * text.fontMetrics().xHeight()
                } else {
                    curY -= 0.5 * item.spatium()
                }
            }
            break
        }
        case ElementType.FRET_DIAGRAM:
            curY += (item as FretDiagram).ldata().gridHeight
            break
        case ElementType.HARMONY: {
            const parentItem = item.parentItem()
            if (parentItem && parentItem.isFretDiagram()) {
                curY += parentItem.pos().y()
            }
            break
        }
        default:
            break
        }
        return curY
    }

    private static scanConnectedItems(item: EngravingItem, system: System, func: (item: EngravingItem) => void): void {
        func(item)

        let snappedBefore = item.ldata().itemSnappedBefore()
        while (snappedBefore && snappedBefore.findAncestor(ElementType.SYSTEM) === system) {
            func(snappedBefore)
            snappedBefore = snappedBefore.ldata().itemSnappedBefore()
        }

        let snappedAfter = item.ldata().itemSnappedAfter()
        while (snappedAfter && snappedAfter.findAncestor(ElementType.SYSTEM) === system) {
            func(snappedAfter)
            snappedAfter = snappedAfter.ldata().itemSnappedAfter()
        }
    }

    private static isAbove(item: EngravingItem): boolean {
        return item.isArticulationFamily() ? (item as Articulation).ldata().up : item.placeAbove()
    }
}
