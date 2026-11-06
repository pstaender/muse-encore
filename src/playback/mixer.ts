/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * The mixer (MuseScore: playback/qml/MuseScore/Playback/mixerpanelmodel.cpp, mixerchannelitem.cpp and the solo/mute
 * logic of PlaybackController::updateSoloMuteStates) on the project's audio settings (audiosettings.json).
 *
 * Simplified for the browser's synthesizer: one strip per track (the instruments of the parts, their chord symbols,
 * the metronome) and the master with volume and balance, mute and solo; no aux channels and sends, sound selection
 * or FX (what the file has of them is kept). The volume and balance of a track are applied to its synthesizer
 * channels (synthChannelMix: MIDI volume and pan), the master's to the output.
 */

import { mtrc } from '../framework/global/translation'
import type { MasterScore } from '../engraving/dom/masterscore'
import type { PlaybackChannel } from '../notation/internal/notationplayback'
import {
    METRONOME_TRACK_ID, chordSymbolsTrackId, isChordSymbolsTrack, projectAudioSettings, trackKey,
    type AudioOutputValues, type InstrumentTrackId, type SoloMuteState,
} from '../project/internal/projectaudiosettings'

export { METRONOME_TRACK_ID, isChordSymbolsTrack, projectAudioSettings, trackKey }
export type { AudioOutputValues, InstrumentTrackId, SoloMuteState }

/** MixerChannelItem::Type (without Aux) */
export type MixerChannelType = 'primaryInstrument' | 'secondaryInstrument' | 'metronome' | 'master'

/** VolumeSlider.qml: from -60 to 12 dB */
export const MIXER_VOLUME_MIN = -60
export const MIXER_VOLUME_MAX = 12
/** MixerBalanceSection.qml: -100 .. 100 = balance * BALANCE_SCALING_FACTOR */
export const BALANCE_SCALING_FACTOR = 100

export interface MixerChannel {
    /** trackKey(trackId); "master" for the master */
    key: string
    type: MixerChannelType
    /** null for the master */
    trackId: InstrumentTrackId | null
    title: string
    volumeDb: number
    /** -1 .. 1 */
    balance: number
    mute: boolean
    solo: boolean
    /** muted because other tracks are soloed (or chord symbols not played): the mute button is disabled */
    forceMute: boolean
}

export const MASTER_CHANNEL_KEY = 'master'

/** the tracks of the score in the order of the mixer (MixerPanelModel::loadItems): instruments, chord symbols, metronome */
export function instrumentTrackIds(score: MasterScore): InstrumentTrackId[] {
    const result: InstrumentTrackId[] = []
    for (const part of score.parts()) {
        const seen = new Set<string>()
        for (const instr of part.instruments().values()) {
            if (!seen.has(instr.id())) {
                seen.add(instr.id())
                result.push({ partId: part.id(), instrumentId: instr.id() })
            }
        }
    }
    for (const part of score.parts()) {
        if (part.hasChordSymbol()) {
            result.push(chordSymbolsTrackId(part.id()))
        }
    }
    result.push(METRONOME_TRACK_ID)
    return result
}

/** PlaybackController::addTrack: the track names */
function trackTitle(score: MasterScore, id: InstrumentTrackId): string {
    if (trackKey(id) === trackKey(METRONOME_TRACK_ID)) {
        return mtrc('playback', 'Metronome')
    }
    const part = score.parts().find(p => p.id() === id.partId)
    if (!part) {
        return ''
    }
    if (isChordSymbolsTrack(id)) {
        return `${mtrc('playback', 'Chords')}.${part.partName()}`
    }
    if (part.instrument().id() === id.instrumentId) {
        return part.partName()
    }
    const instr = [...part.instruments().values()].find(i => i.id() === id.instrumentId)
    return instr ? `(${instr.trackName()})` : ''
}

export interface MixerOptions {
    /** the chord symbols are played (playback setting): otherwise their tracks are force muted */
    playChordSymbols?: boolean
}

/** the solo/mute state of the tracks with the forced mutes (PlaybackController::updateSoloMuteStates) */
function soloMuteStates(score: MasterScore, ids: InstrumentTrackId[], options: MixerOptions): Map<string, SoloMuteState & { forceMute: boolean }> {
    const settings = projectAudioSettings(score)
    const metronome = trackKey(METRONOME_TRACK_ID)
    const hasSolo = ids.some(id => trackKey(id) !== metronome && settings.trackSoloMuteState(id).solo)
    const result = new Map<string, SoloMuteState & { forceMute: boolean }>()
    for (const id of ids) {
        const state = settings.trackSoloMuteState(id)
        if (trackKey(id) === metronome) {
            // the metronome is turned on and off with its button
            result.set(trackKey(id), { mute: false, solo: false, forceMute: false })
            continue
        }
        let forceMute = hasSolo && !state.solo
        if (isChordSymbolsTrack(id) && !forceMute) {
            forceMute = options.playChordSymbols === false
        }
        result.set(trackKey(id), { ...state, forceMute })
    }
    return result
}

