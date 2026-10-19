/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/rw/compat/tremolocompat.h
 */

import type { Chord } from '../../dom/chord'
import type { TremoloSingleChord } from '../../dom/tremolosinglechord'
import type { TremoloTwoChord } from '../../dom/tremolotwochord'

export interface TremoloCompat {
    parent: Chord | null
    single: TremoloSingleChord | null
    two: TremoloTwoChord | null
}
