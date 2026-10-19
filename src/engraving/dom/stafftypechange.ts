/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/stafftypechange.h/.cpp
 */

import { Color } from '../../framework/draw/types/color'
import { Spatium } from '../types/dimension'
import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, NoteHeadScheme } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { MeasureBase } from './measurebase'
import { Pid } from './property'
import type { StaffType } from './stafftype'

export class StaffTypeChange extends EngravingItem {
    private m_staffType: StaffType | null = null
    private m_ownsStaffType = false
    private m_lw = 0.0

    constructor(parent: MeasureBase | null) {
        super(ElementType.STAFFTYPE_CHANGE, parent)
        this.m_lw = this.spatium() * 0.3
    }

    protected override onCloned(original: this): void {
        super.onCloned(original)
        if (original.m_ownsStaffType && original.m_staffType) {
            this.m_staffType = original.m_staffType.clone()
        }
    }

    override staffType(): StaffType | null { return this.m_staffType }
    setStaffType(st: StaffType | null, owned: boolean): void {
        this.m_staffType = st
        this.m_ownsStaffType = owned && st !== null
    }

    lw(): number { return this.m_lw }
    measure(): MeasureBase | null { return this.explicitParent() as unknown as MeasureBase | null }

    override getProperty(propertyId: Pid): PropertyValue {
        const st = this.m_staffType!
        switch (propertyId) {
        case Pid.STEP_OFFSET: return st.stepOffset()
        case Pid.STAFF_LINES: return st.lines()
        case Pid.LINE_DISTANCE: return st.lineDistance()
        case Pid.STAFF_SHOW_BARLINES: return st.showBarlines()
        case Pid.STAFF_SHOW_LEDGERLINES: return st.showLedgerLines()
        case Pid.STAFF_STEMLESS: return st.stemless()
        case Pid.HEAD_SCHEME: return st.noteHeadScheme()
        case Pid.STAFF_GEN_CLEF: return st.genClef()
        case Pid.STAFF_GEN_TIMESIG: return st.genTimesig()
        case Pid.STAFF_GEN_KEYSIG: return st.genKeysig()
        case Pid.MAG: return st.userMag()
        case Pid.SMALL: return st.isSmall()
        case Pid.STAFF_INVISIBLE: return st.invisible()
        case Pid.STAFF_COLOR: return st.color()
        case Pid.STAFF_YOFFSET: return st.yoffset()
        default: return super.getProperty(propertyId)
        }
    }

    // TODO(port): setProperty (editing only)

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.STEP_OFFSET: return 0
        case Pid.STAFF_LINES: return 5
        case Pid.LINE_DISTANCE: return new Spatium(1.0)
        case Pid.STAFF_SHOW_BARLINES: return true
        case Pid.STAFF_SHOW_LEDGERLINES: return true
        case Pid.STAFF_STEMLESS: return false
        case Pid.HEAD_SCHEME: return NoteHeadScheme.HEAD_NORMAL
        case Pid.STAFF_GEN_CLEF: return true
        case Pid.STAFF_GEN_TIMESIG: return true
        case Pid.STAFF_GEN_KEYSIG: return true
        case Pid.MAG: return 1.0
        case Pid.SMALL: return false
        case Pid.STAFF_INVISIBLE: return false
        case Pid.STAFF_COLOR: return Color.BLACK // C++: configuration()->defaultColor()
        case Pid.STAFF_YOFFSET: return new Spatium(0.0)
        default: return super.propertyDefault(id)
        }
    }
}
