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
import { NotationInteraction } from './notation/internal/notationinteraction'
import { NotationAccessibility } from './notation/internal/notationaccessibility'
import { NotationViewInputController } from './notationscene/notationviewinputcontroller'
import { ElementType } from './engraving/types/types'
import type { EngravingItem } from './engraving/dom/engravingitem'

export { initEngravingFonts, fontsInitialized, type FontFileLoader } from './engraving/engravingmodule'
export { MscLoadError } from './engraving/rw/mscloader'
export { setTranslator, mtrc, qtrc, arg, type Translator } from './framework/global/translation'
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
    /**
     * draw like printing (default true). With false the page is drawn like MuseScore's notation view: invisible
     * elements grey, frames, selected elements in the selection colors and the range selection frame.
     */
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
    const isPrinting = options.printing ?? true
    Paint.paintScore(painter, score, {
        fromPage: pageIdx,
        toPage: pageIdx,
        isPrinting,
        printPageBackground: options.background ?? true,
        frameRect,
    })
    if (!isPrinting) {
        drawSelectionRange(score, pageIdx, painter, scale)
    }
}

/** the range selection rectangle (MuseScore's notation view paints it after the score) */
function drawSelectionRange(score: MasterScore, pageIdx: number, painter: Painter, scaling: number): void {
    const page = score.pages()[pageIdx]
    if (!page || !score.selection().isRange()) {
        return
    }
    const pagePos = page.pos()
    painter.translate(pagePos.times(-1))
    notationState(score).interaction.drawSelectionRange(painter, scaling)
    painter.translate(pagePos)
}

export interface DrawPageSvgOptions {
    /** fill the page with white before drawing (default true) */
    background?: boolean
    /** draw like printing (default true); false: like MuseScore's notation view (see DrawPageOptions.printing) */
    printing?: boolean
    /**
     * glyph definitions shared by several pages in one HTML document: the page then only references them
     * and `defs.svg()` must be added to the document once, after all pages are drawn.
     * Without it the SVG is standalone.
     */
    defs?: SvgGlyphDefs
    /** pixels per inch the SVG is shown at (default 100); only used for the width of the range selection frame */
    dpi?: number
}

