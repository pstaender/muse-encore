/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/qml/MuseScore/Project/internal/Export/exportdialogmodel.cpp (the model of the Export dialog,
 * File > Export…): the scores to export (the main score and the parts, also the potential parts), the format and its
 * settings, the unit type. Only the formats the port writes: PDF, PNG, SVG, MIDI, MusicXML, and (not in MuseScore)
 * MuseScore files. exportScores() returns the files instead of asking for a path (the app downloads them).
 * The settings are the ExportConfiguration the app keeps (C++ the modules' configurations); the export info (format,
 * unit type, selected scores) is kept per project like ExportProjectScenario::exportInfo.
 */

import { mtrc } from '../framework/global/translation'
import type { MasterScore } from '../engraving/dom/masterscore'
import type { Score } from '../engraving/dom/score'
import type { MasterNotation } from '../notation/internal/masternotation'
import type { ExcerptNotation } from '../notation/internal/excerptnotation'
import { UnitType } from './inotationwriter'
import { makeWithSubtypes, makeWithSuffixes, type ExportType } from './internal/exporttype'
import type { ExportedFile, ExportItem, ExportProgress, ExportProjectScenario } from './internal/exportprojectscenario'
import type { ExportConfiguration } from './internal/notationwritersregister'

const DEFAULT_EXPORT_UNITTYPE = UnitType.PER_PART

/** ExportDialogModel::MusicXmlLayoutType */
export enum MusicXmlLayoutType {
    AllLayout,
    AllBreaks,
    ManualBreaks,
    None,
}

/** ExportInfo (ExportProjectScenario::exportInfo): the last export's settings of a project */
interface ExportInfo {
    id: string
    unitType: UnitType
    notations: ExportItem[]
}

const s_exportInfos = new WeakMap<MasterScore, ExportInfo>()

export interface ExportScoreItem {
    title: string
    isSelected: boolean
    isMain: boolean
}

export class ExportDialogModel {
    private m_items: ExportItem[] = []
    /** the selected rows in the order of their selection (QItemSelectionModel::selectedIndexes) */
    private m_selection: number[] = []
    private m_exportTypeList: ExportType[]
    private m_selectedExportType: ExportType
    private m_selectedUnitType: UnitType = DEFAULT_EXPORT_UNITTYPE

    /**
     * @param m_currentScore the score of the current notation (its row is selected)
     * @param m_onConfigurationChanged the settings changed (the app saves them)
     */
    constructor(private m_masterNotation: MasterNotation, private m_currentScore: Score, private m_scenario: ExportProjectScenario,
                private m_configuration: ExportConfiguration, private m_onConfigurationChanged: () => void = () => {}) {
        const musicXmlTypes = [
            makeWithSuffixes(['mxl'], mtrc('project/export', 'Compressed') + ' (*.mxl)',
                mtrc('project/export', 'Compressed MusicXML files'), 'MusicXmlSettingsPage'),
            makeWithSuffixes(['musicxml'], mtrc('project/export', 'Uncompressed') + ' (*.musicxml)',
                mtrc('project/export', 'Uncompressed MusicXML files'), 'MusicXmlSettingsPage'),
            makeWithSuffixes(['xml'], mtrc('project/export', 'Uncompressed (outdated)') + ' (*.xml)',
                mtrc('project/export', 'Uncompressed MusicXML files'), 'MusicXmlSettingsPage'),
        ]
        // not in MuseScore: a score or a part as MuseScore file
        const museScoreTypes = [
            makeWithSuffixes(['mscz'], mtrc('project/export', 'Compressed') + ' (*.mscz)', mtrc('project', 'MuseScore files'),
                'MuseScoreSettingsPage'),
            makeWithSuffixes(['mscx'], mtrc('project/export', 'Uncompressed') + ' (*.mscx)', mtrc('project', 'MuseScore files'),
                'MuseScoreSettingsPage'),
        ]
        // TODO(port): the audio formats (MP3, WAV, OGG, FLAC, AAC), MP4 video, Braille, MEI, MNX and LRC
        this.m_exportTypeList = [
            makeWithSuffixes(['pdf'], mtrc('project/export', 'PDF file'), mtrc('project/export', 'PDF files'), 'PdfSettingsPage'),
            makeWithSuffixes(['png'], mtrc('project/export', 'PNG images'), mtrc('project/export', 'PNG images'), 'PngSettingsPage'),
            makeWithSuffixes(['svg'], mtrc('project/export', 'SVG images'), mtrc('project/export', 'SVG images'), 'SvgSettingsPage'),
            makeWithSuffixes(['mid', 'midi', 'kar'], mtrc('project/export', 'MIDI file'), mtrc('project/export', 'MIDI files'),
                'MidiSettingsPage'),
            makeWithSubtypes(musicXmlTypes, mtrc('project/export', 'MusicXML')),
            makeWithSubtypes(museScoreTypes, mtrc('project', 'MuseScore file')),
        ]
        this.m_selectedExportType = this.m_exportTypeList[0]
    }

