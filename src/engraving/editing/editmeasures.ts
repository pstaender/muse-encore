/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/editing/editmeasures.h/.cpp (and InsertTime of inserttime.cpp). InsertMeasures only has
 * redo(); ChangeMeasureLen and InsertTime are undo commands.
 * TODO(port): removeMeasures (undo), the other measure commands
 */

import { Fraction } from '../types/fraction'
import { VOICES, staff2track } from '../types/types'
import { SegmentType, type Segment } from '../dom/segment'
import { searchTieNote } from '../dom/utils'
import type { Chord } from '../dom/chord'
import type { Clef } from '../dom/clef'
import type { InstrumentChange } from '../dom/instrchange'
import type { KeySig } from '../dom/keysig'
import type { Measure } from '../dom/measure'
import type { MeasureBase } from '../dom/measurebase'
import type { MasterScore } from '../dom/masterscore'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class InsertRemoveMeasures {
    constructor(protected fm: MeasureBase, protected lm: MeasureBase, protected moveStc = true) {}

    /** remember clefs at the end of previous measure */
    static getCourtesyClefs(m: Measure): Clef[] {
        const score = m.score()
        const startClefs: Clef[] = []
        const prev = m.prev()
        if (prev && prev.isMeasure()) {
            const prevMeasure = prev as Measure
            const clefSeg = prevMeasure.findSegmentR(SegmentType.Clef | SegmentType.HeaderClef, prevMeasure.ticks())
            if (clefSeg) {
                for (let st = 0; st < score.nstaves(); ++st) {
                    const clef = clefSeg.element(staff2track(st))
                    if (clef && clef.isClef()) {
                        startClefs.push(clef as Clef)
                    }
                }
            }
        }
        return startClefs
    }

    protected insertMeasures(): void {
        const fm = this.fm
        const lm = this.lm
        const score = fm.score()

        const clefs: Clef[] = []
        let prevMeasureClefs: Clef[] = []
        const keys: KeySig[] = []
        let fs: Segment | null = null
        let ls: Segment | null = null
        if (fm.isMeasure()) {
            (score.masterScore() as MasterScore).setPlaylistDirty()
            fs = (fm as Measure).first()
            ls = (lm as Measure).last()
            for (let s = fs; s && s !== ls; s = s.next1()) {
                if (!s.enabled() || !(s.segmentType() & (SegmentType.Clef | SegmentType.HeaderClef | SegmentType.KeySig))) {
                    continue
                }
                for (let track = 0; track < score.ntracks(); track += VOICES) {
                    const e = s.element(track)
                    if (!e || e.generated()) {
                        continue
                    }
                    if (e.isClef()) {
                        clefs.push(e as Clef)
                    } else if (e.isKeySig()) {
                        keys.push(e as KeySig)
                    }
                }
            }
            prevMeasureClefs = InsertRemoveMeasures.getCourtesyClefs(fm as Measure)
        }
        score.measures().insert(fm, lm)

        if (fm.isMeasure()) {
            score.setUpTempoMap()
            score.insertTime(fm.tick(), lm.endTick().minus(fm.tick()))

            // move ownership of Instrument back to part
            for (let s = fs; s && s !== ls; s = s.next1()) {
                for (const e of s.annotations()) {
                    if (e.isInstrumentChange()) {
                        e.part()!.setInstrument((e as InstrumentChange).instrument(), s.tick())
                    }
                }
            }
            for (const clef of prevMeasureClefs) {
                clef.staff()!.setClef(clef)
            }
            for (const clef of clefs) {
                clef.staff()!.setClef(clef)
            }
            for (const key of keys) {
                key.staff()!.setKey(key.segment()!.tick(), key.keySigEvent())
            }
        }

        // TODO(port): score->setLayoutAll() (the port always lays out everything)

        // TODO(port): move subsequent StaffTypeChanges (moveStc; Staff::staffTypeRange / moveStaffType)

        //
        // connect ties
        //

        if (!fm.isMeasure() || !fm.prevMeasure()) {
            return
        }
        const m = fm.prevMeasure()!
        for (let seg = m.first(); seg; seg = seg.next()) {
            for (let track = 0; track < score.ntracks(); ++track) {
                const e = seg.element(track)
                if (!e || !e.isChord()) {
                    continue
                }
                const chord = e as Chord
                for (const n of chord.notes()) {
                    const tie = n.tieForNonPartial()
                    if (!tie) {
                        continue
                    }
                    if (!tie.endNote() || tie.endNote()!.chord().segment()!.measure() !== m) {
                        const nn = searchTieNote(n)
                        if (nn) {
                            tie.setEndNote(nn)
                            nn.setTieBack(tie)
                        }
                    }
                }
            }
        }
    }
}

export class InsertMeasures extends InsertRemoveMeasures {
    redo(): void { this.insertMeasures() }
    // TODO(port): undo() { removeMeasures() }
}

export class ChangeMeasureLen extends UndoCommand {
    constructor(private measure: Measure, private len: Fraction) { super() }

    override type(): CommandType { return CommandType.ChangeMeasureLen }
    override name(): string { return 'ChangeMeasureLen' }

    /** also called directly (without the undo stack) by the callers that are not undoable yet */
    override redo(ed: EditData | null = null): void { super.redo(ed) }

    protected override flip(_ed: EditData | null): void {
        const oLen = this.measure.ticks()

        //
        // move EndBarLine and TimeSigAnnounce
        // to end of measure:
        //

        for (let s = this.measure.first(); s;) {
            const next = s.next()
            if (s.isEndBarLineType() || s.isTimeSigAnnounceType()) {
                s.setRtick(this.len)
                this.measure.remove(s)
            }
            s = next
        }
        this.measure.setTicks(this.len)
        this.measure.score().setUpTempoMap()
        this.len = oLen
    }
}

export class InsertTime extends UndoCommand {
    constructor(private score: import('../dom/score').Score, private tick: Fraction, private len: Fraction) { super() }

    override type(): CommandType { return CommandType.InsertTime }
    override name(): string { return 'InsertTime' }

    override redo(_ed: EditData | null = null): void { this.score.insertTime(this.tick, this.len) }
    override undo(_ed: EditData | null = null): void { this.score.insertTime(this.tick, this.len.neg()) }
}

