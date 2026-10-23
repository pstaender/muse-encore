/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midishared/midievent.h
 */

import { MidiCoreEvent } from '../../../../engraving/compat/midi/midicoreevent'

export class MidiEvent extends MidiCoreEvent {
    protected _edata: Uint8Array = new Uint8Array(0)
    protected _len = 0
    protected _metaType = 0

    edata(): Uint8Array { return this._edata }
    /** C++ setEData(std::vector<uchar>&&): the values are stored as unsigned chars */
    setEData(d: Uint8Array | readonly number[]): void { this._edata = Uint8Array.from(d, v => v & 0xff) }
    len(): number { return this._len }
    setLen(l: number): void { this._len = l }
    metaType(): number { return this._metaType }
    setMetaType(v: number): void { this._metaType = v }
}
