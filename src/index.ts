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
import { MscWriter } from './engraving/infrastructure/mscwriter'
import { MscSaver } from './engraving/rw/mscsaver'
import { Writer } from './engraving/rw/write/writer'
import { EngravingCompat } from './engraving/compat/engravingcompat'
import { MasterScore } from './engraving/dom/masterscore'
import { ScoreRenderer } from './engraving/rendering/score/scorerenderer'
import { Paint } from './engraving/rendering/score/paint'
import { NotationInteraction } from './notation/internal/notationinteraction'
import { NotationAccessibility } from './notation/internal/notationaccessibility'
import { NotationViewInputController } from './notationscene/notationviewinputcontroller'
import { NotationActionController } from './notationscene/notationactioncontroller'
import { EngravingConfiguration } from './engraving/internal/engravingconfiguration'
import { Pid, PropertyFlags, propertyId, propertyName, propertyType, propertyUserName } from './engraving/dom/property'
import { TranslatableString } from './framework/global/types/translatablestring'
import type { InspectorChange } from './inspector/abstractinspectormodel'
import { P_TYPE, propertyValueEquals, type PropertyValue } from './engraving/types/propertyvalue'
import { Spatium } from './engraving/types/dimension'
import { Color } from './framework/draw/types/color'
import { SizeF } from './framework/draw/types/geometry'
import { Align, DPMM, DurationTypeWithDots } from './engraving/types/types'
import { NoteEntryMethod } from './engraving/dom/input'
import { Accidental } from './engraving/dom/accidental'
import { TConv } from './engraving/types/typesconv'
import { ElementType } from './engraving/types/types'
import type { EngravingItem } from './engraving/dom/engravingitem'
// (imports of the palette section)
import { Factory } from './engraving/dom/factory'
import { scoreDummy } from './engraving/compat/dummyelement'
import { Dynamic } from './engraving/dom/dynamic'
import { Note } from './engraving/dom/note'
import { SymId } from './engraving/types/symid'
import { SymNames } from './engraving/types/symnames'
import { BarLineType, ClefType, DynamicType, NoteHeadGroup, NoteHeadType, ParenthesesMode, nidx } from './engraving/types/types'
import { KeyboardModifier } from './engraving/editing/editdata'

export { initEngravingFonts, fontsInitialized, type FontFileLoader } from './engraving/engravingmodule'
export { MscLoadError } from './engraving/rw/mscloader'
export { setTranslator, mtrc, qtrc, arg, type Translator } from './framework/global/translation'
export type { MasterScore } from './engraving/dom/masterscore'
export type { Score } from './engraving/dom/score'
export type { Canvas2D } from './framework/draw/canvaspaintprovider'
export { SvgGlyphDefs } from './framework/draw/svgpaintprovider'
// the editor's panels: palettes, layout panel, properties (inspector)
export * from './palette/api'
export * from './instrumentsscene/api'
export * from './inspector/api'
export {
    setFallbackFontEngine, createCanvasFallbackFontEngine, type FallbackFontEngine, type FallbackFont,
} from './framework/draw/internal/fontprovider'

/** Reads a .mscz (zip) or .mscx (xml) file. Fonts must be initialized before (initEngravingFonts). */
export function loadScore(data: Uint8Array | ArrayBuffer): MasterScore {
    const score = loadMasterScore(data)
    // NotationProject::doLoad reads the cloud info with std::map::operator[], which adds these meta tags (saved files
    // contain them)
    for (const tag of ['source', 'sourceRevisionId', 'audioComUrl']) {
        if (!score.metaTags().has(tag)) {
            score.setMetaTag(tag, '')
        }
    }
    score.setIsOpen(true) // GlobalContext::setCurrentNotation: the score is open (saved as <open>)
    return score
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

/** MuseScore saves laid out scores (multimeasure rests, compatibility conversions of old files happen with the layout) */
function ensureLaidOut(score: MasterScore): void {
    if (!s_compatDone.has(score)) {
        layoutScore(score)
    }
}

/** The main .mscx file of the score as MuseScore 4.7.5 writes it (Writer::writeScore; the style is in score_style.mss) */
export function writeMscx(score: MasterScore): string {
    ensureLaidOut(score)
    return Writer.writeScore(score)
}

/**
 * A complete .mscz file (MasterScore::writeMscz: META-INF/container.xml, score_style.mss, the score, the parts
 * (Excerpts/) and a custom chord list). `fileName` (e.g. "My Score.mscz") gives the name of the .mscx inside.
 */
export function saveMscz(score: MasterScore, fileName?: string): Uint8Array {
    ensureLaidOut(score)
    const writer = new MscWriter({ filePath: fileName })
    new MscSaver().writeMscz(score, writer)
    return writer.zipData()
}

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
    if (!page) {
        return
    }
    const pagePos = page.pos()
    painter.translate(pagePos.times(-1))
    if (score.selection().isRange()) {
        notationState(score).interaction.drawSelectionRange(painter, scaling)
    }
    if (noteInputCursorPage(score) === pageIdx) {
        drawNoteInputCursor(score, painter)
    }
    painter.translate(pagePos)
}

