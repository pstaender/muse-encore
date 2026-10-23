/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/restspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class RestsPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.multiVoiceRestTwoSpaceOffset,
            Sid.mergeMatchingRests,
        ])
    }

    multiVoiceRestTwoSpaceOffset(): StyleItem { return this.styleItem(Sid.multiVoiceRestTwoSpaceOffset) }
    mergeMatchingRests(): StyleItem { return this.styleItem(Sid.mergeMatchingRests) }
}
