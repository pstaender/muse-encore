/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notation/internal/searchcommandsparser.h/.cpp: the commands of "Find / Go to" (a measure number, a
 * measure range "3-7", a page "p2", a rehearsal mark "rA" or its name)
 */

export enum SearchDataType {
    Invalid,
    RehearsalMark,
    Measure,
    MeasureRange,
    Page,
}

export type SearchData =
    | { type: SearchDataType.Invalid }
    | { type: SearchDataType.RehearsalMark; rehearsalMark: string }
    | { type: SearchDataType.Measure; measureIndex: number }
    | { type: SearchDataType.MeasureRange; measureRange: [number, number] }
    | { type: SearchDataType.Page; pageIndex: number }

const REHEARSAL_MARK_CODE = 'r'
const PAGE_CODE = 'p'

const INVALID: SearchData = { type: SearchDataType.Invalid }

/** QString::toUInt (base 10; surrounding whitespace is allowed); null if the conversion fails */
function toUInt(s: string): number | null {
    if (!/^\s*\+?\d+\s*$/.test(s)) {
        return null
    }
    const v = Number(s.trim())
    return v <= 0xFFFFFFFF ? v : null
}

export class SearchCommandsParser {
    static parse(searchCommand: string): SearchData {
        if (!searchCommand) {
            return INVALID
        }

        let data = SearchCommandsParser.parseMeasureCommand(searchCommand)
        if (data.type !== SearchDataType.Invalid) {
            return data
        }

        data = SearchCommandsParser.parsePageCommand(searchCommand)
        if (data.type !== SearchDataType.Invalid) {
            return data
        }

        return SearchCommandsParser.parseRehearsalMarkCommand(searchCommand)
    }

    private static parseMeasureCommand(searchCommand: string): SearchData {
        const parts = searchCommand.split('-').filter(p => p.length > 0) // Qt::SkipEmptyParts

        if (parts.length === 2) {
            const startMeasure = toUInt(parts[0])
            const endMeasure = toUInt(parts[1])

            if (startMeasure !== null && endMeasure !== null && startMeasure <= endMeasure) {
                return { type: SearchDataType.MeasureRange, measureRange: [startMeasure, endMeasure] }
            }
            return INVALID
        } else {
            const measureIndex = toUInt(searchCommand)

            if (measureIndex !== null) {
                return { type: SearchDataType.Measure, measureIndex }
            }
        }

        return INVALID
    }

    private static parsePageCommand(searchCommand: string): SearchData {
        const qsearchCommand = searchCommand.toLowerCase()

        if (!qsearchCommand.startsWith(PAGE_CODE) || qsearchCommand.length <= PAGE_CODE.length) {
            return INVALID
        }

        if (!/\p{N}/u.test(qsearchCommand[PAGE_CODE.length])) {
            return INVALID
        }

        const pageIndex = toUInt(qsearchCommand.substring(PAGE_CODE.length))

        if (pageIndex !== null) {
            return { type: SearchDataType.Page, pageIndex }
        }

        return INVALID
    }

    private static parseRehearsalMarkCommand(searchCommand: string): SearchData {
        const qsearchCommand = searchCommand.toLowerCase()

        if (qsearchCommand.startsWith(REHEARSAL_MARK_CODE) && qsearchCommand.length > REHEARSAL_MARK_CODE.length) {
            return { type: SearchDataType.RehearsalMark, rehearsalMark: qsearchCommand.substring(REHEARSAL_MARK_CODE.length) }
        }

        return { type: SearchDataType.RehearsalMark, rehearsalMark: qsearchCommand }
    }
}