/** the page of the note input cursor, -1 if not in note input mode */
function noteInputCursorPage(score: MasterScore): number {
    if (!score.noteEntryMode()) {
        return -1
    }
    const page = score.inputState().segment()?.measure().system()?.page()
    return page ? score.pages().indexOf(page) : -1
}

/** C++ NoteInputCursor::paint (the cursor drawn by MuseScore's notation view; TODO(port): TAB string marks) */
function drawNoteInputCursor(score: MasterScore, painter: Painter): void {
    const noteInput = notationState(score).interaction.noteInput()
    const state = noteInput.state()
    const fillColor = EngravingConfiguration.selectionColor(state.voice())
    const cursorRect = noteInput.cursorRect()
    if (!cursorRect.isValid()) {
        return
    }

    const cursorRectColor = fillColor.clone()
    cursorRectColor.setAlpha(NOTE_INPUT_CURSOR_OPACITY)
    painter.fillRect(cursorRect, cursorRectColor)

    const staff = state.staff()
    if (!staff) {
        return
    }

    const spatium = staff.staffType(state.tick()).spatium()
    const leftLineWidth = Math.trunc(0.14 * spatium)

    const leftLine = new RectF(cursorRect.topLeft().x(), cursorRect.topLeft().y(), leftLineWidth, cursorRect.height())
    painter.fillRect(leftLine, fillColor)
}

/** C++ NotationConfiguration::cursorOpacity() */
const NOTE_INPUT_CURSOR_OPACITY = 50

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
    score.setIsOpen(true) // GlobalContext::setCurrentNotation: the score is open (saved as <open>)
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
    actions: NotationActionController
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
            actions: new NotationActionController(interaction),
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

// ---------------------------------------------------------------------------------------------------------------------
//   editing (MuseScore's NotationActionController, NotationInteraction, NotationUndoStack)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Runs one of MuseScore's actions (the codes of its notationuiactions.cpp, e.g. "note-input", "note-c", "pad-note-8",
 * "pitch-up", "action://notation/delete", "action://notation/undo") on the score, like MuseScore's
 * NotationActionController. The score is laid out again when it changed. Returns false if the action is not
 * available or not enabled (isActionEnabled).
 */
export function executeAction(score: MasterScore, code: string): boolean {
    return notationState(score).actions.dispatch(code)
}

/** the action codes executeAction() handles (the same for every score) */
export function notationActionCodes(): readonly string[] {
    return NotationActionController.actionCodes()
}

/** the actions with a checked state (isActionChecked): the buttons of MuseScore's note input toolbar */
export function isCheckableAction(code: string): boolean {
    return NotationActionController.isCheckableAction(code)
}

export function isActionAvailable(score: MasterScore, code: string): boolean {
    return notationState(score).actions.isActionAvailable(code)
}

/** like the enabled state of MuseScore's actions (e.g. delete needs a selection, undo something to undo) */
export function isActionEnabled(score: MasterScore, code: string): boolean {
    return notationState(score).actions.canReceiveAction(code)
}

/** the checked state of the note input toolbar's buttons (MuseScore's NoteInputBarModel): durations, dots, ... */
export function isActionChecked(score: MasterScore, code: string): boolean {
    return notationState(score).actions.isActionChecked(code)
}

