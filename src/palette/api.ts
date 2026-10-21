/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Public library API of the palettes (re-exported by src/index.ts): MuseScore's default palette tree and the master
 * palette ("More" and search) as plain data, and the painting of a cell's icon onto a canvas
 * (PaletteCellIconEngine). The trees are created on first use (the engraving fonts must be initialized).
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
import { ElementType } from '../engraving/types/types'
import { PaletteType, type Palette } from './palette'
import type { PaletteCell } from './palettecell'
import { PaletteCellIconEngine, paletteSpatium } from './palettecelliconengine'
import { PaletteCreator } from './palettecreator'
import type { PaletteTree } from './palettetree'

/** an element of a palette cell (to be applied to a score's selection) */
export type PaletteElement = EngravingItem

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
}

export interface PaletteInfo {
    /** the palette type (PaletteType name, e.g. "Clef"): identifies the palette in both trees */
    id: string
    /** the translated name */
    name: string
    gridWidth: number
    gridHeight: number
    /** the palette's mag: the extraMag of its cells */
    mag: number
    drawGrid: boolean
    /** shown by default (hidden palettes are offered by "Add palettes") */
    visible: boolean
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
    }
}

function paletteInfo(p: Palette, cells: readonly PaletteCell[] = p.cells()): PaletteInfo {
    return {
        id: PaletteType[p.type()],
        name: p.translatedName(),
        gridWidth: p.gridSize().width,
        gridHeight: p.gridSize().height,
        mag: p.mag(),
        drawGrid: p.drawGrid(),
        visible: p.isVisible(),
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

/**
 * The "More" elements of a palette (MoreElementsPopup): the cells of the master palette of the same type that the
 * default palette does not contain.
 */
export function morePaletteCells(paletteId: string): PaletteCellInfo[] {
    const master = masterTree().palettes.find(p => PaletteType[p.type()] === paletteId)
    const user = defaultTree().palettes.find(p => PaletteType[p.type()] === paletteId)
    if (!master) {
        return []
    }
    const cells = master.cells().filter(c => !user || user.indexOfCell(c, false) < 0)
    return cells.map(c => cellInfo(c))
}

/** the element of a cell (for applying it to a score), null if unknown */
export function paletteCellElement(cellId: string): PaletteElement | null {
    return s_cells.get(cellId)?.cell.element ?? null
}

/**
 * Draws the icon of a palette cell (PaletteCellIconEngine::paintCell) onto a canvas of width * dpr x height * dpr
 * pixels: the element centered in the cell (or on dummy staff lines), at the palette's size. The canvas is not
 * cleared. Action and layout break cells draw nothing (see `action` / `icon`).
 */
export function drawPaletteCell(cellId: string, ctx: Canvas2D, options: DrawPaletteCellOptions): void {
    const entry = s_cells.get(cellId)
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
