/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/pedal.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, HookType, TextPlace, TextStyleType } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { SegmentType } from './segment'
import type { Chord } from './chord'
import type { LineSegment } from './line'
import type { Rest } from './rest'
import type { System } from './system'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'

const pedalStyle: ElementStyle = [
    { sid: Sid.pedalText, pid: Pid.BEGIN_TEXT },
    { sid: Sid.pedalContinueText, pid: Pid.CONTINUE_TEXT },
    { sid: Sid.pedalRosetteEndText, pid: Pid.END_TEXT },
    { sid: Sid.pedalFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.pedalFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.pedalFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.pedalFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.pedalFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.pedalFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.pedalFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.pedalFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.pedalFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.pedalMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.pedalMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.pedalMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.pedalTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.pedalTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.pedalTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.pedalPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.pedalPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.pedalPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.pedalHookHeight, pid: Pid.BEGIN_HOOK_HEIGHT },
    { sid: Sid.pedalHookHeight, pid: Pid.END_HOOK_HEIGHT },
    { sid: Sid.pedalLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.pedalDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.pedalDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.pedalPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.pedalLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.pedalPosBelow, pid: Pid.OFFSET },
    { sid: Sid.pedalFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.pedalEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.pedalEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.pedalBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.pedalBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.pedalEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.pedalEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.pedalBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.pedalBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },
]

const pedalSegmentStyle: ElementStyle = [
    { sid: Sid.pedalPosBelow, pid: Pid.OFFSET },
    { sid: Sid.pedalMinDistance, pid: Pid.MIN_DISTANCE },
]

export class PedalSegment extends TextLineBaseSegment {
    constructor(sp: Pedal | null, parent: System | null) {
        super(ElementType.PEDAL_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    pedal(): Pedal { return this.spanner() as Pedal }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET && this.hasSpanner()) {
            return this.spanner().placeAbove() ? Sid.pedalPosAbove : Sid.pedalPosBelow
        }
        return super.getPropertyStyle(pid)
    }
}

export class Pedal extends TextLineBase {
    static readonly PEDAL_SYMBOL = '<sym>keyboardPedalPed</sym>'
    static readonly STAR_SYMBOL = '<sym>keyboardPedalUp</sym>'

