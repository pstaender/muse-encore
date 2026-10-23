/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/infrastructure/mscwriter.h/.cpp
 *
 * Writes into memory: MscIoMode::Zip (an .mscz, via fflate) or MscIoMode::Dir (the files of an unpacked score, as
 * MuseScore writes them for an .mscx). MscIoMode::XmlFile is not ported.
 */

import { strToU8, zipSync, type Zippable } from 'fflate'
import { XmlStreamWriter } from '../../framework/global/serialization/xmlstreamwriter'

export enum MscIoMode {
    Unknown = 0,
    Zip,
    Dir,
}

export interface MscWriterParams {
    /** used to derive the main file name like MuseScore does (<name>.mscx) */
    filePath?: string
    mainFileName?: string
    mode?: MscIoMode
}

function completeBaseName(path: string): string {
    const name = path.split(/[\\/]/).pop() ?? ''
    const i = name.lastIndexOf('.')
    return i > 0 ? name.slice(0, i) : name
}

export class MscWriter {
    private m_files = new Map<string, Uint8Array>()
    /** C++ Meta: the files in the order they were added (for META-INF/container.xml) */
    private m_metaFiles: string[] = []
    private m_metaWritten = false
    private m_closed = false

    constructor(private m_params: MscWriterParams = {}) {}

    params(): MscWriterParams { return this.m_params }

    isOpened(): boolean { return !this.m_closed }

    /** writes the meta data (container.xml) and finishes the container */
    close(): void {
        if (!this.m_closed) {
            this.writeMeta()
            this.m_closed = true
        }
    }

    /** the .mscz (zip) data; closes the writer */
    zipData(): Uint8Array {
        this.close()
        const zippable: Zippable = {}
        for (const [name, data] of this.m_files) {
            zippable[name] = data
        }
        return zipSync(zippable, { level: 6 })
    }

    /** the files (MscIoMode::Dir); closes the writer */
    files(): ReadonlyMap<string, Uint8Array> {
        this.close()
        return this.m_files
    }

    private addFileData(fileName: string, data: Uint8Array | string): boolean {
        this.m_files.set(fileName, typeof data === 'string' ? strToU8(data) : data)
        if (!this.m_metaFiles.includes(fileName)) {
            this.m_metaFiles.push(fileName)
        }
        return true
    }

    writeStyleFile(data: Uint8Array | string): void {
        this.addFileData('score_style.mss', data)
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

    writeScoreFile(data: Uint8Array | string): void {
        this.addFileData(this.mainFileName(), data)
    }

    addExcerptStyleFile(excerptFileName: string, data: Uint8Array | string): void {
        const fileName = excerptFileName + '.mss'
        this.addFileData('Excerpts/' + excerptFileName + '/' + fileName, data)
    }

    addExcerptFile(excerptFileName: string, data: Uint8Array | string): void {
        const fileName = excerptFileName + '.mscx'
        this.addFileData('Excerpts/' + excerptFileName + '/' + fileName, data)
    }

    writeChordListFile(data: Uint8Array | string): void {
        this.addFileData('chordlist.xml', data)
    }

    writeThumbnailFile(data: Uint8Array): void {
        this.addFileData('Thumbnails/thumbnail.png', data)
    }

    addImageFile(fileName: string, data: Uint8Array): void {
        this.addFileData('Pictures/' + fileName, data)
    }

    writeAudioFile(data: Uint8Array): void {
        this.addFileData('audio.ogg', data)
    }

    writeAudioSettingsJsonFile(data: Uint8Array | string, pathPrefix = ''): void {
        this.addFileData(pathPrefix + 'audiosettings.json', data)
    }

    writeViewSettingsJsonFile(data: Uint8Array | string, pathPrefix = ''): void {
        this.addFileData(pathPrefix + 'viewsettings.json', data)
    }

    writeAutomationJsonFile(data: Uint8Array | string): void {
        this.addFileData('automation.json', data)
    }

    private writeMeta(): void {
        if (this.m_metaWritten) {
            return
        }
        this.writeContainer([...this.m_metaFiles])
        this.m_metaWritten = true
    }

    private writeContainer(paths: string[]): void {
        const xml = new XmlStreamWriter()
        xml.startDocument()
        xml.startElement('container')
        xml.startElement('rootfiles')

        for (const f of paths) {
            xml.elementAttrs('rootfile', [['full-path', f]])
        }

        xml.endElement()
        xml.endElement()
        xml.flush()

        this.addFileData('META-INF/container.xml', xml.text())
    }
}
