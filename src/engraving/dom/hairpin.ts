/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/hairpin.h/.cpp
 *
 * TODO(port): editing (grips, drag groups, drop)
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { AutoOnOff, ChangeMethod, DirectionV, DynamicType, ElementType, HookType, TextPlace, TextStyleType, VoiceAssignment } from '../types/types'
import { TConv } from '../types/typesconv'
import { Sid } from '../style/styledef'
import { Grip } from '../editing/editdata'
import { ElementFlag, type EngravingItem } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid, PropertyFlags } from './property'
import { SegmentType, type Segment } from './segment'
import type { Dynamic } from './dynamic'
import type { LineSegment } from './line'
import type { System } from './system'
import type { TextBase } from './textbase'
import { TextLineBase, TextLineBaseSegment } from './textlinebase'
import { TranslatableString } from '../../framework/global/types/translatablestring'

export enum HairpinType {
    INVALID = -1,
    CRESC_HAIRPIN,
    DIM_HAIRPIN,
    CRESC_LINE,
    DIM_LINE,
}

const hairpinStyle: ElementStyle = [
    { sid: Sid.hairpinFontFace, pid: Pid.BEGIN_FONT_FACE },
    { sid: Sid.hairpinFontSize, pid: Pid.BEGIN_FONT_SIZE },
    { sid: Sid.hairpinFontStyle, pid: Pid.BEGIN_FONT_STYLE },
    { sid: Sid.hairpinText, pid: Pid.BEGIN_TEXT },
    { sid: Sid.hairpinTextAlign, pid: Pid.BEGIN_TEXT_ALIGN },
    { sid: Sid.hairpinPosition, pid: Pid.BEGIN_TEXT_POSITION },
    { sid: Sid.hairpinFontFace, pid: Pid.CONTINUE_FONT_FACE },
    { sid: Sid.hairpinFontSize, pid: Pid.CONTINUE_FONT_SIZE },
    { sid: Sid.hairpinFontStyle, pid: Pid.CONTINUE_FONT_STYLE },
    { sid: Sid.hairpinText, pid: Pid.CONTINUE_TEXT },
    { sid: Sid.hairpinTextAlign, pid: Pid.CONTINUE_TEXT_ALIGN },
    { sid: Sid.hairpinPosition, pid: Pid.CONTINUE_TEXT_POSITION },
    { sid: Sid.hairpinFontFace, pid: Pid.END_FONT_FACE },
    { sid: Sid.hairpinFontSize, pid: Pid.END_FONT_SIZE },
    { sid: Sid.hairpinFontStyle, pid: Pid.END_FONT_STYLE },
    { sid: Sid.hairpinTextAlign, pid: Pid.END_TEXT_ALIGN },
    { sid: Sid.hairpinPosition, pid: Pid.END_TEXT_POSITION },
    { sid: Sid.hairpinLineWidth, pid: Pid.LINE_WIDTH },
    { sid: Sid.hairpinHeight, pid: Pid.HAIRPIN_HEIGHT },
    { sid: Sid.hairpinContHeight, pid: Pid.HAIRPIN_CONT_HEIGHT },
    { sid: Sid.hairpinPosBelow, pid: Pid.OFFSET },
    { sid: Sid.hairpinLineStyle, pid: Pid.LINE_STYLE },
    { sid: Sid.hairpinLineDashLineLen, pid: Pid.DASH_LINE_LEN },
    { sid: Sid.hairpinLineDashGapLen, pid: Pid.DASH_GAP_LEN },
    { sid: Sid.hairpinFontSpatiumDependent, pid: Pid.TEXT_SIZE_SPATIUM_DEPENDENT },
    { sid: Sid.hairpinEndLineArrowHeight, pid: Pid.END_LINE_ARROW_HEIGHT },
    { sid: Sid.hairpinEndLineArrowWidth, pid: Pid.END_LINE_ARROW_WIDTH },
    { sid: Sid.hairpinBeginLineArrowHeight, pid: Pid.BEGIN_LINE_ARROW_HEIGHT },
    { sid: Sid.hairpinBeginLineArrowWidth, pid: Pid.BEGIN_LINE_ARROW_WIDTH },
    { sid: Sid.hairpinEndFilledArrowHeight, pid: Pid.END_FILLED_ARROW_HEIGHT },
    { sid: Sid.hairpinEndFilledArrowWidth, pid: Pid.END_FILLED_ARROW_WIDTH },
    { sid: Sid.hairpinBeginFilledArrowHeight, pid: Pid.BEGIN_FILLED_ARROW_HEIGHT },
    { sid: Sid.hairpinBeginFilledArrowWidth, pid: Pid.BEGIN_FILLED_ARROW_WIDTH },
    { sid: Sid.hairpinMusicalSymbolSize, pid: Pid.BEGIN_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.hairpinMusicalSymbolSize, pid: Pid.CONTINUE_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.hairpinMusicalSymbolSize, pid: Pid.END_TEXT_MUSIC_SYMBOLS_SIZE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.BEGIN_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.CONTINUE_TEXT_MUSICAL_SYMBOLS_SCALE },
    { sid: Sid.dummyMusicalSymbolsScale, pid: Pid.END_TEXT_MUSICAL_SYMBOLS_SCALE },
]

