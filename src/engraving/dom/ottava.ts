/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/ottava.h/.cpp
 *
 * TODO(port): playback (Staff::updateOttava)
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, HookType, PlacementV, TextPlace, TextStyleType, track2staff } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SegmentType } from './segment'
import type { ChordRest } from './chordrest'
import type { LineSegment } from './line'
import type { System } from './system'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'

export enum OttavaType {
    OTTAVA_8VA,
    OTTAVA_8VB,
    OTTAVA_15MA,
    OTTAVA_15MB,
    OTTAVA_22MA,
    OTTAVA_22MB,
}

export const ottavaDefault: readonly { type: OttavaType; shift: number; name: string }[] = [
    { type: OttavaType.OTTAVA_8VA, shift: 12, name: '8va' },
    { type: OttavaType.OTTAVA_8VB, shift: -12, name: '8vb' },
    { type: OttavaType.OTTAVA_15MA, shift: 24, name: '15ma' },
    { type: OttavaType.OTTAVA_15MB, shift: -24, name: '15mb' },
    { type: OttavaType.OTTAVA_22MA, shift: 36, name: '22ma' },
    { type: OttavaType.OTTAVA_22MB, shift: -36, name: '22mb' },
]

const ottavaStyle: ElementStyle = [
    { sid: Sid.ottavaNumbersOnly, pid: Pid.NUMBERS_ONLY },
    { sid: Sid.ottava8VAPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.ottava8VAText, pid: Pid.BEGIN_TEXT },
    { sid: Sid.ottava8VAContinueText, pid: Pid.CONTINUE_TEXT },
    { sid: Sid.ottavaHookAbove, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.ottavaFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.ottavaFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.ottavaFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.ottavaFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.ottavaFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.ottavaFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.ottavaFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.ottavaFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.ottavaFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.ottavaMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.ottavaMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.ottavaMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.ottavaTextAlignAbove, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.ottavaTextAlignAbove, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.ottavaTextAlignAbove, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.ottavaPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.ottavaPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.ottavaPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.ottavaLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.ottavaLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.ottavaDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.ottavaDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.ottavaPosAbove, pid: Pid.OFFSET },
    { sid: Sid.ottavaFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.ottavaEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.ottavaEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.ottavaBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.ottavaBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.ottavaEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.ottavaEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.ottavaBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.ottavaBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },
]

const ottavaSegmentStyle: ElementStyle = [
    { sid: Sid.ottavaPosAbove, pid: Pid.OFFSET },
    { sid: Sid.ottavaMinDistance, pid: Pid.MIN_DISTANCE },
]

// placement, text, continue text for each OttavaType; first half with numbersOnly, second half without
const OTTAVA_STYLES: readonly Sid[] = [
    Sid.ottava8VAPlacement, Sid.ottava8VAnoText, Sid.ottava8VAnoContinueText,
    Sid.ottava8VBPlacement, Sid.ottava8VBnoText, Sid.ottava8VBnoContinueText,
    Sid.ottava15MAPlacement, Sid.ottava15MAnoText, Sid.ottava15MAnoContinueText,
    Sid.ottava15MBPlacement, Sid.ottava15MBnoText, Sid.ottava15MBnoContinueText,
    Sid.ottava22MAPlacement, Sid.ottava22MAnoText, Sid.ottava22MAnoContinueText,
    Sid.ottava22MBPlacement, Sid.ottava22MBnoText, Sid.ottava22MBnoContinueText,
    Sid.ottava8VAPlacement, Sid.ottava8VAText, Sid.ottava8VAContinueText,
    Sid.ottava8VBPlacement, Sid.ottava8VBText, Sid.ottava8VBContinueText,
    Sid.ottava15MAPlacement, Sid.ottava15MAText, Sid.ottava15MAContinueText,
    Sid.ottava15MBPlacement, Sid.ottava15MBText, Sid.ottava15MBContinueText,
    Sid.ottava22MAPlacement, Sid.ottava22MAText, Sid.ottava22MAContinueText,
    Sid.ottava22MBPlacement, Sid.ottava22MBText, Sid.ottava22MBContinueText,
]

export class OttavaSegment extends TextLineBaseSegment {
    constructor(sp: Ottava | null, parent: System | null) {
        super(ElementType.OTTAVA_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    ottava(): Ottava { return this.spanner() as Ottava }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.OTTAVA_TYPE || pid === Pid.NUMBERS_ONLY) {
            return this.hasSpanner() ? this.spanner() : null
        }
        return super.propertyDelegate(pid)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET && this.hasSpanner()) {
            return this.spanner().placeAbove() ? Sid.ottavaPosAbove : Sid.ottavaPosBelow
        }
        return super.getPropertyStyle(pid)
    }
}

export class Ottava extends TextLineBase {
    private m_ottavaType = OttavaType.OTTAVA_8VA
    private m_numbersOnly = false

    constructor(parent: EngravingObject | null) {
        super(ElementType.OTTAVA, parent, ElementFlag.ON_STAFF | ElementFlag.MOVABLE)
        this.setBeginTextPlace(TextPlace.LEFT)
        this.setContinueTextPlace(TextPlace.LEFT)
        this.setEndHookType(HookType.HOOK_90)
        this.setLineVisible(true)
        this.setBeginHookHeight(new Spatium(0))
        this.setEndText('')
        this.initElementStyle(ottavaStyle)
    }

