/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/rwregister.h/.cpp: the reader and writer used by the DOM for the clipboard (mime data,
 * paste). C++ resolves them by version; here the read460 reader and the writer register themselves when their modules
 * are loaded (the DOM modules must not import them: import cycles).
 */

import type { Fraction } from '../types/fraction'
import type { staff_idx_t, track_idx_t } from '../types/types'
import type { EngravingItem } from '../dom/engravingitem'
import type { Segment } from '../dom/segment'
import type { ChordRest } from '../dom/chordrest'
import type { SelectionFilter } from '../dom/selectionfilter'
import type { XmlReader } from './xmlreader'
import type { XmlWriter } from './xmlwriter'

/** C++ rw::IReader (the parts used by the DOM) */
export interface IReader {
    pasteStaff(e: XmlReader, dst: Segment, dstStaff: staff_idx_t, scale: Fraction): boolean
    pasteSymbols(e: XmlReader, dst: ChordRest): void
    readItem(item: EngravingItem, xml: XmlReader): void
}

/** C++ rw::IWriter (the parts used by the DOM) */
export interface IWriter {
    /** curTick is updated (C++ Fraction&) */
    writeSegments(xml: XmlWriter, filter: SelectionFilter, strack: track_idx_t, etrack: track_idx_t,
        sseg: Segment, eseg: Segment | null, writeSystemElements: boolean, forceTimeSig: boolean, curTick: { v: Fraction }): void
    writeItem(item: EngravingItem, xml: XmlWriter): void
    /** a new XmlWriter (C++ constructs one on a Buffer; the DOM modules cannot import xmlwriter.ts: import cycles) */
    createXmlWriter(): XmlWriter
}

let s_reader: IReader | null = null
let s_writer: IWriter | null = null

export class RWRegister {
    static reader(): IReader {
        if (!s_reader) {
            throw new Error('RWRegister: no reader registered (import rw/read460/read460)')
        }
        return s_reader
    }

    static writer(): IWriter {
        if (!s_writer) {
            throw new Error('RWRegister: no writer registered (import rw/write/writer)')
        }
        return s_writer
    }

    static setReader(r: IReader): void { s_reader = r }
    static setWriter(w: IWriter): void { s_writer = w }
}
