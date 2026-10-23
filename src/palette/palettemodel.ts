/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/palettemodel.h/.cpp (PaletteTreeModel): the operations on a palette tree that the
 * palette provider and controllers use. C++ is a QAbstractItemModel addressed by QModelIndex; here an index is the
 * palette row (and the cell row inside the palette): PaletteIndex. The roles of data()/setData() are methods.
 * The cell filters (PaletteCellFilter, VisibilityCellFilter, CustomizedCellFilter, ExcludePaletteCellFilter) are
 * plain predicates.
 */

import { Palette, PaletteType } from './palette'
import { PaletteCell } from './palettecell'
import type { PaletteTree } from './palettetree'

/** C++ QModelIndex of the tree: a palette (cell = -1) or a cell of a palette */
export interface PaletteIndex {
    palette: number
    cell: number
}

/** C++ Qt::DropAction (the ones used by the palettes) */
export enum DropAction {
    IgnoreAction = 0,
    CopyAction = 0x1,
    MoveAction = 0x2,
}

/** the mime data of a drag (C++ QVariantMap / QMimeData): the formats used by the palettes */
export interface PaletteMimeData {
    /** PaletteCell::mimeDataFormat */
    cell?: string
    /** mimeSymbolFormat ("application/musescore/symbol"): an element (EngravingItem::mimeData) */
    symbol?: string
    /** Palette::mimeDataFormat */
    palette?: string
}

/** C++ PaletteCellFilter: accepts a cell */
export type PaletteCellFilter = (cell: PaletteCell) => boolean

/** C++ VisibilityCellFilter */
export const visibilityCellFilter = (acceptedValue: boolean): PaletteCellFilter => cell => cell.visible === acceptedValue
/** C++ CustomizedCellFilter */
export const customizedCellFilter = (acceptedValue: boolean): PaletteCellFilter => cell => cell.custom === acceptedValue

export class PaletteTreeModel {
    private m_paletteTree: PaletteTree
    private m_listeners = new Set<() => void>()
    private m_treeChangedBlocked = false
    private m_treeChanged = false

    constructor(tree: PaletteTree) {
        this.m_paletteTree = tree
    }

    paletteTree(): PaletteTree { return this.m_paletteTree }
    palettes(): Palette[] { return this.m_paletteTree.palettes }

    /** C++ setPaletteTree (modelReset) */
    setPaletteTree(newTree: PaletteTree): void {
        this.m_paletteTree = newTree
        this.setTreeChanged()
    }

    /** C++ signal treeChanged; returns a function that removes the listener */
    onTreeChanged(listener: () => void): () => void {
        this.m_listeners.add(listener)
        return () => this.m_listeners.delete(listener)
    }

    /** C++ setTreeChanged (connected to all change signals of the model) */
    setTreeChanged(): void {
        if (this.m_treeChangedBlocked) {
            this.m_treeChanged = true
            return
        }
        for (const l of [...this.m_listeners]) {
            l()
        }
    }

    blockTreeChanged(block: boolean): boolean {
        const wasBlocked = this.m_treeChangedBlocked
        this.m_treeChangedBlocked = block
        if (!block && this.m_treeChanged) {
            this.m_treeChanged = false
            this.setTreeChanged()
        }
        return wasBlocked
    }

    // -----------------------------------------------------------------------------------------------------------------
    //   indices
    // -----------------------------------------------------------------------------------------------------------------

    findPalette(index: PaletteIndex | null): Palette | null {
        if (!index || index.cell >= 0) {
            return null
        }
        return this.palettes()[index.palette] ?? null
    }

    findCell(index: PaletteIndex | null): PaletteCell | null {
        if (!index || index.cell < 0) {
            return null
        }
        return this.palettes()[index.palette]?.cellAt(index.cell) ?? null
    }

    /** the palette containing a cell (C++ iptrToPalette) */
    parentPalette(index: PaletteIndex): Palette | null {
        return this.palettes()[index.palette] ?? null
    }

