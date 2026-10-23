/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The viewer's playback: the events of MuseScore's MIDI renderer (notationPlayback(score).renderMidiEvents(), like the
 * editor's playback controller) on the shared player and synthesizer (shared/playback). The synthesizer
 * (SpessaSynth with MS Basic.sf3) is loaded on the first play; automated browsers (navigator.webdriver) play without
 * sound (the null synthesizer keeps the clock).
 */
import {
    CTRL_PROGRAM, ME_CONTROLLER, ME_NOTEON, ME_PITCHBEND, notationPlayback, type MasterScore, type PlaybackMidiEvent,
} from '../../src/index'
import { Player, type PlayerEvent } from '../../shared/playback/player'
import { NullSynthesizer, type SynthChannelSetup, type Synthesizer } from '../../shared/playback/synthesizer'

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
}

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
    private m_synth: Synthesizer | null = null
    private m_player: Player | null = null
    private m_loading: Promise<Player | null> | null = null
    private m_score: MasterScore | null = null
    private m_rendered: MasterScore | null = null
    private m_frame = 0
    private m_state: ViewerPlaybackState = { playing: false, loading: null, error: '', position: 0, totalTime: 0, tick: 0 }

    /** onChange: the state changed (each frame while playing) */
    constructor(private readonly m_soundFontUrl: string, private readonly m_onChange: (state: ViewerPlaybackState) => void) {}

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
        const totalTime = score ? notationPlayback(score).totalPlayTime() : 0
        this.m_player?.setEvents([], totalTime, new Map())
        this.m_player?.seek(0)
        this.publish({ playing: false, position: 0, tick: 0, totalTime })
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
                const synth = this.m_synth ?? await this.createSynthesizer()
                this.m_synth = synth
                await synth.resume()
                await synth.load(p => this.publish({ loading: p.total ? p.loaded / p.total : NaN }))
                const player = new Player(synth)
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
        const rendered = playback.renderMidiEvents()
        const events: PlayerEvent[] = []
        for (const e of rendered.events) {
            const pe = toPlayerEvent(e)
            if (pe) {
                events.push(pe)
            }
        }
        const setups = new Map<number, SynthChannelSetup>()
        const muted = new Set<number>()
        for (const c of rendered.channels) {
            setups.set(c.channel, { program: c.program, bank: c.bank, drum: c.drum, volume: c.volume, pan: c.pan, reverb: c.reverb, chorus: c.chorus })
            if (c.muted) {
                muted.add(c.channel) // invisible parts are not played
            }
        }
        const position = this.m_state.position
        player.setEvents(events, rendered.totalPlayTime, setups)
        player.mutedChannels = muted
        player.seek(Math.min(position, rendered.totalPlayTime))
        this.m_rendered = score
        this.publish({ totalTime: rendered.totalPlayTime })
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
        player.play()
        this.update()
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
        this.publish({ position, tick: notationPlayback(score).secToTick(position) })
        this.update()
    }

    private update(): void {
        const player = this.m_player
        const score = this.m_score
        if (player && score) {
            const position = player.position()
            this.publish({ playing: player.isPlaying(), position, tick: notationPlayback(score).secToTick(position) })
        }
        if (this.m_state.playing && !this.m_frame) {
            this.m_frame = requestAnimationFrame(() => {
                this.m_frame = 0
                this.update()
            })
        }
    }

    dispose(): void {
        this.m_player?.stop()
        cancelAnimationFrame(this.m_frame)
        this.m_synth?.stopAll(true)
    }
}
