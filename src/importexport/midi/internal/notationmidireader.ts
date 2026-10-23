/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/notationmidireader.h/.cpp: the INotationReader of MIDI files
 * (.mid, .midi, .kar). A failed import throws a NotationReadError with the text of the error (C++ make_ret(err, path)).
 * There is no MIDI import panel: the import operations of a file are MuseScore's defaults and are removed after the
 * import, so that opening a file with the same name again imports it anew.
 */

import type { MasterScore } from '../../../engraving/dom/masterscore'
import { Err, errText } from '../../../engraving/engravingerrors'
import { NotationReadError, type INotationReader, type NotationReaderOptions } from '../../../project/inotationreader'
import { importMidi, lastMidiImportError } from './midiimport/importmidi'
import { midiImportOperations } from './midiimport/importmidi_operations'

export class NotationMidiReader implements INotationReader {
    read(score: MasterScore, data: Uint8Array, fileName: string, _options?: NotationReaderOptions): void {
        let err: Err
        try {
            err = importMidi(score, data, fileName)
        } finally {
            midiImportOperations.excludeMidiFile(fileName)
        }
        if (err !== Err.NoError) {
            const text = err === Err.FileBadFormat && lastMidiImportError
                ? `${errText(err, fileName)}: ${lastMidiImportError}` : errText(err, fileName)
            throw new NotationReadError(text)
        }
    }
}
