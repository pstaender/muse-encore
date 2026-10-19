/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/dynamicslayout.h/.cpp
 *
 * TODO(port): snapping to hairpins across system breaks (hairpins not ported)
 */

import { SmuflAnchorId, SymId } from '../../types/symid'
import { AlignH, DirectionV, VOICES, nidx } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Dynamic, dynamicSymId } from '../../dom/dynamic'
import { Pid } from '../../dom/property'
import { SegmentType, type Segment } from '../../dom/segment'
import type { TextBaseLayoutData, TextFragment } from '../../dom/textbase'
import type { LayoutConfiguration } from './layoutcontext'
import { TextLayout } from './textlayout'

export class DynamicsLayout {
    static layoutDynamic(item: Dynamic, ldata: TextBaseLayoutData, conf: LayoutConfiguration): void {
        DynamicsLayout.doLayoutDynamic(item, ldata, conf)

        // If the dynamic contains custom text, keep it aligned
        const customTextOffset = DynamicsLayout.computeCustomTextOffset(item, ldata, conf)
        ldata.moveX(-customTextOffset)

        if (item.autoplace() && item.avoidBarLines()) {
            DynamicsLayout.manageBarlineCollisions(item, ldata)
        }
    }

    private static doLayoutDynamic(item: Dynamic, ldata: TextBaseLayoutData, conf: LayoutConfiguration): void {
        ldata.disconnectSnappedItems()

        // TODO(port): findSnapBeforeHairpinAcrossSystemBreak

        const stType = item.staffType()
        if (stType && stType.isHiddenElementOnTab(Sid.dynamicsShowTabCommon, Sid.dynamicsShowTabSimple)) {
            ldata.setIsSkipDraw(true)
            return
        }
        ldata.setIsSkipDraw(false)

        item.setPlacementBasedOnVoiceAssignment(conf.styleV(Sid.dynamicsHairpinVoiceBasedPlacement) as DirectionV)

        // If "Center on notehead" is on, override user position. Restore later
        const userPosition = item.getProperty(Pid.POSITION) as AlignH
        const hPos = item.centerOnNotehead() ? AlignH.HCENTER : item.position()
        item.setPosition(hPos)
        TextLayout.layoutBaseTextBase(item)
        item.setPosition(userPosition)

        const s = item.segment()
        if (!s || (!item.centerOnNotehead() && item.position() === AlignH.LEFT)) {
            return
        }

        if (item.anchorToEndOfPrevious()) {
            DynamicsLayout.layoutDynamicToEndOfPrevious(item, ldata)
            return
        }

        if (!item.centerOnNotehead()) {
            return
        }

        // Use SMuFL optical center for dynamic if available
        const symId = dynamicSymId(item.dynamicType())
        const opticalCenter = item.symSmuflAnchor(symId, SmuflAnchorId.opticalCenter).x()
        if (symId !== SymId.noSym && opticalCenter) {
            const symWidth = item.symBbox(symId).width()
            let offset = symWidth / 2 - opticalCenter + item.symBbox(symId).left()
            const spatiumScaling = item.spatium() / conf.spatium()
            offset *= spatiumScaling
            ldata.moveX(offset)
        }
    }

    private static computeCustomTextOffset(item: Dynamic, ldata: TextBaseLayoutData, conf: LayoutConfiguration): number {
        if (!item.centerOnNotehead() || item.dynamicType() === 0 /* DynamicType::OTHER */) {
            return 0.0
        }

        const referenceString = Dynamic.dynInfo(item.dynamicType()).text
        if (item.xmlText() === referenceString) {
            return 0.0
        }

        // C++ lays out a copy of the dynamic with the reference text; here the item itself is laid out
        // with the reference text and then again with its own text
        const fragments: { text: string; x: number }[] = []
        for (const block of ldata.blocks) {
            for (const fragment of block.fragments()) {
                fragments.push({ text: fragment.text, x: fragment.pos.x() })
            }
        }
        const ownText = item.xmlText()
        item.setXmlText(referenceString)
        DynamicsLayout.doLayoutDynamic(item, item.mutldata(), conf)
        let referenceFragment: TextFragment | null = null
        const refBlocks = item.ldata().blocks
        if (refBlocks.length && refBlocks[0].fragments().length) {
            referenceFragment = refBlocks[0].fragments()[0]
        }
        const refText = referenceFragment ? referenceFragment.text : ''
        const refX = referenceFragment ? referenceFragment.pos.x() : 0.0
        item.setXmlText(ownText)
        DynamicsLayout.doLayoutDynamic(item, ldata, conf)

        for (const f of fragments) {
            if (f.text === refText) {
                return f.x - refX
            }
        }
        return 0.0
    }

