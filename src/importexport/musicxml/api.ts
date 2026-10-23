/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The public API of the MusicXML export (MuseScore's MusicXmlWriter/MxlWriter: saveXml/saveMxl of
 * importexport/musicxml/internal/export/exportmusicxml.cpp). The score must be laid out (layoutScore), like in
 * MuseScore the export uses the layout (positions, systems and pages).
 */

import type { Score } from '../../engraving/dom/score'
import { saveMxl, saveXml } from './internal/export/exportmusicxml'
import { MusicXmlConfiguration, MusicXmlExportBreaksType } from './internal/musicxmlconfiguration'

export { MusicXmlExportBreaksType }

/** MuseScore's MusicXML export settings (IMusicXmlConfiguration, the "MusicXML" page of the export dialog) */
export interface MusicXmlExportOptions {
    /** export/musicXml/exportLayout: export the layout (positions, page and system layout); default true */
    exportLayout: boolean
    /** export/musicXml/exportBreaks (MusicXmlExportBreaksType All/Manual/No): which system and page breaks; default 'all' */
    exportBreaks: 'all' | 'manual' | 'no'
    /** export/musicXml/exportInvisibleElements; default false */
    exportInvisibleElements: boolean
    /** export/musicXml/exportMu3Compat: "Limit MusicXML export for compatibility with MuseScore 3"; default false */
    exportMu3Compat: boolean
}

/** MusicXmlConfiguration::init(): MuseScore's defaults */
export const defaultMusicXmlExportOptions: Readonly<MusicXmlExportOptions> = {
    exportLayout: true,
    exportBreaks: 'all',
    exportInvisibleElements: false,
    exportMu3Compat: false,
}

function breaksType(b: MusicXmlExportOptions['exportBreaks']): MusicXmlExportBreaksType {
    switch (b) {
    case 'manual': return MusicXmlExportBreaksType.Manual
    case 'no': return MusicXmlExportBreaksType.No
    default: return MusicXmlExportBreaksType.All
    }
}

function configuration(options: Partial<MusicXmlExportOptions> = {}): MusicXmlConfiguration {
    const o = { ...defaultMusicXmlExportOptions, ...options }
    return new MusicXmlConfiguration({
        exportLayout: o.exportLayout,
        exportBreaksType: breaksType(o.exportBreaks),
        exportInvisibleElements: o.exportInvisibleElements,
        exportMu3Compat: o.exportMu3Compat,
    })
}

/** the uncompressed MusicXML text (.musicxml) of a laid out master or part score (C++ saveXml) */
export function writeMusicXml(score: Score, options?: Partial<MusicXmlExportOptions>): string {
    return saveXml(score, configuration(options))
}

/**
 * The compressed MusicXML file (.mxl) of a laid out master or part score. Like MuseScore's MxlWriter (C++
 * saveMxl(Score*, IODevice*)) the MusicXML file in the archive has the anonymized name "score.xml"; fileName is not used.
 */
export function writeMxl(score: Score, fileName: string, options?: Partial<MusicXmlExportOptions>): Uint8Array {
    void fileName
    return saveMxl(score, configuration(options))
}
