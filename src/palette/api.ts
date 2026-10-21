/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Public library API of the palettes (re-exported by src/index.ts): MuseScore's default palette tree, the master
 * palette ("More" and search) and the user's palette tree (PaletteProvider: shown/hidden and custom palettes, cells
 * added, removed and changed; stored as PaletteTree XML like MuseScore's workspace data) as plain data, and the
 * painting of a cell's icon onto a canvas (PaletteCellIconEngine). The trees are created on first use (the engraving
 * fonts must be initialized).
 *
 * Deviation: the cells of actions (ActionIcon: grace notes, beam modes, frames, ...) and layout breaks are glyphs of
 * MuseScore's UI icon font, which belongs to the app: `action` / `icon` tell the UI what to draw (the name and icon
 * of an action come from the app's action definitions).
 */

import { CanvasPaintProvider, type Canvas2D } from '../framework/draw/canvaspaintprovider'
import { Painter } from '../framework/draw/painter'
import { Color } from '../framework/draw/types/color'
import { RectF } from '../framework/draw/types/geometry'
import { Transform } from '../framework/draw/types/transform'
import { fontProvider } from '../engraving/infrastructure/engravingcontext'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import type { ActionIcon } from '../engraving/dom/actionicon'
import { UI_ICONS_DEFAULT_FONT_SIZE } from '../engraving/dom/actionicon'
import type { LayoutBreak } from '../engraving/dom/layoutbreak'
import { XmlReader } from '../engraving/rw/xmlreader'
import { XmlWriter } from '../engraving/rw/xmlwriter'
import { ElementType } from '../engraving/types/types'
import { Palette, PaletteType } from './palette'
import type { PaletteCell } from './palettecell'
import { PaletteCellIconEngine, paletteSpatium } from './palettecelliconengine'
import { PaletteCreator } from './palettecreator'
import { DropAction, type PaletteIndex, type PaletteMimeData } from './palettemodel'
import {
    PaletteProvider, type AskRemove, type ExtraPalette, type PaletteCellConfig, type PaletteConfig,
} from './paletteprovider'
import type { PaletteTree } from './palettetree'

export { RemoveAction, type PaletteCellConfig, type PaletteConfig, type RemoveQuestion, type AskRemove } from './paletteprovider'

/** an element of a palette cell (to be applied to a score's selection) */
export type PaletteElement = EngravingItem

/** MuseScore's mime type of an element in a drag (mimeSymbolFormat) */
export const MIME_SYMBOL_FORMAT = 'application/musescore/symbol'
/** PaletteCell::mimeDataFormat */
export const MIME_PALETTE_CELL_FORMAT = 'application/musescore/palette/cell'

export interface PaletteCellInfo {
    /** unique within the session */
    id: string
    /** the translated name (tooltip, accessible name); empty for action cells (use the action's description) */
    name: string
    /** the action of an ActionIcon cell (e.g. "acciaccatura"), null otherwise */
    action: string | null
    /** the code point in MuseScore's icon font of a layout break cell, 0 otherwise */
    icon: number
    /** the size of the icon font (action and layout break cells) in CSS pixels, for extraMag 1 */
    iconSize: number
    mag: number
    xoffset: number
    yoffset: number
    drawStaff: boolean
    /** MuseScore's element type name (e.g. "Clef") */
    elementType: string
    /** a custom cell (added by the user) */
    custom: boolean
    /** shown in the palette (hidden custom cells are offered by "More") */
    visible: boolean
}

export interface PaletteInfo {
    /** identifies the palette (unique within the session) */
    id: string
    /** the palette type (PaletteType name, e.g. "Clef"; "Custom" for custom palettes) */
    type: string
    /** the translated name */
    name: string
    gridWidth: number
    gridHeight: number
    /** the palette's mag: the extraMag of its cells */
    mag: number
    drawGrid: boolean
    /** shown (hidden palettes are offered by "Add palettes") */
    visible: boolean
    /** a custom palette (created by the user or loaded from a file) */
    custom: boolean
    /** editing enabled ("Enable editing" of the palette's menu) */
    editable: boolean
    /** expanded in the palette tree (user palettes) */
    expanded: boolean
    /** the cells (of user palettes: the visible ones) */
    cells: PaletteCellInfo[]
}

export interface DrawPaletteCellOptions {
    /** the size of the cell in CSS pixels */
    width: number
    height: number
    /** device pixels per CSS pixel (default 1) */
    dpr?: number
    /** the element color (PaletteConfiguration::elementsColor, the theme's text color), CSS hex color; default black */
    color?: string
    /** the palette's mag (PaletteModel's extraMag; default: the palette of the cell) */
    extraMag?: number
}

