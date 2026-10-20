/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/dynamic.h/.cpp
 *
 * TODO(port): velocity changes and playback, editing (grips, drag groups)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { DynamicSpeed, DynamicType, ElementType, TextStyleType } from '../types/types'
import { SymId } from '../types/symid'
import { TConv } from '../types/typesconv'
import { Sid } from '../style/styledef'
import type { Shape } from '../infrastructure/shape'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Expression } from './expression'
import type { Measure } from './measure'
import type { Segment } from './segment'
import type { Spanner } from './spanner'
import { TextBase } from './textbase'

export interface Dyn {
    type: DynamicType
    velocity: number // associated midi velocity (0-127, -1 = none)
    changeInVelocity: number
    accent: boolean // if true add velocity to current chord velocity
    text: string // utf8 text of dynamic
}

const p = '<sym>dynamicPiano</sym>'
const m = '<sym>dynamicMezzo</sym>'
const f = '<sym>dynamicForte</sym>'
const s = '<sym>dynamicSforzando</sym>'
const z = '<sym>dynamicZ</sym>'
const r = '<sym>dynamicRinforzando</sym>'

// variant with ligatures, works for both emmentaler and bravura:
const DYN_LIST: Dyn[] = [
    { type: DynamicType.OTHER, velocity: -1, changeInVelocity: 0, accent: true, text: '' },
    { type: DynamicType.PPPPPP, velocity: 1, changeInVelocity: 0, accent: false, text: p.repeat(6) },
    { type: DynamicType.PPPPP, velocity: 5, changeInVelocity: 0, accent: false, text: p.repeat(5) },
    { type: DynamicType.PPPP, velocity: 10, changeInVelocity: 0, accent: false, text: p.repeat(4) },
    { type: DynamicType.PPP, velocity: 16, changeInVelocity: 0, accent: false, text: p.repeat(3) },
    { type: DynamicType.PP, velocity: 33, changeInVelocity: 0, accent: false, text: p.repeat(2) },
    { type: DynamicType.P, velocity: 49, changeInVelocity: 0, accent: false, text: p },
    { type: DynamicType.MP, velocity: 64, changeInVelocity: 0, accent: false, text: m + p },
    { type: DynamicType.MF, velocity: 80, changeInVelocity: 0, accent: false, text: m + f },
    { type: DynamicType.F, velocity: 96, changeInVelocity: 0, accent: false, text: f },
    { type: DynamicType.FF, velocity: 112, changeInVelocity: 0, accent: false, text: f.repeat(2) },
    { type: DynamicType.FFF, velocity: 126, changeInVelocity: 0, accent: false, text: f.repeat(3) },
    { type: DynamicType.FFFF, velocity: 127, changeInVelocity: 0, accent: false, text: f.repeat(4) },
    { type: DynamicType.FFFFF, velocity: 127, changeInVelocity: 0, accent: false, text: f.repeat(5) },
    { type: DynamicType.FFFFFF, velocity: 127, changeInVelocity: 0, accent: false, text: f.repeat(6) },
    { type: DynamicType.FP, velocity: 96, changeInVelocity: -47, accent: true, text: f + p },
    { type: DynamicType.PF, velocity: 49, changeInVelocity: 47, accent: true, text: p + f },
    { type: DynamicType.SF, velocity: 112, changeInVelocity: -18, accent: true, text: s + f },
    { type: DynamicType.SFZ, velocity: 112, changeInVelocity: -18, accent: true, text: s + f + z },
    { type: DynamicType.SFF, velocity: 126, changeInVelocity: -18, accent: true, text: s + f + f },
    { type: DynamicType.SFFZ, velocity: 126, changeInVelocity: -18, accent: true, text: s + f + f + z },
    { type: DynamicType.SFFF, velocity: 127, changeInVelocity: -18, accent: true, text: s + f + f + f },
    { type: DynamicType.SFFFZ, velocity: 127, changeInVelocity: -18, accent: true, text: s + f + f + f + z },
    { type: DynamicType.SFP, velocity: 112, changeInVelocity: -47, accent: true, text: s + f + p },
    { type: DynamicType.SFPP, velocity: 112, changeInVelocity: -79, accent: true, text: s + f + p + p },
    { type: DynamicType.RFZ, velocity: 112, changeInVelocity: -18, accent: true, text: r + f + z },
    { type: DynamicType.RF, velocity: 112, changeInVelocity: -18, accent: true, text: r + f },
    { type: DynamicType.FZ, velocity: 112, changeInVelocity: -18, accent: true, text: f + z },
    { type: DynamicType.M, velocity: 96, changeInVelocity: -16, accent: true, text: m },
    { type: DynamicType.R, velocity: 112, changeInVelocity: -18, accent: true, text: r },
    { type: DynamicType.S, velocity: 112, changeInVelocity: -18, accent: true, text: s },
    { type: DynamicType.Z, velocity: 80, changeInVelocity: 0, accent: true, text: z },
    { type: DynamicType.N, velocity: 49, changeInVelocity: -48, accent: true, text: '<sym>dynamicNiente</sym>' },
]

