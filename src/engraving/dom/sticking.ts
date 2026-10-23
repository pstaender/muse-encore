/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/sticking.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Segment } from './segment'
import { TextBase, isTextNavigationKey } from './textbase'
import { KeyboardKey, type EditData } from '../editing/editdata'

const stickingStyle: ElementStyle = [
    { sid: Sid.stickingPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.stickingMinDistance, pid: Pid.MIN_DISTANCE },
]

export class Sticking extends TextBase {
    constructor(parent: EngravingObject | null) {
        super(ElementType.STICKING, parent, TextStyleType.STICKING, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(stickingStyle)
    }

    segment(): Segment | null {
        const p = this.explicitParent()
        return p && p.isSegment() ? p as unknown as Segment : null
    }

    override isEditAllowed(ed: EditData): boolean {
        if (isTextNavigationKey(ed.key, ed.modifiers)) {
            return false
        }

        if (ed.key === KeyboardKey.Key_Left) {
            return this.cursor().column() !== 0 || this.cursor().hasSelection()
        }

        if (ed.key === KeyboardKey.Key_Right) {
            const cursorInLastColumn = this.cursor().column() === this.cursor().curLine().columns()
            return !cursorInLastColumn || this.cursor().hasSelection()
        }

        return super.isEditAllowed(ed)
    }

    override positionRelativeToNoteheadRest(): boolean { return true }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE:
            return TextStyleType.STICKING
        default:
            return super.propertyDefault(id)
        }
    }
}
