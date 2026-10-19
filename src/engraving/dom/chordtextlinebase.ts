/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/chordtextlinebase.h/.cpp
 */

import { ElementFlag } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { TextLineBase } from './textlinebase'
import { track2staff, type ElementType } from '../types/types'

export abstract class ChordTextLineBase extends TextLineBase {
    protected constructor(type: ElementType, parent: EngravingObject | null, f: number = ElementFlag.NOTHING) {
        super(type, parent, f)
    }

    protected override doComputeEndElement(): void {
        this.setEndElement(this.score().findChordRestEndingBeforeTickInStaff(this.tick2(), track2staff(this.track2())))
    }
}
