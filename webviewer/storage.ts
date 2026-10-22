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
// IndexedDB writes finish after a while: closing a file and reloading at once would bring it back. So the id of the
// current file is also kept in (synchronous) localStorage, and a stored file is only opened if its id matches.
const CURRENT_FILE_KEY = 'musescore-web-viewer:file'

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

/** the id of the current file; undefined if localStorage is not available (then any stored file is used) */
function currentFileId(): string | null | undefined {
    try {
        return localStorage.getItem(CURRENT_FILE_KEY)
    } catch {
        return undefined
    }
}

function setCurrentFileId(id: string | null): void {
    try {
        if (id) {
            localStorage.setItem(CURRENT_FILE_KEY, id)
        } else {
            localStorage.removeItem(CURRENT_FILE_KEY)
        }
    } catch {
        // ignore
    }
}

export async function saveLastFile(file: StoredFile): Promise<void> {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setCurrentFileId(id)
    try {
        await withStore('readwrite', s => s.put({ ...file, id }, LAST_FILE_KEY))
    } catch (e) {
        console.warn('could not remember the file', e)
    }
}

export async function loadLastFile(): Promise<StoredFile | null> {
    const id = currentFileId()
    if (id === null) {
        return null
    }
    try {
        const f = await withStore<(StoredFile & { id?: string }) | undefined>('readonly', s => s.get(LAST_FILE_KEY))
        return f && f.data && (id === undefined || f.id === id) ? { name: f.name, data: f.data } : null
    } catch {
        return null
    }
}

export async function clearLastFile(): Promise<void> {
    setCurrentFileId(null)
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
    viewMode: ViewerViewMode
}

/** the view modes of MuseScore's status bar the viewer offers */
export type ViewerViewMode = 'page' | 'continuous-horizontal' | 'continuous-vertical'
const VIEW_MODES: readonly string[] = ['page', 'continuous-horizontal', 'continuous-vertical']

const SETTINGS_KEY = 'musescore-web-viewer:view'

export function loadSettings(defaults: ViewSettings): ViewSettings {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ViewSettings>
        return {
            zoom: typeof s.zoom === 'string' ? s.zoom : defaults.zoom,
            orientation: s.orientation === 'vertical' ? 'vertical' : s.orientation === 'horizontal' ? 'horizontal' : defaults.orientation,
            spread: typeof s.spread === 'boolean' ? s.spread : defaults.spread,
            viewMode: VIEW_MODES.includes(s.viewMode as string) ? s.viewMode as ViewerViewMode : defaults.viewMode,
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
