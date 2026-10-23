/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/notationwritersregister.cpp: the writers of the export formats by file suffix
 * (the modules register them in C++: imagesexport, midi, musicxml). Only the formats of the port's Export dialog.
 * Not in MuseScore: the writer of MuseScore files (.mscz/.mscx), which exports a part as a score of its own.
 */

import type { MasterScore } from '../../engraving/dom/masterscore'
import type { Score } from '../../engraving/dom/score'
import type { ImagesExportConfiguration } from '../../importexport/imagesexport/internal/imagesexportconfiguration'
import { PdfWriter } from '../../importexport/imagesexport/internal/pdfwriter'
import { PngWriter } from '../../importexport/imagesexport/internal/pngwriter'
import { SvgWriter } from '../../importexport/imagesexport/internal/svgwriter'
import { writeMidi, type MidiExportOptions } from '../../importexport/midi/api'
import { writeMusicXml, writeMxl, type MusicXmlExportOptions } from '../../importexport/musicxml/api'
import { AbstractNotationWriter, UnitType, type ExportNotation, type INotationWriter, type NotationWriterOptions } from '../inotationwriter'

/** the settings of the writers (the app keeps them) */
export interface ExportConfiguration {
    images: ImagesExportConfiguration
    midi: MidiExportOptions
    musicXml: Partial<MusicXmlExportOptions>
}

/** the functions of the library the MuseScore file writer needs (index.ts) */
export interface MsczServices {
    saveMscz(score: MasterScore, fileName: string): Uint8Array
    writeMscx(score: Score): string
    /** a score of its own from .mscx data, laid out */
    loadScore(data: Uint8Array): MasterScore
}

const encoder = new TextEncoder()

/** MusicXmlWriter / MxlWriter (src/importexport/musicxml/internal/musicxmlwriter.cpp, mxlwriter.cpp) */
class MusicXmlNotationWriter extends AbstractNotationWriter {
    constructor(private m_configuration: ExportConfiguration, private m_compressed: boolean) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART]
    }

    async write(notation: ExportNotation): Promise<Uint8Array> {
        const options = this.m_configuration.musicXml
        if (this.m_compressed) {
            // the name of the .musicxml in the .mxl: the escaped work title and part name (MxlWriter)
            return writeMxl(notation.score, `${notation.projectWorkTitleAndPartName()}.musicxml`, options)
        }
        return encoder.encode(writeMusicXml(notation.score, options))
    }
}

/** NotationMidiWriter (src/importexport/midi/internal/notationmidiwriter.cpp) */
class MidiNotationWriter extends AbstractNotationWriter {
    constructor(private m_configuration: ExportConfiguration) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART]
    }

    async write(notation: ExportNotation): Promise<Uint8Array> {
        return writeMidi(notation.score, this.m_configuration.midi)
    }
}

/**
 * Not in MuseScore: a score as MuseScore file. The main score is saved with its parts; a part is saved as a score of
 * its own (its .mscx read as a new score, without the links to the main score), so single instruments can be exported.
 */
class MsczNotationWriter extends AbstractNotationWriter {
    constructor(private m_services: MsczServices, private m_compressed: boolean) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART]
    }

    async write(notation: ExportNotation): Promise<Uint8Array> {
        const score = notation.score
        const fileName = `${notation.projectWorkTitleAndPartName()}.mscz`
        if (score.isMaster()) {
            return this.m_compressed ? this.m_services.saveMscz(score as MasterScore, fileName)
                : encoder.encode(this.m_services.writeMscx(score))
        }
        const standalone = this.m_services.loadScore(encoder.encode(this.m_services.writeMscx(score)))
        return this.m_compressed ? this.m_services.saveMscz(standalone, fileName) : encoder.encode(this.m_services.writeMscx(standalone))
    }
}

export class NotationWritersRegister {
    private m_writers = new Map<string, INotationWriter>()

    constructor(configuration: ExportConfiguration, services: MsczServices) {
        // ImagesExportModule::resolveImports
        this.reg(['pdf'], new PdfWriter(configuration.images))
        this.reg(['svg'], new SvgWriter(configuration.images))
        this.reg(['png'], new PngWriter(configuration.images))
        // MidiModule::resolveImports
        this.reg(['mid', 'midi', 'kar'], new MidiNotationWriter(configuration))
        // MusicXmlModule::resolveImports
        this.reg(['musicxml', 'xml'], new MusicXmlNotationWriter(configuration, false))
        this.reg(['mxl'], new MusicXmlNotationWriter(configuration, true))
        this.reg(['mscz'], new MsczNotationWriter(services, true))
        this.reg(['mscx'], new MsczNotationWriter(services, false))
    }

    reg(suffixes: string[], writer: INotationWriter): void {
        for (const s of suffixes) {
            this.m_writers.set(s, writer)
        }
    }

    writer(suffix: string): INotationWriter | null {
        return this.m_writers.get(suffix) ?? null
    }

    /** NotationWriterOptions of a write: the unit type and the page */
    static options(unitType: UnitType, pageNumber?: number): NotationWriterOptions {
        return pageNumber === undefined ? { unitType } : { unitType, pageNumber }
    }
}
