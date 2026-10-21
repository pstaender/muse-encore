/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/write/writecontext.h/.cpp
 *
 * TODO(port): selection filter (SelectionFilter, clipboard writing of a selection)
 */

import { Fraction } from '../../types/fraction'
import { nidx, type staff_idx_t, type track_idx_t } from '../../types/types'
import type { EngravingItem } from '../../dom/engravingitem'
import type { MeasureBase } from '../../dom/measurebase'
import type { Score } from '../../dom/score'

export interface WriteRange {
    startMeasure: MeasureBase | null
    endMeasure: MeasureBase | null
    startStaffIdx: staff_idx_t
    endStaffIdx: staff_idx_t
}

export class WriteContext {
    private m_curTick = new Fraction(0, 1) // used to optimize output
    private m_tickDiff = new Fraction(0, 1)
    private m_curTrack: track_idx_t = nidx
    private m_trackDiff = 0 // saved track is curTrack-trackDiff
    private m_clipboardmode = false // used to modify write() behaviour
    private m_range: WriteRange | null = null

    constructor(private readonly m_score: Score) {}

    score(): Score { return this.m_score }

    curTick(): Fraction { return this.m_curTick }
    setCurTick(v: Fraction): void { this.m_curTick = v }
    incCurTick(v: Fraction): void { this.m_curTick = this.m_curTick.plus(v) }

    tickDiff(): Fraction { return this.m_tickDiff }
    setTickDiff(v: Fraction): void { this.m_tickDiff = v }

    curTrack(): track_idx_t { return this.m_curTrack }
    setCurTrack(v: track_idx_t): void { this.m_curTrack = v }
    trackDiff(): number { return this.m_trackDiff }
    setTrackDiff(v: number): void { this.m_trackDiff = v }

    clipboardmode(): boolean { return this.m_clipboardmode }
    setClipboardmode(v: boolean): void { this.m_clipboardmode = v }

    canWrite(_e: EngravingItem): boolean { return true }
    canWriteNoteIdx(_noteIdx: number, _totalNotesInChord: number): boolean { return true }
    canWriteVoice(_track: track_idx_t): boolean { return true }

    shouldWriteRange(): boolean { return this.m_range !== null }
    range(): WriteRange | null { return this.m_range }
    setRange(v: WriteRange): void { this.m_range = v }

    /** C++ copy assignment (WriteInOutData::ctx) */
    assign(o: WriteContext): void {
        this.m_curTick = o.m_curTick
        this.m_tickDiff = o.m_tickDiff
        this.m_curTrack = o.m_curTrack
        this.m_trackDiff = o.m_trackDiff
        this.m_clipboardmode = o.m_clipboardmode
        this.m_range = o.m_range
    }
}
