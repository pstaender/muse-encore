// SPDX-License-Identifier: GPL-3.0-only
// The mixer on the synthesizer (shared/playback/mixingsynth.ts): MIDI volume and pan of the tracks, muted channels,
// changes while sounding, the master.
import { describe, expect, test } from 'vitest'
import { MixingSynthesizer } from '../shared/playback/mixingsynth'
import { NullSynthesizer } from '../shared/playback/synthesizer'

const SETUP = { program: 0, bank: 0, drum: false, volume: 100, pan: 64, reverb: 0, chorus: 0 }

describe('mixing synthesizer', () => {
    test('volume (40 log10 curve of the MIDI volume) and balance of a channel', () => {
        const inner = new NullSynthesizer()
        const synth = new MixingSynthesizer(inner)
        // -12 dB: amplitude 0.251 = (cc / 100)^2
        synth.setMix(new Map([[3, { gain: Math.pow(10, -12 / 20), balance: -0.5, muted: false }]]), { gain: 1, balance: 0 })
        synth.setupChannel(3, SETUP)
        expect(inner.log.at(-1)).toMatchObject({ type: 'setup', channel: 3 })
        synth.controller(3, 7, 100)
        synth.controller(3, 10, 64)
        const cc = inner.log.filter(e => e.type === 'controller' && e.channel === 3)
        expect(cc.find(e => e.a === 7)!.b).toBe(50)
        expect(cc.find(e => e.a === 10)!.b).toBe(32)
        // other channels are not changed
        synth.controller(4, 7, 100)
        expect(inner.log.at(-1)!.b).toBe(100)
    })

    test('a change of the mix is applied to the channel now; muted channels play no notes', () => {
        const inner = new NullSynthesizer()
        const synth = new MixingSynthesizer(inner)
        synth.setupChannel(1, SETUP)
        synth.noteOn(1, 60, 80)
        expect(inner.noteOnCount).toBe(1)
        synth.setMix(new Map([[1, { gain: 0.25, balance: 0, muted: false }]]), { gain: 1, balance: 0 })
        expect(inner.log.at(-1)).toMatchObject({ type: 'controller', channel: 1, a: 7, b: 50 })
        synth.setMix(new Map([[1, { gain: 0.25, balance: 0, muted: true }]]), { gain: 0.5, balance: 0.25 })
        // all notes off
        expect(inner.log.some(e => e.type === 'controller' && e.channel === 1 && e.a === 123)).toBe(true)
        synth.noteOn(1, 62, 80)
        expect(inner.noteOnCount).toBe(1)
        expect(inner.outputGain).toEqual({ gain: 0.5, balance: 0.25 })
        // the gain is limited by the MIDI volume 127
        synth.setMix(new Map([[1, { gain: 4, balance: 0, muted: false }]]), { gain: 1, balance: 0 })
        expect(inner.log.at(-1)).toMatchObject({ a: 7, b: 127 })
    })
})
