/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/glissandosectionmodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class GlissandoSectionModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.glissandoLineStyle,
            Sid.glissandoDashLineLen,
            Sid.glissandoDashGapLen,
            Sid.glissandoLineWidth,
            Sid.glissandoShowText,
            Sid.glissandoText,
            Sid.glissandoType,
        ])
    }

    glissandoLineStyle(): StyleItem { return this.styleItem(Sid.glissandoLineStyle) }
    glissandoLineStyleDashSize(): StyleItem { return this.styleItem(Sid.glissandoDashLineLen) }
    glissandoLineStyleGapSize(): StyleItem { return this.styleItem(Sid.glissandoDashGapLen) }
    glissandoLineWidth(): StyleItem { return this.styleItem(Sid.glissandoLineWidth) }
    glissandoShowText(): StyleItem { return this.styleItem(Sid.glissandoShowText) }
    glissandoText(): StyleItem { return this.styleItem(Sid.glissandoText) }
    glissandoLineType(): StyleItem { return this.styleItem(Sid.glissandoType) }
}
