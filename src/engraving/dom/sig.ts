/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/sig.h/.cpp
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { Constants } from '../types/constants'
import { Fraction } from '../types/fraction'

export function ticks_beat(n: number): number {
    return Math.trunc((Constants.DIVISION * 4) / n)
}

function ticks_measure(f: Fraction): number {
    return Math.trunc((Constants.DIVISION * 4 * f.numerator()) / f.denominator())
}

export enum BeatType {
    DOWNBEAT, // 1st beat of measure (rtick == 0)
    COMPOUND_STRESSED, // e.g. eighth-note number 7 in 12/8
    SIMPLE_STRESSED, // e.g. beat 3 in 4/4
    COMPOUND_UNSTRESSED, // e.g. eighth-note numbers 4 or 10 in 12/8
    SIMPLE_UNSTRESSED, // "offbeat" e.g. beat 2 and 4 in 4/4 (i.e. the denominator unit)
    COMPOUND_SUBBEAT, // e.g. any other eighth-note in 12/8 (i.e. the denominator unit)
    SUBBEAT, // does not fall on a beat
}

export class TimeSigFrac extends Fraction {
    static from(f: Fraction): TimeSigFrac { return new TimeSigFrac(f.numerator(), f.denominator()) }

    isCompound(): boolean { return this.numerator() > 3 && this.numerator() % 3 === 0 }
    dUnitTicks(): number { return Math.trunc((4 * Constants.DIVISION) / this.denominator()) }
    ticksPerMeasure(): number { return this.numerator() * this.dUnitTicks() }
    dUnitsPerBeat(): number { return this.isCompound() ? 3 : 1 }
    beatTicks(): number { return this.dUnitTicks() * this.dUnitsPerBeat() }
    beatsPerMeasure(): number { return Math.trunc(this.numerator() / this.dUnitsPerBeat()) }
    isTriple(): boolean { return this.beatsPerMeasure() % 3 === 0 }
    isDuple(): boolean { return this.beatsPerMeasure() % 2 === 0 } // note: always test isTriple() first
    ticksPastDUnit(rtick: number): number { return rtick % this.dUnitTicks() }
    ticksToNextDUnit(rtick: number): number { return this.dUnitTicks() - this.ticksPastDUnit(rtick) }
    ticksPastBeat(rtick: number): number { return rtick % this.beatTicks() }
    ticksToNextBeat(rtick: number): number { return this.beatTicks() - this.ticksPastBeat(rtick) }

    rtick2beatType(rtick: number): BeatType {
        if (rtick === 0) {
            return BeatType.DOWNBEAT // note: only return DOWNBEAT for rtick = 0, not for rtick = measureTicks,
        }
        if (rtick % this.dUnitTicks() !== 0) {
            return BeatType.SUBBEAT
        }
        if (this.isCompound()) {
            if (rtick % this.beatTicks() !== 0) {
                return BeatType.COMPOUND_SUBBEAT
            }
        }
        const beatNum = Math.trunc(rtick / this.beatTicks())
        let stressBeat = 0
        if (this.isTriple()) {
            stressBeat = 3
        } else if (this.isDuple()) {
            stressBeat = 2
        } else {
            stressBeat = Math.trunc((this.numerator() + 1) / 2) // Assumes 5/4 timeSig = (3+2)/4. (The same assumption is used for beaming)
        }
        if (stressBeat && beatNum % stressBeat === 0) {
            return this.isCompound() ? BeatType.COMPOUND_STRESSED : BeatType.SIMPLE_STRESSED
        }
        return this.isCompound() ? BeatType.COMPOUND_UNSTRESSED : BeatType.SIMPLE_UNSTRESSED
    }

    subbeatTicks(level: number): number {
        let subbeatTicks = this.dUnitTicks()
        while (level > 0) {
            subbeatTicks = Math.trunc(subbeatTicks / 2)
            level--
        }
        return subbeatTicks
    }

    maxSubbeatLevel(): number {
        let level = 0
        let subbeatTicks = this.dUnitTicks()
        while (subbeatTicks % 2 === 0) {
            subbeatTicks /= 2
            level++
        }
        return level
    }

    /** returns negative value if not on a well-defined subbeat */
    rtick2subbeatLevel(rtick: number): number {
        let level = 0
        let subbeatTicks = this.dUnitTicks()
        let remainder = rtick % subbeatTicks
        while (remainder !== 0) {
            level++
            if (subbeatTicks % 2 !== 0) {
                return -level // further sub-division would split measure into chunks of unequal length.
            }
            subbeatTicks /= 2
            remainder %= subbeatTicks
        }
        return level
    }

