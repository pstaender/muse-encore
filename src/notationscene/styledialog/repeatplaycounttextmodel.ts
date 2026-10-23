/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/repeatplaycounttextmodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'
import { qtrc } from '../../framework/global/translation'
import { RepeatPlayCountPreset } from '../../engraving/types/types'

export class RepeatPlayCountTextModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.repeatPlayCountPreset,
            Sid.repeatPlayCountShow,
            Sid.repeatPlayCountShowSingleRepeats,
        ])
    }

    repeatTextPreset(): StyleItem { return this.styleItem(Sid.repeatPlayCountPreset) }
    repeatPlayCountShow(): StyleItem { return this.styleItem(Sid.repeatPlayCountShow) }
    repeatPlayCountShowSingleRepeats(): StyleItem { return this.styleItem(Sid.repeatPlayCountShowSingleRepeats) }

    textPresetOptions(): { text: string; value: number }[] {
        return [
            { text: qtrc('notation/editstyle/repeatplaycount', 'x3'), value: RepeatPlayCountPreset.X_N },
            { text: qtrc('notation/editstyle/repeatplaycount', '3x'), value: RepeatPlayCountPreset.N_X },
            { text: qtrc('notation/editstyle/repeatplaycount', 'Play 3 times'), value: RepeatPlayCountPreset.PLAY_N_TIMES },
            { text: qtrc('notation/editstyle/repeatplaycount', '3 repeats'), value: RepeatPlayCountPreset.N_REPEATS },
        ]
    }
}
