/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/deadslapped.h/.cpp
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import { ElementType } from '../types/types'
import { EngravingItem, LayoutData } from './engravingitem'
import type { Rest } from './rest'

export class DeadSlappedLayoutData extends LayoutData {
    path1 = new PainterPath()
    path2 = new PainterPath()
}

///    This class implements a dead slapped element.
export class DeadSlapped extends EngravingItem {
    constructor(parent: Rest | null) {
        super(ElementType.DEAD_SLAPPED, parent)
    }

    protected override createLayoutData(): DeadSlappedLayoutData { return new DeadSlappedLayoutData(this) }
    override ldata(): DeadSlappedLayoutData { return super.ldata() as DeadSlappedLayoutData }
    override mutldata(): DeadSlappedLayoutData { return super.ldata() as DeadSlappedLayoutData }
}
