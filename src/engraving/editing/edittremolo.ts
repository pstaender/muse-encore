/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/editing/edittremolo.h/.cpp (MoveTremolo)
 */

import type { Fraction } from '../types/fraction'
import type { track_idx_t } from '../types/types'
import type { Chord } from '../dom/chord'
import type { EngravingObject } from '../dom/engravingobject'
import type { Score } from '../dom/score'
import type { TremoloTwoChord } from '../dom/tremolotwochord'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class MoveTremolo extends UndoCommand {
    private oldC1: Chord | null = null
    private oldC2: Chord | null = null

    constructor(private score: Score, private chord1Tick: Fraction, private chord2Tick: Fraction, private trem: TremoloTwoChord,
                private track: track_idx_t) {
        super()
    }

    override type(): CommandType { return CommandType.MoveTremolo }
    override name(): string { return 'MoveTremolo' }
    override objectItems(): EngravingObject[] { return [this.trem] }

    override redo(_ed: EditData | null): void {
        // Find new tremolo chords
        const m1 = this.score.tick2measure(this.chord1Tick)
        const m2 = this.score.tick2measure(this.chord2Tick)
        if (!m1 || !m2) {
            return
        }
        const c1 = m1.findChord(this.chord1Tick, this.track)
        const c2 = m2.findChord(this.chord2Tick, this.track)
        if (!c1 || !c2) {
            return
        }

        // Remember the old tremolo chords
        this.oldC1 = this.trem.chord1()
        this.oldC2 = this.trem.chord2()

        // Move tremolo away from old chords
        this.trem.chord1()!.setTremoloTwoChord(null)
        this.trem.chord2()!.setTremoloTwoChord(null)

        // Delete old tremolo on c1 and c2, if present
        if (c1.tremoloTwoChord() && (c1.tremoloTwoChord() !== this.trem)) {
            if (c2.tremoloTwoChord() === c1.tremoloTwoChord()) {
                c2.tremoloTwoChord()!.setChords(c1, c2)
            } else {
                c1.tremoloTwoChord()!.setChords(c1, null)
            }
            c1.setTremoloTwoChord(null)
        }
        if (c2.tremoloTwoChord() && (c2.tremoloTwoChord() !== this.trem)) {
            c2.tremoloTwoChord()!.setChords(null, c2)
            c2.setTremoloTwoChord(null)
        }

        // Move tremolo to new chords
        c1.setTremoloTwoChord(this.trem)
        c2.setTremoloTwoChord(this.trem)
        this.trem.setChords(c1, c2)
        this.trem.setParent(c1)

        // Tremolo would cross barline, so remove it
        if (m1 !== m2) {
            this.score.undoRemoveElement(this.trem)
            return
        }
        // One of the notes crosses a barline, so remove the tremolo
        if (!c1.ticks().eq(c2.ticks())) {
            this.score.undoRemoveElement(this.trem)
        }
    }

    override undo(_ed: EditData | null): void {
        // Move tremolo to old position
        this.trem.chord1()!.setTremoloTwoChord(null)
        this.trem.chord2()!.setTremoloTwoChord(null)
        this.oldC1!.setTremoloTwoChord(this.trem)
        this.oldC2!.setTremoloTwoChord(this.trem)
        this.trem.setChords(this.oldC1, this.oldC2)
        this.trem.setParent(this.oldC1)
    }
}
