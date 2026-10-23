/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/musicxmlconfiguration.h/.cpp
 * (and IMusicXmlConfiguration::MusicXmlExportBreaksType of imusicxmlconfiguration.h)
 *
 * The C++ settings (export/musicXml/..., import/musicXml/...) are plain values objects here with MuseScore's defaults.
 * The export gets its configuration as a parameter; the import uses the global musicXmlImportConfiguration() (C++ the
 * IMusicXmlConfiguration resolved by the import code).
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

/** the import settings (C++ settings keys import/musicXml/* and import/compatibility/*) */
export interface MusicXmlImportSettings {
    /** import/musicXml/importBreaks: import system and page breaks */
    importBreaks: boolean
    /** import/musicXml/importLayout: import the layout (page format, staff distances, ...) */
    importLayout: boolean
    /** import/compatibility/apply_edwin_for_xml: use the default font (Edwin) instead of the file's fonts */
    needUseDefaultFont: boolean
    /** import/musicXml/importInferTextType: infer the text type (title, tempo, dynamics, ...) of plain text */
    inferTextType: boolean
}

/** MusicXmlConfiguration::init(): the default values of the import settings */
export function defaultMusicXmlImportSettings(): MusicXmlImportSettings {
    return {
        importBreaks: true,
        importLayout: true,
        needUseDefaultFont: false,
        inferTextType: false,
    }
}

/** the import part of MusicXmlConfiguration */
export class MusicXmlImportConfiguration {
    private m_settings: MusicXmlImportSettings

    constructor(settings: Partial<MusicXmlImportSettings> = {}) {
        this.m_settings = { ...defaultMusicXmlImportSettings(), ...settings }
    }

    settings(): MusicXmlImportSettings { return { ...this.m_settings } }
    setSettings(settings: Partial<MusicXmlImportSettings>): void { this.m_settings = { ...this.m_settings, ...settings } }

    importBreaks(): boolean { return this.m_settings.importBreaks }
    setImportBreaks(value: boolean): void { this.m_settings.importBreaks = value }

    importLayout(): boolean { return this.m_settings.importLayout }
    setImportLayout(value: boolean): void { this.m_settings.importLayout = value }

    needUseDefaultFont(): boolean { return this.m_settings.needUseDefaultFont }
    setNeedUseDefaultFont(value: boolean): void { this.m_settings.needUseDefaultFont = value }

    inferTextType(): boolean { return this.m_settings.inferTextType }
    setInferTextType(value: boolean): void { this.m_settings.inferTextType = value }
}

const s_importConfiguration = new MusicXmlImportConfiguration()

/** the configuration the MusicXML import uses (C++ the IMusicXmlConfiguration from the IoC container) */
export function musicXmlImportConfiguration(): MusicXmlImportConfiguration {
    return s_importConfiguration
}