export function canUndo(score: MasterScore): boolean {
    return score.undoStack().canUndo()
}

export function canRedo(score: MasterScore): boolean {
    return score.undoStack().canRedo()
}

/** undoes the last command; returns false if there is nothing to undo */
export function undo(score: MasterScore): boolean {
    return executeAction(score, 'action://notation/undo')
}

/** redoes the last undone command; returns false if there is nothing to redo */
export function redo(score: MasterScore): boolean {
    return executeAction(score, 'action://notation/redo')
}

export interface UndoStackInfo {
    canUndo: boolean
    canRedo: boolean
    /** the translated name of the command undo() undoes (like "Enter note"), '' if none */
    undoActionName: string
    redoActionName: string
    /** the current state: the number of done commands */
    index: number
    /** the number of commands (done and undone) */
    size: number
}

export function undoStackInfo(score: MasterScore): UndoStackInfo {
    const stack = notationState(score).interaction.undoStack()
    return {
        canUndo: stack.canUndo(),
        canRedo: stack.canRedo(),
        undoActionName: stack.topMostUndoActionName().translated(),
        redoActionName: stack.topMostRedoActionName().translated(),
        index: stack.currentStateIndex(),
        size: stack.undoRedoActionCount(),
    }
}

/** true if the score was changed since it was opened, created or last saved (markSaved) */
export function isModified(score: MasterScore): boolean {
    return score.dirty()
}

/** marks the current state as saved (undoing or redoing makes the score modified again) */
export function markSaved(score: MasterScore): void {
    score.undoStack().setClean()
}

const NOTE_INPUT_METHOD_NAMES: Partial<Record<NoteEntryMethod, string>> = {
    [NoteEntryMethod.BY_NOTE_NAME]: 'by-note-name',
    [NoteEntryMethod.BY_DURATION]: 'by-duration',
    [NoteEntryMethod.REPITCH]: 'repitch',
    [NoteEntryMethod.RHYTHM]: 'rhythm',
    [NoteEntryMethod.REALTIME_AUTO]: 'realtime-auto',
    [NoteEntryMethod.REALTIME_MANUAL]: 'realtime-manual',
    [NoteEntryMethod.TIMEWISE]: 'timewise',
}

export interface NoteInputStateInfo {
    /** note input mode is on */
    active: boolean
    /** like the action codes "note-input-<method>": 'by-note-name', 'by-duration', ... */
    method: string
    /** MuseScore's xml duration name ("quarter", "eighth", "measure", ...), '' if none */
    duration: string
    dots: number
    rest: boolean
    /** the SMuFL name of the accidental to add (e.g. "accidentalSharp"), '' if none */
    accidental: string
    /** 0..3 */
    voice: number
    /** the staff of the input position, -1 if none */
    staff: number
}

/** the state of the note input (also outside of note input mode: the duration etc. of the selection) */
export function noteInputState(score: MasterScore): NoteInputStateInfo {
    const is = score.inputState()
    const d = is.duration()
    return {
        active: is.noteEntryMode(),
        method: NOTE_INPUT_METHOD_NAMES[is.noteEntryMethod()] ?? '',
        duration: d.isValid() ? TConv.toXmlDurationType(d.type()) : '',
        dots: d.isValid() ? d.dots() : 0,
        rest: is.rest(),
        accidental: is.accidentalType() ? Accidental.subtype2name(is.accidentalType()) : '',
        voice: is.voice(),
        staff: is.isValid() ? is.staffIdx() : -1,
    }
}

/** the note input cursor (inches from the page's top left) for repainting and scrolling it into view; null if none */
export function noteInputCursorBounds(score: MasterScore): { page: number; x: number; y: number; width: number; height: number } | null {
    const pageIdx = noteInputCursorPage(score)
    if (pageIdx < 0) {
        return null
    }
    const r = notationState(score).interaction.noteInput().cursorRect().translated(score.pages()[pageIdx].pos().times(-1))
    if (!r.isValid()) {
        return null
    }
    return { page: pageIdx, x: r.x() / DPI, y: r.y() / DPI, width: r.width() / DPI, height: r.height() / DPI }
}

