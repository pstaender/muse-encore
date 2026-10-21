/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/event.h/.cpp (PlayEvent, NPlayEvent, EventsHolder)
 * TODO(port): Event/EventList (MIDI import/export)
 *
 * C++ std::multimap<int, NPlayEvent> is EventMap: events are copied when inserted (value semantics) and kept in the
 * order of their tick, events with equal ticks in the order of insertion (like multimap::insert/emplace/merge).
 */

import type { Harmony } from '../../dom/harmony'
import type { Note } from '../../dom/note'
import { BeatType } from '../../dom/sig'
import {
    CTRL_PORTAMENTO, CTRL_PORTAMENTO_CONTROL, CTRL_PORTAMENTO_TIME_LSB, CTRL_PORTAMENTO_TIME_MSB, ME_CONTROLLER, ME_NOTEON,
    ME_PITCHBEND, ME_TICK1, ME_TICK2, MidiCoreEvent, PitchWheelSpecs,
} from './midicoreevent'
import { MidiInstrumentEffect } from './midiinstrumenteffects'

export class PlayEvent extends MidiCoreEvent {
    protected _tuning = 0.0

    tuning(): number { return this._tuning }
    setTuning(v: number): void { this._tuning = v }
}

export class NPlayEvent extends PlayEvent {
    private _note: Note | null = null
    private _harmony: Harmony | null = null
    private _origin = -1 // size_t(-1)
    private _discard = 0
    private _portamento = false
    private _effect = MidiInstrumentEffect.NONE

    /** C++ NPlayEvent(const MidiCoreEvent&) */
    static fromCoreEvent(e: MidiCoreEvent): NPlayEvent {
        return new NPlayEvent(e.type(), e.channel(), e.dataA(), e.dataB())
    }

    /** C++ NPlayEvent(BeatType): a metronome tick */
    static fromBeatType(beatType: BeatType): NPlayEvent {
        const e = new NPlayEvent()
        e.setType(ME_TICK2)
        e.setVelo(127)
        switch (beatType) {
        case BeatType.DOWNBEAT:
            e.setType(ME_TICK1)
            break
        case BeatType.SIMPLE_STRESSED:
        case BeatType.COMPOUND_STRESSED:
            // use defaults
            break
        case BeatType.SIMPLE_UNSTRESSED:
        case BeatType.COMPOUND_UNSTRESSED:
            e.setVelo(80)
            break
        case BeatType.COMPOUND_SUBBEAT:
            e.setVelo(25)
            break
        case BeatType.SUBBEAT:
            e.setVelo(15)
            break
        }
        return e
    }

    override clone(): NPlayEvent {
        const e = new NPlayEvent(this.type(), this.channel(), this.dataA(), this.dataB())
        e._tuning = this._tuning
        e._note = this._note
        e._harmony = this._harmony
        e._origin = this._origin
        e._discard = this._discard
        e._portamento = this._portamento
        e._effect = this._effect
        return e
    }

    note(): Note | null { return this._note }
    setNote(v: Note | null): void { this._note = v }

    harmony(): Harmony | null { return this._harmony }
    setHarmony(v: Harmony | null): void { this._harmony = v }

    setEffect(effect: MidiInstrumentEffect): void { this._effect = effect }
    effect(): MidiInstrumentEffect { return this._effect }

    getOriginatingStaff(): number { return this._origin }
    setOriginatingStaff(i: number): void { this._origin = i }
    setDiscard(d: number): void { this._discard = d }
    discard(): number { return this._discard }
    isMuted(): boolean {
        //! TODO
        return false
    }
    setPortamento(p: boolean): void { this._portamento = p }
    portamento(): boolean {
        return this._portamento
               || (this.type() === ME_CONTROLLER
                   && (this.controller() === CTRL_PORTAMENTO || this.controller() === CTRL_PORTAMENTO_CONTROL
                       || this.controller() === CTRL_PORTAMENTO_TIME_MSB || this.controller() === CTRL_PORTAMENTO_TIME_LSB))
    }
}

interface EventEntry {
    tick: number
    event: NPlayEvent
}

/** C++ std::multimap<int, NPlayEvent> */
export class EventMap implements Iterable<[number, NPlayEvent]> {
    private m_entries: EventEntry[] = []
    private m_sorted = true

    size(): number { return this.m_entries.length }
    empty(): boolean { return this.m_entries.length === 0 }
    clear(): void {
        this.m_entries = []
        this.m_sorted = true
    }

    /** multimap::emplace / insert: a copy of the event is inserted after the events with the same tick */
    emplace(tick: number, ev: NPlayEvent): void {
        const n = this.m_entries.length
        if (n && this.m_entries[n - 1].tick > tick) {
            this.m_sorted = false
        }
        this.m_entries.push({ tick, event: ev.clone() })
    }

    insert(tick: number, ev: NPlayEvent): void { this.emplace(tick, ev) }

    /** the entries ordered by tick (stable: equal ticks in insertion order) */
    entries(): readonly EventEntry[] {
        if (!this.m_sorted) {
            this.m_entries.sort((a, b) => a.tick - b.tick)
            this.m_sorted = true
        }
        return this.m_entries
    }

