/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/midi/internal/midiimport/importmidi_tie.h/.cpp (namespace MidiTie)
 */

import type { Chord } from '../../../../engraving/dom/chord'
import type { ChordRest } from '../../../../engraving/dom/chordrest'
import type { Note } from '../../../../engraving/dom/note'
import type { Segment } from '../../../../engraving/dom/segment'
import type { Staff } from '../../../../engraving/dom/staff'
import type { Tie } from '../../../../engraving/dom/tie'
import { VOICES, type track_idx_t, type voice_idx_t } from '../../../../engraving/types/types'
import { SegmentType } from '../../../../engraving/dom/segment'
import { StdSet } from '../../../../framework/global/stdmap'

function isTied(seg: Segment, strack: track_idx_t, voice: voice_idx_t, tieFunc: (n: Note) => Tie | null): boolean {
    const cr = seg.element(strack + voice) as ChordRest | null
    if (cr && cr.isChord()) {
        const chord = cr as Chord
        const notes = chord.notes()
        for (const note of notes) {
            if (tieFunc(note)) {
                return true
            }
        }
    }
    return false
}

export function isTiedFor(seg: Segment, strack: track_idx_t, voice: voice_idx_t): boolean {
    return isTied(seg, strack, voice, n => n.tieFor())
}

export function isTiedBack(seg: Segment, strack: track_idx_t, voice: voice_idx_t): boolean {
    return isTied(seg, strack, voice, n => n.tieBack())
}

export enum TieState {
    UNTIED, TIED_FOR, TIED_BOTH, TIED_BACK,
}

export class TieStateMachine {
    static readonly State = TieState

    private tiedVoices = new StdSet<voice_idx_t>()
    private state_ = TieState.UNTIED

    state(): TieState { return this.state_ }

    addSeg(seg: Segment, strack: track_idx_t): void {
        let isChord = false
        for (let voice = 0; voice < VOICES; ++voice) {
            const cr = seg.element(strack + voice) as ChordRest | null
            if (!cr || !cr.isChord()) {
                continue
            }
            if (!isChord) {
                isChord = true
            }

            const tiedFor = isTiedFor(seg, strack, voice)
            const tiedBack = isTiedBack(seg, strack, voice)

            if (tiedFor && !tiedBack) {
                this.tiedVoices.insert(voice)
            } else if (!tiedFor && tiedBack) {
                this.tiedVoices.eraseKey(voice)
            }
        }
        if (!isChord) {
            return
        }

        if (this.tiedVoices.empty() && (this.state_ === TieState.TIED_FOR
                                        || this.state_ === TieState.TIED_BOTH)) {
            this.state_ = TieState.TIED_BACK
        } else if (this.tiedVoices.empty() && this.state_ === TieState.TIED_BACK) {
            this.state_ = TieState.UNTIED
        } else if (!this.tiedVoices.empty() && (this.state_ === TieState.TIED_BACK
                                                 || this.state_ === TieState.UNTIED)) {
            this.state_ = TieState.TIED_FOR
        } else if (!this.tiedVoices.empty() && this.state_ === TieState.TIED_FOR) {
            this.state_ = TieState.TIED_BOTH
        }
    }
}

/** (C++ QT_DEBUG only) */
export function areTiesConsistent(staff: Staff): boolean {
    const strack = staff.idx() * VOICES

    for (let voice = 0; voice < VOICES; ++voice) {
        let isTie = false
        for (let seg = staff.score().firstSegment(SegmentType.All); seg; seg = seg.next1()) {
            if (seg.segmentType() === SegmentType.ChordRest) {
                const cr = seg.element(strack + voice) as ChordRest | null

                if (cr && cr.isRest() && isTie) {
                    return false
                }
                if (isTiedBack(seg, strack, voice)) {
                    if (!isTie) {
                        return false
                    }
                    isTie = false
                }
                if (isTiedFor(seg, strack, voice)) {
                    if (isTie) {
                        return false
                    }
                    isTie = true
                }
            }
        }
        if (isTie) {
            return false
        }
    }
    return true
}