    private masterScore(): MasterScore {
        return this.m_masterNotation.masterScore()
    }

    init(): void {
        const info = s_exportInfos.get(this.masterScore())
        if (!info?.id) {
            this.setExportType(this.m_exportTypeList[0])
        } else {
            this.selectExportTypeById(info.id)
        }
        if (info) {
            this.setUnitType(info.unitType)
        }

        const excerpts: ExcerptNotation[] = [...this.m_masterNotation.excerpts(), ...this.m_masterNotation.potentialExcerpts()]
        this.m_masterNotation.sortExcerpts(excerpts)
        this.m_items = [{ kind: 'main' }, ...excerpts.map(excerpt => ({ kind: 'excerpt', excerpt }) as ExportItem)]
        this.m_selection = []

        this.selectCurrentNotation()
        this.selectSavedNotations(info)
    }

    // ---------------------------------------------------------------------------------
    //   the scores
    // ---------------------------------------------------------------------------------

    rowCount(): number { return this.m_items.length }

    items(): ExportScoreItem[] {
        return this.m_items.map((item, i) => ({
            title: item.kind === 'main' ? '' : item.excerpt.name(),
            isSelected: this.m_selection.includes(i),
            isMain: item.kind === 'main',
        }))
    }

    setSelected(scoreIndex: number, selected: boolean): void {
        if (!this.isIndexValid(scoreIndex)) {
            return
        }
        const i = this.m_selection.indexOf(scoreIndex)
        if (selected && i < 0) {
            this.m_selection.push(scoreIndex)
        } else if (!selected && i >= 0) {
            this.m_selection.splice(i, 1)
        }
    }

    setAllSelected(selected: boolean): void {
        for (let i = 0; i < this.rowCount(); i++) {
            this.setSelected(i, selected)
        }
    }

    private selectCurrentNotation(): void {
        for (let i = 0; i < this.rowCount(); i++) {
            this.setSelected(i, this.itemScore(this.m_items[i]) === this.m_currentScore)
        }
    }

    private selectSavedNotations(info: ExportInfo | undefined): void {
        for (const notation of info?.notations ?? []) {
            const index = this.m_items.findIndex(item => item.kind === notation.kind
                && (item.kind === 'main' || (notation.kind === 'excerpt' && item.excerpt === notation.excerpt)))
            if (index >= 0) {
                this.setSelected(index, true)
            }
        }
    }

    private itemScore(item: ExportItem): Score | null {
        return item.kind === 'main' ? this.masterScore() : item.excerpt.score()
    }

    private isIndexValid(index: number): boolean {
        return index >= 0 && index < this.m_items.length
    }

    selectionLength(): number {
        return this.m_selection.length
    }

    // ---------------------------------------------------------------------------------
    //   the format and the unit type
    // ---------------------------------------------------------------------------------

    exportTypeList(): readonly ExportType[] {
        return this.m_exportTypeList
    }

    selectedExportType(): ExportType {
        return this.m_selectedExportType
    }

    isFormatSelected(formatSuffix: string): boolean {
        return this.m_selectedExportType.suffixes.includes(formatSuffix)
    }

    setExportType(type: ExportType): void {
        if (this.m_selectedExportType === type) {
            return
        }
        this.m_selectedExportType = type
        const unitTypes = this.m_scenario.supportedUnitTypes(type)
        if (!unitTypes.length || unitTypes.includes(this.m_selectedUnitType)) {
            return
        }
        //! NOTE if the writer for the newly selected type doesn't support the currently
        //! selected unit type, select the first supported unit type
        this.setUnitType(unitTypes[0])
    }

