/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/slurtie.h/.cpp (editing is not ported)
 */

import { Color } from '../../framework/draw/types/color'
import { PointF } from '../../framework/draw/types/geometry'
import { PainterPath } from '../../framework/draw/types/painterpath'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionV, SlurStyleType, type ElementType } from '../types/types'
import { Grip, type EditData } from '../editing/editdata'
import { ElementFlag, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { Spanner, SpannerSegment } from './spanner'
import type { System } from './system'

export interface SlurTiePos {
    p1: PointF // start point of slur in system coordinates
    system1: System | null // start system of slur
    p2: PointF // end point of slur in system coordinates
    system2: System | null // end system of slur
}

export class UP {
    p = new PointF() // layout position relative to pos()
    off = new PointF() // user offset in point units

    pos(): PointF { return this.p.plus(this.off) }
}

export class CubicBezier {
    constructor(private p1: PointF, private p2: PointF, private p3: PointF, private p4: PointF) {}

    pointAtPercent(t: number): PointF {
        const r = 1.0 - t
        const B123 = this.p1.times(r).plus(this.p2.times(t)).times(r).plus(this.p2.times(r).plus(this.p3.times(t)).times(t))
        const B234 = this.p2.times(r).plus(this.p3.times(t)).times(r).plus(this.p3.times(r).plus(this.p4.times(t)).times(t))
        return B123.times(r).plus(B234.times(t))
    }
}

export class SlurTieSegmentLayoutData extends LayoutData {
    path = new PainterPath()
    midThickness = 0
}

export abstract class SlurTieSegment extends SpannerSegment {
    protected m_ups: UP[] = [new UP(), new UP(), new UP(), new UP(), new UP(), new UP()]

    protected constructor(type: ElementType, parent: System | null) {
        super(type, null, parent)
        this.setFlag(ElementFlag.ON_STAFF, true)
    }

    protected override createLayoutData(): SlurTieSegmentLayoutData { return new SlurTieSegmentLayoutData(this) }
    override ldata(): SlurTieSegmentLayoutData { return super.ldata() as SlurTieSegmentLayoutData }
    override mutldata(): SlurTieSegmentLayoutData { return super.ldata() as SlurTieSegmentLayoutData }

    slurTie(): SlurTie { return this.spanner() as SlurTie }

    override move(s: PointF): void {
        super.move(s)
        for (let k = 0; k < Grip.GRIPS; ++k) {
            this.m_ups[k].p.add(s)
        }
    }

    setSlurOffset(i: Grip, val: PointF): void { this.m_ups[i].off = val.clone() }
    ups(i: Grip): UP { return this.m_ups[i] }

    // ---- grips (slurtie.cpp: gripsPositions, startDragGrip, endDragGrip) ----

    override needStartEditingAfterSelecting(): boolean { return true }
    override gripsCount(): number { return Grip.GRIPS }
    override initialEditModeGrip(): Grip { return Grip.END }
    override defaultGrip(): Grip { return Grip.DRAG }

    override gripsPositions(_ed?: EditData): PointF[] {
        const ngrips = this.gripsCount()
        const grips: PointF[] = []

        const p = this.pagePos()
        for (let i = 0; i < ngrips; ++i) {
            grips.push(this.m_ups[i].p.plus(this.m_ups[i].off).plus(p))
        }

        return grips
    }

    override startDragGrip(ed: EditData): void {
        const eed = ed.getData(this)
        if (!eed) {
            return
        }
        for (const i of [Pid.SLUR_UOFF1, Pid.SLUR_UOFF2, Pid.SLUR_UOFF3, Pid.SLUR_UOFF4, Pid.OFFSET]) {
            eed.pushProperty(i)
        }
    }

    override endDragGrip(ed: EditData): void {
        super.endDragGrip(ed)
        this.triggerLayout()
    }

    abstract endWidth(): number
    abstract midWidth(): number
    abstract dottedWidth(): number

    override isUserModified(): boolean {
        return super.isUserModified() || !(this.visible() && this.autoplace()
                                           && this.color().equals(Color.BLACK) // configuration()->defaultColor()
                                           && this.offset().isNull()
                                           && this.ups(Grip.START).off.isNull()
                                           && this.ups(Grip.BEZIER1).off.isNull()
                                           && this.ups(Grip.BEZIER2).off.isNull()
                                           && this.ups(Grip.END).off.isNull())
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SLUR_STYLE_TYPE:
        case Pid.SLUR_DIRECTION:
            return this.slurTie().getProperty(propertyId)
        case Pid.SLUR_UOFF1: return this.ups(Grip.START).off
        case Pid.SLUR_UOFF2: return this.ups(Grip.BEZIER1).off
        case Pid.SLUR_UOFF3: return this.ups(Grip.BEZIER2).off
        case Pid.SLUR_UOFF4: return this.ups(Grip.END).off
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SLUR_STYLE_TYPE:
        case Pid.SLUR_DIRECTION:
            return this.slurTie().setProperty(propertyId, v)
        case Pid.SLUR_UOFF1:
            this.ups(Grip.START).off = (v as PointF).clone()
            break
        case Pid.SLUR_UOFF2:
            this.ups(Grip.BEZIER1).off = (v as PointF).clone()
            break
        case Pid.SLUR_UOFF3:
            this.ups(Grip.BEZIER2).off = (v as PointF).clone()
            break
        case Pid.SLUR_UOFF4:
            this.ups(Grip.END).off = (v as PointF).clone()
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SLUR_STYLE_TYPE:
        case Pid.SLUR_DIRECTION:
            return this.slurTie().propertyDefault(id)
        case Pid.SLUR_UOFF1:
        case Pid.SLUR_UOFF2:
        case Pid.SLUR_UOFF3:
        case Pid.SLUR_UOFF4:
            return new PointF()
        default:
            return super.propertyDefault(id)
        }
    }
}

export abstract class SlurTie extends Spanner {
    protected m_up = true // actual direction
    protected m_slurDirection: DirectionV = DirectionV.AUTO
    private m_styleType = SlurStyleType.Solid

    protected constructor(type: ElementType, parent: EngravingObject | null) {
        super(type, parent)
    }

    up(): boolean { return this.m_up }
    setUp(val: boolean): void { this.m_up = val }
    slurDirection(): DirectionV { return this.m_slurDirection }
    setSlurDirection(d: DirectionV): void { this.m_slurDirection = d }
    override contains(): boolean { return false } // not selectable
    styleType(): SlurStyleType { return this.m_styleType }
    setStyleType(type: SlurStyleType): void { this.m_styleType = type }
    override subtype(): number { return this.m_styleType + 1 }

    abstract newSlurTieSegment(parent: System | null): SlurTieSegment
    abstract scalingFactor(): number

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SLUR_STYLE_TYPE: return this.styleType()
        case Pid.SLUR_DIRECTION: return this.slurDirection()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SLUR_STYLE_TYPE:
            this.setStyleType(v as SlurStyleType)
            break
        case Pid.SLUR_DIRECTION:
            this.setSlurDirection(v as DirectionV)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SLUR_STYLE_TYPE: return SlurStyleType.Solid
        case Pid.SLUR_DIRECTION: return DirectionV.AUTO
        default: return super.propertyDefault(id)
        }
    }

    /** SlurTie::fixupSegments(unsigned) in C++ (renamed: TS has no overloads) */
    fixupSlurTieSegments(nsegs: number): void {
        this.fixupSegments(nsegs, (parent: System | null) => this.newSlurTieSegment(parent))
    }
}
