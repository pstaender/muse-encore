/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/voltaspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class VoltasPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.voltaPosAbove,
            Sid.voltaHook,
            Sid.voltaLineWidth,
            Sid.voltaLineStyle,
            Sid.voltaDashLineLen,
            Sid.voltaDashGapLen,
            Sid.voltaAlignStartBeforeKeySig,
            Sid.voltaAlignEndLeftOfBarline,
        ])
    }

    voltaPosAbove(): StyleItem { return this.styleItem(Sid.voltaPosAbove) }
    voltaHook(): StyleItem { return this.styleItem(Sid.voltaHook) }
    voltaLineWidth(): StyleItem { return this.styleItem(Sid.voltaLineWidth) }
    voltaLineStyle(): StyleItem { return this.styleItem(Sid.voltaLineStyle) }
    voltaDashLineLen(): StyleItem { return this.styleItem(Sid.voltaDashLineLen) }
    voltaDashGapLen(): StyleItem { return this.styleItem(Sid.voltaDashGapLen) }
    voltaAlignStartBeforeKeySig(): StyleItem { return this.styleItem(Sid.voltaAlignStartBeforeKeySig) }
    voltaAlignEndLeftOfBarline(): StyleItem { return this.styleItem(Sid.voltaAlignEndLeftOfBarline) }
}
