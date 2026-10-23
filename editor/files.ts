/*
 * SPDX-License-Identifier: GPL-3.0-only
 * Files on the computer: file names of saved scores, writing .mscz files (File System Access API where the browser has
 * it, otherwise a download) and choosing files to open (with a handle, so "Save" can write the file back).
 */

import { scoreBaseName } from '../src/index'

// the File System Access API is not in TypeScript's DOM library yet
export interface FilePickerType {
    description: string
    accept: Record<string, string[]>
}
interface FsWindow {
    showSaveFilePicker?: (options: { suggestedName?: string; types?: FilePickerType[] }) => Promise<FileSystemFileHandle>
    showOpenFilePicker?: (options: { types?: FilePickerType[]; multiple?: boolean }) => Promise<FileSystemFileHandle[]>
}
interface PermissionHandle {
    queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

const fsWindow = (): FsWindow => (typeof window === 'undefined' ? {} : window as unknown as FsWindow)

/**
 * the name of a score without the extension of a MuseScore file or an imported file (MuseScore shows file names like
 * this)
 */
export function baseName(name: string): string {
    return scoreBaseName(name)
}

/**
 * The .mscz file name for a name the user typed (Save as) or a score's name: characters that are not allowed in file
 * names are replaced; `addition` is added before the extension (" - copy", like OpenSaveProjectScenario::askLocalPath).
 */
export function msczFileName(name: string, addition = ''): string {
    // eslint-disable-next-line no-control-regex
    const base = baseName(name.trim()).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim() || 'Untitled score'
    return `${base}${addition}.mscz`
}

/** a MuseScore file that can be written back as .mscz */
export function isMsczName(name: string): boolean {
    return /\.mscz$/i.test(name)
}

export function canPickFiles(): boolean {
    return typeof fsWindow().showSaveFilePicker === 'function'
}

const MSCZ_TYPE: FilePickerType = { description: 'MuseScore file', accept: { 'application/x-musescore': ['.mscz'] } }

function download(bytes: Uint8Array, fileName: string, mimeType: string): void {
    const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * "Save to computer": asks where to save the file (showSaveFilePicker) and writes it; without the File System Access
 * API the file is downloaded. Resolves to null if the user cancelled, otherwise with the file's handle (if there is one).
 */
export async function saveToComputer(bytes: Uint8Array, fileName: string, type: FilePickerType = MSCZ_TYPE):
    Promise<{ handle?: FileSystemFileHandle } | null> {
    const mimeType = Object.keys(type.accept)[0] ?? 'application/octet-stream'
    const picker = fsWindow().showSaveFilePicker
    if (!picker) {
        download(bytes, fileName, mimeType)
        return {}
    }
    let handle: FileSystemFileHandle
    try {
        handle = await picker.call(window, { suggestedName: fileName, types: [type] })
    } catch (e) {
        if ((e as Error).name === 'AbortError') {
            return null
        }
        // e.g. not allowed in this context: download instead
        console.warn('showSaveFilePicker failed', e)
        download(bytes, fileName, mimeType)
        return {}
    }
    if (!(await writeFile(handle, bytes))) {
        throw new Error(`could not write ${handle.name}`)
    }
    return { handle }
}

/** writes a file the user chose before (asks for the permission if needed); false if that is not possible */
export async function writeFile(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<boolean> {
    try {
        const h = handle as FileSystemFileHandle & PermissionHandle
        if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
            if (!h.requestPermission || (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') {
                return false
            }
        }
        const w = await handle.createWritable()
        await w.write(bytes as Uint8Array<ArrayBuffer>)
        await w.close()
        return true
    } catch (e) {
        console.warn('could not write the file', e)
        return false
    }
}

/**
 * Chooses a score to open with showOpenFilePicker (the handle allows writing it back); null if the API is missing
 * (then the caller uses an <input type="file">) and 'cancel' if the user cancelled.
 */
export async function pickFileToOpen(types: FilePickerType[]): Promise<{ file: File; handle: FileSystemFileHandle } | 'cancel' | null> {
    const picker = fsWindow().showOpenFilePicker
    if (!picker) {
        return null
    }
    try {
        const [handle] = await picker.call(window, {
            types,
        })
        return handle ? { file: await handle.getFile(), handle } : 'cancel'
    } catch (e) {
        if ((e as Error).name === 'AbortError') {
            return 'cancel'
        }
        console.warn('showOpenFilePicker failed', e)
        return null
    }
}

/**
 * Chooses a file of the type to read (IInteractive::selectOpeningFile): showOpenFilePicker, or an <input type="file">
 * without it; null if the user cancelled.
 */
export async function pickFile(type: FilePickerType): Promise<File | null> {
    const picker = fsWindow().showOpenFilePicker
    if (picker) {
        try {
            const [handle] = await picker.call(window, { types: [type] })
            return handle ? await handle.getFile() : null
        } catch (e) {
            if ((e as Error).name === 'AbortError') {
                return null
            }
            console.warn('showOpenFilePicker failed', e)
        }
    }
    return new Promise(resolve => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = Object.values(type.accept).flat().join(',')
        input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
        input.addEventListener('cancel', () => resolve(null))
        input.click()
    })
}