    paletteIndex(palette: Palette | string): PaletteIndex | null {
        const row = this.palettes().findIndex(p => (typeof palette === 'string' ? p.id() === palette : p === palette))
        return row < 0 ? null : { palette: row, cell: -1 }
    }

    cellIndex(cell: PaletteCell | string): PaletteIndex | null {
        const palettes = this.palettes()
        for (let row = 0; row < palettes.length; ++row) {
            const idx = palettes[row].cells().findIndex(c => (typeof cell === 'string' ? c.id === cell : c === cell))
            if (idx >= 0) {
                return { palette: row, cell: idx }
            }
        }
        return null
    }

    /** rowCount: the palettes of the tree (parent null) or the cells of a palette */
    rowCount(parent: PaletteIndex | null): number {
        if (!parent) {
            return this.palettes().length
        }
        return this.findPalette(parent)?.cellsCount() ?? 0
    }

    // -----------------------------------------------------------------------------------------------------------------
    //   data / setData roles
    // -----------------------------------------------------------------------------------------------------------------

    /** VisibleRole */
    isVisible(index: PaletteIndex): boolean {
        const pp = this.findPalette(index)
        if (pp) {
            return pp.isVisible()
        }
        return this.findCell(index)?.visible ?? false
    }

    /** CustomRole */
    isCustom(index: PaletteIndex): boolean {
        const pp = this.findPalette(index)
        if (pp) {
            return pp.isCustom()
        }
        return this.findCell(index)?.custom ?? false
    }

    /** EditableRole (the root item, index null, is editable) */
    isEditable(index: PaletteIndex | null): boolean {
        if (!index) {
            return true
        }
        const pp = this.findPalette(index)
        if (pp) {
            return pp.isEditable()
        }
        if (this.findCell(index)) {
            return this.parentPalette(index)?.isEditable() ?? false
        }
        return false
    }

    /** MimeDataRole of a cell */
    cellMimeData(index: PaletteIndex): PaletteMimeData {
        const cell = this.findCell(index)
        if (!cell) {
            return {}
        }
        const map: PaletteMimeData = {}
        if (cell.element) {
            map.symbol = cell.element.mimeData()
        }
        map.cell = cell.toMimeData()
        return map
    }

    setVisible(index: PaletteIndex, val: boolean): boolean {
        const pp = this.findPalette(index)
        if (pp) {
            if (val !== pp.isVisible()) {
                pp.setVisible(val)
                this.setTreeChanged()
            }
            return true
        }
        const cell = this.findCell(index)
        if (cell) {
            if (val !== cell.visible) {
                cell.visible = val
                this.setTreeChanged()
            }
            return true
        }
        return false
    }

    setCustom(index: PaletteIndex, val: boolean): boolean {
        const cell = this.findCell(index)
        if (!cell) {
            return false
        }
        if (val !== cell.custom) {
            cell.custom = val
            this.setTreeChanged()
        }
        return true
    }

    setEditable(index: PaletteIndex, val: boolean): boolean {
        const pp = this.findPalette(index)
        if (!pp) {
            return false
        }
        if (val !== pp.isEditable()) {
            pp.setEditable(val)
            this.setTreeChanged()
        }
        return true
    }

    /** PaletteExpandedRole: singlePalette = PaletteConfiguration::isSinglePalette */
    setExpanded(index: PaletteIndex, val: boolean, singlePalette: boolean): boolean {
        const pp = this.findPalette(index)
        if (!pp) {
            return false
        }
        if (val !== pp.isExpanded()) {
            if (singlePalette && val) {
                for (const palette of this.palettes()) {
                    palette.setExpanded(false)
                }
            }
            pp.setExpanded(val)
            this.setTreeChanged()
        }
        return true
    }

    /** Qt::DisplayRole of a palette */
    setName(index: PaletteIndex, name: string): boolean {
        const pp = this.findPalette(index)
        if (!pp) {
            return false
        }
        pp.setName(name)
        this.setTreeChanged()
        return true
    }

