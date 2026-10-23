/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/whammybar.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, HookType, TextPlace, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ChordTextLineBase } from './chordtextlinebase'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { LineSegment } from './line'
import type { System } from './system'
import { TextLineBaseSegment } from './textlinebase'

const whammyBarStyle: ElementStyle = [
    { sid: Sid.whammyBarFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.whammyBarFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.whammyBarFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.whammyBarFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.whammyBarFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.whammyBarFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.whammyBarFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.whammyBarFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.whammyBarFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.whammyBarTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.whammyBarTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.whammyBarTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.whammyBarPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.whammyBarPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.whammyBarPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.whammyBarHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.whammyBarHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.whammyBarLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.whammyBarDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.whammyBarDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.whammyBarFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.whammyBarEndHookType, pid: Pid.END_HOOK_TYPE },
    { sid: Sid.whammyBarLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.whammyBarText, pid: Pid.BEGIN_TEXT },

    { sid: Sid.whammyBarMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.whammyBarMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.whammyBarMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const whammyBarSegmentStyle: ElementStyle = [
    { sid: Sid.letRingMinDistance, pid: Pid.MIN_DISTANCE },
]

export class WhammyBarSegment extends TextLineBaseSegment {
    constructor(sp: WhammyBar | null, parent: System | null) {
        super(ElementType.WHAMMY_BAR_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    whammyBar(): WhammyBar { return this.spanner() as WhammyBar }
}

export class WhammyBar extends ChordTextLineBase {
    constructor(parent: EngravingObject | null) {
        super(ElementType.WHAMMY_BAR, parent)
        this.initElementStyle(whammyBarStyle)
        this.resetProperty(Pid.LINE_VISIBLE)

        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const wb = new WhammyBarSegment(this, parent)
        wb.setTrack(this.track())
        wb.initElementStyle(whammyBarSegmentStyle)
        return wb
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            return this.style().styleV(Sid.whammyBarLineWidth)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.whammyBarLineStyle)
        case Pid.LINE_VISIBLE:
            return true
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_FONT_STYLE:
            return this.style().styleV(Sid.whammyBarFontStyle)
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
            return this.style().styleV(Sid.whammyBarText) // TODO: fix the style
        case Pid.END_TEXT:
            return ''
        case Pid.BEGIN_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.AUTO
        case Pid.TEXT_STYLE:
            return TextStyleType.WHAMMY_BAR
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: // No arrow endings for whammy bar
        case Pid.BEGIN_FILLED_ARROW_WIDTH:
        case Pid.END_FILLED_ARROW_HEIGHT:
        case Pid.END_FILLED_ARROW_WIDTH:
        case Pid.BEGIN_LINE_ARROW_HEIGHT:
        case Pid.BEGIN_LINE_ARROW_WIDTH:
        case Pid.END_LINE_ARROW_HEIGHT:
        case Pid.END_LINE_ARROW_WIDTH:
            return 0.0
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override getPropertyStyle(id: Pid): Sid {
        switch (id) {
        case Pid.PLACEMENT:
            return Sid.ottava8VAPlacement // TODO: fix the style
        case Pid.BEGIN_FONT_FACE:
            return Sid.whammyBarFontFace
        case Pid.BEGIN_FONT_SIZE:
        case Pid.CONTINUE_FONT_SIZE:
        case Pid.END_FONT_SIZE:
            return Sid.whammyBarFontSize
        case Pid.BEGIN_FONT_STYLE:
        case Pid.CONTINUE_FONT_STYLE:
        case Pid.END_FONT_STYLE:
            return Sid.whammyBarFontStyle
        case Pid.BEGIN_TEXT_ALIGN:
        case Pid.CONTINUE_TEXT_ALIGN:
        case Pid.END_TEXT_ALIGN:
            return Sid.whammyBarTextAlign
        case Pid.BEGIN_HOOK_HEIGHT:
        case Pid.END_HOOK_HEIGHT:
            return Sid.whammyBarHookHeight
        default:
            break
        }
        return super.getPropertyStyle(id)
    }
}
