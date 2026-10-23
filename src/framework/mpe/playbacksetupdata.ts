/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/framework/mpe/playbacksetupdata.h and the string conversions of soundid.h. The enums are their strings
 * (soundid.ts): soundIdFromString etc. map unknown strings to the strings of Unknown/Undefined.
 */

import { SOUND_CATEGORY_STRINGS, SOUND_ID_STRINGS, SOUND_SUBCATEGORY_STRINGS, SoundCategory, SoundId, SoundSubCategory } from './soundid'

export function soundIdFromString(str: string): string {
    if (!str) {
        return SoundId.Undefined
    }
    return SOUND_ID_STRINGS.has(str) ? str : SoundId.Unknown
}

export function soundCategoryFromString(str: string): string {
    return SOUND_CATEGORY_STRINGS.has(str) ? str : SoundCategory.Undefined
}

export function soundSubCategoryFromString(str: string): string {
    if (!str) {
        return SoundSubCategory.Undefined
    }
    return SOUND_SUBCATEGORY_STRINGS.has(str) ? str : SoundSubCategory.Unknown
}

export class PlaybackSetupData {
    id: string
    subCategories: string[]
    musicXmlSoundId: string | null = null
    category: string
    supportsSingleNoteDynamics = false

    constructor(id = '', category: string = SoundCategory.Undefined, subCategories: readonly string[] = []) {
        this.id = id
        this.category = category
        this.subCategories = [...subCategories]
    }

    clone(): PlaybackSetupData {
        const result = new PlaybackSetupData(this.id, this.category, this.subCategories)
        result.musicXmlSoundId = this.musicXmlSoundId
        result.supportsSingleNoteDynamics = this.supportsSingleNoteDynamics
        return result
    }

    soundId(): string {
        return soundIdFromString(this.id)
    }

    /** std::set<SoundSubCategory> */
    soundSubCategories(): Set<string> {
        return new Set(this.subCategories.map(soundSubCategoryFromString))
    }

    contains(subCategory: string): boolean {
        return this.subCategories.includes(subCategory)
    }

    /** TODO(port): C++ inserts it in the order of the enum; the order only matters for toString() */
    add(subCategory: string): void {
        this.subCategories.push(subCategory)
    }

    isValid(): boolean {
        if (this.category === SoundCategory.Undefined) {
            return false
        }
        return !!this.id && this.id !== SoundId.Undefined
    }

    toString(): string {
        return this.subCategories.length
            ? `${this.category}.${this.id}.${this.subCategories.join(':')}`
            : `${this.category}.${this.id}`
    }

    static fromString(str: string): PlaybackSetupData {
        if (!str) {
            return new PlaybackSetupData()
        }
        const subStrList = str.split('.')
        if (subStrList.length < 2) {
            return new PlaybackSetupData()
        }
        const subCategories = subStrList.length === 3 ? subStrList[2].split(':') : []
        return new PlaybackSetupData(subStrList[1], soundCategoryFromString(subStrList[0]), subCategories)
    }
}
