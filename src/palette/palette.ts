/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palette.h/.cpp
 *
 * TODO(port): reading/writing palettes (.mpal, workspace), mime data, Palette::guessType for custom palettes
 */

import { qtrc } from '../framework/global/translation'
import type { EngravingItem } from '../engraving/dom/engravingitem'
import { ActionIcon, type ActionIconType } from '../engraving/dom/actionicon'
import { BracketType } from '../engraving/types/types'
import type { Bracket } from '../engraving/dom/bracket'
import { scoreDummy } from '../engraving/compat/dummyelement'
import { gpaletteScore } from '../engraving/dom/palettescore'
import { SingleLayout } from '../engraving/rendering/single/singlelayout'
import { PaletteCell } from './palettecell'

export enum PaletteType {
    Unknown = 0,
    Clef,
    KeySig,
    TimeSig,
    Bracket,
    Accidental,
    Articulation,
    Ornament,
    Breath,
    GraceNote,
    NoteHead,
    Line,
    BarLine,
    Arpeggio,
    Tremolo,
    Text,
    Tempo,
    Dynamic,
    Fingering,
    Repeat,
    FretboardDiagram,
    Accordion,
    BagpipeEmbellishment,
    Layout,
    Beam,
    Guitar,
    Keyboard,
    Pitch,
    Harp,
    StringTunings,
    Playback,
    Handbells,
    Custom,
}

let s_paletteId = 0

export class Palette {
    private m_id: string
    private m_type: PaletteType
    private m_name = ''
    private m_cells: PaletteCell[] = []

    private m_yOffset = 0.0 // in spatium units of "gscore"
    private m_mag = 1.0
    private m_gridSize = { width: 64, height: 64 }
    private m_drawGrid = false

    private m_isVisible = true
    private m_isEditable = true
    private m_isExpanded = false

    constructor(t: PaletteType = PaletteType.Custom) {
        this.m_type = t
        this.m_id = String(++s_paletteId)
    }

    id(): string { return this.m_id }

    name(): string { return this.m_name }
    setName(str: string): void { this.m_name = str }
    translatedName(): string { return qtrc('palette', this.m_name) }

    retranslate(): void {
        for (const cell of this.m_cells) {
            cell.retranslate()
        }
    }

    type(): PaletteType { return this.m_type }
    setType(t: PaletteType): void { this.m_type = t }

    cells(): readonly PaletteCell[] { return this.m_cells }
    cellAt(idx: number): PaletteCell | null { return this.m_cells[idx] ?? null }
    cellsCount(): number { return this.m_cells.length }

    yOffset(): number { return this.m_yOffset }
    setYOffset(val: number): void { this.m_yOffset = val }
    mag(): number { return this.m_mag }
    setMag(val: number): void { this.m_mag = val }
    drawGrid(): boolean { return this.m_drawGrid }
    setDrawGrid(val: boolean): void { this.m_drawGrid = val }
    gridSize(): { width: number; height: number } { return this.m_gridSize }
    setGridSize(w: number, h: number): void { this.m_gridSize = { width: w, height: h } }
    isVisible(): boolean { return this.m_isVisible }
    setVisible(val: boolean): void { this.m_isVisible = val }
    isEditable(): boolean { return this.m_isEditable }
    setEditable(val: boolean): void { this.m_isEditable = val }
    isExpanded(): boolean { return this.m_isExpanded }
    setExpanded(val: boolean): void { this.m_isExpanded = val }

    insertElement(idx: number, element: EngravingItem | null, name: string, mag = 1.0, offset = { x: 0, y: 0 }, tag = ''): PaletteCell {
        if (element) {
            // layout may be important for comparing cells, e.g. filtering "More" popup content
            SingleLayout.layoutItem(element)
        }
        const cell = new PaletteCell(element, name, mag, offset, tag)
        this.cellHandlerByPaletteType(this.m_type)?.(cell)
        this.m_cells.splice(idx, 0, cell)
        return cell
    }

    appendElement(element: EngravingItem | null, name: string, mag = 1.0, offset = { x: 0, y: 0 }, tag = ''): PaletteCell {
        return this.insertElement(this.m_cells.length, element, name, mag, offset, tag)
    }

    /**
     * C++ appendActionIcon: the name is the action's description (or title); here the app resolves it (and the
     * icon) from the action code, so the cell's name stays empty (see palette/api.ts).
     */
    appendActionIcon(type: ActionIconType, code: string, mag = 1.0): PaletteCell {
        const icon = new ActionIcon(scoreDummy(gpaletteScore()))
        icon.setActionType(type)
        icon.setAction(code, 0)
        return this.appendElement(icon, '', mag)
    }

    insertCell(idx: number, cell: PaletteCell): boolean {
        return this.insertCells(idx, [cell])
    }

    insertCells(idx: number, cells: PaletteCell[]): boolean {
        if (idx > this.m_cells.length) {
            return false
        }
        this.m_cells.splice(idx, 0, ...cells)
        return true
    }

    removeCell(cell: PaletteCell): boolean {
        return this.removeCells([cell])
    }

    removeCells(cells: PaletteCell[]): boolean {
        this.m_cells = this.m_cells.filter(c => !cells.includes(c))
        return true
    }

    takeCells(idx: number, count: number): PaletteCell[] {
        if (idx + count > this.m_cells.length) {
            return []
        }
        return this.m_cells.splice(idx, count)
    }

    /** C++ indexOfCell: the equivalent cell (same element type/subtype, name, offsets, mag ...); -1 if none */
    indexOfCell(cell: PaletteCell, matchName = true): number {
        const el = cell.element
        if (!el) {
            return -1
        }
        for (let i = 0; i < this.m_cells.length; ++i) {
            const localCell = this.m_cells[i]
            if (matchName && localCell.name !== cell.name) {
                continue
            }
            const exElement = localCell.element
            // TODO(port): C++ also compares the elements' mime data (all properties)
            if (exElement && !(exElement.type() === el.type() && exElement.subtype() === el.subtype())) {
                continue
            }
            if (localCell.drawStaff !== cell.drawStaff
                || localCell.xoffset !== cell.xoffset
                || localCell.yoffset !== cell.yoffset
                || localCell.mag !== cell.mag
                || localCell.readOnly !== cell.readOnly
                || localCell.visible !== cell.visible
                || localCell.custom !== cell.custom) {
                continue
            }
            return i
        }
        return -1
    }

    private cellHandlerByPaletteType(type: PaletteType): ((cell: PaletteCell) => void) | null {
        switch (type) {
        case PaletteType.Bracket:
            return (cell) => {
                if (!cell.element || !cell.element.isBracket()) {
                    return
                }
                const bracket = cell.element as Bracket
                if (bracket.bracketType() === BracketType.BRACE) {
                    bracket.setStaffSpan(0, 1)
                    cell.mag = 1.2
                }
            }
        default:
            return null
        }
    }
}
