/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/page.h/.cpp
 */

import { PointF, type RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { DPI, ElementType, MAX_FOOTERS, MAX_HEADERS } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem } from './engravingitem'
import type { System } from './system'
import type { Measure } from './measure'
import type { Text } from './text'

export class Page extends EngravingItem {
    private m_systems: System[] = []
    private m_pageNumber = 0
    private m_headerTexts: (Text | null)[] = new Array(MAX_HEADERS).fill(null)
    private m_footerTexts: (Text | null)[] = new Array(MAX_FOOTERS).fill(null)

    constructor(parent: EngravingItem | null) {
        super(ElementType.PAGE, parent)
    }

    systems(): System[] { return this.m_systems }
    system(idx: number): System { return this.m_systems[idx] }

    appendSystem(s: System): void {
        s.moveToPage(this)
        this.m_systems.push(s)
    }

    pageNumber(): number { return this.m_pageNumber }
    setPageNumber(n: number): void { this.m_pageNumber = n }

    isOdd(): boolean {
        return ((this.m_pageNumber + 1 + this.score().pageNumberOffset()) & 1) !== 0
    }

    // margins in pixel
    tm(): number {
        const style = this.style()
        return ((!style.styleB(Sid.pageTwosided) || this.isOdd())
            ? style.styleD(Sid.pageOddTopMargin) : style.styleD(Sid.pageEvenTopMargin)) * DPI
    }

    bm(): number {
        const style = this.style()
        return ((!style.styleB(Sid.pageTwosided) || this.isOdd())
            ? style.styleD(Sid.pageOddBottomMargin) : style.styleD(Sid.pageEvenBottomMargin)) * DPI
    }

    lm(): number {
        const style = this.style()
        return ((!style.styleB(Sid.pageTwosided) || this.isOdd())
            ? style.styleD(Sid.pageOddLeftMargin) : style.styleD(Sid.pageEvenLeftMargin)) * DPI
    }

    rm(): number {
        const style = this.style()
        return (style.styleD(Sid.pageWidth) - style.styleD(Sid.pagePrintableWidth)) * DPI - this.lm()
    }

    override pagePos(): PointF { return new PointF() }

    override scanElements(func: (item: EngravingItem) => void): void {
        for (const s of this.m_systems) {
            for (const m of s.measures()) {
                m.scanElements(func)
            }
            s.scanElements(func)
        }
        func(this)
        for (const t of this.m_headerTexts) {
            if (t) {
                func(t)
            }
        }
        for (const t of this.m_footerTexts) {
            if (t) {
                func(t)
            }
        }
    }

    /** list of visible elements */
    elements(): EngravingItem[] {
        const el: EngravingItem[] = []
        this.scanElements(e => {
            if (e.collectForDrawing()) {
                el.push(e)
            }
        })
        return el
    }

    /**
     * Page::items(rect): the visible elements whose page bounding rectangle intersects rect (page coordinates).
     * C++ finds the candidates with a BSP tree (bsp.cpp) and filters them the same way; this is the linear equivalent
     * (TODO(port): BspTree, if hit testing gets too slow for large pages).
     */
    items(rect: RectF): EngravingItem[] {
        return this.elements().filter(e => e.pageBoundingRect().intersects(rect))
    }

    /** Page::items(point): the visible elements whose shape contains the point (page coordinates) */
    itemsAt(point: PointF): EngravingItem[] {
        return this.elements().filter(e => e.contains(point))
    }

    endTick(): Fraction {
        return this.m_systems.length ? this.m_systems[this.m_systems.length - 1].endTick() : new Fraction(-1, 1)
    }

    firstMeasure(): Measure | null {
        return this.m_systems.length ? this.m_systems[0].firstMeasure() : null
    }

    headerText(index: number): Text | null { return this.m_headerTexts[index] }
    footerText(index: number): Text | null { return this.m_footerTexts[index] }
    setHeaderText(index: number, t: Text | null): void { this.m_headerTexts[index] = t }
    setFooterText(index: number, t: Text | null): void { this.m_footerTexts[index] = t }
}