let s_defaultTree: PaletteTree | null = null
let s_masterTree: PaletteTree | null = null
let s_provider: PaletteProvider | null = null
const s_cells = new Map<string, { cell: PaletteCell; palette: Palette }>()

function register(tree: PaletteTree): PaletteTree {
    for (const p of tree.palettes) {
        for (const c of p.cells()) {
            s_cells.set(c.id, { cell: c, palette: p })
        }
    }
    return tree
}

function defaultTree(): PaletteTree {
    s_defaultTree ??= register(PaletteCreator.newDefaultPaletteTree())
    return s_defaultTree
}

function masterTree(): PaletteTree {
    s_masterTree ??= register(PaletteCreator.newMasterPaletteTree())
    return s_masterTree
}

/** the cell (and its palette) of an id; the cells of the user palette tree change, so they are looked up there too */
function findCell(cellId: string): { cell: PaletteCell; palette: Palette } | null {
    let entry = s_cells.get(cellId)
    if (!entry && s_provider) {
        register(s_provider.userPaletteTree())
        register(s_provider.masterPaletteModel().paletteTree())
        entry = s_cells.get(cellId)
    }
    return entry ?? null
}

function cellInfo(cell: PaletteCell): PaletteCellInfo {
    const e = cell.element
    cell.retranslate()
    return {
        id: cell.id,
        name: e && e.type() === ElementType.ACTION_ICON ? '' : cell.translatedName(),
        action: e && e.type() === ElementType.ACTION_ICON ? (e as ActionIcon).actionCode() : null,
        icon: e && e.type() === ElementType.LAYOUT_BREAK ? (e as LayoutBreak).iconCode() : 0,
        // UI_ICONS_DEFAULT_FONT_SIZE (points) at 96 DPI, scaled like the elements (the cell's mag)
        iconSize: UI_ICONS_DEFAULT_FONT_SIZE * 96 / 72 * cell.mag,
        mag: cell.mag,
        xoffset: cell.xoffset,
        yoffset: cell.yoffset,
        drawStaff: cell.drawStaff,
        elementType: e ? e.typeName() : '',
        custom: cell.custom,
        visible: cell.visible,
    }
}

function paletteInfo(p: Palette, cells: readonly PaletteCell[] = p.cells()): PaletteInfo {
    return {
        id: p.id(),
        type: PaletteType[p.type()],
        name: p.translatedName(),
        gridWidth: p.gridSize().width,
        gridHeight: p.gridSize().height,
        mag: p.mag(),
        drawGrid: p.drawGrid(),
        visible: p.isVisible(),
        custom: p.isCustom(),
        editable: p.isEditable(),
        expanded: p.isExpanded(),
        cells: cells.map(c => cellInfo(c)),
    }
}

/** MuseScore's default palettes (PaletteCreator::newDefaultPaletteTree), with the names in the current language */
export function defaultPalettes(): PaletteInfo[] {
    return defaultTree().palettes.map(p => paletteInfo(p))
}

/** the master palette (PaletteCreator::newMasterPaletteTree: all elements; used by the search) */
export function masterPalettes(): PaletteInfo[] {
    return masterTree().palettes.map(p => paletteInfo(p))
}

/** the element of a cell (for applying it to a score), null if unknown */
export function paletteCellElement(cellId: string): PaletteElement | null {
    return findCell(cellId)?.cell.element ?? null
}

/**
 * Draws the icon of a palette cell (PaletteCellIconEngine::paintCell) onto a canvas of width * dpr x height * dpr
 * pixels: the element centered in the cell (or on dummy staff lines), at the palette's size. The canvas is not
 * cleared. Action and layout break cells draw nothing (see `action` / `icon`).
 */
export function drawPaletteCell(cellId: string, ctx: Canvas2D, options: DrawPaletteCellOptions): void {
    const entry = findCell(cellId)
    if (!entry) {
        return
    }
    const dpr = options.dpr ?? 1
    const provider = new CanvasPaintProvider(ctx, new Transform(dpr, 0, 0, dpr, 0, 0))
    const painter = new Painter(provider, fontProvider(), 'palettecell')
    entry.cell.retranslate()
    const engine = new PaletteCellIconEngine(entry.cell, options.extraMag ?? entry.palette.mag())
    engine.paintCell(painter, new RectF(0, 0, options.width, options.height), Color.fromString(options.color ?? '#000000'))
}

