/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app's state and commands: which view is shown (home screen or score), the open score, opening files and
 * stored scores, creating new scores. The React components read the state with useSession().
 */
import { useSyncExternalStore } from 'react'
import {
    createScore, drawPage, layoutScore, loadScore, pageCount, pageSize, scoreTitle, type MasterScore,
    type NewScoreOptions,
} from '../src/index'
import {
    addScore, contentHash, loadScoreContent, openScoreId, setOpenScoreId, takeLegacyLastFile, updateScore,
    type ScoreEntry,
} from './db'
import { clearScore, fontsReady, handlers, hideBusy, setStatus, showBusy, showScore, viewShown } from './scoreview'

export interface SessionState {
    view: 'home' | 'score'
    /** the open score; id is null if it could not be stored */
    current: { id: string | null; name: string } | null
    newScoreDialog: boolean
    /** the last error, shown on the home screen */
    error: string | null
}

let state: SessionState = { view: 'home', current: null, newScoreDialog: false, error: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<SessionState>): void {
    state = { ...state, ...patch }
    document.body.dataset.view = state.view
    for (const l of listeners) {
        l()
    }
}

export function useSession(): SessionState {
    return useSyncExternalStore(
        (l) => {
            listeners.add(l)
            return () => listeners.delete(l)
        },
        () => state,
    )
}

export function setView(view: 'home' | 'score'): void {
    if (view === 'score' && !state.current) {
        return
    }
    setState({ view })
    if (view === 'score') {
        viewShown()
    }
}

export function dismissError(): void {
    setState({ error: null })
}

export function showNewScoreDialog(open: boolean): void {
    setState({ newScoreDialog: open })
}

// ---------------------------------------------------------------------------------
//   opening and creating scores
// ---------------------------------------------------------------------------------

const UNTITLED = 'Untitled score' // NotationProject::scoreDefaultTitle

/** a small picture of the first page for the home screen */
function makeThumbnail(score: MasterScore): Promise<Blob | undefined> {
    const size = pageSize(score, 0)
    const width = 360
    const dpi = width / size.width
    const c = document.createElement('canvas')
    c.width = width
    c.height = Math.round(size.height * dpi)
    drawPage(score, 0, c.getContext('2d')!, { dpi })
    return new Promise(resolve => c.toBlob(b => resolve(b ?? undefined), 'image/webp', 0.85))
}

function entryInfo(score: MasterScore): Pick<ScoreEntry, 'title' | 'composer' | 'pages' | 'aspect'> {
    const size = pageSize(score, 0)
    return {
        title: scoreTitle(score),
        composer: score.metaTag('composer') || '',
        pages: pageCount(score),
        aspect: size.width / size.height,
    }
}

/**
 * Shows the busy overlay, makes and lays out the score (synchronously, so the overlay is painted first) and shows it.
 * Returns null (with the error shown) if it fails.
 */
async function load(name: string, make: () => MasterScore): Promise<MasterScore | null> {
    await showBusy(`Opening ${name}`, 'Loading fonts…')
    try {
        await fontsReady
        setStatus(`Loading ${name}…`)
        await showBusy(`Opening ${name}`, 'Laying out the score…')
        const t0 = performance.now()
        const s = make()
        const t1 = performance.now()
        showScore(s, name)
        setStatus(`${name} · ${pageCount(s)} ${pageCount(s) === 1 ? 'page' : 'pages'} · layout ${Math.round(t1 - t0)} ms`)
        return s
    } catch (e) {
        console.error(e)
        const msg = `Could not open ${name}: ${(e as Error).message}`
        setStatus(msg, true)
        setState({ error: msg })
        return null
    } finally {
        hideBusy()
    }
}

/** shows the score that was just loaded at once; it is stored meanwhile (store() returns its id) */
async function opened(name: string, store: () => Promise<string | null>): Promise<string | null> {
    setState({ current: { id: null, name }, error: null })
    setView('score')
    const id = await store()
    setOpenScoreId(id)
    if (state.current?.name === name && state.current.id === null) {
        setState({ current: { id, name } })
    }
    return id
}

