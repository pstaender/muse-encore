/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/paint.h/.cpp
 */

import { Color } from '../../../framework/draw/types/color'
import { RectF, SizeF } from '../../../framework/draw/types/geometry'
import type { Painter } from '../../../framework/draw/painter'
import { DPI } from '../../types/types'
import { Sid } from '../../style/styledef'
import type { EngravingItem } from '../../dom/engravingitem'
import type { Page } from '../../dom/page'
import type { Score } from '../../dom/score'
import type { PaintOptions } from '../paintoptions'
import { TDraw } from './tdraw'

/** IScoreRenderer::ScorePaintOptions (without the printing/pdf device options) */
export interface ScorePaintOptions extends PaintOptions {
    fromPage?: number
    toPage?: number
    /** draw all pages at their positions (otherwise every page at 0,0) */
    isMultiPage?: boolean
    printPageBackground?: boolean
    frameRect?: RectF
    onNewPage?: () => void
    onPaintPageSheet?: (painter: Painter, page: Page, pageRect: RectF) => void
}

/** C++ elementLessThan */
export function elementLessThan(e1: EngravingItem, e2: EngravingItem): boolean {
    if (e1.z() === e2.z()) {
        if (e1.selected() && !e2.selected()) {
            return false
        }
        if (!e1.selected() && e2.selected()) {
            return true
        }
        if (e1.visible() && !e2.visible()) {
            return false
        }
        if (!e1.visible() && e2.visible()) {
            return true
        }
        return e1.track() < e2.track()
    }
    return e1.z() < e2.z()
}

export class Paint {
    static paintScore(painter: Painter, score: Score, opt: ScorePaintOptions = {}): void {
        const pages = score.pages()
        if (pages.length === 0) {
            return
        }

        painter.setAntialiasing(true)

        const wasPrinting = score.printing()
        score.setPrinting(!!opt.isPrinting)

        const fromPage = opt.fromPage !== undefined && opt.fromPage >= 0 ? opt.fromPage : 0
        const toPage = opt.toPage !== undefined && opt.toPage >= 0 && opt.toPage < pages.length ? opt.toPage : pages.length - 1

        let firstPage = true
        for (let pi = fromPage; pi <= toPage; ++pi) {
            const page = pages[pi]
            const pagePos = page.pos()
            const pageRect = page.ldata().bbox().clone()

            let drawRect: RectF
            const pageAbsRect = pageRect.translated(pagePos)
            if (opt.frameRect && opt.frameRect.isValid()) {
                if (pageAbsRect.right() < opt.frameRect.left()) {
                    continue
                }
                if (pageAbsRect.left() > opt.frameRect.right()) {
                    break
                }
                drawRect = opt.frameRect
            } else {
                drawRect = pageAbsRect
            }

            if (!firstPage) {
                opt.onNewPage?.()
            }
            firstPage = false

            painter.beginObject('page_' + pi)

            if (opt.isMultiPage) {
                painter.translate(pagePos)
            }

            // Draw page sheet
            if (opt.onPaintPageSheet) {
                opt.onPaintPageSheet(painter, page, pageRect)
            } else if (opt.printPageBackground) {
                painter.fillRect(pageRect, Color.WHITE)
            }

            // Draw page elements
            let disableClipping = false
            if (!painter.hasClipping()) {
                painter.setClipRect(pageRect)
                disableClipping = true
            }

            const elements = Paint.pageItems(page, drawRect.translated(pagePos.times(-1)))
            Paint.paintItems(painter, elements, opt)

            if (disableClipping) {
                painter.setClipping(false)
            }

            painter.endObject() // page

            if (opt.isMultiPage) {
                painter.translate(pagePos.times(-1))
            }
        }

        score.setPrinting(wasPrinting)
    }

    /** Page::items(rect) */
    static pageItems(page: Page, rect: RectF): EngravingItem[] {
        return page.items(rect)
    }

    static pageSizeInch(score: Score): SizeF {
        if (score.npages() > 0) {
            const bbox = score.pages()[0].ldata().bbox()
            return new SizeF(bbox.width() / DPI, bbox.height() / DPI)
        }
        return new SizeF(score.style().styleD(Sid.pageWidth), score.style().styleD(Sid.pageHeight))
    }

    static paintItem(painter: Painter, item: EngravingItem, opt: PaintOptions): void {
        if (item.ldata().isSkipDraw()) {
            return
        }
        const itemPosition = item.pagePos()
        painter.translate(itemPosition)
        TDraw.drawItem(item, painter, opt)
        painter.translate(itemPosition.times(-1))
    }

    static paintItems(painter: Painter, items: readonly EngravingItem[], opt: PaintOptions): void {
        const sortedItems = [...items].sort((a, b) => elementLessThan(a, b) ? -1 : elementLessThan(b, a) ? 1 : 0)
        for (const item of sortedItems) {
            if (!item.isInteractionAvailable()) {
                continue
            }
            Paint.paintItem(painter, item, opt)
        }
    }
}