    selectExportTypeById(id: string): void {
        for (const type of this.m_exportTypeList) {
            // First, check if it's a subtype
            const subtype = type.subtypes.find(t => t.id === id)
            if (subtype) {
                this.setExportType(subtype)
                return
            }
            if (type.id === id) {
                this.setExportType(type)
                return
            }
        }
        this.setExportType(this.m_exportTypeList[0])
    }

    /** the top level type of the selected type (the Format dropdown) */
    selectedTopLevelType(): ExportType {
        return this.m_exportTypeList.find(t => t === this.m_selectedExportType || t.subtypes.includes(this.m_selectedExportType))
            ?? this.m_exportTypeList[0]
    }

    availableUnitTypes(): { text: string; value: UnitType }[] {
        const unitTypeNames: Record<UnitType, string> = {
            [UnitType.PER_PAGE]: mtrc('project/export', 'Each page to a separate file'),
            [UnitType.PER_PART]: mtrc('project/export', 'Each part to a separate file'),
            [UnitType.MULTI_PART]: mtrc('project/export', 'All parts combined in one file'),
        }
        return this.m_scenario.supportedUnitTypes(this.m_selectedExportType).map(type => ({ text: unitTypeNames[type], value: type }))
    }

    selectedUnitType(): UnitType {
        return this.m_selectedUnitType
    }

    setUnitType(unitType: UnitType): void {
        if (this.m_selectedUnitType === unitType) {
            return
        }
        if (!this.availableUnitTypes().some(t => t.value === unitType)) {
            return
        }
        this.m_selectedUnitType = unitType
    }

    // ---------------------------------------------------------------------------------
    //   export
    // ---------------------------------------------------------------------------------

    private selectedItems(): ExportItem[] {
        return this.m_selection.map(i => this.m_items[i])
    }

    /** the name of the file to save (one file) or of the archive of the files (C++ the save dialog's default path) */
    defaultFileName(): string {
        return this.m_scenario.defaultFileName(this.selectedItems(), this.m_selectedExportType, this.m_selectedUnitType)
    }

    /** the files of the selected scores (C++ exportScores: asks for the path, then ExportProjectScenario::exportScores) */
    async exportScores(onProgress?: ExportProgress): Promise<ExportedFile[]> {
        const items = this.selectedItems()
        if (!items.length) {
            return []
        }
        this.updateExportInfo()
        return this.m_scenario.exportScores(items, this.m_selectedExportType, this.m_selectedUnitType, undefined, onProgress)
    }

    /** the dialog was closed: its settings are kept for the next export of the project */
    updateExportInfo(): void {
        s_exportInfos.set(this.masterScore(), {
            id: this.m_selectedExportType.id,
            unitType: this.m_selectedUnitType,
            notations: this.selectedItems(),
        })
    }

    // ---------------------------------------------------------------------------------
    //   the settings of the formats
    // ---------------------------------------------------------------------------------

    private changed(): void {
        this.m_onConfigurationChanged()
    }

    pdfResolution(): number { return this.m_configuration.images.exportPdfDpiResolution }
    setPdfResolution(resolution: number): void {
        if (resolution !== this.pdfResolution()) {
            this.m_configuration.images.exportPdfDpiResolution = resolution
            this.changed()
        }
    }

    pdfTransparentBackground(): boolean { return this.m_configuration.images.exportPdfWithTransparentBackground }
    setPdfTransparentBackground(transparent: boolean): void {
        if (transparent !== this.pdfTransparentBackground()) {
            this.m_configuration.images.exportPdfWithTransparentBackground = transparent
            this.changed()
        }
    }

    pdfGrayscale(): boolean { return this.m_configuration.images.exportPdfWithGrayscale }
    setPdfGrayscale(grayscale: boolean): void {
        if (grayscale !== this.pdfGrayscale()) {
            this.m_configuration.images.exportPdfWithGrayscale = grayscale
            this.changed()
        }
    }

