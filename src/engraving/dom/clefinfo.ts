/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of ClefTypeList / ClefInfo (src/engraving/dom/clef.h/.cpp) and ClefList (cleflist.h/.cpp)
 */

import { SortedMap } from '../../framework/global/sortedmap'
import { SymId } from '../types/symid'
import { ClefType, StaffGroup } from '../types/types'

export const NO_CLEF = -1000

export class ClefTypeList {
    constructor(public concertClef: ClefType = ClefType.G, public transposingClef: ClefType = concertClef) {}
    clone(): ClefTypeList { return new ClefTypeList(this.concertClef, this.transposingClef) }
    equals(t: ClefTypeList): boolean { return t.concertClef === this.concertClef && t.transposingClef === this.transposingClef }
}

interface ClefInfoEntry {
    type: ClefType
    line: number // Line positioning on the staff
    pitchOffset: number // Pitch offset for line 0.
    lines: number[]
    symId: SymId
    staffGroup: StaffGroup
}

function ci(type: ClefType, line: number, pitchOffset: number, lines: number[], symId: SymId, staffGroup: StaffGroup): ClefInfoEntry {
    return { type, line, pitchOffset, lines, symId, staffGroup }
}

const S = StaffGroup.STANDARD

// table must be in sync with enum ClefType in types.h
const CLEF_TABLE: ClefInfoEntry[] = [
    //                    line pOff|-lines for sharps---||---lines for flats--   |  symbol                | valid in staff group
    ci(ClefType.G, 2, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef, S),
    ci(ClefType.G15_MB, 2, 31, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef15mb, S),
    ci(ClefType.G8_VB, 2, 38, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef8vb, S),
    ci(ClefType.G8_VA, 2, 52, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef8va, S),
    ci(ClefType.G15_MA, 2, 59, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef15ma, S),
    ci(ClefType.G8_VB_O, 2, 38, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef8vbOld, S),
    ci(ClefType.G8_VB_P, 2, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef8vbParens, S),
    ci(ClefType.G_1, 1, 47, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.gClef, S),

    ci(ClefType.C1, 1, 43, [5, 1, 4, 0, 3, -1, 2, 2, 6, 3, 7, 4, 8, 5], SymId.cClef, S),
    ci(ClefType.C2, 2, 41, [3, 6, 2, 5, 1, 4, 0, 0, 4, 1, 5, 2, 6, 3], SymId.cClef, S),
    ci(ClefType.C3, 3, 39, [1, 4, 0, 3, 6, 2, 5, 5, 2, 6, 3, 7, 4, 8], SymId.cClef, S),
    ci(ClefType.C4, 4, 37, [6, 2, 5, 1, 4, 0, 3, 3, 0, 4, 1, 5, 2, 6], SymId.cClef, S),
    ci(ClefType.C5, 5, 35, [4, 0, 3, -1, 2, 5, 1, 1, 5, 2, 6, 3, 7, 4], SymId.cClef, S),
    ci(ClefType.C_19C, 2, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.cClefSquare, S),
    ci(ClefType.C1_F18C, 1, 43, [5, 1, 4, 0, 3, -1, 2, 2, 6, 3, 7, 4, 8, 5], SymId.cClefFrench, S),
    ci(ClefType.C3_F18C, 3, 39, [1, 4, 0, 3, 6, 2, 5, 5, 2, 6, 3, 7, 4, 8], SymId.cClefFrench, S),
    ci(ClefType.C4_F18C, 4, 37, [6, 2, 5, 1, 4, 0, 3, 3, 0, 4, 1, 5, 2, 6], SymId.cClefFrench, S),
    ci(ClefType.C1_F20C, 1, 43, [5, 1, 4, 0, 3, -1, 2, 2, 6, 3, 7, 4, 8, 5], SymId.cClefFrench20C, S),
    ci(ClefType.C3_F20C, 3, 39, [1, 4, 0, 3, 6, 2, 5, 5, 2, 6, 3, 7, 4, 8], SymId.cClefFrench20C, S),
    ci(ClefType.C4_F20C, 4, 37, [6, 2, 5, 1, 4, 0, 3, 3, 0, 4, 1, 5, 2, 6], SymId.cClefFrench20C, S),

    ci(ClefType.F, 4, 33, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef, S),
    ci(ClefType.F15_MB, 4, 19, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef15mb, S),
    ci(ClefType.F8_VB, 4, 26, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef8vb, S),
    ci(ClefType.F_8VA, 4, 40, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef8va, S),
    ci(ClefType.F_15MA, 4, 47, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef15ma, S),
    ci(ClefType.F_B, 3, 35, [4, 0, 3, -1, 2, 5, 1, 1, 5, 2, 6, 3, 7, 4], SymId.fClef, S),
    ci(ClefType.F_C, 5, 31, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.fClef, S),
    ci(ClefType.F_F18C, 4, 33, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClefFrench, S),
    ci(ClefType.F_19C, 4, 33, [2, 5, 1, 4, 7, 3, 6, 6, 3, 7, 4, 8, 5, 9], SymId.fClef19thCentury, S),

    ci(ClefType.PERC, 2, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.unpitchedPercussionClef1, StaffGroup.PERCUSSION),
    ci(ClefType.PERC2, 2, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.unpitchedPercussionClef2, StaffGroup.PERCUSSION),

    ci(ClefType.TAB, 5, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.sixStringTabClef, StaffGroup.TAB),
    ci(ClefType.TAB4, 5, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.fourStringTabClef, StaffGroup.TAB),
    ci(ClefType.TAB_SERIF, 5, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.sixStringTabClefSerif, StaffGroup.TAB),
    ci(ClefType.TAB4_SERIF, 5, 45, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.fourStringTabClefSerif, StaffGroup.TAB),

    ci(ClefType.C4_8VB, 4, 30, [6, 2, 5, 1, 4, 0, 3, 3, 0, 4, 1, 5, 2, 6], SymId.cClef8vb, S),
    ci(ClefType.G8_VB_C, 2, 38, [0, 3, -1, 2, 5, 1, 4, 4, 1, 5, 2, 6, 3, 7], SymId.gClef8vbCClef, S),
]

export const ClefInfo = {
    line: (t: ClefType): number => CLEF_TABLE[t].line,
    pitchOffset: (t: ClefType): number => CLEF_TABLE[t].pitchOffset,
    symId: (t: ClefType): SymId => CLEF_TABLE[t].symId,
    lines: (t: ClefType): readonly number[] => CLEF_TABLE[t].lines,
    staffGroup: (t: ClefType): StaffGroup => CLEF_TABLE[t].staffGroup,
}

export class ClefList extends SortedMap<ClefTypeList> {
    clef(tick: number): ClefTypeList {
        if (this.empty()) {
            return new ClefTypeList(ClefType.INVALID, ClefType.INVALID)
        }
        const i = this.upperBound(tick)
        if (i === 0) {
            return new ClefTypeList(ClefType.INVALID, ClefType.INVALID)
        }
        return this.valueAt(i - 1)
    }

    setClef(tick: number, ctl: ClefTypeList): void {
        this.set(tick, ctl.clone())
    }

    /** return the tick at which the clef after tick is located, -1 if no such clef */
    nextClefTick(tick: number): number {
        if (this.empty()) {
            return -1
        }
        const i = this.upperBound(tick + 1)
        return i === this.size() ? -1 : this.keyAt(i)
    }

    /** return the tick position of the clef currently in effect at tick */
    currentClefTick(tick: number): number {
        if (this.empty()) {
            return 0
        }
        const i = this.upperBound(tick)
        if (i === 0) {
            return 0
        }
        return this.keyAt(i - 1)
    }
}
