/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/notationscene/qml/MuseScore/NotationScene/styledialog/beamspagemodel.h/.cpp
 */

import { Sid } from '../../engraving/style/styledef'
import type { NotationStyle } from '../../notation/internal/notationstyle'
import { AbstractStyleDialogModel } from './abstractstyledialogmodel'
import type { StyleItem } from './styleitem'

export class BeamsPageModel extends AbstractStyleDialogModel {
    constructor(style: NotationStyle) {
        super(style, [
            Sid.useWideBeams,
            Sid.beamWidth,
            Sid.beamMinLen,
            Sid.beamNoSlope,
            Sid.frenchStyleBeams,
        ])
    }

    useWideBeams(): StyleItem { return this.styleItem(Sid.useWideBeams) }
    beamWidth(): StyleItem { return this.styleItem(Sid.beamWidth) }
    beamMinLen(): StyleItem { return this.styleItem(Sid.beamMinLen) }
    beamNoSlope(): StyleItem { return this.styleItem(Sid.beamNoSlope) }
    frenchStyleBeams(): StyleItem { return this.styleItem(Sid.frenchStyleBeams) }
}
