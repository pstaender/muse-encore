/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/measurenumberbase.h/.cpp
 */

import { TextStyleType, type ElementType } from '../types/types'
import { ElementFlag } from './engravingitem'
import { TextBase } from './textbase'
import type { Measure } from './measure'

export abstract class MeasureNumberBase extends TextBase {
    constructor(type: ElementType, parent: Measure | null, tid: TextStyleType = TextStyleType.DEFAULT) {
        super(type, parent, tid, ElementFlag.ON_STAFF)
    }

    measure(): Measure { return this.explicitParent() as unknown as Measure }
    override positionRelativeToNoteheadRest(): boolean { return false }
}
