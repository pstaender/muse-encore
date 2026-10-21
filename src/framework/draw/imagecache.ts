/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Decoded images for the canvas paint provider (no C++ counterpart: Qt decodes QPixmaps synchronously).
 * In browsers images are decoded asynchronously (createImageBitmap, or an <img> element for SVG documents): the first
 * paint of an image skips it and the listeners (onImageDecoded) are told to repaint once it is decoded. Other
 * environments (node) set a decoder with setDecoder(), e.g. @napi-rs/canvas' loadImage; whenDecoded() waits for the
 * pending decodes (draw again afterwards).
 */

import type { Pixmap } from './types/pixmap'

/** a CanvasImageSource (or a node canvas image) */
export type DecodedImage = unknown

export type ImageDecoder = (pm: Pixmap) => DecodedImage | Promise<DecodedImage | null> | null

interface Entry {
    image: DecodedImage | null
    pending: Promise<void> | null
}

function browserDecoder(): ImageDecoder | null {
    const g = globalThis as unknown as {
        Blob?: typeof Blob
        createImageBitmap?: (b: Blob) => Promise<unknown>
        Image?: new () => HTMLImageElement
        URL?: typeof URL
    }
    if (!g.Blob) {
        return null
    }
    return (pm: Pixmap) => {
        const blob = new g.Blob!([pm.data() as BlobPart], { type: pm.mimeType() })
        if (pm.mimeType() === 'image/svg+xml' || !g.createImageBitmap) {
            if (!g.Image || !g.URL) {
                return null
            }
            const img = new g.Image!()
            const url = g.URL.createObjectURL(blob)
            img.src = url
            return img.decode().then(() => img).catch(() => null).finally(() => g.URL!.revokeObjectURL(url))
        }
        return g.createImageBitmap(blob).catch(() => null)
    }
}

class ImageCacheImpl {
    private m_decoder: ImageDecoder | null = browserDecoder()
    private m_cache = new Map<string, Entry>()
    private m_listeners = new Set<() => void>()

    setDecoder(decoder: ImageDecoder | null): void {
        this.m_decoder = decoder
        this.m_cache.clear()
    }

    /** the decoded image, null if it cannot be decoded or is still being decoded (then a decode is started) */
    get(pm: Pixmap): DecodedImage | null {
        const key = pm.key()
        const e = this.m_cache.get(key)
        if (e) {
            return e.image
        }
        if (!this.m_decoder) {
            return null
        }
        let result: ReturnType<ImageDecoder>
        try {
            result = this.m_decoder(pm)
        } catch {
            result = null
        }
        if (result && typeof (result as Promise<unknown>).then === 'function') {
            const entry: Entry = { image: null, pending: null }
            this.m_cache.set(key, entry)
            entry.pending = (result as Promise<DecodedImage | null>).catch(() => null).then((img) => {
                entry.image = img
                entry.pending = null
                if (img) {
                    for (const l of [...this.m_listeners]) {
                        l()
                    }
                }
            })
            return null
        }
        this.m_cache.set(key, { image: result ?? null, pending: null })
        return result ?? null
    }

    /** true while an image is being decoded */
    hasPending(): boolean {
        for (const e of this.m_cache.values()) {
            if (e.pending) {
                return true
            }
        }
        return false
    }

    /** resolves when the images that are being decoded are available */
    async whenDecoded(): Promise<void> {
        while (this.hasPending()) {
            await Promise.all([...this.m_cache.values()].map(e => e.pending).filter(Boolean))
        }
    }

    /** called whenever an asynchronously decoded image becomes available (the view should repaint) */
    onImageDecoded(listener: () => void): () => void {
        this.m_listeners.add(listener)
        return () => { this.m_listeners.delete(listener) }
    }
}

export const imageCache = new ImageCacheImpl()