/**
 * A property value as plain JSON (like MuseScore's inspector shows it: AbstractInspectorModel::valueFromElementUnits):
 * numbers (enums as their C++ numeric values, millimetre and spatium values in staff spaces, tempo in BPM), booleans,
 * strings, points {x, y} (staff spaces for spatium dependent elements, else millimetres), sizes {width, height},
 * colors "#rrggbb" or "#rrggbbaa", fractions "n/d", alignment {horizontal, vertical}, durations {type, dots}, arrays
 * of numbers; null for other value types.
 */
export type PropertyJsonValue = number | boolean | string | number[] | { [key: string]: number } | null

function spatiumDependent(pid: Pid, item: EngravingItem): boolean {
    return pid === Pid.OFFSET ? item.offsetIsSpatiumDependent() : item.sizeIsSpatiumDependent()
}

function colorToJson(c: Color): string {
    const h = (n: number): string => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
    return `#${h(c.r)}${h(c.g)}${h(c.b)}${c.a === 255 ? '' : h(c.a)}`
}

/** C++ AbstractInspectorModel::valueFromElementUnits; undefined if the item does not have the property */
function valueToJson(pid: Pid, value: PropertyValue, item: EngravingItem): PropertyJsonValue | undefined {
    if (value === undefined) {
        return undefined
    }
    if (pid === Pid.VERSE) {
        return (value as number) + 1
    }
    switch (propertyType(pid)) {
    case P_TYPE.POINT: {
        const p = value as PointF
        const f = spatiumDependent(pid, item) ? item.spatium() : DPMM
        return { x: p.x() / f, y: p.y() / f }
    }
    case P_TYPE.MILLIMETRE:
        return Spatium.fromMM(value as number, item.spatium()).val()
    case P_TYPE.SPATIUM:
        return value instanceof Spatium ? value.val() : value as number
    case P_TYPE.TEMPO:
        return (value as number) * 60
    case P_TYPE.COLOR:
        return value instanceof Color ? colorToJson(value) : null
    default:
        break
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return value
    }
    if (value instanceof Fraction) {
        return `${value.numerator()}/${value.denominator()}`
    }
    if (value instanceof Align) {
        return { horizontal: value.horizontal, vertical: value.vertical }
    }
    if (value instanceof SizeF) {
        return { width: value.width(), height: value.height() }
    }
    if (value instanceof PointF) {
        return { x: value.x(), y: value.y() }
    }
    if (value instanceof DurationTypeWithDots) {
        return { type: value.type, dots: value.dots }
    }
    if (value instanceof Spatium) {
        return value.val()
    }
    if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
        return [...value as number[]]
    }
    return null
}

/** C++ AbstractInspectorModel::valueToElementUnits; undefined if the value cannot be converted */
function valueFromJson(pid: Pid, v: PropertyJsonValue, item: EngravingItem): PropertyValue | undefined {
    if (pid === Pid.VERSE) {
        return (v as number) - 1
    }
    const obj = (v && typeof v === 'object' && !Array.isArray(v)) ? v as { [key: string]: number } : null
    switch (propertyType(pid)) {
    case P_TYPE.POINT: {
        if (!obj) {
            return undefined
        }
        const f = spatiumDependent(pid, item) ? item.spatium() : DPMM
        return new PointF(obj.x * f, obj.y * f)
    }
    case P_TYPE.MILLIMETRE:
        return typeof v === 'number' ? new Spatium(v).toAbsolute(item.spatium()) : undefined
    case P_TYPE.SPATIUM:
        return typeof v === 'number' ? new Spatium(v) : undefined
    case P_TYPE.TEMPO:
        return typeof v === 'number' ? v / 60 : undefined
    case P_TYPE.COLOR: {
        if (typeof v !== 'string' || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)) {
            return undefined
        }
        const n = (i: number): number => parseInt(v.slice(i, i + 2), 16)
        return new Color(n(1), n(3), n(5), v.length === 9 ? n(7) : 255)
    }
    case P_TYPE.FRACTION: {
        const m = typeof v === 'string' ? /^(-?\d+)\/(\d+)$/.exec(v) : null
        return m ? new Fraction(Number(m[1]), Number(m[2])) : undefined
    }
    case P_TYPE.ALIGN:
        return obj ? new Align(obj.horizontal, obj.vertical) : undefined
    case P_TYPE.SIZE:
        return obj ? new SizeF(obj.width, obj.height) : undefined
    case P_TYPE.DURATION_TYPE_WITH_DOTS:
        return obj ? new DurationTypeWithDots(obj.type, obj.dots) : undefined
    default:
        break
    }
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' || Array.isArray(v)) {
        return v
    }
    return undefined
}

