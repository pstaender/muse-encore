/*
 * SPDX-License-Identifier: GPL-3.0-only
 * MuseScore-Web — port of MuseScore Studio (https://github.com/musescore/MuseScore)
 * Copyright (C) 2021-2026 MuseScore Limited and others
 *
 * Port of src/engraving/dom/bracket.h/.cpp (editing is not ported)
 */

import type { Color } from '../../framework/draw/types/color'
import { PainterPath } from '../../framework/draw/types/painterpath'
import type { Fraction } from '../types/fraction'
import type { PropertyValue } from '../types/propertyvalue'
import { SymId } from '../types/symid'
import { BracketType, ElementType } from '../types/types'
import { Sid } from '../style/styledef'
import { Shape } from '../infrastructure/shape'
import { EngravingItem, LayoutData } from './engravingitem'
import type { EngravingObject } from './engravingobject'
import { Pid } from './property'
import type { BracketItem } from './bracketitem'
import type { Measure } from './measure'
import type { System } from './system'

export class BracketLayoutData extends LayoutData {
    braceSymbol: SymId = SymId.noSym
    path = new PainterPath()
    bracketShape = new Shape() // `shape` in C++ (name clash with LayoutData::shape())
    bracketHeight = 0.0
    bracketWidth = 0.0

    h2(): number { return this.bracketHeight * 0.5 }
}

export class Bracket extends EngravingItem {
    private m_bi: BracketItem | null = null
    private m_firstStaff = 0
    private m_lastStaff = 0
    private m_braceSymbol: SymId = SymId.noSym
    private m_magx = 1.0
    private m_measure: Measure | null = null

    constructor(parent: EngravingObject | null) {
        super(ElementType.BRACKET, parent)
        this.setGenerated(true) // brackets are not saved
    }

    protected override createLayoutData(): BracketLayoutData { return new BracketLayoutData(this) }
    override ldata(): BracketLayoutData { return super.ldata() as BracketLayoutData }
    override mutldata(): BracketLayoutData { return super.ldata() as BracketLayoutData }

    setBracketItem(i: BracketItem): void { this.m_bi = i }
    bracketItem(): BracketItem { return this.m_bi! }
    bracketType(): BracketType { return this.m_bi!.bracketType() }
    override subtype(): number { return this.bracketType() }

    firstStaff(): number { return this.m_firstStaff }
    lastStaff(): number { return this.m_lastStaff }

    setStaffSpan(a: number, b: number): void {
        this.m_firstStaff = a
        this.m_lastStaff = b

        const font = this.style().styleSt(Sid.musicalSymbolFont)
        if (this.bracketType() === BracketType.BRACE && font !== 'Emmentaler' && font !== 'Gonville') {
            let v = this.m_lastStaff - this.m_firstStaff + 1
            // if staves inside are hidden, reduce v
            for (let staffIndex = this.m_firstStaff; staffIndex <= this.m_lastStaff; ++staffIndex) {
                if (this.explicitParent() && !this.system().staff(staffIndex)!.show()) {
                    --v
                }
            }
            if (font === 'Leland') {
                v = Math.min(4, v)
            }
            this.m_magx = v + ((v - 1) * 1.625)
            if (v === 1) {
                this.m_braceSymbol = SymId.braceSmall
            } else if (v <= 2) {
                this.m_braceSymbol = SymId.brace
            } else if (v <= 3) {
                this.m_braceSymbol = SymId.braceLarge
            } else {
                this.m_braceSymbol = SymId.braceLarger
            }
        }
    }

    braceSymbol(): SymId { return this.m_braceSymbol }
    setBraceSymbol(sym: SymId): void { this.m_braceSymbol = sym }
    column(): number { return this.m_bi!.column() }
    span(): number { return this.m_bi!.bracketSpan() }
    magx(): number { return this.m_magx }
    system(): System { return this.explicitParent() as unknown as System }
    measure(): Measure | null { return this.m_measure }
    setMeasure(measure: Measure | null): void { this.m_measure = measure }
    bi(): BracketItem { return this.m_bi! }

    override color(): Color { return this.m_bi!.color() }

    override getProperty(id: Pid): PropertyValue {
        let v = super.getProperty(id)
        if (v === undefined) {
            v = this.m_bi!.getProperty(id)
        }
        return v
    }

    override setProperty(id: Pid, v: PropertyValue): boolean {
        return this.m_bi!.setProperty(id, v)
    }

    override propertyDefault(id: Pid): PropertyValue {
        if (id === Pid.BRACKET_COLUMN) {
            return 0
        }
        let v = super.propertyDefault(id)
        if (v === undefined) {
            v = this.m_bi!.propertyDefault(id)
        }
        return v
    }

    override tick(): Fraction {
        if (this.m_measure) {
            return this.m_measure.tick()
        }
        return super.tick()
    }
}
