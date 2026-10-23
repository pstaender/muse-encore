/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of findPrograms and articulationSounds of
 * src/framework/audio/engine/internal/synthesizers/fluidsynth/soundmapping.h: the soundfont presets of MuseScore 4's
 * Fluid synth for a sound (the tables are generated into soundmappingdata.ts). ChannelMap is not ported: the channels
 * here are the instrument channels of the MIDI renderer (see NotationPlayback.channels()).
 */

import type { PlaybackSetupData } from '../../mpe/playbacksetupdata'
import { SoundCategory, SoundId, SoundSubCategory } from '../../mpe/soundid'
import {
    ACOUSTIC_BASS_GUITAR, ACOUSTIC_GUITAR, BASIC_STRING_SECTION, BASIC_VIOL_SECTION, BRASS, CONTRABASS, CONTRABASS_SECTION,
    ELECTRIC_BASS_GUITAR, ELECTRIC_GUITAR, MAPPINGS_BY_CATEGORY, VIOLA, VIOLA_SECTION, VIOLIN, VIOLIN_SECTION, VIOLONCELLO,
    VIOLONCELLO_SECTION, soundMappingKey, type ArticulationMapping,
} from './soundmappingdata'

/** midi::Program */
export interface MidiProgram {
    bank: number
    program: number
}

const FALLBACK: readonly MidiProgram[] = [{ bank: 0, program: 0 }]

export function findPrograms(setupData: PlaybackSetupData): readonly MidiProgram[] {
    const mapping = MAPPINGS_BY_CATEGORY.get(setupData.category)

    const subCategorySet = setupData.soundSubCategories()
    subCategorySet.delete(SoundSubCategory.Primary)
    subCategorySet.delete(SoundSubCategory.Secondary)

    const search = mapping?.get(soundMappingKey(setupData.soundId(), subCategorySet))
    if (search) {
        return search.map(([bank, program]) => ({ bank, program }))
    }
    return FALLBACK
}

const EMPTY: ArticulationMapping = new Map()

const VIOL_SECTION: readonly string[] = [SoundId.Viol, SoundId.PardessusViol, SoundId.ViolaDaGamba, SoundId.Violone]
const BRASS_SECTION: readonly string[] = [SoundId.Bugle, SoundId.Euphonium, SoundId.Horn, SoundId.Trumpet, SoundId.Trombone, SoundId.Tuba]

/** ArticulationType (its C++ name) -> program */
export function articulationSounds(setupData: PlaybackSetupData): ArticulationMapping {
    const soundId = setupData.soundId()

    if (soundId === SoundId.Guitar) {
        if (setupData.contains(SoundSubCategory.Acoustic)) {
            return ACOUSTIC_GUITAR
        }
        if (setupData.contains(SoundSubCategory.Electric)) {
            return ELECTRIC_GUITAR
        }
    }

    if (soundId === SoundId.BassGuitar) {
        if (setupData.contains(SoundSubCategory.Acoustic)) {
            return ACOUSTIC_BASS_GUITAR
        }
        if (setupData.contains(SoundSubCategory.Electric)) {
            return ELECTRIC_BASS_GUITAR
        }
    }

    const section = setupData.contains(SoundSubCategory.Section)
    switch (soundId) {
    case SoundId.Violin: return section ? VIOLIN_SECTION : VIOLIN
    case SoundId.Viola: return section ? VIOLA_SECTION : VIOLA
    case SoundId.Violoncello: return section ? VIOLONCELLO_SECTION : VIOLONCELLO
    case SoundId.Contrabass: return section ? CONTRABASS_SECTION : CONTRABASS
    }

    if (setupData.category === SoundCategory.Strings) {
        return VIOL_SECTION.includes(soundId) ? BASIC_VIOL_SECTION : BASIC_STRING_SECTION
    }

    if (setupData.category === SoundCategory.Winds && BRASS_SECTION.includes(soundId)) {
        return BRASS
    }

    return EMPTY
}
