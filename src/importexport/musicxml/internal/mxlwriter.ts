/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/mxlwriter.h/.cpp: the compressed MusicXML (.mxl) writer (per part).
 * The settings (C++ IMusicXmlConfiguration) are passed to the constructor.
 */

import { AbstractNotationWriter, UnitType, type ExportNotation, type NotationWriterOptions } from '../../../project/inotationwriter'
import { saveMxl } from './export/exportmusicxml'
import { MusicXmlConfiguration, type MusicXmlExportSettings } from './musicxmlconfiguration'

export class MxlWriter extends AbstractNotationWriter {
    constructor(private m_settings: Partial<MusicXmlExportSettings> = {}) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART]
    }

    write(notation: ExportNotation, _options?: NotationWriterOptions): Promise<Uint8Array> {
        return Promise.resolve(saveMxl(notation.score, new MusicXmlConfiguration(this.m_settings)))
    }
}
