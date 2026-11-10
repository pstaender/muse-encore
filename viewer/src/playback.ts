/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The viewer's playback: the events of MuseScore's MIDI renderer (notationPlayback(score).renderMidiEvents(), like the
 * editor's playback controller) on the shared player and synthesizer (shared/playback). The synthesizer
 * (SpessaSynth with MS Basic.sf3) is loaded on the first play; automated browsers (navigator.webdriver) play without
 * sound (the null synthesizer keeps the clock). The mixer of the score (audiosettings.json, src/playback/mixer.ts) is
 * applied by the mixing synthesizer. The speed (tempo multiplier), the metronome and the count-in work like the
 * editor's (PlaybackController: setTempoMultiplier, the metronome's clicks on their own channel after the score's).
 */
import {
    CTRL_PROGRAM, ME_CONTROLLER, ME_NOTEON, ME_PITCHBEND, notationPlayback, onMixerChanged, synthChannelMix, type MasterScore,
    type PlaybackChannel, type PlaybackMidiEvent,
} from '../../src/index'
import { Player, type PlayerEvent } from '../../shared/playback/player'
import { NullSynthesizer, type SynthChannelSetup, type Synthesizer } from '../../shared/playback/synthesizer'
import { MixingSynthesizer } from '../../shared/playback/mixingsynth'

export interface ViewerPlaybackState {
    playing: boolean
    /** the sounds are being loaded: the progress 0..1 (NaN: unknown), null when not loading */
    loading: number | null
    error: string
    /** seconds */
    position: number
    totalTime: number
    /** the (raw) tick of the play position */
    tick: number
    /** the tempo at the play position (quarter notes per minute, multiplied) */
    tempo: number
    /** the speed: 0.1 .. 3 */
    tempoMultiplier: number
    metronome: boolean
    countIn: boolean
}

/** PlaybackSpeedSlider: 10 % to 300 % */
export const MIN_TEMPO_MULTIPLIER = 0.1
export const MAX_TEMPO_MULTIPLIER = 3

function toPlayerEvent(e: PlaybackMidiEvent): PlayerEvent | null {
    switch (e.type) {
    case ME_NOTEON:
        return { time: e.time, channel: e.channel, type: e.dataB ? 'on' : 'off', a: e.dataA, b: e.dataB }
    case ME_CONTROLLER:
        return { time: e.time, channel: e.channel, type: 'cc', a: e.dataA === CTRL_PROGRAM ? CTRL_PROGRAM : e.dataA, b: e.dataB }
    case ME_PITCHBEND:
        return { time: e.time, channel: e.channel, type: 'pb', a: e.dataA + e.dataB * 128, b: 0 }
    default:
        return null
    }
}

export class ViewerPlayback {
    private m_synth: MixingSynthesizer | null = null
    private m_channels: PlaybackChannel[] = []
    private m_removeMixerListener: (() => void) | null = null
    private m_player: Player | null = null
    private m_loading: Promise<Player | null> | null = null
    private m_score: MasterScore | null = null
    private m_rendered: MasterScore | null = null
    private m_metronomeChannel = -1
    private m_frame = 0
    private m_state: ViewerPlaybackState = {
        playing: false, loading: null, error: '', position: 0, totalTime: 0, tick: 0, tempo: 120, tempoMultiplier: 1, metronome: false, countIn: false,
    }

    /** onChange: the state changed (each frame while playing) */
    constructor(private readonly m_soundFontUrl: string, private readonly m_onChange: (state: ViewerPlaybackState) => void,
                options: { metronome?: boolean; countIn?: boolean } = {}) {
        this.m_state.metronome = !!options.metronome
        this.m_state.countIn = !!options.countIn
    }

    state(): ViewerPlaybackState {
        return this.m_state
    }

    private publish(patch: Partial<ViewerPlaybackState>): void {
        this.m_state = { ...this.m_state, ...patch }
        this.m_onChange(this.m_state)
    }

    /** another score is shown: stopped at its start */
    setScore(score: MasterScore | null): void {
        this.m_player?.stop()
        this.m_score = score
        this.m_rendered = null
        this.m_channels = []
        this.m_metronomeChannel = -1
        this.m_removeMixerListener?.()
        this.m_removeMixerListener = score ? onMixerChanged(score, () => this.updateMix()) : null
        // the speed is the score's (MuseScore: of its notation playback), 100 % when it is opened
        const playback = score ? notationPlayback(score) : null
        playback?.setTempoMultiplier(1)
        const totalTime = playback?.totalPlayTime() ?? 0
        this.m_player?.setEvents([], totalTime, new Map())
        this.m_player?.seek(0)
        this.publish({ playing: false, position: 0, tick: 0, totalTime, tempo: playback?.multipliedTempo(0) ?? 120, tempoMultiplier: 1 })
    }

    private async createSynthesizer(): Promise<Synthesizer> {
        const webAudio = typeof AudioContext !== 'undefined' && typeof AudioWorkletNode !== 'undefined'
        if (!webAudio || navigator.webdriver) {
            return new NullSynthesizer()
        }
        // SpessaSynth (with its worklet) is loaded with the first playback only
        const { SpessaSynthesizer } = await import('../../shared/playback/spessasynth')
        return new SpessaSynthesizer(this.m_soundFontUrl)
    }

    /** the player with the loaded sounds (null: they could not be loaded) */
    private ensurePlayer(): Promise<Player | null> {
        this.m_loading ??= (async () => {
            this.publish({ loading: NaN, error: '' })
            try {
                const synth = this.m_synth ?? new MixingSynthesizer(await this.createSynthesizer())
                this.m_synth = synth
                await synth.resume()
                await synth.load(p => this.publish({ loading: p.total ? p.loaded / p.total : NaN }))
                const player = new Player(synth)
                player.metronomeEnabled = this.m_state.metronome
                player.onEnded = () => this.update()
                this.m_player = player
                this.publish({ loading: null })
                return player
            } catch (e) {
                this.m_loading = null
                this.publish({ loading: null, error: (e as Error).message })
                return null
            }
        })()
        return this.m_loading
    }

    /** renders the events of the score (once per score) */
    private prepareEvents(player: Player): void {
        const score = this.m_score
        if (!score || this.m_rendered === score) {
            return
        }
        const playback = notationPlayback(score)
        playback.setTempoMultiplier(this.m_state.tempoMultiplier)
        const rendered = playback.renderMidiEvents()
        const events: PlayerEvent[] = []
        for (const e of rendered.events) {
            const pe = toPlayerEvent(e)
            if (pe) {
                events.push(pe)
            }
        }
        // the metronome's clicks on the channel after the score's (played only while it is on)
        const metronomeChannel = rendered.channels.reduce((m, c) => Math.max(m, c.channel + 1), 0)
        for (const e of playback.metronomeEvents()) {
            events.push({ time: e.time, channel: metronomeChannel, type: e.dataB ? 'on' : 'off', a: e.dataA, b: e.dataB, metronome: true })
        }
        events.sort((a, b) => a.time - b.time)
        const setups = new Map<number, SynthChannelSetup>()
        const muted = new Set<number>()
        for (const c of rendered.channels) {
            setups.set(c.channel, { program: c.program, bank: c.bank, drum: c.drum, volume: c.volume, pan: c.pan, reverb: c.reverb, chorus: c.chorus })
            if (c.muted) {
                muted.add(c.channel) // invisible parts are not played
            }
        }
        const metronome = playback.metronomeProgram()
        setups.set(metronomeChannel, { program: metronome.program, bank: metronome.bank, drum: metronome.bank >= 128, volume: 100, pan: 64, reverb: 0, chorus: 0 })
        this.m_channels = rendered.channels
        this.m_metronomeChannel = metronomeChannel
        this.updateMix()
        const position = this.m_state.position
        player.setEvents(events, rendered.totalPlayTime, setups)
        player.mutedChannels = muted
        player.seek(Math.min(position, rendered.totalPlayTime))
        this.m_rendered = score
        this.publish({ totalTime: rendered.totalPlayTime, position: player.position() })
    }

    async play(): Promise<void> {
        if (!this.m_score || this.m_state.playing) {
            return
        }
        // the audio output may only start in a user gesture: before anything is awaited
        void this.m_synth?.resume().catch(() => {})
        const player = await this.ensurePlayer()
        if (!player || !this.m_score) {
            return
        }
        this.prepareEvents(player)
        if (player.position() >= player.duration() - 0.01) {
            player.seek(0)
        }
        // the count-in clicks before the player starts (PlaybackController: the count-in of the metronome)
        let delay = 0
        if (this.m_state.countIn) {
            const countIn = notationPlayback(this.m_score).countInEvents(notationPlayback(this.m_score).secToTick(player.position()))
            const synth = player.synth()
            const now = synth.currentTime() + 0.05
            for (const e of countIn.events) {
                if (e.dataB) {
                    synth.noteOn(this.m_metronomeChannel, e.dataA, e.dataB, now + e.time)
                } else {
                    synth.noteOff(this.m_metronomeChannel, e.dataA, now + e.time)
                }
            }
            delay = countIn.duration + 0.05
        }
        player.play(delay)
        this.update()
    }

    /** the speed (tempo multiplier, 0.1 .. 3; PlaybackController::setTempoMultiplier); the play position keeps its tick */
    setTempoMultiplier(multiplier: number): void {
        multiplier = Math.max(MIN_TEMPO_MULTIPLIER, Math.min(MAX_TEMPO_MULTIPLIER, multiplier))
        if (!Number.isFinite(multiplier) || Math.abs(multiplier - this.m_state.tempoMultiplier) < 1e-9) {
            return
        }
        const score = this.m_score
        if (!score) {
            return
        }
        // the play position stays where it is in the score (its times change with the speed)
        const playback = notationPlayback(score)
        const utick = playback.secToPlayedTick(this.m_player?.position() ?? this.m_state.position)
        playback.setTempoMultiplier(multiplier)
        const totalTime = playback.totalPlayTime()
        const position = Math.min(playback.playedTickToSec(utick), totalTime)
        this.m_state = { ...this.m_state, tempoMultiplier: multiplier, position }
        this.m_player?.setDuration(totalTime)
        this.m_rendered = null
        if (this.m_player) {
            this.prepareEvents(this.m_player)
        }
        this.publish({ tempoMultiplier: multiplier, totalTime, position })
        this.update()
    }

    setMetronome(on: boolean): void {
        if (this.m_player) {
            this.m_player.metronomeEnabled = on
        }
        this.publish({ metronome: on })
    }

    setCountIn(on: boolean): void {
        this.publish({ countIn: on })
    }

    pause(): void {
        this.m_player?.pause()
        this.update()
    }

    togglePlay(): void {
        if (this.m_state.playing) {
            this.pause()
        } else {
            void this.play()
        }
    }

    /** back to the start (stopped) */
    stop(): void {
        this.m_player?.stop()
        this.seek(0)
    }

    /** seconds */
    seek(position: number): void {
        const score = this.m_score
        if (!score) {
            return
        }
        position = Math.max(0, Math.min(position, this.m_state.totalTime))
        if (this.m_player) {
            this.m_player.setDuration(this.m_state.totalTime)
            this.m_player.seek(position)
        }
        const tick = notationPlayback(score).secToTick(position)
        this.publish({ position, tick, tempo: notationPlayback(score).multipliedTempo(tick) })
        this.update()
    }

    /** the mixer of the score on the synthesizer channels */
    private updateMix(): void {
        if (this.m_synth && this.m_score) {
            const mix = synthChannelMix(this.m_score, this.m_channels, this.m_metronomeChannel)
            this.m_synth.setMix(mix.channels, mix.master)
        }
    }

    private update(): void {
        const player = this.m_player
        const score = this.m_score
        if (player && score) {
            const position = player.position()
            const playback = notationPlayback(score)
            const tick = playback.secToTick(position)
            this.publish({ playing: player.isPlaying(), position, tick, tempo: playback.multipliedTempo(tick) })
        } else if (score) {
            this.publish({ tempo: notationPlayback(score).multipliedTempo(this.m_state.tick) })
        }
        if (this.m_state.playing && !this.m_frame) {
            this.m_frame = requestAnimationFrame(() => {
                this.m_frame = 0
                this.update()
            })
        }
    }

    dispose(): void {
        this.m_removeMixerListener?.()
        this.m_player?.stop()
        cancelAnimationFrame(this.m_frame)
        this.m_synth?.stopAll(true)
    }
}
