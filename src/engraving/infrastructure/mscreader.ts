/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/mscreader.h/.cpp
 *
 * Reads .mscz (zip container) and plain .mscx data from memory.
 */

import { unzipSync } from 'fflate'

export interface MscReaderParams {
    /** used to derive the main file name like MuseScore does (<name>.mscx) */
    filePath?: string
    mainFileName?: string
}

function isZip(data: Uint8Array): boolean {
    return data.length > 4 && data[0] === 0x50 && data[1] === 0x4B && data[2] === 0x03 && data[3] === 0x04
}

function completeBaseName(path: string): string {
    const name = path.split(/[\\/]/).pop() ?? ''
    const i = name.lastIndexOf('.')
    return i > 0 ? name.slice(0, i) : name
}

export class MscReader {
    private m_files: Map<string, Uint8Array> | null = null
    private m_xmlData: Uint8Array | null = null

    constructor(data: Uint8Array | ArrayBuffer, private m_params: MscReaderParams = {}) {
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
        if (isZip(bytes)) {
            const files = unzipSync(bytes)
            this.m_files = new Map(Object.entries(files).filter(([name]) => !name.endsWith('/')))
        } else {
            this.m_xmlData = bytes
        }
    }

    isOpened(): boolean { return this.m_files !== null || this.m_xmlData !== null }

    isContainer(): boolean { return this.m_files !== null }

    fileList(): string[] {
        return this.m_files ? [...this.m_files.keys()] : []
    }

    fileExists(fileName: string): boolean {
        return this.m_files ? this.m_files.has(fileName) : false
    }

    fileData(fileName: string): Uint8Array | null {
        if (this.m_files) {
            return this.m_files.get(fileName) ?? null
        }
        // plain mscx: the only file is the score itself
        if (fileName.toLowerCase().endsWith('.mscx')) {
            return this.m_xmlData
        }
        return null
    }

    readStyleFile(): Uint8Array | null {
        return this.fileData('score_style.mss')
    }

    mainFileName(): string {
        if (this.m_params.mainFileName) {
            return this.m_params.mainFileName
        }
        const name = 'score.mscx'
        if (!this.m_params.filePath) {
            return name
        }
        const base = completeBaseName(this.m_params.filePath)
        return base ? base + '.mscx' : name
    }

    readScoreFile(): Uint8Array | null {
        let mscxFileName = this.mainFileName()
        const data = this.fileData(mscxFileName)
        if (!data && this.isContainer()) {
            for (const name of this.fileList()) {
                // mscx file in the root dir
                if (!name.includes('/') && name.toLowerCase().endsWith('.mscx')) {
                    mscxFileName = name
                    break
                }
            }
        }
        return this.fileData(mscxFileName)
    }

    excerptFileNames(): string[] {
        if (!this.isContainer()) {
            return []
        }
        return this.fileList()
            .filter(p => p.startsWith('Excerpts/') && p.toLowerCase().endsWith('.mscx'))
            .map(p => completeBaseName(p))
    }

    readExcerptStyleFile(excerptFileName: string): Uint8Array | null {
        return this.fileData(`Excerpts/${excerptFileName}/${excerptFileName}.mss`)
    }

    readExcerptFile(excerptFileName: string): Uint8Array | null {
        return this.fileData(`Excerpts/${excerptFileName}/${excerptFileName}.mscx`)
    }

    readChordListFile(): Uint8Array | null {
        return this.fileData('chordlist.xml')
    }

    readThumbnailFile(): Uint8Array | null {
        return this.fileData('Thumbnails/thumbnail.png')
    }

    readImageFile(fileName: string): Uint8Array | null {
        return this.fileData('Pictures/' + fileName)
    }

    imageFileNames(): string[] {
        return this.fileList().filter(p => p.startsWith('Pictures/')).map(p => p.slice('Pictures/'.length))
    }
}
