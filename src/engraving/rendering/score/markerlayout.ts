/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/markerlayout.h/.cpp
 */

import { AlignH } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Pid } from '../../dom/property'
import type { BarLine } from '../../dom/barline'
import type { Marker } from '../../dom/marker'
import type { Measure } from '../../dom/measure'
import type { TextFragment } from '../../dom/textbase'
import type { LayoutContext } from './layoutcontext'
import { TextLayout } from './textlayout'
import { Autoplace } from './autoplace'

export class MarkerLayout {
    static layoutMarker(item: Marker, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        MarkerLayout.doLayoutMarker(item, ctx)

        const customTextOffset = MarkerLayout.computeCustomTextOffset(item, ctx)
        ldata.moveX(-customTextOffset)

        Autoplace.autoplaceMeasureElement(item, ldata)
    }

    private static doLayoutMarker(item: Marker, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const measure = item.parentItem() as Measure

        // If "Center on symbol" is on, override user position. Restore later
        const userPosition = item.getProperty(Pid.POSITION) as AlignH
        const hPos = item.centerOnSymbol() && item.symbolString().length ? AlignH.HCENTER : item.getProperty(Pid.POSITION) as AlignH
        item.setPosition(hPos)

        TextLayout.layoutBaseTextBase(item, ctx)

        // Adjust for barline
        const rightMarker = item.isRightMarker()
        let xAdj = 0.0
        let blWidth = 0.0
        if (rightMarker) {
            xAdj = measure ? measure.width() : 0.0
        }

        const startRepeat = rightMarker ? !!measure.nextMeasure() && measure.nextMeasure()!.repeatStart() : measure.repeatStart()
        const endRepeat = rightMarker ? measure.repeatEnd() : !!measure.prevMeasure() && measure.prevMeasure()!.repeatEnd()

        const avoidBarline = item.staffIdx() !== 0 && hPos !== AlignH.HCENTER

        if (!avoidBarline) {
            if (startRepeat) {
                blWidth = -ctx.conf().styleS(Sid.endBarWidth).val() * item.spatium()
            } else if (endRepeat) {
                blWidth = ctx.conf().styleS(Sid.endBarWidth).val() * item.spatium()
            } else if ((measure.isFirstInSystem() || (measure.prev() && !measure.prev()!.isMeasure())) && !rightMarker) {
                // Start of score
                const bl = measure.startBarLine()
                blWidth = bl ? -bl.width() : 0.0
            } else {
                const blMeasure = rightMarker ? measure : measure.prevMeasure()
                const bl = blMeasure ? blMeasure.endBarLine() : null
                blWidth = bl ? bl.width() : 0.0
            }

            switch (hPos) {
            case AlignH.LEFT:
            case AlignH.JUSTIFY:
                xAdj -= startRepeat ? 0.0 : blWidth
                break
            case AlignH.HCENTER:
                xAdj -= +blWidth / 2
                break
            case AlignH.RIGHT:
                xAdj -= (startRepeat ? blWidth : 0.0)
                break
            }
        } else {
            const blIdx = item.staffIdx() - 1

            let bl: BarLine | null = null
            if (startRepeat) {
                const blMeasure = rightMarker ? measure.nextMeasure() : measure
                bl = blMeasure ? blMeasure.startBarLine(blIdx) : null
            } else {
                const blMeasure = rightMarker ? measure : measure.prevMeasure()
                bl = blMeasure ? blMeasure.endBarLine(blIdx) : null
            }

            let blPadding = 0.0
            if (avoidBarline && bl) {
                const fontSizeScaleFactor = item.size() / 10.0
                blPadding = 0.5 * item.spatium() * fontSizeScaleFactor
            }

            if (hPos === AlignH.LEFT) {
                blWidth = startRepeat ? bl!.width() : 0.0
                xAdj += blPadding + blWidth
            } else if (hPos === AlignH.RIGHT) {
                blWidth = startRepeat ? 0.0 : bl!.width()
                xAdj -= blWidth + blPadding
            }
        }

        item.setPosition(userPosition)
        ldata.moveX(xAdj)
    }

    private static computeCustomTextOffset(item: Marker, ctx: LayoutContext): number {
        const ldata = item.ldata()
        const referenceString = item.symbolString()

        const centerOnSymbol = item.centerOnSymbol() && referenceString.length > 0
        if (!centerOnSymbol) {
            return 0.0
        }

        if (item.xmlText() === referenceString) {
            return 0.0
        }

        const referenceMarker = item.clone() as Marker
        referenceMarker.setXmlText(referenceString)
        MarkerLayout.doLayoutMarker(referenceMarker, ctx)

        let referenceFragment: TextFragment | null = null
        const refBlocks = referenceMarker.ldata().blocks
        if (refBlocks.length) {
            const referenceBlock = refBlocks[0]
            if (referenceBlock.fragments().length) {
                referenceFragment = referenceBlock.fragments()[0]
            }
        }

        for (const block of ldata.blocks) {
            for (const fragment of block.fragments()) {
                if (fragment.text === (referenceFragment ? referenceFragment.text : '')) {
                    return ldata.pos().x() + fragment.pos.x() - referenceMarker.ldata().pos().x()
                           - (referenceFragment ? referenceFragment.pos.x() : 0)
                }
            }
        }

        return 0.0
    }
}
