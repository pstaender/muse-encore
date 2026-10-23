/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/musicxmlreader.h/.cpp: the reader of .xml/.musicxml/.mxl files. The question
 * whether to load a file with errors anyway (C++ musicXmlImportErrorDialog in importMusicXmlfromBuffer) is asked here
 * after the import, through the interactive of the options.
 */

import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Err, errText } from '../../../engraving/engravingerrors'
import { NotationReadError, type INotationReader, type NotationReaderOptions } from '../../../project/inotationreader'
import { importCompressedMusicXml, importMusicXml, lastMusicXmlImportErrors, musicXmlImportErrorQuestion } from './import/importmusicxml'

export class MusicXmlReader implements INotationReader {
    async read(score: MasterScore, data: Uint8Array, fileName: string, options: NotationReaderOptions = {}): Promise<void> {
        let err = Err.FileUnknownType
        const dot = fileName.lastIndexOf('.')
        const suffix = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
        const forceMode = options.forceMode ?? false

        if (suffix === 'xml' || suffix === 'musicxml') {
            err = importMusicXml(score, data, fileName, forceMode)
        } else if (suffix === 'mxl') {
            err = importCompressedMusicXml(score, data, fileName, forceMode)
        }
        // importMusicXmlfromBuffer: the import errors
        const errors = err === Err.NoError ? lastMusicXmlImportErrors() : ''
        if (errors && options.interactive) {
            const { title, text } = musicXmlImportErrorQuestion(errors)
            if (!(await options.interactive.question(title, text))) {
                err = Err.UserAbort
            }
        }
        if (err !== Err.NoError) {
            throw new NotationReadError(errText(err, fileName), err)
        }
    }
}