    constructor(parent: EngravingObject | null) {
        super(ElementType.PEDAL, parent)
        this.initElementStyle(pedalStyle)
        this.setLineVisible(true)
        this.resetProperty(Pid.LINE_WIDTH)
        this.resetProperty(Pid.LINE_STYLE)
        this.resetProperty(Pid.BEGIN_HOOK_TYPE)
        this.resetProperty(Pid.END_HOOK_TYPE)
        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.LINE_VISIBLE)
        this.resetProperty(Pid.END_TEXT)
    }

    override createLineSegment(parent: System | null): LineSegment {
        const p = new PedalSegment(this, parent)
        p.setTrack(this.track())
        p.initElementStyle(pedalSegmentStyle)
        return p
    }

    override getPropertyStyle(pid: Pid): Sid {
        switch (pid) {
        case Pid.OFFSET:
            return this.placeAbove() ? Sid.pedalPosAbove : Sid.pedalPosBelow
        case Pid.END_TEXT:
            return this.lineVisible() ? Sid.pedalEndText : Sid.pedalRosetteEndText
        case Pid.BEGIN_TEXT:
            return this.beginHookType() === HookType.NONE ? Sid.pedalText : Sid.pedalHookText
        case Pid.CONTINUE_TEXT:
            return this.beginHookType() === HookType.NONE ? Sid.pedalContinueText : Sid.pedalContinueHookText
        default:
            return super.getPropertyStyle(pid)
        }
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.LINE_WIDTH:
            return this.style().styleS(Sid.pedalLineWidth)
        case Pid.LINE_STYLE:
            return this.style().styleV(Sid.pedalLineStyle)
        case Pid.BEGIN_TEXT:
        case Pid.CONTINUE_TEXT:
        case Pid.END_TEXT:
            return this.style().styleV(this.getPropertyStyle(propertyId))
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.LEFT
        case Pid.BEGIN_TEXT_OFFSET:
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF(0, 0)
        case Pid.BEGIN_HOOK_TYPE:
        case Pid.END_HOOK_TYPE:
            return HookType.NONE
        case Pid.LINE_VISIBLE:
            return true
        case Pid.PLACEMENT:
            return this.style().styleV(Sid.pedalPlacement)
        case Pid.TEXT_STYLE:
            return TextStyleType.PEDAL
        default:
            return super.propertyDefault(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        // Update style flag for text
        if (propertyId === Pid.BEGIN_HOOK_TYPE) {
            this.setBeginHookType(v as HookType)
            this.setPropertyFlags(Pid.BEGIN_TEXT,
                this.beginText() === this.propertyDefault(Pid.BEGIN_TEXT) ? PropertyFlags.STYLED : PropertyFlags.UNSTYLED)
            this.setPropertyFlags(Pid.CONTINUE_TEXT,
                this.continueText() === this.propertyDefault(Pid.CONTINUE_TEXT) ? PropertyFlags.STYLED : PropertyFlags.UNSTYLED)
        } else if (propertyId === Pid.LINE_VISIBLE) {
            this.setLineVisible(v as boolean)
            this.setPropertyFlags(Pid.END_TEXT,
                this.endText() === this.propertyDefault(Pid.END_TEXT) ? PropertyFlags.STYLED : PropertyFlags.UNSTYLED)
        } else {
            return super.setProperty(propertyId, v)
        }
        return true
    }

    findNextInStaff(): Pedal | null {
        const endTick = this.tick2()
        for (const spanner of this.score().spannerMap().findOverlapping(endTick.ticks(), this.score().endTick().ticks())) {
            if (spanner.isPedal() && spanner !== this && spanner.staffIdx() === this.staffIdx() && spanner.tick().eq(endTick)) {
                return spanner as Pedal
            }
        }
        return null
    }

    connect45HookToNext(): boolean {
        if (this.endHookType() !== HookType.HOOK_45) {
            return false
        }
        const nextPedal = this.findNextInStaff()
        return !!nextPedal && nextPedal.tick().eq(this.tick2()) && nextPedal.beginHookType() === HookType.HOOK_45
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        const centerOfEl = (item: ReturnType<Pedal['startElement']>): number => {
            if (item && item.isChord()) {
                return 0.5 * (item as Chord).downNote().headWidth()
            } else if (item && item.isRest()) {
                return (item as Rest).centerX()
            }
            return 0
        }
        if (start) {
            const startSeg = this.startSegment()
            if (!startSeg) {
                return { pos: new PointF(), system: null }
            }
            const system = startSeg.measure().system()
            let x = startSeg.x() + startSeg.measure().x()
            if (this.beginText() === '<sym>keyboardPedalPed</sym>') {
                x -= 0.5 * this.spatium()
            } else if (this.beginHookType() === HookType.HOOK_90 || this.beginHookType() === HookType.HOOK_90T) {
                x += 0.5 * this.absoluteFromSpatium(this.lineWidth())
            } else if (this.beginHookType() === HookType.HOOK_45) {
                x += centerOfEl(this.startElement())
            }
            return { pos: new PointF(x, 0.0), system }
        }
        let endSeg = this.endSegment()
        if (!endSeg) {
            return { pos: new PointF(), system: null }
        }
        const nextPedal = this.findNextInStaff()
        if (nextPedal && this.endHookType() === HookType.HOOK_45) {
            const system = endSeg.measure().system()
            const x = endSeg.x() + endSeg.measure().x() + centerOfEl(this.endElement())
            return { pos: new PointF(x, 0.0), system }
        }
        if (endSeg.rtick().eq(new Fraction(0, 1))) {
            const prevSeg = endSeg.prev1(SegmentType.EndBarLine)
            if (prevSeg) {
                endSeg = prevSeg
            }
        }
        const system = endSeg.measure().system()
        let x = endSeg.x() + endSeg.measure().x()
        x -= (endSeg.isChordRestType() && nextPedal ? 1.25 : 0.75) * this.spatium()
        return { pos: new PointF(x, 0.0), system }
    }
}
