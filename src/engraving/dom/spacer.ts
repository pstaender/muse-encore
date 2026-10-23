/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/spacer.h/.cpp
 */

import { PainterPath } from '../../framework/draw/types/painterpath'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType } from '../types/types'
import { EngravingItem, LayoutData } from './engravingitem'
import { Pid } from './property'
import { SpacerType, type Measure } from './measure'

// SpacerType lives in measure.ts to avoid an import cycle
export { SpacerType } from './measure'

export class SpacerLayoutData extends LayoutData {
    path = new PainterPath()
}

export class Spacer extends EngravingItem {
    private m_spacerType = SpacerType.UP
    private m_gap = new Spatium(0)

    constructor(parent: Measure | null) {
        super(ElementType.SPACER, parent)
        this.setZ(-10) // Ensure behind notation
    }

    protected override createLayoutData(): SpacerLayoutData { return new SpacerLayoutData(this) }
    override ldata(): SpacerLayoutData { return super.ldata() as SpacerLayoutData }
    override mutldata(): SpacerLayoutData { return super.ldata() as SpacerLayoutData }

    measure(): Measure { return this.explicitParent() as unknown as Measure }
    spacerType(): SpacerType { return this.m_spacerType }
    setSpacerType(t: SpacerType): void { this.m_spacerType = t }
    override subtype(): number { return this.m_spacerType }

    setGap(sp: Spatium): void { this.m_gap = sp }
    gap(): Spatium { return this.m_gap }
    absoluteGap(): number { return this.absoluteFromSpatium(this.m_gap) }

    override getProperty(propertyId: Pid): PropertyValue {
        if (propertyId === Pid.SPACE) {
            return this.gap()
        }
        return super.getProperty(propertyId)
    }

    override setProperty(propertyId: Pid, v: PropertyValue): boolean {
        if (propertyId === Pid.SPACE) {
            this.setGap(v as Spatium)
        } else if (!super.setProperty(propertyId, v)) {
            return false
        }
        this.setGenerated(false)
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.SPACE) {
            return new Spatium(0)
        }
        return super.propertyDefault(id)
    }
}
