/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of the export settings of src/importexport/musicxml/internal/musicxmlconfiguration.h/.cpp
 * (and IMusicXmlConfiguration::MusicXmlExportBreaksType of imusicxmlconfiguration.h)
 *
 * The C++ settings (export/musicXml/...) are a plain values object here with MuseScore's defaults; the import
 * settings are not ported (there is no MusicXML import).
 */

/** IMusicXmlConfiguration::MusicXmlExportBreaksType */
export enum MusicXmlExportBreaksType {
    All,
    Manual,
    No,
}

/** the export settings (C++ settings keys export/musicXml/*) */
export interface MusicXmlExportSettings {
    /** export/musicXml/exportLayout */
    exportLayout: boolean
    /** export/musicXml/exportBreaks */
    exportBreaksType: MusicXmlExportBreaksType
    /** export/musicXml/exportMu3Compat: "Limit MusicXML export for compatibility with MuseScore 3" */
    exportMu3Compat: boolean
    /** export/musicXml/exportInvisibleElements: "Export invisible elements to MusicXML" */
    exportInvisibleElements: boolean
}

/** MusicXmlConfiguration::init(): the default values */
export function defaultMusicXmlExportSettings(): MusicXmlExportSettings {
    return {
        exportLayout: true,
        exportBreaksType: MusicXmlExportBreaksType.All,
        exportMu3Compat: false,
        exportInvisibleElements: false,
    }
}

export class MusicXmlConfiguration {
    private m_settings: MusicXmlExportSettings

    constructor(settings: Partial<MusicXmlExportSettings> = {}) {
        this.m_settings = { ...defaultMusicXmlExportSettings(), ...settings }
    }

    settings(): MusicXmlExportSettings { return { ...this.m_settings } }

    exportLayout(): boolean { return this.m_settings.exportLayout }
    setExportLayout(value: boolean): void { this.m_settings.exportLayout = value }

    exportMu3Compat(): boolean { return this.m_settings.exportMu3Compat }
    setExportMu3Compat(value: boolean): void { this.m_settings.exportMu3Compat = value }

    exportBreaksType(): MusicXmlExportBreaksType { return this.m_settings.exportBreaksType }
    setExportBreaksType(breaksType: MusicXmlExportBreaksType): void { this.m_settings.exportBreaksType = breaksType }

    exportInvisibleElements(): boolean { return this.m_settings.exportInvisibleElements }
    setExportInvisibleElements(value: boolean): void { this.m_settings.exportInvisibleElements = value }
}
