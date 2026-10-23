/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseEncore — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/instrumentname.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { ElementType, TextStyleType } from '../types/types'
import { ElementFlag } from './engravingitem'
import type { ElementStyle } from './engravingobject'
import { Pid } from './property'
import { TextBase } from './textbase'
import type { SysStaff, System } from './system'

export enum InstrumentNameType {
    LONG, SHORT,
}

const longInstrumentStyle: ElementStyle = []
const shortInstrumentStyle: ElementStyle = []

export class InstrumentName extends TextBase {
    private m_instrumentNameType = InstrumentNameType.LONG
    private m_layoutPos = 0
    private m_sysStaff: SysStaff | null = null

    constructor(s: System | null) {
        super(ElementType.INSTRUMENT_NAME, s, TextStyleType.INSTRUMENT_LONG, ElementFlag.NOTHING)
        this.setFlag(ElementFlag.MOVABLE, false)
        this.setInstrumentNameType(InstrumentNameType.LONG)
    }

    layoutPos(): number { return this.m_layoutPos }
    setLayoutPos(val: number): void { this.m_layoutPos = val }

    instrumentNameTypeName(): string {
        return this.instrumentNameType() === InstrumentNameType.SHORT ? 'short' : 'long'
    }

    instrumentNameType(): InstrumentNameType { return this.m_instrumentNameType }

    setInstrumentNameType(st: InstrumentNameType | string): void {
        if (typeof st === 'string') {
            if (st === 'short') {
                this.setInstrumentNameType(InstrumentNameType.SHORT)
            } else if (st === 'long') {
                this.setInstrumentNameType(InstrumentNameType.LONG)
            }
            return
        }
        this.m_instrumentNameType = st
        if (st === InstrumentNameType.SHORT) {
            this.setTextStyleType(TextStyleType.INSTRUMENT_SHORT)
            this.initElementStyle(shortInstrumentStyle)
        } else {
            this.setTextStyleType(TextStyleType.INSTRUMENT_LONG)
            this.initElementStyle(longInstrumentStyle)
        }
    }

    system(): System { return this.explicitParent() as unknown as System }
    sysStaff(): SysStaff | null { return this.m_sysStaff }
    setSysStaff(s: SysStaff | null): void { this.m_sysStaff = s }

    largestStaffSpatium(): number {
        if (this.systemFlag() || (this.explicitParent() && this.parentItem()!.systemFlag())) {
            return this.style().spatium()
        }
        const p = this.part()
        if (!p) {
            return this.style().spatium()
        }
        let largestSpatium = 0
        for (const s of p.staves()) {
            const sp = s.spatiumAt(this.tick())
            if (sp > largestSpatium) {
                largestSpatium = sp
            }
        }
        return largestSpatium
    }

    override getProperty(id: Pid): PropertyValue {
        if (id === Pid.INAME_LAYOUT_POSITION) {
            return this.m_layoutPos
        }
        return super.getProperty(id)
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.INAME_LAYOUT_POSITION:
            this.m_layoutPos = v as number
            return true
        case Pid.VISIBLE:
            return true
        default:
            return super.setProperty(id, v)
        }
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.INAME_LAYOUT_POSITION) {
            return 0
        }
        return super.propertyDefault(id)
    }

    override positionRelativeToNoteheadRest(): boolean { return false }
}
