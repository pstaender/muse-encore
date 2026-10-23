/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/global/io/buffer.h/.cpp (muse::io::Buffer, an IODevice on a byte array), read only: the
 * importers get the file's data instead of a file.
 */

export class Buffer {
    private m_pos = 0
    private m_open = false

    constructor(private readonly m_data: Uint8Array) {}

    open(): boolean {
        this.m_open = true
        this.m_pos = 0
        return true
    }

    isOpen(): boolean { return this.m_open }

    /** C++ IODevice::isReadable(): open (the buffer is opened read only) */
    isReadable(): boolean { return this.m_open }

    close(): void { this.m_open = false }

    size(): number { return this.m_data.length }

    pos(): number { return this.m_pos }

    seek(pos: number): boolean {
        if (pos < 0 || pos > this.m_data.length) {
            return false
        }
        this.m_pos = pos
        return true
    }

    atEnd(): boolean { return this.m_pos >= this.m_data.length }

    /** reads up to len bytes (fewer at the end of the data) */
    read(len: number): Uint8Array {
        const end = Math.min(this.m_pos + Math.max(0, len), this.m_data.length)
        const r = this.m_data.subarray(this.m_pos, end)
        this.m_pos = end
        return r
    }

    /** reads len bytes into p at offset; returns the number of bytes read (C++ read(uint8_t* data, size_t len)) */
    readInto(p: Uint8Array, len: number, offset = 0): number {
        const r = this.read(len)
        p.set(r, offset)
        return r.length
    }

    readAll(): Uint8Array {
        return this.read(this.m_data.length - this.m_pos)
    }

    data(): Uint8Array { return this.m_data }
}
