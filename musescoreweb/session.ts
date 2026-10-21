/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app's state and commands: which view is shown (home screen or score), the open score, opening files and
 * stored scores, creating new scores. The React components read the state with useSession().
 */
import { useSyncExternalStore } from 'react'
import {
    createScore, drawPage, isModified, layoutScore, loadScore, markSaved, pageCount, pageSize, saveMscz, scoreTitle,
    type MasterScore, type NewScoreOptions,
} from '../src/index'
import {
    addScore, contentHash, loadScoreContent, openScoreId, saveScoreContent, setOpenScoreId, takeLegacyLastFile,
    updateScore, type ScoreEntry,
} from './db'
import { arg, qtrc } from './i18n'
import {
    clearScore, currentScore, fontsReady, handlers, hideBusy, scoreSaved, setStatus, showBusy, showScore, viewShown,
} from './scoreview'

export interface SessionState {
    view: 'home' | 'score'
    /** the open score; id is null if it could not be stored */
    current: { id: string | null; name: string } | null
    newScoreDialog: boolean
    /** another dialog of the app */
    dialog: 'preferences' | 'about' | 'clearRecent' | 'revertFactory' | 'saveChanges' | null
    /** the last error, shown on the home screen */
    error: string | null
}

let state: SessionState = { view: 'home', current: null, newScoreDialog: false, dialog: null, error: null }
const listeners = new Set<() => void>()

function setState(patch: Partial<SessionState>): void {
    state = { ...state, ...patch }
    document.body.dataset.view = state.view
    for (const l of listeners) {
        l()
    }
}

export function onSessionChanged(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
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

export function showDialog(dialog: SessionState['dialog']): void {
    setState({ dialog })
}

export function session(): SessionState {
    return state
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

// ---------------------------------------------------------------------------------
//   saving (ProjectActionsController): "Save" stores the score in this browser, "Save a copy" downloads it
// ---------------------------------------------------------------------------------

/** the file name of the open score with the extension .mscz */
function msczName(): string {
    const name = state.current?.name ?? UNTITLED
    return `${name.replace(/\.mscx?z?$/i, '')}.mscz`
}

export function canSave(): boolean {
    return !!state.current && !!currentScore()
}

/** File > Save: writes the score and stores it in this browser (a new entry if it is not stored any more) */
export async function saveScore(): Promise<boolean> {
    const s = currentScore()
    const current = state.current
    if (!s || !current) {
        return false
    }
    const bytes = saveMscz(s, msczName())
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const info = { size: data.byteLength, hash: await contentHash(data), ...entryInfo(s) }
    let id = current.id
    if (!id || !(await saveScoreContent(id, data, info))) {
        id = await addScore({ name: current.name, source: 'file', ...info }, { data })
        if (!id) {
            setStatus(`Could not save ${current.name}: the browser does not store data for this page`, true)
            return false
        }
        setOpenScoreId(id)
        setState({ current: { id, name: current.name } })
    }
    markSaved(s)
    scoreSaved()
    setStatus(`${current.name} saved in this browser`)
    void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    return true
}

/** File > Save a copy: downloads the score as .mscz */
export function downloadScore(): void {
    const s = currentScore()
    if (!s) {
        return
    }
    const url = URL.createObjectURL(new Blob([saveMscz(s, msczName()) as Uint8Array<ArrayBuffer>], { type: 'application/x-musescore' }))
    const a = document.createElement('a')
    a.href = url
    a.download = msczName()
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** the title of the question before closing a modified score (ProjectActionsController::askAboutSavingScore) */
export function saveChangesTitle(): string {
    return arg(qtrc('project', 'Do you want to save changes to the score “%1” before closing?'), (state.current?.name ?? UNTITLED).replace(/\.mscx?z?$/i, ''))
}

/** the answer to the question before closing: save, close without saving, or keep the score open (cancel) */
export async function answerSaveChanges(answer: 'save' | 'dontSave' | 'cancel'): Promise<void> {
    showDialog(null)
    if (answer === 'cancel' || (answer === 'save' && !(await saveScore()))) {
        return
    }
    doCloseScore()
}

/** File > Close; asks first if the score has unsaved changes */
export function closeScore(): void {
    const s = currentScore()
    if (s && isModified(s)) {
        showDialog('saveChanges')
        return
    }
    doCloseScore()
}

function doCloseScore(): void {
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

// unsaved changes: the browser asks before the page is left
window.addEventListener('beforeunload', (e) => {
    const s = currentScore()
    if (s && isModified(s)) {
        e.preventDefault()
    }
})

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
