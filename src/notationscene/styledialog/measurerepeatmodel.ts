/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/measurerepeatmodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class MeasureRepeatModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.measureRepeatNumberPos,
            Sid.mrNumberSeries,
            Sid.oneMeasureRepeatShow1,
            Sid.fourMeasureRepeatShowExtenders,
            Sid.mrNumberEveryXMeasures,
            Sid.mrNumberSeriesWithParentheses,
        ])
    }

    measureRepeatNumberPos(): StyleItem { return this.styleItem(Sid.measureRepeatNumberPos) }
    mrNumberSeries(): StyleItem { return this.styleItem(Sid.mrNumberSeries) }
    oneMeasureRepeatShow1(): StyleItem { return this.styleItem(Sid.oneMeasureRepeatShow1) }
    fourMeasureRepeatShowExtenders(): StyleItem { return this.styleItem(Sid.fourMeasureRepeatShowExtenders) }
    mrNumberEveryXMeasures(): StyleItem { return this.styleItem(Sid.mrNumberEveryXMeasures) }
    mrNumberSeriesWithParentheses(): StyleItem { return this.styleItem(Sid.mrNumberSeriesWithParentheses) }
}
