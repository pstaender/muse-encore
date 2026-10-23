/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/capella/internal/capellareader.h/.cpp: the INotationReader of .cap and .capx files.
 * MuseScore shows the error of a .cap file that cannot be read in a message box ("Import Capella", through the
 * interactive here) and opens the (empty or partly read) score; here the reader then throws a NotationReadError with
 * the code IgnoreError (the message was shown). A file without any staff (e.g. a .capx file without score.xml) is
 * rejected as well.
 */

import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Err } from '../../../engraving/engravingerrors'
import { mtrc } from '../../../framework/global/translation'
import { NotationReadError, type INotationReader, type NotationReaderOptions } from '../../../project/inotationreader'
import { importCapella } from './capella'
import { importCapXml } from './capxml'

export class CapellaReader implements INotationReader {
    async read(score: MasterScore, data: Uint8Array, fileName: string, options: NotationReaderOptions = {}): Promise<void> {
        const dot = fileName.lastIndexOf('.')
        const suffix = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''
        let error: string | null = null
        if (suffix === 'cap') {
            importCapella(score, data, (message) => { error = message })
        } else if (suffix === 'capx') {
            importCapXml(score, data, fileName)
        } else {
            throw new NotationReadError(`Unknown file type: ${fileName}`, Err.FileUnknownType)
        }
        if (error !== null) {
            if (options.interactive) {
                await options.interactive.warning(mtrc('iex_capella', 'Import Capella'), error)
                throw new NotationReadError(error, Err.IgnoreError)
            }
            throw new NotationReadError(error, Err.FileBadFormat)
        }
        if (score.nstaves() === 0) {
            throw new NotationReadError('Import failed: no staves found', Err.FileBadFormat)
        }
    }
}