    /** range is exclusive; returns [strongest, dUnitsCrossed, subbeatTick] */
    strongestBeatInRange(rtick1: number, rtick2: number, saveLast = false): [BeatType, number, number] {
        let strongest = BeatType.SUBBEAT
        let dUnitsCrossed = 0
        let subbeatTick = 0
        for (let rtick = rtick1 + this.ticksToNextDUnit(rtick1); rtick < rtick2; rtick += this.dUnitTicks()) {
            dUnitsCrossed++
            const type = this.rtick2beatType(rtick)
            if (type < strongest + (saveLast ? 1 : 0)) { // "<" behaves like "<=" if saveLast is true
                strongest = type
                subbeatTick = rtick
            }
        }
        return [strongest, dUnitsCrossed, subbeatTick]
    }

    /** range is exclusive; returns [level, subbeatTick] */
    strongestSubbeatLevelInRange(rtick1: number, rtick2: number): [number, number] {
        for (let level = 0, subbeatTicks = this.dUnitTicks(); ;) {
            const n = Math.trunc(rtick1 / subbeatTicks)
            const m = Math.trunc((rtick2 - 1) / subbeatTicks) // -1 to make the range exclusive
            if (m > n) {
                return [level, m * subbeatTicks]
            }
            level++
            if (subbeatTicks % 2 !== 0) {
                return [-level, 0] // further sub-division would split measure into chunks of unequal length.
            }
            subbeatTicks /= 2
        }
    }
}

export class SigEvent {
    private m_timesig: TimeSigFrac
    private m_nominal: TimeSigFrac
    private m_bar: number

    constructor(s: Fraction = new Fraction(0, 0), ss?: Fraction, bar = 0) {
        this.m_timesig = TimeSigFrac.from(s)
        this.m_nominal = TimeSigFrac.from(ss ?? s)
        this.m_bar = bar
    }

    valid(): boolean { return this.m_timesig.isValid() }
    timesig(): TimeSigFrac { return this.m_timesig }
    setTimesig(f: Fraction): void { this.m_timesig = TimeSigFrac.from(f) }
    nominal(): TimeSigFrac { return this.m_nominal }
    setNominal(f: Fraction): void { this.m_nominal = TimeSigFrac.from(f) }
    bar(): number { return this.m_bar }
    setBar(val: number): void { this.m_bar = val }
}

export class TimeSigMap extends SortedMap<SigEvent> {
    static readonly DEFAULT_TIME_SIGNATURE = new TimeSigFrac(4, 4)

    addSig(tick: number, ev: Fraction | SigEvent): void {
        this.set(tick, ev instanceof SigEvent ? ev : new SigEvent(ev))
        this.normalize()
    }

    del(tick: number): void {
        this.erase(tick)
        this.normalize()
    }

    clearRange(tick1: number, tick2: number): void {
        const first = this.lowerBound(tick1)
        const last = this.lowerBound(tick2)
        if (first === last) {
            return
        }
        this.eraseRange(first, last)
        this.normalize()
    }

    normalize(): void {
        let tick = 0
        let bar = new Fraction(0, 1)
        let tm = ticks_measure(new TimeSigFrac(4, 4))
        for (let i = 0; i < this.size(); ++i) {
            const e = this.valueAt(i)
            bar = bar.plus(new Fraction(this.keyAt(i) - tick, tm).reduced())
            e.setBar(Math.trunc(bar.numerator() / bar.denominator()))
            tick = this.keyAt(i)
            tm = ticks_measure(e.timesig())
        }
    }

    timesig(tick: number | Fraction): SigEvent {
        const t = tick instanceof Fraction ? tick.ticks() : tick
        if (this.empty()) {
            return new SigEvent(TimeSigMap.DEFAULT_TIME_SIGNATURE)
        }
        let i = this.upperBound(t)
        if (i !== 0) {
            --i
        }
        return this.valueAt(i)
    }

    /** returns [bar, beat, tick] */
    tickValues(t: number): [number, number, number] {
        if (this.empty()) {
            return [0, 0, 0]
        }
        let e = this.upperBound(t)
        if (e === 0) {
            return [0, 0, 0]
        }
        --e
        const ev = this.valueAt(e)
        const delta = t - this.keyAt(e)
        const ticksB = ticks_beat(ev.timesig().denominator()) // ticks in beat
        const ticksM = ticksB * ev.timesig().numerator() // ticks in measure (bar)
        if (ticksM === 0) {
            return [0, 0, 0]
        }
        const bar = ev.bar() + Math.trunc(delta / ticksM)
        const rest = delta % ticksM
        return [bar, Math.trunc(rest / ticksB), rest % ticksB]
    }

    bar2tick(bar: number, beat: number): number {
        let e = 0
        for (; e < this.size(); ++e) {
            if (bar < this.valueAt(e).bar()) {
                break
            }
        }
        if (this.empty() || e === 0) {
            return 0
        }
        --e // current TimeSigMap value
        const ev = this.valueAt(e)
        const ticksB = ticks_beat(ev.timesig().denominator()) // ticks per beat
        const ticksM = ticksB * ev.timesig().numerator() // bar length in ticks
        return this.keyAt(e) + (bar - ev.bar()) * ticksM + ticksB * beat
    }
}
