/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/laissezvib.h/.cpp
 */

import { PointF } from '../../framework/draw/types/geometry'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import type { EngravingItem } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import type { Note } from './note'
import { Pid } from './property'
import type { SlurTieSegment } from './slurtie'
import type { System } from './system'
import { Tie, TieSegment, TieSegmentLayoutData } from './tie'

const laissezVibStyle: ElementStyle = [
    { sid: Sid.minLaissezVibLength, pid: Pid.MIN_LENGTH },
]

export class LaissezVibSegmentLayoutData extends TieSegmentLayoutData {
    symbol = SymId.noSym
    posRelativeToNote = new PointF()
}

export class LaissezVibSegment extends TieSegment {
    constructor(parent: System | null) {
        super(parent, ElementType.LAISSEZ_VIB_SEGMENT)
    }

    protected override createLayoutData(): LaissezVibSegmentLayoutData { return new LaissezVibSegmentLayoutData(this) }
    override ldata(): LaissezVibSegmentLayoutData { return super.ldata() as LaissezVibSegmentLayoutData }
    override mutldata(): LaissezVibSegmentLayoutData { return super.ldata() as LaissezVibSegmentLayoutData }

    laissezVib(): LaissezVib { return this.spanner() as LaissezVib }
}

export class LaissezVib extends Tie {
    private m_minLength = new Spatium(2.0)

    constructor(parent: Note | null) {
        super(parent, ElementType.LAISSEZ_VIB)
        this.initElementStyle(laissezVibStyle)
    }

    override getProperty(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MIN_LENGTH: return this.minLength()
        default: return super.getProperty(propertyId)
        }
    }

    override propertyDefault(propertyId: Pid): PropertyValue {
        switch (propertyId) {
        case Pid.MIN_LENGTH: return new Spatium(2.0)
        default: return super.propertyDefault(propertyId)
        }
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        switch (propertyId) {
        case Pid.MIN_LENGTH:
            this.setMinLength(v as Spatium)
            break
        default:
            return super.setProperty(propertyId, v)
        }
        return true
    }

    minLength(): Spatium { return this.m_minLength }
    setMinLength(val: Spatium): void { this.m_minLength = val }

    symId(): SymId {
        return this.up() ? SymId.articLaissezVibrerAbove : SymId.articLaissezVibrerBelow
    }

    override newSlurTieSegment(parent: System | null): SlurTieSegment {
        const seg = new LaissezVibSegment(parent)
        seg.setTrack(this.track())
        return seg
    }

    /** Laissez vibrer ties do not have an end note */
    override setEndNote(_note: Note | null): void {}
    override setEndElement(_e: EngravingItem | null): void {}

    frontLaissezVibSegment(): LaissezVibSegment { return this.frontSegment() as LaissezVibSegment }
}
