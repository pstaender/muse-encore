/*
 * SPDX-License-Identifier: GPL-3.0-only
 * ProjectAutoSaver: saves the modified open score periodically (preferences "Auto save every … min") to the autosaves
 * of IndexedDB (MuseScore: "<file>.mscz.autosave"). The autosave is removed when the score is saved, closed without
 * saving or not modified any more (undone); one that is left over (the page was closed or the browser quit with unsaved
 * changes) is restored at the next start (session.ts: StartupScenario::restoreLastSession) or when the score is opened.
 */
import { isModified, saveMscz } from '../src/index'
import { putAutosave, removeAutosave } from './db'
import { msczFileName } from './files'
import { currentMasterScore, onScoreViewChanged, scoreViewState } from './scoreview'
import { onSessionChanged, session } from './session'
import { onSettingsChanged, settings } from './settings'

let timer: number | undefined
let timerInterval = 0
/** NotationProject::needAutoSave: changed since the last autosave */
let needAutoSave = false
/** the score whose autosave may exist (m_lastProjectPathNeedingAutosave) */
let lastIdNeedingAutosave: string | null = null
let lastScoreVersion = -1
let saving = false

function intervalMs(): number {
    return settings().project.autoSaveInterval * 60000
}

function startTimer(): void {
    clearTimeout(timer)
    timerInterval = intervalMs()
    timer = window.setTimeout(() => void onTrySave(), timerInterval)
}

function stopTimer(): void {
    clearTimeout(timer)
    timer = undefined
}

/** the id of the open score if it is modified (ProjectAutoSaver::update: project->needAutoSave()) */
function idNeedingAutosave(): string | null {
    const s = currentMasterScore()
    const id = session().current?.id ?? null
    return id && s && isModified(s) ? id : null
}

/** ProjectAutoSaver::update: the autosave of a score that is saved, unmodified or closed is removed */
function update(): void {
    const version = scoreViewState().scoreVersion
    if (version !== lastScoreVersion) {
        lastScoreVersion = version
        const s = currentMasterScore()
        needAutoSave = !!s && isModified(s)
    }
    const id = idNeedingAutosave()
    if (lastIdNeedingAutosave && lastIdNeedingAutosave !== id) {
        void removeAutosave(lastIdNeedingAutosave)
    }
    lastIdNeedingAutosave = id
}

/** ProjectAutoSaver::onTrySave */
export async function onTrySave(): Promise<boolean> {
    if (saving) {
        return false
    }
    saving = true
    try {
        const s = currentMasterScore()
        const current = session().current
        if (!s || !current?.id || !needAutoSave || !isModified(s)) {
            return false
        }
        const id = current.id
        const bytes = saveMscz(s, msczFileName(current.name))
        needAutoSave = false
        const ok = await putAutosave(id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
        if (!ok) {
            needAutoSave = true
        } else if (idNeedingAutosave() !== id) {
            // saved or closed meanwhile
            await removeAutosave(id)
        }
        return ok
    } catch (e) {
        console.error('[autosave] failed to save the score', e)
        return false
    } finally {
        saving = false
        if (settings().project.autoSaveEnabled) {
            startTimer()
        }
    }
}

export function initAutoSaver(): void {
    if (settings().project.autoSaveEnabled) {
        startTimer()
    }
    onSettingsChanged(() => {
        const { autoSaveEnabled } = settings().project
        if (!autoSaveEnabled) {
            stopTimer()
        } else if (timer === undefined || timerInterval !== intervalMs()) {
            startTimer()
        }
    })
    onSessionChanged(update)
    onScoreViewChanged(update)
    // a browser tab can be discarded without notice: save when the page is hidden (not in MuseScore)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && settings().project.autoSaveEnabled) {
            void onTrySave()
        }
    })
    update()
}