    ottavaType(): OttavaType { return this.m_ottavaType }
    setOttavaType(val: OttavaType): void {
        if (this.m_ottavaType === val) {
            return
        }
        this.m_ottavaType = val
        this.styleChanged()
    }
    override subtype(): number { return this.m_ottavaType }
    numbersOnly(): boolean { return this.m_numbersOnly }
    setNumbersOnly(val: boolean): void { this.m_numbersOnly = val }
    pitchShift(): number { return ottavaDefault[this.m_ottavaType].shift }
    static ottavaTypeName(type: OttavaType): string { return ottavaDefault[type].name }
    override allowTimeAnchor(): boolean { return false }

    override createLineSegment(parent: System | null): LineSegment {
        const os = new OttavaSegment(this, parent)
        os.setTrack(this.track())
        os.initElementStyle(ottavaSegmentStyle)
        return os
    }

    override getPropertyStyle(pid: Pid): Sid {
        const idx = this.m_ottavaType * 3 + (this.m_numbersOnly ? 0 : OTTAVA_STYLES.length / 2)
        switch (pid) {
        case Pid.OFFSET:
            return this.placeAbove() ? Sid.ottavaPosAbove : Sid.ottavaPosBelow
        case Pid.PLACEMENT:
            return OTTAVA_STYLES[idx]
        case Pid.BEGIN_TEXT:
            return OTTAVA_STYLES[idx + 1]
        case Pid.CONTINUE_TEXT:
            return OTTAVA_STYLES[idx + 2]
        case Pid.END_HOOK_HEIGHT:
            if (this.isStyled(Pid.PLACEMENT)) {
                return (this.style().styleV(OTTAVA_STYLES[idx]) as PlacementV) === PlacementV.ABOVE ? Sid.ottavaHookAbove : Sid.ottavaHookBelow
            }
            return this.placeAbove() ? Sid.ottavaHookAbove : Sid.ottavaHookBelow
        case Pid.BEGIN_TEXT_ALIGN:
        case Pid.CONTINUE_TEXT_ALIGN:
        case Pid.END_TEXT_ALIGN:
            return this.placeAbove() ? Sid.ottavaTextAlignAbove : Sid.ottavaTextAlignBelow
        default:
            return super.getPropertyStyle(pid)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.OTTAVA_TYPE: return this.m_ottavaType
        case Pid.NUMBERS_ONLY: return this.m_numbersOnly
        case Pid.END_TEXT_PLACE: return TextPlace.LEFT // HACK
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.PLAY:
            this.setPlaySpanner(val as boolean)
            break
        case Pid.OTTAVA_TYPE:
            this.setOttavaType(val as OttavaType)
            break
        case Pid.NUMBERS_ONLY:
            this.m_numbersOnly = val as boolean
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(pid: Pid): PropertyValue {
        switch (pid) {
        case Pid.OTTAVA_TYPE: return null as unknown as PropertyValue
        case Pid.END_HOOK_TYPE: return HookType.HOOK_90
        case Pid.LINE_VISIBLE: return true
        case Pid.BEGIN_TEXT_OFFSET:
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF()
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.LEFT
        case Pid.BEGIN_HOOK_TYPE: return HookType.NONE
        case Pid.BEGIN_HOOK_HEIGHT: return new Spatium(0)
        case Pid.END_TEXT: return ''
        case Pid.PLACEMENT: return this.styleValue(Pid.PLACEMENT, this.getPropertyStyle(Pid.PLACEMENT))
        case Pid.TEXT_STYLE: return TextStyleType.OTTAVA
        default: return super.propertyDefault(pid)
        }
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        if (grip === Grip.START) {
            return super.linePos(grip)
        }
        const endEl = this.endElement()
        const endCr = endEl && endEl.isChordRest() ? endEl as ChordRest : null
        if (!endCr) {
            return { pos: new PointF(), system: null }
        }
        const seg = endCr.segment()!
        const system = seg.measure().system()
        // End 1sp after the right edge of the end chord, but don't overlap followig segments
        const staffShape = seg.staffShape(endCr.vStaffIdx())
        staffShape.remove_if(el => el.height() === 0)
        let x = staffShape.right() + seg.x() + seg.measure().x() + this.spatium()
        const followingCRseg = this.score().tick2segment(endCr.endTick(), true, SegmentType.ChordRest)
        if (followingCRseg && followingCRseg.system() === seg.system()) {
            x = Math.min(x, followingCRseg.x() + followingCRseg.measure().x())
        }
        x -= 0.5 * this.absoluteFromSpatium(this.lineWidth())
        return { pos: new PointF(x, 0.0), system }
    }

    protected override doComputeEndElement(): void {
        this.setEndElement(this.score().findChordRestEndingBeforeTickInStaff(this.tick2(), track2staff(this.track())))
    }

    override accessibleInfo(): string {
        return `${this.translatedTypeUserName()}: ${ottavaDefault[this.ottavaType()].name}`
    }
}
