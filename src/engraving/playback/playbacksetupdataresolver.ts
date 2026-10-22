/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/playback/playbacksetupdataresolver.cpp with the resolvers of playback/mapping
 * (SetupDataResolverBase, Keyboards/Strings/Winds/Percussions/VoicesSetupDataResolver; their tables are generated
 * into mapping/setupdatamaps.ts).
 */

import { PlaybackSetupData } from '../../framework/mpe/playbacksetupdata'
import { SoundCategory, SoundId, SoundSubCategory } from '../../framework/mpe/soundid'
import type { Instrument } from '../dom/instrument'
import {
    KEYBOARDS_SETUP_DATA_MAP, PERCUSSIONS_SETUP_DATA_MAP, STRINGS_SETUP_DATA_MAP, VOICES_SETUP_DATA_MAP, WINDS_SETUP_DATA_MAP,
    type SetupDataMap,
} from './mapping/setupdatamaps'

const PIANO_SETUP_DATA = new PlaybackSetupData(SoundId.Piano, SoundCategory.Keyboards)

function fromMap(map: SetupDataMap, instrument: Instrument): PlaybackSetupData {
    const search = map.get(instrument.id())
    return search ? new PlaybackSetupData(search[0], search[1], search[2]) : new PlaybackSetupData()
}

/** Strings/WindsSetupDataResolver: the sounds with primary and secondary variants */
function withPrimaryOrSecondary(setupData: PlaybackSetupData, soundIds: readonly string[], instrument: Instrument): PlaybackSetupData {
    if (soundIds.includes(setupData.soundId())) {
        setupData.add(instrument.isPrimary() ? SoundSubCategory.Primary : SoundSubCategory.Secondary)
    }
    return setupData
}

function percussionsResolve(instrument: Instrument): PlaybackSetupData {
    const search = PERCUSSIONS_SETUP_DATA_MAP.get(instrument.id())
    if (!search) {
        if (instrument.useDrumset()) {
            return new PlaybackSetupData(SoundId.Drumset, SoundCategory.Percussions)
        }
        return new PlaybackSetupData()
    }
    return new PlaybackSetupData(search[0], search[1], search[2])
}

const RESOLVERS: ((instrument: Instrument) => PlaybackSetupData)[] = [
    i => fromMap(KEYBOARDS_SETUP_DATA_MAP, i),
    i => withPrimaryOrSecondary(fromMap(STRINGS_SETUP_DATA_MAP, i), [SoundId.Violin], i),
    i => withPrimaryOrSecondary(fromMap(WINDS_SETUP_DATA_MAP, i), [SoundId.Flute], i),
    percussionsResolve,
    i => fromMap(VOICES_SETUP_DATA_MAP, i),
]

export class PlaybackSetupDataResolver {
    static resolveSetupData(instrument: Instrument): PlaybackSetupData {
        if (instrument.soundId()) {
            const result = PlaybackSetupData.fromString(instrument.soundId())
            result.supportsSingleNoteDynamics = instrument.singleNoteDynamics()
            result.musicXmlSoundId = instrument.musicXmlId()
            return result
        }

        // SetupDataResolverBase::resolve
        for (const doResolve of RESOLVERS) {
            const result = doResolve(instrument)
            result.supportsSingleNoteDynamics = instrument.singleNoteDynamics()
            result.musicXmlSoundId = instrument.musicXmlId()
            if (result.isValid()) {
                return result
            }
        }

        return PIANO_SETUP_DATA.clone()
    }

    static resolveChordSymbolsSetupData(instrument: Instrument): PlaybackSetupData {
        if (instrument.hasStrings()) {
            return new PlaybackSetupData(SoundId.Guitar, SoundCategory.Strings,
                [SoundSubCategory.Acoustic, SoundSubCategory.Nylon, SoundSubCategory.Plucked])
        }
        return PIANO_SETUP_DATA.clone()
    }

    static resolveMetronomeSetupData(): PlaybackSetupData {
        return new PlaybackSetupData(SoundId.Block, SoundCategory.Percussions, [SoundSubCategory.Wooden])
    }
}
