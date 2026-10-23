/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/fretboardspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class FretboardsPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.fretY,
            Sid.fretMinDistance,
            Sid.fretMag,
            Sid.fretOrientation,
            Sid.fretNutThickness,
            Sid.fretNumPos,
            Sid.fretUseCustomSuffix,
            Sid.fretCustomSuffix,
            Sid.fretDotSpatiumSize,
            Sid.barreAppearanceSlur,
            Sid.barreLineWidth,
            Sid.fretShowFingerings,
            Sid.fretStyleExtended,
            Sid.fretStringSpacing,
            Sid.fretFretSpacing,
        ])
    }

    fretY(): StyleItem { return this.styleItem(Sid.fretY) }
    fretMinDistance(): StyleItem { return this.styleItem(Sid.fretMinDistance) }
    fretMag(): StyleItem { return this.styleItem(Sid.fretMag) }
    fretOrientation(): StyleItem { return this.styleItem(Sid.fretOrientation) }
    fretNutThickness(): StyleItem { return this.styleItem(Sid.fretNutThickness) }
    fretNumPos(): StyleItem { return this.styleItem(Sid.fretNumPos) }
    fretUseCustomSuffix(): StyleItem { return this.styleItem(Sid.fretUseCustomSuffix) }
    fretCustomSuffix(): StyleItem { return this.styleItem(Sid.fretCustomSuffix) }
    fretDotSpatiumSize(): StyleItem { return this.styleItem(Sid.fretDotSpatiumSize) }
    barreAppearanceSlur(): StyleItem { return this.styleItem(Sid.barreAppearanceSlur) }
    barreLineWidth(): StyleItem { return this.styleItem(Sid.barreLineWidth) }
    fretShowFingerings(): StyleItem { return this.styleItem(Sid.fretShowFingerings) }
    fretStyleExtended(): StyleItem { return this.styleItem(Sid.fretStyleExtended) }
    fretStringSpacing(): StyleItem { return this.styleItem(Sid.fretStringSpacing) }
    fretFretSpacing(): StyleItem { return this.styleItem(Sid.fretFretSpacing) }
}