    /** C++ itemDataChanged (after a palette or cell was changed directly) */
    itemDataChanged(_idx: PaletteIndex): void {
        this.setTreeChanged()
    }

    // -----------------------------------------------------------------------------------------------------------------
    //   mime data, drop, move, remove, insert
    // -----------------------------------------------------------------------------------------------------------------

    /** C++ mimeData of one index */
    mimeData(index: PaletteIndex): PaletteMimeData {
        const pp = this.findPalette(index)
        if (pp) {
            return { palette: pp.toMimeData() }
        }
        const cell = this.findCell(index)
        if (cell?.element) {
            return { symbol: cell.element.mimeData() }
        }
        return {}
    }

    canDropMimeData(data: PaletteMimeData, action: DropAction, row: number, parent: PaletteIndex | null): boolean {
        if (!parent) {
            return action === DropAction.CopyAction && data.palette !== undefined
        }

        const pp = this.findPalette(parent)
        if (pp) {
            if (row < 0 || row > pp.cellsCount()) {
                return false
            }

            if (data.cell !== undefined) {
                return (action & (DropAction.CopyAction | DropAction.MoveAction)) !== 0
            } else if (data.symbol !== undefined) {
                return action === DropAction.CopyAction
            }
        }
        return false
    }

    dropMimeData(data: PaletteMimeData, action: DropAction, row: number, parent: PaletteIndex | null): boolean {
        if (!parent) {
            if (action !== DropAction.CopyAction || data.palette === undefined) {
                return false
            }
            if (row < 0 || row > this.palettes().length) {
                return false
            }

            const palette = Palette.fromMimeData(data.palette)
            if (!palette) {
                return false
            }

            this.palettes().splice(row, 0, palette)
            this.setTreeChanged()
            return true
        }

        const pp = this.findPalette(parent)
        if (pp) {
            if (row < 0 || row > pp.cellsCount()) {
                return false
            }

            let cell: PaletteCell | null = null

            if (data.cell !== undefined) {
                cell = PaletteCell.fromMimeData(data.cell)
                if (cell && action === DropAction.CopyAction) {
                    cell.custom = true
                }
            } else if (data.symbol !== undefined) {
                cell = PaletteCell.fromElementMimeData(data.symbol)
                if (cell) {
                    cell.custom = true // the cell is created by dropping an element so it is custom
                }
            }

            if (!cell) {
                return false
            }

            pp.insertCell(row, cell)
            this.setTreeChanged()
            return true
        }
        return false
    }

    /** C++ moveRows with count 1 (moveRow) */
    moveRow(sourceParent: PaletteIndex | null, sourceRow: number, destinationParent: PaletteIndex | null, destinationChild: number): boolean {
        return this.moveRows(sourceParent, sourceRow, 1, destinationParent, destinationChild)
    }

    moveRows(sourceParent: PaletteIndex | null, sourceRow: number, count: number, destinationParent: PaletteIndex | null,
        destinationChild: number): boolean {
        const sameParent = (sourceParent === null && destinationParent === null)
            || (!!sourceParent && !!destinationParent && sourceParent.palette === destinationParent.palette
                && sourceParent.cell === destinationParent.cell)

        if (!sourceParent) {
            // moving palettes
            const palettes = this.palettes()
            if (sourceRow + count > palettes.length || destinationChild >= palettes.length) {
                return false
            }

            if (!sameParent) {
                // Cannot move between different parents, at least for now
                return false
            }

            // The moved rows are considered to be inserted *before* destinationRow,
            // so if we want to move a row down in the list within the same parent
            // then we should increment the destinationChild index.
            const destinationRow = (destinationChild >= sourceRow) ? destinationChild + 1 : destinationChild

            if (sourceRow === destinationRow) {
                return false
            }

            const movedPalettes = palettes.splice(sourceRow, count)
            const destIdx = (destinationRow < sourceRow) ? destinationRow : (destinationRow - count)
            palettes.splice(destIdx, 0, ...movedPalettes)
            this.setTreeChanged()
            return true
        }

        const sourcePalette = this.findPalette(sourceParent)
        const destPalette = sameParent ? sourcePalette : this.findPalette(destinationParent)
        if (sourcePalette && destPalette) {
            // moving palette cells
            if (sourceRow + count > sourcePalette.cellsCount() || destinationChild > destPalette.cellsCount()) {
                return false
            }

            // The moved rows are considered to be inserted *before* destinationRow,
            // so if we want to move a row down in the list within the same parent
            // then we should increment the destinationChild index.
            const destinationRow = (sameParent && destinationChild >= sourceRow) ? destinationChild + 1 : destinationChild

            if (sameParent && sourceRow === destinationRow) {
                return false
            }

            const movedCells = sourcePalette.takeCells(sourceRow, count)
            const destIdx = (sameParent && destinationRow >= sourceRow) ? (destinationRow - count) : destinationRow
            destPalette.insertCells(destIdx, movedCells)
            this.setTreeChanged()
            return true
        }

        return false
    }

