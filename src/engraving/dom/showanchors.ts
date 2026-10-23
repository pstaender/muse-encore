/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of ShowAnchors of src/engraving/dom/score.h (a module of its own: score.ts and anchors.ts use it)
 */

import { Fraction } from '../types/fraction'
import { nidx, type staff_idx_t } from '../types/types'

/** C++ ShowAnchors (score.h): the region of the time tick anchors shown while an element is edited or dragged */
export class ShowAnchors {
    voiceIdx: number = nidx
    staffIdx: staff_idx_t = nidx
    endStaffIdx: staff_idx_t = nidx
    startTickMainRegion = new Fraction(-1, 1)
    endTickMainRegion = new Fraction(-1, 1)
    startTickExtendedRegion = new Fraction(-1, 1)
    endTickExtendedRegion = new Fraction(-1, 1)

    static create(vIdx: number, stfIdx: staff_idx_t, sTickMain: Fraction, eTickMain: Fraction, sTickExt: Fraction,
        eTickExt: Fraction, endStfIdx: staff_idx_t = stfIdx + 1): ShowAnchors {
        const a = new ShowAnchors()
        a.voiceIdx = vIdx
        a.staffIdx = stfIdx
        a.endStaffIdx = endStfIdx
        a.startTickMainRegion = sTickMain
        a.endTickMainRegion = eTickMain
        a.startTickExtendedRegion = sTickExt
        a.endTickExtendedRegion = eTickExt
        return a
    }

    reset(): void {
        this.voiceIdx = nidx
        this.staffIdx = nidx
        this.startTickMainRegion = new Fraction(-1, 1)
        this.endTickMainRegion = new Fraction(-1, 1)
        this.startTickExtendedRegion = new Fraction(-1, 1)
        this.endTickExtendedRegion = new Fraction(-1, 1)
    }
}
