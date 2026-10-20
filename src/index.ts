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
import { SvgGlyphDefs, SvgPaintProvider } from './framework/draw/svgpaintprovider'
import { PointF, RectF } from './framework/draw/types/geometry'
import { Fraction } from './engraving/types/fraction'
import { DPI, DurationType, Key } from './engraving/types/types'
import { TimeSigType } from './engraving/dom/timesig'
import { ScoreOrder } from './engraving/dom/scoreorder'
import {
    TraitType, instrumentGenres as engravingInstrumentGenres, instrumentGroups, instrumentOrders, searchTemplate,
} from './engraving/dom/instrtemplate'
import { NotationProject, ProjectCreateOptions } from './project/internal/notationproject'
import { Sid } from './engraving/style/styledef'
import { fontProvider } from './engraving/infrastructure/engravingcontext'
import { MscLoader, loadScore as loadMasterScore } from './engraving/rw/mscloader'
import { MscReader } from './engraving/infrastructure/mscreader'
import { EngravingCompat } from './engraving/compat/engravingcompat'
import { MasterScore } from './engraving/dom/masterscore'
import { ScoreRenderer } from './engraving/rendering/score/scorerenderer'
import { Paint } from './engraving/rendering/score/paint'

export { initEngravingFonts, fontsInitialized, type FontFileLoader } from './engraving/engravingmodule'
export { MscLoadError } from './engraving/rw/mscloader'
export type { MasterScore } from './engraving/dom/masterscore'
export type { Score } from './engraving/dom/score'
export type { Canvas2D } from './framework/draw/canvaspaintprovider'
export { SvgGlyphDefs } from './framework/draw/svgpaintprovider'
export {
    setFallbackFontEngine, createCanvasFallbackFontEngine, type FallbackFontEngine, type FallbackFont,
} from './framework/draw/internal/fontprovider'

/** Reads a .mscz (zip) or .mscx (xml) file. Fonts must be initialized before (initEngravingFonts). */
export function loadScore(data: Uint8Array | ArrayBuffer): MasterScore {
    return loadMasterScore(data)
}

/**
 * Loads a template of share/templates (the .mscx file and the score_style.mss of its directory) as it is, e.g. for a
 * preview (MuseScore's TemplatePaintView); lay it out with layoutScore(). New scores are made with createScore().
 */
