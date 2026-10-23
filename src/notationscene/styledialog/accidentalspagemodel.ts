/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/accidentalspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class AccidentalsPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.bracketedAccidentalPadding,
            Sid.accidentalOrderFollowsNoteDisplacement,
            Sid.alignAccidentalOctavesAcrossSubChords,
            Sid.keepAccidentalSecondsTogether,
            Sid.alignOffsetOctaveAccidentals,
        ])
    }

    bracketedAccidentalPadding(): StyleItem { return this.styleItem(Sid.bracketedAccidentalPadding) }
    accidFollowNoteOffset(): StyleItem { return this.styleItem(Sid.accidentalOrderFollowsNoteDisplacement) }
    alignAccidentalOctavesAcrossSubChords(): StyleItem { return this.styleItem(Sid.alignAccidentalOctavesAcrossSubChords) }
    keepAccidentalSecondsTogether(): StyleItem { return this.styleItem(Sid.keepAccidentalSecondsTogether) }
    alignOffsetOctaveAccidentals(): StyleItem { return this.styleItem(Sid.alignOffsetOctaveAccidentals) }
}
