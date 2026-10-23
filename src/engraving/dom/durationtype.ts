/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/durationtype.h/.cpp (rhythmic splitting not ported)
 */

import { Fraction } from '../types/fraction'
import { DurationType, DurationTypeWithDots, NoteHeadType } from '../types/types'
import { BeatType, type TimeSigFrac } from './sig'
import type { Measure } from './measure'

export const MAX_DOTS = 4

function getDots(base: number, rest: number): [number, number] {
    let dots = 0
    if (base < 16) {
        return [rest, dots]
    }
    if (rest >= base / 2) {
        dots++
        rest -= base / 2
    }
    if (rest >= base / 4) {
        dots++
        rest -= base / 4
    }
    if (rest >= base / 8) {
        dots++
        rest -= base / 8
    }
    if (rest >= base / 16) {
        dots++
        rest -= base / 16
    }
    if (dots > MAX_DOTS) {
        dots = MAX_DOTS
    }
    return [rest, dots]
}

export class TDuration {
    private m_val: DurationType = DurationType.V_INVALID
    private m_dots = 0

    constructor(t?: DurationType | DurationTypeWithDots | Fraction, truncate = false, maxDots = 4,
        maxType: DurationType = DurationType.V_LONG) {
        if (t === undefined) {
            return
        }
        if (t instanceof Fraction) {
            void truncate
            this.setType(maxType) // use maxType to avoid testing all types if you know that l is smaller than a certain DurationType
            this.setDots(maxDots)
            this.truncateToFraction(t, maxDots)
        } else if (t instanceof DurationTypeWithDots) {
            this.m_val = t.type
            this.m_dots = t.dots
        } else {
            this.m_val = t
        }
    }

    clone(): TDuration {
        const d = new TDuration(this.m_val)
        d.m_dots = this.m_dots
        return d
    }

    type(): DurationType { return this.m_val }
    typeWithDots(): DurationTypeWithDots { return new DurationTypeWithDots(this.m_val, this.m_dots) }
    isValid(): boolean { return this.m_val !== DurationType.V_INVALID }
    isZero(): boolean { return this.m_val === DurationType.V_ZERO }
    isMeasure(): boolean { return this.m_val === DurationType.V_MEASURE }

    setType(t: DurationType): void {
        this.m_val = t
        if (this.m_val === DurationType.V_MEASURE) {
            this.m_dots = 0
        }
    }

    dots(): number { return this.m_dots }

    setDots(v: number): void {
        if (v > MAX_DOTS) {
            v = MAX_DOTS
        }
        if (v < 0) {
            v = 0
        }
        this.m_dots = v
    }

    equals(t: TDuration | DurationType): boolean {
        if (t instanceof TDuration) {
            return t.m_val === this.m_val && t.m_dots === this.m_dots
        }
        return t === this.m_val
    }

    setVal(ticks: number): void {
        if (ticks === 0) {
            this.m_val = DurationType.V_MEASURE
        } else {
            const dt = new TDuration()
            for (let i = 0; i < DurationType.V_ZERO; ++i) {
                dt.setType(i as DurationType)
                const t = dt.ticks().ticks()
                if (Math.trunc(ticks / t)) {
                    const remain = ticks % t
                    const SMALLEST_DOT_DIVISOR = 1 << MAX_DOTS
                    if ((t - remain) < (t / SMALLEST_DOT_DIVISOR)) {
                        this.m_val = (i - 1) as DurationType
                        return
                    }
                    this.m_val = i as DurationType
                    this.m_dots = getDots(t, remain)[1]
                    return
                }
            }
            this.m_val = DurationType.V_QUARTER // fallback default value
        }
    }

