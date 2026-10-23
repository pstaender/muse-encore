/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/hammeronpullofftappingpagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class HammerOnPullOffTappingPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.hopoShowOnStandardStaves,
            Sid.hopoShowOnTabStaves,
            Sid.hopoUpperCase,
            Sid.hopoShowAll,
            Sid.lhTappingSymbolNormalStave,
            Sid.lhTappingSymbolTab,
            Sid.lhTappingShowItemsNormalStave,
            Sid.lhTappingShowItemsTab,
            Sid.lhTappingSlurTopAndBottomNoteOnTab,
            Sid.rhTappingSymbolNormalStave,
            Sid.rhTappingSymbolTab,
            Sid.hopoAlignLettersStandardStaves,
            Sid.hopoAlignLettersTabStaves,
        ])
    }

    showOnStandardStaves(): StyleItem { return this.styleItem(Sid.hopoShowOnStandardStaves) }
    showOnTabStaves(): StyleItem { return this.styleItem(Sid.hopoShowOnTabStaves) }
    hopoUpperCase(): StyleItem { return this.styleItem(Sid.hopoUpperCase) }
    hopoShowAll(): StyleItem { return this.styleItem(Sid.hopoShowAll) }
    lhTappingSymbolNormalStave(): StyleItem { return this.styleItem(Sid.lhTappingSymbolNormalStave) }
    lhTappingSymbolTab(): StyleItem { return this.styleItem(Sid.lhTappingSymbolTab) }
    lhTappingShowItemsNormalStave(): StyleItem { return this.styleItem(Sid.lhTappingShowItemsNormalStave) }
    lhTappingShowItemsTab(): StyleItem { return this.styleItem(Sid.lhTappingShowItemsTab) }
    lhTappingSlurTopAndBottomNoteOnTab(): StyleItem { return this.styleItem(Sid.lhTappingSlurTopAndBottomNoteOnTab) }
    rhTappingSymbolNormalStave(): StyleItem { return this.styleItem(Sid.rhTappingSymbolNormalStave) }
    rhTappingSymbolTab(): StyleItem { return this.styleItem(Sid.rhTappingSymbolTab) }
    hopoAlignLettersStandardStaves(): StyleItem { return this.styleItem(Sid.hopoAlignLettersStandardStaves) }
    hopoAlignLettersTabStaves(): StyleItem { return this.styleItem(Sid.hopoAlignLettersTabStaves) }
}
