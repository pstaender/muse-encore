/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/exportprojectscenario.cpp: exports the selected scores (the main score, parts and
 * potential parts) with the writer of a format, per page, per part or all in one file, with MuseScore's file names.
 * Deviation: there is no file dialog and no file system; the files are returned (the app downloads them). The name
 * the save dialog suggests (askExportPath) is the name of a single file and the base of the names of several files.
 */

import { mtrc } from '../../framework/global/translation'
import { escapeFileName } from '../../engraving/dom/excerpt'
import type { Score } from '../../engraving/dom/score'
import type { MasterNotation } from '../../notation/internal/masternotation'
import type { ExcerptNotation } from '../../notation/internal/excerptnotation'
import { UnitType, type ExportNotation } from '../inotationwriter'
import type { ExportType } from './exporttype'
import { NotationWritersRegister } from './notationwritersregister'

/** a score of the Export dialog: the main score or a part (also a potential part, made when it is exported) */
export type ExportItem = { kind: 'main' } | { kind: 'excerpt'; excerpt: ExcerptNotation }

export interface ExportedFile {
    fileName: string
    data: Uint8Array
}

/** what the scenario needs from the library (index.ts) */
export interface ExportScenarioServices {
    /** lays out a score that was never laid out (C++ doLayout of closed scores) */
    ensureLaidOut(score: Score): void
    /** sets the page view of the scores (C++ setViewModes(PAGE)); returns the function that restores their view modes */
    setPageView(scores: readonly Score[]): () => void
}

export interface ExportProgress {
    (current: number, total: number): void
}

export class ExportProjectScenario {
    /**
     * @param m_projectName the project's file name without suffix (C++ MasterScore::name(): the main score's name and
     *        the base of the file names)
     */
    constructor(private m_writers: NotationWritersRegister, private m_masterNotation: MasterNotation,
                private m_projectName: string, private m_services: ExportScenarioServices) {}

    supportedUnitTypes(exportType: ExportType): UnitType[] {
        const suffix = exportType.suffixes[0]
        const writer = suffix ? this.m_writers.writer(suffix) : null
        return writer ? writer.supportedUnitTypes() : []
    }

    private isPotential(item: ExportItem): boolean {
        return item.kind === 'excerpt' && this.m_masterNotation.potentialExcerpts().includes(item.excerpt)
    }

    /** the name of the item's notation (C++ INotation::name(): the part's name, the project's for the main score) */
    private itemName(item: ExportItem): string {
        return item.kind === 'main' ? this.m_projectName : item.excerpt.name()
    }

    /**
     * the file name the save dialog suggests (askExportPath, configuration()->defaultSavingFilePath): the project's
     * name with "-Score_and_Parts", "-Parts", "-<part>" and "-1" as in MuseScore
     */
    defaultFileName(items: readonly ExportItem[], exportType: ExportType, unitType: UnitType): string {
        let filenameAddition = ''
        const isCreatingOnlyOneFile = this.guessIsCreatingOnlyOneFile(items, unitType)
        const isExportingOnlyOneScore = items.length === 1
        if (unitType === UnitType.MULTI_PART && !isExportingOnlyOneScore) {
            const containsMaster = items.some(i => i.kind === 'main')
            //: Used in export filename suggestion. Please use only characters that are valid for filenames.
            filenameAddition = '-' + (containsMaster ? mtrc('project/export', 'Score_and_Parts') : mtrc('project/export', 'Parts'))
        } else if (isExportingOnlyOneScore) {
            if (items[0].kind !== 'main') {
                filenameAddition = '-' + escapeFileName(this.itemName(items[0]))
            }
            if (unitType === UnitType.PER_PAGE && isCreatingOnlyOneFile) {
                // So there is only one page
                filenameAddition += '-1'
            }
        }
        return `${this.m_projectName}${filenameAddition}.${exportType.suffixes[0]}`
    }

    guessIsCreatingOnlyOneFile(items: readonly ExportItem[], unitType: UnitType): boolean {
        switch (unitType) {
        case UnitType.PER_PAGE: {
            if (items.length === 1 && !this.isPotential(items[0])) {
                const score = this.score(items[0])
                if (!score) {
                    return false
                }
                const restore = this.m_services.setPageView([score])
                const onePage = score.pages().length === 1
                restore()
                return onePage
            }
            return false
        }
        case UnitType.PER_PART:
            return items.length === 1
        case UnitType.MULTI_PART:
            return true
        }
        return false
    }

    private score(item: ExportItem): Score | null {
        return item.kind === 'main' ? this.m_masterNotation.masterScore() : item.excerpt.score()
    }