// TConv::symId(DynamicType)
const DYNAMIC_SYM_IDS: SymId[] = [
    SymId.noSym, SymId.dynamicPPPPPP, SymId.dynamicPPPPP, SymId.dynamicPPPP, SymId.dynamicPPP, SymId.dynamicPP,
    SymId.dynamicPiano, SymId.dynamicMP, SymId.dynamicMF, SymId.dynamicForte, SymId.dynamicFF, SymId.dynamicFFF,
    SymId.dynamicFFFF, SymId.dynamicFFFFF, SymId.dynamicFFFFFF, SymId.dynamicFortePiano, SymId.noSym, SymId.dynamicSforzando1,
    SymId.dynamicSforzato, SymId.noSym, SymId.dynamicSforzatoFF, SymId.noSym, SymId.noSym, SymId.dynamicSforzandoPiano,
    SymId.dynamicSforzandoPianissimo, SymId.dynamicRinforzando2, SymId.dynamicRinforzando1, SymId.dynamicForzando,
    SymId.dynamicMezzo, SymId.dynamicRinforzando, SymId.dynamicSforzando, SymId.dynamicZ, SymId.dynamicNiente,
]

export function dynamicSymId(t: DynamicType): SymId { return DYNAMIC_SYM_IDS[t] ?? SymId.noSym }

const dynamicsStyle: ElementStyle = [
    { sid: Sid.dynamicsMinDistance, pid: Pid.MIN_DISTANCE },
    { sid: Sid.avoidBarLines, pid: Pid.AVOID_BARLINES },
    { sid: Sid.centerOnNotehead, pid: Pid.CENTER_ON_NOTEHEAD },
]

const DYNAMIC_REGEX = /(?:<sym>.*?<\/sym>)+|(?:\b)[fmnprsz]+(?:\b(?=[^>]|$))/g

export class Dynamic extends TextBase {
    private m_dynamicType = DynamicType.OTHER
    private m_velocity = -1
    private m_changeInVelocity = 128
    private m_velChangeSpeed = DynamicSpeed.NORMAL
    private m_playDynamic = true
    private m_avoidBarLines = true
    private m_centerOnNotehead = false
    private m_leftHairpin: Spanner | null = null
    private m_rightHairpin: Spanner | null = null

    constructor(parent: EngravingObject | null) {
        super(ElementType.DYNAMIC, parent, TextStyleType.DYNAMICS, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
        this.initElementStyle(dynamicsStyle)
    }

    static dynamicList(): readonly Dyn[] { return DYN_LIST }
    static dynInfo(type: DynamicType): Dyn { return DYN_LIST[type] }
    static dynamicText(t: DynamicType): string { return DYN_LIST[t].text }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent() as unknown as Measure }

    dynamicType(): DynamicType { return this.m_dynamicType }

    /** setDynamicType(DynamicType) / setDynamicType(const String&) */
    setDynamicType(val: DynamicType | string): void {
        if (typeof val === 'string') {
            const [type, text] = this.parseDynamicText(val)
            this.m_dynamicType = type
            this.setXmlText(text)
        } else {
            this.m_dynamicType = val
        }
    }

    private parseDynamicText(tag: string): [DynamicType, string] {
        for (const match of tag.matchAll(DYNAMIC_REGEX)) {
            const matchStr = match[0]
            for (let i = 0; i < DYN_LIST.length; ++i) {
                if (TConv.toXmlDynamicType(i as DynamicType) === matchStr || DYN_LIST[i].text === matchStr) {
                    const replaced = tag.substring(0, match.index) + DYN_LIST[i].text + tag.substring(match.index! + matchStr.length)
                    return [i as DynamicType, replaced]
                }
            }
        }
        return [DynamicType.OTHER, tag]
    }

