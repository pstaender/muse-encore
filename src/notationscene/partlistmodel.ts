/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/partlistmodel.cpp (the model of the Parts dialog, action
 * "parts") with the selection of muse::uicomponents::ItemMultiSelectionModel, and of notationswitchlistmodel.cpp (the
 * notation tabs: the score and the open parts). The questions (reset/delete a part) are asked by the app: the model
 * says whether one is needed (resetPartNeedsQuestion, removePartNeedsQuestion) and the app calls doResetPart /
 * doRemovePart after "Yes".
 */

import { formatUniqueExcerptName } from '../engraving/dom/utils'
import { mtrc } from '../framework/global/translation'
import type { Score } from '../engraving/dom/score'
import type { MasterNotation } from '../notation/internal/masternotation'
import type { ExcerptNotation } from '../notation/internal/excerptnotation'

/** the current notation of the project (C++ IGlobalContext: currentNotation / setCurrentNotation) */
export interface NotationContext {
    masterNotation(): MasterNotation
    /** the score of the current notation: the master score or a part (excerpt) score */
    currentNotation(): Score
    setCurrentNotation(score: Score): void
}

/** the keyboard modifiers of a click (QApplication::keyboardModifiers()) */
export interface SelectionModifiers {
    shift?: boolean
    ctrl?: boolean
}

function collectExcerptLowerNames(allExcerpts: readonly ExcerptNotation[]): string[] {
    return allExcerpts.map(excerpt => excerpt.name().toLowerCase())
}

export interface PartListItem {
    title: string
    isSelected: boolean
    isInited: boolean
    isCustom: boolean
}

export class PartListModel {
    private m_excerpts: ExcerptNotation[] = []
    /** the selected rows in the order of their selection (QItemSelectionModel::selectedIndexes) */
    private m_selection: number[] = []

    constructor(private m_context: NotationContext) {}

    load(): void {
        const masterNotation = this.masterNotation()

        const excerpts = [...masterNotation.excerpts()]
        const potentialExcerpts = masterNotation.potentialExcerpts()
        excerpts.push(...potentialExcerpts)

        masterNotation.sortExcerpts(excerpts)

        this.m_excerpts = excerpts
        this.m_selection = []
    }

    rowCount(): number { return this.m_excerpts.length }

    items(): PartListItem[] {
        return this.m_excerpts.map((excerpt, i) => ({
            title: excerpt.name(),
            isSelected: this.m_selection.includes(i),
            isInited: excerpt.isInited(),
            isCustom: excerpt.isCustom(),
        }))
    }

    excerpt(index: number): ExcerptNotation | null {
        return this.m_excerpts[index] ?? null
    }

    hasSelection(): boolean {
        return this.m_selection.length > 0
    }

    /** returns the index of the new part (C++ partAdded: its title is edited then) */
    createNewPart(): number {
        const name = formatUniqueExcerptName(mtrc('notation', 'Part'), collectExcerptLowerNames(this.m_excerpts))
        const newExcerpt = this.masterNotation().createEmptyExcerpt(name)

        const index = this.m_excerpts.length
        this.insertNewExcerpt(index, newExcerpt)
        return index
    }

    /** ItemMultiSelectionModel::select (Shift: a range from the last selected row, Ctrl: toggle) */
    selectPart(partIndex: number, modifiers: SelectionModifiers = {}): void {
        if (!this.isExcerptIndexValid(partIndex)) {
            return
        }

        //! NOTE: always treat simultaneously pressed Ctrl and Shift as Ctrl
        const ctrl = !!modifiers.ctrl
        const shift = !!modifiers.shift && !ctrl
        const modifiersAllowed = ctrl || shift
        let startIndex = partIndex

        if (modifiersAllowed) {
            if (shift && this.hasSelection()) {
                startIndex = this.m_selection[this.m_selection.length - 1]
            } else if (ctrl && this.m_selection.includes(partIndex)) {
                this.m_selection = this.m_selection.filter(i => i !== partIndex)
                return
            }
        }

        if (!modifiersAllowed) {
            this.m_selection = [partIndex]
            return
        }

        const selection = [...this.m_selection]
        for (let i = Math.min(startIndex, partIndex); i <= Math.max(startIndex, partIndex); ++i) {
            if (!selection.includes(i)) {
                selection.push(i)
            }
        }
        this.m_selection = selection
    }