    /**
     * writes the files; `fileName` is the name of a single file or the base of the names (default: defaultFileName).
     * onProgress: after each file.
     */
    async exportScores(items: readonly ExportItem[], exportType: ExportType, unitType: UnitType, fileName?: string,
                       onProgress?: ExportProgress): Promise<ExportedFile[]> {
        const suffix = exportType.suffixes[0]
        const writer = this.m_writers.writer(suffix)
        if (!writer || !writer.supportsUnitType(unitType) || !items.length) {
            return []
        }
        const destination = fileName ?? this.defaultFileName(items, exportType, unitType)

        // Make sure we do this in the same as we did it in `askExportPath`, so before initializing notations
        const isCreatingOnlyOneFile = this.guessIsCreatingOnlyOneFile(items, unitType)
        const isExportingOnlyOneScore = items.length === 1

        // The user might have selected not-yet-inited excerpts
        const potentialExcerpts = this.m_masterNotation.potentialExcerpts()
        const excerptsToInit = items.flatMap(i => i.kind === 'excerpt' && potentialExcerpts.includes(i.excerpt) ? [i.excerpt] : [])
        this.m_masterNotation.initExcerpts(excerptsToInit)

        const notations = items.map(item => this.exportNotation(item))
        // Scores that are closed may have never been laid out, so we lay them out now
        for (const n of notations) {
            this.m_services.ensureLaidOut(n.score)
        }

        const restoreViewModes = this.m_services.setPageView(notations.map(n => n.score))
        const files: ExportedFile[] = []
        try {
            const total = this.exportFileCount(notations, unitType)
            switch (unitType) {
            case UnitType.PER_PAGE:
                for (const notation of notations) {
                    const pageCount = notation.score.pages().length
                    for (let page = 0; page < pageCount; ++page) {
                        const name = isCreatingOnlyOneFile ? destination
                            : completeExportPath(destination, notation, notation.isMain(), isExportingOnlyOneScore, page)
                        files.push({ fileName: name, data: await writer.write(notation, NotationWritersRegister.options(unitType, page)) })
                        onProgress?.(files.length, total)
                    }
                }
                break
            case UnitType.PER_PART:
                for (const notation of notations) {
                    const name = isCreatingOnlyOneFile ? destination
                        : completeExportPath(destination, notation, notation.isMain(), isExportingOnlyOneScore)
                    files.push({ fileName: name, data: await writer.write(notation, NotationWritersRegister.options(unitType)) })
                    onProgress?.(files.length, total)
                }
                break
            case UnitType.MULTI_PART:
                files.push({ fileName: destination, data: await writer.writeList(notations, NotationWritersRegister.options(unitType)) })
                onProgress?.(1, 1)
                break
            }
        } finally {
            restoreViewModes()
        }
        return files
    }

    exportFileCount(notations: readonly ExportNotation[], unitType: UnitType): number {
        switch (unitType) {
        case UnitType.PER_PAGE:
            return notations.reduce((n, notation) => n + notation.score.pages().length, 0)
        case UnitType.PER_PART:
            return notations.length
        case UnitType.MULTI_PART:
            return 1
        }
        return 0
    }

    /** the ExportNotation of an item (its score must exist: inited excerpts) */
    exportNotation(item: ExportItem): ExportNotation {
        const score = this.score(item)
        if (!score) {
            throw new Error(`the part ${this.itemName(item)} has no score`)
        }
        const name = this.itemName(item)
        const projectName = this.m_projectName
        const isMain = item.kind === 'main'
        // Notation::projectWorkTitle: the "workTitle" meta tag, else the project's name
        const projectWorkTitle = (): string => score.masterScore().metaTag('workTitle') || projectName
        return {
            score,
            name: () => name,
            isMain: () => isMain,
            projectWorkTitle,
            projectWorkTitleAndPartName: () => projectWorkTitle() + (score.isMaster() ? '' : ' - ' + name),
        }
    }
}

/** ExportProjectScenario::completeExportPath: base name + "-<part>" (several scores) + "-<page>" + suffix */
export function completeExportPath(basePath: string, notation: ExportNotation, isMain: boolean, isExportingOnlyOneScore: boolean,
                                   pageIndex = -1): string {
    const dot = basePath.lastIndexOf('.')
    const base = dot > 0 ? basePath.slice(0, dot) : basePath
    const suffix = dot > 0 ? basePath.slice(dot + 1) : ''
    let result = base
    if (!isMain && !isExportingOnlyOneScore) {
        result += '-' + escapeFileName(notation.name())
    }
    if (pageIndex > -1) {
        result += '-' + String(pageIndex + 1)
    }
    return `${result}.${suffix}`
}
