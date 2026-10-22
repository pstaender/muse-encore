/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/tempo.h/.cpp
 * BeatsPerSecond is a plain number (beats per second).
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { lrint } from '../../framework/global/realfn'
import { Constants } from '../types/constants'

export const TEMPO_PRECISION = 6

/** C++ TempoType flags */
export const TempoType = {
    INVALID: 0x0,
    PAUSE: 0x1,
    FIX: 0x2,
    RAMP: 0x4,
} as const

/** Tempo Event */
export class TEvent {
    type: number = TempoType.INVALID
    tempo = 0.0 // beats per second
    pause = 0.0 // pause in seconds
    time = 0.0 // precomputed time for tick in sec

    constructor(bps = 0.0, seconds = 0.0, t: number = TempoType.INVALID) {
        this.type = t
        this.tempo = bps
        this.pause = seconds
        this.time = 0.0
    }

    clone(): TEvent {
        const e = new TEvent(this.tempo, this.pause, this.type)
        e.time = this.time
        return e
    }

    valid(): boolean { return this.type !== TempoType.INVALID }

    equals(other: TEvent): boolean {
        return this.type === other.type && this.tempo === other.tempo && this.pause === other.pause && this.time === other.time
    }
}

/** Tempomap: C++ std::map<int, TEvent> */
export class TempoMap extends SortedMap<TEvent> {
    private m_tempoSN = 1 // serial no to track tempo changes
    private m_tempo = 2.0 // tempo if not using tempo list (beats per second)
    private m_tempoMultiplier = 1.0
    private m_pauses = new Map<number, number>()

    tempoSN(): number { return this.m_tempoSN }

    setPause(tick: number, pause: number): void {
        const e = this.get(tick)
        if (e) {
            e.pause = pause
            e.type |= TempoType.PAUSE
        } else {
            const t = this.tempo(tick)
            this.set(tick, new TEvent(t, pause, TempoType.PAUSE))
        }

        this.m_pauses.set(tick, pause)
        this.normalize()
    }

    setTempo(tick: number, tempo: number): void {
        if (!(tempo > 0.0)) {
            tempo = 0.01
        }
        const e = this.get(tick)
        if (e) {
            e.tempo = tempo
            e.type |= TempoType.FIX
        } else {
            this.set(tick, new TEvent(tempo, 0.0, TempoType.FIX))
        }
        this.normalize()
    }

    /** TempoMap::normalize */
    private normalize(): void {
        let time = 0
        let tick = 0
        let tempo = 2.0
        for (let i = 0; i < this.m_keys.length; ++i) {
            const e = this.m_values[i]
            // entries that represent a pause *only* (not tempo change also)
            // need to be corrected to continue previous tempo
            if (!(e.type & (TempoType.FIX | TempoType.RAMP))) {
                e.tempo = tempo
            }
            const delta = this.m_keys[i] - tick
            time += delta / (Constants.DIVISION * tempo * this.m_tempoMultiplier)
            time += e.pause
            e.time = time
            tick = this.m_keys[i]
            tempo = e.tempo
        }
        ++this.m_tempoSN
    }

    /** insert an event as it is (C++ std::map::insert, used by the PauseMap); no normalization */
    insertEvent(tick: number, e: TEvent): void {
        this.insert(tick, e.clone())
    }

    override clear(): void {
        super.clear()
        this.m_pauses.clear()
        ++this.m_tempoSN
    }

    /** Clears the given range, start tick included, end tick excluded. */
    clearRange(tick1: number, tick2: number): void {
        const first = this.lowerBound(tick1)
        const last = this.lowerBound(tick2)
        if (first === last) {
            return
        }

        if (this.m_pauses.size) {
            for (let i = first; i < last; ++i) {
                this.m_pauses.delete(this.m_keys[i])
            }
        }

        this.eraseRange(first, last)
        ++this.m_tempoSN
    }

    tempo(tick: number): number {
        if (this.empty()) {
            return 2.0
        }

        let i = this.lowerBound(tick)
        if (i === this.m_keys.length) {
            --i
            return this.m_values[i].tempo
        }

        if (this.m_keys[i] === tick) {
            return this.m_values[i].tempo
        }

        if (i === 0) {
            return 2.0
        }

        --i
        return this.m_values[i].tempo
    }

    multipliedTempo(tick: number): number {
        return this.tempo(tick) * this.m_tempoMultiplier
    }

    pauseSecs(tick: number): number {
        return this.m_pauses.get(tick) ?? 0.0
    }

    private del(tick: number): void {
        const i = this.find(tick)
        if (i < 0) {
            return
        }
        const e = this.m_values[i]
        // don't delete event if still being used for pause
        if (e.type & TempoType.PAUSE) {
            e.type = TempoType.PAUSE
        } else {
            this.eraseAt(i)
        }
        this.normalize()
    }

    tempoMultiplier(): number { return this.m_tempoMultiplier }

    setTempoMultiplier(val: number): boolean {
        if (!(val > 0.0)) {
            return false
        }

        if (this.m_tempoMultiplier === val) {
            return false
        }

        this.m_tempoMultiplier = val
        this.normalize()

        return true
    }

    delTempo(tick: number): void {
        this.del(tick)
        ++this.m_tempoSN
    }

    tick2time(tick: number): number {
        let time = 0.0
        let delta = tick
        let tempo = 2.0

        if (!this.empty()) {
            let ptick = 0
            const e = this.lowerBound(tick)
            if (e === this.m_keys.length) {
                const pe = e - 1
                ptick = this.m_keys[pe]
                tempo = this.m_values[pe].tempo
                time = this.m_values[pe].time
            } else if (this.m_keys[e] === tick) {
                ptick = tick
                tempo = this.m_values[e].tempo
                time = this.m_values[e].time
            } else if (e !== 0) {
                const pe = e - 1
                ptick = this.m_keys[pe]
                tempo = this.m_values[pe].tempo
                time = this.m_values[pe].time
            }
            delta = tick - ptick
        }
        time += delta / (Constants.DIVISION * tempo * this.m_tempoMultiplier)
        return time
    }

    time2tick(time: number): number {
        let tick = 0
        let delta = 0.0
        let tempo = 2.0
        void this.m_tempo
        for (let i = 0; i < this.m_keys.length; ++i) {
            const e = this.m_values[i]
            // if in a pause period, wait on previous tick
            if ((time <= e.time) && (time > e.time - e.pause)) {
                delta = (time - (e.time - e.pause) + delta)
                break
            }
            if (e.time >= time) {
                break
            }
            delta = e.time
            tick = this.m_keys[i]
            tempo = e.tempo
        }
        delta = time - delta
        tick += lrint(delta * this.m_tempoMultiplier * Constants.DIVISION * tempo)
        return tick
    }
}
