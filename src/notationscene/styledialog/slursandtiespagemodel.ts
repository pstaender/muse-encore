/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/slursandtiespagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class SlursAndTiesPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.slurEndWidth,
            Sid.slurMidWidth,
            Sid.slurDottedWidth,
            Sid.slurMinDistance,
            Sid.angleHangingSlursAwayFromStaff,
            Sid.tieEndWidth,
            Sid.tieMidWidth,
            Sid.tieDottedWidth,
            Sid.tieMinDistance,
            Sid.minTieLength,
            Sid.minHangingTieLength,
            Sid.tiePlacementSingleNote,
            Sid.tiePlacementChord,
            Sid.tieDotsPlacement,
            Sid.minLaissezVibLength,
            Sid.laissezVibUseSmuflSym,
        ])
    }

    slurEndWidth(): StyleItem { return this.styleItem(Sid.slurEndWidth) }
    slurMidWidth(): StyleItem { return this.styleItem(Sid.slurMidWidth) }
    slurDottedWidth(): StyleItem { return this.styleItem(Sid.slurDottedWidth) }
    slurMinDistance(): StyleItem { return this.styleItem(Sid.slurMinDistance) }
    angleHangingSlursAwayFromStaff(): StyleItem { return this.styleItem(Sid.angleHangingSlursAwayFromStaff) }
    tieEndWidth(): StyleItem { return this.styleItem(Sid.tieEndWidth) }
    tieMidWidth(): StyleItem { return this.styleItem(Sid.tieMidWidth) }
    tieDottedWidth(): StyleItem { return this.styleItem(Sid.tieDottedWidth) }
    tieMinDistance(): StyleItem { return this.styleItem(Sid.tieMinDistance) }
    minTieLength(): StyleItem { return this.styleItem(Sid.minTieLength) }
    minHangingTieLength(): StyleItem { return this.styleItem(Sid.minHangingTieLength) }
    tiePlacementSingleNote(): StyleItem { return this.styleItem(Sid.tiePlacementSingleNote) }
    tiePlacementChord(): StyleItem { return this.styleItem(Sid.tiePlacementChord) }
    tieDotsPlacement(): StyleItem { return this.styleItem(Sid.tieDotsPlacement) }
    minLaissezVibLength(): StyleItem { return this.styleItem(Sid.minLaissezVibLength) }
    laissezVibUseSmuflSym(): StyleItem { return this.styleItem(Sid.laissezVibUseSmuflSym) }
}
