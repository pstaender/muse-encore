/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The readers of the import formats (C++ the registerExports of musicxmlmodule.cpp, midimodule.cpp, capellamodule.cpp,
 * guitarpromodule.cpp).
 */

import { NotationReadersRegister } from '../project/internal/notationreadersregister'
import { MusicXmlReader } from './musicxml/internal/musicxmlreader'
import { GuitarProReader } from './guitarpro/internal/guitarproreader'
import { CapellaReader } from './capella/internal/capellareader'
import { NotationMidiReader } from './midi/internal/notationmidireader'

export function createNotationReadersRegister(): NotationReadersRegister {
    const readers = new NotationReadersRegister()
    readers.reg(['xml', 'musicxml', 'mxl'], new MusicXmlReader())
    readers.reg(['mid', 'midi', 'kar'], new NotationMidiReader())
    readers.reg(['cap', 'capx'], new CapellaReader())
    readers.reg(['gtp', 'gp3', 'gp4', 'gp5', 'gpx', 'gp', 'ptb'], new GuitarProReader())
    return readers
}
