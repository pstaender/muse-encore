/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The scores of the app in IndexedDB (via Dexie): every opened or created score is kept with its content, so the
 * home screen can list and reopen it (like MuseScore's recent scores). The score that is open is remembered in
 * localStorage and reopened on the next start.
 * Storage can be unavailable (private windows, blocked site data): then nothing is remembered and all calls fail
 * silently.
 */
import Dexie, { type EntityTable } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type { NewScoreOptions } from '../src/index'

export interface ScoreEntry {
    id: string
    /** file name with extension; for a new score its title */
    name: string
    title: string
    composer: string
    source: 'file' | 'url' | 'new'
    url?: string
    /** SHA-256 of a file's content: opening the same file again reuses the entry */
    hash?: string
    size: number
    pages: number
    /** page width / height (for the thumbnail placeholder) */
    aspect: number
    created: number
    modified: number
    opened: number
    thumbnail?: Blob
}

/**
 * The content of a score: a file, or the options of a new score. There is no score writer yet, so a new score is
 * stored as the options it was created with (createScore() is deterministic).
 */
export type ScoreContent =
    | { id: string; data: ArrayBuffer }
    | { id: string; options: NewScoreOptions }

class ScoreDb extends Dexie {
    scores!: EntityTable<ScoreEntry, 'id'>
    contents!: EntityTable<ScoreContent, 'id'>

    constructor() {
        super('musescoreweb-scores')
        this.version(1).stores({
            scores: 'id, opened, hash',
            contents: 'id',
        })
    }
}

const db = new ScoreDb()

/** keep at most this many scores (the least recently opened ones are removed) */
const MAX_SCORES = 100

function newId(): string {
    return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function contentHash(data: ArrayBuffer): Promise<string | undefined> {
    try {
        const d = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
        return Array.from(d, b => b.toString(16).padStart(2, '0')).join('')
    } catch {
        return undefined // no crypto.subtle (insecure context)
    }
}

/** adds a score (or, for a file that is already stored, updates its entry); returns its id */
export async function addScore(entry: Omit<ScoreEntry, 'id' | 'created' | 'modified' | 'opened'>, content: Omit<ScoreContent, 'id'>): Promise<string | null> {
    const now = Date.now()
    try {
        return await db.transaction('rw', db.scores, db.contents, async () => {
            const existing = entry.hash ? await db.scores.where('hash').equals(entry.hash).first() : undefined
            if (existing) {
                await db.scores.update(existing.id, { ...entry, opened: now })
                return existing.id
            }
            const id = newId()
            await db.scores.add({ ...entry, id, created: now, modified: now, opened: now })
            await db.contents.add({ ...content, id } as ScoreContent)
            const old = await db.scores.orderBy('opened').reverse().offset(MAX_SCORES).primaryKeys()
            await db.scores.bulkDelete(old)
            await db.contents.bulkDelete(old)
            return id
        })
    } catch (e) {
        console.warn('could not store the score', e)
        return null
    }
}

export async function updateScore(id: string, changes: Partial<Omit<ScoreEntry, 'id'>>): Promise<void> {
    try {
        await db.scores.update(id, changes)
    } catch {
        // ignore
    }
}

export async function loadScoreContent(id: string): Promise<{ entry: ScoreEntry; content: ScoreContent } | null> {
    try {
        const [entry, content] = await Promise.all([db.scores.get(id), db.contents.get(id)])
        return entry && content ? { entry, content } : null
    } catch {
        return null
    }
}

export async function removeScore(id: string): Promise<void> {
    try {
        await db.transaction('rw', db.scores, db.contents, async () => {
            await db.scores.delete(id)
            await db.contents.delete(id)
        })
    } catch {
        // ignore
    }
}

export async function removeAllScores(): Promise<void> {
    try {
        await db.transaction('rw', db.scores, db.contents, async () => {
            await db.scores.clear()
            await db.contents.clear()
        })
    } catch {
        // ignore
    }
}

/** all stored scores, most recently opened first; undefined while loading, [] without storage */
export function useScores(): ScoreEntry[] | undefined {
    return useLiveQuery(async () => {
        try {
            return await db.scores.orderBy('opened').reverse().toArray()
        } catch {
            return []
        }
    })
}

// ---------------------------------------------------------------------------------
//   the open score
// ---------------------------------------------------------------------------------

// synchronous, so a score that was just closed does not come back when the page is reloaded at once
const OPEN_SCORE_KEY = 'musescoreweb:open'

export function openScoreId(): string | null {
    try {
        return localStorage.getItem(OPEN_SCORE_KEY)
    } catch {
        return null
    }
}

export function setOpenScoreId(id: string | null): void {
    try {
        if (id) {
            localStorage.setItem(OPEN_SCORE_KEY, id)
        } else {
            localStorage.removeItem(OPEN_SCORE_KEY)
        }
    } catch {
        // ignore
    }
}

// ---------------------------------------------------------------------------------
//   the first version kept only the last opened file (database "musescoreweb", store "files", key "last")
// ---------------------------------------------------------------------------------

/** the last file of the first version, which is then deleted; null if there is none */
export async function takeLegacyLastFile(): Promise<{ name: string; data: ArrayBuffer; open: boolean } | null> {
    const LEGACY_FILE_KEY = 'musescoreweb:file'
    let open = false
    try {
        open = !!localStorage.getItem(LEGACY_FILE_KEY)
        localStorage.removeItem(LEGACY_FILE_KEY)
        if (!(await indexedDB.databases?.())?.some(d => d.name === 'musescoreweb')) {
            return null
        }
    } catch {
        return null
    }
    const file = await new Promise<{ name: string; data: ArrayBuffer } | null>((resolve) => {
        const req = indexedDB.open('musescoreweb')
        req.onerror = () => resolve(null)
        req.onsuccess = () => {
            const idb = req.result
            try {
                const get = idb.transaction('files', 'readonly').objectStore('files').get('last')
                get.onsuccess = () => {
                    idb.close()
                    const f = get.result as { name?: string; data?: ArrayBuffer } | undefined
                    resolve(f?.name && f.data ? { name: f.name, data: f.data } : null)
                }
                get.onerror = () => {
                    idb.close()
                    resolve(null)
                }
            } catch {
                idb.close()
                resolve(null)
            }
        }
    })
    indexedDB.deleteDatabase('musescoreweb')
    return file ? { ...file, open } : null
}