const hairpinSegmentStyle: ElementStyle = [
    { sid: Sid.hairpinPosBelow, pid: Pid.OFFSET },
    { sid: Sid.hairpinMinDistance, pid: Pid.MIN_DISTANCE },
]

function sortDynamicsAndExpressions(items: TextBase[]): void {
    const isDyn = (i: TextBase): boolean => i.isDynamic()
    const anchorPrev = (i: TextBase): boolean => i.isDynamic() && (i as Dynamic).anchorToEndOfPrevious()
    // C++ std::sort with the comparator "dynamic before expression, anchor-to-previous before others"
    items.sort((a, b) => {
        const less = (x: TextBase, y: TextBase): boolean => (isDyn(x) && y.isExpression()) || (anchorPrev(x) && isDyn(y) && !anchorPrev(y))
        return less(a, b) ? -1 : less(b, a) ? 1 : 0
    })
}

export class HairpinSegment extends TextLineBaseSegment {
    private m_drawCircledTip = false
    private m_circledTip = new PointF()
    private m_circledTipRadius = 0.0

    constructor(sp: Hairpin | null, parent: System | null) {
        super(ElementType.HAIRPIN_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.m_text.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
        this.m_endText.setTextStyleType(this.propertyDefault(Pid.TEXT_STYLE) as TextStyleType)
    }

    hairpin(): Hairpin { return this.spanner() as Hairpin }
    drawCircledTip(): boolean { return this.m_drawCircledTip }
    setDrawCircledTip(arg: boolean): void { this.m_drawCircledTip = arg }
    circledTipRadius(): number { return this.m_circledTipRadius }
    setCircledTipRadius(r: number): void { this.m_circledTipRadius = r }
    circledTip(): PointF { return this.m_circledTip }
    setCircledTip(p: PointF): void { this.m_circledTip = p.clone() }

    override setPropertyFlags(id: Pid, f: PropertyFlags): void {
        const i = this.getPropertyFlagsIdx(id)
        if (i === -1) {
            // Can happen (for example when edit-dragging the aperture) that we're editing
            // the HairpinSegment but the relevant property belongs to the Hairpin.
            if (this.hasSpanner()) {
                this.hairpin().setPropertyFlags(id, f)
            }
            return
        }
        this.m_propertyFlagsList[i] = f
    }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.HAIRPIN_TYPE
            || pid === Pid.VELO_CHANGE
            || pid === Pid.VELO_CHANGE_METHOD
            || pid === Pid.SINGLE_NOTE_DYNAMICS
            || pid === Pid.HAIRPIN_CIRCLEDTIP
            || pid === Pid.HAIRPIN_HEIGHT
            || pid === Pid.HAIRPIN_CONT_HEIGHT
            || pid === Pid.LINE_STYLE
            || pid === Pid.VOICE_ASSIGNMENT
            || pid === Pid.DIRECTION
            || pid === Pid.CENTER_BETWEEN_STAVES) {
            return this.hasSpanner() ? this.spanner() : null
        }
        return super.propertyDelegate(pid)
    }

    override hasVoiceAssignmentProperties(): boolean { return this.spanner()!.hasVoiceAssignmentProperties() }

    override getPropertyStyle(pid: Pid): Sid {
        if (!this.hasSpanner()) {
            return super.getPropertyStyle(pid)
        }
        const hp = this.hairpin()
        switch (pid) {
        case Pid.OFFSET:
            if (hp.isLineType()) {
                return this.spanner().placeAbove() ? Sid.hairpinLinePosAbove : Sid.hairpinLinePosBelow
            }
            return this.spanner().placeAbove() ? Sid.hairpinPosAbove : Sid.hairpinPosBelow
        case Pid.BEGIN_TEXT:
            return hp.hairpinType() === HairpinType.CRESC_LINE ? Sid.hairpinCrescText
                : hp.hairpinType() === HairpinType.DIM_LINE ? Sid.hairpinDecrescText : Sid.hairpinText
        case Pid.CONTINUE_TEXT:
            return hp.hairpinType() === HairpinType.CRESC_LINE ? Sid.hairpinCrescContText
                : hp.hairpinType() === HairpinType.DIM_LINE ? Sid.hairpinDecrescContText : Sid.hairpinText
        case Pid.LINE_STYLE:
            return hp.isLineType() ? Sid.hairpinLineLineStyle : Sid.hairpinLineStyle
        case Pid.DASH_LINE_LEN:
            return hp.isLineType() ? Sid.hairpinLineDashLineLen : Sid.hairpinDashLineLen
        case Pid.DASH_GAP_LEN:
            return hp.isLineType() ? Sid.hairpinLineDashGapLen : Sid.hairpinDashGapLen
        default:
            break
        }
        return super.getPropertyStyle(pid)
    }

    findElementToSnapBefore(ignoreInvisible = true): EngravingItem | null {
        const startDynOrExpr = this.findStartDynamicOrExpression(ignoreInvisible)
        if (startDynOrExpr) {
            return startDynOrExpr
        }
        const thisHairpin = this.hairpin()
        const startTick = thisHairpin.tick()
        for (const spanner of this.score().spannerMap().findOverlapping(startTick.ticks(), startTick.ticks())) {
            const isValidHairpin = spanner.isHairpin() && !spanner.segmentsEmpty() && spanner !== thisHairpin
                                   && (spanner.addToSkyline() || !ignoreInvisible)
            if (!isValidHairpin) {
                continue
            }
            const precedingHairpin = spanner as Hairpin
            const endsMatch = precedingHairpin.track() === thisHairpin.track()
                              && precedingHairpin.tick2().eq(startTick)
                              && precedingHairpin.placeAbove() === thisHairpin.placeAbove()
                              && precedingHairpin.voiceAssignment() === thisHairpin.voiceAssignment()
            if (endsMatch && precedingHairpin.snapToItemAfter()) {
                return precedingHairpin.backSegment()
            }
        }
        return null
    }

    findElementToSnapAfter(ignoreInvisible = true, requirePlayable = false): EngravingItem | null {
        // Note: we don't need to look for a hairpin after.
        // It is the next hairpin which looks for a hairpin before.
        return this.findEndDynamicOrExpression(ignoreInvisible, requirePlayable)
    }

    private matchingDynamicsAndExpressions(segment: Segment, ignoreInvisible: boolean, requirePlayable: boolean): TextBase[] {
        const result: TextBase[] = []
        for (const item of segment.annotations()) {
            if (!item.isDynamic() && !item.isExpression()) {
                continue
            }
            if (ignoreInvisible && !item.addToSkyline()) {
                continue
            }
            if (requirePlayable && (!item.isDynamic() || !(item as Dynamic).playDynamic())) {
                continue
            }
            const endsMatch = item.track() === this.hairpin().track()
                              && item.placement() === this.placement()
                              && item.getProperty(Pid.VOICE_ASSIGNMENT) === this.hairpin().getProperty(Pid.VOICE_ASSIGNMENT)
            if (endsMatch) {
                result.push(item as TextBase)
            }
        }
        return result
    }

    private findStartDynamicOrExpression(ignoreInvisible = true): TextBase | null {
        const refTick = this.hairpin().tick()
        const measure = this.score().tick2measure(refTick)
        if (!measure) {
            return null
        }
        let dynamicsAndExpr: TextBase[] = []
        for (let segment: Segment | null = measure.last(); segment; segment = segment.prev1()) {
            const segmentTick = segment.tick()
            if (segmentTick.gt(refTick)) {
                continue
            }
            if (segmentTick.lt(refTick)) {
                break
            }
            dynamicsAndExpr = dynamicsAndExpr.concat(this.matchingDynamicsAndExpressions(segment, ignoreInvisible, false))
            if (dynamicsAndExpr.length > 0) {
                break
            }
        }
        if (dynamicsAndExpr.length === 0) {
            return null
        }
        if (dynamicsAndExpr.length > 1) {
            sortDynamicsAndExpressions(dynamicsAndExpr)
        }
        return dynamicsAndExpr[dynamicsAndExpr.length - 1]
    }

    private findEndDynamicOrExpression(ignoreInvisible = true, requirePlayable = false): TextBase | null {
        const refTick = this.hairpin().tick2()
        const measure = this.score().tick2measure(refTick.minus(Fraction.eps()))
        if (!measure) {
            return null
        }
        let dynamicsAndExpr: TextBase[] = []
        for (let segment: Segment | null = measure.first(); segment; segment = segment.next1()) {
            const segmentTick = segment.tick()
            if (segmentTick.lt(refTick)) {
                continue
            }
            if (segmentTick.gt(refTick)) {
                break
            }
            dynamicsAndExpr = dynamicsAndExpr.concat(this.matchingDynamicsAndExpressions(segment, ignoreInvisible, requirePlayable))
            if (dynamicsAndExpr.length > 0) {
                break
            }
        }
        if (dynamicsAndExpr.length === 0) {
            return null
        }
        if (dynamicsAndExpr.length > 1) {
            sortDynamicsAndExpressions(dynamicsAndExpr)
        }
        return dynamicsAndExpr[0]
    }
}