    *[Symbol.iterator](): Iterator<[number, NPlayEvent]> {
        for (const e of this.entries()) {
            yield [e.tick, e.event]
        }
    }

    /** index of the first entry with tick >= t */
    lowerBound(t: number): number {
        const e = this.entries()
        let lo = 0
        let hi = e.length
        while (lo < hi) {
            const mid = (lo + hi) >> 1
            if (e[mid].tick < t) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }
        return lo
    }

    /** multimap::find: the first entry with tick t (or null) */
    find(t: number): EventEntry | null {
        const i = this.lowerBound(t)
        const e = this.entries()
        return i < e.length && e[i].tick === t ? e[i] : null
    }

    /** multimap::erase(iterator) */
    erase(entry: EventEntry): void {
        const i = this.m_entries.indexOf(entry)
        if (i >= 0) {
            this.m_entries.splice(i, 1)
        }
    }

    /** muse::findLess: the last entry with a tick < t (or null) */
    findLess(t: number): EventEntry | null {
        if (this.empty()) {
            return null
        }
        const i = this.lowerBound(t)
        return i === 0 ? null : this.entries()[i - 1]
    }

    /** multimap::merge: all events of other are moved to this map */
    merge(other: EventMap): void {
        for (const e of other.entries()) {
            this.emplace(e.tick, e.event)
        }
        other.clear()
    }
}

export class EventsHolder {
    private _channels: EventMap[] = []

    size(): number { return this._channels.length }

    /** C++ operator[]: creates the channels up to idx */
    at(idx: number): EventMap {
        if (this.size() === 0) {
            this._channels.push(new EventMap())
        }
        if (idx >= this.size()) {
            let diff = idx - this.size()
            do {
                this._channels.push(new EventMap())
            } while (diff-- !== 0)
        }
        return this._channels[idx]
    }

    channels(): readonly EventMap[] { return this._channels }

    mergePitchWheelEvents(pitchWheelEvents: EventsHolder): void {
        for (let i = 0; i < this.size(); ++i) {
            const resets: [number, NPlayEvent][] = []
            for (const eventPair of this._channels[i].entries()) {
                const event = eventPair.event
                const tick = eventPair.tick
                if (event.type() === ME_NOTEON && event.velo() !== 0) {
                    const pwEvent = pitchWheelEvents.at(i).findLess(tick)
                    if (pwEvent && pwEvent.event.type() === ME_PITCHBEND) {
                        const specs = new PitchWheelSpecs()
                        const pwReset = new NPlayEvent(ME_PITCHBEND, i, specs.mLimit % 128, Math.trunc(specs.mLimit / 128))
                        pwReset.setOriginatingStaff(pwEvent.event.getOriginatingStaff())
                        let tickForPwReset = 0
                        if (tick - specs.mStep > pwEvent.tick) {
                            tickForPwReset = tick - specs.mStep
                        } else {
                            tickForPwReset = Math.trunc((tick + pwEvent.tick) / 2)
                        }
                        resets.push([tickForPwReset, pwReset])
                    }
                }
            }
            // C++ inserts while iterating: the inserted pitch bend events are before the current position
            for (const [t, e] of resets) {
                this._channels[i].insert(t, e)
            }
            this._channels[i].merge(pitchWheelEvents.at(i))
        }
    }

    fixupMIDI(): void {
        /* track info for each of the 128 possible MIDI notes */
        interface ChannelInfo {
            /* which event the first ME_NOTEON came from */
            event: (NPlayEvent | null)[]
            /* how often is the note on right now? */
            nowPlaying: number[]
        }
        /* track info for each channel */
        const info = new Map<number, ChannelInfo>()
        const channelInfo = (c: number): ChannelInfo => {
            let ci = info.get(c)
            if (!ci) {
                ci = { event: new Array(128).fill(null), nowPlaying: new Array(128).fill(0) }
                info.set(c, ci)
            }
            return ci
        }

        for (const mm of this._channels) {
            for (const entry of mm.entries()) {
                const event = entry.event
                /* ME_NOTEOFF is never emitted, no need to check for it */
                if (event.type() === ME_NOTEON) {
                    const ci = channelInfo(event.channel())
                    let np = ci.nowPlaying[event.pitch()] & 0xff
                    if (event.velo() === 0) {
                        /* already off (should not happen) or still playing? */
                        if (np === 0 || --np > 0) {
                            event.setDiscard(1)
                        } else {
                            /* hoist NOTEOFF to same track as NOTEON */
                            event.setOriginatingStaff(ci.event[event.pitch()]!.getOriginatingStaff())
                        }
                    } else {
                        if (++np > 1) {
                            /* restrike, possibly on different track */
                            event.setDiscard(ci.event[event.pitch()]!.getOriginatingStaff() + 1)
                        }
                        ci.event[event.pitch()] = event
                    }
                    ci.nowPlaying[event.pitch()] = np
                }
            }
        }
    }
}
