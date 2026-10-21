/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/bracketItem.h/.cpp
 */

import type { PropertyValue } from '../types/propertyvalue'
import { BracketType, ElementType } from '../types/types'
import { EngravingItem } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import { setCreateBracketItemHook, type Staff } from './staff'

export class BracketItem extends EngravingItem {
    private m_bracketType = BracketType.NO_BRACKET
    private m_column = 0
    private m_bracketSpan = 0
    private m_staff: Staff | null = null

    constructor(parent: EngravingObject | null, a: BracketType = BracketType.NO_BRACKET, b = 0) {
        super(ElementType.BRACKET_ITEM, parent)
        this.m_bracketType = a
        this.m_bracketSpan = b
    }

    bracketSpan(): number { return this.m_bracketSpan }
    bracketType(): BracketType { return this.m_bracketType }
    setBracketSpan(v: number): void { this.m_bracketSpan = v }
    setBracketType(v: BracketType): void { this.m_bracketType = v }
    override staff(): Staff | null { return this.m_staff }
    setStaff(s: Staff | null): void { this.m_staff = s }
    column(): number { return this.m_column }
    setColumn(v: number): void { this.m_column = v }

    override getProperty(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SYSTEM_BRACKET: return this.m_bracketType
        case Pid.BRACKET_COLUMN: return this.m_column
        case Pid.BRACKET_SPAN: return this.m_bracketSpan
        default: return super.getProperty(id)
        }
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        switch (id) {
        case Pid.SYSTEM_BRACKET:
            this.staff()!.setBracketType(this.column(), v as BracketType) // change bracket type global
            break
        case Pid.BRACKET_COLUMN:
            if (this.staff()) {
                this.staff()!.changeBracketColumn(this.column(), v as number)
            } else {
                this.m_column = v as number
            }
            break
        case Pid.BRACKET_SPAN:
            this.m_bracketSpan = v as number
            break
        case Pid.VISIBLE:
            this.setVisible(!!v)
            break
        default:
            return super.setProperty(id, v)
        }
        return true
    }

    override propertyDefault(id: Pid): PropertyValue {
        switch (id) {
        case Pid.SYSTEM_BRACKET: return BracketType.NORMAL
        case Pid.BRACKET_COLUMN: return 0
        default: return super.propertyDefault(id)
        }
    }
}

setCreateBracketItemHook((staff: Staff) => {
    const bi = new BracketItem(staff.score())
    bi.setStaff(staff)
    return bi
})
