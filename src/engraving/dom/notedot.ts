/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/notedot.h/.cpp
 */

import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag } from './engravingitem'
import { noteFactories, type Note } from './note'
import { restFactories, type Rest } from './rest'

export class NoteDot extends EngravingItem {
    constructor(parent: Note | Rest | null) {
        super(ElementType.NOTEDOT, parent)
        this.setFlag(ElementFlag.MOVABLE, false)
    }

    note(): Note | null { return this.explicitParent()!.isNote() ? this.explicitParent() as unknown as Note : null }
    rest(): Rest | null { return this.explicitParent()!.isRest() ? this.explicitParent() as unknown as Rest : null }

    override elementBase(): EngravingItem { return this.parentItem()! }

    override mag(): number {
        return this.parentItem()!.mag() * this.style().styleD(Sid.dotMag)
    }
}

noteFactories.createNoteDot = (note: Note) => new NoteDot(note)
restFactories.createNoteDot = (rest: Rest) => new NoteDot(rest)