export function loadTemplate(mscx: string, style?: string | null): MasterScore {
    const encoder = new TextEncoder()
    const files = new Map<string, Uint8Array>([['template.mscx', encoder.encode(mscx)]])
    if (style) {
        files.set('score_style.mss', encoder.encode(style))
    }
    const score = new MasterScore()
    new MscLoader().loadMscz(score, MscReader.fromFiles(files, { mainFileName: 'template.mscx' }))
    return score
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

export interface DrawPageSvgOptions {
    /** fill the page with white before drawing (default true) */
    background?: boolean
    /** draw like printing: invisible elements are skipped (default true) */
    printing?: boolean
    /**
     * glyph definitions shared by several pages in one HTML document: the page then only references them
     * and `defs.svg()` must be added to the document once, after all pages are drawn.
     * Without it the SVG is standalone.
     */
    defs?: SvgGlyphDefs
}

/** Draws one page as SVG (vector graphics, size in inches, each glyph outline defined once and reused) */
export function drawPageSvg(score: MasterScore, pageIdx: number, options: DrawPageSvgOptions = {}): string {
    const provider = new SvgPaintProvider(options.defs ?? new SvgGlyphDefs(), options.defs ? `p${pageIdx}-` : '')
    const painter = new Painter(provider, fontProvider(), 'page_' + pageIdx)
    Paint.paintScore(painter, score, {
        fromPage: pageIdx,
        toPage: pageIdx,
        isPrinting: options.printing ?? true,
        printPageBackground: options.background ?? true,
    })
    const size = pageSize(score, pageIdx)
    const bbox = score.pages()[pageIdx]?.ldata().bbox() ?? new RectF(0, 0, size.width * DPI, size.height * DPI)
    return provider.svg(`${size.width}in`, `${size.height}in`, bbox, !options.defs)
}

// ---------------------------------------------------------------------------------------------------------------------
//   new scores (MuseScore's New Score dialog)
// ---------------------------------------------------------------------------------------------------------------------

/** Key.INVALID: "Open/Atonal" in the New Score dialog */
export const KEY_ATONAL: number = Key.INVALID

export type NewScoreTempoDuration = 'whole' | 'half' | 'quarter' | 'eighth' | '16th'

export interface NewScoreOptions {
    title?: string
    subtitle?: string
    composer?: string
    lyricist?: string
    copyright?: string
    /** instrument template ids in score order (from instrumentGroupList()); ignored when templateMscx is given */
    instruments: { id: string; soloist?: boolean }[]
    /**
     * score order id from scoreOrders(), or 'custom' (C++ customOrder()); like InstrumentsRepository::order() an
     * unknown id (incl. 'custom' and undefined) gives an empty order, which sets no brackets
     */
    order?: string
    /** the user moved instruments out of the order (C++ ScoreOrder::customized) */
    orderCustomized?: boolean
    /** a template file's contents (.mscx text from MuseScore/share/templates) instead of instruments */
    templateMscx?: string
    /** the score_style.mss of the template's directory (MuseScore reads it with the template, it holds the style) */
    templateStyle?: string
    /** Key -7..7 (C♭ major .. C♯ major), KEY_ATONAL for open/atonal */
    key: number
    timesig: { numerator: number; denominator: number }
    timesigType: 'normal' | 'common' | 'cut'
    /** number of measures (without the pickup measure) */
    measures: number
    /** pickup measure (anacrusis) length; null/undefined = no pickup measure */
    pickup?: { numerator: number; denominator: number } | null
    /** tempo marking; null/undefined = none */
    tempo?: { bpm: number; duration: NewScoreTempoDuration; dot: boolean } | null
}

/** the dialog's default tempo and pickup (used when the user enables them) */
export const DEFAULT_NEW_SCORE_TEMPO: Readonly<{ bpm: number; duration: NewScoreTempoDuration; dot: boolean }> =
    Object.freeze({ bpm: 120, duration: 'quarter', dot: false })
export const DEFAULT_NEW_SCORE_PICKUP: Readonly<{ numerator: number; denominator: number }> = Object.freeze({ numerator: 1, denominator: 4 })

/** the defaults of the New Score dialog (AdditionalInfoModel::init): C major, 4/4, 32 measures, no tempo, no pickup */
export function defaultNewScoreOptions(): NewScoreOptions {
    return {
        instruments: [],
        key: Key.C,
        timesig: { numerator: 4, denominator: 4 },
        timesigType: 'normal',
        measures: 32,
        pickup: null,
        tempo: null,
    }
}

const TEMPO_DURATIONS: Record<NewScoreTempoDuration, DurationType> = {
    whole: DurationType.V_WHOLE, half: DurationType.V_HALF, quarter: DurationType.V_QUARTER, eighth: DurationType.V_EIGHTH,
    '16th': DurationType.V_16TH,
}

/** InstrumentsRepository::order(): a copy of the order with that id, an empty order if there is none */
function repositoryOrder(orderId: string | undefined): ScoreOrder {
    const order = instrumentOrders().find(o => o.id === orderId)
    return order ? order.clone() : new ScoreOrder()
}

/**
 * Creates and lays out a new score like MuseScore's New Score dialog (NewScoreModel::parseOptions,
 * NotationProject::createNew / loadTemplate). Deterministic for the same options.
 */
export function createScore(options: NewScoreOptions): MasterScore {
    const projectOptions = new ProjectCreateOptions()
    projectOptions.title = options.title ?? ''
    projectOptions.subtitle = options.subtitle ?? ''
    projectOptions.composer = options.composer ?? ''
    projectOptions.lyricist = options.lyricist ?? ''
    projectOptions.copyright = options.copyright ?? ''
    if (options.templateMscx !== undefined) {
        const encoder = new TextEncoder()
        projectOptions.template = {
            mscx: encoder.encode(options.templateMscx),
            style: options.templateStyle ? encoder.encode(options.templateStyle) : null,
        }
    }

    const scoreOptions = projectOptions.scoreOptions
    scoreOptions.withTempo = !!options.tempo
    if (options.tempo) {
        scoreOptions.tempo.valueBpm = options.tempo.bpm
        scoreOptions.tempo.duration = TEMPO_DURATIONS[options.tempo.duration] ?? DurationType.V_QUARTER
        scoreOptions.tempo.withDot = options.tempo.dot
    }
    scoreOptions.timesigType = options.timesigType === 'common' ? TimeSigType.FOUR_FOUR
        : options.timesigType === 'cut' ? TimeSigType.ALLA_BREVE : TimeSigType.NORMAL
    scoreOptions.globalTimesig = new Fraction(options.timesig.numerator, options.timesig.denominator)
    scoreOptions.key = options.key as Key
    scoreOptions.totalMeasures = options.measures
    scoreOptions.withPickupMeasure = !!options.pickup
    if (options.pickup) {
        scoreOptions.pickupTimesig = new Fraction(options.pickup.numerator, options.pickup.denominator)
    }

    if (!projectOptions.template) {
        for (const instr of options.instruments) {
            const t = searchTemplate(instr.id)
            if (!t) {
                throw new Error(`unknown instrument template: ${instr.id}`)
            }
            scoreOptions.parts.push({ partId: '', instrumentTemplate: t, isExistingPart: false, isSoloist: !!instr.soloist })
        }
    }

    scoreOptions.order = repositoryOrder(options.order)
    scoreOptions.order.customized = !!options.orderCustomized

    const score = new NotationProject().createNew(projectOptions)
    s_compatDone.add(score) // laid out like MuseScore does for a new score (once, no compatibility conversions)
    return score
}

export interface InstrumentTemplateInfo {
    id: string
    groupId: string
    familyId: string
    trackName: string
    longName: string
    shortName: string
    description: string
    /** genre ids (instrumentGenres()) */
    genres: readonly string[]
    trait: { type: 'tuning' | 'transposition' | 'course' | 'unknown' | ''; name: string; isDefault: boolean; isHiddenOnScore: boolean }
    staffCount: number
    /** C++ InstrumentTemplate::sequenceOrder (the index in its instruments.xml group, used by instrumentSortingIndex()) */
    sequenceOrder: number
}

function traitTypeName(t: TraitType): 'tuning' | 'transposition' | 'course' | 'unknown' {
    return t === TraitType.Tuning ? 'tuning' : t === TraitType.Transposition ? 'transposition' : t === TraitType.Course ? 'course' : 'unknown'
}

let s_groupList: { id: string; name: string; templates: readonly InstrumentTemplateInfo[] }[] | null = null

/** genres of instruments.xml (id + English name) */
export function instrumentGenres(): readonly { id: string; name: string }[] {
    return engravingInstrumentGenres().map(g => ({ id: g.id, name: g.name }))
}

/**
 * The instrument groups with their templates in the order of instruments.xml (like InstrumentsRepository: only
 * templates with a track name and a long name).
 */
export function instrumentGroupList(): readonly { id: string; name: string; templates: readonly InstrumentTemplateInfo[] }[] {
    s_groupList ??= instrumentGroups().map(g => ({
        id: g.id,
        name: g.name,
        templates: g.instrumentTemplates.filter(t => t.trackName && t.longNames.length).map(t => ({
            id: t.id,
            groupId: t.groupId,
            familyId: t.familyId(),
            trackName: t.trackName,
            longName: t.longNames[0]?.name() ?? '',
            shortName: t.shortNames[0]?.name() ?? '',
            description: t.description,
            genres: t.genres.map(ig => ig.id),
            trait: {
                type: t.trait.name || t.trait.type !== TraitType.Unknown ? traitTypeName(t.trait.type) : '',
                name: t.trait.name,
                isDefault: t.trait.isDefault,
                isHiddenOnScore: t.trait.isHiddenOnScore,
            },
            staffCount: t.staffCount,
            sequenceOrder: t.sequenceOrder,
        })),
    }))
    return s_groupList
}

/** the score orders of orders.xml (id + English name); 'custom' is not in the list (C++ customOrder()) */
export function scoreOrders(): readonly { id: string; name: string }[] {
    return instrumentOrders().map(o => ({ id: o.id, name: o.name }))
}

/** ScoreOrder::instrumentSortingIndex of that order (0 for 'custom' and unknown orders: the order is kept) */
export function instrumentSortingIndex(orderId: string, instrumentId: string, isSoloist: boolean): number {
    const order = instrumentOrders().find(o => o.id === orderId)
    return order ? order.instrumentSortingIndex(instrumentId, isSoloist) : 0
}

/** ScoreOrder::isScoreOrder: true if the sorting indices are in ascending order (always true for 'custom') */
export function isScoreOrder(orderId: string, indices: readonly number[]): boolean {
    if (orderId === 'custom') {
        return true
    }
    return repositoryOrder(orderId).isScoreOrder(indices)
}
