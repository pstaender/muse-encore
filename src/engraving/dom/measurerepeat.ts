/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/measurerepeat.h/.cpp
 */

import { LineF, PointF, RectF } from '../../framework/draw/types/geometry'
import { Fraction } from '../types/fraction'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId, type SymIdList } from '../types/symid'
import { DurationType, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { ElementStyle, EngravingObject } from './engravingobject'
import type { Measure } from './measure'
import { Pid } from './property'
import { Rest, RestLayoutData } from './rest'
import { timeSigSymIdsFromString } from './utils'

const measureRepeatStyle: ElementStyle = [
    { sid: Sid.measureRepeatNumberPos, pid: Pid.MEASURE_REPEAT_NUMBER_POS },
]

export class MeasureRepeatLayoutData extends RestLayoutData {
    symId = SymId.noSym
    numberSym: SymIdList = []
    extenderLineLeft = new LineF()
    extenderLineRight = new LineF()

    setSymId(id: SymId): void { this.symId = id }
    setNumberSym(n: number | string): void { this.numberSym = timeSigSymIdsFromString(String(n)) }
    clearNumberSym(): void { this.numberSym = [] }
}

export class MeasureRepeat extends Rest {
    static readonly MAX_NUM_MEASURES = 4

    private m_numMeasures = 0
    private m_numberPos = new Spatium(0.0)

    constructor(parent: EngravingObject | null) {
        super(parent, undefined, ElementType.MEASURE_REPEAT)
        // however many measures the group, the element itself is always exactly the duration of its containing measure
        this.setDurationType(DurationType.V_MEASURE)
        if (parent) {
            this.initElementStyle(measureRepeatStyle)
        }
    }

    protected override createLayoutData(): MeasureRepeatLayoutData { return new MeasureRepeatLayoutData(this) }
    override ldata(): MeasureRepeatLayoutData { return super.ldata() as MeasureRepeatLayoutData }
    override mutldata(): MeasureRepeatLayoutData { return super.ldata() as MeasureRepeatLayoutData }

    setNumMeasures(n: number): void {
        this.m_numMeasures = Math.min(n, MeasureRepeat.MAX_NUM_MEASURES)
    }

    numMeasures(): number { return this.m_numMeasures }
    setNumberPos(d: Spatium): void { this.m_numberPos = d }
    numberPos(): Spatium { return this.m_numberPos }
    override subtype(): number { return this.m_numMeasures }

    firstMeasureOfGroup(): Measure | null {
        return this.measure().firstOfMeasureRepeatGroup(this.staffIdx())
    }

    referringMeasure(measure: Measure): Measure | null {
        const firstMeasure = this.firstMeasureOfGroup()
        if (!firstMeasure) {
            return null
        }

        let referringMeasure = firstMeasure.prevMeasure()
        const measuresBack = this.m_numMeasures - measure.measureRepeatCount(this.staffIdx())
        for (let i = 0; i < measuresBack && referringMeasure; ++i) {
            referringMeasure = referringMeasure.prevMeasure()
        }
        return referringMeasure
    }

    override ticks(): Fraction {
        const m = this.measure()
        if (m) {
            return m.stretchedLen(this.staff()!)
        }
        return new Fraction(0, 1)
    }

    numberPosition(numberBbox: RectF): PointF {
        const symId = this.ldata().symId
        const x = (this.symBbox(symId).width() - numberBbox.width()) * 0.5
        // -pos().y(): relative to topmost staff line
        // - 0.5 * r.height(): relative to the baseline of the number symbol
        // (rather than the center)
        let staffTop = -this.pos().y()
        // Single line staff barlines extend above top of staff
        const st = this.staffType()
        if (st && st.lines() === 1) {
            staffTop -= 2.0 * this.spatium()
        }
        const y = Math.min(staffTop, -this.symBbox(symId).height() / 2) + this.m_numberPos.val() * this.spatium() - 0.5 * numberBbox.height()
        return new PointF(x, y)
    }

    override numberRect(): RectF {
        const r = this.symBboxList(this.ldata().numberSym)
        return r.translated(this.numberPosition(r))
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MEASURE_REPEAT_NUMBER_POS: return this.style().styleV(Sid.measureRepeatNumberPos)
        default: return super.propertyDefault(propertyId)
        }
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.SUBTYPE: return this.numMeasures()
        case Pid.MEASURE_REPEAT_NUMBER_POS: return this.numberPos()
        default: return super.getProperty(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.SUBTYPE:
            this.setNumMeasures(v as number)
            break
        case Pid.MEASURE_REPEAT_NUMBER_POS:
            this.setNumberPos(v as Spatium)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    override getPropertyStyle(propertyId: Pid): Sid {
        if (propertyId === Pid.MEASURE_REPEAT_NUMBER_POS) {
            return Sid.measureRepeatNumberPos
        }
        return super.getPropertyStyle(propertyId)
    }
}
