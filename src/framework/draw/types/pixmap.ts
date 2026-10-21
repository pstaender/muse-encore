/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/draw/types/pixmap.h (muse::draw::Pixmap).
 *
 * Deviation: a Pixmap keeps the encoded image data (PNG, JPEG, GIF, BMP, WebP or an SVG document) and its size in
 * pixels; it is decoded by the paint provider (see imagecache.ts) when drawn. Pixmaps with the same data share one
 * decoded image (key).
 */

import { SizeF } from './geometry'

let s_nextKey = 1

export class Pixmap {
    private m_key: string

    constructor(private m_data: Uint8Array = new Uint8Array(0), private m_mimeType = '', private m_width = 0,
                private m_height = 0, key?: string) {
        this.m_key = key ?? `pm${s_nextKey++}`
    }

    isNull(): boolean { return this.m_width <= 0 || this.m_height <= 0 || this.m_data.length === 0 }

    width(): number { return this.m_width }
    height(): number { return this.m_height }
    size(): SizeF { return new SizeF(this.m_width, this.m_height) }

    /** the encoded image data */
    data(): Uint8Array { return this.m_data }
    /** e.g. "image/png", "image/svg+xml" */
    mimeType(): string { return this.m_mimeType }
    /** identifies the image data (for the decoded image caches) */
    key(): string { return this.m_key }
}