export interface SelectionPropertyInfo {
    /** MuseScore's property name (the xml tag, e.g. "visible", "offset", "color") */
    name: string
    /** MuseScore's user name of the property (untranslated) */
    userName: string
    /** the value of the first selected item that has the property */
    value: PropertyJsonValue
    /** its default (style) value */
    defaultValue: PropertyJsonValue
    /** 'styled': the value comes from the style, 'unstyled': a styled property set by the user, 'nostyle': no style */
    styled: 'nostyle' | 'unstyled' | 'styled'
    /** the selected items have different values */
    mixed: boolean
    /** the number of selected items that have the property */
    count: number
}

function selectionItems(score: MasterScore): EngravingItem[] {
    return [...score.selection().elements()]
}

/**
 * The properties of the selected items for an inspector (like MuseScore's AbstractInspectorModel::loadPropertyItem):
 * all properties the items have, or only the given ones (by name). Keyed by property name.
 */
export function selectionProperties(score: MasterScore, names?: readonly string[]): Record<string, SelectionPropertyInfo> {
    const items = selectionItems(score)
    const res: Record<string, SelectionPropertyInfo> = {}
    if (!items.length) {
        return res
    }
    const pids: Pid[] = names ? names.map(n => propertyId(n)).filter(p => p !== Pid.END)
        : Array.from({ length: Pid.END }, (_, i) => i as Pid).filter(p => propertyName(p))
    for (const pid of pids) {
        let info: SelectionPropertyInfo | null = null
        let firstValue: PropertyValue = undefined
        for (const item of items) {
            const v = item.getProperty(pid)
            const json = valueToJson(pid, v, item)
            if (json === undefined) {
                continue // not a property of this item
            }
            if (!info) {
                const flags = item.propertyFlags(pid)
                info = {
                    name: propertyName(pid),
                    userName: propertyUserName(pid),
                    value: json,
                    defaultValue: valueToJson(pid, item.propertyDefault(pid), item) ?? null,
                    styled: flags === PropertyFlags.STYLED ? 'styled' : flags === PropertyFlags.UNSTYLED ? 'unstyled' : 'nostyle',
                    mixed: false,
                    count: 1,
                }
                firstValue = v
            } else {
                info.count++
                if (!propertyValueEquals(firstValue, v)) {
                    info.mixed = true
                }
            }
        }
        if (info) {
            res[info.name] = info
        }
    }
    return res
}

/**
 * Sets a property (by name, see selectionProperties) of all selected items that have it as one undoable command, like
 * MuseScore's inspector (a styled value becomes unstyled); the value as in selectionProperties. Returns false if no
 * selected item has the property or the value cannot be converted.
 */
export function changeSelectionProperty(score: MasterScore, name: string, value: PropertyJsonValue): boolean {
    const pid = propertyId(name)
    if (pid === Pid.END) {
        return false
    }
    const items = selectionItems(score).filter(e => e.getProperty(pid) !== undefined)
    if (!items.length) {
        return false
    }
    const converted = valueFromJson(pid, value, items[0])
    if (converted === undefined) {
        return false
    }
    notationState(score).interaction.changeProperty(items, pid, converted)
    return true
}

/** resets a property of all selected items that have it to its default (style) value, as one undoable command */
export function resetSelectionProperty(score: MasterScore, name: string): boolean {
    const pid = propertyId(name)
    if (pid === Pid.END) {
        return false
    }
    const items = selectionItems(score).filter(e => e.getProperty(pid) !== undefined)
    if (!items.length) {
        return false
    }
    notationState(score).interaction.resetProperty(items, pid)
    return true
}

