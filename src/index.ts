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
import { Fraction } from './engraving/types/fraction'
import { DPI } from './engraving/types/types'
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

export interface DrawPageOptions {
    /** pixels per inch of the canvas (default 100) */
    dpi?: number
    /** fill the page with white before drawing (default true) */
    background?: boolean
    /** draw like printing: invisible elements are skipped (default true) */
    printing?: boolean
}

/**
 * Draws one page onto a 2D canvas context. The canvas should have the size pageSize() * dpi
 * (multiply with window.devicePixelRatio and pass a correspondingly higher dpi for sharp output on HiDPI screens).
 */
export function drawPage(score: MasterScore, pageIdx: number, ctx: Canvas2D, options: DrawPageOptions = {}): void {
    const dpi = options.dpi ?? 100
    const scale = dpi / DPI
    const provider = new CanvasPaintProvider(ctx, new Transform(scale, 0, 0, scale, 0, 0))
    const painter = new Painter(provider, fontProvider(), 'page_' + pageIdx)
    Paint.paintScore(painter, score, {
        fromPage: pageIdx,
        toPage: pageIdx,
        isPrinting: options.printing ?? true,
        printPageBackground: options.background ?? true,
    })
}
