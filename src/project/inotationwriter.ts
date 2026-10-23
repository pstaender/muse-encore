/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/inotationwriter.h (INotationWriter): a writer of an export format. A notation is its score
 * (the master score or a part score) with the names the writers use (ExportNotation). The writers return the file's
 * data instead of writing to a device; they are asynchronous (the PNG writer waits for the images of the score).
 */

import type { Score } from '../engraving/dom/score'

export enum UnitType {
    PER_PAGE,
    PER_PART,
    MULTI_PART,
}

export interface NotationWriterOptions {
    unitType?: UnitType
    /** PAGE_NUMBER: 0-based */
    pageNumber?: number
    transparentBackground?: boolean
}

/** the notation of a score to export (C++ INotation: name(), projectWorkTitle(), projectWorkTitleAndPartName()) */
export interface ExportNotation {
    score: Score
    /** the part's name; for the main score the project's name */
    name(): string
    isMain(): boolean
    /** the score's "workTitle" meta tag, else the project's name */
    projectWorkTitle(): string
    /** projectWorkTitle() plus " - " and the part's name for a part */
    projectWorkTitleAndPartName(): string
}

export interface INotationWriter {
    supportedUnitTypes(): UnitType[]
    supportsUnitType(unitType: UnitType): boolean
    write(notation: ExportNotation, options?: NotationWriterOptions): Promise<Uint8Array>
    writeList(notations: readonly ExportNotation[], options?: NotationWriterOptions): Promise<Uint8Array>
}

/** the base of the writers (AbstractImageWriter's unit type handling) */
export abstract class AbstractNotationWriter implements INotationWriter {
    abstract supportedUnitTypes(): UnitType[]

    supportsUnitType(unitType: UnitType): boolean {
        return this.supportedUnitTypes().includes(unitType)
    }

    abstract write(notation: ExportNotation, options?: NotationWriterOptions): Promise<Uint8Array>

    writeList(_notations: readonly ExportNotation[], _options?: NotationWriterOptions): Promise<Uint8Array> {
        return Promise.reject(new Error('not supported'))
    }

    unitTypeFromOptions(options: NotationWriterOptions = {}): UnitType {
        const supported = this.supportedUnitTypes()
        const unitType = options.unitType ?? supported[0]
        return this.supportsUnitType(unitType) ? unitType : supported[0]
    }
}
