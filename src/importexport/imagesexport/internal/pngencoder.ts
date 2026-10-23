/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Not in MuseScore (QImage::save): a PNG encoder for 8 bit RGBA images that takes the image in strips of rows, so a
 * large page (1200 DPI by default) never has to be in memory as one bitmap. The resolution is stored in a pHYs chunk.
 */

import { Zlib } from 'fflate'

const CRC_TABLE = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; ++n) {
        let c = n
        for (let k = 0; k < 8; ++k) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        t[n] = c >>> 0
    }
    return t
})()

function crc32(data: Uint8Array, crc = 0xffffffff): number {
    for (let i = 0; i < data.length; ++i) {
        crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
    }
    return crc
}

export class PngEncoder {
    private m_chunks: Uint8Array[] = []
    private m_zlib: Zlib
    private m_prev: Uint8Array
    private m_rows = 0

    /** dotsPerMeter: QImage::setDotsPerMeterX/Y */
    constructor(private m_width: number, private m_height: number, dotsPerMeter: number) {
        this.m_chunks.push(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        const ihdr = new Uint8Array(13)
        const v = new DataView(ihdr.buffer)
        v.setUint32(0, m_width)
        v.setUint32(4, m_height)
        ihdr.set([8, 6, 0, 0, 0], 8) // 8 bit RGBA, deflate, adaptive filtering, no interlace
        this.chunk('IHDR', ihdr)
        const phys = new Uint8Array(9)
        const pv = new DataView(phys.buffer)
        pv.setUint32(0, dotsPerMeter)
        pv.setUint32(4, dotsPerMeter)
        phys[8] = 1 // meters
        this.chunk('pHYs', phys)
        this.m_prev = new Uint8Array(m_width * 4)
        this.m_zlib = new Zlib({ level: 6 }, (data) => {
            if (data.length) {
                this.chunk('IDAT', data)
            }
        })
    }

    private chunk(type: string, data: Uint8Array): void {
        const head = new Uint8Array(8)
        const v = new DataView(head.buffer)
        v.setUint32(0, data.length)
        for (let i = 0; i < 4; ++i) {
            head[4 + i] = type.charCodeAt(i)
        }
        const tail = new Uint8Array(4)
        new DataView(tail.buffer).setUint32(0, (crc32(data, crc32(head.subarray(4))) ^ 0xffffffff) >>> 0)
        this.m_chunks.push(head, data, tail)
    }

    /** the next rows, RGBA (not premultiplied), `width * 4` bytes each */
    addRows(rgba: Uint8Array | Uint8ClampedArray, rows: number): void {
        const stride = this.m_width * 4
        const out = new Uint8Array(rows * (stride + 1))
        for (let y = 0; y < rows; ++y) {
            const line = rgba.subarray(y * stride, (y + 1) * stride)
            // the "Up" filter: sheet music has long equal runs from row to row
            const o = y * (stride + 1)
            out[o] = 2
            for (let x = 0; x < stride; ++x) {
                out[o + 1 + x] = (line[x] - this.m_prev[x]) & 0xff
            }
            this.m_prev.set(line)
        }
        this.m_rows += rows
        this.m_zlib.push(out, false)
    }

    finish(): Uint8Array {
        if (this.m_rows !== this.m_height) {
            throw new Error(`PngEncoder: ${this.m_rows} of ${this.m_height} rows`)
        }
        this.m_zlib.push(new Uint8Array(0), true)
        this.chunk('IEND', new Uint8Array(0))
        const total = this.m_chunks.reduce((n, c) => n + c.length, 0)
        const out = new Uint8Array(total)
        let pos = 0
        for (const c of this.m_chunks) {
            out.set(c, pos)
            pos += c.length
        }
        return out
    }
}
