/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/bendspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class BendsPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.guitarBendUseFull,
            Sid.guitarBendLineWidth,
            Sid.guitarBendLineWidthTab,
            Sid.guitarBendArrowWidth,
            Sid.guitarBendArrowHeight,
            Sid.guitarDivesAboveStaff,
            Sid.useCueSizeFretForGraceBends,
            Sid.useFractionCharacters,
            Sid.alignPreBendAndPreDiveToGraceNote,
            Sid.guitarDiveLineWidth,
            Sid.guitarDiveLineWidthTab,
            Sid.whammyBarText,
            Sid.whammyBarLineStyle,
            Sid.whammyBarDashLineLen,
            Sid.whammyBarDashGapLen,
            Sid.whammyBarLineWidth,
        ])
    }

    guitarBendUseFull(): StyleItem { return this.styleItem(Sid.guitarBendUseFull) }
    guitarBendLineWidth(): StyleItem { return this.styleItem(Sid.guitarBendLineWidth) }
    guitarBendLineWidthTab(): StyleItem { return this.styleItem(Sid.guitarBendLineWidthTab) }
    guitarBendArrowWidth(): StyleItem { return this.styleItem(Sid.guitarBendArrowWidth) }
    guitarBendArrowHeight(): StyleItem { return this.styleItem(Sid.guitarBendArrowHeight) }
    guitarDivesAboveStaff(): StyleItem { return this.styleItem(Sid.guitarDivesAboveStaff) }
    useCueSizeFretForGraceBends(): StyleItem { return this.styleItem(Sid.useCueSizeFretForGraceBends) }
    useFractionCharacters(): StyleItem { return this.styleItem(Sid.useFractionCharacters) }
    alignPreBendAndPreDiveToGraceNote(): StyleItem { return this.styleItem(Sid.alignPreBendAndPreDiveToGraceNote) }
    guitarDiveLineWidth(): StyleItem { return this.styleItem(Sid.guitarDiveLineWidth) }
    guitarDiveLineWidthTab(): StyleItem { return this.styleItem(Sid.guitarDiveLineWidthTab) }
    whammyBarText(): StyleItem { return this.styleItem(Sid.whammyBarText) }
    whammyBarLineStyle(): StyleItem { return this.styleItem(Sid.whammyBarLineStyle) }
    whammyBarDashLineLen(): StyleItem { return this.styleItem(Sid.whammyBarDashLineLen) }
    whammyBarDashGapLen(): StyleItem { return this.styleItem(Sid.whammyBarDashGapLen) }
    whammyBarLineWidth(): StyleItem { return this.styleItem(Sid.whammyBarLineWidth) }
}
