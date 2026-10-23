/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Replacement of muse::draw::IImageProvider (src/framework/draw/internal/qimageprovider.cpp).
 * createPixmap() only reads the size of the image from its header (PNG, JPEG, GIF, BMP, WebP); decoding is done when
 * the image is drawn (imagecache.ts). TODO(port): scaled() (the pre-scaled image buffer of TDraw), image export.
 */

import { Pixmap } from '../types/pixmap'

function u16be(d: Uint8Array, i: number): number { return (d[i] << 8) | d[i + 1] }
function u32be(d: Uint8Array, i: number): number { return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0 }
function u16le(d: Uint8Array, i: number): number { return d[i] | (d[i + 1] << 8) }
function i32le(d: Uint8Array, i: number): number { return d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) | (d[i + 3] << 24) }
function u24le(d: Uint8Array, i: number): number { return d[i] | (d[i + 1] << 8) | (d[i + 2] << 16) }

function startsWith(d: Uint8Array, bytes: readonly number[], offset = 0): boolean {
    if (d.length < offset + bytes.length) {
        return false
    }
    return bytes.every((b, i) => d[offset + i] === b)
}

/** type and size of an encoded raster image, null if the format is not recognized */
export function rasterImageInfo(d: Uint8Array): { mimeType: string; width: number; height: number } | null {
    // PNG
    if (startsWith(d, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && d.length >= 24) {
        return { mimeType: 'image/png', width: u32be(d, 16), height: u32be(d, 20) }
    }
    // GIF
    if (startsWith(d, [0x47, 0x49, 0x46, 0x38]) && d.length >= 10) {
        return { mimeType: 'image/gif', width: u16le(d, 6), height: u16le(d, 8) }
    }
    // BMP
    if (startsWith(d, [0x42, 0x4d]) && d.length >= 26) {
        const headerSize = i32le(d, 14)
        if (headerSize === 12) {
            return { mimeType: 'image/bmp', width: u16le(d, 18), height: u16le(d, 20) }
        }
        return { mimeType: 'image/bmp', width: Math.abs(i32le(d, 18)), height: Math.abs(i32le(d, 22)) }
    }
    // WebP
    if (startsWith(d, [0x52, 0x49, 0x46, 0x46]) && startsWith(d, [0x57, 0x45, 0x42, 0x50], 8) && d.length >= 30) {
        const chunk = String.fromCharCode(d[12], d[13], d[14], d[15])
        if (chunk === 'VP8X') {
            return { mimeType: 'image/webp', width: u24le(d, 24) + 1, height: u24le(d, 27) + 1 }
        } else if (chunk === 'VP8L') {
            const b = d.subarray(21)
            const width = 1 + (((b[1] & 0x3f) << 8) | b[0])
            const height = 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6))
            return { mimeType: 'image/webp', width, height }
        } else if (chunk === 'VP8 ') {
            return { mimeType: 'image/webp', width: u16le(d, 26) & 0x3fff, height: u16le(d, 28) & 0x3fff }
        }
        return null
    }
    // JPEG: scan the markers for a start of frame
    if (startsWith(d, [0xff, 0xd8])) {
        let i = 2
        while (i + 9 < d.length) {
            if (d[i] !== 0xff) {
                ++i
                continue
            }
            const marker = d[i + 1]
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
                i += marker === 0xff ? 1 : 2
                continue
            }
            const len = u16be(d, i + 2)
            const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
            if (isSof) {
                return { mimeType: 'image/jpeg', width: u16be(d, i + 7), height: u16be(d, i + 5) }
            }
            i += 2 + len
        }
        return { mimeType: 'image/jpeg', width: 0, height: 0 }
    }
    return null
}

export const ImageProvider = {
    /** C++ IImageProvider::createPixmap(const ByteArray&): a null pixmap if the data is not a known image format */
    createPixmap(data: Uint8Array, key?: string): Pixmap {
        const info = rasterImageInfo(data)
        if (!info) {
            return new Pixmap(new Uint8Array(0), '', 0, 0, key)
        }
        return new Pixmap(data, info.mimeType, info.width, info.height, key)
    },
}
