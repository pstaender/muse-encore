/*
 * SPDX-License-Identifier: GPL-3.0-only
 * The player (MuseScore: muse::audio::IPlayer of the audio engine's sequencer): plays the events of a score on the
 * synthesizer from a position, pauses, seeks, loops between two times. A timer schedules the events a short time
 * ahead on the synthesizer's clock (the browser does not throttle the timers of a tab that plays audio). The
 * controllers (volume, pedal, pitch bend, ...) before the start position are sent at the start ("chasing").
 */
import type { SynthChannelSetup, Synthesizer } from './synthesizer'

export interface PlayerEvent {
    /** seconds from the start of the score */
    time: number
    channel: number
    type: 'on' | 'off' | 'cc' | 'pb'
    a: number
    b: number
    /** the metronome's clicks are played only while it is enabled */
    metronome?: boolean
}

/** MuseScore's program change controller (midicoreevent.h CTRL_PROGRAM) */
const CTRL_PROGRAM = 0x81

/** how far ahead the events are scheduled (seconds) */
const LOOKAHEAD = 0.06
const TIMER_MS = 15
/** the delay of a start after a stop: the events scheduled before the stop are over */
const RESTART_GAP = LOOKAHEAD + 0.02

export class Player {
    private m_events: PlayerEvent[] = []
    private m_setups = new Map<number, SynthChannelSetup>()
    private m_duration = 0
    private m_playing = false
    /** score position (seconds) at m_startAudioTime */
    private m_startPos = 0
    private m_startAudioTime = 0
    private m_position = 0
    private m_next = 0
    private m_timer = 0
    private m_loop: { from: number; to: number } | null = null
    private m_active = new Map<string, { channel: number; pitch: number }>()
    private m_quietUntil = 0
    metronomeEnabled = false
    /** the note ons of these channels are not played (hidden parts, range playback) */
    mutedChannels = new Set<number>()

    /** the end of the score was reached */
    onEnded: (() => void) | null = null

    constructor(private m_synth: Synthesizer) {}

    synth(): Synthesizer { return this.m_synth }

    /** the events (ordered by time), the duration of the score and the sounds of the channels */
    setEvents(events: PlayerEvent[], duration: number, setups: Map<number, SynthChannelSetup>): void {
        const playing = this.m_playing
        const pos = this.position()
        if (playing) {
            this.stopSounds()
        }
        this.m_events = events
        this.m_duration = duration
        this.m_setups = setups
        if (playing) {
            this.start(Math.min(pos, duration), 0)
        } else {
            this.m_position = Math.min(this.m_position, duration)
        }
    }

    duration(): number { return this.m_duration }

    /** the play time before the events are set (seeking while stopped) */
    setDuration(duration: number): void {
        if (!this.m_playing) {
            this.m_duration = duration
        }
    }
    isPlaying(): boolean { return this.m_playing }

    /** the position that is heard now (seconds) */
    position(): number {
        if (!this.m_playing) {
            return this.m_position
        }
        const t = this.m_startPos + (this.m_synth.currentTime() - this.m_startAudioTime) - this.m_synth.outputLatency()
        return Math.max(this.m_startPos, Math.min(t, this.m_duration))
    }

    /** starts at the current position; delay: seconds before it (count-in) */
    play(delay = 0): void {
        if (this.m_playing) {
            return
        }
        this.start(this.m_position, delay)
    }

    pause(): void {
        if (!this.m_playing) {
            return
        }
        this.m_position = this.position()
        this.m_playing = false
        clearInterval(this.m_timer)
        this.stopSounds()
    }

    stop(): void {
        this.pause()
    }

    seek(pos: number): void {
        pos = Math.max(0, Math.min(pos, this.m_duration))
        if (this.m_playing) {
            this.stopSounds()
            this.start(pos, 0)
        } else {
            this.m_position = pos
        }
    }

    setLoop(from: number, to: number): void {
        this.m_loop = to > from ? { from, to } : null
    }

    resetLoop(): void {
        this.m_loop = null
    }

    loop(): { from: number; to: number } | null { return this.m_loop }

    // ---------------------------------------------------------------------------------

