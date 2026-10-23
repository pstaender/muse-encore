/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/exporttype.cpp (ExportType, ExportTypeList): an export format of the Export dialog,
 * with its file suffixes or its subtypes (e.g. MusicXML: compressed / uncompressed) and its settings page.
 */

export interface ExportType {
    /** the first suffix (or the id of the first subtype) */
    id: string
    suffixes: string[]
    name: string
    filterName: string
    /** the settings shown for the format (C++ the QML page, e.g. "PdfSettingsPage.qml") */
    settingsPage: string
    subtypes: ExportType[]
}

export function makeWithSuffixes(suffixes: string[], name: string, filterName: string, settingsPage = ''): ExportType {
    return { id: suffixes[0] ?? '', suffixes, name, filterName, settingsPage, subtypes: [] }
}

export function makeWithSubtypes(subtypes: ExportType[], name: string): ExportType {
    return { id: subtypes[0]?.id ?? '', suffixes: [], name, filterName: '', settingsPage: '', subtypes }
}

export function hasSubtypes(type: ExportType): boolean {
    return type.subtypes.length > 0
}

/** the file dialog filter, e.g. "PDF files (*.pdf)" */
export function exportTypeFilter(type: ExportType): string {
    return `${type.filterName} (${type.suffixes.map(s => `*.${s}`).join(' ')})`
}
