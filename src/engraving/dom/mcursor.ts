/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/mcursor.h/.cpp: creates simple scores (used by MuseScore's tests)
 */

import { Fraction } from '../types/fraction'
import { ElementType, VOICES, type Key, type track_idx_t } from '../types/types'
import { DefaultStyle } from '../style/defaultstyle'
import { Factory } from './factory'
import { MasterScore } from './masterscore'
import { Part } from './part'
import { SegmentType } from './segment'
import { SigEvent } from './sig'
import { searchTemplate } from './instrtemplate'
import type { TDuration } from './durationtype'
import type { Chord } from './chord'
import type { KeySig } from './keysig'
import type { Measure } from './measure'
import type { Note } from './note'
import { TimeSigType, type TimeSig } from './timesig'

export class MCursor {
    private m_score: MasterScore | null
    private m_track: track_idx_t = 0
    private m_tick = new Fraction(0, 1)
    private m_sig = new Fraction(4, 4)

    constructor(s: MasterScore | null = null) {
        this.m_score = s
        this.move(0, new Fraction(0, 1))
    }

    score(): MasterScore { return this.m_score! }
    setScore(s: MasterScore): void { this.m_score = s }
    setTimeSig(f: Fraction): void { this.m_sig = f }

    private createMeasures(): void {
        const score = this.m_score!
        for (;;) {
            let tick = new Fraction(0, 1)
            let measure = score.lastMeasure()
            if (measure) {
                tick = measure.endTick()
                if (tick.gt(this.m_tick)) {
                    break
                }
            }
            measure = Factory.createItem(ElementType.MEASURE, score.dummySystem()) as Measure
            measure.setTick(tick)
            measure.setTimesig(this.m_sig)
            measure.setTicks(this.m_sig)
            score.measures().append(measure)
        }
    }

    addChord(pitch: number, duration: TDuration): Chord {
        this.createMeasures()
        const score = this.m_score!
        const measure = score.tick2measure(this.m_tick)!
        const segment = measure.getSegment(SegmentType.ChordRest, this.m_tick)
        let chord = segment.element(this.m_track) as Chord | null
        if (!chord) {
            chord = Factory.createItem(ElementType.CHORD, segment) as Chord
            chord.setTrack(this.m_track)
            chord.setDurationType(duration)
            chord.setTicks(duration.fraction())
            segment.add(chord)
        }
        const note = Factory.createItem(ElementType.NOTE, chord) as Note
        chord.add(note)
        note.setPitch(pitch)
        note.setTpcFromPitch()
        this.m_tick = this.m_tick.plus(duration.ticks())
        return chord
    }

    addKeySig(key: Key): void {
        this.createMeasures()
        const score = this.m_score!
        const measure = score.tick2measure(this.m_tick)!
        const segment = measure.getSegment(SegmentType.KeySig, this.m_tick)
        const n = score.nstaves()
        for (let i = 0; i < n; ++i) {
            const ks = Factory.createItem(ElementType.KEYSIG, segment) as KeySig
            ks.setKey(key)
            ks.setTrack(i * VOICES)
            segment.add(ks)
        }
    }

    addTimeSig(f: Fraction): TimeSig | null {
        this.createMeasures()
        const score = this.m_score!
        const measure = score.tick2measure(this.m_tick)!
        const segment = measure.getSegment(SegmentType.TimeSig, this.m_tick)
        let ts: TimeSig | null = null
        for (let i = 0; i < score.nstaves(); ++i) {
            ts = Factory.createItem(ElementType.TIMESIG, segment) as TimeSig
            ts.setSig(f, TimeSigType.NORMAL)
            ts.setTrack(i * VOICES)
            segment.add(ts)
        }
        score.sigmap().addSig(this.m_tick.ticks(), new SigEvent(f))
        return ts
    }

    /** C++ createScore(iocCtx, name): ScoreAccess::createMasterScoreWithBaseStyle (the name is not used) */
    createScore(_name = ''): void {
        this.m_score = new MasterScore()
        this.m_score.setStyle(DefaultStyle.baseStyle().clone())
        this.move(0, new Fraction(0, 1))
    }

    move(t: number, tick: Fraction): void {
        this.m_track = t
        this.m_tick = tick
    }

    addPart(instrument: string): void {
        const score = this.m_score!
        const part = new Part(score)
        const staff = Factory.createStaff(part)
        const it = searchTemplate(instrument)
        if (!it) {
            return
        }

        part.initFromInstrTemplate(it)
        staff.init(it, null, 0)
        score.appendPart(part)
        score.insertStaff(staff, 0)
    }
}
