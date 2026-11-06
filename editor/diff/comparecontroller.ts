/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Compare with another score (not in MuseScore; File > Compare with…): the open score (A, with its unsaved changes)
 * and a chosen file (B) in the comparison of shared/diff/diffview.ts (side by side with the differences marked, split screen,
 * overlay), read only. It fills the window in a modal dialog: the score behind it and the shortcuts are inactive;
 * Escape or its close button returns to the score.
 */
import { layoutScore, loadScore, openFileAccept, openScoreFile, saveMscz, scoreBaseName } from '../../src/index'
import { ScoreDiffView } from '../../shared/diff/diffview'
import { fileInputAccept } from '../../shared/fileinput'
import { actionTitle, registerAction } from '../actions/actions'
import { qtrc, stripMnemonic, webtr } from '../i18n'
import { currentMasterScore, hideBusy, scoreViewState, setStatus, showBusy } from '../scoreview'
import { session } from '../session'
import './compare.css'

let s_dialog: HTMLDialogElement | null = null
let s_view: ScoreDiffView | null = null

/** the texts of the comparison: MuseScore's where it has them, else the app's own (webstrings.json) */
function diffTr(text: string): string {
    const action = (code: string): string => stripMnemonic(actionTitle(code))
    switch (text) {
        case 'Zoom in': return action('zoomin')
        case 'Zoom out': return action('zoomout')
        case 'Page view': return action('view-mode-page')
        case 'Continuous view (horizontal)': return action('view-mode-continuous')
        case 'Continuous view (vertical)': return action('view-mode-single')
        case 'Continuous view (fit to window)': return action('view-mode-fit-width')
        case 'Zoom': return qtrc('notation', 'Zoom')
        case 'Cancel': return qtrc('global', 'Cancel')
        case 'Instruments…': return `${qtrc('instruments', 'Instruments')}…`
        default: return webtr(text)
    }
}

function closeComparison(): void {
    s_view?.destroy()
    s_view = null
    const dialog = s_dialog
    s_dialog = null
    if (dialog?.open) {
        dialog.close()
    }
    dialog?.remove()
}

async function compareWith(file: File): Promise<void> {
    const score = currentMasterScore()
    const nameA = session().current?.name ?? 'score.mscz'
    if (!score) {
        return
    }
    await showBusy(webtr('Compare with…').replace('…', '') + ` ${file.name}`, webtr('Laying out the scores…'))
    try {
        // copies: the comparison lays them out in its own way and shows only the compared instruments
        const a = loadScore(saveMscz(score, nameA))
        layoutScore(a)
        const b = await openScoreFile(await file.arrayBuffer(), file.name)
        layoutScore(b)
        closeComparison()
        const dialog = document.createElement('dialog')
        dialog.className = 'compare-dialog'
        dialog.setAttribute('aria-label', webtr('Compare scores'))
        document.body.appendChild(dialog)
        dialog.addEventListener('close', closeComparison)
        s_dialog = dialog
        dialog.showModal()
        s_view = new ScoreDiffView(dialog, { score: a, name: scoreBaseName(nameA) }, { score: b, name: scoreBaseName(file.name) }, {
            tr: diffTr,
            viewMode: scoreViewState().viewMode,
            onClose: closeComparison,
        })
    } catch (e) {
        console.error(e)
        setStatus(`${file.name}: ${(e as Error).message}`, true)
    } finally {
        hideBusy()
    }
}

/** compares the open score with the score at a URL (?compare=) */
export async function compareWithUrl(url: string): Promise<void> {
    const name = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'score.mscz')
    try {
        const res = await fetch(url)
        if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`)
        }
        await compareWith(new File([await res.arrayBuffer()], name))
    } catch (e) {
        setStatus(`${name}: ${(e as Error).message}`, true)
    }
}

const fileInput = document.createElement('input')
fileInput.type = 'file'
fileInput.accept = fileInputAccept(openFileAccept())
fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    fileInput.value = ''
    if (f) {
        void compareWith(f)
    }
})

export function registerCompareActions(): void {
    registerAction('file-compare', {
        run: () => fileInput.click(),
        enabled: () => !!currentMasterScore() && session().view === 'score',
    }, { title: [null, 'Compare with…'], description: [null, 'Compare with another score'], icon: 0 })
}