export class Hairpin extends TextLineBase {
    private m_hairpinType = HairpinType.INVALID
    private m_veloChange = 0
    private m_hairpinCircledTip = false
    private m_singleNoteDynamics = true
    private m_veloChangeMethod = ChangeMethod.NORMAL
    private m_hairpinHeight = new Spatium(0)
    private m_hairpinContHeight = new Spatium(0)
    private m_voiceAssignment = VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
    private m_direction = DirectionV.AUTO
    private m_centerBetweenStaves = AutoOnOff.AUTO
    private m_snapToItemBefore = true
    private m_snapToItemAfter = true

    constructor(parent: EngravingObject | null) {
        super(ElementType.HAIRPIN, parent)
        this.initElementStyle(hairpinStyle)
        this.resetProperty(Pid.BEGIN_TEXT_PLACE)
        this.resetProperty(Pid.END_TEXT_PLACE)
        this.resetProperty(Pid.CONTINUE_TEXT_PLACE)
        this.resetProperty(Pid.BEGIN_HOOK_HEIGHT)
        this.resetProperty(Pid.END_HOOK_HEIGHT)
        this.resetProperty(Pid.HAIRPIN_TYPE)
        this.resetProperty(Pid.LINE_VISIBLE)
        this.m_hairpinCircledTip = false
        this.m_veloChange = 0
        this.m_singleNoteDynamics = true
        this.m_veloChangeMethod = ChangeMethod.NORMAL
    }

