/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxml.h/.cpp
 *
 * The import gets the file's data instead of a path. The dialog asking whether to load a file with errors anyway
 * (musicXmlImportErrorDialog) is asynchronous: MusicXmlReader shows it after the import with the errors of
 * lastMusicXmlImportErrors() (musicXmlImportErrorQuestion).
 */

import { strFromU8, unzipSync } from 'fflate'
import type { MasterScore } from '../../../../engraving/dom/masterscore'
import type { Score } from '../../../../engraving/dom/score'
import { Err } from '../../../../engraving/engravingerrors'
import { XmlStreamReader } from '../../../../engraving/rw/xmlreader'
import { MusicXmlLogger, MusicXmlLoggerLevel } from './importmusicxmllogger'
import { MusicXmlParserPass1 } from './importmusicxmlpass1'
import { MusicXmlParserPass2 } from './importmusicxmlpass2'
import { MusicXmlValidation } from './musicxmlvalidation'
import { mtrc } from '../../../../framework/global/translation'

let s_lastErrors = ''

/** the errors found by the last import (C++ shown in musicXmlImportErrorDialog) */
export function lastMusicXmlImportErrors(): string {
    return s_lastErrors
}

//---------------------------------------------------------
//   musicXmlImportErrorDialog
//---------------------------------------------------------

/**
 Show a dialog displaying the MusicXML import error(s): the title and text of the question (Yes: load the file anyway).
 */
export function musicXmlImportErrorQuestion(errors: string): { title: string; text: string } {
    // C++ counts the characters of the error texts (String::size())
    const text = mtrc('iex_musicxml', '%Ln error(s) found, import may be incomplete.', '', errors.length)
    let msg = text
    msg += '\n'
    msg += mtrc('iex_musicxml', 'Do you want to try to load this file anyway?')
    msg += '\n'
    msg += '\n'
    msg += errors
    return { title: text, text: msg }
}

//---------------------------------------------------------
//   importMusicXmlfromBuffer
//---------------------------------------------------------

export function importMusicXmlfromBuffer(score: Score, name: string, data: Uint8Array | string): Err {
    void name
    const logger = new MusicXmlLogger()
    logger.setLoggingLevel(MusicXmlLoggerLevel.MXML_ERROR)   // errors only
    //logger.setLoggingLevel(MusicXmlLoggerLevel.MXML_INFO);
    //logger.setLoggingLevel(MusicXmlLoggerLevel.MXML_TRACE); // also include tracing

    // pass 1
    const pass1 = new MusicXmlParserPass1(score, logger)
    let res = pass1.parse(data)
    const pass1Errors = pass1.errors()

    // pass 2
    const pass2 = new MusicXmlParserPass2(score, pass1, logger)
    if (res === Err.NoError) {
        res = pass2.parse(data)
    }

    for (const part of score.parts()) {
        for (const instr of part.instruments().values()) {
            instr.updateInstrumentId()
        }
    }

    // report result: the dialog (musicXmlImportErrorDialog) is asked by MusicXmlReader
    const pass2Errors = pass2.errors()
    s_lastErrors = pass1Errors + pass2Errors

    return res
}

//---------------------------------------------------------
//   extractRootfile
//---------------------------------------------------------

/**
Extract rootfile from compressed MusicXML file \a data, return null on error.
*/

function extractRootfile(data: Uint8Array): Uint8Array | null {
    let files: Record<string, Uint8Array>
    try {
        files = unzipSync(data)
    } catch {
        return null
    }

    const ba = files['META-INF/container.xml']
    if (!ba) {
        return null
    }

    const e = new XmlStreamReader(strFromU8(ba))

    let rootfile = ''
    while (e.readNextStartElement()) {
        if (e.name() !== 'container') {
            break
        }
        while (e.readNextStartElement()) {
            if (e.name() !== 'rootfiles') {
                break
            }
            while (e.readNextStartElement()) {
                if (e.name() === 'rootfile') {
                    rootfile = e.attribute('full-path')
                    break
                }
            }
        }
    }

    return files[rootfile] ?? null
}

//---------------------------------------------------------
//   doValidateAndImport
//---------------------------------------------------------

/**
 Validate and import MusicXML data from file \a name contained in \a data into score \a score.
 */

function doValidateAndImport(score: Score, name: string, data: Uint8Array, forceMode: boolean): Err {
    let res: Err

    if (!forceMode) {
        // Validate the file
        res = MusicXmlValidation.validate(name, data)
        if (res !== Err.NoError) {
            return res
        }
    }

    // actually do the import
    res = importMusicXmlfromBuffer(score, name, data)
    return res
}

//---------------------------------------------------------
//   importMusicXml
//    return Err::File* errors
//---------------------------------------------------------

export function importMusicXml(score: MasterScore, data: Uint8Array, name: string, forceMode: boolean): Err {
    // C++ ScoreLoad sl: suppress warnings for undo push/pop (the score has no undo command open)

    // and import it
    return doValidateAndImport(score, name, data, forceMode)
}

//---------------------------------------------------------
//   importCompressedMusicXml
//    return false on error
//---------------------------------------------------------

/**
 Import compressed MusicXML file \a name into the Score.
 */

export function importCompressedMusicXml(score: MasterScore, data: Uint8Array, name: string, forceMode: boolean): Err {
    // extract the root file
    const xml = extractRootfile(data)
    if (!xml) {
        return Err.FileBadFormat      // appropriate error message has been printed by extractRootfile
    }

    // and import it
    return doValidateAndImport(score, name, xml, forceMode)
}
