/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/notelinesectionmodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class NoteLineSectionModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.noteLineStyle,
            Sid.noteLineDashLineLen,
            Sid.noteLineDashGapLen,
            Sid.noteLineWidth,
        ])
    }

    noteLineStyle(): StyleItem { return this.styleItem(Sid.noteLineStyle) }
    noteLineStyleDashSize(): StyleItem { return this.styleItem(Sid.noteLineDashLineLen) }
    noteLineStyleGapSize(): StyleItem { return this.styleItem(Sid.noteLineDashGapLen) }
    noteLineWidth(): StyleItem { return this.styleItem(Sid.noteLineWidth) }
}