/** Draws one page as SVG (vector graphics, size in inches, each glyph outline defined once and reused) */
export function drawPageSvg(score: MasterScore, pageIdx: number, options: DrawPageSvgOptions = {}): string {
    const provider = new SvgPaintProvider(options.defs ?? new SvgGlyphDefs(), options.defs ? `p${pageIdx}-` : '')
    const painter = new Painter(provider, fontProvider(), 'page_' + pageIdx)
    const isPrinting = options.printing ?? true
    Paint.paintScore(painter, score, {
        fromPage: pageIdx,
        toPage: pageIdx,
        isPrinting,
        printPageBackground: options.background ?? true,
    })
    if (!isPrinting) {
        drawSelectionRange(score, pageIdx, painter, (options.dpi ?? 100) / DPI)
    }
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

// ---------------------------------------------------------------------------------------------------------------------
//   selection (MuseScore's notation view: NotationInteraction, NotationViewInputController, NotationAccessibility)
// ---------------------------------------------------------------------------------------------------------------------

/** click, ctrl/cmd+click, shift+click */
export type SelectMode = 'single' | 'add' | 'range'

interface NotationState {
    interaction: NotationInteraction
    controller: NotationViewInputController
    accessibility: NotationAccessibility
}

const s_notationStates = new WeakMap<MasterScore, NotationState>()

function notationState(score: MasterScore): NotationState {
    let st = s_notationStates.get(score)
    if (!st) {
        const interaction = new NotationInteraction(score)
        st = {
            interaction,
            controller: new NotationViewInputController(interaction),
            accessibility: new NotationAccessibility(score),
        }
        s_notationStates.set(score, st)
    }
    return st
}

/** a point of a page (inches from the page's top left) in canvas coordinates; null if there is no such page */
function pagePointToCanvas(score: MasterScore, pageIdx: number, x: number, y: number): PointF | null {
    const page = score.pages()[pageIdx]
    if (!page) {
        return null
    }
    return page.pos().plus(new PointF(x * DPI, y * DPI))
}

/** C++ NotationViewInputController::hitWidth(): selectionProximity (2) * 0.5 view pixels */
function hitWidth(viewDpi: number): number {
    return 2 * 0.5 / (viewDpi / DPI)
}

export interface HitTestOptions {
    /** pixels per inch of the view (the dpi the page is shown at, without devicePixelRatio; default 100): the hit tolerance is one view pixel */
    dpi?: number
}

/**
 * The element a click at a point of a page would hit (inches from the page's top left, like drawPage's coordinates /
 * dpi), null if none. On empty staff space inside a measure this is the measure. type: the element type (MuseScore's
 * xml name, e.g. "Note", "Measure"), name: its translated user name.
 */
export function hitTest(score: MasterScore, pageIdx: number, x: number, y: number, options: HitTestOptions = {}): { type: string; name: string } | null {
    const pos = pagePointToCanvas(score, pageIdx, x, y)
    if (!pos) {
        return null
    }
    const e = notationState(score).interaction.hitElement(pos, hitWidth(options.dpi ?? 100))
    return e ? { type: e.typeName(), name: e.translatedTypeUserName() } : null
}

function selectionSnapshot(score: MasterScore): unknown[] {
    const sel = score.selection()
    return [sel.state(), sel.startSegment(), sel.endSegment(), sel.staffStart(), sel.staffEnd(), ...sel.elements()]
}

function selectionDiffers(a: unknown[], b: unknown[]): boolean {
    return a.length !== b.length || a.some((v, i) => v !== b[i])
}

/**
 * Selects like a click in MuseScore's notation view (a click on empty staff space selects the measure, a click outside
 * of the staves deselects); returns true if the selection changed. No new layout is needed, only a repaint of
 * selectionBounds() before and after.
 */
export function selectAt(score: MasterScore, pageIdx: number, x: number, y: number, mode: SelectMode,
    options: HitTestOptions = {}): boolean {
    const pos = pagePointToCanvas(score, pageIdx, x, y)
    if (!pos) {
        return false
    }
    const before = selectionSnapshot(score)
    notationState(score).controller.leftClick(pos, hitWidth(options.dpi ?? 100), { shift: mode === 'range', ctrl: mode === 'add' })
    return selectionDiffers(before, selectionSnapshot(score))
}

/** deselects all (Escape); returns true if there was a selection */
export function clearSelection(score: MasterScore): boolean {
    return notationState(score).interaction.clearSelection()
}

/** selects the whole score (Ctrl+A) */
export function selectAll(score: MasterScore): void {
    notationState(score).interaction.selectAll()
}

/**
 * Keyboard navigation of the selection like MuseScore's shortcuts without note input: arrows (next/previous chord),
 * Ctrl+arrows (measure), Shift(+Ctrl)+Left/Right and Shift+Up/Down (extend the range), Alt+Up/Down (note in chord /
 * staff), Ctrl+Alt+Up/Down (top/bottom note), Shift(+Ctrl)+Home/End (to the start/end of the system/score),
 * Ctrl+Home/End (first/last element), Escape, Ctrl+A. key like KeyboardEvent.key; returns true if handled.
 */
export function moveSelection(score: MasterScore, key: string, mods: { shift: boolean; ctrl: boolean; alt: boolean }): boolean {
    return notationState(score).controller.keyAction(key, mods)
}

export function hasSelection(score: MasterScore): boolean {
    return !score.selection().isNone()
}

/** status bar text of the selection (MuseScore's accessibility info, translated through mtrc), empty if none */
export function selectionInfo(score: MasterScore): string {
    return notationState(score).accessibility.accessibilityInfo()
}

/**
 * The pages and rectangles (inches from the page's top left) of the selection, to repaint them and to scroll the
 * selection into view: the range selection frames (one per system) and the bounding boxes of the selected elements.
 */
export function selectionBounds(score: MasterScore): { page: number; x: number; y: number; width: number; height: number }[] {
    const res: { page: number; x: number; y: number; width: number; height: number }[] = []
    const pages = score.pages()
    const add = (pageIdx: number, r: RectF): void => {
        if (pageIdx >= 0 && r.isValid()) {
            res.push({ page: pageIdx, x: r.x() / DPI, y: r.y() / DPI, width: r.width() / DPI, height: r.height() / DPI })
        }
    }
    const interaction = notationState(score).interaction
    // range frames (canvas coordinates): the page containing the frame's center; with a margin for the frame's pen
    const m = 0.03 * DPI
    for (const r of interaction.rangeBoundingArea()) {
        const page = interaction.point2page(r.center(), true)
        if (page) {
            add(pages.indexOf(page), r.translated(page.pos().times(-1)).adjusted(-m, -m, m, m))
        }
    }
    for (const e of score.selection().elements()) {
        const page = e.findAncestor(ElementType.PAGE) as unknown as EngravingItem | null
        if (page) {
            add(pages.indexOf(page as never), e.pageBoundingRect())
        }
    }
    return res
}
