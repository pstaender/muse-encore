/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/musicxml/internal/import/importmusicxmllogger.h/.cpp
 *
 * The C++ logger writes to the debug log (LOGD); here the messages go to console.debug only if MusicXmlLogger.debug
 * is set.
 */

import type { XmlStreamReader } from '../../../../engraving/rw/xmlreader'

export enum MusicXmlLoggerLevel {
    MXML_TRACE, MXML_INFO, MXML_ERROR,
}

//---------------------------------------------------------
//   xmlLocation
//---------------------------------------------------------

function xmlLocation(xmlreader: XmlStreamReader | null): string {
    let loc = ''
    if (xmlreader) {
        loc = ` at byte offset ${xmlreader.byteOffset()}`
    }
    return loc
}

function toXmlLog(level: MusicXmlLoggerLevel, text: string, xmlreader: XmlStreamReader | null): void {
    if (!MusicXmlLogger.debug) {
        return
    }
    let str: string
    switch (level) {
    case MusicXmlLoggerLevel.MXML_TRACE: str = 'Trace'
        break
    case MusicXmlLoggerLevel.MXML_INFO: str = 'Info'
        break
    case MusicXmlLoggerLevel.MXML_ERROR: str = 'Error'
        break
    default: str = 'Unknown'
        break
    }

    str += xmlLocation(xmlreader)
    str += ': '
    str += text

    console.debug(str)
}

export class MusicXmlLogger {
    static readonly Level = MusicXmlLoggerLevel
    /** write the messages to console.debug (C++ LOGD) */
    static debug = false

    private m_level = MusicXmlLoggerLevel.MXML_INFO

    /** Log debug (function) trace. */
    logDebugTrace(trace: string, xmlreader: XmlStreamReader | null = null): void {
        if (this.m_level <= MusicXmlLoggerLevel.MXML_TRACE) {
            toXmlLog(MusicXmlLoggerLevel.MXML_TRACE, trace, xmlreader)
        }
    }

    /** Log debug \a info (non-fatal events relevant for debugging). */
    logDebugInfo(info: string, xmlreader: XmlStreamReader | null = null): void {
        if (this.m_level <= MusicXmlLoggerLevel.MXML_INFO) {
            toXmlLog(MusicXmlLoggerLevel.MXML_INFO, info, xmlreader)
        }
    }

    /** Log \a error (possibly non-fatal but to be reported to the user anyway). */
    logError(error: string, xmlreader: XmlStreamReader | null = null): void {
        if (this.m_level <= MusicXmlLoggerLevel.MXML_ERROR) {
            toXmlLog(MusicXmlLoggerLevel.MXML_ERROR, error, xmlreader)
        }
    }

    setLoggingLevel(level: MusicXmlLoggerLevel): void { this.m_level = level }
}
