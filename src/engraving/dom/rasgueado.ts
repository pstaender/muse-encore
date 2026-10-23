/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/rasgueado.h/.cpp
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

const rasgueadoStyle: ElementStyle = [
    { sid: Sid.letRingFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.letRingFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.letRingFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.letRingFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.letRingFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.letRingFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.letRingFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.letRingFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.letRingFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.letRingTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.letRingTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.letRingTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.letRingPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.letRingPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.letRingPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.letRingHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.letRingHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.letRingLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.letRingDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.letRingDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.letRingFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.letRingEndHookType, pid: Pid.END_HOOK_TYPE },
    { sid: Sid.letRingLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.ottava8VAPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.letRingMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.letRingMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.letRingMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const rasgueadoSegmentStyle: ElementStyle = [
    { sid: Sid.letRingMinDistance, pid: Pid.MIN_DISTANCE },
]

export class RasgueadoSegment extends TextLineBaseSegment {
    constructor(sp: Rasgueado | null, parent: System | null) {
        super(ElementType.RASGUEADO_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    rasgueado(): Rasgueado { return this.spanner() as Rasgueado }
}

export class Rasgueado extends ChordTextLineBase {
    constructor(parent: EngravingObject | null) {
        super(ElementType.RASGUEADO, parent)
        this.initElementStyle(rasgueadoStyle)
        this.resetProperty(Pid.LINE_VISIBLE)

        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new RasgueadoSegment(this, parent)
        seg.setTrack(this.track())
        seg.initElementStyle(rasgueadoSegmentStyle)
        return seg
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            return this.style().styleV(Sid.letRingLineWidth)
        case Pid.ALIGN:
            return new Align(AlignH.LEFT, AlignV.BASELINE)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.letRingLineStyle)
        case Pid.LINE_VISIBLE:
            return true
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_FONT_STYLE:
            return this.style().styleV(Sid.letRingFontStyle)
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
            return 'rasg' // TODO: fix the style
        case Pid.END_TEXT:
            return ''
        case Pid.BEGIN_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.AUTO
        case Pid.TEXT_STYLE:
            return TextStyleType.LET_RING
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: // No arrow endings for rasguedo
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
            return Sid.ottava8VAPlacement
        case Pid.BEGIN_FONT_FACE:
            return Sid.letRingFontFace
        case Pid.BEGIN_FONT_SIZE:
        case Pid.CONTINUE_FONT_SIZE:
        case Pid.END_FONT_SIZE:
            return Sid.letRingFontSize
        case Pid.BEGIN_FONT_STYLE:
        case Pid.CONTINUE_FONT_STYLE:
        case Pid.END_FONT_STYLE:
            return Sid.letRingFontStyle
        case Pid.BEGIN_TEXT_ALIGN:
        case Pid.CONTINUE_TEXT_ALIGN:
        case Pid.END_TEXT_ALIGN:
            return Sid.letRingTextAlign
        case Pid.BEGIN_HOOK_HEIGHT:
        case Pid.END_HOOK_HEIGHT:
            return Sid.letRingHookHeight
        default:
            break
        }
        return super.getPropertyStyle(id)
    }
}