    hairpinType(): HairpinType { return this.m_hairpinType }
    setHairpinType(val: HairpinType): void {
        if (this.m_hairpinType === val) {
            return
        }
        this.m_hairpinType = val
        this.styleChanged()
    }
    hairpinCircledTip(): boolean { return this.m_hairpinCircledTip }
    setHairpinCircledTip(val: boolean): void { this.m_hairpinCircledTip = val }
    veloChange(): number { return this.m_veloChange }
    setVeloChange(v: number): void { this.m_veloChange = v }
    hairpinHeight(): Spatium { return this.m_hairpinHeight }
    setHairpinHeight(val: Spatium): void { this.m_hairpinHeight = val }
    hairpinContHeight(): Spatium { return this.m_hairpinContHeight }
    setHairpinContHeight(val: Spatium): void { this.m_hairpinContHeight = val }
    singleNoteDynamics(): boolean { return this.m_singleNoteDynamics }
    setSingleNoteDynamics(val: boolean): void { this.m_singleNoteDynamics = val }
    veloChangeMethod(): ChangeMethod { return this.m_veloChangeMethod }
    setVeloChangeMethod(val: ChangeMethod): void { this.m_veloChangeMethod = val }
    isCrescendo(): boolean { return this.m_hairpinType === HairpinType.CRESC_HAIRPIN || this.m_hairpinType === HairpinType.CRESC_LINE }
    isDecrescendo(): boolean { return this.m_hairpinType === HairpinType.DIM_HAIRPIN || this.m_hairpinType === HairpinType.DIM_LINE }
    isLineType(): boolean { return this.m_hairpinType === HairpinType.CRESC_LINE || this.m_hairpinType === HairpinType.DIM_LINE }
    voiceAssignment(): VoiceAssignment { return this.m_voiceAssignment }
    setVoiceAssignment(v: VoiceAssignment): void { this.m_voiceAssignment = v }
    direction(): DirectionV { return this.m_direction }
    setDirection(v: DirectionV): void { this.m_direction = v }
    centerBetweenStaves(): AutoOnOff { return this.m_centerBetweenStaves }
    setCenterBetweenStaves(v: AutoOnOff): void { this.m_centerBetweenStaves = v }
    snapToItemBefore(): boolean { return this.m_snapToItemBefore }
    setSnapToItemBefore(v: boolean): void { this.m_snapToItemBefore = v }
    snapToItemAfter(): boolean { return this.m_snapToItemAfter }
    setSnapToItemAfter(v: boolean): void { this.m_snapToItemAfter = v }
    override subtype(): number { return this.m_hairpinType }

