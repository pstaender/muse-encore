/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/rest.h/.cpp
 */

import { PointF, RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { BeamMode, DurationType, ElementType, type track_idx_t } from '../types/types'
import { Sid } from '../style/styledef'
import { ChordRest, ChordRestLayoutData } from './chordrest'
import type { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { TDuration } from './durationtype'
import { Pid } from './property'
import { measureFactories, type Measure } from './measure'
import type { NoteDot } from './notedot'
import { tupletFactories } from './tuplet'

/** factories registered by the corresponding modules (avoid runtime import cycles) */
export const restFactories: {
    createNoteDot?: (rest: Rest) => NoteDot
} = {}

export class RestVerticalClearance {
    private m_above = 0 // In space units
    private m_below = 0 // In space units
    private m_locked = false

    reset(): void {
        this.m_above = 1000 // arbitrary high value
        this.m_below = 1000 // arbitrary high value
        this.m_locked = false
    }

    above(): number { return this.m_above }
    below(): number { return this.m_below }
    setAbove(v: number): void { this.m_above = Math.max(Math.min(this.m_above, v), 0) }
    setBelow(v: number): void { this.m_below = Math.max(Math.min(this.m_below, v), 0) }
    locked(): boolean { return this.m_locked }
    setLocked(v: boolean): void { this.m_locked = v }
}

export class RestLayoutData extends ChordRestLayoutData {
    mergedRests: Rest[] = [] // Rests from other voices that may be merged with this
    sym: SymId = SymId.restQuarter
}

export class Rest extends ChordRest {
    private m_dotline = -1 // depends on rest symbol
    private m_gap = false // invisible and not selectable for user
    private m_dots: NoteDot[] = []
    private m_deadSlapped: EngravingItem | null = null
    private m_verticalClearance = new RestVerticalClearance()
    private m_alignWithOtherRests = true

    constructor(parent: EngravingObject | null, d?: TDuration, type: ElementType = ElementType.REST) {
        super(type, parent)
        this.m_beamMode = BeamMode.NONE
        if (d) {
            this.setDurationType(d)
            if (d.fraction().isValid()) {
                this.setTicks(d.fraction())
            }
        }
    }

    protected override createLayoutData(): RestLayoutData { return new RestLayoutData(this) }

    numberRect(): RectF { return new RectF() } // TODO: add style to show number over 1-measure rests
    override ldata(): RestLayoutData { return super.ldata() as RestLayoutData }
    override mutldata(): RestLayoutData { return super.ldata() as RestLayoutData }

    override measure(): Measure {
        return (this.explicitParent() ? this.explicitParent()!.explicitParent() : null) as unknown as Measure
    }

    override mag(): number {
        const m = this.staff() ? this.staff()!.staffMag(this) : 1.0
        return m * this.intrinsicMag()
    }

    override intrinsicMag(): number {
        let m = 1.0
        if (this.isSmall()) {
            m *= this.style().styleD(Sid.smallNoteMag)
        }
        return m
    }

    isGap(): boolean { return this.m_gap }
    setGap(v: boolean): void { this.m_gap = v }

    override setOffset(x: number | PointF, y?: number): void {
        const o = x instanceof PointF ? x : new PointF(x, y ?? 0)
        const line = Math.round(o.y() / this.spatium())
        const ldata = this.mutldata()
        if (ldata.sym === SymId.restWhole && (line <= -2 || line >= 3)) {
            ldata.sym = SymId.restWholeLegerLine
        } else if (ldata.sym === SymId.restWholeLegerLine && (line > -2 && line < 4)) {
            ldata.sym = SymId.restWhole
        } else if (ldata.sym === SymId.restHalf && (line <= -3 || line >= 3)) {
            ldata.sym = SymId.restHalfLegerLine
        } else if (ldata.sym === SymId.restHalfLegerLine && (line > -3 && line < 3)) {
            ldata.sym = SymId.restHalf
        }
        super.setOffset(o)
    }

    getSymbol(type: DurationType, line: number, lines: number): SymId {
        switch (type) {
        case DurationType.V_LONG:
            return SymId.restLonga
        case DurationType.V_BREVE:
            return (line < 0 || line >= lines) ? SymId.restDoubleWholeLegerLine : SymId.restDoubleWhole
        case DurationType.V_MEASURE:
            if (this.ticks().ge(new Fraction(2, 1))) {
                return (line < 0 || line >= lines) ? SymId.restDoubleWholeLegerLine : SymId.restDoubleWhole
            }
            return (line < 0 || line >= lines) ? SymId.restWholeLegerLine : SymId.restWhole
        case DurationType.V_WHOLE:
            return (line < 0 || line >= lines) ? SymId.restWholeLegerLine : SymId.restWhole
        case DurationType.V_HALF:
            return (line < 0 || line >= lines) ? SymId.restHalfLegerLine : SymId.restHalf
        case DurationType.V_QUARTER:
            return SymId.restQuarter
        case DurationType.V_EIGHTH:
            return SymId.rest8th
        case DurationType.V_16TH:
            return SymId.rest16th
        case DurationType.V_32ND:
            return SymId.rest32nd
        case DurationType.V_64TH:
            return SymId.rest64th
        case DurationType.V_128TH:
            return SymId.rest128th
        case DurationType.V_256TH:
            return SymId.rest256th
        case DurationType.V_512TH:
            return SymId.rest512th
        case DurationType.V_1024TH:
            return SymId.rest1024th
        default:
            return SymId.restQuarter
        }
    }

    symWidthNoLedgerLines(ldata: RestLayoutData): number {
        if (ldata.sym === SymId.restHalfLegerLine) {
            return this.symWidth(SymId.restHalf)
        }
        if (ldata.sym === SymId.restWholeLegerLine) {
            return this.symWidth(SymId.restWhole)
        }
        if (ldata.sym === SymId.restDoubleWholeLegerLine) {
            return this.symWidth(SymId.restDoubleWhole)
        }
        return this.symWidth(ldata.sym)
    }

    checkDots(): void {
        const n = this.dots() - this.m_dots.length
        for (let i = 0; i < n; ++i) {
            const dot = restFactories.createNoteDot!(this)
            dot.setParent(this)
            dot.setVisible(this.visible())
            this.add(dot)
        }
        if (n < 0) {
            for (let i = 0; i < -n; ++i) {
                this.remove(this.m_dots[this.m_dots.length - 1])
            }
        }
    }

    dot(n: number): NoteDot {
        this.checkDots()
        return this.m_dots[n]
    }

    dotList(): NoteDot[] { return this.m_dots }

    dotLine(): number { return this.m_dotline }
    setDotLine(l: number): void { this.m_dotline = l }

    static getDotline(durationType: DurationType): number {
        switch (durationType) {
        case DurationType.V_64TH:
        case DurationType.V_32ND:
            return -3
        case DurationType.V_1024TH:
        case DurationType.V_512TH:
        case DurationType.V_256TH:
        case DurationType.V_128TH:
            return -5
        case DurationType.V_MEASURE:
        case DurationType.V_WHOLE:
            return 1
        default:
            return -1
        }
    }

    accent(): boolean { return this.voice() >= 2 && this.isSmall() }

    isWholeRest(): boolean {
        const durType = this.durationType()
        return durType.equals(DurationType.V_WHOLE)
               || (durType.equals(DurationType.V_MEASURE) && !!this.measure()
                   && this.measure().ticks().lt(new Fraction(2, 1)))
    }

    isBreveRest(): boolean {
        const durType = this.durationType()
        return durType.equals(DurationType.V_BREVE)
               || (durType.equals(DurationType.V_MEASURE) && !!this.measure()
                   && this.measure().ticks().ge(new Fraction(2, 1)))
    }

    deadSlapped(): EngravingItem | null { return this.m_deadSlapped }

    override upPos(): number { return this.symBbox(this.ldata().sym).y() }
    override downPos(): number { return this.symBbox(this.ldata().sym).y() + this.symHeight(this.ldata().sym) }
    override rightEdge(): number { return this.x() + this.width() }

    centerX(): number {
        const bbox = this.symBbox(this.ldata().sym)
        return bbox.left() + bbox.width() / 2
    }

    alignWithOtherRests(): boolean { return this.m_alignWithOtherRests }
    setAlignWithOtherRests(v: boolean): void { this.m_alignWithOtherRests = v }

    verticalClearance(): RestVerticalClearance { return this.m_verticalClearance }

    override scanElements(func: (item: EngravingItem) => void): void {
        super.scanElements(func)
        for (const e of this.el()) {
            e.scanElements(func)
        }
        for (const dot of this.m_dots) {
            dot.scanElements(func)
        }
        if (!this.isGap()) {
            func(this)
        }
        if (this.leftParen()) {
            func(this.leftParen()!)
        }
        if (this.rightParen()) {
            func(this.rightParen()!)
        }
    }

    override setTrack(val: track_idx_t): void {
        super.setTrack(val)
        for (const dot of this.m_dots ?? []) {
            dot.setTrack(val)
        }
    }

    override add(e: EngravingItem): void {
        if (e.explicitParent() !== this) {
            e.setParent(this)
        }
        e.setTrack(this.track())
        switch (e.type()) {
        case ElementType.NOTEDOT:
            this.m_dots.push(e as NoteDot)
            break
        case ElementType.DEAD_SLAPPED:
            this.m_deadSlapped = e
            break
        default:
            super.add(e)
            break
        }
    }

    override remove(e: EngravingItem): void {
        switch (e.type()) {
        case ElementType.NOTEDOT:
            this.m_dots.pop()
            break
        case ElementType.DEAD_SLAPPED:
            this.m_deadSlapped = null
            this.removeEl(e)
            break
        case ElementType.SYMBOL:
        case ElementType.IMAGE:
            this.removeEl(e)
            break
        default:
            super.remove(e)
            break
        }
    }

    shouldNotBeDrawn(): boolean {
        const st = this.staff() ? this.staff()!.staffTypeForElement(this) : null
        if (this.generated()) {
            return true
        }
        if (st && st.isTabStaff() && (!st.showRests() || st.genDurations())
            && (!this.explicitParent() || !this.measure().isMMRest())) {
            return true
        }
        if (this.explicitParent() && this.measure().measureRepeatCount(this.staffIdx())) {
            return true
        }
        return false
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GAP: return false
        case Pid.ALIGN_WITH_OTHER_RESTS: return true
        default: return super.propertyDefault(propertyId)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.GAP: return this.m_gap
        case Pid.ALIGN_WITH_OTHER_RESTS: return this.alignWithOtherRests()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.GAP:
            this.m_gap = !!v
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            break
        case Pid.OFFSET:
            this.setOffset(v as PointF)
            break
        case Pid.ALIGN_WITH_OTHER_RESTS:
            this.setAlignWithOtherRests(!!v)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }
}

tupletFactories.createRest = (parent: EngravingObject) => new Rest(parent)
measureFactories.createRest = (parent: Measure) => new Rest(parent)
