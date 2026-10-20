/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/clef.h/.cpp (the ClefInfo table is in clefinfo.ts)
 */

import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { ClefToBarlinePosition, ClefType, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { EngravingItem, ElementFlag, LayoutData } from './engravingitem'
import { ClefTypeList } from './clefinfo'
import { Pid } from './property'
import { SegmentType, type Segment } from './segment'
import type { Measure } from './measure'
import { arg, mtrc } from '../../framework/global/translation'
import { TConv } from '../types/typesconv'

export class ClefLayoutData extends LayoutData {
    symId: SymId = SymId.noSym
}

export class Clef extends EngravingItem {
    private m_showCourtesy = true
    private m_isSmall = false
    private m_forInstrumentChange = false
    private m_isHeader = false
    private m_isCourtesy = false
    private m_isTrailer = false
    private m_clefToBarlinePosition = ClefToBarlinePosition.AUTO
    private m_clefTypes = new ClefTypeList(ClefType.INVALID)

    constructor(parent: Segment | null) {
        super(ElementType.CLEF, parent, ElementFlag.ON_STAFF)
        this.m_isHeader = !!parent && parent.isHeaderClefType()
    }

    protected override createLayoutData(): ClefLayoutData { return new ClefLayoutData(this) }
    override ldata(): ClefLayoutData { return super.ldata() as ClefLayoutData }
    override mutldata(): ClefLayoutData { return super.ldata() as ClefLayoutData }

    override mag(): number {
        let mag = this.staff() ? this.staff()!.staffMag(this) : 1.0
        if (this.m_isSmall) {
            mag *= this.style().styleD(Sid.smallClefMag)
        }
        return mag
    }

    segment(): Segment { return this.explicitParent() as unknown as Segment }
    measure(): Measure { return this.explicitParent()!.explicitParent() as unknown as Measure }

    isSmall(): boolean { return this.m_isSmall }
    setSmall(val: boolean): void { this.m_isSmall = val }
    showCourtesy(): boolean { return this.m_showCourtesy }
    setShowCourtesy(v: boolean): void { this.m_showCourtesy = v }

    otherClef(): Clef | null {
        const p = this.explicitParent()
        if (!p || !p.isSegment()) {
            return null
        }
        const segm = p as unknown as Segment
        if (!segm.explicitParent() || !segm.explicitParent()!.isMeasure()) {
            return null
        }
        const meas = segm.explicitParent() as unknown as Measure
        let otherMeas: Measure | null = null
        const segmTick = segm.tick()
        let type = SegmentType.Clef
        if (segmTick.eq(meas.tick()) && segm.segmentType() === SegmentType.HeaderClef) { // if clef segm is measure-initial
            otherMeas = meas.prevMeasure() // look for a previous measure
        } else if (segmTick.eq(meas.tick().plus(meas.ticks()))) { // if clef segm is measure-final
            otherMeas = meas.nextMeasure() // look for a next measure
            type = SegmentType.HeaderClef
        }
        if (!otherMeas) {
            return null
        }
        const otherSegm = otherMeas.findSegment(type, segmTick)
        if (!otherSegm) {
            return null
        }
        return otherSegm.element(this.track()) as Clef | null
    }

    clefType(): ClefType {
        return this.concertPitch() ? this.m_clefTypes.concertClef : this.m_clefTypes.transposingClef
    }

    setClefType(i: ClefType | ClefTypeList): void {
        if (i instanceof ClefTypeList) {
            this.m_clefTypes = i.clone()
            return
        }
        if (this.concertPitch()) {
            this.m_clefTypes.concertClef = i
            if (this.m_clefTypes.transposingClef === ClefType.INVALID) {
                this.m_clefTypes.transposingClef = i
            }
        } else {
            this.m_clefTypes.transposingClef = i
            if (this.m_clefTypes.concertClef === ClefType.INVALID) {
                this.m_clefTypes.concertClef = i
            }
        }
    }

    isCourtesy(): boolean { return this.m_isCourtesy }
    setIsCourtesy(v: boolean): void { this.m_isCourtesy = v }
    override subtype(): number { return this.clefType() }
    setForInstrumentChange(v: boolean): void { this.m_forInstrumentChange = v }
    forInstrumentChange(): boolean { return this.m_forInstrumentChange }
    clefTypeList(): ClefTypeList { return this.m_clefTypes.clone() }
    concertClef(): ClefType { return this.m_clefTypes.concertClef }
    transposingClef(): ClefType { return this.m_clefTypes.transposingClef }
    setConcertClef(val: ClefType): void { this.m_clefTypes.concertClef = val }
    setTransposingClef(val: ClefType): void { this.m_clefTypes.transposingClef = val }

    clefToBarlinePosition(): ClefToBarlinePosition { return this.m_clefToBarlinePosition }
    setClefToBarlinePosition(val: ClefToBarlinePosition): void { this.m_clefToBarlinePosition = val }

    changeClefToBarlinePos(newPos: ClefToBarlinePosition): void {
        this.m_clefToBarlinePosition = newPos
        if (!this.explicitParent()) {
            return
        }
        const seg = this.segment()
        const nStaves = this.score().nstaves()
        for (let staffIndex = 0; staffIndex < nStaves; ++staffIndex) {
            const clef = seg.element(staffIndex * 4) as Clef | null
            if (clef) {
                clef.m_clefToBarlinePosition = newPos
            }
        }
    }

    isHeader(): boolean { return this.m_isHeader }
    setIsHeader(val: boolean): void { this.m_isHeader = val }
    isTrailer(): boolean { return this.m_isTrailer }
    setIsTrailer(val: boolean): void { this.m_isTrailer = val }
    isMidMeasureClef(): boolean { return !!this.explicitParent() && !this.segment().rtick().isZero() }

    clear(): void {
        const ldata = this.mutldata()
        ldata.clearBbox()
        ldata.symId = SymId.noSym
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.CLEF_TYPE_CONCERT: return this.m_clefTypes.concertClef
        case Pid.CLEF_TYPE_TRANSPOSING: return this.m_clefTypes.transposingClef
        case Pid.SHOW_COURTESY: return this.showCourtesy()
        case Pid.SMALL: return this.isSmall()
        case Pid.CLEF_TO_BARLINE_POS: return this.m_clefToBarlinePosition
        case Pid.IS_HEADER: return this.m_isHeader
        case Pid.IS_COURTESY: return this.m_isCourtesy
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.CLEF_TYPE_CONCERT:
            this.setConcertClef(v as ClefType)
            break
        case Pid.CLEF_TYPE_TRANSPOSING:
            this.setTransposingClef(v as ClefType)
            break
        case Pid.SHOW_COURTESY:
            this.m_showCourtesy = !!v
            break
        case Pid.SMALL:
            this.setSmall(!!v)
            break
        case Pid.CLEF_TO_BARLINE_POS: {
            const newClefToBlPos = v as ClefToBarlinePosition
            if (newClefToBlPos !== this.m_clefToBarlinePosition && !this.m_isHeader) {
                this.changeClefToBarlinePos(newClefToBlPos)
            }
            break
        }
        case Pid.IS_HEADER:
            this.m_isHeader = !!v
            break
        case Pid.IS_COURTESY:
            this.m_isCourtesy = !!v
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.CLEF_TYPE_CONCERT: return ClefType.INVALID
        case Pid.CLEF_TYPE_TRANSPOSING: return ClefType.INVALID
        case Pid.SHOW_COURTESY: return true
        case Pid.SMALL: return false
        case Pid.CLEF_TO_BARLINE_POS: return ClefToBarlinePosition.AUTO
        case Pid.IS_HEADER: return false
        case Pid.IS_COURTESY: return false
        default: return super.propertyDefault(id)
        }
    }

    override accessibleInfo(): string {
        const type = this.clefType()
        if (type === ClefType.INVALID) {
            return ''
        }
        return mtrc('engraving', TConv.translatedUserNameClefType(this.clefType()))
    }
}