/**
 * Applies the changes the Properties panel computed (inspectorPropertyChanges, inspectorPropertyResets,
 * inspectorArrangeChanges) as one undoable command, like AbstractInspectorModel::setPropertyValue /
 * onPropertyValueReset ("Edit %1" / "Reset %1" with the first change's property). Returns false if nothing was applied.
 */
export function applyInspectorChanges(score: MasterScore, changes: readonly InspectorChange[]): boolean {
    if (!changes.length) {
        return false
    }
    const interaction = notationState(score).interaction
    const parens = changes.find(c => c.command === 'addParentheses' || c.command === 'removeParentheses')
    if (parens) {
        // NoteheadSettingsModel: the parentheses of the selected notes (Score::cmdAddParenthesesToNotes etc.)
        const add = parens.command === 'addParentheses'
        interaction.startEdit(new TranslatableString('undoableAction', add ? 'Add notehead parentheses' : 'Remove notehead parentheses'))
        if (add) {
            score.cmdAddParenthesesToNotes()
        } else {
            score.cmdRemoveParenthesesFromNotes()
        }
        interaction.apply()
        return true
    }
    const reset = changes.every(c => c.reset)
    interaction.startEdit(new TranslatableString('undoableAction', reset ? 'Reset %1' : 'Edit %1').arg(propertyUserName(changes[0].pid)))
    for (const c of changes) {
        if (c.command === 'changeVisible') {
            score.undoChangeVisible(c.item, !!c.value)
        } else if (c.reset) {
            c.item.undoResetProperty(c.pid)
        } else {
            c.item.undoChangeProperty(c.pid, c.value, c.flags ?? PropertyFlags.NOSTYLE)
        }
    }
    // NoteheadSettingsModel: resetting the parentheses of notes resets their chord parentheses too
    const parensReset = changes.find(c => c.reset && c.pid === Pid.HAS_PARENTHESES && c.item.isNote())
    if (parensReset) {
        if (parensReset.item.parenthesesMode() === ParenthesesMode.BOTH) {
            score.cmdAddParenthesesToNotes()
        } else {
            score.cmdRemoveParenthesesFromNotes()
        }
    }
    interaction.apply()
    return true
}

// ---------------------------------------------------------------------------------------------------------------------
//   palette elements (MuseScore's palettes: NotationInteraction::applyPaletteElement): filled by the palette drop port
// ---------------------------------------------------------------------------------------------------------------------

/** an element of a palette (created with createPaletteElement or by the caller, e.g. with Factory) */
export type PaletteElement = EngravingItem

/**
 * Description of a palette element; the names are MuseScore's xml names:
 * - Clef: clefType 'G', 'F', 'C3', 'G8vb', ... (TConv ClefType xml names)
 * - KeySig: key -7..7 (concert key)
 * - TimeSig: numerator/denominator, timeSigType 'normal' | 'common' | 'cut' (default 'normal')
 * - BarLine: barLineType 'normal', 'double', 'start-repeat', 'end-repeat', 'end-start-repeat', 'dashed', 'end', ...
 * - Articulation, Ornament, Fermata, Breath, Symbol: symbol = SMuFL SymId name, e.g. 'articAccentAbove',
 *   'ornamentTrill', 'fermataAbove', 'breathMarkComma'
 * - Dynamic: dynamic 'p', 'mf', 'sfz', ...
 * - Accidental: accidental = xml subtype name, e.g. 'accidentalSharp', 'accidentalFlat', 'accidentalNatural'
 * - NoteHead: group = xml notehead group name, e.g. 'cross', 'diamond', 'slash', 'normal'
 * - LayoutBreak: breakType 'line' | 'page' | 'section' | 'noBreak'
 * - Hairpin: hairpinType 'crescendo' | 'decrescendo' | 'crescendo-line' | 'decrescendo-line'
 * - StaffText, SystemText, TempoText, RehearsalMark, Expression: text (plain text)
 */