    removeRow(row: number, parent: PaletteIndex | null): boolean {
        return this.removeRows(row, 1, parent)
    }

    removeRows(row: number, count: number, parent: PaletteIndex | null): boolean {
        if (!parent) {
            // removing palettes
            if (row < 0 || row + count > this.palettes().length) {
                return false
            }

            this.palettes().splice(row, count)
            this.setTreeChanged()
            return true
        }

        const palette = this.findPalette(parent)
        if (palette) {
            // removing palette cells
            if (row < 0 || row + count > palette.cellsCount()) {
                return false
            }

            palette.takeCells(row, count)
            this.setTreeChanged()
            return true
        }

        return false
    }

    insertRow(row: number, parent: PaletteIndex | null): boolean {
        return this.insertRows(row, 1, parent)
    }

    insertRows(row: number, count: number, parent: PaletteIndex | null): boolean {
        if (!parent) {
            // inserting palettes
            if (row < 0 || row > this.palettes().length) {
                return false
            }

            for (let i = 0; i < count; ++i) {
                const p = new Palette(PaletteType.Custom)
                p.setName('Untitled palette') // QT_TRANSLATE_NOOP("palette", "Untitled palette")
                p.setGridSize(48, 48)
                p.setExpanded(true)
                this.palettes().splice(row, 0, p)
            }
            this.setTreeChanged()
            return true
        }

        const palette = this.findPalette(parent)
        if (palette) {
            // inserting palette cells
            if (row < 0 || row > palette.cellsCount()) {
                return false
            }

            for (let i = 0; i < count; ++i) {
                palette.insertCell(row, new PaletteCell())
            }
            this.setTreeChanged()
            return true
        }

        return false
    }

    insertPalette(pp: Palette, row: number, parent: PaletteIndex | null): boolean {
        if (row < 0 || row > this.palettes().length || parent) {
            return false
        }
        this.palettes().splice(row, 0, pp)
        this.setTreeChanged()
        return true
    }

    retranslate(): void {
        this.m_paletteTree.retranslate()
    }

    findPaletteCell(cell: PaletteCell, parent: PaletteIndex): PaletteIndex | null {
        const pp = this.findPalette(parent)
        if (pp) {
            const idx = pp.indexOfCell(cell)
            if (idx === -1) {
                return null
            }
            return { palette: parent.palette, cell: idx }
        }
        return null
    }

    /** C++ match(start, PaletteTypeRole, type): the first palette of a type */
    findPaletteByType(type: PaletteType): PaletteIndex | null {
        const row = this.palettes().findIndex(p => p.type() === type)
        return row < 0 ? null : { palette: row, cell: -1 }
    }

    /** C++ getFilter (ExcludePaletteCellFilter): accepts the cells the palette does not contain */
    getFilter(index: PaletteIndex): PaletteCellFilter | null {
        const pp = this.findPalette(index)
        if (pp) {
            return cell => -1 === pp.indexOfCell(cell, /* matchName */ false)
        }
        return null
    }
}
