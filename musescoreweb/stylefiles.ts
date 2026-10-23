/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Format > Load style… / Save style… (NotationActionController::loadStyle / saveStyle with selectStyleFile): .mss
 * files chosen on the computer (the browser has no user styles folder).
 */
import { NotationStyle, notationStyle } from '../src/index'
import { baseName, pickFile, saveToComputer, type FilePickerType } from './files'
import { qtrc } from './i18n'
import { currentScore, scoreChanged } from './scoreview'
import { session } from './session'
import { showMessage } from './components/MessageBox'

const MSS_MIME = 'application/x-musescore-style+xml'

function styleFileType(forLoad: boolean): FilePickerType {
    return {
        description: forLoad ? qtrc('notation', 'MuseScore style files') : qtrc('notation', 'MuseScore style file'),
        accept: { [MSS_MIME]: ['.mss'] },
    }
}

export async function loadStyle(): Promise<void> {
    const score = currentScore()
    if (!score) {
        return
    }
    const file = await pickFile(styleFileType(true))
    if (!file || currentScore() !== score) {
        return
    }
    let data: string
    try {
        data = await file.text()
    } catch (e) {
        await showMessage(qtrc('notation', 'The style file could not be loaded.'), String(e))
        return
    }
    if (!NotationStyle.isValidStyleFile(data)) {
        await showMessage(qtrc('notation', 'The style file could not be loaded.'))
        return
    }
    const style = notationStyle(score)
    if (!style.loadStyle(data, false)) {
        const button = await showMessage(
            qtrc('notation', 'Since this style file is from a different version of MuseScore Studio, your score is not guaranteed to display correctly.'),
            qtrc('notation', 'Click OK to load anyway.'), ['ok', 'cancel'])
        if (button === 'ok') {
            style.loadStyle(data, true)
        }
    }
    scoreChanged(false)
}

export async function saveStyle(): Promise<void> {
    const score = currentScore()
    if (!score) {
        return
    }
    const data = new TextEncoder().encode(notationStyle(score).saveStyle())
    const name = baseName(session().current?.name ?? '') || qtrc('notation', 'MuseScore style file')
    try {
        await saveToComputer(data, `${name}.mss`, styleFileType(false))
    } catch {
        await showMessage(qtrc('notation', 'The style file could not be saved.'), qtrc('notation', 'An error occurred.'))
    }
}
