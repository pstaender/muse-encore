/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Remembers the last opened file (IndexedDB, files are too big for localStorage) and the view settings.
 * Storage can be unavailable (private windows, blocked site data): every access fails silently.
 */

export interface StoredFile {
    name: string
    data: ArrayBuffer
}

const DB_NAME = 'musescore-web-viewer'
const STORE = 'files'
const LAST_FILE_KEY = 'last'

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

async function withStore<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb()
    try {
        return await new Promise<T>((resolve, reject) => {
            const req = op(db.transaction(STORE, mode).objectStore(STORE))
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    } finally {
        db.close()
    }
}

export async function saveLastFile(file: StoredFile): Promise<void> {
    try {
        await withStore('readwrite', s => s.put(file, LAST_FILE_KEY))
    } catch (e) {
        console.warn('could not remember the file', e)
    }
}

export async function loadLastFile(): Promise<StoredFile | null> {
    try {
        const f = await withStore<StoredFile | undefined>('readonly', s => s.get(LAST_FILE_KEY))
        return f && f.data ? f : null
    } catch {
        return null
    }
}

export async function clearLastFile(): Promise<void> {
    try {
        await withStore('readwrite', s => s.delete(LAST_FILE_KEY))
    } catch {
        // ignore
    }
}

export interface ViewSettings {
    zoom: string // a percentage ("100") or a fit mode ("page-width", "whole-page")
    orientation: 'horizontal' | 'vertical'
    spread: boolean
}

const SETTINGS_KEY = 'musescore-web-viewer:view'

export function loadSettings(defaults: ViewSettings): ViewSettings {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ViewSettings>
        return {
            zoom: typeof s.zoom === 'string' ? s.zoom : defaults.zoom,
            orientation: s.orientation === 'vertical' ? 'vertical' : s.orientation === 'horizontal' ? 'horizontal' : defaults.orientation,
            spread: typeof s.spread === 'boolean' ? s.spread : defaults.spread,
        }
    } catch {
        return defaults
    }
}

export function saveSettings(s: ViewSettings): void {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
    } catch {
        // ignore
    }
}
