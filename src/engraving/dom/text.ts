/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/text.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { TextBase } from './textbase'

const defaultStyle: ElementStyle = [
    { sid: Sid.defaultSystemFlag, pid: Pid.SYSTEM_FLAG },
]

function styleIsSelectable(style: TextStyleType): boolean {
    switch (style) {
    case TextStyleType.HEADER:
    case TextStyleType.FOOTER:
    case TextStyleType.COPYRIGHT:
    case TextStyleType.PAGE_NUMBER:
        return false
    default:
        return true
    }
}

export class Text extends TextBase {
    constructor(parent: EngravingObject | null, tid: TextStyleType = TextStyleType.DEFAULT) {
        super(ElementType.TEXT, parent, tid, styleIsSelectable(tid) ? ElementFlag.NOTHING : ElementFlag.NOT_SELECTABLE)
        this.initElementStyle(defaultStyle)
    }

    override hasVoiceAssignmentProperties(): boolean {
        const parent = this.parentItem()
        if (parent && parent.isTextLineBaseSegment()) {
            return parent.hasVoiceAssignmentProperties()
        }
        return false
    }

    override propertyDelegate(id: Pid): EngravingObject | null {
        const p = this.parent()
        if (id === Pid.TEXT_STYLE && p && p.isTextLineBaseSegment()) {
            return p
        }
        return null
    }

    override propertyDefault(id: Pid): PropertyValue {
        const item = this.propertyDelegate(id)
        if (item) {
            return item.propertyDefault(id)
        }
        if (id === Pid.TEXT_STYLE) {
            return TextStyleType.DEFAULT
        }
        return super.propertyDefault(id)
    }

    setLayoutToParentWidth(v: boolean): void { this.m_layoutToParentWidth = v }

    override collectForDrawing(): boolean {
        return !(this.parent() && this.parent()!.isTuplet())
    }

    override positionRelativeToNoteheadRest(): boolean {
        const p = this.parent()!
        if (p.isBox() || p.isTuplet() || p.isSpannerSegment()) {
            return false
        }
        return true
    }
}
