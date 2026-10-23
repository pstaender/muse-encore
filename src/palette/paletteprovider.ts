/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/palette/internal/paletteprovider.h/.cpp: PaletteProvider (the user palette tree, the master palette,
 * "Add palettes", reset) and UserPaletteController (editing the user palettes: insert, move, remove, properties).
 * Deviations: the models are not Qt proxy models: the controllers address the user palette tree directly (indices
 * of PaletteTreeModel); the questions (IInteractive) go through an `ask` callback of the caller; the properties
 * dialogs (musescore://palette/properties, .../cellproperties) are the app's: editPaletteProperties /
 * editCellProperties return the current config and setPaletteConfig / setCellConfig apply a changed one
 * (C++ IPaletteConfiguration::setPaletteConfig / setPaletteCellConfig and their channels).
 * TODO(port): PaletteElementEditor (the element editors of "More": key signatures, time signatures).
 */

import { Palette, PaletteType } from './palette'
import { PaletteCell } from './palettecell'
import { PaletteCreator } from './palettecreator'
import {
    DropAction, PaletteTreeModel, customizedCellFilter, visibilityCellFilter, type PaletteCellFilter, type PaletteIndex,
    type PaletteMimeData,
} from './palettemodel'
import { PaletteTree } from './palettetree'
import type { XmlReader } from '../engraving/rw/xmlreader'
import type { XmlWriter } from '../engraving/rw/xmlwriter'

/** C++ AbstractPaletteController::RemoveAction */
export enum RemoveAction {
    NoAction,
    Hide,
    DeletePermanently,
    AutoAction,
}

/**
 * A question to the user (C++ IInteractive::question): the source string of the question (translation context
 * "palette") and the possible answers; resolves to the chosen RemoveAction (NoAction: cancelled)
 */
export interface RemoveQuestion {
    question: string
    /** hideOrDelete: "Hide" / "Delete permanently" / "Cancel"; yesNo: "Yes" (DeletePermanently) / "No" */
    buttons: 'hideOrDelete' | 'yesNo'
}

export type AskRemove = (q: RemoveQuestion) => Promise<RemoveAction>

/** C++ IPaletteConfiguration::PaletteConfig */
export interface PaletteConfig {
    name: string
    size: { width: number; height: number }
    scale: number
    elementOffset: number
    showGrid: boolean
}

/** C++ IPaletteConfiguration::PaletteCellConfig */
export interface PaletteCellConfig {
    name: string
    scale: number
    drawStaff: boolean
    xOffset: number
    yOffset: number
}

/** an entry of availableExtraPalettesModel */
export interface ExtraPalette {
    name: string
    /** the palette is custom */
    custom: boolean
    /** the palette of the master palette (not in the user palette) or the hidden palette of the user palette */
    model: 'master' | 'user'
    index: PaletteIndex
}

// ========================================================
//   UserPaletteController
// ========================================================

export class UserPaletteController {
    private m_visible = true
    private m_custom = false
    private m_filterCustom = false
    private m_userEditable = true

    constructor(private m_userPalette: PaletteTreeModel) {}

    model(): PaletteTreeModel { return this.m_userPalette }

    visible(): boolean { return this.m_visible }
    setVisible(val: boolean): void { this.m_visible = val }
    custom(): boolean { return this.m_custom }
    setCustom(val: boolean): void {
        this.m_filterCustom = true
        this.m_custom = val
    }
    userEditable(): boolean { return this.m_userEditable }
    setUserEditable(val: boolean): void { this.m_userEditable = val }

    dropAction(mimeData: PaletteMimeData, proposedAction: DropAction, parent: PaletteIndex | null, internal: boolean): DropAction {
        if (internal && !this.userEditable()) {
            return DropAction.IgnoreAction
        }
        const parentEditingEnabled = this.m_userPalette.isEditable(parent)
        if (!parentEditingEnabled) {
            return DropAction.IgnoreAction
        }

        if (mimeData.cell !== undefined && proposedAction === DropAction.MoveAction) {
            const cell = PaletteCell.fromMimeData(mimeData.cell)
            if (!cell) {
                return DropAction.IgnoreAction
            }
            if (this.m_filterCustom && cell.custom !== this.m_custom) {
                return DropAction.IgnoreAction
            }
            return DropAction.MoveAction
        }
        if (mimeData.symbol !== undefined && proposedAction === DropAction.CopyAction) {
            if (this.m_filterCustom && !this.m_custom) {
                return DropAction.IgnoreAction
            }
            return DropAction.CopyAction
        }
        return DropAction.IgnoreAction
    }

    insert(parent: PaletteIndex, row: number, mimeData: PaletteMimeData, action: DropAction): boolean {
        if (this.dropAction(mimeData, action, parent, false) === DropAction.IgnoreAction) {
            return false
        }

        if (row < 0) {
            row = this.m_userPalette.rowCount(parent)
        }

        let cell: PaletteCell | null = null

        if (mimeData.cell !== undefined) {
            cell = PaletteCell.fromMimeData(mimeData.cell)

            if (!cell) {
                return false
            }
            if (this.m_filterCustom && cell.custom !== this.m_custom) {
                return false
            }

            if (action === DropAction.MoveAction) {
                const foundIndex = this.m_userPalette.findPaletteCell(cell, parent)
                if (foundIndex) {
                    return this.m_userPalette.setVisible(foundIndex, this.m_visible)
                } else if (!this.userEditable()) {
                    return false
                }
            }
        } else if (mimeData.symbol !== undefined && action === DropAction.CopyAction) {
            cell = PaletteCell.fromElementMimeData(mimeData.symbol)
        }

        if (!cell) {
            return false
        }

        if (this.m_filterCustom) {
            if (!this.m_custom) {
                return false // can only move non-custom cells
            }
            cell.custom = this.m_custom
        }
        cell.visible = this.m_visible

        return this.m_userPalette.dropMimeData({ cell: cell.toMimeData() }, action, row, parent)
    }

    /** a new palette (parent null; named `name`) or an empty cell */
    insertNewItem(parent: PaletteIndex | null, row: number, name: string): boolean {
        if (!this.canEdit(parent)) {
            return false
        }

        const newItemIsPalette = !parent

        if (newItemIsPalette) {
            if (!this.m_userPalette.insertRow(row, parent)) {
                return false
            }
            this.m_userPalette.setName({ palette: row, cell: -1 }, name)
            return true
        }

        return this.m_userPalette.insertRow(row, parent)
    }

    move(sourceParent: PaletteIndex | null, sourceRow: number, destinationParent: PaletteIndex | null, destinationChild: number): boolean {
        if (!this.canEdit(sourceParent) || !this.canEdit(destinationParent)) {
            return false
        }
        const same = (!sourceParent && !destinationParent)
            || (!!sourceParent && !!destinationParent && sourceParent.palette === destinationParent.palette)
        if (same) {
            return this.m_userPalette.moveRow(sourceParent, sourceRow, destinationParent, destinationChild)
        }
        return false
    }

    /**
     * C++ queryRemove: removes the items, asking first (through `ask`) whether custom items are hidden or deleted
     * permanently; all indices have the same parent
     */
    async queryRemove(removeIndices: PaletteIndex[], customCount: number, ask: AskRemove): Promise<void> {
        if (!removeIndices.length || !this.canEdit(this.parentOf(removeIndices[0]))) {
            return
        }

        if (!customCount) {
            this.remove(removeIndices, RemoveAction.AutoAction)
            return
        }

        // these parameters should not depend on exact index as all they should have the same parent in palette tree
        const visible = this.m_userPalette.isVisible(removeIndices[0])
        const isCell = !!this.m_userPalette.findCell(removeIndices[0])

        if (isCell) {
            if (visible) {
                const question = customCount === 1
                    ? 'Do you want to hide this custom palette cell or permanently delete it?'
                    : 'Do you want to hide these custom palette cells or permanently delete them?'
                this.remove(removeIndices, await ask({ question, buttons: 'hideOrDelete' }))
            } else {
                const question = customCount === 1
                    ? 'Do you want to permanently delete this custom palette cell?'
                    : 'Do you want to permanently delete these custom palette cells?'
                const action = await ask({ question, buttons: 'yesNo' })
                if (action === RemoveAction.DeletePermanently) {
                    this.remove(removeIndices, RemoveAction.DeletePermanently)
                }
            }
        } else {
            if (visible) {
                const question = customCount === 1
                    ? 'Do you want to hide this custom palette or permanently delete it?'
                    : 'Do you want to hide these custom palettes or permanently delete them?'
                this.remove(removeIndices, await ask({ question, buttons: 'hideOrDelete' }))
                return
            }
            this.remove(removeIndices, RemoveAction.Hide)
        }
    }

    remove(unsortedRemoveIndices: PaletteIndex[], action: RemoveAction): void {
        if (action === RemoveAction.NoAction) {
            return
        }

        const removeIndices = [...unsortedRemoveIndices].sort((a, b) => this.row(a) - this.row(b))

        // remove in reversed order to leave the previous model indices in the list valid
        const blocked = this.m_userPalette.blockTreeChanged(true)
        for (let i = removeIndices.length - 1; i >= 0; --i) {
            const index = removeIndices[i]

            let indexAction: RemoveAction = action
            const custom = this.m_userPalette.isCustom(index)

            if (!custom || indexAction === RemoveAction.AutoAction) {
                const isCell = !!this.m_userPalette.findCell(index)
                indexAction = custom ? RemoveAction.NoAction : (isCell ? RemoveAction.DeletePermanently : RemoveAction.Hide)
            }

            switch (indexAction) {
            case RemoveAction.NoAction:
                break
            case RemoveAction.Hide:
                this.m_userPalette.setVisible(index, false)
                break
            case RemoveAction.DeletePermanently:
                this.m_userPalette.removeRow(this.row(index), this.parentOf(index))
                break
            default:
                // RemoveAction.AutoAction: impossible, we have just assigned another action for that case
                break
            }
        }
        this.m_userPalette.blockTreeChanged(blocked)
    }

    /** C++ remove(index): one cell or palette */
    removeOne(index: PaletteIndex, ask: AskRemove): Promise<void> {
        if (!this.canEdit(this.parentOf(index))) {
            return Promise.resolve()
        }

        const customItem = this.m_userPalette.isCustom(index)
        return this.queryRemove([index], customItem ? 1 : 0, ask)
    }

    removeSelection(selectedIndexes: PaletteIndex[], parent: PaletteIndex | null, ask: AskRemove): Promise<void> {
        if (!this.canEdit(parent)) {
            return Promise.resolve()
        }

        const removeIndices: PaletteIndex[] = []
        let customItemsCount = 0

        for (const idx of selectedIndexes) {
            const p = this.parentOf(idx)
            if (!parent || (p && p.palette === parent.palette)) {
                removeIndices.push(idx)
                if (this.m_userPalette.isCustom(idx)) {
                    ++customItemsCount
                }
            }
        }

        return this.queryRemove(removeIndices, customItemsCount, ask)
    }

    /** the current properties of a palette (the dialog's initial values), null if it cannot be edited */
    editPaletteProperties(index: PaletteIndex): PaletteConfig | null {
        if (!this.canEdit(index)) {
            return null
        }

        const palette = this.m_userPalette.findPalette(index)
        if (!palette) {
            return null
        }

        return {
            name: palette.translatedName(),
            size: { ...palette.gridSize() },
            scale: palette.mag(),
            elementOffset: palette.yOffset(),
            showGrid: palette.drawGrid(),
        }
    }

    /** the dialog changed a property (C++ the receiver of configuration()->paletteConfig(palette->id()).ch) */
    setPaletteConfig(index: PaletteIndex, config: PaletteConfig): void {
        const palette = this.m_userPalette.findPalette(index)
        if (!palette) {
            return
        }
        palette.setName(config.name)
        palette.setGridSize(config.size.width, config.size.height)
        palette.setMag(config.scale)
        palette.setYOffset(config.elementOffset)
        palette.setDrawGrid(config.showGrid)
        this.m_userPalette.itemDataChanged(index)
    }

    editCellProperties(index: PaletteIndex): PaletteCellConfig | null {
        if (!this.canEdit(index)) {
            return null
        }

        const cell = this.m_userPalette.findCell(index)
        if (!cell) {
            return null
        }

        return {
            name: cell.translatedName(),
            xOffset: cell.xoffset,
            yOffset: cell.yoffset,
            scale: cell.mag,
            drawStaff: cell.drawStaff,
        }
    }

    setCellConfig(index: PaletteIndex, config: PaletteCellConfig): void {
        const cell = this.m_userPalette.findCell(index)
        if (!cell) {
            return
        }
        cell.name = config.name
        cell.mag = config.scale
        cell.drawStaff = config.drawStaff
        cell.xoffset = config.xOffset
        cell.yoffset = config.yOffset
        this.m_userPalette.itemDataChanged(index)
    }

    canEdit(index: PaletteIndex | null): boolean {
        if (!this.userEditable()) {
            return false
        }

        return this.m_userPalette.isEditable(index)
    }

    private row(index: PaletteIndex): number {
        return index.cell >= 0 ? index.cell : index.palette
    }

    private parentOf(index: PaletteIndex): PaletteIndex | null {
        return index.cell >= 0 ? { palette: index.palette, cell: -1 } : null
    }
}

// ========================================================
// PaletteProvider
// ========================================================

export class PaletteProvider {
    private m_userPaletteModel: PaletteTreeModel
    private m_masterPaletteModel: PaletteTreeModel
    private m_defaultPaletteModel: PaletteTreeModel | null = null
    private m_mainPaletteController: UserPaletteController | null = null
    private m_customElementsPaletteController: UserPaletteController | null = null

    constructor() {
        this.m_userPaletteModel = new PaletteTreeModel(new PaletteTree())
        this.m_masterPaletteModel = new PaletteTreeModel(PaletteCreator.newMasterPaletteTree())
    }

    userPaletteModel(): PaletteTreeModel { return this.m_userPaletteModel }
    masterPaletteModel(): PaletteTreeModel { return this.m_masterPaletteModel }
    defaultPaletteModel(): PaletteTreeModel | null { return this.m_defaultPaletteModel }

    userPaletteTree(): PaletteTree { return this.m_userPaletteModel.paletteTree() }

    /** C++ userPaletteTreeChanged */
    onUserPaletteTreeChanged(listener: () => void): () => void {
        return this.m_userPaletteModel.onTreeChanged(listener)
    }

    mainPaletteController(): UserPaletteController {
        this.m_mainPaletteController ??= new UserPaletteController(this.m_userPaletteModel)
        return this.m_mainPaletteController
    }

    customElementsPaletteController(): UserPaletteController {
        if (!this.m_customElementsPaletteController) {
            this.m_customElementsPaletteController = new UserPaletteController(this.m_userPaletteModel)
            this.m_customElementsPaletteController.setCustom(true)
        }
        return this.m_customElementsPaletteController
    }

    /** the controller of the "More" pool (C++ poolPaletteController): adds hidden cells, cannot edit */
    poolPaletteController(): UserPaletteController {
        const c = new UserPaletteController(this.m_userPaletteModel)
        c.setVisible(false)
        c.setCustom(false)
        c.setUserEditable(false)
        return c
    }

    /** C++ customElementsPaletteModel for one palette: its hidden custom cells */
    customElementsPaletteCells(index: PaletteIndex): PaletteCell[] {
        const filters: PaletteCellFilter[] = [visibilityCellFilter(false), customizedCellFilter(true)]
        const palette = this.m_userPaletteModel.findPalette(index)
        return palette ? palette.cells().filter(c => filters.every(f => f(c))) : []
    }

    /**
     * C++ poolPaletteIndex + poolPaletteModel: the palette of the master palette of the same type (or of the content
     * type of a custom palette) with the cells the user palette does not contain
     */
    poolPalette(index: PaletteIndex): { palette: Palette; cells: PaletteCell[] } | null {
        const userPalette = this.m_userPaletteModel.findPalette(index)
        const filter = this.m_userPaletteModel.getFilter(index)
        if (!userPalette || !filter) {
            return null
        }
        const poolIndex = this.m_masterPaletteModel.findPaletteByType(userPalette.type())
            ?? this.m_masterPaletteModel.findPaletteByType(userPalette.contentType())
        const pool = this.m_masterPaletteModel.findPalette(poolIndex)
        if (!pool) {
            return null
        }
        return { palette: pool, cells: pool.cells().filter(filter) }
    }

    /** the hidden palettes: those of the master palette not in the user palette, and the hidden user palettes */
    availableExtraPalettesModel(): ExtraPalette[] {
        const res: ExtraPalette[] = []
        const master = this.m_masterPaletteModel.palettes()
        for (let row = 0; row < master.length; ++row) {
            // add everything that cannot be found in user palette
            if (!this.m_userPaletteModel.findPaletteByType(master[row].type())) {
                res.push({ name: master[row].translatedName(), custom: false, model: 'master', index: { palette: row, cell: -1 } })
            }
        }

        const user = this.m_userPaletteModel.palettes()
        for (let row = 0; row < user.length; ++row) {
            // add invisible custom palettes
            if (!user[row].isVisible()) {
                res.push({ name: user[row].translatedName(), custom: user[row].isCustom(), model: 'user', index: { palette: row, cell: -1 } })
            }
        }

        return res
    }

    addPalette(entry: ExtraPalette): boolean {
        if (entry.model === 'user') {
            const ok = this.m_userPaletteModel.setVisible(entry.index, true)
            if (!ok) {
                return false
            }
            this.m_userPaletteModel.moveRow(null, entry.index.palette, null, 0)
            return true
        }

        const data = this.m_masterPaletteModel.mimeData(entry.index)
        const dropIndex = { palette: 0, cell: -1 }

        const success = this.m_userPaletteModel.dropMimeData(data, DropAction.CopyAction, dropIndex.palette, null)
        if (success) {
            this.m_userPaletteModel.setVisible(dropIndex, true)
        }
        return success
    }

    /** C++ resetPalette: asks first (the source string, context "palette"); then doResetPalette */
    static readonly RESET_PALETTE_QUESTION = 'Do you want to restore this palette to its default state? All changes to this palette will be lost.'

    doResetPalette(index: PaletteIndex): void {
        let resetModel: PaletteTreeModel | null = null
        let resetIndex: PaletteIndex | null = null
        const userPalette = this.m_userPaletteModel.findPalette(index)
        if (!userPalette) {
            return
        }

        if (this.m_defaultPaletteModel) {
            resetModel = this.m_defaultPaletteModel
            resetIndex = this.m_defaultPaletteModel.findPaletteByType(userPalette.type())
        }

        if (!resetIndex) {
            resetModel = this.m_masterPaletteModel
            resetIndex = this.m_masterPaletteModel.findPaletteByType(userPalette.type())
        }

        const row = index.palette

        // restore visibility and expanded state of the palette after restoring its state
        const wasVisible = userPalette.isVisible()
        const wasExpanded = userPalette.isExpanded()

        const blocked = this.m_userPaletteModel.blockTreeChanged(true)
        if (!this.m_userPaletteModel.removeRow(row, null)) {
            this.m_userPaletteModel.blockTreeChanged(blocked)
            return
        }

        if (resetIndex && resetModel) {
            const data = resetModel.mimeData(resetIndex)
            this.m_userPaletteModel.dropMimeData(data, DropAction.CopyAction, row, null)
        } else {
            this.m_userPaletteModel.insertRow(row, null)
        }

        const newIndex = { palette: row, cell: -1 }
        this.m_userPaletteModel.setVisible(newIndex, wasVisible)
        this.m_userPaletteModel.setExpanded(newIndex, wasExpanded, false)
        this.m_userPaletteModel.blockTreeChanged(blocked)
    }

    /** C++ loadPalette (after the file dialog): the palette of an .mpal file inserted as custom palette at index */
    insertLoadedPalette(pp: Palette, index: PaletteIndex | null): boolean {
        pp.setType(PaletteType.Custom) // mark the loaded palette custom
        const row = index ? index.palette : 0
        return this.m_userPaletteModel.insertPalette(pp, row, null)
    }

    setUserPaletteTree(tree: PaletteTree): void {
        this.m_userPaletteModel.setPaletteTree(tree)
    }

    setDefaultPaletteTree(tree: PaletteTree): void {
        if (this.m_defaultPaletteModel) {
            this.m_defaultPaletteModel.setPaletteTree(tree)
        } else {
            this.m_defaultPaletteModel = new PaletteTreeModel(tree)
        }
    }

    write(xml: XmlWriter, pasteMode: boolean): void {
        this.m_userPaletteModel.paletteTree().write(xml, pasteMode)
    }

    read(e: XmlReader, pasteMode: boolean): boolean {
        const tree = new PaletteTree()
        if (!tree.read(e, pasteMode)) {
            return false
        }

        this.setUserPaletteTree(tree)

        return true
    }
}