export type PaletteElementSpec =
    | { type: 'Clef'; clefType: string }
    | { type: 'KeySig'; key: number }
    | { type: 'TimeSig'; numerator: number; denominator: number; timeSigType?: 'normal' | 'common' | 'cut' }
    | { type: 'BarLine'; barLineType: string }
    | { type: 'Articulation' | 'Ornament' | 'Fermata' | 'Breath' | 'Symbol'; symbol: string }
    | { type: 'Dynamic'; dynamic: string }
    | { type: 'Accidental'; accidental: string }
    | { type: 'NoteHead'; group: string }
    | { type: 'LayoutBreak'; breakType: 'line' | 'page' | 'section' | 'noBreak' }
    | { type: 'Hairpin'; hairpinType: 'crescendo' | 'decrescendo' | 'crescendo-line' | 'decrescendo-line' }
    | { type: 'StaffText' | 'SystemText' | 'TempoText' | 'RehearsalMark' | 'Expression'; text: string }

const PALETTE_HAIRPIN_TYPES = { crescendo: 0, decrescendo: 1, 'crescendo-line': 2, 'decrescendo-line': 3 } as const // HairpinType
const PALETTE_BREAK_TYPES = { page: 0, line: 1, section: 2, noBreak: 3 } as const // LayoutBreakType

/**
 * Creates a palette element (like the cells of MuseScore's palettes) for the given score (it uses the score's style).
 * Returns null for unknown names. The element is not added to the score: applyPaletteElement() adds copies of it.
 */
export function createPaletteElement(score: MasterScore, spec: PaletteElementSpec): PaletteElement | null {
    const e = Factory.createItemByName(spec.type === 'Hairpin' ? 'HairPin' : spec.type, scoreDummy(score)) // xml names
    if (!e) {
        return null
    }
    const item = e as unknown as Record<string, (...args: unknown[]) => unknown>
    switch (spec.type) {
    case 'Clef': {
        const ct = TConv.fromXmlClefType(spec.clefType, ClefType.INVALID)
        if (ct === ClefType.INVALID) {
            return null
        }
        item.setClefType(ct)
        break
    }
    case 'KeySig':
        item.setKey(spec.key)
        break
    case 'TimeSig': {
        const t = spec.timeSigType === 'common' ? TimeSigType.FOUR_FOUR : spec.timeSigType === 'cut' ? TimeSigType.ALLA_BREVE : TimeSigType.NORMAL
        item.setSig(new Fraction(spec.numerator, spec.denominator), t)
        break
    }
    case 'BarLine':
        item.setBarLineType(TConv.fromXmlBarLineType(spec.barLineType, BarLineType.NORMAL))
        break
    case 'Articulation':
    case 'Ornament':
    case 'Fermata':
    case 'Breath':
    case 'Symbol': {
        const id = SymNames.symIdByName(spec.symbol)
        if (id === SymId.noSym) {
            return null
        }
        if (spec.type === 'Symbol') {
            item.setSym(id)
        } else {
            item.setSymId(id)
        }
        break
    }
    case 'Dynamic': {
        const t = TConv.fromXmlDynamicType(spec.dynamic, DynamicType.OTHER)
        item.setDynamicType(t)
        item.setXmlText(Dynamic.dynamicText(t))
        break
    }
    case 'Accidental':
        item.setAccidentalType(Accidental.name2subtype(spec.accidental))
        break
    case 'NoteHead': {
        const group = TConv.fromXmlNoteHeadGroup(spec.group, NoteHeadGroup.HEAD_NORMAL)
        item.setSym(Note.noteHeadSym(0, group, NoteHeadType.HEAD_HALF))
        break
    }
    case 'LayoutBreak':
        item.setLayoutBreakType(PALETTE_BREAK_TYPES[spec.breakType])
        break
    case 'Hairpin':
        item.setHairpinType(PALETTE_HAIRPIN_TYPES[spec.hairpinType])
        break
    default:
        item.setPlainText(spec.text)
        break
    }
    e.setTrack(nidx) // from the palette
    e.styleChanged()
    return e
}

/** the translated name of a palette element (for tooltips), e.g. "Treble clef", "Staccato" */
export function paletteElementName(element: PaletteElement): string {
    return element.translatedSubtypeUserName() || element.translatedTypeUserName()
}

/**
 * Applies a palette element to the selection like a click on a palette cell in MuseScore
 * (NotationInteraction::applyPaletteElement): copies are dropped on the selected elements or the measures of a range
 * selection. Undoable; the score is laid out again. modifiers: ctrl applies key/time signatures to the selected staff
 * only, shift adds a note to a chord. Returns false if nothing is selected.
 */
