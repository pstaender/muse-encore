/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/project/internal/projectaudiosettings.h/.cpp: the audio settings of a project, audiosettings.json in
 * the .mscz (the mixer: master, aux and track output parameters, the sounds of the tracks, solo/mute).
 *
 * Deviations: the JSON objects are kept as read and only the values the web's mixer uses are changed (volumeDb,
 * balance, soloMuteState), so what MuseScore stores and the web does not use (Muse Sounds resources, FX chains, aux
 * sends, unit configurations) is written back unchanged. The solo/mute state of the master notation
 * (NotationSoloMuteState) is kept in the track objects here; the parts' own solo/mute states are not ported.
 * Tracks that are missing get MuseScore's defaults (PlaybackController::doAddTrack with the MS Basic sound).
 */

import { CHORD_SYMBOLS_INSTRUMENT_ID, METRONOME_INSTRUMENT_ID, METRONOME_PART_ID } from '../../notation/internal/notationplayback'
import type { MasterScore } from '../../engraving/dom/masterscore'

type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export interface JsonObject { [key: string]: JsonValue }

/** engraving::InstrumentTrackId: a part and one of its instruments (or the chord symbols, the metronome) */
export interface InstrumentTrackId {
    partId: string
    instrumentId: string
}

export const METRONOME_TRACK_ID: InstrumentTrackId = { partId: METRONOME_PART_ID, instrumentId: METRONOME_INSTRUMENT_ID }

export function chordSymbolsTrackId(partId: string): InstrumentTrackId {
    return { partId, instrumentId: CHORD_SYMBOLS_INSTRUMENT_ID }
}

export function isChordSymbolsTrack(id: InstrumentTrackId): boolean {
    return id.instrumentId === CHORD_SYMBOLS_INSTRUMENT_ID
}

export function trackKey(id: InstrumentTrackId): string {
    return `${id.partId}\u0000${id.instrumentId}`
}

/** INotationSoloMuteState::SoloMuteState */
export interface SoloMuteState {
    mute: boolean
    solo: boolean
}

/** the values of muse::audio::AudioOutputParams the mixer changes */
export interface AudioOutputValues {
    /** dB: the fader, -60 .. 12 */
    volumeDb: number
    /** -1 (left) .. 1 (right) */
    balance: number
}

/** AUX_CHANNEL_NUM */
const AUX_CHANNEL_NUM = 2
/** PlaybackConfiguration::defaultAuxSendValue of the Fluid synth: 0.30f */
const DEFAULT_AUX_SEND = Math.fround(0.3)
/** the default sound profile of new projects without Muse Sounds (PlaybackConfiguration::basicSoundProfileName) */
const BASIC_SOUND_PROFILE = 'MuseScore Basic'

