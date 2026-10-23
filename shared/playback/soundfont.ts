/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore's default soundfont "MS Basic.sf3" (MIT, MuseScore/share/sound; the sound of MuseScore without Muse
 * Sounds): downloaded on the first use with progress, kept in the browser's Cache Storage so it is downloaded once.
 * The dev servers serve it from the MuseScore submodule, the app builds copy it (vite-plugin-sound.ts); the viewer
 * package loads it from MuseScore's repository by default (SOUNDFONT_CDN_URL).
 */
import type { LoadProgress } from './synthesizer'

export const SOUNDFONT_FILE = 'MS Basic.sf3'
/** the soundfont served by an app (vite-plugin-sound.ts) at its base URL */
export function appSoundFontUrl(baseUrl: string): string {
    return `${baseUrl}sound/${encodeURIComponent(SOUNDFONT_FILE)}`
}
/** the soundfont in MuseScore's repository at the reference version (raw.githubusercontent.com allows cross-origin requests) */
export const SOUNDFONT_CDN_URL = `https://raw.githubusercontent.com/musescore/MuseScore/v4.7.5/share/sound/${encodeURIComponent(SOUNDFONT_FILE)}`
const CACHE_NAME = 'musescoreweb-sound-v1'

async function openCache(): Promise<Cache | null> {
    try {
        return 'caches' in globalThis ? await caches.open(CACHE_NAME) : null
    } catch {
        return null // no Cache Storage (insecure context, blocked site data)
    }
}

/** the soundfont from the cache or the network */
export async function loadSoundFont(url: string, onProgress?: (p: LoadProgress) => void): Promise<ArrayBuffer> {
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
export async function isSoundFontCached(url: string): Promise<boolean> {
    const cache = await openCache()
    return !!(await cache?.match(url).catch(() => undefined))
}