    ticks(): Fraction {
        let t: Fraction
        switch (this.m_val) {
        case DurationType.V_QUARTER: t = new Fraction(1, 4); break
        case DurationType.V_1024TH: t = new Fraction(1, 1024); break
        case DurationType.V_512TH: t = new Fraction(1, 512); break
        case DurationType.V_256TH: t = new Fraction(1, 256); break
        case DurationType.V_128TH: t = new Fraction(1, 128); break
        case DurationType.V_64TH: t = new Fraction(1, 64); break
        case DurationType.V_32ND: t = new Fraction(1, 32); break
        case DurationType.V_16TH: t = new Fraction(1, 16); break
        case DurationType.V_EIGHTH: t = new Fraction(1, 8); break
        case DurationType.V_HALF: t = new Fraction(1, 2); break
        case DurationType.V_WHOLE: t = new Fraction(1, 1); break
        case DurationType.V_BREVE: t = new Fraction(2, 1); break
        case DurationType.V_LONG: t = new Fraction(4, 1); break
        case DurationType.V_ZERO:
        case DurationType.V_MEASURE:
            return new Fraction(0, 1)
        default:
            return new Fraction(-1, 1)
        }
        let tmp = t
        for (let i = 0; i < this.m_dots; ++i) {
            tmp = tmp.times(new Fraction(1, 2))
            t = t.plus(tmp)
        }
        return t
    }

    headType(): NoteHeadType {
        switch (this.m_val) {
        case DurationType.V_1024TH:
        case DurationType.V_512TH:
        case DurationType.V_256TH:
        case DurationType.V_128TH:
        case DurationType.V_64TH:
        case DurationType.V_32ND:
        case DurationType.V_16TH:
        case DurationType.V_EIGHTH:
        case DurationType.V_QUARTER:
            return NoteHeadType.HEAD_QUARTER
        case DurationType.V_HALF:
            return NoteHeadType.HEAD_HALF
        case DurationType.V_MEASURE:
        case DurationType.V_WHOLE:
            return NoteHeadType.HEAD_WHOLE
        case DurationType.V_BREVE:
        case DurationType.V_LONG:
            return NoteHeadType.HEAD_BREVIS
        default:
            return NoteHeadType.HEAD_QUARTER
        }
    }

