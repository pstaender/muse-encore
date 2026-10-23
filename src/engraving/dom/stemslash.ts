/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stemslash.h/.cpp
 */

import { LineF } from '../../framework/draw/types/geometry'
import { ElementType } from '../types/types'
import { EngravingItem, LayoutData } from './engravingitem'
import type { Chord } from './chord'

export class StemSlashLayoutData extends LayoutData {
    line = new LineF()
    stemWidth = 0.0
}

export class StemSlash extends EngravingItem {
    constructor(parent: Chord | null) {
        super(ElementType.STEM_SLASH, parent)
    }

    protected override createLayoutData(): StemSlashLayoutData { return new StemSlashLayoutData(this) }
    override ldata(): StemSlashLayoutData { return super.ldata() as StemSlashLayoutData }
    override mutldata(): StemSlashLayoutData { return super.ldata() as StemSlashLayoutData }

    override mag(): number { return this.parentItem()!.mag() }
    chord(): Chord { return this.explicitParent() as unknown as Chord }
}
