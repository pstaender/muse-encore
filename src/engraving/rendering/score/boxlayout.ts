/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/boxlayout.h/.cpp
 *
 * TODO(port): FBox (fret diagram frames)
 */

import { PointF } from '../../../framework/draw/types/geometry'
import { FontMetrics } from '../../../framework/draw/fontmetrics'
import { DPMM, ElementType } from '../../types/types'
import { Pid } from '../../dom/property'
import type { Box, HBox, TBox, VBox } from '../../dom/box'
import type { LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'

export class BoxLayout {
    static layoutBox(item: Box, ctx: LayoutContext): void {
        switch (item.type()) {
        case ElementType.HBOX:
            BoxLayout.layoutHBox(item as HBox, ctx)
            break
        case ElementType.VBOX:
            BoxLayout.layoutVBox(item as VBox, ctx)
            break
        case ElementType.TBOX:
            BoxLayout.layoutTBox(item as TBox, ctx)
            break
        default:
            break
        }
    }

    static layoutBaseBox(item: Box, ctx: LayoutContext): void {
        TLayout.layoutBaseMeasureBase(item, ctx)
    }

    static layoutHBox(item: HBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const parent = item.explicitParent()
        if (parent && parent.isVBox()) {
            const parentVBox = parent as unknown as VBox
            const x = parentVBox.leftMargin() * DPMM
            const y = parentVBox.topMargin() * DPMM
            const w = item.absoluteFromSpatium(item.boxWidth())
            const h = parentVBox.ldata().bbox().height() - (parentVBox.topMargin() + parentVBox.bottomMargin()) * DPMM
            ldata.setPos(x, y)
            ldata.setBbox(0.0, 0.0, w, h)
        } else if (item.system()) {
            const parentSystem = item.system()!
            if (!ldata.isSetPos()) {
                ldata.setPos(new PointF())
            }
            ldata.setBbox(item.absoluteFromSpatium(item.topGap()), 0.0, item.absoluteFromSpatium(item.boxWidth()),
                          parentSystem.ldata().bbox().height())
        } else {
            ldata.setPos(new PointF())
            ldata.setBbox(0.0, 0.0, 50, 50)
        }
        BoxLayout.layoutBaseBox(item, ctx)
    }

    static layoutHBox2(item: HBox, ctx: LayoutContext): void {
        BoxLayout.layoutBaseBox(item, ctx)
    }

    static layoutVBox(item: VBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        ldata.setPos(new PointF())

        if (item.system()) {
            const parentSystem = item.system()!
            ldata.setBbox(0.0, 0.0, parentSystem.ldata().bbox().width(), item.absoluteFromSpatium(item.boxHeight()))
        } else {
            ldata.setBbox(0.0, 0.0, 50, 50)
        }

        for (const e of item.el()) {
            TLayout.layoutItem(e, ctx)
        }

        const boxAutoSize = item.getProperty(Pid.BOX_AUTOSIZE) as boolean
        let heightChanged = false
        if (boxAutoSize) {
            let contentHeight = item.contentRect().height()

            if (contentHeight < item.minHeight()) {
                contentHeight = item.minHeight()
            }

            ldata.setHeight(contentHeight)
            heightChanged = true
        }

        // MScore::noImages is false

        if (heightChanged) {
            for (const e of item.el()) {
                TLayout.layoutItem(e, ctx)
            }
        }
    }

    static layoutTBox(item: TBox, ctx: LayoutContext): void {
        const ldata = item.mutldata()
        const parentSystem = item.system()!

        ldata.setPos(new PointF())
        ldata.setBbox(0.0, 0.0, parentSystem.ldata().bbox().width(), 0)

        const text = item.text()
        TLayout.layoutText(text, ctx)

        const textLD = text.mutldata()

        let h: number
        if (text.empty()) {
            h = new FontMetrics(text.font()).ascent()
        } else {
            h = textLD.bbox().height()
        }
        const y = item.topMargin() * DPMM
        textLD.setPos(item.leftMargin() * DPMM, y)
        h += item.topMargin() * DPMM + item.bottomMargin() * DPMM
        ldata.setBbox(0.0, 0.0, parentSystem.width(), h)

        TLayout.layoutBaseMeasureBase(item, ctx) // layout LayoutBreak's
    }
}