function isObject(v: JsonValue | undefined): v is JsonObject {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function objectValue(o: JsonObject, key: string): JsonObject {
    const v = o[key]
    if (isObject(v)) {
        return v
    }
    const created: JsonObject = {}
    o[key] = created
    return created
}

/** outputParamsToJson of default AudioOutputParams */
function defaultOutputParams(auxSends: boolean): JsonObject {
    const out: JsonObject = { balance: 0, fxChain: {}, volumeDb: 0 }
    if (auxSends) {
        out.auxSends = Array.from({ length: AUX_CHANNEL_NUM }, () => ({ active: true, signalAmount: DEFAULT_AUX_SEND }))
    }
    return out
}

/** inputParamsToJson of the MS Basic soundfont (SoundProfile::findResource of the basic profile) */
function defaultInputParams(): JsonObject {
    return {
        resourceMeta: { attributes: {}, hasNativeEditorSupport: false, id: 'MS Basic', type: 'fluid_soundfont', vendor: 'Fluid' },
        unitConfiguration: {},
    }
}

/** the aux channels MuseScore creates (aux 1 with Muse Reverb) */
function defaultAux(index: number): JsonObject {
    const out = defaultOutputParams(false)
    if (index === 0) {
        out.fxChain = {
            0: {
                active: true,
                chainOrder: 0,
                resourceMeta: { attributes: {}, hasNativeEditorSupport: true, id: 'Muse Reverb', type: 'muse_plugin', vendor: 'Muse' },
                unitConfiguration: {},
            },
        }
    }
    return { out, soloMuteState: { mute: false, solo: false } }
}

/**
 * QJsonDocument::toJson(Indented): 4 spaces, the keys of objects sorted, empty objects and arrays on two lines, a
 * newline at the end
 */
export function qtJson(value: JsonValue): string {
    const write = (v: JsonValue, indent: string): string => {
        const inner = indent + '    '
        if (Array.isArray(v)) {
            return `[\n${v.map(x => inner + write(x, inner)).join(',\n')}${v.length ? '\n' : ''}${indent}]`
        }
        if (isObject(v)) {
            const keys = Object.keys(v).sort()
            return `{\n${keys.map(k => `${inner}${JSON.stringify(k)}: ${write(v[k], inner)}`).join(',\n')}${keys.length ? '\n' : ''}${indent}}`
        }
        if (typeof v === 'number') {
            return Number.isFinite(v) ? String(v) : 'null'
        }
        return JSON.stringify(v)
    }
    return write(value, '') + '\n'
}

export class ProjectAudioSettings {
    private m_master: JsonObject = defaultOutputParams(false)
    private m_aux: JsonObject[] = []
    private m_tracks = new Map<string, JsonObject>()
    private m_activeSoundProfile = BASIC_SOUND_PROFILE
    /** keys of the root object the port does not know */
    private m_other: JsonObject = {}
    private m_listeners = new Set<() => void>()
    /** changed since loaded or saved (NotationProject: the audio settings make the project need saving) */
    private m_modified = false

    /** read(): false if there is no valid audiosettings.json (the defaults stay) */
    read(data: Uint8Array | string): boolean {
        let root: JsonValue
        try {
            root = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)) as JsonValue
        } catch {
            return false
        }
        if (!isObject(root)) {
            return false
        }
        const { master, aux, tracks, activeSoundProfile, ...other } = root
        this.m_other = other
        this.m_master = isObject(master) ? master : defaultOutputParams(false)
        this.m_aux = Array.isArray(aux) ? aux.filter(isObject) : []
        this.m_tracks.clear()
        if (Array.isArray(tracks)) {
            for (const t of tracks) {
                if (isObject(t)) {
                    this.m_tracks.set(trackKey({ partId: String(t.partId ?? ''), instrumentId: String(t.instrumentId ?? '') }), t)
                }
            }
        }
        // compatMuseSoundsProfileName -> museSoundsProfileName
        const profile = typeof activeSoundProfile === 'string' && activeSoundProfile ? activeSoundProfile : BASIC_SOUND_PROFILE
        this.m_activeSoundProfile = profile === 'Muse Sounds' ? 'MuseSounds' : profile
        return true
    }

    /**
     * write(): the JSON of audiosettings.json; trackIds: the tracks of the score (missing ones get the defaults, tracks
     * of removed instruments are dropped, like PlaybackController::removeTrack)
     */
    write(trackIds: readonly InstrumentTrackId[] | null = null): string {
        if (trackIds) {
            this.syncTracks(trackIds)
        }
        while (this.m_aux.length < AUX_CHANNEL_NUM) {
            this.m_aux.push(defaultAux(this.m_aux.length))
        }
        const root: JsonObject = {
            ...this.m_other,
            master: this.m_master,
            aux: this.m_aux,
            tracks: [...this.m_tracks.values()],
            activeSoundProfile: this.m_activeSoundProfile,
        }
        return qtJson(root)
    }

    /** the tracks are those of the score: missing ones are added with the defaults, others removed */
    syncTracks(trackIds: readonly InstrumentTrackId[]): void {
        const keys = new Set(trackIds.map(trackKey))
        for (const key of [...this.m_tracks.keys()]) {
            if (!keys.has(key)) {
                this.m_tracks.delete(key)
            }
        }
        for (const id of trackIds) {
            this.track(id)
        }
    }

    activeSoundProfile(): string { return this.m_activeSoundProfile }

    isModified(): boolean { return this.m_modified }
    setSaved(): void { this.m_modified = false }

    /** the track object, created with MuseScore's defaults if there is none */
    private track(id: InstrumentTrackId): JsonObject {
        const key = trackKey(id)
        let t = this.m_tracks.get(key)
        if (!t) {
            const metronome = id.instrumentId === METRONOME_INSTRUMENT_ID && id.partId === METRONOME_PART_ID
            t = {
                in: defaultInputParams(),
                instrumentId: id.instrumentId,
                out: defaultOutputParams(!metronome),
                partId: id.partId,
                soloMuteState: { mute: false, solo: false },
            }
            this.m_tracks.set(key, t)
        }
        return t
    }

    private outputValues(out: JsonObject): AudioOutputValues {
        return { volumeDb: Number(out.volumeDb ?? 0) || 0, balance: Number(out.balance ?? 0) || 0 }
    }

    private setOutputValues(out: JsonObject, values: Partial<AudioOutputValues>): boolean {
        let changed = false
        // AudioOutputParams has floats
        if (values.volumeDb !== undefined && Math.fround(values.volumeDb) !== out.volumeDb) {
            out.volumeDb = Math.fround(values.volumeDb)
            changed = true
        }
        if (values.balance !== undefined && Math.fround(values.balance) !== out.balance) {
            out.balance = Math.fround(values.balance)
            changed = true
        }
        return changed
    }

    masterOutputValues(): AudioOutputValues {
        return this.outputValues(this.m_master)
    }

    setMasterOutputValues(values: Partial<AudioOutputValues>): void {
        if (this.setOutputValues(this.m_master, values)) {
            this.notify()
        }
    }

    trackOutputValues(id: InstrumentTrackId): AudioOutputValues {
        const t = this.m_tracks.get(trackKey(id))
        return t && isObject(t.out) ? this.outputValues(t.out) : { volumeDb: 0, balance: 0 }
    }

    setTrackOutputValues(id: InstrumentTrackId, values: Partial<AudioOutputValues>): void {
        if (this.setOutputValues(objectValue(this.track(id), 'out'), values)) {
            this.notify()
        }
    }

    trackSoloMuteState(id: InstrumentTrackId): SoloMuteState {
        const t = this.m_tracks.get(trackKey(id))
        const s = t && isObject(t.soloMuteState) ? t.soloMuteState : {}
        return { mute: s.mute === true, solo: s.solo === true }
    }

    setTrackSoloMuteState(id: InstrumentTrackId, state: Partial<SoloMuteState>): void {
        const s = objectValue(this.track(id), 'soloMuteState')
        let changed = false
        for (const k of ['mute', 'solo'] as const) {
            if (state[k] !== undefined && s[k] !== state[k]) {
                s[k] = state[k]
                changed = true
            }
        }
        if (changed) {
            this.notify()
        }
    }

    /** settingsChanged(): the project needs to be saved */
    onChanged(listener: () => void): () => void {
        this.m_listeners.add(listener)
        return () => this.m_listeners.delete(listener)
    }

    private notify(): void {
        this.m_modified = true
        for (const l of [...this.m_listeners]) {
            l()
        }
    }
}

const s_settings = new WeakMap<MasterScore, ProjectAudioSettings>()

/** the audio settings of a score (NotationProject::audioSettings), the defaults (makeDefault) until read */
export function projectAudioSettings(score: MasterScore): ProjectAudioSettings {
    let s = s_settings.get(score)
    if (!s) {
        s = new ProjectAudioSettings()
        s_settings.set(score, s)
    }
    return s
}