    pngResolution(): number { return this.m_configuration.images.exportPngDpiResolution }
    setPngResolution(resolution: number): void {
        if (resolution !== this.pngResolution()) {
            this.m_configuration.images.exportPngDpiResolution = resolution
            this.changed()
        }
    }

    pngTransparentBackground(): boolean { return this.m_configuration.images.exportPngWithTransparentBackground }
    setPngTransparentBackground(transparent: boolean): void {
        if (transparent !== this.pngTransparentBackground()) {
            this.m_configuration.images.exportPngWithTransparentBackground = transparent
            this.changed()
        }
    }

    pngGrayscale(): boolean { return this.m_configuration.images.exportPngWithGrayscale }
    setPngGrayscale(grayscale: boolean): void {
        if (grayscale !== this.pngGrayscale()) {
            this.m_configuration.images.exportPngWithGrayscale = grayscale
            this.changed()
        }
    }

    svgTransparentBackground(): boolean { return this.m_configuration.images.exportSvgWithTransparentBackground }
    setSvgTransparentBackground(transparent: boolean): void {
        if (transparent !== this.svgTransparentBackground()) {
            this.m_configuration.images.exportSvgWithTransparentBackground = transparent
            this.changed()
        }
    }

    svgIllustratorCompat(): boolean { return this.m_configuration.images.exportSvgWithIllustratorCompat }
    setSvgIllustratorCompat(compat: boolean): void {
        if (compat !== this.svgIllustratorCompat()) {
            this.m_configuration.images.exportSvgWithIllustratorCompat = compat
            this.changed()
        }
    }

    midiExpandRepeats(): boolean { return this.m_configuration.midi.expandRepeats }
    setMidiExpandRepeats(expandRepeats: boolean): void {
        if (expandRepeats !== this.midiExpandRepeats()) {
            this.m_configuration.midi.expandRepeats = expandRepeats
            this.changed()
        }
    }

    midiExportRpns(): boolean { return this.m_configuration.midi.exportRPNs }
    setMidiExportRpns(exportRpns: boolean): void {
        if (exportRpns !== this.midiExportRpns()) {
            this.m_configuration.midi.exportRPNs = exportRpns
            this.changed()
        }
    }

    musicXmlLayoutTypes(): { text: string; value: MusicXmlLayoutType }[] {
        return [
            //: Specifies to which extent layout customizations should be exported to MusicXML.
            { value: MusicXmlLayoutType.AllLayout, text: mtrc('project/export', 'All layout') },
            //: Specifies to which extent layout customizations should be exported to MusicXML.
            { value: MusicXmlLayoutType.AllBreaks, text: mtrc('project/export', 'System and page breaks') },
            //: Specifies to which extent layout customizations should be exported to MusicXML.
            { value: MusicXmlLayoutType.ManualBreaks, text: mtrc('project/export', 'Manually added system and page breaks only') },
            //: Specifies to which extent layout customizations should be exported to MusicXML.
            { value: MusicXmlLayoutType.None, text: mtrc('project/export', 'No system or page breaks') },
        ]
    }

    musicXmlLayoutType(): MusicXmlLayoutType {
        const c = this.m_configuration.musicXml
        if (c.exportLayout ?? true) {
            return MusicXmlLayoutType.AllLayout
        }
        switch (c.exportBreaks ?? 'all') {
        case 'all': return MusicXmlLayoutType.AllBreaks
        case 'manual': return MusicXmlLayoutType.ManualBreaks
        case 'no': return MusicXmlLayoutType.None
        }
        return MusicXmlLayoutType.AllLayout
    }

    setMusicXmlLayoutType(layoutType: MusicXmlLayoutType): void {
        if (layoutType === this.musicXmlLayoutType()) {
            return
        }
        const c = this.m_configuration.musicXml
        switch (layoutType) {
        case MusicXmlLayoutType.AllLayout:
            c.exportLayout = true
            break
        case MusicXmlLayoutType.AllBreaks:
            c.exportLayout = false
            c.exportBreaks = 'all'
            break
        case MusicXmlLayoutType.ManualBreaks:
            c.exportLayout = false
            c.exportBreaks = 'manual'
            break
        case MusicXmlLayoutType.None:
            c.exportLayout = false
            c.exportBreaks = 'no'
            break
        }
        this.changed()
    }
}
