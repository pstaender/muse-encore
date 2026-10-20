/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/vibrato.h/.cpp
 */

import type { PointF } from '../../framework/draw/types/geometry'
import type { Color } from '../../framework/draw/types/color'
import type { SymId, SymIdList } from '../types/symid'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, VibratoType } from '../types/types'
import { Sid } from '../style/styledef'
import type { Grip } from '../editing/editdata'
import { ElementFlag } from './engravingitem'
import type { ElementStyle, EngravingObject } from './engravingobject'
import { LineSegment, SLine } from './line'
import { Pid } from './property'
import type { System } from './system'
import { Trill } from './trill'

export class VibratoSegment extends LineSegment {
    private m_symbols: SymIdList = []

    constructor(sp: Vibrato | null, parent: System | null) {
        super(ElementType.VIBRATO_SEGMENT, sp, parent, ElementFlag.MOVABLE | ElementFlag.ON_STAFF)
    }

    vibrato(): Vibrato { return this.spanner() as Vibrato }

    override propertyDelegate(pid: Pid): EngravingObject | null {
        if (pid === Pid.VIBRATO_TYPE || pid === Pid.PLACEMENT) {
            return this.spanner()
        }
        return super.propertyDelegate(pid)
    }

    symbols(): SymIdList { return this.m_symbols }
    setSymbols(s: SymIdList): void { this.m_symbols = s }

    symbolLine(start: SymId, fill: SymId, end: SymId | null = null): void {
        const x1 = 0
        const x2 = this.pos2().x()
        const w = x2 - x1
        const mag = this.magS()
        const f = this.score().engravingFont()

        this.m_symbols = []
        this.m_symbols.push(start)
        if (end === null) {
            const w1 = f.advance(start, mag)
            const w2 = f.advance(fill, mag)
            const n = Math.round((w - w1) / w2)
            for (let i = 0; i < n; ++i) {
                this.m_symbols.push(fill)
            }
        } else {
            const w1 = f.bbox(start, mag).width()
            const w2 = f.width(fill, mag)
            const w3 = f.width(end, mag)
            const n = Math.round((w - w1 - w3) / w2)
            for (let i = 0; i < n; ++i) {
                this.m_symbols.push(fill)
            }
            this.m_symbols.push(end)
        }
        const r = f.bboxList(this.m_symbols, mag)
        this.setbbox(r)
    }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.spanner().placeAbove() ? Sid.vibratoPosAbove : Sid.vibratoPosBelow
        }
        return super.getPropertyStyle(pid)
    }
}

const vibratoStyle: ElementStyle = [
    { sid: Sid.vibratoPlacement, pid: Pid.PLACEMENT },
    { sid: Sid.vibratoPosAbove, pid: Pid.OFFSET },
]

const vibratoSegmentStyle: ElementStyle = [
    { sid: Sid.vibratoPosAbove, pid: Pid.OFFSET },
    { sid: Sid.vibratoMinDistance, pid: Pid.MIN_DISTANCE },
]

export class Vibrato extends SLine {
    private m_vibratoType = VibratoType.GUITAR_VIBRATO

    constructor(parent: EngravingObject | null) {
        super(ElementType.VIBRATO, parent)
        this.initElementStyle(vibratoStyle)
        this.m_vibratoType = VibratoType.GUITAR_VIBRATO
    }

    override createLineSegment(parent: System | null): LineSegment {
        const seg = new VibratoSegment(this, parent)
        seg.setTrack(this.track())
        seg.setColor(this.lineColor())
        seg.initElementStyle(vibratoSegmentStyle)
        return seg
    }

    override linePos(grip: Grip): { pos: PointF; system: System | null } {
        return Trill.trillLinePos(this, grip)
    }

    setVibratoType(tt: VibratoType): void { this.m_vibratoType = tt }
    vibratoType(): VibratoType { return this.m_vibratoType }

    override getPropertyStyle(pid: Pid): Sid {
        if (pid === Pid.OFFSET) {
            return this.placeAbove() ? Sid.vibratoPosAbove : Sid.vibratoPosBelow
        }
        return super.getPropertyStyle(pid)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.VIBRATO_TYPE:
            return this.vibratoType()
        default:
            break
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, val: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.VIBRATO_TYPE:
            this.setVibratoType(val as VibratoType)
            break
        case Pid.COLOR:
            this.setColor(val as Color)
            this.setLineColor(val as Color)
            break
        default:
            return super.setProperty(propertyId, val)
        }
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.VIBRATO_TYPE:
            return VibratoType.GUITAR_VIBRATO
        case Pid.PLACEMENT:
            return this.style().styleV(Sid.vibratoPlacement)
        default:
            return super.propertyDefault(propertyId)
        }
    }
}