    private firstIndexAt(time: number): number {
        let lo = 0
        let hi = this.m_events.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (this.m_events[mid].time < time) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    private start(pos: number, delay: number): void {
        const synth = this.m_synth
        const now = synth.currentTime()
        const audioStart = Math.max(now + delay, this.m_quietUntil) + 0.01
        this.m_startPos = pos
        this.m_startAudioTime = audioStart
        this.m_position = pos
        this.m_playing = true
        this.m_next = this.firstIndexAt(pos)
        this.m_active.clear()

        // the notes scheduled before a stop that was just now are ended before the start (All Sound Off)
        if (this.m_quietUntil > now) {
            for (const channel of this.m_setups.keys()) {
                synth.controller(channel, 120, 0, this.m_quietUntil)
            }
        }

        // the sounds of the channels and the controllers before the start ("chasing")
        for (const [channel, setup] of this.m_setups) {
            synth.setupChannel(channel, setup, audioStart)
        }
        const last = new Map<string, PlayerEvent>()
        for (let i = 0; i < this.m_next; ++i) {
            const e = this.m_events[i]
            if (e.type === 'cc') {
                last.set(`${e.channel}:cc${e.a}`, e)
            } else if (e.type === 'pb') {
                last.set(`${e.channel}:pb`, e)
            }
        }
        for (const e of last.values()) {
            this.send(e, audioStart)
        }

        clearInterval(this.m_timer)
        this.m_timer = window.setInterval(() => this.schedule(), TIMER_MS)
        this.schedule()
    }

    private send(e: PlayerEvent, time: number): void {
        const synth = this.m_synth
        switch (e.type) {
        case 'on': {
            if ((e.metronome && !this.metronomeEnabled) || this.mutedChannels.has(e.channel)) {
                return
            }
            synth.noteOn(e.channel, e.a, e.b, time)
            this.m_active.set(`${e.channel}:${e.a}`, { channel: e.channel, pitch: e.a })
            break
        }
        case 'off':
            synth.noteOff(e.channel, e.a, time)
            this.m_active.delete(`${e.channel}:${e.a}`)
            break
        case 'cc':
            if (e.a === CTRL_PROGRAM) {
                synth.programChange(e.channel, e.b, time)
            } else {
                synth.controller(e.channel, e.a, e.b, time)
            }
            break
        case 'pb':
            synth.pitchBend(e.channel, e.a, time)
            break
        }
    }

    private schedule(): void {
        if (!this.m_playing) {
            return
        }
        const now = this.m_synth.currentTime()
        const until = this.m_startPos + (now + LOOKAHEAD - this.m_startAudioTime)

        for (;;) {
            const loopEnd = this.m_loop ? this.m_loop.to : Infinity
            const end = Math.min(until, loopEnd)
            while (this.m_next < this.m_events.length && this.m_events[this.m_next].time < end) {
                const e = this.m_events[this.m_next++]
                this.send(e, this.m_startAudioTime + (e.time - this.m_startPos))
            }
            if (this.m_loop && until >= this.m_loop.to && this.m_startPos < this.m_loop.to) {
                // back to the start of the loop: the notes end at the end of the loop
                const audioLoopEnd = this.m_startAudioTime + (this.m_loop.to - this.m_startPos)
                for (const n of this.m_active.values()) {
                    this.m_synth.noteOff(n.channel, n.pitch, audioLoopEnd)
                }
                this.m_active.clear()
                this.m_startAudioTime = audioLoopEnd
                this.m_startPos = this.m_loop.from
                this.m_next = this.firstIndexAt(this.m_loop.from)
                continue
            }
            break
        }

        if (!this.m_loop && this.m_next >= this.m_events.length && this.position() >= this.m_duration) {
            this.m_position = this.m_duration
            this.m_playing = false
            clearInterval(this.m_timer)
            this.stopSounds()
            this.onEnded?.()
        }
    }

    /** ends the sounds now; events scheduled before are over after RESTART_GAP */
    private stopSounds(): void {
        const synth = this.m_synth
        for (const n of this.m_active.values()) {
            synth.noteOff(n.channel, n.pitch)
        }
        this.m_active.clear()
        synth.stopAll(true)
        for (const channel of this.m_setups.keys()) {
            synth.controller(channel, 64, 0) // sustain off
            synth.pitchBend(channel, 8192)
        }
        const now = synth.currentTime()
        this.m_quietUntil = now + RESTART_GAP
        window.setTimeout(() => {
            if (!this.m_playing) {
                synth.stopAll(true)
            }
        }, RESTART_GAP * 1000)
    }
}