/** PaletteConfiguration::paletteSpatium (pixels at 100%) */
export function paletteCellSpatium(): number {
    return paletteSpatium()
}

// =====================================================================================================================
//   the user palette tree (PaletteProvider, PaletteWorkspaceSetup, UserPaletteController)
// =====================================================================================================================

function provider(): PaletteProvider {
    if (!s_provider) {
        s_provider = new PaletteProvider()
        register(s_provider.masterPaletteModel().paletteTree())
        s_provider.setDefaultPaletteTree(defaultTree())
        s_provider.setUserPaletteTree(register(PaletteCreator.newDefaultPaletteTree()))
    }
    return s_provider
}

function paletteIndex(paletteId: string): PaletteIndex | null {
    return provider().userPaletteModel().paletteIndex(paletteId)
}

function cellIndex(cellId: string): PaletteIndex | null {
    return provider().userPaletteModel().cellIndex(cellId)
}

/**
 * PaletteWorkspaceSetup::setup: the user palette tree from stored PaletteTree XML (userPalettesXml), or MuseScore's
 * default palette tree (null, or data that cannot be read). Returns false if the data could not be read.
 */
export function loadUserPalettes(xml: string | null): boolean {
    const p = provider()
    let tree: PaletteTree | null = null
    let ok = true
    if (xml) {
        tree = readPaletteTree(xml)
        ok = !!tree
    }
    p.setUserPaletteTree(register(tree ?? PaletteCreator.newDefaultPaletteTree()))
    return ok
}

/** PaletteWorkspaceSetup::readPalette: the first <PaletteBox> of the data */
function readPaletteTree(xml: string): PaletteTree | null {
    const reader = new XmlReader(xml)
    while (reader.readNextStartElement()) {
        if (reader.name() === 'PaletteBox') {
            // TODO(port): gpaletteScore->setMscVersion(version of the file) for PaletteCompat (unversioned: 4.6)
            const p = new PaletteProvider()
            if (!p.read(reader, true)) {
                return null
            }
            return p.userPaletteTree()
        }
        reader.skipCurrentElement()
    }
    return null
}

/**
 * PaletteWorkspaceSetup::writePalette: the user palette tree as XML (to be stored and given to loadUserPalettes).
 * Deviation: written in paste mode, so the expanded state of the palettes is kept too.
 */
export function userPalettesXml(): string {
    const xml = new XmlWriter()
    provider().write(xml, true)
    xml.flush()
    return xml.text()
}

/** calls the listener after every change of the user palette tree (C++ userPaletteTreeChanged); returns the remover */
export function onUserPalettesChanged(listener: () => void): () => void {
    return provider().onUserPaletteTreeChanged(listener)
}

/** the palettes of the user palette tree (all, also the hidden ones; their visible cells), names in the current language */
export function userPalettes(): PaletteInfo[] {
    return provider().userPaletteTree().palettes.map(p => paletteInfo(p, p.cells().filter(c => c.visible)))
}

export interface ExtraPaletteInfo {
    /** identifies the entry for addExtraPalette */
    key: string
    name: string
    custom: boolean
}

/** PaletteProvider::availableExtraPalettesModel: the palettes "Add palettes" offers */
export function extraPalettes(): ExtraPaletteInfo[] {
    return provider().availableExtraPalettesModel().map(e => ({ key: extraKey(e), name: e.name, custom: e.custom }))
}

function extraKey(e: ExtraPalette): string {
    const tree = e.model === 'master' ? provider().masterPaletteModel() : provider().userPaletteModel()
    return `${e.model}:${tree.palettes()[e.index.palette].id()}`
}

/** PaletteProvider::addPalette: shows a hidden palette (at the top) or adds one of the master palette; returns its id */
export function addExtraPalette(key: string): string | null {
    const entry = provider().availableExtraPalettesModel().find(e => extraKey(e) === key)
    if (!entry || !provider().addPalette(entry)) {
        return null
    }
    return provider().userPaletteTree().palettes[0]?.id() ?? null
}

/** CreateCustomPalettePopup / "Insert new palette": a new custom palette at `row` (UserPaletteController::insertNewItem) */
export function createCustomPalette(name: string, row = 0): string | null {
    if (!provider().mainPaletteController().insertNewItem(null, row, name)) {
        return null
    }
    return provider().userPaletteTree().palettes[row]?.id() ?? null
}

