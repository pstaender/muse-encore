/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/repeatbarlinessectionmodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class RepeatBarlinesSectionModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.barlineBeforeSigChange,
            Sid.doubleBarlineBeforeKeySig,
            Sid.doubleBarlineBeforeTimeSig,
        ])
    }

    barlineBeforeSigChange(): StyleItem { return this.styleItem(Sid.barlineBeforeSigChange) }
    doubleBarlineBeforeKeySig(): StyleItem { return this.styleItem(Sid.doubleBarlineBeforeKeySig) }
    doubleBarlineBeforeTimeSig(): StyleItem { return this.styleItem(Sid.doubleBarlineBeforeTimeSig) }
}
