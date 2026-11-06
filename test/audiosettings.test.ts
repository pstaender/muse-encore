// SPDX-License-Identifier: GPL-3.0-only
// audiosettings.json (ProjectAudioSettings) and the mixer: MuseScore's format (what MuseScore 4.7.5 writes for
// instrument-names.mscz), the round trip of what the web does not use, solo/mute.
import { describe, expect, test } from 'vitest'
import { strToU8, unzipSync, zipSync } from 'fflate'
import {
    MASTER_CHANNEL_KEY, METRONOME_TRACK_ID, layoutScore, loadScore, mixerChannels, notationPlayback, saveMscz, setMixerChannel,
    synthChannelMix, trackKey, type MasterScore,
} from '../src/index'
import { VTEST, hasSubmodule, openScore } from './helpers'

const audioSettings = (mscz: Uint8Array): string => new TextDecoder().decode(unzipSync(mscz)['audiosettings.json'])
const sortTracks = (json: string): unknown => {
    const o = JSON.parse(json) as { tracks: { partId: string; instrumentId: string }[] }
    o.tracks.sort((a, b) => `${a.partId}/${a.instrumentId}`.localeCompare(`${b.partId}/${b.instrumentId}`))
    return o
}

/** MuseScore 4.7.5: mscore -o out.mscz instrument-names.mscz (the tracks in this order) */
const MUSESCORE_DEFAULT = {
    activeSoundProfile: 'MuseScore Basic',
    aux: [
        {
            out: {
                balance: 0, volumeDb: 0,
                fxChain: { 0: { active: true, chainOrder: 0, unitConfiguration: {}, resourceMeta: { attributes: {}, hasNativeEditorSupport: true, id: 'Muse Reverb', type: 'muse_plugin', vendor: 'Muse' } } },
            },
            soloMuteState: { mute: false, solo: false },
        },
        { out: { balance: 0, fxChain: {}, volumeDb: 0 }, soloMuteState: { mute: false, solo: false } },
    ],
    master: { balance: 0, fxChain: {}, volumeDb: 0 },
    tracks: [
        {
            in: { resourceMeta: { attributes: {}, hasNativeEditorSupport: false, id: 'MS Basic', type: 'fluid_soundfont', vendor: 'Fluid' }, unitConfiguration: {} },
            instrumentId: 'piano', partId: '1', soloMuteState: { mute: false, solo: false },
            out: { auxSends: [{ active: true, signalAmount: 0.30000001192092896 }, { active: true, signalAmount: 0.30000001192092896 }], balance: 0, fxChain: {}, volumeDb: 0 },
        },
        {
            in: { resourceMeta: { attributes: {}, hasNativeEditorSupport: false, id: 'MS Basic', type: 'fluid_soundfont', vendor: 'Fluid' }, unitConfiguration: {} },
            instrumentId: 'metronome', partId: '999', soloMuteState: { mute: false, solo: false },
            out: { balance: 0, fxChain: {}, volumeDb: 0 },
        },
    ],
}

/** the score with its audiosettings.json replaced */
function withAudioSettings(mscz: Uint8Array, json: string): MasterScore {
    const files = unzipSync(mscz)
    files['audiosettings.json'] = strToU8(json)
    const score = loadScore(zipSync(files))
    layoutScore(score)
    return score
}