/** PaletteTreeModel PaletteExpandedRole (singlePalette: PaletteConfiguration::isSinglePalette) */
export function setPaletteExpanded(paletteId: string, expanded: boolean, singlePalette = false): void {
    const idx = paletteIndex(paletteId)
    if (idx) {
        provider().userPaletteModel().setExpanded(idx, expanded, singlePalette)
    }
}

/** expands or collapses all palettes */
export function setAllPalettesExpanded(expanded: boolean): void {
    const model = provider().userPaletteModel()
    const blocked = model.blockTreeChanged(true)
    model.palettes().forEach((_, i) => model.setExpanded({ palette: i, cell: -1 }, expanded, false))
    model.blockTreeChanged(blocked)
}

/** "Enable editing" (EditableRole) */
export function setPaletteEditable(paletteId: string, editable: boolean): void {
    const idx = paletteIndex(paletteId)
    if (idx) {
        provider().userPaletteModel().setEditable(idx, editable)
    }
}

/** "Hide palette" / "Hide/Delete palette" (the palette tree's hidePalette: UserPaletteController::remove) */
export function removePalette(paletteId: string, ask: AskRemove): Promise<void> {
    const idx = paletteIndex(paletteId)
    return idx ? provider().mainPaletteController().removeOne(idx, ask) : Promise.resolve()
}

/** moves a palette to another row of the tree (drag and drop of palettes) */
export function movePalette(paletteId: string, toRow: number): boolean {
    const idx = paletteIndex(paletteId)
    return !!idx && provider().mainPaletteController().move(null, idx.palette, null, toRow)
}

/** the controller may edit the palette (UserPaletteController::canEdit) */
export function canEditPalette(paletteId: string): boolean {
    const idx = paletteIndex(paletteId)
    return !!idx && provider().mainPaletteController().canEdit(idx)
}

/**
 * The "More" popup of a user palette (MoreElementsPopup): the master palette's cells of the palette type that the
 * palette does not contain (poolPalette), and the palette's hidden custom cells (customElementsPalette)
 */
export function morePaletteCells(paletteId: string): { poolName: string; pool: PaletteCellInfo[]; custom: PaletteCellInfo[] } {
    const idx = paletteIndex(paletteId)
    if (!idx) {
        return { poolName: '', pool: [], custom: [] }
    }
    const pool = provider().poolPalette(idx)
    return {
        poolName: pool?.palette.translatedName() ?? '',
        pool: pool ? pool.cells.map(c => cellInfo(c)) : [],
        custom: provider().customElementsPaletteCells(idx).map(c => cellInfo(c)),
    }
}

/** the mime data of a cell in a drag (PaletteTreeModel MimeDataRole): the element and the cell */
export function paletteCellMimeData(cellId: string): { symbol?: string; cell?: string } {
    const entry = findCell(cellId)
    if (!entry) {
        return {}
    }
    const res: { symbol?: string; cell?: string } = { cell: entry.cell.toMimeData() }
    if (entry.cell.element) {
        res.symbol = entry.cell.element.mimeData()
    }
    return res
}

/**
 * Inserts a cell into a user palette at `row` (-1: at the end) from drag data (UserPaletteController::insert):
 * `cell` data with "move" (a cell of "More" or another palette: shown again if the palette has it hidden), or an
 * element (`symbol`, e.g. dragged from the score with Ctrl+Shift) with "copy": a new custom cell. `controller`
 * "custom": the custom cells of "More" (hidden custom cells). Returns false if the palette does not accept it.
 */
export function insertPaletteCell(paletteId: string, row: number, mime: PaletteMimeData, action: 'copy' | 'move',
    controller: 'main' | 'custom' = 'main'): boolean {
    const idx = paletteIndex(paletteId)
    if (!idx) {
        return false
    }
    const c = controller === 'custom' ? provider().customElementsPaletteController() : provider().mainPaletteController()
    return c.insert(idx, row, mime, action === 'copy' ? DropAction.CopyAction : DropAction.MoveAction)
}

/** the drop would be accepted (UserPaletteController::dropAction) */
export function canInsertPaletteCell(paletteId: string, mime: PaletteMimeData, action: 'copy' | 'move', internal = false): boolean {
    const idx = paletteIndex(paletteId)
    return !!idx && provider().mainPaletteController().dropAction(mime, action === 'copy' ? DropAction.CopyAction
        : DropAction.MoveAction, idx, internal) !== DropAction.IgnoreAction
}