    dynamicTypeFrom(): DynamicType {
        if (this.m_hairpinType === HairpinType.CRESC_HAIRPIN && this.hairpinCircledTip()) {
            return DynamicType.N
        }
        return TConv.fromXmlDynamicType(this.beginText(), DynamicType.OTHER)
    }

    dynamicTypeTo(): DynamicType {
        if (this.m_hairpinType === HairpinType.DIM_HAIRPIN && this.hairpinCircledTip()) {
            return DynamicType.N
        }
        return TConv.fromXmlDynamicType(this.endText(), DynamicType.OTHER)
    }

    dynamicSnappedBefore(): Dynamic | null {
        if (this.segmentsEmpty()) {
            return null
        }
        const item = this.frontSegment().ldata().itemSnappedBefore()
        return item && item.isDynamic() ? item as Dynamic : null
    }

    dynamicSnappedAfter(): Dynamic | null {
        if (this.segmentsEmpty()) {
            return null
        }
        const item = this.backSegment().ldata().itemSnappedAfter()
        return item && item.isDynamic() ? item as Dynamic : null
    }

    override createLineSegment(parent: System | null): LineSegment {
        const h = new HairpinSegment(this, parent)
        h.setTrack(this.track())
        h.initElementStyle(hairpinSegmentStyle)
        return h
    }

