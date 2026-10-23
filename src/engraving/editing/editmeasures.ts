/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of parts of src/engraving/editing/editmeasures.h/.cpp (InsertRemoveMeasures, RemoveMeasures, InsertMeasures,
 * ChangeMeasureLen) and inserttime.h/.cpp (InsertTime, InsertTimeUnmanagedSpanner)
 * TODO(port): ChangeMMRest, ChangeMeasureRepeatCount, moving StaffTypeChanges (moveStc)
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
import type { Score } from '../dom/score'
import type { System } from '../dom/system'
import type { Page } from '../dom/page'
import type { ChordRest } from '../dom/chordrest'
import { CommandType, UndoCommand } from './undo'
import type { EditData } from './editdata'

export class InsertRemoveMeasures extends UndoCommand {
    constructor(protected fm: MeasureBase, protected lm: MeasureBase, protected moveStc = true) {
        super()
    }

    override objectItems(): MeasureBase[] { return [this.fm, this.lm] }

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

        score.setLayoutAll()

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

    protected removeMeasures(): void {
        const fm = this.fm
        const lm = this.lm
        const score = fm.score()

        const tick1 = fm.tick()
        const tick2 = lm.endTick()

        if (fm.isMeasure() && lm.isMeasure()) {
            // remove beams from chordrests in affected area, they will be rebuilt later but we need
            // to avoid situations where notes from deleted measures remain in beams
            // when undoing, we need to check the previous measure as well as there could be notes in there
            // that need to have their beams recalculated (esp. when adding time signature)
            const prev = fm.prev()
            const first = ((prev && prev.isMeasure() ? prev : fm) as Measure).first()
            for (let s = first; s && s !== (lm as Measure).last(); s = s.next1()) {
                if (!s) {
                    break
                }
                if (!s.isChordRestType()) {
                    continue
                }

                for (let track = 0; track < score.ntracks(); ++track) {
                    const e = s.element(track)
                    if (e && e.isChordRest()) {
                        (e as ChordRest).removeDeleteBeam(false)
                    }
                }
            }
        }

        const systemList: System[] = []
        for (let mb: MeasureBase = lm; ; mb = mb.prev()!) {
            const system = mb.system()
            if (system) {
                if (!systemList.includes(system)) {
                    systemList.push(system)
                }
                system.removeMeasure(mb)
            }
            if (mb === fm) {
                break
            }
        }

        // TODO(port): move subsequent StaffTypeChanges (moveStc; Staff::staffTypeRange / moveStaffType)

        score.measures().removeRange(fm, lm)

        if (fm.isMeasure()) {
            score.setUpTempoMap()
            ;(score.masterScore() as MasterScore).setPlaylistDirty()

            // check if there is a clef at the end of last measure
            // remove clef from staff cleflist

            if (lm.isMeasure()) {
                const m = lm as Measure
                const s = m.findSegment(SegmentType.Clef, tick2)
                if (s) {
                    for (const e of s.elist()) {
                        if (e && e.isClef()) {
                            score.staff(e.staffIdx())!.removeClef(e as Clef)
                        }
                    }
                }
            }

            // remember clefs at the end of previous measure
            const clefs = InsertRemoveMeasures.getCourtesyClefs(fm as Measure)

            score.insertTime(tick1, tick2.minus(tick1).neg())

            // Restore clefs that were backed up. Events for them could be lost
            // as a result of the recent insertTime() call.
            for (const clef of clefs) {
                clef.staff()!.setClef(clef)
            }

            for (const sp of [...score.unmanagedSpanners()]) {
                if ((sp.tick().ge(tick1) && sp.tick().lt(tick2)) || (sp.tick2().ge(tick1) && sp.tick2().lt(tick2))) {
                    sp.removeUnmanaged()
                }
            }
        }

        // remove empty systems

        for (const s of systemList) {
            if (s.measures().length === 0) {
                const page = s.page() as Page | null
                if (page) {
                    // erase system from page
                    const i = page.systems().indexOf(s)
                    if (i >= 0) {
                        page.systems().splice(i, 1)
                    }
                }
                // erase system from score
                const si = score.systems().indexOf(s)
                if (si >= 0) {
                    score.systems().splice(si, 1)
                }

                if (page && page.systems().length === 0) {
                    // if page is empty, delete it as well
                    const pi = score.pages().indexOf(page)
                    if (pi >= 0) {
                        score.pages().splice(pi, 1)
                    }
                }
            }
        }

        score.setLayoutAll()
    }
}

export class RemoveMeasures extends InsertRemoveMeasures {
    override undo(_ed: EditData | null): void { this.insertMeasures() }
    override redo(_ed: EditData | null): void { this.removeMeasures() }

    override type(): CommandType { return CommandType.RemoveMeasures }
    override name(): string { return 'RemoveMeasures' }
}

export class InsertMeasures extends InsertRemoveMeasures {
    override redo(_ed: EditData | null): void { this.insertMeasures() }
    override undo(_ed: EditData | null): void { this.removeMeasures() }

    override type(): CommandType { return CommandType.InsertMeasures }
    override name(): string { return 'InsertMeasures' }
}

export class ChangeMeasureLen extends UndoCommand {
    constructor(private measure: Measure, private len: Fraction) {
        super()
    }

    override type(): CommandType { return CommandType.ChangeMeasureLen }
    override name(): string { return 'ChangeMeasureLen' }
    override objectItems(): Measure[] { return [this.measure] }

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
    constructor(private score: Score, private tick: Fraction, private len: Fraction) {
        super()
    }

    override type(): CommandType { return CommandType.InsertTime }
    override name(): string { return 'InsertTime' }
    override objectItems(): Score[] { return [this.score] }

    override redo(_ed: EditData | null = null): void { this.score.insertTime(this.tick, this.len) }
    override undo(_ed: EditData | null = null): void { this.score.insertTime(this.tick, this.len.neg()) }
}

export class InsertTimeUnmanagedSpanner extends UndoCommand {
    constructor(private score: Score, private tick: Fraction, private len: Fraction) {
        super()
    }

    override type(): CommandType { return CommandType.InsertTimeUnmanagedSpanner }
    override name(): string { return 'InsertTimeUnmanagedSpanner' }
    override objectItems(): Score[] { return [this.score] }

    protected override flip(_ed: EditData | null): void {
        for (const s of this.score.scoreList()) {
            for (const sp of [...s.unmanagedSpanners()]) {
                sp.insertTimeUnmanaged(this.tick, this.len)
            }
        }
        this.len = this.len.neg()
    }
}
