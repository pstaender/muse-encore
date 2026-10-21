/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/imageStore.h/.cpp: the global store of the image files of the open scores. Images are
 * identified by the MD4 hash of their data; the .mscz keeps them as Pictures/<hash>.<suffix>.
 */

import { CryptographicHash, CryptographicHashAlgorithm } from '../../framework/global/cryptographichash'
import type { Image } from './image'
import type { Score } from './score'

function suffix(path: string): string {
    const name = path.substring(path.lastIndexOf('/') + 1)
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.substring(i + 1) : ''
}

/** muse::io::completeBasename: the file name without the last suffix */
function completeBasename(path: string): string {
    const name = path.substring(path.lastIndexOf('/') + 1)
    const i = name.lastIndexOf('.')
    return i >= 0 ? name.substring(0, i) : name
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false
    }
    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}

//---------------------------------------------------------
//   ImageStoreItem
//---------------------------------------------------------

export class ImageStoreItem {
    private m_references: Image[] = []
    private m_type: string // image type (file extension)
    private m_buffer: Uint8Array = new Uint8Array(0)
    private m_hash: Uint8Array = new Uint8Array(0) // 16 byte md4 hash of _buffer

    constructor(type: string) {
        this.m_type = type
    }

    /** decrement usage count of image in score */
    dereference(image: Image): void {
        const i = this.m_references.indexOf(image)
        if (i >= 0) {
            this.m_references.splice(i, 1)
        }
    }

    /** increment usage count of image in score */
    reference(image: Image): void {
        this.m_references.push(image)
    }

    buffer(): Uint8Array { return this.m_buffer }
    loaded(): boolean { return this.m_buffer.length > 0 }

    /** check if item is used in score (C++ isUsed(Score*) and isUsed()) */
    isUsed(score?: Score): boolean {
        if (score === undefined) {
            return this.m_references.length > 0
        }
        for (const image of this.m_references) {
            if (image.score() === score && image.explicitParent()) {
                return true
            }
        }
        return false
    }

    hashName(): string {
        const hex = '0123456789abcdef'
        let p = ''
        for (let i = 0; i < 16; ++i) {
            p += hex[(this.m_hash[i] >> 4) & 0xf] + hex[this.m_hash[i] & 0xf]
        }
        return p + '.' + this.m_type
    }

    hash(): Uint8Array { return this.m_hash }
    type(): string { return this.m_type }
    set(b: Uint8Array, h: Uint8Array): void {
        this.m_buffer = b
        this.m_hash = h
    }
}

//---------------------------------------------------------
//   ImageStore
//---------------------------------------------------------

function toInt(c: string): number {
    if (c >= '0' && c <= '9') {
        return c.charCodeAt(0) - 48
    }
    return c.charCodeAt(0) - 97 + 10
}

export class ImageStore {
    private m_items: ImageStoreItem[] = []

    getImage(name: string): ImageStoreItem | null {
        name = completeBasename(name)
        if (name.length !== 32) {
            return null
        }
        const hash = new Uint8Array(16)
        for (let i = 0; i < 16; ++i) {
            hash[i] = toInt(name[i * 2]) * 16 + toInt(name[i * 2 + 1])
        }
        for (const item of this.m_items) {
            if (equalBytes(item.hash(), hash)) {
                return item
            }
        }
        // C++ LOGW() << "image not found: " << name
        return null
    }

    add(name: string, ba: Uint8Array): ImageStoreItem {
        const hash = CryptographicHash.hash(ba, CryptographicHashAlgorithm.Md4)
        for (const item of this.m_items) {
            if (equalBytes(item.hash(), hash)) {
                return item
            }
        }
        const item = new ImageStoreItem(suffix(name))
        item.set(ba, hash)
        this.m_items.push(item)
        return item
    }

    clearUnused(): void {
        this.m_items = this.m_items.filter(i => i.isUsed())
    }

    items(): readonly ImageStoreItem[] { return this.m_items }
}

/** this is the global imageStore */
export const imageStore = new ImageStore()
