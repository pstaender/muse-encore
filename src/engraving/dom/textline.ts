/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/textline.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, HookType, PlacementV, TextPlace, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SpannerAnchor, type Spanner } from './spanner'
import type { System } from './system'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'
import type { LineSegment } from './line'

const textLineSegmentStyle: ElementStyle = [
    { sid: Sid.textLinePosAbove, pid: Pid.OFFSET },
    { sid: Sid.textLineMinDistance, pid: Pid.MIN_DISTANCE },
]

const systemTextLineSegmentStyle: ElementStyle = [
    { sid: Sid.systemTextLinePosAbove, pid: Pid.OFFSET },
    { sid: Sid.systemTextLineMinDistance, pid: Pid.MIN_DISTANCE },
]

const textLineStyle: ElementStyle = [
    { sid: Sid.textLineFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.textLineFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.textLineFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.textLineFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.textLineFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.textLineFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.textLineFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.textLineFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.textLineFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.textLineTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.textLineTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.textLineTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.textLinePosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.textLinePosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.textLinePosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.textLineHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.textLineHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.textLineLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.textLineDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.textLineDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.textLinePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.textLineLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.textLinePosAbove, pid: Pid.OFFSET },
    { sid: Sid.textLineFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.textLineEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.textLineEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.textLineBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.textLineBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.textLineEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.textLineEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.textLineBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.textLineBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },
    { sid: Sid.textLineMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.textLineMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.textLineMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const systemTextLineStyle: ElementStyle = [
    { sid: Sid.systemTextLineFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.systemTextLineFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.systemTextLineFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.systemTextLineFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.systemTextLineFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.systemTextLineFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.systemTextLineFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.systemTextLineFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.systemTextLineFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.systemTextLineTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.systemTextLineTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.systemTextLineTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.systemTextLineHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.systemTextLineHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.systemTextLineLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.systemTextLineDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.systemTextLineDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.systemTextLinePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.systemTextLineLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.systemTextLinePosAbove, pid: Pid.OFFSET },
    { sid: Sid.systemTextLineMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.systemTextLineMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.systemTextLineMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

export class TextLineSegment extends TextLineBaseSegment {
    constructor(sp: Spanner | null, parent: System | null, system = false) {
        super(ElementType.TEXTLINE_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.setSystemFlag(system)
        this.initStyle()
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    textLine(): TextLine { return this.spanner() as TextLine }

    initStyle(): void {
        this.initElementStyle(this.systemFlag() ? systemTextLineSegmentStyle : textLineSegmentStyle)
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.SYSTEM_FLAG) {
            return this.hasSpanner() ? this.spanner() : null
        }
        return super.propertyDelegate(pid)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET && this.hasSpanner()) {
            if (this.spanner().anchor() === SpannerAnchor.NOTE) {
                return Sid.NOSTYLE
            }
            return this.textLine().getTextLinePos(this.spanner().placeAbove())
        }
        return super.getPropertyStyle(pid)
    }
}

export class TextLine extends TextLineBase {
    constructor(parent: EngravingObject | null, system = false) {
        super(ElementType.TEXTLINE, parent)
        this.setSystemFlag(system)
        this.initStyle()
        this.setBeginText('')
        this.setContinueText('')
        this.setEndText('')
        this.setBeginTextOffset(new PointF(0, 0))
        this.setContinueTextOffset(new PointF(0, 0))
        this.setEndTextOffset(new PointF(0, 0))
        this.setLineVisible(true)
        this.setBeginHookType(HookType.NONE)
        this.setEndHookType(HookType.NONE)
        this.setBeginHookHeight(new Spatium(1.5))
        this.setEndHookHeight(new Spatium(1.5))
        this.setGapBetweenTextAndLine(new Spatium(0.5))
        this.setBeginFilledArrowHeight(new Spatium(1.0))
        this.setBeginFilledArrowWidth(new Spatium(0.85))
        this.setEndFilledArrowHeight(new Spatium(1.0))
        this.setEndFilledArrowWidth(new Spatium(0.85))
        this.setBeginLineArrowHeight(new Spatium(1.0))
        this.setBeginLineArrowWidth(new Spatium(0.5))
        this.setEndLineArrowHeight(new Spatium(1.0))
        this.setEndLineArrowWidth(new Spatium(0.5))
        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT_PLACE)
    }

    initStyle(): void {
        this.initElementStyle(this.systemFlag() ? systemTextLineStyle : textLineStyle)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new TextLineSegment(this, parent, this.systemFlag())
        seg.setTrack(this.track())
        // note-anchored line segments are relative to system not to staff
        if (this.anchor() === SpannerAnchor.NOTE) {
            seg.setFlag(ElementFlag.ON_STAFF, false)
        }
        seg.initStyle()
        return seg
    }

    getTextLinePos(above: boolean): Sid {
        if (this.systemFlag()) {
            return above ? Sid.systemTextLinePosAbove : Sid.systemTextLinePosBelow
        }
        return above ? Sid.textLinePosAbove : Sid.textLinePosBelow
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.anchor() === SpannerAnchor.NOTE ? Sid.NOSTYLE : this.getTextLinePos(this.placeAbove())
        }
        return super.getPropertyStyle(pid)
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
        case Pid.END_TEXT:
            return ''
        case Pid.LINE_VISIBLE:
            return true
        case Pid.BEGIN_TEXT_OFFSET:
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_HOOK_TYPE:
        case Pid.END_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.LEFT
        case Pid.TEXT_STYLE:
            return this.systemFlag() ? TextStyleType.SYSTEM_TEXTLINE : TextStyleType.TEXTLINE
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override allowTimeAnchor(): boolean {
        return !(this.anchor() === SpannerAnchor.NOTE)
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.PLAY:
            break
        case Pid.PLACEMENT:
            this.setPlacement(v as PlacementV)
            break
        default:
            return super.setProperty(id, v)
        }
        return true
    }
}
