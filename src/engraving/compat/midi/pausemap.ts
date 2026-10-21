/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/compat/midi/pausemap.h/.cpp
 */

import { SortedMap } from '../../../framework/global/sortedmap'
import { RealIsNull } from '../../../framework/global/realfn'
import type { Score } from '../../dom/score'
import { TempoMap } from '../../dom/tempo'
import { Constants } from '../../types/constants'

/**
 * PauseMap
 *  MIDI files cannot contain pauses so need to insert extra ticks extra ticks and tempo changes instead.
 */
export class PauseMap extends SortedMap<number> {
    private m_tempomapWithPauses: TempoMap | null = null

    /**
     * MIDI files cannot contain pauses so insert extra ticks and tempo changes instead.
     * The PauseMap and new TempoMap are fully unwound to account for pauses on repeats.
     */
    calculate(s: Score): void {
        const sigmap = s.sigmap()
        const tempomap = s.tempomap()

        this.insert(0, 0) // can't start with a pause

        this.m_tempomapWithPauses = new TempoMap()
        this.m_tempomapWithPauses.setTempoMultiplier(tempomap.tempoMultiplier())

        for (const rs of s.repeatList()) {
            const startTick = rs.tick
            const endTick = rs.endTick()
            const tickOffset = rs.utick - rs.tick

            const se = tempomap.lowerBound(startTick)
            const ee = tempomap.lowerBound(endTick + 1) // +1 to include first tick of next RepeatSegment

            for (let it = se; it < ee; ++it) {
                const tick = tempomap.keyAt(it)
                const ev = tempomap.valueAt(it)
                const utick = tick + tickOffset

                if (RealIsNull(ev.pause)) {
                    // We have a regular tempo change. Don't include tempo change from first tick of next RepeatSegment (it will be included later).
                    if (tick !== endTick) {
                        this.m_tempomapWithPauses.insertEvent(this.tickWithPauses(utick), ev)
                    }
                } else {
                    // We have a pause event. Don't include pauses from first tick of current RepeatSegment (it was included in the previous one).
                    if (tick !== startTick) {
                        const timeSig = sigmap.timesig(tick).timesig()
                        const quarterNotesPerMeasure = (4.0 * timeSig.numerator()) / timeSig.denominator()
                        const ticksPerMeasure = Math.trunc(quarterNotesPerMeasure * Constants.DIVISION) // store a full measure of ticks to keep barlines in same places
                        this.m_tempomapWithPauses.setTempo(this.tickWithPauses(utick), quarterNotesPerMeasure / ev.pause) // new tempo for pause
                        this.insert(utick, ticksPerMeasure + this.offsetAtUTick(utick)) // store running total of extra ticks
                        this.m_tempomapWithPauses.setTempo(this.tickWithPauses(utick), ev.tempo) // restore previous tempo
                    }
                }
            }
        }
    }

    tickWithPauses(utick: number): number { return utick + this.offsetAtUTick(utick) }
    tempomapWithPauses(): TempoMap | null { return this.m_tempomapWithPauses }

    /** In total, how many extra ticks have been inserted prior to this utick. */
    private offsetAtUTick(utick: number): number {
        if (this.empty()) {
            return 0
        }
        let i = this.upperBound(utick)
        if (i !== 0) {
            --i
        }
        return this.valueAt(i)
    }
}