/** the strips of the mixer (MixerPanelModel::loadItems), the master last */
export function mixerChannels(score: MasterScore, options: MixerOptions = {}): MixerChannel[] {
    const settings = projectAudioSettings(score)
    const ids = instrumentTrackIds(score)
    const states = soloMuteStates(score, ids, options)
    const result: MixerChannel[] = []
    for (const id of ids) {
        const key = trackKey(id)
        const part = score.parts().find(p => p.id() === id.partId)
        const type: MixerChannelType = key === trackKey(METRONOME_TRACK_ID) ? 'metronome'
            : !part || isChordSymbolsTrack(id) || part.instrument().id() === id.instrumentId ? 'primaryInstrument' : 'secondaryInstrument'
        const state = states.get(key)!
        result.push({ key, type, trackId: id, title: trackTitle(score, id), ...settings.trackOutputValues(id), mute: state.mute, solo: state.solo, forceMute: state.forceMute })
    }
    result.push({
        key: MASTER_CHANNEL_KEY, type: 'master', trackId: null, title: mtrc('playback', 'Master'), ...settings.masterOutputValues(),
        mute: false, solo: false, forceMute: false,
    })
    return result
}

/** changes a strip: volume (dB), balance (-1 .. 1), mute, solo */
export function setMixerChannel(score: MasterScore, key: string, values: Partial<AudioOutputValues & SoloMuteState>): void {
    const settings = projectAudioSettings(score)
    const volumeDb = values.volumeDb !== undefined ? Math.max(MIXER_VOLUME_MIN, Math.min(MIXER_VOLUME_MAX, values.volumeDb)) : undefined
    const balance = values.balance !== undefined ? Math.max(-1, Math.min(1, values.balance)) : undefined
    if (key === MASTER_CHANNEL_KEY) {
        settings.setMasterOutputValues({ volumeDb, balance })
        return
    }
    const id = instrumentTrackIds(score).find(t => trackKey(t) === key)
    if (!id) {
        return
    }
    settings.setTrackOutputValues(id, { volumeDb, balance })
    settings.setTrackSoloMuteState(id, { mute: values.mute, solo: values.solo })
}

/** the mixer changed (also the project needs to be saved) */
export function onMixerChanged(score: MasterScore, listener: () => void): () => void {
    return projectAudioSettings(score).onChanged(listener)
}

/** dB -> the factor of the amplitude */
export function dbToGain(db: number): number {
    return db <= MIXER_VOLUME_MIN ? 0 : Math.pow(10, db / 20)
}

/** the mix of a synthesizer channel */
export interface ChannelMix {
    /** the factor of the amplitude */
    gain: number
    /** -1 .. 1 */
    balance: number
    muted: boolean
}

export interface SynthMix {
    master: { gain: number; balance: number }
    channels: Map<number, ChannelMix>
}

/**
 * the mix of the synthesizer channels of the playback: each channel takes the values of its track
 * (PlaybackChannel.partId/instrumentId); metronomeChannel: the synthesizer channel of the metronome (-1: none)
 */
export function synthChannelMix(score: MasterScore, channels: readonly PlaybackChannel[], metronomeChannel = -1, options: MixerOptions = {}): SynthMix {
    const settings = projectAudioSettings(score)
    const ids = instrumentTrackIds(score)
    const states = soloMuteStates(score, ids, options)
    const result = new Map<number, ChannelMix>()
    for (const c of channels) {
        const id = { partId: c.partId, instrumentId: c.instrumentId }
        const state = states.get(trackKey(id))
        const out = settings.trackOutputValues(id)
        result.set(c.channel, { gain: dbToGain(out.volumeDb), balance: out.balance, muted: !!state && (state.mute || state.forceMute) })
    }
    if (metronomeChannel >= 0) {
        const out = settings.trackOutputValues(METRONOME_TRACK_ID)
        result.set(metronomeChannel, { gain: dbToGain(out.volumeDb), balance: out.balance, muted: false })
    }
    const master = settings.masterOutputValues()
    return { master: { gain: dbToGain(master.volumeDb), balance: master.balance }, channels: result }
}
