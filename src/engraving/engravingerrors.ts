/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/engravingerrors.h: the error codes of reading files; errText is the text of make_ret (the
 * failed muse::Ret).
 */

import { mtrc } from '../framework/global/translation'

export enum Err {
    Undefined = -1,
    NoError = 0,
    UnknownError = 2000,

    // file
    FileUnknownError = 2001,
    FileNotFound = 2002,
    FileOpenError = 2003,
    FileBadFormat = 2004,
    FileUnknownType = 2005,
    FileTooOld = 2006,
    FileTooNew = 2007,
    FileOld300Format = 2008,
    FileCorrupted = 2009,
    FileCriticallyCorrupted = 2010,

    UserAbort = 2011,
    IgnoreError = 2012,
}

/** the text of make_ret(err, filePath) */
export function errText(err: Err, filePath = ''): string {
    switch (err) {
    case Err.NoError:
        return ''
    case Err.FileUnknownError:
        return mtrc('engraving', 'Unknown error')
    case Err.FileNotFound:
        return mtrc('engraving', 'File “%1” not found').replace('%1', filePath)
    case Err.FileOpenError:
        return mtrc('engraving', 'File open error')
    case Err.FileBadFormat:
        return mtrc('engraving', 'Bad format')
    case Err.FileUnknownType:
        return mtrc('engraving', 'Unknown filetype')
    case Err.FileTooOld:
        return mtrc('engraving', 'This file was last saved in a version older than 2.0.0. '
                                 + 'You can convert this score by opening and then '
                                 + 'saving in MuseScore version 2.x. '
                                 + 'Visit the <a href="%1">MuseScore download page</a> to obtain such a 2.x version.')
            .replace('%1', 'https://musescore.org/download#older-versions')
    case Err.FileTooNew:
        return mtrc('engraving', 'This file was saved using a newer version of MuseScore Studio. '
                                 + 'Please visit <a href="%1">MuseScore.org</a> to obtain the latest version.')
            .replace('%1', 'https://musescore.org')
    case Err.FileOld300Format:
        return mtrc('engraving', 'This file was last saved in a development version of 3.0.')
    case Err.FileCorrupted:
        return mtrc('engraving', 'File “%1” is corrupted.').replace('%1', filePath)
    case Err.FileCriticallyCorrupted:
        return mtrc('engraving', 'File “%1” is critically corrupted and cannot be processed.').replace('%1', filePath)
    default:
        return ''
    }
}
