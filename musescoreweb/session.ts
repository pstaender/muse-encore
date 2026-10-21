/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The app's state and commands: which view is shown (home screen or score), the open score, opening files and
 * stored scores, creating new scores, saving (ProjectActionsController). The React components read the state with
 * useSession().
 */
import { useSyncExternalStore } from 'react'
import {
    createScore, drawPage, endTextEditing, isModified, layoutScore, loadScore, markSaved, markUnsaved, pageCount, pageSize, saveMscz,
    scoreTitle, type MasterScore, type NewScoreOptions,
} from '../src/index'
import {
    addScore, autosaveIds, contentHash, loadAutosave, loadScoreContent, openScoreId, removeAllAutosaves, removeAutosave,
    saveScoreContent, setOpenScoreId, takeLegacyLastFile, updateScore, type ScoreEntry,
} from './db'
import { baseName, isMsczName, msczFileName, pickFileToOpen, saveToComputer, writeFile } from './files'
import { arg, qtrc } from './i18n'
import {
    clearScore, currentScore, fontsReady, handlers, hideBusy, scoreChanged, scoreSaved, setScoreName, setStatus, showBusy, showScore,
    viewShown,
} from './scoreview'

export interface CurrentScore {
    /** the id of its stored entry; null if it could not be stored */
    id: string | null
    /** the file name with extension; for a new score its title */
    name: string
    /** never saved (NotationProject::isNewlyCreated): "Save" asks for a name like "Save as" */
    newlyCreated: boolean
    /** the file on the computer it was opened from or saved to: "Save" writes it back too */
    handle?: FileSystemFileHandle
}

export type SaveChangesAnswer = 'save' | 'dontSave' | 'cancel'

/** the answer of the Save as dialog: the name, and whether the file is also saved on the computer */
export interface SaveAsAnswer {
    name: string
    toComputer: boolean
}

export interface SessionState {
    view: 'home' | 'score'
    /** the open score */
    current: CurrentScore | null
    newScoreDialog: boolean
    /** another dialog of the app; the questions (saveChanges, saveAs, restoreSession) are answered with answerDialog() */
    dialog: 'preferences' | 'about' | 'clearRecent' | 'revertFactory' | 'saveChanges' | 'saveAs' | 'restoreSession' | null
    /** the name proposed by the Save as dialog */
    saveAsName: string
    /** the last error, shown on the home screen */
    error: string | null
}

let state: SessionState = { view: 'home', current: null, newScoreDialog: false, dialog: null, saveAsName: '', error: null }
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

// the questions (IInteractive::question etc.): a dialog whose answer resolves a promise
let answerQuestion: ((answer: unknown) => void) | null = null

function ask<T>(dialog: 'saveChanges' | 'saveAs' | 'restoreSession', patch: Partial<SessionState> = {}): Promise<T> {
    answerQuestion?.(undefined)
    return new Promise<T>((resolve) => {
        answerQuestion = resolve as (answer: unknown) => void
        setState({ ...patch, dialog })
    })
}

