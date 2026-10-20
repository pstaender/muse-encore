/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Public library API: load .mscz/.mscx files, lay them out and paint pages onto a canvas.
 * Framework independent; works in browsers and in node (with a canvas implementation).
 */

import { CanvasPaintProvider, type Canvas2D } from './framework/draw/canvaspaintprovider'
import { Painter } from './framework/draw/painter'
import { Transform } from './framework/draw/types/transform'
import { PointF, RectF } from './framework/draw/types/geometry'
import { Fraction } from './engraving/types/fraction'
import { DPI } from './engraving/types/types'
import { Sid } from './engraving/style/styledef'
import { fontProvider } from './engraving/infrastructure/engravingcontext'
import { loadScore as loadMasterScore } from './engraving/rw/mscloader'
import { EngravingCompat } from './engraving/compat/engravingcompat'
import type { MasterScore } from './engraving/dom/masterscore'
import { ScoreRenderer } from './engraving/rendering/score/scorerenderer'
import { Paint } from './engraving/rendering/score/paint'

export { initEngravingFonts, fontsInitialized, type FontFileLoader } from './engraving/engravingmodule'
export { MscLoadError } from './engraving/rw/mscloader'
export type { MasterScore } from './engraving/dom/masterscore'
export type { Score } from './engraving/dom/score'
export type { Canvas2D } from './framework/draw/canvaspaintprovider'
export {
    setFallbackFontEngine, createCanvasFallbackFontEngine, type FallbackFontEngine, type FallbackFont,
} from './framework/draw/internal/fontprovider'

/** Reads a .mscz (zip) or .mscx (xml) file. Fonts must be initialized before (initEngravingFonts). */
export function loadScore(data: Uint8Array | ArrayBuffer): MasterScore {
    return loadMasterScore(data)
}

/** Lays out the whole score (pages, systems, measures, ...) */
export function layoutScore(score: MasterScore): void {
    // MuseScore lays out a loaded score twice (EngravingProject::loadMscz and NotationProject::doLoad) and some
    // results depend on the previous pass (e.g. chord shapes include the lyrics bboxes, which are only laid out
    // after the chord shapes are filled), so do the same to get identical results.
    // The compatibility conversions for older files run between and after these passes (NotationProject::load).
    const firstLayout = !s_compatDone.has(score)
    ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))
    if (firstLayout) {
        s_compatDone.add(score)
        EngravingCompat.doPreLayoutCompatIfNeeded(score)
    }
    ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))
    if (firstLayout && EngravingCompat.doPostLayoutCompatIfNeeded(score)) {
        ScoreRenderer.layoutScore(score, new Fraction(0, 1), new Fraction(-1, 1))
    }
}

const s_compatDone = new WeakSet<MasterScore>()

export function pageCount(score: MasterScore): number {
    return score.npages()
}

/** page size in inches */
export function pageSize(score: MasterScore, pageIdx = 0): { width: number; height: number } {
    const bbox = score.pages()[pageIdx]?.ldata().bbox()
    if (!bbox) {
        const s = Paint.pageSizeInch(score)
        return { width: s.width(), height: s.height() }
    }
    return { width: bbox.width() / DPI, height: bbox.height() / DPI }
}

/** true if the score is laid out for two-sided printing (style "pageTwosided"): odd pages are right-hand pages */
export function isTwoSided(score: MasterScore): boolean {
    return score.style().styleB(Sid.pageTwosided)
}

/** score title (metaTag "workTitle" or the first title text), empty if none */
export function scoreTitle(score: MasterScore): string {
    return score.metaTag('workTitle') || ''
}

export interface DrawPageOptions {
    /** pixels per inch of the canvas (default 100) */
    dpi?: number
    /** fill the page with white before drawing (default true) */
    background?: boolean
    /** draw like printing: invisible elements are skipped (default true) */
    printing?: boolean
    /**
     * draw only this part of the page (in canvas pixels at `dpi`, relative to the page's top left corner); the canvas
     * then has the size of the region. Used to draw sharp tiles at high zoom without a huge page bitmap.
     */
    region?: { x: number; y: number; width: number; height: number }
}

/**
 * Draws one page onto a 2D canvas context. The canvas should have the size pageSize() * dpi
 * (multiply with window.devicePixelRatio and pass a correspondingly higher dpi for sharp output on HiDPI screens).
 */
export function drawPage(score: MasterScore, pageIdx: number, ctx: Canvas2D, options: DrawPageOptions = {}): void {
    const dpi = options.dpi ?? 100
    const scale = dpi / DPI
    const r = options.region
    const provider = new CanvasPaintProvider(ctx, new Transform(scale, 0, 0, scale, r ? -r.x : 0, r ? -r.y : 0))
    const painter = new Painter(provider, fontProvider(), 'page_' + pageIdx)
    let frameRect: RectF | undefined
    if (r) {
        // the region in score coordinates: only the items intersecting it are painted
        const pagePos = score.pages()[pageIdx]?.pos() ?? new PointF()
        frameRect = new RectF(r.x / scale, r.y / scale, r.width / scale, r.height / scale).translated(pagePos)
    }
    Paint.paintScore(painter, score, {
        fromPage: pageIdx,
        toPage: pageIdx,
        isPrinting: options.printing ?? true,
        printPageBackground: options.background ?? true,
        frameRect,
    })
}
