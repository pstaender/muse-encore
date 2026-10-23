/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/beambase.h/.cpp
 */

import { LineF, PointF, RectF } from '../../framework/draw/types/geometry'
import { RealIsEqual } from '../../framework/global/realfn'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { DirectionV, type ElementType, type staff_idx_t } from '../types/types'
import { Shape } from '../infrastructure/shape'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { Beam } from './beam'
import type { Chord } from './chord'
import type { ChordRest } from './chordrest'
import type { StaffType } from './stafftype'

export enum BeamType {
    INVALID,
    BEAM,
    TREMOLO,
}

export interface BeamFragment {
    py1: [number, number]
    py2: [number, number]
}

export enum ChordBeamAnchorType {
    Start, End, Middle,
}

export class BeamSegment {
    line = new LineF()
    level = 0
    above = false // above level 0 or below? (meaningless for level 0)
    startTick = new Fraction(0, 1)
    endTick = new Fraction(0, 1)
    isBeamlet = false
    isBefore = false
    parentElement: EngravingItem

    constructor(b: EngravingItem) {
        this.parentElement = b
    }

    shape(): Shape {
        const shape = new Shape()
        let startPoint = this.line.p1()
        let endPoint = this.line.p2()
        const beamWidth = (this.parentElement as unknown as { beamWidthForShape(): number }).beamWidthForShape()
        if (startPoint.x() > endPoint.x()) {
            [startPoint, endPoint] = [endPoint, startPoint]
        }
        const beamHorizontalLength = endPoint.x() - startPoint.x()
        if (RealIsEqual(startPoint.y(), endPoint.y())) {
            const rect = new RectF(startPoint.x(), startPoint.y(), beamHorizontalLength, beamWidth / 2)
            rect.adjust(0.0, -beamWidth / 2, 0.0, 0.0)
            shape.add(rect, this.parentElement)
            return shape
        }
        // If the beam is not horizontal, the shape is made of a staircase of rectangles
        const beamHeightDiff = endPoint.y() - startPoint.y()
        let subBoxesCount = Math.floor(beamHorizontalLength / this.parentElement.spatium())
        subBoxesCount = Math.max(subBoxesCount, 1) // at least one rectangle, of course (avoid division by zero)
        const horizontalStep = beamHorizontalLength / subBoxesCount
        const verticalStep = beamHeightDiff / subBoxesCount
        const pointsOnBeamLine: PointF[] = [startPoint]
        for (let i = 0; i < subBoxesCount - 1; ++i) {
            pointsOnBeamLine.push(pointsOnBeamLine[pointsOnBeamLine.length - 1].plus(new PointF(horizontalStep, verticalStep)))
        }
        for (const point of pointsOnBeamLine) {
            const rect = new RectF(point.x(), point.y(), horizontalStep, beamWidth / 2)
            rect.adjust(0.0, -beamWidth / 2, 0.0, 0.0)
            shape.add(rect, this.parentElement)
        }
        return shape
    }
}

export class NotePosition {
    constructor(public line = 0, public staff: staff_idx_t = 0) {}

    lt(o: NotePosition): boolean { return this.staff < o.staff || (this.staff === o.staff && this.line < o.line) }
    gt(o: NotePosition): boolean { return o.lt(this) }
    le(o: NotePosition): boolean { return !o.lt(this) }
    ge(o: NotePosition): boolean { return !this.lt(o) }
    equals(o: NotePosition): boolean { return this.line === o.line && this.staff === o.staff }
}

export enum CrossStaffBeamPosition {
    INVALID,
    BETWEEN,
    ABOVE,
    BELOW,
}

export class BeamBaseLayoutData extends LayoutData {
    beamType = BeamType.INVALID
    beam: Beam | null = null
    trem: EngravingItem | null = null
    up = false
    tick = new Fraction(0, 1)
    spatium = 0
    startAnchor = new PointF()
    endAnchor = new PointF()
    slope = 0
    isGrace = false
    beamSpacing = 0
    beamDist = 0.0
    beamWidth = 0.0
    elements: ChordRest[] = []
    notePositions: NotePosition[] = []
    tab: StaffType | null = null
    isBesideTabStaff = false
    crossStaffBeamPos = CrossStaffBeamPosition.INVALID
    limitingChordAbove: Chord | null = null // <-
    limitingChordBelow: Chord | null = null // <- For cross-staff spacing and centering

