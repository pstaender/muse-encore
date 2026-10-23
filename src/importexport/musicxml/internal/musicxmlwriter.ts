/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/musicxmlwriter.h/.cpp: the uncompressed MusicXML writer (per part).
 * The settings (C++ IMusicXmlConfiguration) are passed to the constructor.
 */

import { strToU8 } from 'fflate'
import { AbstractNotationWriter, UnitType, type ExportNotation, type NotationWriterOptions } from '../../../project/inotationwriter'
import { saveXml } from './export/exportmusicxml'
import { MusicXmlConfiguration, type MusicXmlExportSettings } from './musicxmlconfiguration'

export class MusicXmlWriter extends AbstractNotationWriter {
    constructor(private m_settings: Partial<MusicXmlExportSettings> = {}) {
        super()
    }

    supportedUnitTypes(): UnitType[] {
        return [UnitType.PER_PART]
    }

    write(notation: ExportNotation, _options?: NotationWriterOptions): Promise<Uint8Array> {
        const score = notation.score
        return Promise.resolve(strToU8(saveXml(score, new MusicXmlConfiguration(this.m_settings))))
    }
}
