/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/palmmute.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { Align, AlignH, AlignV, ElementType, HookType, TextPlace, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ChordTextLineBase } from './chordtextlinebase'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { LineSegment } from './line'
import type { System } from './system'
import { TextLineBaseSegment } from './textlinebase'

const palmMuteStyle: ElementStyle = [
    { sid: Sid.palmMuteFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.palmMuteFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.palmMuteFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.palmMuteFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.palmMuteFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.palmMuteFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.palmMuteFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.palmMuteFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.palmMuteFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.palmMuteTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.palmMuteTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.palmMuteTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.palmMutePosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.palmMutePosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.palmMutePosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.palmMuteHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.palmMuteHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.palmMutePosBelow, pid: Pid.OFFSET },
    { sid: Sid.palmMuteLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.palmMuteDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.palmMuteDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.palmMuteFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.palmMuteEndHookType, pid: Pid.END_HOOK_TYPE },
    { sid: Sid.palmMuteLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.palmMutePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.palmMutePosBelow, pid: Pid.OFFSET },
    { sid: Sid.palmMuteEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.palmMuteEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.palmMuteBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.palmMuteBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.palmMuteEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.palmMuteEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.palmMuteBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.palmMuteBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const palmMuteSegmentStyle: ElementStyle = [
    { sid: Sid.palmMutePosBelow, pid: Pid.OFFSET },
    { sid: Sid.palmMuteMinDistance, pid: Pid.MIN_DISTANCE },
]

export class PalmMuteSegment extends TextLineBaseSegment {
    constructor(sp: PalmMute | null, parent: System | null) {
        super(ElementType.PALM_MUTE_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    palmMute(): PalmMute { return this.spanner() as PalmMute }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.spanner().placeAbove() ? Sid.palmMutePosAbove : Sid.palmMutePosBelow
        }
        return super.getPropertyStyle(pid)
    }
}

export class PalmMute extends ChordTextLineBase {
    constructor(parent: EngravingObject | null) {
        super(ElementType.PALM_MUTE, parent)
        this.initElementStyle(palmMuteStyle)
        this.resetProperty(Pid.LINE_VISIBLE)

        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.placeAbove() ? Sid.palmMutePosAbove : Sid.palmMutePosBelow
        }
        return super.getPropertyStyle(pid)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const pms = new PalmMuteSegment(this, parent)
        pms.setTrack(this.track())
        pms.initElementStyle(palmMuteSegmentStyle)
        return pms
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            return this.style().styleS(Sid.palmMuteLineWidth)
        case Pid.ALIGN:
            return new Align(AlignH.LEFT, AlignV.BASELINE)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.palmMuteLineStyle)
        case Pid.LINE_VISIBLE:
            return true
        case Pid.BEGIN_TEXT_OFFSET:
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
            return this.style().styleV(Sid.palmMuteText)
        case Pid.END_TEXT:
            return ''
        case Pid.BEGIN_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.AUTO
        case Pid.TEXT_STYLE:
            return TextStyleType.PALM_MUTE
        default:
            return super.propertyDefault(propertyId)
        }
    }
}