    setAnchors(startA: PointF, endA: PointF): void {
        this.startAnchor = startA.clone()
        this.endAnchor = endA.clone()
    }

    override isValid(): boolean { return this.beamType !== BeamType.INVALID }
}

export abstract class BeamBase extends EngravingItem {
    protected m_beamSegments: BeamSegment[] = []
    protected m_startAnchor = new PointF()
    protected m_endAnchor = new PointF()
    private m_crossStaffMove = 0
    private m_up = true
    private m_userModified: [boolean, boolean] = [false, false] // 0: auto/down  1: up
    private m_direction: DirectionV = DirectionV.AUTO

    protected constructor(type: ElementType, parent: EngravingObject | null, flags: number = ElementFlag.ON_STAFF) {
        super(type, parent, flags)
    }

    protected override createLayoutData(): BeamBaseLayoutData { return new BeamBaseLayoutData(this) }
    override ldata(): BeamBaseLayoutData { return super.ldata() as BeamBaseLayoutData }
    override mutldata(): BeamBaseLayoutData { return super.ldata() as BeamBaseLayoutData }

    abstract maxCRMove(): number
    abstract minCRMove(): number
    abstract setDirection(v: DirectionV): void
    abstract beamWidthForShape(): number

    crossStaffMove(): number { return this.m_crossStaffMove }
    setCrossStaffMove(v: number): void { this.m_crossStaffMove = v }

    crossStaffIdx(): number { return this.defaultCrossStaffIdx() + this.m_crossStaffMove }

    defaultCrossStaffIdx(): number {
        const average = 0.5 * (this.minCRMove() + this.maxCRMove())
        return Math.ceil(average)
    }

    acceptCrossStaffMove(move: number): boolean {
        const newCrossStaffIdx = this.defaultCrossStaffIdx() + move
        return newCrossStaffIdx >= this.minCRMove() && newCrossStaffIdx <= this.maxCRMove() + 1
    }

    up(): boolean { return this.m_up }
    setUp(v: boolean): void { this.m_up = v }
    userModified(): boolean { return this.m_userModified[this.directionIdx()] }
    setUserModified(val: boolean): void { this.m_userModified[this.directionIdx()] = val }
    direction(): DirectionV { return this.m_direction }
    doSetDirection(val: DirectionV): void { this.m_direction = val }
    directionIdx(): number { return (this.m_direction === DirectionV.AUTO || this.m_direction === DirectionV.DOWN) ? 0 : 1 }

    beamSegments(): BeamSegment[] { return this.m_beamSegments }
    clearBeamSegments(): void { this.m_beamSegments = [] }

    startAnchor(): PointF { return this.m_startAnchor }
    setStartAnchor(p: PointF): void { this.m_startAnchor = p.clone() }
    endAnchor(): PointF { return this.m_endAnchor }
    setEndAnchor(p: PointF): void { this.m_endAnchor = p.clone() }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BEAM_CROSS_STAFF_MOVE: return this.crossStaffMove()
        case Pid.STEM_DIRECTION: return this.direction()
        case Pid.USER_MODIFIED: return this.userModified()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.BEAM_CROSS_STAFF_MOVE:
            this.setCrossStaffMove(v as number)
            break
        case Pid.STEM_DIRECTION:
            this.setDirection(v as DirectionV)
            break
        case Pid.USER_MODIFIED:
            this.setUserModified(!!v)
            break
        default:
            if (!super.setProperty(propertyId, v)) {
                return false
            }
            break
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.BEAM_CROSS_STAFF_MOVE: return 0
        case Pid.STEM_DIRECTION: return DirectionV.AUTO
        case Pid.USER_MODIFIED: return false
        default: return super.propertyDefault(propertyId)
        }
    }
}