    /** resetPart: the question "Are you sure you want to reset this part?" is asked for a part that is not empty */
    resetPartNeedsQuestion(partIndex: number): boolean {
        return this.isExcerptIndexValid(partIndex) && !this.m_excerpts[partIndex].isEmpty()
    }

    doResetPart(partIndex: number): void {
        if (!this.isExcerptIndexValid(partIndex)) {
            return
        }

        this.masterNotation().resetExcerpt(this.m_excerpts[partIndex])
    }

    /** removePart: the question "Are you sure you want to delete this part?" is asked for a part that is not empty */
    removePartNeedsQuestion(partIndex: number): boolean {
        return this.isExcerptIndexValid(partIndex) && !this.m_excerpts[partIndex].isEmpty()
    }

    doRemovePart(partIndex: number): void {
        if (!this.isExcerptIndexValid(partIndex)) {
            return
        }

        const removed = this.m_excerpts[partIndex]
        const isCurrentNotation = !!removed.score() && this.m_context.currentNotation() === removed.score()

        const excerpts = [...this.masterNotation().excerpts()]
        const i = excerpts.indexOf(removed)
        if (i >= 0) {
            excerpts.splice(i, 1)
            this.masterNotation().setExcerpts(excerpts)
        }

        this.m_excerpts.splice(partIndex, 1)
        this.m_selection = this.m_selection.filter(r => r !== partIndex).map(r => (r > partIndex ? r - 1 : r))

        if (isCurrentNotation) {
            this.m_context.setCurrentNotation(this.masterNotation().masterScore())
        }
    }

    /** the warning of an invalid title ('' if valid; C++ validatePartTitle) */
    validatePartTitle(partIndex: number, title: string): string {
        return this.doValidatePartTitle(partIndex, title) ?? ''
    }

    /** null: valid; '' for an empty title, else the error text */
    private doValidatePartTitle(partIndex: number, title: string): string | null {
        if (!title) {
            return ''
        }

        const titleLower = title.toLowerCase()

        for (let i = 0; i < this.m_excerpts.length; ++i) {
            if (i === partIndex) {
                continue
            }

            if (this.m_excerpts[i].name().toLowerCase() === titleLower) {
                return mtrc('notation', 'Name already exists')
            }
        }

        return null
    }

    setPartTitle(partIndex: number, title: string): void {
        if (!this.isExcerptIndexValid(partIndex)) {
            return
        }

        const excerpt = this.m_excerpts[partIndex]
        if (excerpt.name() === title) {
            return
        }

        if (this.doValidatePartTitle(partIndex, title) !== null) {
            return
        }

        excerpt.undoSetName(title)
    }

    /** returns the index of the copy (C++ partAdded) */
    copyPart(partIndex: number): number {
        if (!this.isExcerptIndexValid(partIndex)) {
            return -1
        }

        const copy = this.m_excerpts[partIndex].clone()
        const baseName = `${copy.name()} ${mtrc('notation', '(copy)')}`
        copy.setName(formatUniqueExcerptName(baseName, collectExcerptLowerNames(this.m_excerpts)))
        this.insertNewExcerpt(partIndex + 1, copy)
        return partIndex + 1
    }

    private insertNewExcerpt(destinationIndex: number, excerpt: ExcerptNotation): void {
        this.m_excerpts.splice(destinationIndex, 0, excerpt)
        this.m_selection = this.m_selection.map(r => (r >= destinationIndex ? r + 1 : r))

        const excerpts = [...this.masterNotation().excerpts()]
        excerpts.push(excerpt)
        this.masterNotation().setExcerpts(excerpts)

        this.selectPart(destinationIndex)
    }

    openSelectedParts(): void {
        const rows = [...this.m_selection].sort((a, b) => a - b)

        this.openExcerpts(rows)
    }

    openAllParts(): void {
        const rows: number[] = []

        for (let i = 0; i < this.m_excerpts.length; ++i) {
            rows.push(i)
        }

        this.openExcerpts(rows)
    }

    private openExcerpts(rows: readonly number[]): void {
        if (!rows.length) {
            return
        }

        const newExcerpts = [...this.masterNotation().excerpts()]

        for (const index of rows) {
            const excerpt = this.m_excerpts[index]
            if (excerpt.isOpen()) {
                continue
            }

            const idx = newExcerpts.indexOf(excerpt)
            if (idx === -1) {
                newExcerpts.push(excerpt)
            } else {
                // Move to the end of the list if already exists
                newExcerpts.splice(idx, 1)
                newExcerpts.push(excerpt)
            }
        }

        this.masterNotation().setExcerpts(newExcerpts)

        for (const index of rows) {
            this.masterNotation().setExcerptIsOpen(this.m_excerpts[index], true)
        }

        this.m_context.setCurrentNotation(this.m_excerpts[rows[rows.length - 1]].score()!)
    }

