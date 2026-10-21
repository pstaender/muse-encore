/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/elementgroup.h/.cpp
 */

import { RectF } from '../../framework/draw/types/geometry'
import type { EditData } from '../editing/editdata'
import type { EngravingItem } from './engravingitem'

/** Base class for implementing logic to handle groups of elements together in certain operations. */
export abstract class ElementGroup {
    abstract startDrag(ed: EditData): void
    abstract drag(ed: EditData): RectF
    abstract endDrag(ed: EditData): void

    enabled(): boolean { return true }
}

export class DisabledElementGroup extends ElementGroup {
    override enabled(): boolean { return false }

    startDrag(_ed: EditData): void {}
    drag(_ed: EditData): RectF { return new RectF() }
    endDrag(_ed: EditData): void {}
}

/** EngravingItem group for single element. */
export class SingleElementGroup extends ElementGroup {
    constructor(private m_e: EngravingItem) {
        super()
    }

    startDrag(ed: EditData): void {
        this.m_e.startDrag(ed)
    }

    drag(ed: EditData): RectF {
        return this.m_e.drag(ed)
    }

    endDrag(ed: EditData): void {
        this.m_e.endDrag(ed)
        this.m_e.triggerLayout()
    }
}