function loadFileData(data: ArrayBuffer): MasterScore {
    const s = loadScore(data)
    layoutScore(s)
    return s
}

export async function openFileData(name: string, data: ArrayBuffer, source: 'file' | 'url', url?: string): Promise<void> {
    const s = await load(name, () => loadFileData(data))
    if (!s) {
        return
    }
    const id = await opened(name, async () => addScore(
        { name, source, url, hash: await contentHash(data), size: data.byteLength, ...entryInfo(s) },
        { data },
    ))
    if (id) {
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
}

export async function openFile(file: File): Promise<void> {
    await openFileData(file.name, await file.arrayBuffer(), 'file')
}

export async function openUrl(url: string): Promise<void> {
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'score.mscz')
    await showBusy(`Opening ${name}`, 'Downloading…')
    try {
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`)
        }
        await openFileData(name, await res.arrayBuffer(), 'url', url)
    } catch (e) {
        hideBusy()
        const msg = `Could not load ${url}: ${(e as Error).message}`
        setStatus(msg, true)
        setState({ error: msg })
    }
}

/** opens a score of the home screen; false if it is not stored (any more) */
export async function openStored(id: string): Promise<boolean> {
    if (state.current?.id === id) {
        setView('score')
        return true
    }
    const stored = await loadScoreContent(id)
    if (!stored) {
        return false
    }
    const { entry, content } = stored
    const s = await load(entry.name, () => 'data' in content ? loadFileData(content.data) : createScore(content.options))
    if (!s) {
        return true
    }
    await opened(entry.name, async () => {
        await updateScore(id, { opened: Date.now(), ...entryInfo(s) })
        return id
    })
    if (!entry.thumbnail) {
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
    return true
}

export async function createNewScore(options: NewScoreOptions): Promise<void> {
    const name = options.title?.trim() || UNTITLED
    showNewScoreDialog(false)
    const s = await load(name, () => createScore(options))
    if (!s) {
        return
    }
    const id = await opened(name, () => addScore({ name, source: 'new', size: 0, ...entryInfo(s) }, { options }))
    if (id) {
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
}

export function closeScore(): void {
    clearScore()
    setOpenScoreId(null)
    setState({ current: null })
    setView('home')
}

/** the stored score was removed from the list: if it is open, it stays open but is not stored any more */
export function forgetScore(id: string): void {
    if (state.current?.id === id) {
        setOpenScoreId(null)
        setState({ current: { ...state.current, id: null } })
    }
}

// ---------------------------------------------------------------------------------
//   the file chooser
// ---------------------------------------------------------------------------------

const fileInput = document.createElement('input')
fileInput.type = 'file'
fileInput.accept = '.mscz,.mscx'
fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (f) {
        void openFile(f)
    }
    fileInput.value = ''
})

export function chooseFile(): void {
    fileInput.click()
}

handlers.openFile = (f) => void openFile(f)
handlers.chooseFile = chooseFile
handlers.newScore = () => showNewScoreDialog(true)
handlers.closeScore = closeScore

// ---------------------------------------------------------------------------------
//   startup: ?url=<score url>, otherwise the score that was open
// ---------------------------------------------------------------------------------

export async function startup(): Promise<void> {
    const url = new URLSearchParams(location.search).get('url')
    const legacy = await takeLegacyLastFile()
    if (url) {
        await openUrl(url)
    } else if (legacy?.open) {
        await openFileData(legacy.name, legacy.data, 'file')
    } else {
        if (legacy) {
            // keep it in the list without opening it; the details are filled in when it is opened
            await addScore({
                name: legacy.name, source: 'file', hash: await contentHash(legacy.data), size: legacy.data.byteLength,
                title: '', composer: '', pages: 0, aspect: 210 / 297,
            }, { data: legacy.data })
        }
        const id = openScoreId()
        if (id && !(await openStored(id))) {
            setOpenScoreId(null)
        }
    }
}
