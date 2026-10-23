/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/musicxmlreader.h/.cpp: the reader of .xml/.musicxml/.mxl files.
 */

import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Err, errText } from '../../../engraving/engravingerrors'
import { NotationReadError, type INotationReader, type NotationReaderOptions } from '../../../project/inotationreader'
import { importCompressedMusicXml, importMusicXml } from './import/importmusicxml'

export class MusicXmlReader implements INotationReader {
    read(score: MasterScore, data: Uint8Array, fileName: string, options: NotationReaderOptions = {}): void {
        let err = Err.FileUnknownType
        const dot = fileName.lastIndexOf('.')
        const suffix = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
        const forceMode = options.forceMode ?? false

        if (suffix === 'xml' || suffix === 'musicxml') {
            err = importMusicXml(score, data, fileName, forceMode)
        } else if (suffix === 'mxl') {
            err = importCompressedMusicXml(score, data, fileName, forceMode)
        }
        if (err !== Err.NoError) {
            throw new NotationReadError(errText(err, fileName))
        }
    }
}