    private static layoutDynamicToEndOfPrevious(item: Dynamic, ldata: TextBaseLayoutData): void {
        const curSegment = item.segment()
        let leftMostSegment: Segment = curSegment
        let prevSeg: Segment | null = curSegment
        while (true) {
            prevSeg = prevSeg!.prev1enabled()
            if (!prevSeg || !prevSeg.tick().eq(curSegment.tick())) {
                break
            }
            if (prevSeg.isActive() && prevSeg.hasElementsInStaff(item.staffIdx())) {
                leftMostSegment = prevSeg
                break
            }
        }
        const xDiff = curSegment.x() + curSegment.measure().x() - (leftMostSegment.x() + leftMostSegment.measure().x())
        ldata.setPosX(-xDiff - ldata.bbox().right() - 0.50 * item.spatium())
    }

    private static manageBarlineCollisions(item: Dynamic, ldata: TextBaseLayoutData): void {
        if (item.score().nstaves() <= 1 || item.anchorToEndOfPrevious() || !item.isStyled(Pid.OFFSET)) {
            return
        }
        const thisSegment = item.segment()
        if (!thisSegment) {
            return
        }
        const system = thisSegment.measure().system()
        if (!system) {
            return
        }

        const staffIdx = item.staffIdx()
        let barLineStaff = nidx
        if (item.placeAbove()) {
            // need to find the barline from the staff above
            // taking into account there could be invisible staves
            if (staffIdx === 0) {
                return
            }
            for (let staffIndex = staffIdx - 1; staffIndex >= 0; --staffIndex) {
                if (system.staff(staffIndex)!.show()) {
                    barLineStaff = staffIndex
                    break
                }
            }
        } else {
            barLineStaff = staffIdx
        }
        if (barLineStaff === nidx) {
            return
        }
        if (!item.score().staff(barLineStaff)!.barLineSpan()) {
            return // Barline doesn't extend through staves
        }

        const minBarLineDistance = 0.25 * item.spatium()
        const referenceBBox = ldata.bbox()

        // Check barlines to the right
        let rightBarLineSegment: Segment | null = null
        for (let segment: Segment | null = thisSegment; segment && segment.measure().system() === system; segment = segment.next1enabled()) {
            if (segment.segmentType() & SegmentType.BarLineType) {
                rightBarLineSegment = segment
                break
            }
        }
        if (rightBarLineSegment) {
            const e = rightBarLineSegment.element(barLineStaff * VOICES)
            if (e) {
                const rightMargin = e.ldata().bbox().translated(e.pagePos()).left()
                                    - referenceBBox.translated(item.pagePos().minus(item.offset())).right()
                                    - minBarLineDistance
                if (rightMargin < 0) {
                    ldata.moveX(rightMargin)
                }
            }
        }

        // Check barlines to the left
        let leftBarLineSegment: Segment | null = null
        for (let segment: Segment | null = thisSegment; segment && segment.measure().system() === system; segment = segment.prev1enabled()) {
            if (segment.segmentType() & SegmentType.BarLineType) {
                leftBarLineSegment = segment
                break
            }
        }
        if (leftBarLineSegment) {
            const e = leftBarLineSegment.element(barLineStaff * VOICES)
            if (e) {
                const leftMargin = referenceBBox.translated(item.pagePos().minus(item.offset())).left()
                                   - e.ldata().bbox().translated(e.pagePos()).right()
                                   - minBarLineDistance
                if (leftMargin < 0) {
                    ldata.moveX(-leftMargin)
                }
            }
        }
    }
}
