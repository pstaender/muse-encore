/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/inotationreader.h (INotationReader): the reader of an import format (File > Open of MusicXML,
 * MIDI, Capella, Guitar Pro files). The readers get the file's data instead of a path; they throw a NotationReadError
 * instead of returning a failed Ret. The questions and warnings of the readers (C++ IInteractive, MessageBox) go
 * through the `interactive` of the options; without it the import goes on like MuseScore without GUI (MScore::noGui).
 */

import type { MasterScore } from '../engraving/dom/masterscore'
import { Err } from '../engraving/engravingerrors'

/** the dialogs the readers show (C++ IInteractive::questionSync / MessageBox::warning) */
export interface NotationReaderInteractive {
    /** a question with the buttons Yes and No (default No); true for Yes */
    question(title: string, text: string): Promise<boolean>
    /** a warning with the button OK */
    warning(title: string, text: string): Promise<void>
}

export interface NotationReaderOptions {
    /** Ignore lower priority errors (like version errors) */
    forceMode?: boolean
    /** the dialogs of the import; none: the import goes on without asking (MScore::noGui) */
    interactive?: NotationReaderInteractive | null
}

/** the failed Ret of a reader: its code (C++ engraving::Err) and text */
export class NotationReadError extends Error {
    constructor(message: string, readonly code: Err = Err.FileUnknownError) {
        super(message)
    }
}

export interface INotationReader {
    /**
     * reads the file into the (new, empty) master score
     * @param fileName the file's name with its suffix (C++ path; the readers use its base name, e.g. as title)
     */
    read(score: MasterScore, data: Uint8Array, fileName: string, options?: NotationReaderOptions): void | Promise<void>
}