    override subtype(): number { return this.m_dynamicType }

    hasCustomText(): boolean { return Dynamic.dynamicText(this.m_dynamicType) !== this.xmlText() }

    setVelocity(v: number): void { this.m_velocity = v }
    velocity(): number { return this.m_velocity <= 0 ? DYN_LIST[this.m_dynamicType].velocity : this.m_velocity }
    setChangeInVelocity(val: number): void { this.m_changeInVelocity = val }
    velChangeSpeed(): DynamicSpeed { return this.m_velChangeSpeed }
    setVelChangeSpeed(val: DynamicSpeed): void { this.m_velChangeSpeed = val }
    playDynamic(): boolean { return this.m_playDynamic }
    setPlayDynamic(v: boolean): void { this.m_playDynamic = v }
    avoidBarLines(): boolean { return this.m_avoidBarLines }
    setAvoidBarLines(v: boolean): void { this.m_avoidBarLines = v }
    centerOnNotehead(): boolean { return this.m_centerOnNotehead }
    setCenterOnNotehead(v: boolean): void { this.m_centerOnNotehead = v }

    leftHairpin(): Spanner | null { return this.m_leftHairpin }
    rightHairpin(): Spanner | null { return this.m_rightHairpin }

    override positionRelativeToNoteheadRest(): boolean { return true }
    override sizeIsSpatiumDependent(): boolean { return true }

    snappedExpression(): Expression | null {
        const item = this.ldata().itemSnappedAfter()
        return item && item.isExpression() ? item as unknown as Expression : null
    }

    findAdjacentHairpins(): void {
        this.m_leftHairpin = null
        this.m_rightHairpin = null
        const tick = this.segment().tick()
        const intTick = tick.ticks()
        for (const sp of this.score().spannerMap().findOverlapping(intTick - 1, intTick + 1)) {
            if (sp.track() === this.track() && sp.isHairpin()) {
                if (sp.tick().eq(tick)) {
                    this.m_rightHairpin = sp
                } else if (sp.tick2().eq(tick)) {
                    this.m_leftHairpin = sp
                }
            }
        }
    }

    override symShapeWithCutouts(id: SymId): Shape {
        const stf = this.staff()
        const staffMag = stf ? stf.staffMag(this.tick()) : 1.0
        const shape = this.score().engravingFont().shapeWithCutouts(id, this.magS() * staffMag * this.symbolScale())
        for (const element of shape.elements()) {
            element.setItem(this)
        }
        return shape
    }

    override hasVoiceAssignmentProperties(): boolean { return true }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.DYNAMIC_TYPE: return this.m_dynamicType
        case Pid.VELOCITY: return this.velocity()
        case Pid.VELO_CHANGE_SPEED: return this.m_velChangeSpeed
        case Pid.AVOID_BARLINES: return this.m_avoidBarLines
        case Pid.CENTER_ON_NOTEHEAD: return this.m_centerOnNotehead
        case Pid.PLAY: return this.m_playDynamic
        case Pid.ANCHOR_TO_END_OF_PREVIOUS: return this.anchorToEndOfPrevious()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.DYNAMIC_TYPE: this.setDynamicType(v as DynamicType | string); break
        case Pid.VELOCITY: this.m_velocity = v as number; break
        case Pid.VELO_CHANGE_SPEED: this.m_velChangeSpeed = v as DynamicSpeed; break
        case Pid.AVOID_BARLINES: this.m_avoidBarLines = v as boolean; break
        case Pid.CENTER_ON_NOTEHEAD: this.m_centerOnNotehead = v as boolean; break
        case Pid.PLAY: this.m_playDynamic = v as boolean; break
        case Pid.ANCHOR_TO_END_OF_PREVIOUS: this.setAnchorToEndOfPrevious(v as boolean); break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.TEXT_STYLE: return TextStyleType.DYNAMICS
        case Pid.VELOCITY: return -1
        case Pid.VELO_CHANGE_SPEED: return DynamicSpeed.NORMAL
        case Pid.PLAY: return true
        case Pid.ANCHOR_TO_END_OF_PREVIOUS: return false
        default: return super.propertyDefault(id)
        }
    }

    override getPropertyStyle(pid: Pid): Sid {
        switch (pid) {
        case Pid.PLACEMENT: return Sid.dynamicsPlacement
        default: return super.getPropertyStyle(pid)
        }
    }
}
