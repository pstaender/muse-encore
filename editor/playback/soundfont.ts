/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's default soundfont "MS Basic.sf3" (MIT, MuseScore/share/sound; the sound of MuseScore without Muse
 * Sounds): downloaded on the first use with progress, kept in the browser's Cache Storage so it is downloaded once.
 * The dev server serves it from the MuseScore submodule, the build copies it (vite-plugin-sound.ts).
 */
/// <reference types="vite/client" />
import type { LoadProgress } from './synthesizer'

export const SOUNDFONT_FILE = 'MS Basic.sf3'
export const SOUNDFONT_URL = `${import.meta.env.BASE_URL}sound/${encodeURIComponent(SOUNDFONT_FILE)}`
const CACHE_NAME = 'musescoreweb-sound-v1'

async function openCache(): Promise<Cache | null> {
    try {
        return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null
    } catch {
        return null // no Cache Storage (insecure context, blocked site data)
    }
}

/** the soundfont from the cache or the network */
export async function loadSoundFont(onProgress?: (p: LoadProgress) => void, url = SOUNDFONT_URL): Promise<ArrayBuffer> {
    const cache = await openCache()
    const cached = await cache?.match(url).catch(() => undefined)
    if (cached) {
        const buffer = await cached.arrayBuffer()
        onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength })
        return buffer
    }

    const response = await fetch(url)
    if (!response.ok || !response.body) {
        throw new Error(`${SOUNDFONT_FILE}: ${response.status} ${response.statusText}`)
    }
    const total = Number(response.headers.get('content-length')) || 0
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let loaded = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) {
            break
        }
        chunks.push(value)
        loaded += value.byteLength
        onProgress?.({ loaded, total })
    }
    const data = new Uint8Array(loaded)
    let offset = 0
    for (const c of chunks) {
        data.set(c, offset)
        offset += c.byteLength
    }
    try {
        await cache?.put(url, new Response(data, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(loaded) } }))
    } catch {
        // quota exceeded: downloaded again next time
    }
    return data.buffer
}

/** the soundfont is in the cache (no download needed) */
export async function isSoundFontCached(url = SOUNDFONT_URL): Promise<boolean> {
    const cache = await openCache()
    return !!(await cache?.match(url).catch(() => undefined))
}
