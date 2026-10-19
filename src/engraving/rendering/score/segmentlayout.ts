/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rendering/score/segmentlayout.h/.cpp
 *
 * TODO(port): ambitus
 */

import type { track_idx_t } from '../../types/types'
import { Sid } from '../../style/styledef'
import { Pid } from '../../dom/property'
import { SegmentType, type Segment } from '../../dom/segment'
import type { BarLine } from '../../dom/barline'
import type { Chord } from '../../dom/chord'
import type { ChordRest } from '../../dom/chordrest'
import type { Clef } from '../../dom/clef'
import type { KeySig } from '../../dom/keysig'
import type { Staff } from '../../dom/staff'
import type { TimeSig } from '../../dom/timesig'
import type { LayoutConfiguration, LayoutContext } from './layoutcontext'
import { TLayout } from './tlayout'
import { ChordLayout } from './chordlayout'

export class SegmentLayout {
    static layoutMeasureIndependentElements(segment: Segment, track: track_idx_t, ctx: LayoutContext): void {
        if (segment.isJustType(SegmentType.KeySig)) {
            const ks = segment.element(track) as KeySig | null
            if (ks) {
                TLayout.layoutKeySig(ks, ctx) // LD_INDEPENDENT
            }
        } else if (segment.isJustType(SegmentType.Clef)) {
            const cl = segment.element(track) as Clef | null
            if (cl) {
                cl.setSmall(true)
                TLayout.layoutClef(cl, ctx) // LD_INDEPENDENT
            }
        } else if (segment.isSegType(SegmentType.HeaderClef)) {
            const cl = segment.element(track) as Clef | null
            if (cl) {
                TLayout.layoutClef(cl, ctx) // LD_INDEPENDENT
            }
        } else if (segment.isSegType(SegmentType.TimeSig)) {
            const ts = segment.element(track) as TimeSig | null
            if (ts) {
                TLayout.layoutTimeSig(ts, ctx) // LD_INDEPENDENT
            }
        } else if (segment.isSegType(SegmentType.Ambitus)) {
            // TODO(port): Ambitus
        } else if (segment.isSegType(SegmentType.BarLine)) {
            const bl = segment.element(track) as BarLine | null
            if (bl) {
                TLayout.layoutBarLine(bl, ctx)
            }
        }
    }

    static setChordMag(staff: Staff, segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t,
                       conf: LayoutConfiguration): void {
        const staffMag = staff.staffMag(segment)
        const smallNoteMag = conf.styleD(Sid.smallNoteMag)
        const graceNoteMag = conf.styleD(Sid.graceNoteMag)

        for (let t = startTrack; t < endTrack; ++t) {
            const cr = segment.cr(t)
            if (!cr) {
                continue
            }
            let m = staffMag
            if (cr.isSmall()) {
                m *= smallNoteMag
            }
            if (cr.isChord()) {
                const graceMag = m * graceNoteMag
                for (const c of (cr as Chord).graceNotes()) {
                    c.mutldata().setMag(graceMag)
                }
            }
            cr.mutldata().setMag(m)
        }
    }

    static checkStaffMoveValidity(segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t): void {
        for (let t = startTrack; t < endTrack; ++t) {
            const cr = segment.element(t) as ChordRest | null
            if (cr) {
                if (cr.staffMove() || cr.storedStaffMove()) {
                    cr.checkStaffMoveValidity()
                }
            }
        }
    }

    static layoutChordDrumset(staff: Staff, segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t,
                              conf: LayoutConfiguration): void {
        const ins = staff.part().instrument(segment.tick())
        if (!ins.useDrumset()) {
            return
        }
        const drumset = ins.drumset()
        if (!drumset) {
            return
        }

        const st = staff.staffTypeForElement(segment)

        const layoutDrumset = (c: Chord, spatium: number): void => {
            for (const note of c.notes()) {
                const pitch = note.pitch()
                if (!drumset.isValid(pitch)) {
                    // LOGD("unmapped drum note %d", pitch);
                } else if (!note.fixed()) {
                    note.undoChangeProperty(Pid.HEAD_GROUP, drumset.noteHead(pitch))
                    const line = drumset.line(pitch)
                    note.setLine(line)

                    const off = st.stepOffset()
                    const ld = st.lineDistance().val()
                    note.mutldata().setPosY((line + off * 2.0) * spatium * 0.5 * ld)
                }
            }
        }

        const spatium = conf.spatium()
        for (let t = startTrack; t < endTrack; ++t) {
            const e = segment.element(t)
            if (!e || !e.isChord()) { // maybe Rest
                continue
            }
            const chord = e as Chord
            for (const c of chord.graceNotes()) {
                layoutDrumset(c, spatium)
            }
            layoutDrumset(chord, spatium)
        }
    }

    static computeChordsUp(segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t, ctx: LayoutContext): void {
        for (let t = startTrack; t < endTrack; ++t) {
            const cr = segment.cr(t)
            if (!cr) {
                continue
            }
            if (cr.isChord()) {
                const chord = cr as Chord
                for (const c of chord.graceNotes()) {
                    ChordLayout.computeUp(c, ctx)
                }
                ChordLayout.computeUp(chord, ctx)
            }
        }
    }

    static layoutChordsStem(segment: Segment, startTrack: track_idx_t, endTrack: track_idx_t, ctx: LayoutContext): void {
        for (let t = startTrack; t < endTrack; ++t) {
            const cr = segment.cr(t)
            if (!cr) {
                continue
            }
            if (cr.isChord()) {
                const chord = cr as Chord
                for (const c of chord.graceNotes()) {
                    ChordLayout.layoutStem(c, ctx)
                }
                ChordLayout.layoutStem(chord, ctx)
            }
        }
    }
}