/** the answer of the shown question (the dialogs call it when they are closed) */
export function answerDialog(answer: unknown): void {
    const resolve = answerQuestion
    answerQuestion = null
    showDialog(null)
    resolve?.(answer)
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
async function opened(score: Omit<CurrentScore, 'id'>, store: () => Promise<string | null>): Promise<string | null> {
    const current: CurrentScore = { ...score, id: null }
    setState({ current, error: null })
    setView('score')
    const id = await store()
    setOpenScoreId(id)
    if (state.current === current) {
        setState({ current: { ...current, id } })
    }
    return id
}

function loadFileData(data: ArrayBuffer): MasterScore {
    const s = loadScore(data)
    layoutScore(s)
    return s
}

/** a score that was not saved yet (a new score, a restored autosave) is modified from the start */
function unsaved(s: MasterScore): MasterScore {
    markUnsaved(s)
    return s
}

export async function openFileData(name: string, data: ArrayBuffer, source: 'file' | 'url', url?: string, handle?: FileSystemFileHandle): Promise<void> {
    if (!(await closeOpenedScore())) {
        return
    }
    const s = await load(name, () => loadFileData(data))
    if (!s) {
        return
    }
    const id = await opened({ name, newlyCreated: false, handle }, async () => addScore(
        { name, source, url, hash: await contentHash(data), size: data.byteLength, handle, ...entryInfo(s) },
        { data },
    ))
    if (id) {
        // the file opened from the computer replaces unsaved changes of the same score
        await removeAutosave(id)
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
}

export async function openFile(file: File, handle?: FileSystemFileHandle): Promise<void> {
    await openFileData(file.name, await file.arrayBuffer(), 'file', undefined, handle)
}

export async function openUrl(url: string): Promise<void> {
    if (!(await closeOpenedScore())) {
        return
    }
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

/**
 * Opens a score of the home screen; false if it is not stored (any more). Like ProjectActionsController::loadProject,
 * an autosave of the score is opened instead of the saved version (the score is then modified).
 */
export async function openStored(id: string): Promise<boolean> {
    if (state.current?.id === id) {
        setView('score')
        return true
    }
    const stored = await loadScoreContent(id)
    if (!stored) {
        return false
    }
    if (!(await closeOpenedScore())) {
        return true
    }
    const { entry, content } = stored
    let autosave = await loadAutosave(id)
    if (autosave && autosave.time < entry.modified) {
        // older than the saved score (should not happen: saving removes it)
        await removeAutosave(id)
        autosave = null
    }
    // a new score that was never saved is stored as the options it was created with
    const newlyCreated = !('data' in content)
    const s = await load(entry.name, () => {
        if (autosave) {
            return unsaved(loadFileData(autosave.data))
        }
        return 'data' in content ? loadFileData(content.data) : unsaved(createScore(content.options))
    })
    if (!s) {
        return true
    }
    await opened({ name: entry.name, newlyCreated, handle: entry.handle }, async () => {
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
    if (!(await closeOpenedScore())) {
        return
    }
    // a new score is unsaved (NotationProject::markAsNewlyCreated)
    const s = await load(name, () => unsaved(createScore(options)))
    if (!s) {
        return
    }
    const id = await opened({ name, newlyCreated: true }, () => addScore({ name, source: 'new', size: 0, ...entryInfo(s) }, { options }))
    if (id) {
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
}

// ---------------------------------------------------------------------------------
//   saving (ProjectActionsController): "Save" stores the score in this browser (and writes the file back if it was
//   opened from or saved to a file of the computer), "Save as" asks for a name and stores it as a new score,
//   "Save a copy" saves a file on the computer
// ---------------------------------------------------------------------------------

export function canSave(): boolean {
    return !!state.current && !!currentScore()
}

/** ProjectActionsController::saveProjectAt: an edited text is ended first */
function endEditing(s: MasterScore): void {
    if (endTextEditing(s)) {
        scoreChanged(false)
    }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** the score was saved under this id (and name): the open score refers to it, it is not modified any more */
function saved(s: MasterScore, current: CurrentScore, where: string): void {
    setOpenScoreId(current.id)
    setState({ current })
    setScoreName(current.name)
    markSaved(s)
    scoreSaved()
    if (current.id) {
        void removeAutosave(current.id)
        const id = current.id
        void makeThumbnail(s).then(thumbnail => updateScore(id, { thumbnail }))
    }
    setStatus(`${baseName(current.name)} saved ${where}`)
}

/**
 * File > Save (ProjectActionsController::saveProject(SaveMode::Save)): a score that was never saved goes through
 * "Save as"; otherwise it is stored in this browser (a new entry if it is not stored any more) and written back to
 * its file on the computer if there is one.
 */
export async function saveScore(): Promise<boolean> {
    const s = currentScore()
    const current = state.current
    if (!s || !current) {
        return false
    }
    if (current.newlyCreated) {
        return saveScoreAs()
    }
    endEditing(s)
    const bytes = saveMscz(s, msczFileName(current.name))
    // first the file (the permission request needs the user's key press or click)
    let where = 'in this browser'
    if (current.handle && isMsczName(current.handle.name)) {
        if (await writeFile(current.handle, bytes)) {
            where = `in this browser and to ${current.handle.name}`
        } else {
            setStatus(`Could not write ${current.handle.name}`, true)
        }
    }
    const data = toArrayBuffer(bytes)
    const info = { size: data.byteLength, hash: await contentHash(data), ...entryInfo(s) }
    let id = current.id
    if (!id || !(await saveScoreContent(id, data, info))) {
        id = await addScore({ name: current.name, source: 'file', handle: current.handle, ...info }, { data }, true)
        if (!id) {
            setStatus(`Could not save ${current.name}: the browser does not store data for this page`, true)
            return false
        }
    }
    saved(s, { ...current, id }, where)
    return true
}

/** File > Save as: asks for the name (and whether to save to the computer, too) and saves the score as a new score */
export async function saveScoreAs(): Promise<boolean> {
    const current = state.current
    if (!currentScore() || !current) {
        return false
    }
    // ProjectConfiguration::defaultSavingFilePath: the title of a new score, otherwise the file name
    const answer = await ask<SaveAsAnswer | null>('saveAs', { saveAsName: baseName(current.name) })
    if (!answer?.name.trim()) {
        return false
    }
    try {
        return await saveAs(answer.name, answer.toComputer)
    } catch (e) {
        console.error(e)
        setStatus(`Could not save the score: ${(e as Error).message}`, true)
        return false
    }
}

async function saveAs(name: string, toComputer: boolean): Promise<boolean> {
    const s = currentScore()
    const current = state.current
    if (!s || !current) {
        return false
    }
    const fileName = msczFileName(name)
    endEditing(s)
    const bytes = saveMscz(s, fileName)
    let handle: FileSystemFileHandle | undefined
    let where = 'in this browser'
    if (toComputer) {
        const file = await saveToComputer(bytes, fileName)
        if (!file) {
            return false // cancelled
        }
        handle = file.handle
        where = `in this browser and to ${handle?.name ?? 'the downloads'}`
    }
    const data = toArrayBuffer(bytes)
    const info = { size: data.byteLength, hash: await contentHash(data), ...entryInfo(s) }
    let id: string | null = null
    if (current.newlyCreated && current.id) {
        // the entry of a new score becomes the saved score (MuseScore removes the new score's temporary file)
        if (await saveScoreContent(current.id, data, { name: fileName, handle, ...info })) {
            id = current.id
        }
    }
    if (!id) {
        id = await addScore({ name: fileName, source: current.newlyCreated ? 'new' : 'file', handle, ...info }, { data }, true)
    }
    if (!id) {
        if (!toComputer) {
            setStatus(`Could not save ${fileName}: the browser does not store data for this page`, true)
            return false
        }
        // saved on the computer only
        saved(s, { id: null, name: fileName, newlyCreated: false, handle }, `to ${handle?.name ?? 'the downloads'}`)
        return true
    }
    saved(s, { id, name: fileName, newlyCreated: false, handle }, where)
    return true
}

/** File > Save a copy: saves the score on the computer (OpenSaveProjectScenario::askLocalPath: "<name> - copy") */
export async function saveCopy(): Promise<void> {
    const s = currentScore()
    if (!s || !state.current) {
        return
    }
    const fileName = msczFileName(state.current.name, ` - ${qtrc('project/save', 'copy', 'a copy of a file')}`)
    endEditing(s)
    try {
        await saveToComputer(saveMscz(s, fileName), fileName)
    } catch (e) {
        setStatus(`Could not save ${fileName}: ${(e as Error).message}`, true)
    }
}

// ---------------------------------------------------------------------------------
//   closing
// ---------------------------------------------------------------------------------

/** the title of the question before closing a modified score (ProjectActionsController::askAboutSavingScore) */
export function saveChangesTitle(): string {
    return arg(qtrc('project', 'Do you want to save changes to the score “%1” before closing?'), baseName(state.current?.name ?? UNTITLED))
}

/**
 * ProjectActionsController::closeOpenedProject: asks before a modified score is closed (Save / Don't save / Cancel);
 * false if it stays open
 */
async function closeOpenedScore(goToHome = false): Promise<boolean> {
    if (!state.current) {
        return true
    }
    const s = currentScore()
    if (s && isModified(s)) {
        const answer = await ask<SaveChangesAnswer | undefined>('saveChanges')
        if (!answer || answer === 'cancel' || (answer === 'save' && !(await saveScore()))) {
            return false
        }
    }
    clearScore()
    setOpenScoreId(null)
    // the autosave of a score closed without saving is removed by the autosaver (ProjectAutoSaver::update)
    setState({ current: null })
    if (goToHome) {
        setView('home')
    }
    return true
}

/** File > Close; asks first if the score has unsaved changes */
export function closeScore(): void {
    void closeOpenedScore(true)
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

/** File > Open: with the File System Access API the file can be written back by "Save" */
export async function chooseFile(): Promise<void> {
    const picked = await pickFileToOpen()
    if (picked === null) {
        fileInput.click()
    } else if (picked !== 'cancel') {
        await openFile(picked.file, picked.handle)
    }
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

/**
 * StartupScenario::restoreLastSession: autosaves are left over if the page was closed with unsaved changes (or the
 * browser quit); "Yes" opens the score with its autosave, "No" removes the autosaves.
 */
async function restoreSessionIfNeeded(): Promise<void> {
    const ids = await autosaveIds()
    if (!ids.length) {
        return
    }
    if (await ask<boolean>('restoreSession')) {
        const open = openScoreId()
        if (!open || !ids.includes(open)) {
            setOpenScoreId(ids[0])
        }
    } else {
        await removeAllAutosaves()
    }
}

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
        await restoreSessionIfNeeded()
        const id = openScoreId()
        if (id && !(await openStored(id))) {
            setOpenScoreId(null)
        }
    }
}
