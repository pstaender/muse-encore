/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/pickscrape.h/.cpp
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

const pickScrapeStyle: ElementStyle = [
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
    { sid: Sid.palmMuteLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.palmMuteDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.palmMuteDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.palmMuteFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.palmMuteEndHookType, pid: Pid.END_HOOK_TYPE },
    { sid: Sid.palmMuteLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.palmMutePlacement, pid: Pid.PLACEMENT },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.palmMuteMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const pickScrapeSegmentStyle: ElementStyle = [
    { sid: Sid.palmMuteMinDistance, pid: Pid.MIN_DISTANCE },
]

export class PickScrapeSegment extends TextLineBaseSegment {
    constructor(sp: PickScrape | null, parent: System | null) {
        super(ElementType.PICK_SCRAPE_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    pickScrape(): PickScrape { return this.spanner() as PickScrape }
}

export class PickScrape extends ChordTextLineBase {
    constructor(parent: EngravingObject | null) {
        super(ElementType.PICK_SCRAPE, parent)
        this.initElementStyle(pickScrapeStyle)
        this.resetProperty(Pid.LINE_VISIBLE)

        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_TEXT)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new PickScrapeSegment(this, parent)
        seg.setTrack(this.track())
        seg.initElementStyle(pickScrapeSegmentStyle)
        return seg
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            return this.style().styleV(Sid.palmMuteLineWidth)
        case Pid.ALIGN:
            return new Align(AlignH.LEFT, AlignV.BASELINE)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.palmMuteLineStyle)
        case Pid.LINE_VISIBLE:
            return true
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_FONT_STYLE:
            return this.style().styleV(Sid.palmMuteFontStyle)
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
            return 'P.S.' // TODO: fix the style
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
        case Pid.BEGIN_FILLED_ARROW_HEIGHT: // No arrow endings for pick scrape
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
            return Sid.palmMutePlacement
        case Pid.BEGIN_FONT_FACE:
            return Sid.palmMuteFontFace
        case Pid.BEGIN_FONT_SIZE:
        case Pid.CONTINUE_FONT_SIZE:
        case Pid.END_FONT_SIZE:
            return Sid.palmMuteFontSize
        case Pid.BEGIN_FONT_STYLE:
        case Pid.CONTINUE_FONT_STYLE:
        case Pid.END_FONT_STYLE:
            return Sid.palmMuteFontStyle
        case Pid.BEGIN_TEXT_ALIGN:
        case Pid.CONTINUE_TEXT_ALIGN:
        case Pid.END_TEXT_ALIGN:
            return Sid.palmMuteTextAlign
        case Pid.BEGIN_HOOK_HEIGHT:
        case Pid.END_HOOK_HEIGHT:
            return Sid.palmMuteHookHeight
        default:
            break
        }
        return super.getPropertyStyle(id)
    }
}