describe.skipIf(!hasSubmodule)('audio settings', () => {
    test('a score without audio settings is saved with the defaults of MuseScore', async () => {
        const score = await openScore(`${VTEST}/instrument-names.mscz`)
        const json = audioSettings(saveMscz(score))
        expect(sortTracks(json)).toEqual(sortTracks(JSON.stringify(MUSESCORE_DEFAULT)))
        // Qt's format: 4 spaces, sorted keys, empty objects on two lines
        expect(json).toContain('\n    "activeSoundProfile": "MuseScore Basic",\n')
        expect(json).toContain('"attributes": {\n')
        expect(json.endsWith('}\n')).toBe(true)
    })

    test('the mixer values are saved and read; what the web does not use is kept', async () => {
        const original = saveMscz(await openScore(`${VTEST}/instrument-names.mscz`))
        const settings = JSON.parse(audioSettings(original)) as typeof MUSESCORE_DEFAULT & { future?: unknown }
        // a Muse Sounds track, an FX and a key of a newer version
        const piano = settings.tracks.find(t => t.instrumentId === 'piano')!
        piano.in.resourceMeta = { attributes: { museUID: '123', playbackSetupData: 'keyboards.piano' }, hasNativeEditorSupport: true, id: '123', type: 'muse_sampler_sound_pack', vendor: 'MuseSounds' }
        piano.out.auxSends![0].signalAmount = 0.5
        settings.future = { x: [1, 2] }
        const score = withAudioSettings(original, JSON.stringify(settings))

        const pianoKey = mixerChannels(score).find(c => c.trackId?.instrumentId === 'piano')!.key
        setMixerChannel(score, pianoKey, { volumeDb: -6.5, balance: -0.25, mute: true })
        setMixerChannel(score, MASTER_CHANNEL_KEY, { volumeDb: 3 })
        const saved = JSON.parse(audioSettings(saveMscz(score))) as typeof settings
        const savedPiano = saved.tracks.find(t => t.instrumentId === 'piano')!
        expect(savedPiano.out.volumeDb).toBe(-6.5)
        expect(savedPiano.out.balance).toBe(-0.25)
        expect(savedPiano.soloMuteState).toEqual({ mute: true, solo: false })
        expect(savedPiano.in).toEqual(piano.in)
        expect(savedPiano.out.auxSends![0].signalAmount).toBe(0.5)
        expect(saved.master.volumeDb).toBe(3)
        expect(saved.future).toEqual({ x: [1, 2] })

        const reloaded = withAudioSettings(original, JSON.stringify(saved))
        const strip = mixerChannels(reloaded).find(c => c.key === pianoKey)!
        expect([strip.volumeDb, strip.balance, strip.mute, strip.solo]).toEqual([-6.5, -0.25, true, false])
    })

    test('the strips: instruments, chord symbols, metronome, master; solo mutes the others', async () => {
        const score = await openScore(`${VTEST}/instrument-names-2.mscz`)
        const strips = mixerChannels(score)
        expect(strips.at(-1)!.type).toBe('master')
        expect(strips.at(-2)!.key).toBe(trackKey(METRONOME_TRACK_ID))
        const instruments = strips.filter(s => s.type === 'primaryInstrument')
        expect(instruments.length).toBe(score.parts().length)
        expect(instruments.map(s => s.title)).toEqual(score.parts().map(p => p.partName()))

        const channels = notationPlayback(score).channels()
        setMixerChannel(score, instruments[0].key, { solo: true })
        const mix = synthChannelMix(score, channels, 99)
        for (const c of channels) {
            expect(mix.channels.get(c.channel)!.muted).toBe(c.partId !== instruments[0].trackId!.partId)
        }
        // the metronome is not muted by a solo
        expect(mix.channels.get(99)!.muted).toBe(false)
        expect(mixerChannels(score).filter(s => s.forceMute).length).toBe(instruments.length - 1)
    })

    test('volume and balance of the tracks', async () => {
        const score = await openScore(`${VTEST}/instrument-names.mscz`)
        const [piano] = mixerChannels(score)
        setMixerChannel(score, piano.key, { volumeDb: -20, balance: 2 })
        const mix = synthChannelMix(score, notationPlayback(score).channels())
        const m = [...mix.channels.values()][0]
        expect(m.gain).toBeCloseTo(0.1, 5)
        expect(m.balance).toBe(1) // clamped
        setMixerChannel(score, piano.key, { volumeDb: -100 })
        expect([...synthChannelMix(score, notationPlayback(score).channels()).channels.values()][0].gain).toBe(0)
    })
})
