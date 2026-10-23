/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/importexport/guitarpro/internal/guitarbendimport/benddatacontext.h
 */

import type { track_idx_t } from '../../../../engraving/types/types'
import type { bend_data_map_t, FractionMap, grace_bend_data_map_t } from './guitarbendimporttypes'
import type { BendDataContextSplitChord } from './splitchord/benddatacontextsplitchord'

// if SPLIT_CHORD_DURATIONS is true: chord with bend is split to several chords, tied chords may be removed or replaced according to new ticks
// otherwise - "grace note after" is placed where the "small note head" was in guitar pro, and normal note is placed where normal note was in guitar pro
// (C++ #define SPLIT_CHORD_DURATIONS 1, not defined in MuseScore)
export const SPLIT_CHORD_DURATIONS = false

export class BendDataContext {
    graceAfterBendData = new Map<track_idx_t, FractionMap<grace_bend_data_map_t>>()
    tiedNotesBendsData = new Map<track_idx_t, FractionMap<bend_data_map_t>>()
    prebendData = new Map<track_idx_t, FractionMap<bend_data_map_t>>()
    slightBendData = new Map<track_idx_t, FractionMap<bend_data_map_t>>()
    splitChordCtx: BendDataContextSplitChord | null = null
}