    private isExcerptIndexValid(index: number): boolean {
        return index >= 0 && index < this.m_excerpts.length
    }

    private masterNotation(): MasterNotation {
        return this.m_context.masterNotation()
    }
}

export interface NotationSwitchItem {
    score: Score
    /** the part's name; null for the score (the app shows the project's name) */
    title: string | null
    isMaster: boolean
}

export interface NotationSwitchMenuItem {
    id: 'close-tab' | 'close-other-tabs' | 'close-all-tabs'
    title: string
}

/** NotationSwitchListModel: the tabs of the score and its open parts */
export class NotationSwitchListModel {
    private m_notations: NotationSwitchItem[] = []

    constructor(private m_context: NotationContext) {}

    /** loadNotations (the app calls it again when the excerpts or their open states change) */
    load(): void {
        const masterNotation = this.m_context.masterNotation()
        this.m_notations = [{ score: masterNotation.masterScore(), title: null, isMaster: true }]

        for (const excerpt of masterNotation.excerpts()) {
            if (excerpt.isOpen()) {
                this.m_notations.push({ score: excerpt.score()!, title: excerpt.name(), isMaster: false })
            }
        }

        if (!this.m_notations.some(n => n.score === this.m_context.currentNotation())) {
            const MASTER_NOTATION_INDEX = 0
            this.setCurrentNotation(MASTER_NOTATION_INDEX)
        }
    }

    notations(): readonly NotationSwitchItem[] { return this.m_notations }

    currentNotationIndex(): number {
        return this.m_notations.findIndex(n => n.score === this.m_context.currentNotation())
    }

    setCurrentNotation(index: number): void {
        if (!this.isIndexValid(index)) {
            return
        }

        this.m_context.setCurrentNotation(this.m_notations[index].score)
    }

    /** closes a part's tab; false for the score's tab (C++ dispatches "file-close": the app closes the score) */
    closeNotation(index: number): boolean {
        if (!this.isIndexValid(index)) {
            return true
        }

        const notation = this.m_notations[index]
        if (notation.isMaster) {
            return false
        }

        if (notation.score === this.m_context.currentNotation()) {
            // Set new current notation
            this.m_context.setCurrentNotation(this.m_notations[Math.max(0, index - 1)].score)
        }
        this.setExcerptIsOpen(notation.score, false)
        this.load()
        return true
    }

    closeOtherNotations(index: number): void {
        if (!this.isIndexValid(index)) {
            return
        }

        const notationToKeepOpen = this.m_notations[index]
        this.m_context.setCurrentNotation(notationToKeepOpen.score)

        // Copy the list to avoid modifying it while iterating
        for (const notation of [...this.m_notations]) {
            if (!notation.isMaster && notation !== notationToKeepOpen) {
                this.setExcerptIsOpen(notation.score, false)
            }
        }
        this.load()
    }

    contextMenuItems(index: number): NotationSwitchMenuItem[] {
        if (!this.isIndexValid(index)) {
            return []
        }

        const result: NotationSwitchMenuItem[] = [{ id: 'close-tab', title: mtrc('notation', 'Close tab') }]

        const rowCount = this.m_notations.length
        const canCloseOtherTabs = rowCount > 2 || (rowCount === 2 && this.m_notations[index].isMaster)
        if (canCloseOtherTabs) {
            result.push({ id: 'close-other-tabs', title: mtrc('notation', 'Close other tabs') })
        }

        const canCloseAllTabs = rowCount > 1
        if (canCloseAllTabs) {
            result.push({ id: 'close-all-tabs', title: mtrc('notation', 'Close all tabs') })
        }

        return result
    }

    private setExcerptIsOpen(score: Score, open: boolean): void {
        const masterNotation = this.m_context.masterNotation()
        const excerpt = masterNotation.excerptNotationOf(score)
        if (excerpt) {
            masterNotation.setExcerptIsOpen(excerpt, open)
        }
    }

    private isIndexValid(index: number): boolean {
        return index >= 0 && index < this.m_notations.length
    }
}
