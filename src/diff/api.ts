/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The public API of the score comparison (not in MuseScore, see scorediff.ts): the comparison, the pages drawn with
 * the differences marked like a text diff (the elements in the color of their side, the measures that differ with a
 * light background) and the rectangles of the differences. Rectangles are in inches from the top left of their page,
 * like the other view APIs.
 */

import type { Score } from '../engraving/dom/score'
import type { Measure } from '../engraving/dom/measure'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import { setItemColorOverride } from '../engraving/dom/engravingitem'
import { Color } from '../framework/draw/types/color'
import { RectF } from '../framework/draw/types/geometry'
import { Transform } from '../framework/draw/types/transform'
import { Painter } from '../framework/draw/painter'
import { CanvasPaintProvider, type Canvas2D } from '../framework/draw/canvaspaintprovider'
import { fontProvider } from '../engraving/infrastructure/engravingcontext'
import { Paint } from '../engraving/rendering/score/paint'
import { DPI } from '../engraving/types/types'
import type { DiffSideMarks } from './scorediff'

export {
    compareScores, defaultInstrumentPairs, diffInstruments, sameInstruments, showOnlyInstruments,
    type DiffHunk, type DiffInstrument, type DiffInstrumentPair, type DiffSideMarks, type ScoreDiffResult,
} from './scorediff'

/** the colors of a side: the marked elements and the background of the measures that differ (CSS colors) */
export interface DiffColors {
    item: string
    background: string
}

/** the colors of text diffs: red for the first score (removed), green for the second one (added) */
export const DIFF_COLORS_REMOVED: Readonly<DiffColors> = Object.freeze({ item: '#d1242f', background: 'rgba(255, 92, 92, 0.16)' })
export const DIFF_COLORS_ADDED: Readonly<DiffColors> = Object.freeze({ item: '#1a7f37', background: 'rgba(46, 160, 67, 0.16)' })

export interface DrawDiffPageOptions {
    /** pixels per inch of the canvas (default 100) */
    dpi?: number
    /** fill the page with white before drawing (default true) */
    background?: boolean
    /** draw only this part of the page (in canvas pixels at `dpi`, see DrawPageOptions.region) */
    region?: { x: number; y: number; width: number; height: number }
    /** the marks of this score and their colors; none: the page is drawn like drawPage */
    marks?: DiffSideMarks | null
    colors?: DiffColors
}

function cssColor(css: string): Color {
    const m = /^rgba?\(([^)]+)\)$/.exec(css.trim())
    if (m) {
        const [r, g, b, a = 1] = m[1].split(',').map(Number)
        return new Color(r, g, b, Math.round(a * 255))
    }
    return Color.fromString(css)
}

/** the items whose color is the color of their parent if the parent is marked (a note of a marked chord, ...) */
function markedColor(item: EngravingItem, marks: DiffSideMarks, color: Color): Color | null {
    let e: EngravingItem | null = item
    for (let depth = 0; e && depth < 6; ++depth) {
        if (marks.items.has(e)) {
            return color
        }
        if (e.isSpannerSegment()) {
            e = (e as unknown as { spanner(): EngravingItem }).spanner()
            continue
        }
        // texts, lyrics, articulations are compared by themselves: their parent's mark does not color them
        if (e.isTextBase() || e.isArticulationFamily?.() || e.isSegment() || e.isMeasure()) {
            return null
        }
        e = e.parentItem()
    }
    return null
}

/** the rectangle of a staff of a measure in page coordinates (score units) */
function measureStaffRect(m: Measure, staffIdx: number): RectF | null {
    const system = m.system()
    const page = system?.page()
    const ss = system?.staff(staffIdx)
    if (!system || !page || !ss || !ss.show()) {
        return null
    }
    const sp = m.spatium()
    const sysPos = system.pagePos()
    const lines = m.staffLines(staffIdx)
    const lr = lines.ldata().bbox()
    const top = sysPos.y() + ss.y() + Math.min(0, lr.top()) - 2 * sp
    const height = Math.max(lr.height(), 4 * sp) + 4 * sp
    return new RectF(m.pagePos().x(), top, m.ldata().bbox().width(), height)
}

/**
 * Draws a page like drawPage (printing), with the marks of the comparison: the measures that differ get the
 * background color, the elements the other score does not have the item color.
 */
export function drawDiffPage(score: Score, pageIdx: number, ctx: Canvas2D, options: DrawDiffPageOptions = {}): void {
    const dpi = options.dpi ?? 100
    const scale = dpi / DPI
    const r = options.region
    const provider = new CanvasPaintProvider(ctx, new Transform(scale, 0, 0, scale, r ? -r.x : 0, r ? -r.y : 0))
    const painter = new Painter(provider, fontProvider(), 'page_' + pageIdx)
    const page = score.pages()[pageIdx]
    let frameRect: RectF | undefined
    if (r && page) {
        frameRect = new RectF(r.x / scale, r.y / scale, r.width / scale, r.height / scale).translated(page.pos())
    }
    const marks = options.marks ?? null
    const colors = options.colors ?? DIFF_COLORS_REMOVED
    const itemColor = cssColor(colors.item)
    const background = cssColor(colors.background)
    const printBackground = options.background ?? true
    if (marks) {
        setItemColorOverride(item => markedColor(item, marks, itemColor))
    }
    try {
        Paint.paintScore(painter, score, {
            fromPage: pageIdx,
            toPage: pageIdx,
            isPrinting: true,
            printPageBackground: printBackground,
            frameRect,
            onPaintPageSheet: (p, pg, pageRect) => {
                if (printBackground) {
                    p.fillRect(pageRect, Color.WHITE)
                }
                if (!marks) {
                    return
                }
                for (const [m, staves] of marks.measures) {
                    if (m.system()?.page() !== pg) {
                        continue
                    }
                    for (const staffIdx of staves) {
                        const rect = measureStaffRect(m, staffIdx)
                        if (rect) {
                            p.fillRect(rect, background)
                        }
                    }
                }
            },
        })
    } finally {
        setItemColorOverride(null)
    }
}

/**
 * The rectangle of measures of a difference (the compared staves, on the page of the first measure), or null if the
 * measures are not laid out (e.g. hidden).
 */
export function diffMeasuresBounds(score: Score, measures: readonly Measure[], staves: readonly number[]):
    { page: number; x: number; y: number; width: number; height: number } | null {
    let rect: RectF | null = null
    let page: unknown = null
    for (const m of measures) {
        const pg = m.system()?.page()
        if (!pg || (page && pg !== page)) {
            continue
        }
        for (const staffIdx of staves) {
            const r = measureStaffRect(m, staffIdx)
            if (r) {
                page = pg
                rect = rect ? rect.united(r) : r
            }
        }
    }
    const pageIdx = page ? score.pages().indexOf(page as never) : -1
    if (!rect || pageIdx < 0) {
        return null
    }
    return { page: pageIdx, x: rect.x() / DPI, y: rect.y() / DPI, width: rect.width() / DPI, height: rect.height() / DPI }
}
