/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The mixer on the synthesizer (MuseScore: the output parameters of the audio engine's tracks): wraps the synthesizer
 * of an app, so the playback, the preview notes and the MIDI input all sound as mixed. A channel's volume is its MIDI
 * volume (CC 7) times the gain of its track, its pan the MIDI pan plus the balance; the note ons of muted channels are
 * not played. The master goes to the output (Synthesizer.setOutputGain).
 *
 * Limits of the MIDI controllers: the volume of a channel can be raised only up to CC 7 = 127 (MuseScore's +12 dB
 * work only on channels with a lower MIDI volume), the balance moves the pan.
 */
import type { LoadProgress, SynthChannelSetup, Synthesizer } from './synthesizer'

const CC_VOLUME = 7
const CC_PAN = 10
const CC_ALL_NOTES_OFF = 123

export interface ChannelMixValues {
    /** the factor of the amplitude */
    gain: number
    /** -1 .. 1 */
    balance: number
    muted: boolean
}

const NEUTRAL: ChannelMixValues = { gain: 1, balance: 0, muted: false }

/**
 * the MIDI volume for a gain: the SoundFont's (and GM's) volume curve is 40 log10(cc / 127) dB, so the amplitude goes
 * with (cc / 127)^2
 */
function mixedVolume(base: number, gain: number): number {
    return Math.max(0, Math.min(127, Math.round(base * Math.sqrt(gain))))
}

function mixedPan(base: number, balance: number): number {
    return Math.max(0, Math.min(127, Math.round(base + balance * 64)))
}

export class MixingSynthesizer implements Synthesizer {
    private m_mix = new Map<number, ChannelMixValues>()
    /** the MIDI volume and pan the channels got (setup and controllers) */
    private m_volume = new Map<number, number>()
    private m_pan = new Map<number, number>()
    private m_master = { gain: 1, balance: 0 }

    constructor(private readonly m_synth: Synthesizer) {}

    get id(): string { return this.m_synth.id }

    /** the synthesizer that sounds */
    inner(): Synthesizer { return this.m_synth }

    private mix(channel: number): ChannelMixValues {
        return this.m_mix.get(channel) ?? NEUTRAL
    }

    /**
     * the mix of the channels (channels not in the map are not changed by the mixer) and of the master; applied now
     * to the sounding channels
     */
    setMix(channels: ReadonlyMap<number, ChannelMixValues>, master: { gain: number; balance: number }): void {
        const old = this.m_mix
        this.m_mix = new Map(channels)
        for (const channel of new Set([...old.keys(), ...channels.keys()])) {
            const before = old.get(channel) ?? NEUTRAL
            const after = this.mix(channel)
            if (after.muted && !before.muted) {
                this.m_synth.controller(channel, CC_ALL_NOTES_OFF, 0)
            }
            if (after.gain !== before.gain && this.m_volume.has(channel)) {
                this.m_synth.controller(channel, CC_VOLUME, mixedVolume(this.m_volume.get(channel)!, after.gain))
            }
            if (after.balance !== before.balance && this.m_pan.has(channel)) {
                this.m_synth.controller(channel, CC_PAN, mixedPan(this.m_pan.get(channel)!, after.balance))
            }
        }
        if (master.gain !== this.m_master.gain || master.balance !== this.m_master.balance) {
            this.m_master = { ...master }
            this.m_synth.setOutputGain(master.gain, master.balance)
        }
    }

    channelMix(channel: number): ChannelMixValues {
        return { ...this.mix(channel) }
    }

    currentTime(): number { return this.m_synth.currentTime() }
    outputLatency(): number { return this.m_synth.outputLatency() }
    load(onProgress?: (p: LoadProgress) => void): Promise<void> { return this.m_synth.load(onProgress) }
    isLoaded(): boolean { return this.m_synth.isLoaded() }
    resume(): Promise<void> { return this.m_synth.resume() }
    isRunning(): boolean { return this.m_synth.isRunning() }

    setupChannel(channel: number, setup: SynthChannelSetup, time?: number): void {
        this.m_volume.set(channel, setup.volume)
        this.m_pan.set(channel, setup.pan)
        const m = this.mix(channel)
        this.m_synth.setupChannel(channel, { ...setup, volume: mixedVolume(setup.volume, m.gain), pan: mixedPan(setup.pan, m.balance) }, time)
    }

    noteOn(channel: number, pitch: number, velocity: number, time?: number): void {
        if (!this.mix(channel).muted) {
            this.m_synth.noteOn(channel, pitch, velocity, time)
        }
    }

    noteOff(channel: number, pitch: number, time?: number): void {
        this.m_synth.noteOff(channel, pitch, time)
    }

    controller(channel: number, controller: number, value: number, time?: number): void {
        if (controller === CC_VOLUME) {
            this.m_volume.set(channel, value)
            value = mixedVolume(value, this.mix(channel).gain)
        } else if (controller === CC_PAN) {
            this.m_pan.set(channel, value)
            value = mixedPan(value, this.mix(channel).balance)
        }
        this.m_synth.controller(channel, controller, value, time)
    }

    programChange(channel: number, program: number, time?: number): void { this.m_synth.programChange(channel, program, time) }
    pitchBend(channel: number, value: number, time?: number): void { this.m_synth.pitchBend(channel, value, time) }
    stopAll(force?: boolean): void { this.m_synth.stopAll(force) }
    setMuted(muted: boolean): void { this.m_synth.setMuted(muted) }
    setOutputGain(gain: number, balance: number): void {
        this.m_master = { gain, balance }
        this.m_synth.setOutputGain(gain, balance)
    }
}
