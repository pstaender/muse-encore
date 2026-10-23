/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/splitchord/benddatacontextsplitchord.h
 *
 * The std::map<int, ...> members are Maps; their users iterate them in ascending key order.
 */

import type { Fraction } from '../../../../../engraving/types/fraction'
import type { track_idx_t } from '../../../../../engraving/types/types'
import type { BendChordData, FractionSet } from '../guitarbendimporttypes'

export class BendDataContextSplitChord {
    bendDataByEndTick = new Map<track_idx_t, Map<number, BendChordData>>()
    bendChordDurations = new Map<track_idx_t, Map<number, Fraction[]>>()
    reduntantChordTicks = new Map<track_idx_t, FractionSet>()
    chordTicksForTieBack = new Map<track_idx_t, FractionSet>()
}