    hooks(): number {
        const table = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0]
        return table[this.m_val] ?? 0
    }

    hasStem(): boolean {
        switch (this.m_val) {
        case DurationType.V_1024TH:
        case DurationType.V_512TH:
        case DurationType.V_256TH:
        case DurationType.V_128TH:
        case DurationType.V_64TH:
        case DurationType.V_32ND:
        case DurationType.V_16TH:
        case DurationType.V_EIGHTH:
        case DurationType.V_QUARTER:
        case DurationType.V_HALF:
        case DurationType.V_LONG:
            return true
        default:
            return false
        }
    }

    /** dots are not retained */
    shift(nSteps: number): TDuration {
        const d = new TDuration(this.type())
        d.shiftType(nSteps)
        return d
    }

    shiftRetainDots(nSteps: number, stepDotted = false): TDuration {
        const d = new TDuration(this.type())
        d.setDots(this.m_dots)
        d.shiftType(nSteps, stepDotted)
        return d
    }

    private shiftType(nSteps: number, stepDotted = false): void {
        if (this.m_val === DurationType.V_MEASURE || this.m_val === DurationType.V_INVALID || this.m_val === DurationType.V_ZERO) {
            this.setType(DurationType.V_INVALID)
        } else {
            let newValue: number
            let newDots: number
            if (stepDotted) {
                const roundDownSingleDots = (this.m_dots > 0) ? -1 : 0
                const newValAsNumSingleDotSteps = this.m_val * 2 + roundDownSingleDots + nSteps
                newDots = newValAsNumSingleDotSteps % 2 // odd means there is a dot
                newValue = Math.trunc(newValAsNumSingleDotSteps / 2) + newDots // if new duration has a dot, then that
            } else {
                newDots = this.m_dots
                newValue = this.m_val + nSteps
            }
            if ((newValue < DurationType.V_LONG) || (newValue > DurationType.V_1024TH)
                || ((newValue >= DurationType.V_1024TH) && (newDots >= 1))
                || ((newValue >= DurationType.V_512TH) && (newDots >= 2))
                || ((newValue >= DurationType.V_256TH) && (newDots >= 3))
                || ((newValue >= DurationType.V_128TH) && (newDots >= 4))) {
                this.setType(DurationType.V_INVALID)
            } else {
                this.setType(newValue as DurationType)
                this.setDots(newDots)
            }
        }
    }

    lt(t: TDuration): boolean {
        if (t.m_val < this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots < t.m_dots
    }

    gt(t: TDuration): boolean {
        if (t.m_val > this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots > t.m_dots
    }

    ge(t: TDuration): boolean {
        if (t.m_val > this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots >= t.m_dots
    }

    le(t: TDuration): boolean {
        if (t.m_val < this.m_val) {
            return true
        }
        return t.m_val === this.m_val && this.m_dots <= t.m_dots
    }

    fraction(): Fraction {
        let z = 1
        let n: number
        switch (this.m_val) {
        case DurationType.V_1024TH: n = 1024; break
        case DurationType.V_512TH: n = 512; break
        case DurationType.V_256TH: n = 256; break
        case DurationType.V_128TH: n = 128; break
        case DurationType.V_64TH: n = 64; break
        case DurationType.V_32ND: n = 32; break
        case DurationType.V_16TH: n = 16; break
        case DurationType.V_EIGHTH: n = 8; break
        case DurationType.V_QUARTER: n = 4; break
        case DurationType.V_HALF: n = 2; break
        case DurationType.V_WHOLE: n = 1; break
        case DurationType.V_BREVE: z = 2; n = 1; break
        case DurationType.V_LONG: z = 4; n = 1; break
        case DurationType.V_ZERO: z = 0; n = 1; break
        default: z = 0; n = 0; break // zero+invalid fraction
        }
        const dotN = (1 << (this.m_dots + 1)) - 1
        const dotD = 1 << this.m_dots
        return new Fraction(z * dotN, n * dotD)
    }

    static isValidFraction(f: Fraction): boolean {
        const t = new TDuration()
        t.setType(DurationType.V_LONG)
        t.setDots(4)
        t.truncateToFraction(f, 4)
        return t.isValid() && t.fraction().minus(f).numerator() === 0
    }

    private truncateToFraction(l: Fraction, maxDots: number): void {
        if (this.setDotsToFitFraction(l, this.m_dots)) {
            return
        }
        for (this.shiftType(1); this.isValid(); this.shiftType(1)) {
            if (this.setDotsToFitFraction(l, maxDots)) {
                return // duration fits in l
            }
        }
    }

    private setDotsToFitFraction(l: Fraction, maxDots: number): boolean {
        for (; maxDots >= 0; maxDots--) {
            this.m_dots = maxDots // ensures _dots >= 0 if function returns false.
            if (this.fraction().minus(l).numerator() <= 0) {
                return true // duration fits in l
            }
        }
        return false // doesn't fit by changing dots alone (type needs to be changed too)
    }
}

/**
 * Port of toDurationList(): splits a fraction into a list of durations
 */
export function toDurationList(l: Fraction, useDots: boolean, maxDots = 4, printRestRemains = true): TDuration[] {
    void printRestRemains
    const dList: TDuration[] = []
    if (useDots) {
        for (let dt = new TDuration(DurationType.V_LONG); dt.isValid() && l.numerator() !== 0;) {
            const d = new TDuration(l, true, maxDots, dt.type())
            if (!d.isValid()) {
                break
            }
            dList.push(d)
            l = l.minus(d.fraction())
            dt = d.shift(1)
        }
    } else {
        for (let dt = new TDuration(DurationType.V_LONG); dt.isValid() && l.numerator() !== 0; dt = dt.shift(1)) {
            const f = dt.fraction()
            while (l.ge(f)) {
                dList.push(dt.clone())
                l = l.minus(f)
            }
        }
    }
    return dList
}

/**
 * Port of toRhythmicDurationList()
 *  - l and rtickStart are in local (stretched) time
 *  - returned durations are in local time
 */
export function toRhythmicDurationList(l: Fraction, isRest: boolean, rtickStart: Fraction, nominal: TimeSigFrac, msr: Measure,
    maxDots: number, timeStretch: Fraction = new Fraction(1, 1)): TDuration[] {
    if (!l.gt(new Fraction(0, 1))) {
        return []
    }

    const dList: TDuration[] = []

    if (msr.isAnacrusis()) {
        rtickStart = rtickStart.plus(msr.anacrusisOffset().times(timeStretch))
    } else if (isRest && l.eq(msr.ticks().times(timeStretch))) {
        dList.push(new TDuration(DurationType.V_MEASURE))
        return dList
    }

    if (nominal.isCompound()) {
        splitCompoundBeatsForList(dList, l, isRest, rtickStart, nominal, maxDots)
    } else {
        populateRhythmicList(dList, l, isRest, rtickStart, nominal, maxDots)
    }

    return dList
}

export function populateRhythmicList(dList: TDuration[], l: Fraction, isRest: boolean, rtickStart: Fraction, nominal: TimeSigFrac,
    maxDots: number): void {
    const rtickEnd = rtickStart.plus(l)

    let needToSplit = false // do we need to split?
    let rtickSplit = 0 // tick to split on if we need to

    // CHECK AT SUBBEAT LEVEL

    const startLevel = nominal.rtick2subbeatLevel(rtickStart.ticks())
    const endLevel = nominal.rtick2subbeatLevel(rtickEnd.ticks())
    const [strongestLevelCrossed, split] = nominal.strongestSubbeatLevelInRange(rtickStart.ticks(), rtickEnd.ticks()) // sets rtickSplit
    rtickSplit = split

    if (startLevel < 0 || endLevel < 0 || strongestLevelCrossed < 0) {
        // Beyond maximum subbeat level so just split into largest possible durations.
        dList.push(...toDurationList(l, maxDots > 0, maxDots, false))
        return
    }

    // split if we cross something stronger than where we start and end
    if (strongestLevelCrossed < startLevel && strongestLevelCrossed < endLevel) {
        needToSplit = true
    }
    // but don't split for level 1 syncopation (allow eight-note, quarter, quarter... to cross unstressed beats)
    if (startLevel === endLevel && strongestLevelCrossed === startLevel - 1) {
        needToSplit = false
    }
    // nor for the next simplest case of level 2 syncopation (allow sixteenth-note, eighth, eighth... to cross unstressed beats)
    if (startLevel === endLevel && strongestLevelCrossed === startLevel - 2) {
        // but disallow sixteenth-note, quarter, quarter...
        const ticksToNext = nominal.ticksToNextSubbeat(rtickStart.ticks(), startLevel - 1)
        const ticksPastPrev = nominal.ticksPastSubbeat(rtickStart.ticks(), startLevel - 1)
        needToSplit = ticksToNext !== ticksPastPrev
    }

    if (!needToSplit && strongestLevelCrossed === 0) {
        // NOW CHECK AT DENOMINATOR UNIT LEVEL AND BEAT LEVEL
        const startBeat = nominal.rtick2beatType(rtickStart.ticks())
        const endBeat = nominal.rtick2beatType(rtickEnd.ticks())

        // if there is a choice of which beat to split on, should we use the first or last?
        const useLast = startBeat <= BeatType.SIMPLE_UNSTRESSED // split on the later beat if starting on a beat

        const [strongestBeatCrossed, dUnitsCrossed, beatSplit] = nominal.strongestBeatInRange(rtickStart.ticks(), rtickEnd.ticks(), useLast)
        rtickSplit = beatSplit

        needToSplit = forceRhythmicSplit(isRest, startBeat, endBeat, dUnitsCrossed, strongestBeatCrossed, nominal)
    }

    if (!needToSplit) {
        // CHECK THERE IS A DURATION THAT FITS
        // crossed beats/subbeats were not important so try to avoid splitting
        const d = new TDuration(l, true, maxDots)
        if (d.fraction().eq(l)) {
            // we can use a single duration - no need to split!
            dList.push(new TDuration(l))
            return
        }
        // no single TDuration fits so must split anyway
    }

    // Prevent infinite recursion if there is no splitting point other than the start and end ticks
    if (!(rtickStart.ticks() < rtickSplit && rtickSplit < rtickEnd.ticks())) {
        dList.push(...toDurationList(l, maxDots > 0, maxDots, false))
        return
    }

    // Split on the strongest beat or subbeat crossed
    const leftSplit = Fraction.fromTicks(rtickSplit).minus(rtickStart)
    const rightSplit = l.minus(leftSplit)

    // Recurse to see if we need to split further before adding to list
    populateRhythmicList(dList, leftSplit, isRest, rtickStart, nominal, maxDots)
    populateRhythmicList(dList, rightSplit, isRest, Fraction.fromTicks(rtickSplit), nominal, maxDots)
}

/** Split compound notes/rests where they enter a compound beat. */
export function splitCompoundBeatsForList(dList: TDuration[], l: Fraction, isRest: boolean, rtickStart: Fraction, nominal: TimeSigFrac,
    maxDots: number): void {
    const rtickEnd = rtickStart.plus(l)

    const startBeat = nominal.rtick2beatType(rtickStart.ticks())
    const endBeat = nominal.rtick2beatType(rtickEnd.ticks())

    if (startBeat > BeatType.COMPOUND_UNSTRESSED) {
        // Not starting on a compound beat so mustn't extend into next compound beat
        const splitTicks = nominal.ticksToNextBeat(rtickStart.ticks())

        if (rtickEnd.minus(rtickStart).ticks() > splitTicks) {
            // Duration extends into next beat so must split
            const leftSplit = Fraction.fromTicks(splitTicks)
            const rightSplit = l.minus(leftSplit)
            populateRhythmicList(dList, leftSplit, isRest, rtickStart, nominal, maxDots) // this side is ok to proceed
            splitCompoundBeatsForList(dList, rightSplit, isRest, rtickStart.plus(Fraction.fromTicks(splitTicks)), nominal, maxDots) // not checked yet
            return
        }
    }

    if (endBeat > BeatType.COMPOUND_UNSTRESSED) {
        // Not ending on a compound beat so mustn't extend into previous compound beat
        const splitTicks = nominal.ticksPastBeat(rtickEnd.ticks())

        if (rtickEnd.minus(rtickStart).ticks() > splitTicks) {
            // Duration extends into previous beat so must split
            const rightSplit = Fraction.fromTicks(splitTicks)
            const leftSplit = l.minus(rightSplit)
            populateRhythmicList(dList, leftSplit, isRest, rtickStart, nominal, maxDots) // must add leftSplit to list first
            populateRhythmicList(dList, rightSplit, isRest, rtickEnd.minus(Fraction.fromTicks(splitTicks)), nominal, maxDots)
            return
        }
    }

    // Duration either starts and ends on compound beats, or it remains within a single compound beat
    populateRhythmicList(dList, l, isRest, rtickStart, nominal, maxDots)
}

/**
 * Where to split notes and force a tie to indicate rhythm (see the comments of forceRhythmicSplit() in
 * durationtype.cpp).
 */
export function forceRhythmicSplit(isRest: boolean, startBeat: BeatType, endBeat: BeatType, dUnitsCrossed: number,
    strongestBeatCrossed: BeatType, nominal: TimeSigFrac): boolean {
    // SPECIAL CASES

    // nothing can cross a stressed beat in an irregular time signature
    if (strongestBeatCrossed <= BeatType.SIMPLE_STRESSED && !nominal.isTriple() && !nominal.isDuple()) {
        return true
    }
    if (isRest) {
        // rests must not cross the middle of a bar with numerator == 2 (e.g. 2/4 bar) even though the beat is unstressed
        if (strongestBeatCrossed <= BeatType.SIMPLE_UNSTRESSED && nominal.numerator() === 2) {
            return true
        }
        // rests must not cross a beat in a triple meter - simple (e.g. 3/4) or compound (e.g. 9/8)
        if (strongestBeatCrossed <= BeatType.SIMPLE_UNSTRESSED && nominal.isTriple()) {
            return true
        }
    }

    // GENERAL RULES

    if (nominal.isCompound()) {
        return forceRhythmicSplitCompound(isRest, startBeat, endBeat, dUnitsCrossed, strongestBeatCrossed)
    } else {
        return forceRhythmicSplitSimple(isRest, startBeat, endBeat, dUnitsCrossed, strongestBeatCrossed)
    }
}

function forceRhythmicSplitCompound(isRest: boolean, startBeat: BeatType, endBeat: BeatType, dUnitsCrossed: number,
    strongestBeatCrossed: BeatType): boolean {
    switch (strongestBeatCrossed) {
    case BeatType.COMPOUND_STRESSED:
        // Notes are guaranteed to and start on a compound beat so we can pretend we have a simple measure.
        return forceRhythmicSplitSimple(isRest, startBeat, endBeat, Math.trunc(dUnitsCrossed / 3), BeatType.SIMPLE_STRESSED)
    case BeatType.COMPOUND_UNSTRESSED:
        // No further conditions since note are guaranteed to start and end on a compound beat.
        return false
    case BeatType.COMPOUND_SUBBEAT:
        // don't split anything that takes up a full compound beat
        if (startBeat <= BeatType.COMPOUND_UNSTRESSED && endBeat <= BeatType.COMPOUND_UNSTRESSED) {
            return false
        }
        // split rests that don't start on a compound beat
        if (isRest && startBeat > BeatType.COMPOUND_UNSTRESSED) {
            return true
        }
        // Remaining groupings within compound triplets are the same as for simple triple (3/4, 3/8, etc.)
        return forceRhythmicSplitSimple(isRest, startBeat, endBeat, dUnitsCrossed, BeatType.SIMPLE_UNSTRESSED)
    default: // BeatType::SUBBEAT
        return forceRhythmicSplitSimple(isRest, startBeat, endBeat, dUnitsCrossed, strongestBeatCrossed)
    }
}

function forceRhythmicSplitSimple(isRest: boolean, startBeat: BeatType, endBeat: BeatType, beatsCrossed: number,
    strongestBeatCrossed: BeatType): boolean {
    switch (strongestBeatCrossed) {
    case BeatType.SIMPLE_STRESSED:
        // Must split rests on a stressed beat.
        if (isRest) {
            return true
        }
        // Don't split notes that start or end on a stressed beat. Enables double-dotting in 4/4.
        if (startBeat <= BeatType.SIMPLE_STRESSED || endBeat <= BeatType.SIMPLE_STRESSED) {
            return false
        }
        // Don't split notes that both start and end on unstressed beats or stronger.
        if (startBeat <= BeatType.SIMPLE_UNSTRESSED && endBeat <= BeatType.SIMPLE_UNSTRESSED) {
            return false
        }
        // anything else must split on stressed beat.
        return true
    case BeatType.SIMPLE_UNSTRESSED:
        // Don't split notes or rests if starting and ending on stressed beat.
        if (startBeat <= BeatType.SIMPLE_STRESSED && endBeat <= BeatType.SIMPLE_STRESSED) {
            return false
        }
        // Split rests that don't start or end on a beat. Notes may cross 1 unstressed beat.
        if (startBeat === BeatType.SUBBEAT || endBeat === BeatType.SUBBEAT) {
            return isRest || (beatsCrossed > 1)
        }
        return false
    default: // BeatType::SUBBEAT
        return false
    }
}