/** "Add to %1" of the More popup: the cells (of the pool or the hidden custom cells) added at the end */
export function addCellsToPalette(paletteId: string, cellIds: readonly string[]): number {
    const idx = paletteIndex(paletteId)
    if (!idx) {
        return 0
    }
    let n = 0
    for (const id of cellIds) {
        const entry = findCell(id)
        if (!entry) {
            continue
        }
        const row = provider().userPaletteModel().rowCount(idx)
        if (provider().mainPaletteController().insert(idx, row, { cell: entry.cell.toMimeData() }, DropAction.MoveAction)) {
            n++
        }
    }
    return n
}

/** the row of a cell in its user palette (hidden cells count too), -1 if unknown */
export function paletteCellRow(cellId: string): number {
    return cellIndex(cellId)?.cell ?? -1
}

/** the number of cells of a user palette (hidden cells count too) */
export function paletteCellCount(paletteId: string): number {
    const idx = paletteIndex(paletteId)
    return idx ? provider().userPaletteModel().rowCount(idx) : 0
}

/** moves a cell inside its palette (drag and drop in the palette): `toRow` is its new row */
export function movePaletteCell(cellId: string, toRow: number): boolean {
    const idx = cellIndex(cellId)
    if (!idx) {
        return false
    }
    const parent = { palette: idx.palette, cell: -1 }
    return provider().mainPaletteController().move(parent, idx.cell, parent, toRow)
}

/**
 * Removes cells ("Delete" of the cell menu, the palette header's delete button: UserPaletteController::remove /
 * removeSelection): default cells are deleted, for custom cells `ask` decides (hide or delete permanently)
 */
export function removePaletteCells(cellIds: readonly string[], ask: AskRemove, controller: 'main' | 'custom' = 'main'): Promise<void> {
    const indices = cellIds.map(id => cellIndex(id)).filter((x): x is PaletteIndex => !!x)
    if (!indices.length) {
        return Promise.resolve()
    }
    const c = controller === 'custom' ? provider().customElementsPaletteController() : provider().mainPaletteController()
    return c.removeSelection(indices, { palette: indices[0].palette, cell: -1 }, ask)
}

/** the cell can be edited (deleted, properties): its palette is editable */
export function canEditPaletteCell(cellId: string): boolean {
    const idx = cellIndex(cellId)
    return !!idx && provider().mainPaletteController().canEdit(idx)
}

/** "Palette properties…": the current properties (null if the palette cannot be edited) */
export function paletteProperties(paletteId: string): PaletteConfig | null {
    const idx = paletteIndex(paletteId)
    return idx ? provider().mainPaletteController().editPaletteProperties(idx) : null
}

/** the properties dialog changed a value (applied at once, like MuseScore; Cancel sets the original config again) */
export function setPaletteProperties(paletteId: string, config: PaletteConfig): void {
    const idx = paletteIndex(paletteId)
    if (idx) {
        provider().mainPaletteController().setPaletteConfig(idx, config)
    }
}

/** "Properties…" of a cell */
export function paletteCellProperties(cellId: string): PaletteCellConfig | null {
    const idx = cellIndex(cellId)
    return idx ? provider().mainPaletteController().editCellProperties(idx) : null
}

export function setPaletteCellProperties(cellId: string, config: PaletteCellConfig): void {
    const idx = cellIndex(cellId)
    if (idx) {
        provider().mainPaletteController().setCellConfig(idx, config)
    }
}

/** the question "Reset palette" asks first (source string, context "palette") */
export const RESET_PALETTE_QUESTION = PaletteProvider.RESET_PALETTE_QUESTION

/** "Reset palette" (PaletteProvider::doResetPalette, after the question): the default or master palette of its type */
export function resetPalette(paletteId: string): void {
    const idx = paletteIndex(paletteId)
    if (idx) {
        provider().doResetPalette(idx)
    }
}

/** "Save palette…": the palette as .mpal file data, and its translated name (the default file name) */
export function savePaletteFile(paletteId: string): { name: string; data: Uint8Array } | null {
    const idx = paletteIndex(paletteId)
    const pp = idx ? provider().userPaletteModel().findPalette(idx) : null
    return pp ? { name: pp.translatedName(), data: pp.writeToData() } : null
}

/** "Load palette…": a palette of an .mpal file inserted as custom palette before the palette `atPaletteId` */
export function loadPaletteFile(atPaletteId: string | null, data: Uint8Array): string | null {
    const pp = new Palette()
    if (!pp.readFromData(data)) {
        return null
    }
    const idx = atPaletteId ? paletteIndex(atPaletteId) : null
    if (!provider().insertLoadedPalette(pp, idx)) {
        return null
    }
    register(provider().userPaletteTree())
    return pp.id()
}