export function applyPaletteElement(score: MasterScore, element: PaletteElement,
    modifiers: { ctrl?: boolean; shift?: boolean } = {}): boolean {
    let m = 0
    if (modifiers.ctrl) {
        m |= KeyboardModifier.ControlModifier
    }
    if (modifiers.shift) {
        m |= KeyboardModifier.ShiftModifier
    }
    return notationState(score).interaction.applyPaletteElement(element, m)
}

// ---------------------------------------------------------------------------------------------------------------------
//   note input in the view: the shadow note at the mouse position, the right click, changes made by a timer
//   (MuseScore's NotationViewInputController hover/right click, NotationInteraction::showShadowNoteForPosition)
// ---------------------------------------------------------------------------------------------------------------------

import { TDraw } from './engraving/rendering/score/tdraw'

/** a rectangle on a page (inches from the page's top left) */
export interface PageRect {
    page: number
    x: number
    y: number
    width: number
    height: number
}

function pageRectOf(score: MasterScore, pageIdx: number, r: RectF): PageRect | null {
    const page = score.pages()[pageIdx]
    if (!page || !r.isValid()) {
        return null
    }
    const pr = r.translated(page.pos().times(-1))
    return { page: pageIdx, x: pr.x() / DPI, y: pr.y() / DPI, width: pr.width() / DPI, height: pr.height() / DPI }
}

/**
 * In note input mode: shows the shadow note (the preview of the note a click would enter) at a point of a page
 * (inches from the page's top left), like moving the mouse over MuseScore's notation view. Returns its bounds for
 * repainting (drawShadowNote), null if it is not shown (not in note input mode or no input position there).
 */
export function showShadowNote(score: MasterScore, pageIdx: number, x: number, y: number): PageRect | null {
    const pos = pagePointToCanvas(score, pageIdx, x, y)
    const st = notationState(score)
    if (!pos || !st.controller.hoverMove(pos)) {
        if (score.shadowNote().visible()) {
            st.controller.hoverLeave()
        }
        return null
    }
    return pageRectOf(score, pageIdx, st.interaction.shadowNoteRect())
}

/** hides the shadow note (the mouse left the view); returns true if it was shown */
export function hideShadowNote(score: MasterScore): boolean {
    const shown = score.shadowNote().visible() && score.shadowNote().isValid()
    notationState(score).controller.hoverLeave()
    return shown
}

/**
 * Draws only the shadow note (if shown) onto a transparent canvas, with the same coordinates as drawPage (dpi,
 * region): MuseScore's view paints it over the score.
 */
export function drawShadowNote(score: MasterScore, pageIdx: number, ctx: Canvas2D,
    options: { dpi?: number; region?: { x: number; y: number; width: number; height: number } } = {}): void {
    const page = score.pages()[pageIdx]
    const note = score.shadowNote()
    if (!page || !note.visible() || !note.isValid()) {
        return
    }
    const dpi = options.dpi ?? 100
    const scale = dpi / DPI
    const r = options.region
    const provider = new CanvasPaintProvider(ctx, new Transform(scale, 0, 0, scale, r ? -r.x : 0, r ? -r.y : 0))
    const painter = new Painter(provider, fontProvider(), 'shadow_' + pageIdx)
    painter.translate(page.pos().times(-1))
    TDraw.drawItem(note, painter, { isPrinting: false }) // C++ score()->renderer()->drawItem(shadowNote)
}

/**
 * A right click at a point of a page in note input mode removes the note there (MuseScore's "remove-note"); returns
 * false outside of note input mode. The score is laid out again.
 */
export function rightClickAt(score: MasterScore, pageIdx: number, x: number, y: number): boolean {
    const pos = pagePointToCanvas(score, pageIdx, x, y)
    return !!pos && notationState(score).controller.rightClick(pos)
}

/**
 * Calls the listener after changes that were not made by a call of this API: the real-time note input advances by
 * a timer ("realtime-advance" in the automatic real-time mode). Returns a function that removes the listener.
 */
export function onNotationChanged(score: MasterScore, listener: () => void): () => void {
    return notationState(score).interaction.notationChanged().onNotify(listener)
}