    override hasVoiceAssignmentProperties(): boolean { return true }

    override getPropertyStyle(pid: Pid): Sid {
        switch (pid) {
        case Pid.OFFSET:
            if (this.isLineType()) {
                return this.placeAbove() ? Sid.hairpinLinePosAbove : Sid.hairpinLinePosBelow
            }
            return this.placeAbove() ? Sid.hairpinPosAbove : Sid.hairpinPosBelow
        case Pid.BEGIN_TEXT:
            return this.m_hairpinType === HairpinType.CRESC_LINE ? Sid.hairpinCrescText
                : this.m_hairpinType === HairpinType.DIM_LINE ? Sid.hairpinDecrescText : Sid.hairpinText
        case Pid.CONTINUE_TEXT:
            return this.m_hairpinType === HairpinType.CRESC_LINE ? Sid.hairpinCrescContText
                : this.m_hairpinType === HairpinType.DIM_LINE ? Sid.hairpinDecrescContText : Sid.hairpinText
        case Pid.LINE_STYLE:
            return this.isLineType() ? Sid.hairpinLineLineStyle : Sid.hairpinLineStyle
        case Pid.DASH_LINE_LEN:
            return this.isLineType() ? Sid.hairpinLineDashLineLen : Sid.hairpinDashLineLen
        case Pid.DASH_GAP_LEN:
            return this.isLineType() ? Sid.hairpinLineDashGapLen : Sid.hairpinDashGapLen
        case Pid.PLACEMENT:
            return Sid.hairpinPlacement
        default:
            break
        }
        return super.getPropertyStyle(pid)
    }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.HAIRPIN_CIRCLEDTIP: return this.m_hairpinCircledTip
        case Pid.HAIRPIN_TYPE: return this.m_hairpinType
        case Pid.VELO_CHANGE: return this.m_veloChange
        case Pid.HAIRPIN_HEIGHT: return this.m_hairpinHeight
        case Pid.HAIRPIN_CONT_HEIGHT: return this.m_hairpinContHeight
        case Pid.SINGLE_NOTE_DYNAMICS: return this.m_singleNoteDynamics
        case Pid.VELO_CHANGE_METHOD: return this.m_veloChangeMethod
        case Pid.VOICE_ASSIGNMENT: return this.m_voiceAssignment
        case Pid.CENTER_BETWEEN_STAVES: return this.m_centerBetweenStaves
        case Pid.DIRECTION: return this.m_direction
        case Pid.SNAP_BEFORE: return this.m_snapToItemBefore
        case Pid.SNAP_AFTER: return this.m_snapToItemAfter
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.HAIRPIN_CIRCLEDTIP: this.m_hairpinCircledTip = v as boolean; break
        case Pid.HAIRPIN_TYPE: this.setHairpinType(v as HairpinType); break
        case Pid.VELO_CHANGE: this.m_veloChange = v as number; break
        case Pid.HAIRPIN_HEIGHT: this.m_hairpinHeight = v as Spatium; break
        case Pid.HAIRPIN_CONT_HEIGHT: this.m_hairpinContHeight = v as Spatium; break
        case Pid.SINGLE_NOTE_DYNAMICS: this.m_singleNoteDynamics = v as boolean; break
        case Pid.VELO_CHANGE_METHOD: this.m_veloChangeMethod = v as ChangeMethod; break
        case Pid.VOICE_ASSIGNMENT: this.m_voiceAssignment = v as VoiceAssignment; break
        case Pid.CENTER_BETWEEN_STAVES: this.m_centerBetweenStaves = v as AutoOnOff; break
        case Pid.DIRECTION: this.m_direction = v as DirectionV; break
        case Pid.SNAP_BEFORE: this.m_snapToItemBefore = v as boolean; break
        case Pid.SNAP_AFTER: this.m_snapToItemAfter = v as boolean; break
        default:
            return super.setProperty(id, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.HAIRPIN_CIRCLEDTIP: return false
        case Pid.VELO_CHANGE: return 0
        case Pid.BEGIN_TEXT:
            if (this.m_hairpinType === HairpinType.CRESC_LINE) {
                return this.style().styleV(Sid.hairpinCrescText)
            }
            if (this.m_hairpinType === HairpinType.DIM_LINE) {
                return this.style().styleV(Sid.hairpinDecrescText)
            }
            return ''
        case Pid.CONTINUE_TEXT:
            if (this.m_hairpinType === HairpinType.CRESC_LINE) {
                return this.style().styleV(Sid.hairpinCrescContText)
            }
            if (this.m_hairpinType === HairpinType.DIM_LINE) {
                return this.style().styleV(Sid.hairpinDecrescContText)
            }
            return ''
        case Pid.END_TEXT: return ''
        case Pid.BEGIN_TEXT_PLACE:
        case Pid.CONTINUE_TEXT_PLACE:
        case Pid.END_TEXT_PLACE:
            return TextPlace.LEFT
        case Pid.BEGIN_TEXT_OFFSET:
        case Pid.CONTINUE_TEXT_OFFSET:
        case Pid.END_TEXT_OFFSET:
            return new PointF()
        case Pid.BEGIN_HOOK_TYPE:
        case Pid.END_HOOK_TYPE:
            return HookType.NONE
        case Pid.BEGIN_HOOK_HEIGHT:
        case Pid.END_HOOK_HEIGHT:
            return new Spatium(1.9)
        case Pid.LINE_VISIBLE: return true
        case Pid.HAIRPIN_TYPE: return HairpinType.CRESC_HAIRPIN
        case Pid.SINGLE_NOTE_DYNAMICS: return true
        case Pid.VELO_CHANGE_METHOD: return ChangeMethod.NORMAL
        case Pid.PLACEMENT: return this.style().styleV(Sid.hairpinPlacement)
        case Pid.VOICE_ASSIGNMENT: return VoiceAssignment.ALL_VOICE_IN_INSTRUMENT
        case Pid.CENTER_BETWEEN_STAVES: return AutoOnOff.AUTO
        case Pid.DIRECTION: return DirectionV.AUTO
        case Pid.SNAP_BEFORE: return true
        case Pid.SNAP_AFTER: return true
        case Pid.TEXT_STYLE: return TextStyleType.HAIRPIN
        default: return super.propertyDefault(id)
        }
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        const start = grip === Grip.START
        let segment = start ? this.startSegment() : this.endSegment()
        if (!segment) {
            return { pos: new PointF(), system: null }
        }
        if (!start) {
            const curTick = segment.tick()
            const prevSeg = segment.prev1(SegmentType.EndBarLine)
            if (prevSeg && prevSeg.tick().eq(curTick)) {
                segment = prevSeg
            }
        }
        const system = segment.measure().system()
        let x = segment.x() + segment.measure().x()
        if (!start) {
            x -= this.spatium()
        }
        return { pos: new PointF(x, 0.0), system }
    }

    override subtypeUserName(): TranslatableString {
        switch (this.hairpinType()) {
        case HairpinType.CRESC_HAIRPIN:
            return new TranslatableString('engraving/hairpintype', 'Crescendo hairpin')
        case HairpinType.DIM_HAIRPIN:
            return new TranslatableString('engraving/hairpintype', 'Diminuendo hairpin')
        case HairpinType.CRESC_LINE:
            return new TranslatableString('engraving/hairpintype', 'Crescendo line')
        case HairpinType.DIM_LINE:
            return new TranslatableString('engraving/hairpintype', 'Diminuendo line')
        default:
            return new TranslatableString('engraving/hairpintype', 'Custom')
        }
    }

    override accessibleInfo(): string {
        return `${super.accessibleInfo()}: ${this.translatedSubtypeUserName()}`
    }
}
