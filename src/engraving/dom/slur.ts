/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/slur.h/.cpp (editing is not ported)
 */

import { PointF } from '../../framework/draw/types/geometry'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, PartialSpannerDirection, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { Grip, type EditData } from '../editing/editdata'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { SpannerAnchor } from './spanner'
import { SlurTie, SlurTieSegment } from './slurtie'
import type { Chord } from './chord'
import type { System } from './system'

export class SlurSegment extends SlurTieSegment {
    private m_extraHeight = 0.0
    private m_endPointOff1 = new PointF(0.0, 0.0)
    private m_endPointOff2 = new PointF(0.0, 0.0)

    constructor(parent: System | null, type: ElementType = ElementType.SLUR_SEGMENT) {
        super(type, parent)
    }

    extraHeight(): number { return this.m_extraHeight }
    setExtraHeight(v: number): void { this.m_extraHeight = v }
    endPointOff1(): PointF { return this.m_endPointOff1 }
    setEndPointOff1(v: PointF): void { this.m_endPointOff1 = v.clone() }
    endPointOff2(): PointF { return this.m_endPointOff2 }
    setEndPointOff2(v: PointF): void { this.m_endPointOff2 = v.clone() }

    /**
     * the grips move the user offsets; the layout computes the bezier from them (C++ renderer()->computeBezier()).
     * TODO(port): changing the anchor note while dragging the start/end grip (ed.view()->elementNear), the shoulder
     * grip (computeBezier with a shoulder offset)
     */
    override dragGrip(ed: EditData): void {
        const g = ed.curGrip

        switch (g) {
        case Grip.START:
        case Grip.END:
        case Grip.BEZIER1:
        case Grip.BEZIER2:
            this.ups(g).off = this.ups(g).off.plus(ed.delta)
            break
        case Grip.SHOULDER:
            this.ups(g).off = new PointF()
            break
        case Grip.DRAG:
            this.ups(Grip.DRAG).off = new PointF()
            this.setOffset(this.offset().plus(ed.delta))
            break
        default:
            return
        }

        this.triggerLayout()
    }

    isEdited(): boolean {
        for (let i = 0; i < Grip.GRIPS; ++i) {
            if (!this.m_ups[i].off.isNull()) {
                return true
            }
        }
        return false
    }

    isEndPointsEdited(): boolean {
        return !(this.m_ups[Grip.START].off.isNull() && this.m_ups[Grip.END].off.isNull())
    }

    slur(): Slur { return this.spanner() as Slur }

    override endWidth(): number { return this.style().styleMM(Sid.slurEndWidth) }
    override midWidth(): number { return this.style().styleMM(Sid.slurMidWidth) }
    override dottedWidth(): number { return this.style().styleMM(Sid.slurDottedWidth) }
}

export interface StemFloated {
    left: boolean
    right: boolean
}

export enum SlurConnectedElement {
    NONE,
    GLISSANDO,
}

export class Slur extends SlurTie {
    private m_connectedElement = SlurConnectedElement.NONE
    private m_partialSpannerDirection = PartialSpannerDirection.NONE
    private m_stemFloated: StemFloated = { left: false, right: false } // end point position is attached to stem but floated towards the note

    constructor(parent: EngravingObject | null, type: ElementType = ElementType.SLUR) {
        super(type, parent)
        this.setAnchor(SpannerAnchor.CHORD)
    }

    connectedElement(): SlurConnectedElement { return this.m_connectedElement }
    setConnectedElement(v: SlurConnectedElement): void { this.m_connectedElement = v }
    partialSpannerDirection(): PartialSpannerDirection { return this.m_partialSpannerDirection }
    setPartialSpannerDirection(v: PartialSpannerDirection): void { this.m_partialSpannerDirection = v }

    override setTrack(n: track_idx_t): void {
        super.setTrack(n)
        for (const ss of this.spannerSegments() ?? []) {
            ss.setTrack(n)
        }
    }

    frontSlurSegment(): SlurSegment { return this.frontSegment() as SlurSegment }
    backSlurSegment(): SlurSegment { return this.backSegment() as SlurSegment }

    isCrossStaff(): boolean {
        const s = this.startCR()
        const e = this.endCR()
        return !!s && !!e && (s.staffMove() !== 0 || e.staffMove() !== 0 || s.vStaffIdx() !== e.vStaffIdx())
    }

    hasCrossBeams(): boolean {
        const s = this.startCR()
        const e = this.endCR()
        return (!!s && !!s.beam() && s.beam()!.cross()) || (!!e && !!e.beam() && e.beam()!.cross())
    }

    stemFloated(): StemFloated { return this.m_stemFloated }

    override newSlurTieSegment(parent: System | null): SlurTieSegment { return new SlurSegment(parent) }

    override scalingFactor(): number {
        const se = this.startElement()
        const ee = this.endElement()
        let startC = se && se.isChord() ? se as unknown as Chord : null
        let endC = ee && ee.isChord() ? ee as unknown as Chord : null
        if (!startC || !endC) {
            return 1.0
        }
        if ((startC.isGraceBefore() && startC.parent() === endC)
            || (endC.isGraceAfter() && endC.parent() === startC)) {
            return this.style().styleD(Sid.graceNoteMag)
        }
        if (startC.isGrace()) {
            startC = startC.parent() as unknown as Chord
        }
        if (endC.isGrace()) {
            endC = endC.parent() as unknown as Chord
        }
        return 0.5 * (startC.intrinsicMag() + endC.intrinsicMag())
    }

    isIncoming(): boolean {
        return this.m_partialSpannerDirection === PartialSpannerDirection.BOTH
               || this.m_partialSpannerDirection === PartialSpannerDirection.INCOMING
    }

    isOutgoing(): boolean {
        return this.m_partialSpannerDirection === PartialSpannerDirection.BOTH
               || this.m_partialSpannerDirection === PartialSpannerDirection.OUTGOING
    }

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.PARTIAL_SPANNER_DIRECTION) {
            return this.partialSpannerDirection()
        }
        return super.getProperty(propertyId)
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.PARTIAL_SPANNER_DIRECTION) {
            return PartialSpannerDirection.NONE
        }
        return super.propertyDefault(id)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.PARTIAL_SPANNER_DIRECTION) {
            this.setPartialSpannerDirection(v as PartialSpannerDirection)
            return true
        }
        return super.setProperty(propertyId, v)
    }
}
