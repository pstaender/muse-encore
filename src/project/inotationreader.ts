/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/inotationreader.h (INotationReader): the reader of an import format (File > Open of MusicXML,
 * MIDI, Capella, Guitar Pro files). The readers get the file's data instead of a path; they throw a NotationReadError
 * instead of returning a failed Ret.
 */

import type { MasterScore } from '../engraving/dom/masterscore'

export interface NotationReaderOptions {
    /** Ignore lower priority errors (like version errors) */
    forceMode?: boolean
}

/** the failed Ret of a reader (C++ engraving::Err) */
export class NotationReadError extends Error {}

export interface INotationReader {
    /**
     * reads the file into the (new, empty) master score
     * @param fileName the file's name with its suffix (C++ path; the readers use its base name, e.g. as title)
     */
    read(score: MasterScore, data: Uint8Array, fileName: string, options?: NotationReaderOptions): void | Promise<void>
}
